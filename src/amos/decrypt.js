'use strict';
const { deek, leek } = require('../utils/binary');

// Port of AMOS_decrypt_procedure from background/amostools/amoslib.c
function decryptProcedure(src) {
  // src: Uint8Array view of the line starting at the PROCEDURE token
  if (src.length < 12) return; // do not operate on compiled or tiny
  // compiled check bit 0x10 at src[10]
  if ((src[10] & 0x10) !== 0) return;

  const size = leek(src, 4) >>> 0;
  const endline = size + 8 + 6; // start of line after END PROC, relative to src
  let line = src[src[0] * 2];
  let next = src[src[0] * 2];
  // line/next are byte values, we need offsets; compute as numbers
  let lineOff = (src[0] * 2) >>> 0;
  let nextOff = lineOff;

  let key = ((size << 8) | src[11]) >>> 0;
  let key2 = 1 >>> 0;
  const key3 = deek(src, 8) >>> 0;

  while (lineOff < endline) {
    lineOff = nextOff;
    nextOff = lineOff + (src[lineOff] * 2);
    if (src[lineOff] === 0) return; // avoid infinite loop on bad data
    let p = lineOff + 4; // per AMOS: start after 4 bytes of line
    while (p < nextOff) {
      src[p++] ^= (key >>> 8) & 0xff;
      if (p >= nextOff) break;
      src[p++] ^= key & 0xff;
      key = ((key & 0xffff0000) | (((key + key2) & 0xffff) >>> 0)) >>> 0;
      key2 = (key2 + key3) & 0xffff;
      key = ((key >>> 1) | (key << 31)) >>> 0; // rotate right one bit
    }
  }
  src[10] ^= 0x20; // toggle "is encrypted" bit
}

module.exports = { decryptProcedure };

