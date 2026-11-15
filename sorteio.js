// Lógica do sorteio e da criptografia, compartilhada entre index.html, revelar.html e os testes (Node 20+).
(function (root) {
  const cripto = root.crypto;
  const subtle = cripto.subtle;

  // ---------- Participantes ----------

  const DDDS = new Set([11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79,
    81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99]);

  // Aceita qualquer formatação (traços, espaços, parênteses, +55, 0 na frente).
  // Devolve { numero: '5511987654321', exibir: '(11) 98765-4321', aviso? } ou { erro }.
  function analisarTelefone(raw) {
    const s = String(raw || '').trim();
    if (!s) return { erro: 'Falta o telefone.' };
    if (/[a-z]/i.test(s)) return { erro: 'O telefone tem letras.' };
    let d = s.replace(/\D/g, '');
    if (/^(\+|00)/.test(s)) {
      d = d.replace(/^00/, '');
      if (!d.startsWith('55')) {
        if (d.length < 8 || d.length > 15) return { erro: 'Número do exterior inválido.' };
        return { numero: d, exibir: '+' + d, aviso: 'Número do exterior: confira o código do país.' };
      }
    } else {
      d = d.replace(/^0+/, '');
      if (d.length === 8 || d.length === 9) return { erro: 'Falta o DDD. Ex.: 11 98765-4321' };
      if (d.length === 10 || d.length === 11) d = '55' + d;
      else if (!((d.length === 12 || d.length === 13) && d.startsWith('55'))) {
        return { erro: d.length < 8 ? 'Número incompleto.' : 'Dígitos demais. Tire o código da operadora, se tiver.' };
      }
    }
    const ddd = Number(d.slice(2, 4)), num = d.slice(4);
    if (!DDDS.has(ddd)) return { erro: `O DDD ${d.slice(2, 4)} não existe.` };
    if (num.length === 9) {
      if (num[0] !== '9') return { erro: 'Celular com 9 dígitos começa com 9.' };
      return { numero: d, exibir: `(${ddd}) ${num.slice(0, 5)}-${num.slice(5)}` };
    }
    const exibir = `(${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
    return { numero: d, exibir, aviso: /^[6-9]/.test(num) ? 'Falta o 9 na frente? Celular tem 9 dígitos depois do DDD.' : 'Parece telefone fixo. O WhatsApp só funciona em celular.' };
  }

  function normalizarTelefone(raw) { return analisarTelefone(raw).numero || ''; }

  // Maiúsculas, acentos e espaços extras não diferenciam grupos.
  function normalizarGrupo(g) {
    return String(g || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function distancia(a, b) {
    const m = a.length, n = b.length;
    let ant = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      ant = cur;
    }
    return ant[n];
  }

  // Dois grupos "quase iguais" provavelmente são erro de digitação ("Beatriz" x "Beatris").
  // Não acusa grupos que só diferem no número ("Casal 1" x "Casal 2") nem nomes muito curtos.
  function quaseIguais(a, b) {
    if (a.replace(/\d+/g, '#') === b.replace(/\d+/g, '#')) return false;
    const maior = Math.max(a.length, b.length);
    if (maior < 4) return false;
    return distancia(a, b) <= Math.min(3, Math.max(1, Math.floor(maior / 6)));
  }

  // Divide texto colado do Excel/Sheets ou CSV em linhas { nome, tel, grupo }.
  function linhasDeTexto(texto) {
    const linhas = String(texto || '').split(/\r?\n/).filter(l => l.trim());
    if (linhas.length && /^\s*nome/i.test(linhas[0])) linhas.shift(); // cabeçalho
    return linhas.map(l => {
      const sep = l.includes('\t') ? '\t' : l.includes(';') ? ';' : ',';
      const [nome = '', tel = '', grupo = ''] = l.split(sep).map(x => x.trim());
      return { nome, tel, grupo };
    });
  }

  // Valida as linhas da tabela. erros impedem o sorteio; avisos pedem conferência.
  // ignorar: lista de pares de grupos "a|b" que o organizador confirmou serem diferentes.
  function validar(linhas, ignorar = []) {
    const pessoas = [], erros = [], avisos = [], gruposPorChave = new Map();
    const nomes = new Map(), tels = new Map();
    linhas.forEach((l, i) => {
      const nome = String(l.nome || '').replace(/\s+/g, ' ').trim();
      const rotulo = String(l.grupo || '').replace(/\s+/g, ' ').trim();
      if (!nome && !String(l.tel || '').trim() && !rotulo) return; // linha vazia
      if (!nome) erros.push({ linha: i, campo: 'nome', msg: 'Falta o nome.' });
      else {
        const k = nome.toLowerCase();
        if (nomes.has(k)) erros.push({ linha: i, campo: 'nome', msg: `Nome repetido (linha ${nomes.get(k) + 1}). Diferencie, ex.: "João Pai" e "João Filho".` });
        else nomes.set(k, i);
      }
      const t = analisarTelefone(l.tel);
      if (t.erro) erros.push({ linha: i, campo: 'tel', msg: t.erro });
      else {
        if (t.aviso) avisos.push({ linha: i, campo: 'tel', msg: t.aviso });
        if (tels.has(t.numero)) avisos.push({ linha: i, campo: 'tel', msg: `Mesmo telefone de ${tels.get(t.numero)}: os dois links vão para o mesmo celular.` });
        else tels.set(t.numero, nome || `linha ${i + 1}`);
      }
      const chave = normalizarGrupo(rotulo);
      if (chave) {
        if (!gruposPorChave.has(chave)) gruposPorChave.set(chave, { chave, rotulo, membros: [] });
        gruposPorChave.get(chave).membros.push({ linha: i, nome: nome || `linha ${i + 1}` });
      }
      pessoas.push({ nome, telefone: t.numero || '', grupo: chave, linha: i });
    });

    const grupos = [...gruposPorChave.values()];
    const suspeitos = [];
    for (let x = 0; x < grupos.length; x++) for (let y = x + 1; y < grupos.length; y++) {
      const a = grupos[x], b = grupos[y];
      const par = [a.chave, b.chave].sort().join('|');
      if (!ignorar.includes(par) && quaseIguais(a.chave, b.chave)) suspeitos.push({ a, b, par });
    }
    const emSuspeita = new Set(suspeitos.flatMap(p => [p.a.chave, p.b.chave]));
    const sozinhos = grupos.filter(g => g.membros.length === 1 && !emSuspeita.has(g.chave));

    if (!erros.length && pessoas.length < 3) erros.push({ linha: -1, campo: '', msg: 'São necessárias pelo menos 3 pessoas.' });
    return { pessoas, erros, avisos, grupos, suspeitos, sozinhos };
  }

  // Compatibilidade: valida a partir de texto e devolve erros como mensagens.
  function parse(texto) {
    const r = validar(linhasDeTexto(texto));
    return { ...r, erros: r.erros.map(e => (e.linha >= 0 ? `Linha ${e.linha + 1}: ` : '') + e.msg) };
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

  // dados = { n: quem tirou, a: nome sorteado, e: nome do amigo secreto, d: data, l: local, v: valor }
  async function selar(dados) {
    const chave = cripto.getRandomValues(new Uint8Array(16));
    const aes = await subtle.importKey('raw', chave, 'AES-GCM', false, ['encrypt']);
    const campos = [limpar(dados.n).split(' ')[0], limpar(dados.a), limpar(dados.e), limpar(dados.d), limpar(dados.l), limpar(dados.v)];
    while (campos.length > 2 && !campos[campos.length - 1]) campos.pop(); // campos vazios no fim não ocupam espaço
    const texto = enc.encode(campos.join('\n'));
    const cifrado = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: IV }, aes, texto));
    return b64u(juntar(chave, cifrado));
  }

  // Devolve { n, a, e, d, l, v } ou lança erro se o link estiver cortado ou adulterado.
  async function abrir(token) {
    const raw = unb64u(String(token).trim());
    if (raw.length < 16 + 16 + 3) throw new Error('curto');
    const aes = await subtle.importKey('raw', raw.slice(0, 16), 'AES-GCM', false, ['decrypt']);
    const [n, a, e = '', d = '', l = '', v = ''] = dec.decode(await subtle.decrypt({ name: 'AES-GCM', iv: IV }, aes, raw.slice(16))).split('\n');
    if (!n || !a) throw new Error('formato');
    return { n, a, e, d, l, v };
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
    if (ev.d || ev.l || ev.v) t += '\n';
    if (ev.d) t += `\n📅 ${ev.d}`;
    if (ev.l) t += `\n📍 ${ev.l}`;
    if (ev.v) t += `\n💰 Valor sugerido: ${ev.v}`;
    t += `\n\n⚠️ Só vale o link enviado por este número. Se alguém te mandar outro, é pegadinha. 😉`;
    return t;
  }

  const api = {
    analisarTelefone, normalizarTelefone, normalizarGrupo, quaseIguais, linhasDeTexto, validar, parse, embaralhar, sortear,
    selar, abrir, cifrarComSenha, decifrarComSenha, mensagem,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AmigoSecreto = api;
})(typeof window !== 'undefined' ? window : globalThis);
