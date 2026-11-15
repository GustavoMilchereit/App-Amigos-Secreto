// Lógica do sorteio e da criptografia, compartilhada entre index.html, revelar.html e os testes (Node 20+).
(function (root) {
  const cripto = root.crypto;
  const subtle = cripto.subtle;

  // ---------- Participantes ----------

  // Normaliza telefone brasileiro para o formato internacional só com dígitos (ex.: 5511987654321).
  function normalizarTelefone(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    d = d.replace(/^0+/, '');
    if (d.length === 10 || d.length === 11) d = '55' + d; // DDD + número, sem código do país
    return d;
  }

  // Aceita linhas "Nome; Telefone; Grupo", separadas por ; , ou TAB (colado do Excel).
  function parse(texto) {
    const pessoas = [];
    const erros = [];
    const vistos = new Set();
    String(texto || '').split(/\r?\n/).forEach((linha, i) => {
      if (!linha.trim()) return;
      const sep = linha.includes(';') ? ';' : linha.includes('\t') ? '\t' : ',';
      const [nome = '', tel = '', grupo = ''] = linha.split(sep).map(s => s.trim());
      const n = i + 1;
      if (!nome) return erros.push(`Linha ${n}: nome vazio.`);
      const chave = nome.toLowerCase();
      if (vistos.has(chave)) return erros.push(`Linha ${n}: "${nome}" está repetido. Use nomes distintos (ex.: "João Pai" e "João Filho").`);
      vistos.add(chave);
      const telefone = normalizarTelefone(tel);
      if (!telefone) erros.push(`Linha ${n}: ${nome} está sem telefone.`);
      else if (telefone.length < 12 || telefone.length > 13) erros.push(`Linha ${n}: telefone de ${nome} parece inválido (${tel}).`);
      pessoas.push({ nome, telefone, grupo: grupo.toLowerCase() });
    });
    if (!erros.length && pessoas.length < 3) erros.push('São necessárias pelo menos 3 pessoas.');
    return { pessoas, erros };
  }

  // ---------- Sorteio ----------

  // Inteiro aleatório uniforme em [0, n) usando o gerador criptográfico, sem viés de módulo.
  function aleatorio(n) {
    const limite = Math.floor(0x100000000 / n) * n;
    const b = new Uint32Array(1);
    do { cripto.getRandomValues(b); } while (b[0] >= limite);
    return b[0] % n;
  }

  // Fisher-Yates: toda ordem possível tem a mesma chance, independente da ordem de entrada.
  function embaralhar(arr, rnd = aleatorio) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = rnd(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Sorteia uma roda única (A→B→C→...→A): ninguém tira a si mesmo, todos dão e recebem
  // exatamente um presente, ninguém tira alguém do mesmo grupo, e a revelação na festa
  // segue em sequência sem "fechar" antes do fim. Embaralha e descarta rodas que violam
  // as regras (amostragem por rejeição), o que mantém todas as rodas válidas igualmente prováveis.
  function sortear(pessoas, rnd = aleatorio) {
    const mesmoGrupo = (a, b) => a.grupo && a.grupo === b.grupo;
    const tamanhos = {};
    pessoas.forEach(p => { if (p.grupo) tamanhos[p.grupo] = (tamanhos[p.grupo] || 0) + 1; });
    if (Math.max(0, ...Object.values(tamanhos)) > pessoas.length / 2) {
      throw new Error('Um grupo tem mais da metade dos participantes; impossível sortear sem que alguém tire alguém do próprio grupo.');
    }
    for (let t = 0; t < 20000; t++) {
      const roda = embaralhar(pessoas, rnd);
      let ok = true;
      for (let i = 0; i < roda.length; i++) {
        if (mesmoGrupo(roda[i], roda[(i + 1) % roda.length])) { ok = false; break; }
      }
      if (ok) {
        // Devolve na ordem original de entrada, para a lista não revelar a sequência da roda.
        const destino = new Map(roda.map((p, i) => [p, roda[(i + 1) % roda.length]]));
        return pessoas.map(p => ({ de: p, para: destino.get(p) }));
      }
    }
    throw new Error('Não encontrei um sorteio válido com essas restrições. Revise os grupos.');
  }

  // ---------- Criptografia ----------
  // Cada link leva uma chave AES-128 própria + o resultado cifrado com AES-GCM, tudo depois do "#"
  // (o navegador nunca envia essa parte ao servidor). Abrir o próprio link não revela nada dos
  // outros, e qualquer alteração no link é detectada pela etiqueta de autenticação do GCM.
  // Como cada chave é usada uma única vez, o vetor de inicialização pode ser fixo sem perda de segurança.

  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64u = (bytes) => {
    let s = ''; bytes.forEach(b => s += String.fromCharCode(b));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const unb64u = (str) => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const juntar = (...partes) => {
    const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
    let o = 0; partes.forEach(p => { out.set(p, o); o += p.length; });
    return out;
  };
  const IV = new Uint8Array(12);
  const limpar = (t) => String(t || '').replace(/\n/g, ' ').trim();

  // dados = { n: nome de quem tirou, a: nome sorteado, e: nome do amigo secreto }
  async function selar(dados) {
    const chave = cripto.getRandomValues(new Uint8Array(16));
    const aes = await subtle.importKey('raw', chave, 'AES-GCM', false, ['encrypt']);
    const texto = enc.encode([limpar(dados.n).split(' ')[0], limpar(dados.a), limpar(dados.e)].join('\n'));
    const cifrado = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: IV }, aes, texto));
    return b64u(juntar(chave, cifrado));
  }

  // Devolve { n, a, e } ou lança erro se o link estiver cortado ou adulterado.
  async function abrir(token) {
    const raw = unb64u(String(token).trim());
    if (raw.length < 16 + 16 + 3) throw new Error('curto');
    const aes = await subtle.importKey('raw', raw.slice(0, 16), 'AES-GCM', false, ['decrypt']);
    const [n, a, e = ''] = dec.decode(await subtle.decrypt({ name: 'AES-GCM', iv: IV }, aes, raw.slice(16))).split('\n');
    if (!n || !a) throw new Error('formato');
    return { n, a, e };
  }

  // Backup protegido por senha (PBKDF2 600 mil iterações + AES-GCM).
  async function chaveDeSenha(senha, sal) {
    const base = await subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', salt: sal, iterations: 600000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function cifrarComSenha(obj, senha) {
    const sal = cripto.getRandomValues(new Uint8Array(16)), iv = cripto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, await chaveDeSenha(senha, sal), enc.encode(JSON.stringify(obj))));
    return 'amigo-secreto-backup.' + b64u(juntar(sal, iv, ct));
  }
  async function decifrarComSenha(texto, senha) {
    const raw = unb64u(String(texto).trim().replace(/^amigo-secreto-backup\./, ''));
    const chave = await chaveDeSenha(senha, raw.slice(0, 16));
    const claro = await subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(16, 28) }, chave, raw.slice(28));
    return JSON.parse(dec.decode(claro));
  }

  function mensagem(nome, ev, link) {
    const primeiro = nome.split(' ')[0];
    let t = `Oi, ${primeiro}! 🎁 O sorteio do *${ev.e || 'Amigo Secreto'}* foi feito.\n\n`;
    t += `Abra seu link pessoal para descobrir quem você tirou. Ele é só seu, não compartilhe!\n${link}`;
    if (ev.d) t += `\n\n📅 ${ev.d}`;
    if (ev.v) t += `\n💰 Valor sugerido: ${ev.v}`;
    t += `\n\n⚠️ Só vale o link enviado por este número. Se alguém te mandar outro, é pegadinha. 😉`;
    return t;
  }

  const api = {
    normalizarTelefone, parse, embaralhar, sortear,
    selar, abrir, cifrarComSenha, decifrarComSenha, mensagem,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AmigoSecreto = api;
})(typeof window !== 'undefined' ? window : globalThis);
