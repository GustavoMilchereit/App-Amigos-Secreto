const assert = require('assert');
const A = require('../sorteio.js');

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

for (let k = 0; k < 1000; k++) {
  const r = A.sortear(pessoas);
  const dadores = new Set(r.map(p => p.de.nome)), recebe = new Set(r.map(p => p.para.nome));
  assert.strictEqual(dadores.size, 15); assert.strictEqual(recebe.size, 15);
  r.forEach(p => {
    assert.notStrictEqual(p.de.nome, p.para.nome);
    if (p.de.grupo) assert.notStrictEqual(p.de.grupo, p.para.grupo);
  });
  assert.deepStrictEqual(r.map(p => p.de.nome), pessoas.map(p => p.nome));
  // roda única: seguir a cadeia a partir do primeiro volta ao início após 15 passos
  const m = Object.fromEntries(r.map(p => [p.de.nome, p.para.nome]));
  let cur = r[0].de.nome, n = 0; do { cur = m[cur]; n++; } while (cur !== r[0].de.nome && n < 99);
  assert.strictEqual(n, 15);
}
// erros de validação
assert.ok(A.parse('Ana; 11999998888\nana; 11988887777\nBia; 11977776666').erros[0].includes('repetido'));
assert.ok(A.parse('Ana\nBia; 11977776666\nCid; 11977776665').erros[0].includes('sem telefone'));
assert.throws(() => A.sortear(A.parse('a;11999990001;x\nb;11999990002;x\nc;11999990003').pessoas));
// encode/decode com acentos
const o = { n: 'João', a: 'Conceição', e: 'Natal 🎄' };
assert.deepStrictEqual(A.decode(A.encode(o)), o);
assert.ok(!A.encode(o).includes('Concei'));
console.log('OK: todos os testes passaram');
