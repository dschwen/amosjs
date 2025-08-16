'use strict';
const { deek, leek } = require('./utils/binary');

function parseAmosHeader(buf) {
  if (buf.length < 20) throw new Error('Buffer too small for AMOS header');
  const magic = String.fromCharCode(...buf.subarray(0, 4));
  const hasMagic = magic === 'AMOS' || magic === 'AMOS';
  // Rely on the 4-byte length at offset 16 and a trailing 'AmBs' banks marker optionally
  const srclen = leek(buf, 16);
  return { header: Buffer.from(buf.subarray(0, 16)), srclen };
}

function sliceTokenizedSource(buf) {
  const { srclen } = parseAmosHeader(buf);
  const start = 20;
  const end = Math.min(buf.length, start + srclen);
  return Buffer.from(buf.subarray(start, end));
}

// Placeholder transpile API: returns stub code and validates structure
function transpile(buf, opts = {}) {
  const source = sliceTokenizedSource(buf);
  const banner = '// amosjs transpiled program (skeleton)\n';
  const code = banner + `export function runProgram(io={print:console.log}){ io.print('Transpilation not yet implemented'); }\n`;
  return { code, metadata: { bytes: source.length } };
}

// Placeholder run API: for now just transpile and eval in a VM-like Function
async function run(buf, opts = {}) {
  const { code } = transpile(buf, opts);
  const module = { exports: {} };
  // CommonJS wrapper compatible (simple)
  const fn = new Function('module', 'exports', code + '\n;module.exports = { runProgram };');
  fn(module, module.exports);
  const io = (opts && opts.io) || { print: (s) => process.stdout.write(String(s)) };
  if (module.exports && typeof module.exports.runProgram === 'function') {
    module.exports.runProgram(io);
  }
}

module.exports = { transpile, run, parseAmosHeader, sliceTokenizedSource };

