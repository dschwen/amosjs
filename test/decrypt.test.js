'use strict';
const assert = require('assert');
const { decryptProcedure } = require('../src/amos/decrypt');

// Build a synthetic buffer starting at a PROCEDURE line, sufficient for round-trip test.
function makeFakeProc(lines) {
  // Each line: [lenWords, indent, x2, x3, ...payload bytes...]. lenWords includes the 2 bytes len+indent and payload.
  // We will keep two lines: an empty body line with payload to encrypt, plus an END PROC line of 6 bytes.
  const body = Uint8Array.from(lines.flat());
  // Compute offsets
  const endOff = body.length + 8 + 6; // as per decryptProcedure expectation
  const out = new Uint8Array(endOff);
  // First line is PROC line; we just craft header bytes at positions used by decrypt:
  // Offsets used: [0]=lenWords of PROC line, [4..7]=size to endproc, [8..9]=seed, [10]=flags(we set 0), [11]=seed byte
  // Pretend first line is 4 bytes long (2 words), so next line starts at offset 4.
  out[0] = 2; // words
  out[1] = 0; // indent
  // Write size = body.length (from next line start) to END PROC start minus 8
  // We want endline = size + 8 + 6 == endOff
  const size = body.length;
  out[4] = (size >>> 24) & 0xff;
  out[5] = (size >>> 16) & 0xff;
  out[6] = (size >>> 8) & 0xff;
  out[7] = size & 0xff;
  // seed
  out[8] = 0x12; out[9] = 0x34; out[11] = 0x56;
  // Place body starting at offset (src[0]*2) == 4
  out.set(body, 4);
  // Craft END PROC line so that the decryption loop reaches endline and toggles the bit.
  const secondStart = 4 + body.length;
  const secondLenBytes = endOff - secondStart; // includes its own header
  const secondLenWords = secondLenBytes / 2;
  out[secondStart] = secondLenWords; // length words
  out[secondStart + 1] = 0; // indent
  // two bytes padding (unknown), then payload (zeros)
  return out;
}

module.exports = ({ it }) => {
  it('decryptProcedure toggles encryption bit and is involutive', () => {
    // Construct one body line with length 6 words (12 bytes), indent 0, and 8 bytes payload 0..7
    const bodyLine = [6, 0, 0, 0, 0,1,2,3,4,5,6,7];
    const buf = makeFakeProc([bodyLine]);
    // capture copy of payload before
    const before = Array.from(buf.slice(8, 4 + bodyLine.length));
    decryptProcedure(buf);
    // encryption bit toggled on
    if ((buf[10] & 0x20) === 0) throw new Error('encryption bit not toggled on');
    // payload should differ (most likely)
    const afterOnce = Array.from(buf.slice(8, 4 + bodyLine.length));
    assert.notDeepStrictEqual(afterOnce, before);
    // decrypt back (involutive on the encryption bit; content should transform again)
    decryptProcedure(buf);
    if ((buf[10] & 0x20) !== 0) throw new Error('encryption bit not toggled off');
    const afterTwice = Array.from(buf.slice(8, 4 + bodyLine.length));
    assert.notDeepStrictEqual(afterTwice, afterOnce);
  });
};
