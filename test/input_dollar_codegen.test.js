'use strict';
const assert = require('assert');
const { generateJS } = require('../src/codegen');

function runGenerated(js, io) {
  const originalSetTimeout = global.setTimeout;
  try {
    let guard = 0;
    global.setTimeout = (fn) => { if (guard++ > 10000) throw new Error('Loop guard exceeded'); fn(); };
    const module = { exports: {} };
    const fn = new Function('module','exports', js + '\nmodule.exports={createRunner};');
    fn(module, module.exports);
    const runner = module.exports.createRunner(io);
    runner.run();
  } finally {
    global.setTimeout = originalSetTimeout;
  }
}

module.exports = ({ it }) => {
  it('supports INPUT$ function and emits no empty lines', () => {
    const ir = [];
    ir.push({ op: 'PRINT', exprs: [{ type: 'call', name: 'INPUT$', args: [] }] });
    ir.push({ op: 'END' });
    const js = generateJS(ir);
    const out = [];
    runGenerated(js, { print: (s)=>out.push(String(s)), input: ()=> 'hi' });
    assert.deepStrictEqual(out, ['hi']);
    assert(!js.split('\n').some(line => line.trim() === ''));
  });
};
