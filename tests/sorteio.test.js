// Rode com: node tests/sorteio.test.js
const assert = require('assert');
const A = require('../sorteio.js');

(async () => {
  // ---------- Leitura da lista ----------
  const txt = `Maria; (11) 98765-4321; casal1
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
  const { pessoas, erros } = A.parse(txt);
  assert.deepStrictEqual(erros, []);
  assert.strictEqual(pessoas.length, 15);
  assert.strictEqual(pessoas[0].telefone, '5511987654321');
  assert.strictEqual(pessoas[14].telefone, '5551966660000');
  assert.ok(A.parse('Ana; 11999998888\nana; 11988887777\nBia; 11977776666').erros[0].includes('repetido'));
  assert.ok(A.parse('Ana\nBia; 11977776666\nCid; 11977776665').erros[0].includes('sem telefone'));

  // ---------- Regras do sorteio ----------
  for (let k = 0; k < 2000; k++) {
    const r = A.sortear(pessoas);
    assert.deepStrictEqual(r.map(p => p.de.nome), pessoas.map(p => p.nome), 'lista deve sair na ordem de entrada');
    assert.strictEqual(new Set(r.map(p => p.para.nome)).size, 15, 'cada um recebe exatamente um presente');
    r.forEach(p => {
      assert.notStrictEqual(p.de.nome, p.para.nome, 'ninguém tira a si mesmo');
      if (p.de.grupo) assert.notStrictEqual(p.de.grupo, p.para.grupo, 'ninguém tira do próprio grupo');
    });
    const m = new Map(r.map(p => [p.de.nome, p.para.nome]));
    let cur = r[0].de.nome, n = 0; do { cur = m.get(cur); n++; } while (cur !== r[0].de.nome && n < 99);
    assert.strictEqual(n, 15, 'roda única');
  }
  assert.throws(() => A.sortear(A.parse('a;11999990001;x\nb;11999990002;x\nc;11999990003').pessoas));

  // ---------- Aleatoriedade: ninguém é favorecido, nem pela ordem da lista ----------
  const N = 15, RUNS = 30000, esperado = RUNS / (N - 1);
  const semGrupo = pessoas.map(p => ({ ...p, grupo: '' }));
  const idx = new Map(semGrupo.map((p, i) => [p, i]));
  const cont = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let r = 0; r < RUNS; r++) for (const par of A.sortear(semGrupo)) cont[idx.get(par.de)][idx.get(par.para)]++;
  let chi = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j) chi += (cont[i][j] - esperado) ** 2 / esperado;
  // 196 graus de liberdade efetivos ≈ 195; acima de 280 indicaria viés (p < 0,0001).
  assert.ok(chi < 280, `distribuição viciada (qui-quadrado ${chi.toFixed(1)})`);

  // ---------- Criptografia ----------
  const token = await A.selar({ n: 'João Pedro', a: 'Vó Conceição', e: 'Amigo Secreto da Família' });
  assert.deepStrictEqual(await A.abrir(token), { n: 'João', a: 'Vó Conceição', e: 'Amigo Secreto da Família' });
  assert.ok(!Buffer.from(token, 'base64url').toString('latin1').includes('Concei'), 'nome não aparece no link');
  assert.ok(token.length <= 110, `link curto (${token.length} caracteres)`);
  assert.deepStrictEqual(await A.abrir(await A.selar({ n: 'Ana', a: 'Bia' })), { n: 'Ana', a: 'Bia', e: '' }, 'evento opcional');
  assert.notStrictEqual(token, await A.selar({ n: 'João Pedro', a: 'Vó Conceição', e: 'Amigo Secreto da Família' }), 'cada link tem chave própria');

  const falhar = (t, msg) => A.abrir(t).then(() => assert.fail(msg), () => {});
  const trocar = (t, i) => t.slice(0, i) + (t[i] === 'A' ? 'B' : 'A') + t.slice(i + 1);
  await falhar(trocar(token, 30), 'conteúdo adulterado deveria falhar');
  await falhar(trocar(token, 5), 'chave adulterada deveria falhar');
  await falhar(token.slice(0, -6), 'link cortado deveria falhar');
  await falhar('teste', 'lixo deveria falhar');
  await falhar('', 'vazio deveria falhar');

  // ---------- Backup com senha ----------
  const bk = await A.cifrarComSenha({ x: 1, nome: 'Zé' }, 'senha-forte');
  assert.deepStrictEqual(await A.decifrarComSenha(bk, 'senha-forte'), { x: 1, nome: 'Zé' });
  await A.decifrarComSenha(bk, 'errada').then(() => assert.fail('senha errada'), () => {});

  console.log(`OK: todos os testes passaram (qui-quadrado ${chi.toFixed(1)})`);
})().catch(e => { console.error(e); process.exit(1); });
