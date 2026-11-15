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
  // Cada link leva: chave AES-256 própria + resultado cifrado (AES-GCM) + assinatura ECDSA
  // do organizador + chave pública. Tudo vai depois do "#", que o navegador nunca envia ao servidor.
  // A chave privada só existe na memória durante o sorteio e é descartada: ninguém, nem o
  // organizador, consegue fabricar um link novo que passe na verificação depois.

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
  const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
  const ASSINA = { name: 'ECDSA', hash: 'SHA-256' };

  // 64 emojis → 6 bits cada; 5 emojis = 30 bits, inviável de falsificar por tentativa.
  const EMOJIS = Array.from('🎄🎁⭐🔔🦌⛄🍪🕯️🧦🎅🤶🌟❄️🍷🥂🎉🎈🍫🍰🧁🍓🍒🍊🍋🍉🍇🥥🌈🌻🌹🌵🍀🐶🐱🦊🐻🐼🐨🦁🐯🐸🐧🦉🦋🐢🐬🐳🦄🚀✈️⛵🚲🎸🎺🥁🎨📚⚽🏀🎯🎲💎👑🔑🧩');
  const listaEmojis = (() => {
    // Array.from separa alguns emojis com seletor de variação (️) em dois; reagrupa.
    const out = [];
    EMOJIS.forEach(c => { if (c === '️' && out.length) out[out.length - 1] += c; else out.push(c); });
    return out.slice(0, 64);
  })();

  async function seloDe(pubRaw) {
    const h = new Uint8Array(await subtle.digest('SHA-256', pubRaw));
    let bits = 0, acc = 0, out = [];
    for (const b of h) {
      acc = (acc << 8) | b; bits += 8;
      while (bits >= 6 && out.length < 5) { bits -= 6; out.push(listaEmojis[(acc >> bits) & 63]); }
      if (out.length === 5) break;
    }
    return out.join(' ');
  }

  async function novoSorteioCripto() {
    const par = await subtle.generateKey(ECDSA, false, ['sign', 'verify']);
    const pub = new Uint8Array(await subtle.exportKey('raw', par.publicKey));
    return { privada: par.privateKey, pub, selo: await seloDe(pub) };
  }

  async function selar(dados, ctx) {
    const chave = cripto.getRandomValues(new Uint8Array(32));
    const iv = cripto.getRandomValues(new Uint8Array(12));
    const aes = await subtle.importKey('raw', chave, 'AES-GCM', false, ['encrypt']);
    const cifrado = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, aes, enc.encode(JSON.stringify(dados))));
    const corpo = juntar(iv, cifrado);
    const assinatura = new Uint8Array(await subtle.sign(ASSINA, ctx.privada, juntar(chave, corpo)));
    return ['v2', b64u(chave), b64u(corpo), b64u(assinatura), b64u(ctx.pub)].join('.');
  }

  // Devolve { dados, selo } ou lança erro se o link foi adulterado/forjado.
  async function abrir(token) {
    const [versao, k, c, s, p] = String(token).split('.');
    if (versao !== 'v2' || !p) throw new Error('formato');
    const chave = unb64u(k), corpo = unb64u(c), pub = unb64u(p);
    const pubKey = await subtle.importKey('raw', pub, ECDSA, false, ['verify']);
    const ok = await subtle.verify(ASSINA, pubKey, unb64u(s), juntar(chave, corpo));
    if (!ok) throw new Error('assinatura');
    const aes = await subtle.importKey('raw', chave, 'AES-GCM', false, ['decrypt']);
    const claro = await subtle.decrypt({ name: 'AES-GCM', iv: corpo.slice(0, 12) }, aes, corpo.slice(12));
    return { dados: JSON.parse(dec.decode(claro)), selo: await seloDe(pub) };
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
    return t;
  }

  const api = {
    normalizarTelefone, parse, embaralhar, sortear,
    novoSorteioCripto, selar, abrir, cifrarComSenha, decifrarComSenha, mensagem, _emojis: listaEmojis,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AmigoSecreto = api;
})(typeof window !== 'undefined' ? window : globalThis);
