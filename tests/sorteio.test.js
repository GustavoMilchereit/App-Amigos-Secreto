/**
 * Testes do núcleo do sorteio (js/sorteio.js).
 *
 * Rode com:  npm test   (ou: node tests/sorteio.test.js)
 * Não precisa instalar nada: usa só o Node 20+.
 */
const assert = require('assert');
const AmigoSecreto = require('../js/sorteio.js');

/** Valida uma lista escrita como texto ("Nome; Telefone; Grupo" por linha). */
const validarTexto = (texto, ignorados) => AmigoSecreto.validar(AmigoSecreto.linhasDeTexto(texto), ignorados);

/** Executa um bloco de testes e mostra o nome dele no resultado. */
async function bloco(nome, testes) {
  await testes();
  console.log(`  ✓ ${nome}`);
}

(async () => {
  console.log('Testando js/sorteio.js');

  // Lista com 15 pessoas e alguns grupos, usada em vários blocos.
  const LISTA_DA_FAMILIA = `Maria; (11) 98765-4321; casal1
João; 11 91234-5678; casal1
Ana; 21999998888; casal2
Pedro; 21988887777; casal2
Lucia; 31977776666
Carlos; 31966665555; casal3
Bia; 31955554444; casal3
Rafa; 41944443333
Teo; 41933332222; fam
Duda; 41922221111; fam
Gui; 41911110000; fam
Lia; 51999990000
Nina; 51988880000
Otto; 51977770000
Vera; 5551966660000`;
  const familia = validarTexto(LISTA_DA_FAMILIA);

  await bloco('Leitura da lista', () => {
    assert.deepStrictEqual(familia.erros, []);
    assert.strictEqual(familia.pessoas.length, 15);
    assert.strictEqual(familia.pessoas[0].telefone, '5511987654321');
    assert.strictEqual(familia.pessoas[14].telefone, '5551966660000');
    assert.ok(validarTexto('Ana; 11999998888\nana; 11988887777\nBia; 11977776666').erros[0].msg.includes('repetido'));
    assert.ok(validarTexto('Ana\nBia; 11977776666\nCid; 11977776665').erros[0].msg.includes('Falta o telefone'));
    assert.ok(validarTexto('Ana; 11999998888\nBia; 11977776666').erros[0].msg.includes('pelo menos 3'));
    // Colunas extras do Excel viram grupos adicionais; cabeçalho é ignorado.
    assert.strictEqual(AmigoSecreto.linhasDeTexto('Otávio\t11987650001\tCasal\tFamília')[0].grupo, 'Casal, Família');
    assert.strictEqual(AmigoSecreto.linhasDeTexto('Nome;Telefone;Grupo\nAna;11987650001;').length, 1);
  });

  await bloco('Telefone: qualquer formatação, DDD obrigatório', () => {
    const formatos = ['(11) 98765-4321', '11 98765-4321', '11987654321', '11 9 8765 4321', '+55 (11) 98765-4321', '5511987654321', '011 98765-4321'];
    for (const formato of formatos) assert.strictEqual(AmigoSecreto.analisarTelefone(formato).numero, '5511987654321', formato);
    assert.strictEqual(AmigoSecreto.analisarTelefone('11987654321').exibir, '(11) 98765-4321');
    assert.ok(AmigoSecreto.analisarTelefone('98765-4321').erro.includes('DDD'));
    assert.ok(AmigoSecreto.analisarTelefone('(10) 98765-4321').erro.includes('não existe'));
    assert.ok(AmigoSecreto.analisarTelefone('(11) 8765-4321').aviso.includes('Falta o 9'));
    assert.ok(AmigoSecreto.analisarTelefone('(11) 3456-7890').aviso.includes('fixo'));
    assert.ok(AmigoSecreto.analisarTelefone('+1 415 555 0100').aviso.includes('exterior'));
    assert.ok(AmigoSecreto.analisarTelefone('').erro);
    assert.ok(validarTexto('A; 11987650001\nB; (11) 98765-0001\nC; 11987650003').avisos.some(a => a.msg.includes('Mesmo telefone')));
  });

  await bloco('Grupos: normalização e erros de digitação', () => {
    // Maiúsculas, acentos e espaços extras não criam grupo novo.
    let r = validarTexto('Otávio; 11987650001; Família Silva\nHelena; 11987650002;  familia   SILVA \nAna; 11987650003');
    assert.strictEqual(r.grupos.length, 1);
    assert.strictEqual(r.grupos[0].membros.length, 2);
    assert.deepStrictEqual(r.suspeitos, []);
    assert.deepStrictEqual(r.sozinhos, []);

    // "Helena" x "Helna": alerta de grupos quase iguais.
    const comErro = 'Otávio; 11987650001; Casal Otávio e Helena\nHelena; 11987650002; Casal Otávio e Helna\nAna; 11987650003';
    r = validarTexto(comErro);
    assert.strictEqual(r.suspeitos.length, 1);

    // O organizador confirma que são diferentes: o alerta some e sobram dois grupos de uma pessoa só.
    r = validarTexto(comErro, [r.suspeitos[0].par]);
    assert.strictEqual(r.suspeitos.length, 0);
    assert.strictEqual(r.sozinhos.length, 2);

    // "Casal 1" x "Casal 2" são grupos legítimos.
    assert.deepStrictEqual(validarTexto('A; 11987650001; Casal 1\nB; 11987650002; Casal 1\nC; 11987650003; Casal 2\nD; 11987650004; Casal 2').suspeitos, []);
  });

  await bloco('Grupos: uma pessoa em vários grupos', () => {
    assert.deepStrictEqual(AmigoSecreto.separarGrupos('Casal G e B, família M ,  Família  M, '), ['Casal G e B', 'família M']);
    const r = validarTexto(`Otávio; 11987650001; Casal Otávio e Helena, Família Souza
Helena; 11987650002; Casal Otávio e Helena
Maria; 11987650003; Família Souza
Pedro; 11987650004; Família Souza
Ana; 11987650005
Bia; 11987650006
Caio; 11987650007
Davi; 11987650008`);
    assert.deepStrictEqual(r.erros, []);
    assert.deepStrictEqual(r.pessoas[0].grupos, ['casal otavio e helena', 'familia souza']);
    const proibidos = [['Otávio', 'Helena'], ['Otávio', 'Maria'], ['Otávio', 'Pedro'], ['Maria', 'Pedro']];
    for (let i = 0; i < 2000; i++) {
      const quemTira = new Map(AmigoSecreto.sortear(r.pessoas).map(p => [p.de.nome, p.para.nome]));
      for (const [x, y] of proibidos) {
        assert.notStrictEqual(quemTira.get(x), y, `${x} não pode tirar ${y}`);
        assert.notStrictEqual(quemTira.get(y), x, `${y} não pode tirar ${x}`);
      }
    }
    // Pessoa em grupo com quase todo mundo: erro claro em vez de travar.
    assert.throws(() => AmigoSecreto.sortear(validarTexto('A;11987650001;g1,g2\nB;11987650002;g1\nC;11987650003;g2\nD;11987650004;g1').pessoas));
    // Grupo com mais da metade das pessoas: impossível.
    assert.throws(() => AmigoSecreto.sortear(validarTexto('a;11999990001;x\nb;11999990002;x\nc;11999990003').pessoas));
  });

  await bloco('Regras do sorteio (2.000 sorteios)', () => {
    const { pessoas } = familia;
    for (let i = 0; i < 2000; i++) {
      const pares = AmigoSecreto.sortear(pessoas);
      assert.deepStrictEqual(pares.map(p => p.de.nome), pessoas.map(p => p.nome), 'a lista sai na ordem de entrada');
      assert.strictEqual(new Set(pares.map(p => p.para.nome)).size, 15, 'cada um recebe exatamente um presente');
      for (const par of pares) {
        assert.notStrictEqual(par.de.nome, par.para.nome, 'ninguém tira a si mesmo');
        assert.ok(!par.de.grupos.some(g => par.para.grupos.includes(g)), 'ninguém tira alguém do próprio grupo');
      }
      // Roda única: seguindo a corrente a partir de qualquer pessoa, só se volta ao início depois de passar por todos.
      const quemTira = new Map(pares.map(p => [p.de.nome, p.para.nome]));
      let atual = pares[0].de.nome, passos = 0;
      do { atual = quemTira.get(atual); passos++; } while (atual !== pares[0].de.nome && passos < 99);
      assert.strictEqual(passos, 15, 'roda única');
    }
  });

  let quiQuadrado = 0;
  await bloco('Aleatoriedade (30.000 sorteios, teste qui-quadrado)', () => {
    // Sem grupos, cada pessoa deveria tirar cada uma das outras 14 com a mesma frequência.
    const N = 15, SORTEIOS = 30000, esperado = SORTEIOS / (N - 1);
    const semGrupos = familia.pessoas.map(p => ({ ...p, grupos: [] }));
    const indice = new Map(semGrupos.map((p, i) => [p, i]));
    const contagem = Array.from({ length: N }, () => new Array(N).fill(0));
    for (let s = 0; s < SORTEIOS; s++) {
      for (const par of AmigoSecreto.sortear(semGrupos)) contagem[indice.get(par.de)][indice.get(par.para)]++;
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (i !== j) quiQuadrado += (contagem[i][j] - esperado) ** 2 / esperado;
    }
    // ~195 graus de liberdade: o valor típico fica perto de 195; acima de 280 indicaria viés (p < 0,0001).
    assert.ok(quiQuadrado < 280, `distribuição viciada (qui-quadrado ${quiQuadrado.toFixed(1)})`);
  });

  await bloco('Links criptografados', async () => {
    const codigo = await AmigoSecreto.selar({ n: 'João Pedro', a: 'Vó Conceição', e: 'Amigo Secreto da Família' });
    assert.deepStrictEqual(await AmigoSecreto.abrir(codigo), { n: 'João', a: 'Vó Conceição', e: 'Amigo Secreto da Família', d: '', l: '', v: '' });
    assert.ok(!Buffer.from(codigo, 'base64url').toString('latin1').includes('Concei'), 'o nome não aparece no link');
    assert.ok(codigo.length <= 110, `link curto (${codigo.length} caracteres)`);
    assert.notStrictEqual(codigo, await AmigoSecreto.selar({ n: 'João Pedro', a: 'Vó Conceição', e: 'Amigo Secreto da Família' }), 'cada link tem chave própria');

    const completo = await AmigoSecreto.selar({ n: 'Ana', a: 'Bia', e: 'Amigo Secreto da Família', d: '24/12 às 20h', l: 'Casa da vó', v: 'R$ 100' });
    assert.deepStrictEqual(await AmigoSecreto.abrir(completo), { n: 'Ana', a: 'Bia', e: 'Amigo Secreto da Família', d: '24/12 às 20h', l: 'Casa da vó', v: 'R$ 100' });
    assert.ok(completo.length <= 160, `link com data/local/valor ainda curto (${completo.length})`);
    const soLocal = await AmigoSecreto.abrir(await AmigoSecreto.selar({ n: 'Ana', a: 'Bia', l: 'Sítio' }));
    assert.strictEqual(soLocal.l, 'Sítio');
    assert.strictEqual(soLocal.d, '');

    // Links alterados, cortados ou inventados não abrem.
    const deveFalhar = (c, motivo) => AmigoSecreto.abrir(c).then(() => assert.fail(motivo), () => {});
    const trocarCaractere = (c, i) => c.slice(0, i) + (c[i] === 'A' ? 'B' : 'A') + c.slice(i + 1);
    await deveFalhar(trocarCaractere(codigo, 30), 'conteúdo alterado');
    await deveFalhar(trocarCaractere(codigo, 5), 'chave alterada');
    await deveFalhar(codigo.slice(0, -6), 'link cortado');
    await deveFalhar('teste', 'texto qualquer');
    await deveFalhar('', 'link vazio');
  });

  await bloco('Compatibilidade com links e backups já enviados', async () => {
    // Gerados pela versão publicada antes da reorganização do código.
    // Se este teste falhar, os links que já estão no WhatsApp das pessoas deixaram de abrir.
    const LINK_ANTIGO = 'jOA7QbjBiyWJTbQOVgeIPQ1TaVwn8vxC13KSiIFu8oE1WSQSWgq8l8G7kzCDSe19zLhip2QEMJh3z42W_CQZHy6D9vFqHZEF5_aiCMXC1do6sIWX-yi4W591yC7g_X6MSHLuGedgMMYTdeX-fNg';
    assert.deepStrictEqual(await AmigoSecreto.abrir(LINK_ANTIGO), { n: 'Otávio', a: 'Helena Lima', e: 'Amigo Secreto da Família', d: '24/12 às 20h', l: 'Casa da vó', v: 'R$ 100' });
    const BACKUP_ANTIGO = 'amigo-secreto-backup.aDSzfsJJ4yCaShzWnycuu5KHLKzh81TgFrXj5X6IuKmbPE8sqLaXH2JHKFJcu6XFFDkJCUzxqQR5xHkbcq22elEk4wIH-FMk5zdVhAFv1S1UoUQm32d8ukr5C4vGUdUSwzxH2wWPu4J6AGQfcSMj';
    assert.deepStrictEqual(await AmigoSecreto.decifrarComSenha(BACKUP_ANTIGO, 'senha-antiga'), { linhas: [{ nome: 'Otávio', tel: '11987650001', grupo: 'Casal' }] });
  });

  await bloco('Backup com senha', async () => {
    const backup = await AmigoSecreto.cifrarComSenha({ x: 1, nome: 'Zé' }, 'senha-forte');
    assert.deepStrictEqual(await AmigoSecreto.decifrarComSenha(backup, 'senha-forte'), { x: 1, nome: 'Zé' });
    await AmigoSecreto.decifrarComSenha(backup, 'errada').then(() => assert.fail('senha errada deveria falhar'), () => {});
  });

  await bloco('Mensagem de WhatsApp', () => {
    const texto = AmigoSecreto.mensagem('Otávio Souza', { e: 'Natal', d: '24/12', l: 'Casa da vó', v: 'R$ 100' }, 'https://exemplo/#abc');
    assert.ok(texto.startsWith('Oi, Otávio!'));
    assert.ok(texto.includes('https://exemplo/#abc') && texto.includes('📍 Casa da vó') && texto.includes('💰 Valor sugerido: R$ 100'));
  });

  console.log(`\nOK: todos os testes passaram (qui-quadrado ${quiQuadrado.toFixed(1)})`);
})().catch(erro => { console.error(erro); process.exit(1); });
