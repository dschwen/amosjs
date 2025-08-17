'use strict';
const assert = require('assert');
const { parseSourceToIR } = require('../src/loader');
const { deek, leek } = require('../src/utils/binary');

module.exports = ({ it }) => {
  it('parses generic command and function', () => {
    const TK_ENT = 0x003E;
    const t = new Map([
      [0x9000, { name: 'Hslider' }],
      [0x9002, { name: 'To' }],
      [0x9004, { name: 'PRINT' }],
      [0x9006, { name: 'MyFunc' }],
      [0x8000, { name: '(' }],
      [0x8002, { name: ')' }],
      [0x8004, { name: ',' }],
    ]);

    function line(bytes) {
      const total = bytes.length + 2; // len+indent
      const words = total / 2;
      return [words, 0, ...bytes];
    }

    function ent(n) {
      return [TK_ENT>>8, TK_ENT & 0xff, (n>>>24)&0xff, (n>>>16)&0xff, (n>>>8)&0xff, n&0xff];
    }

    function token(x) { return [x>>8, x&0xff]; }

    // Line1: Hslider 10,10 To 100,20,100,20,5
    const line1 = line([
      ...token(0x9000),
      ...ent(10),
      ...token(0x8004),
      ...ent(10),
      ...token(0x9002),
      ...ent(100),
      ...token(0x8004),
      ...ent(20),
      ...token(0x8004),
      ...ent(100),
      ...token(0x8004),
      ...ent(20),
      ...token(0x8004),
      ...ent(5),
      0x00,0x00,
    ]);

    // Line2: PRINT MyFunc(1,2)
    const line2 = line([
      ...token(0x9004),
      ...token(0x9006),
      ...token(0x8000),
      ...ent(1),
      ...token(0x8004),
      ...ent(2),
      ...token(0x8002),
      0x00,0x00,
    ]);

    // Line3: MyFunc(3,4)
    const line3 = line([
      ...token(0x9006),
      ...token(0x8000),
      ...ent(3),
      ...token(0x8004),
      ...ent(4),
      ...token(0x8002),
      0x00,0x00,
    ]);

    const src = Uint8Array.from([...line1, ...line2, ...line3]);
    const buf = new Uint8Array(20 + src.length);
    buf.set(src, 20);
    const dv = new DataView(buf.buffer);
    dv.setUint32(16, src.length);

    const { ir } = parseSourceToIR(buf, { tokTable: t });
    assert.strictEqual(ir[0].op, 'CMD');
    assert.strictEqual(ir[0].name, 'HSLIDER');
    assert.deepStrictEqual(ir[0].parts[0].args.map(a=>a.value), [10,10]);
    assert.strictEqual(ir[0].parts[1].keyword, 'TO');
    assert.deepStrictEqual(ir[0].parts[1].args.map(a=>a.value), [100,20,100,20,5]);
    assert.strictEqual(ir[1].op, 'PRINT');
    assert.strictEqual(ir[1].expr.type, 'call');
    assert.strictEqual(ir[1].expr.name, 'MYFUNC');
    assert.deepStrictEqual(ir[1].expr.args.map(a=>a.value), [1,2]);
    assert.strictEqual(ir[2].op, 'CALL');
    assert.strictEqual(ir[2].name, 'MYFUNC');
    assert.deepStrictEqual(ir[2].args.map(a=>a.value), [3,4]);
  });
};
