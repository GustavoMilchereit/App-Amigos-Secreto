// Lógica do sorteio, compartilhada entre index.html, revelar.html e os testes (Node).
(function (root) {
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

  function embaralhar(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function rndSeguro() {
    if (root.crypto && root.crypto.getRandomValues) {
      const b = new Uint32Array(1); root.crypto.getRandomValues(b); return b[0] / 4294967296;
    }
    return Math.random();
  }

  // Sorteia uma roda única (A→B→C→...→A): ninguém tira a si mesmo, todos dão e recebem
  // exatamente um presente, ninguém tira alguém do mesmo grupo, e a revelação na festa
  // segue em sequência sem "fechar" antes do fim.
  function sortear(pessoas, rnd = rndSeguro) {
    const mesmoGrupo = (a, b) => a.grupo && a.grupo === b.grupo;
    const maiorGrupo = Math.max(0, ...Object.values(
      pessoas.reduce((m, p) => (p.grupo && (m[p.grupo] = (m[p.grupo] || 0) + 1), m), {})));
    if (maiorGrupo > pessoas.length / 2) {
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

  // Ofusca o resultado no link para que não seja legível a olho nu (não é criptografia forte).
  const CHAVE = 'presente-surpresa';
  function encode(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    const x = bytes.map((b, i) => b ^ CHAVE.charCodeAt(i % CHAVE.length));
    let bin = ''; x.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(str) {
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    const x = Uint8Array.from(bin, (c, i) => c.charCodeAt(0) ^ CHAVE.charCodeAt(i % CHAVE.length));
    return JSON.parse(new TextDecoder().decode(x));
  }

  function mensagem(nome, ev, link) {
    const primeiro = nome.split(' ')[0];
    let t = `Oi, ${primeiro}! 🎁 O sorteio do *${ev.e || 'Amigo Secreto'}* foi feito.\n\n`;
    t += `Abra seu link pessoal para descobrir quem você tirou (não compartilhe!):\n${link}`;
    if (ev.d) t += `\n\n📅 ${ev.d}`;
    if (ev.v) t += `\n💰 Valor sugerido: ${ev.v}`;
    return t;
  }

  const api = { normalizarTelefone, parse, sortear, encode, decode, mensagem };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AmigoSecreto = api;
})(typeof window !== 'undefined' ? window : globalThis);
