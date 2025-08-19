'use strict';
const { parseSourceToIR } = require('./loader');
const { generateJS } = require('./codegen');
const { createDefaultIO } = require('./runtime/default_io');

function transpile(buf, opts = {}) {
  const { ir, labels } = parseSourceToIR(new Uint8Array(buf), { rootDir: process.cwd() });
  const program = generateJS(ir);
  // Wrap into a module exposing createRunner
  const code = program + '\nmodule.exports = { createRunner };\n';
  return { code, metadata: { irLength: ir.length, labels: Array.from(labels.keys()) } };
}

async function run(buf, opts = {}) {
  const { code } = transpile(buf, opts);
  const module = { exports: {} };
  const fn = new Function('module', 'exports', code);
  fn(module, module.exports);
  const io = (opts && opts.io) || createDefaultIO();
  const runner = module.exports.createRunner(io);
  runner.run();
}

module.exports = { transpile, run };
