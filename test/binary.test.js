'use strict';
const assert = require('assert');
const { deek, leek, align2 } = require('../src/utils/binary');

module.exports = ({ it }) => {
  it('deek reads big-endian 16-bit', () => {
    const b = Uint8Array.from([0x12, 0x34]);
    assert.strictEqual(deek(b, 0), 0x1234);
  });

  it('leek reads big-endian 32-bit', () => {
    const b = Uint8Array.from([0x01, 0x23, 0x45, 0x67]);
    assert.strictEqual(leek(b, 0), 0x01234567);
  });

  it('align2 rounds up to even', () => {
    assert.strictEqual(align2(0), 0);
    assert.strictEqual(align2(1), 2);
    assert.strictEqual(align2(2), 2);
    assert.strictEqual(align2(3), 4);
  });
};

