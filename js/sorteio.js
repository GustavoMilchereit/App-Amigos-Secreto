/**
 * Amigo Secreto — núcleo do sorteio.
 *
 * Toda a lógica que não depende da tela fica aqui, para ser usada pelo painel
 * (painel.html), pela página de revelação (index.html) e pelos testes (Node 20+):
 *
 *   1. Telefones ............ interpreta números digitados de qualquer jeito
 *   2. Grupos ............... normaliza nomes de grupo e detecta erros de digitação
 *   3. Tabela .............. lê a lista de participantes e valida tudo
 *   4. Sorteio .............. sorteia uma roda única respeitando as regras
 *   5. Links criptografados  cifra e decifra o resultado de cada pessoa
 *   6. Backup ............... cifra o estado do painel com uma senha
 *   7. Mensagem ............. monta o texto enviado por WhatsApp/SMS
 *
 * No navegador, tudo fica disponível em `window.AmigoSecreto`.
 * No Node, use `require('./js/sorteio.js')`.
 */
(function (global) {
  'use strict';

  const crypto = global.crypto;
  const subtle = crypto.subtle;

  // ===========================================================================
  // 1. TELEFONES
  // ===========================================================================

  /** DDDs que existem no Brasil (Anatel). */
  const DDDS_VALIDOS = new Set([
    11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
    71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
  ]);

  /**
   * Interpreta um telefone digitado com qualquer formatação: traços, espaços,
   * parênteses, +55 ou 0 na frente. O DDD é obrigatório.
   *
   * @param {string} digitado  O que a pessoa escreveu, ex.: "(11) 98765-4321".
   * @returns {{numero: string, exibir: string, aviso?: string} | {erro: string}}
   *   `numero` vem só com dígitos e código do país (ex.: "5511987654321"), pronto
   *   para o WhatsApp; `exibir` vem formatado para conferência; `aviso` indica algo
   *   suspeito que não impede o sorteio; `erro` indica um número inutilizável.
   */
  function analisarTelefone(digitado) {
    const texto = String(digitado || '').trim();
    if (!texto) return { erro: 'Falta o telefone.' };
    if (/[a-z]/i.test(texto)) return { erro: 'O telefone tem letras.' };

    let digitos = texto.replace(/\D/g, '');
    const internacional = /^(\+|00)/.test(texto);

    if (internacional) {
      digitos = digitos.replace(/^00/, '');
      if (!digitos.startsWith('55')) {
        // Número do exterior: só conferimos o tamanho (padrão internacional E.164).
        if (digitos.length < 8 || digitos.length > 15) return { erro: 'Número do exterior inválido.' };
        return { numero: digitos, exibir: '+' + digitos, aviso: 'Número do exterior: confira o código do país.' };
      }
    } else {
      digitos = digitos.replace(/^0+/, ''); // "011 9..." → "11 9..."
      if (digitos.length === 8 || digitos.length === 9) return { erro: 'Falta o DDD. Ex.: 11 98765-4321' };
      if (digitos.length === 10 || digitos.length === 11) {
        digitos = '55' + digitos; // DDD + número, sem o código do país
      } else if (!((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55'))) {
        return { erro: digitos.length < 8 ? 'Número incompleto.' : 'Dígitos demais. Tire o código da operadora, se tiver.' };
      }
    }

    // Aqui `digitos` é sempre "55" + DDD (2 dígitos) + número (8 ou 9 dígitos).
    const ddd = Number(digitos.slice(2, 4));
    const numero = digitos.slice(4);
    if (!DDDS_VALIDOS.has(ddd)) return { erro: `O DDD ${digitos.slice(2, 4)} não existe.` };

    if (numero.length === 9) {
      if (numero[0] !== '9') return { erro: 'Celular com 9 dígitos começa com 9.' };
      return { numero: digitos, exibir: `(${ddd}) ${numero.slice(0, 5)}-${numero.slice(5)}` };
    }

    // 8 dígitos: ou é um celular antigo sem o 9, ou é telefone fixo.
    const pareceCelular = /^[6-9]/.test(numero);
    return {
      numero: digitos,
      exibir: `(${ddd}) ${numero.slice(0, 4)}-${numero.slice(4)}`,
      aviso: pareceCelular
        ? 'Falta o 9 na frente? Celular tem 9 dígitos depois do DDD.'
        : 'Parece telefone fixo. O WhatsApp só funciona em celular.',
    };
  }

  // ===========================================================================
  // 2. GRUPOS
  // ===========================================================================
  // Pessoas do mesmo grupo (ex.: um casal) não podem tirar umas às outras.
  // Como o grupo é digitado à mão, um erro de digitação separaria o casal;
  // por isso normalizamos os nomes e procuramos grupos "quase iguais".

  /**
   * Chave de comparação de um grupo: sem acentos, minúsculas e espaços simples.
   * Assim "Família Silva" e "familia  SILVA" são o mesmo grupo.
   * @param {string} nome
   * @returns {string}
   */
  function normalizarGrupo(nome) {
    return String(nome || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Separa o texto do campo "grupo" em uma lista. Uma pessoa pode estar em
   * vários grupos, separados por vírgula. Repetições são descartadas.
   * @param {string} texto  Ex.: "Casal Otávio e Helena, Família Souza".
   * @returns {string[]}    Os nomes como foram escritos (sem repetição).
   */
  function separarGrupos(texto) {
    const chavesVistas = new Set();
    const grupos = [];
    String(texto || '').split(',').forEach(parte => {
      const nome = parte.replace(/\s+/g, ' ').trim();
      const chave = normalizarGrupo(nome);
      if (chave && !chavesVistas.has(chave)) {
        chavesVistas.add(chave);
        grupos.push(nome);
      }
    });
    return grupos;
  }

  /**
   * Distância de edição (Levenshtein): quantas letras é preciso inserir, apagar
   * ou trocar para transformar um texto no outro. "helena" → "helna" = 1.
   */
  function distanciaDeEdicao(a, b) {
    let linhaAnterior = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const linhaAtual = [i];
      for (let j = 1; j <= b.length; j++) {
        const custoTroca = a[i - 1] === b[j - 1] ? 0 : 1;
        linhaAtual[j] = Math.min(linhaAnterior[j] + 1, linhaAtual[j - 1] + 1, linhaAnterior[j - 1] + custoTroca);
      }
      linhaAnterior = linhaAtual;
    }
    return linhaAnterior[b.length];
  }

  /**
   * Diz se dois grupos (já normalizados) parecem o mesmo grupo escrito errado.
   * Tolera cerca de 1 erro a cada 6 letras (no máximo 3). Não acusa grupos que
   * só diferem no número ("casal 1" x "casal 2") nem nomes muito curtos.
   * @param {string} a
   * @param {string} b
   * @returns {boolean}
   */
  function gruposQuaseIguais(a, b) {
    if (a.replace(/\d+/g, '#') === b.replace(/\d+/g, '#')) return false;
    const tamanho = Math.max(a.length, b.length);
    if (tamanho < 4) return false;
    const tolerancia = Math.min(3, Math.max(1, Math.floor(tamanho / 6)));
    return distanciaDeEdicao(a, b) <= tolerancia;
  }

  // ===========================================================================
  // 3. TABELA DE PARTICIPANTES
  // ===========================================================================

  /**
   * @typedef {{nome: string, tel: string, grupo: string}} Linha
   *   Uma linha da tabela como o organizador digitou. `grupo` pode conter
   *   vários grupos separados por vírgula.
   *
   * @typedef {{nome: string, telefone: string, grupos: string[], linha: number}} Pessoa
   *   Participante já validado: telefone normalizado e chaves de grupo.
   */

  /**
   * Converte texto colado do Excel/Google Sheets (separado por TAB) ou de um
   * CSV (separado por ";" ou ",") em linhas da tabela. Ignora o cabeçalho, se
   * houver. Colunas depois do telefone viram grupos.
   * @param {string} texto
   * @returns {Linha[]}
   */
  function linhasDeTexto(texto) {
    const linhas = String(texto || '').split(/\r?\n/).filter(l => l.trim());
    if (linhas.length && /^\s*nome/i.test(linhas[0])) linhas.shift();
    return linhas.map(linha => {
      const separador = linha.includes('\t') ? '\t' : linha.includes(';') ? ';' : ',';
      const [nome = '', tel = '', ...demaisColunas] = linha.split(separador).map(c => c.trim());
      return { nome, tel, grupo: separarGrupos(demaisColunas.join(',')).join(', ') };
    });
  }

  /**
   * Valida a tabela inteira.
   *
   * @param {Linha[]} linhas
   * @param {string[]} [paresIgnorados]  Pares de grupos "a|b" que o organizador
   *   confirmou serem grupos diferentes (não geram mais alerta).
   * @returns {{
   *   pessoas: Pessoa[],
   *   erros: {linha: number, campo: string, msg: string}[],   // impedem o sorteio
   *   avisos: {linha: number, campo: string, msg: string}[],  // só pedem conferência
   *   grupos: {chave: string, rotulo: string, membros: {linha: number, nome: string}[]}[],
   *   suspeitos: {a: object, b: object, par: string}[],       // grupos quase iguais
   *   sozinhos: object[],                                      // grupos de uma pessoa só
   * }}
   */
  function validar(linhas, paresIgnorados = []) {
    const pessoas = [], erros = [], avisos = [];
    const gruposPorChave = new Map();
    const linhaDoNome = new Map();     // nome em minúsculas → índice da linha
    const donoDoTelefone = new Map();  // número normalizado → nome

    linhas.forEach((linha, i) => {
      const nome = String(linha.nome || '').replace(/\s+/g, ' ').trim();
      const nomesDeGrupo = separarGrupos(linha.grupo);
      const vazia = !nome && !String(linha.tel || '').trim() && !nomesDeGrupo.length;
      if (vazia) return;

      // Nome: obrigatório e sem repetição (a revelação mostra só o nome).
      if (!nome) {
        erros.push({ linha: i, campo: 'nome', msg: 'Falta o nome.' });
      } else {
        const chaveNome = nome.toLowerCase();
        if (linhaDoNome.has(chaveNome)) {
          erros.push({ linha: i, campo: 'nome', msg: `Nome repetido (linha ${linhaDoNome.get(chaveNome) + 1}). Diferencie, ex.: "João Pai" e "João Filho".` });
        } else {
          linhaDoNome.set(chaveNome, i);
        }
      }

      // Telefone.
      const telefone = analisarTelefone(linha.tel);
      if (telefone.erro) {
        erros.push({ linha: i, campo: 'tel', msg: telefone.erro });
      } else {
        if (telefone.aviso) avisos.push({ linha: i, campo: 'tel', msg: telefone.aviso });
        if (donoDoTelefone.has(telefone.numero)) {
          avisos.push({ linha: i, campo: 'tel', msg: `Mesmo telefone de ${donoDoTelefone.get(telefone.numero)}: os dois links vão para o mesmo celular.` });
        } else {
          donoDoTelefone.set(telefone.numero, nome || `linha ${i + 1}`);
        }
      }

      // Grupos: registra a pessoa em cada um.
      const chaves = nomesDeGrupo.map(rotulo => {
        const chave = normalizarGrupo(rotulo);
        if (!gruposPorChave.has(chave)) gruposPorChave.set(chave, { chave, rotulo, membros: [] });
        gruposPorChave.get(chave).membros.push({ linha: i, nome: nome || `linha ${i + 1}` });
        return chave;
      });

      pessoas.push({ nome, telefone: telefone.numero || '', grupos: chaves, linha: i });
    });

    // Grupos quase iguais (provável erro de digitação).
    const grupos = [...gruposPorChave.values()];
    const suspeitos = [];
    for (let x = 0; x < grupos.length; x++) {
      for (let y = x + 1; y < grupos.length; y++) {
        const a = grupos[x], b = grupos[y];
        const par = [a.chave, b.chave].sort().join('|');
        if (!paresIgnorados.includes(par) && gruposQuaseIguais(a.chave, b.chave)) suspeitos.push({ a, b, par });
      }
    }

    // Grupos de uma pessoa só não impedem nada; também costumam ser erro.
    const emSuspeita = new Set(suspeitos.flatMap(s => [s.a.chave, s.b.chave]));
    const sozinhos = grupos.filter(g => g.membros.length === 1 && !emSuspeita.has(g.chave));

    if (!erros.length && pessoas.length < 3) erros.push({ linha: -1, campo: '', msg: 'São necessárias pelo menos 3 pessoas.' });
    return { pessoas, erros, avisos, grupos, suspeitos, sozinhos };
  }

  // ===========================================================================
  // 4. SORTEIO
  // ===========================================================================

  /**
   * Inteiro aleatório uniforme em [0, n), usando o gerador criptográfico do
   * navegador. Descarta valores do "resto" para não favorecer números baixos.
   */
  function inteiroAleatorio(n) {
    const limite = Math.floor(0x100000000 / n) * n;
    const sorteado = new Uint32Array(1);
    do { crypto.getRandomValues(sorteado); } while (sorteado[0] >= limite);
    return sorteado[0] % n;
  }

  /**
   * Embaralhamento de Fisher-Yates: toda ordem possível tem a mesma chance,
   * independentemente da ordem em que os nomes foram digitados.
   */
  function embaralhar(lista, aleatorio = inteiroAleatorio) {
    const copia = lista.slice();
    for (let i = copia.length - 1; i > 0; i--) {
      const j = aleatorio(i + 1);
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  /** Tentativas antes de desistir quando os grupos tornam o sorteio muito difícil. */
  const MAXIMO_DE_TENTATIVAS = 50000;

  /**
   * Sorteia uma **roda única** (A tira B, B tira C, …, o último tira A):
   *  - ninguém tira a si mesmo;
   *  - cada pessoa dá e recebe exatamente um presente;
   *  - ninguém tira alguém com quem divide um grupo;
   *  - na festa, a revelação segue em corrente e só fecha no final.
   *
   * Embaralha e descarta rodas que quebram as regras (amostragem por rejeição);
   * assim todas as rodas válidas continuam igualmente prováveis.
   *
   * @param {Pessoa[]} pessoas
   * @returns {{de: Pessoa, para: Pessoa}[]}  Na mesma ordem de `pessoas`, para que
   *   a lista mostrada no painel não revele a sequência da roda.
   */
  function sortear(pessoas, aleatorio = inteiroAleatorio) {
    const dividemGrupo = (a, b) => a.grupos.some(g => b.grupos.includes(g));

    // Impossibilidades óbvias, com mensagem clara em vez de tentar à toa.
    const tamanhoDoGrupo = {};
    pessoas.forEach(p => p.grupos.forEach(g => { tamanhoDoGrupo[g] = (tamanhoDoGrupo[g] || 0) + 1; }));
    if (Math.max(0, ...Object.values(tamanhoDoGrupo)) > pessoas.length / 2) {
      throw new Error('Um grupo tem mais da metade dos participantes; impossível sortear sem que alguém tire alguém do próprio grupo.');
    }
    for (const pessoa of pessoas) {
      const possiveis = pessoas.filter(outra => outra !== pessoa && !dividemGrupo(pessoa, outra)).length;
      if (possiveis < 2 && pessoas.length > 2) {
        throw new Error(`${pessoa.nome} está em grupos com quase todo mundo e não tem pessoas suficientes para tirar ou ser tirado. Revise os grupos.`);
      }
    }

    for (let tentativa = 0; tentativa < MAXIMO_DE_TENTATIVAS; tentativa++) {
      const roda = embaralhar(pessoas, aleatorio);
      const proximo = i => roda[(i + 1) % roda.length];
      const valida = roda.every((pessoa, i) => !dividemGrupo(pessoa, proximo(i)));
      if (valida) {
        const quemTira = new Map(roda.map((pessoa, i) => [pessoa, proximo(i)]));
        return pessoas.map(pessoa => ({ de: pessoa, para: quemTira.get(pessoa) }));
      }
    }
    throw new Error('Não encontrei um sorteio válido com essas restrições. Revise os grupos.');
  }

  // ===========================================================================
  // 5. LINKS CRIPTOGRAFADOS
  // ===========================================================================
  // Cada link termina em "#<código>". O código contém uma chave AES-128 própria
  // daquela pessoa seguida do resultado cifrado com AES-GCM. A parte depois do
  // "#" nunca é enviada ao servidor. Abrir o próprio link não revela nada sobre
  // os outros, e qualquer alteração no código faz a decifragem falhar.
  //
  // Como cada chave é usada uma única vez, o vetor de inicialização (IV) pode ser
  // fixo sem perda de segurança — e isso deixa o link mais curto.
  //
  // ATENÇÃO: não altere este formato; os links já enviados deixariam de abrir.

  const codificador = new TextEncoder();
  const decodificador = new TextDecoder();
  const IV_FIXO = new Uint8Array(12);
  const TAMANHO_DA_CHAVE = 16;    // bytes (AES-128)
  const TAMANHO_DA_ETIQUETA = 16; // bytes de autenticação do GCM

  /** Bytes → texto base64 seguro para URL (sem "+", "/" nem "="). */
  function paraBase64Url(bytes) {
    let binario = '';
    bytes.forEach(b => { binario += String.fromCharCode(b); });
    return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /** Texto base64 seguro para URL → bytes. */
  function deBase64Url(texto) {
    return Uint8Array.from(atob(texto.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  }

  /** Junta vários arrays de bytes em um só. */
  function concatenar(...partes) {
    const resultado = new Uint8Array(partes.reduce((total, p) => total + p.length, 0));
    let posicao = 0;
    partes.forEach(p => { resultado.set(p, posicao); posicao += p.length; });
    return resultado;
  }

  /** Remove quebras de linha (usadas como separador dentro do link). */
  const umaLinha = (texto) => String(texto || '').replace(/\n/g, ' ').trim();

  /**
   * @typedef {{n: string, a: string, e?: string, d?: string, l?: string, v?: string}} DadosDoLink
   *   n = quem tirou (só o primeiro nome vai no link), a = quem foi sorteado,
   *   e = nome do amigo secreto, d = data, l = local, v = valor sugerido.
   *   As chaves são curtas de propósito: o link precisa ser pequeno.
   */

  /**
   * Cifra o resultado de uma pessoa e devolve o código que vai depois do "#".
   * @param {DadosDoLink} dados
   * @returns {Promise<string>}
   */
  async function selar(dados) {
    const chave = crypto.getRandomValues(new Uint8Array(TAMANHO_DA_CHAVE));
    const chaveAes = await subtle.importKey('raw', chave, 'AES-GCM', false, ['encrypt']);

    const campos = [umaLinha(dados.n).split(' ')[0], umaLinha(dados.a), umaLinha(dados.e), umaLinha(dados.d), umaLinha(dados.l), umaLinha(dados.v)];
    while (campos.length > 2 && !campos[campos.length - 1]) campos.pop(); // campos vazios no fim não ocupam espaço

    const cifrado = await subtle.encrypt({ name: 'AES-GCM', iv: IV_FIXO }, chaveAes, codificador.encode(campos.join('\n')));
    return paraBase64Url(concatenar(chave, new Uint8Array(cifrado)));
  }

  /**
   * Decifra o código de um link.
   * @param {string} codigo  O que vem depois do "#".
   * @returns {Promise<Required<DadosDoLink>>}
   * @throws se o link estiver cortado, alterado ou não for deste app.
   */
  async function abrir(codigo) {
    const bytes = deBase64Url(String(codigo).trim());
    if (bytes.length < TAMANHO_DA_CHAVE + TAMANHO_DA_ETIQUETA + 3) throw new Error('curto');

    const chaveAes = await subtle.importKey('raw', bytes.slice(0, TAMANHO_DA_CHAVE), 'AES-GCM', false, ['decrypt']);
    const claro = await subtle.decrypt({ name: 'AES-GCM', iv: IV_FIXO }, chaveAes, bytes.slice(TAMANHO_DA_CHAVE));
    const [n, a, e = '', d = '', l = '', v = ''] = decodificador.decode(claro).split('\n');
    if (!n || !a) throw new Error('formato');
    return { n, a, e, d, l, v };
  }

  // ===========================================================================
  // 6. BACKUP COM SENHA
  // ===========================================================================
  // Permite levar o painel (e os links já gerados) para outro aparelho.
  // A senha vira uma chave AES-256 via PBKDF2 com 600 mil iterações, o que torna
  // tentativas de adivinhação muito lentas.

  const PREFIXO_DO_BACKUP = 'amigo-secreto-backup.';
  const ITERACOES_PBKDF2 = 600000;

  async function chaveDaSenha(senha, sal) {
    const base = await subtle.importKey('raw', codificador.encode(senha), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey(
      { name: 'PBKDF2', salt: sal, iterations: ITERACOES_PBKDF2, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
    );
  }

  /**
   * Cifra qualquer objeto com uma senha.
   * @returns {Promise<string>} Texto pronto para salvar em arquivo.
   */
  async function cifrarComSenha(objeto, senha) {
    const sal = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const chave = await chaveDaSenha(senha, sal);
    const cifrado = await subtle.encrypt({ name: 'AES-GCM', iv }, chave, codificador.encode(JSON.stringify(objeto)));
    return PREFIXO_DO_BACKUP + paraBase64Url(concatenar(sal, iv, new Uint8Array(cifrado)));
  }

  /**
   * Decifra um backup gerado por `cifrarComSenha`.
   * @throws se a senha estiver errada ou o arquivo estiver corrompido.
   */
  async function decifrarComSenha(texto, senha) {
    const bytes = deBase64Url(String(texto).trim().replace(PREFIXO_DO_BACKUP, ''));
    const chave = await chaveDaSenha(senha, bytes.slice(0, 16));
    const claro = await subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(16, 28) }, chave, bytes.slice(28));
    return JSON.parse(decodificador.decode(claro));
  }

  // ===========================================================================
  // 7. MENSAGEM DE WHATSAPP/SMS
  // ===========================================================================

  /**
   * Texto enviado a cada participante. Leva só o link, nunca o nome sorteado.
   * @param {string} nome    Nome de quem vai receber.
   * @param {{e?: string, d?: string, l?: string, v?: string}} evento
   * @param {string} link
   */
  function mensagem(nome, evento, link) {
    const primeiroNome = nome.split(' ')[0];
    let texto = `Oi, ${primeiroNome}! 🎁 O sorteio do *${evento.e || 'Amigo Secreto'}* foi feito.\n\n`;
    texto += `Abra seu link pessoal para descobrir quem você tirou. Ele é só seu, não compartilhe!\n${link}`;
    if (evento.d || evento.l || evento.v) texto += '\n';
    if (evento.d) texto += `\n📅 ${evento.d}`;
    if (evento.l) texto += `\n📍 ${evento.l}`;
    if (evento.v) texto += `\n💰 Valor sugerido: ${evento.v}`;
    texto += '\n\n⚠️ Só vale o link enviado por este número. Se alguém te mandar outro, é pegadinha. 😉';
    return texto;
  }

  // ===========================================================================
  // Exportação
  // ===========================================================================

  const AmigoSecreto = {
    analisarTelefone,
    normalizarGrupo, separarGrupos, gruposQuaseIguais,
    linhasDeTexto, validar,
    embaralhar, sortear,
    selar, abrir,
    cifrarComSenha, decifrarComSenha,
    mensagem,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AmigoSecreto;
  else global.AmigoSecreto = AmigoSecreto;
})(typeof window !== 'undefined' ? window : globalThis);
