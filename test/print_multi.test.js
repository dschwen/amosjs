'use strict';
const assert = require('assert');
const { generateJS } = require('../src/codegen');

// Helper to run generated code synchronously
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
  it('prints multiple args from a single PRINT', () => {
    const ir = [];
    ir.push({ op: 'PRINT', args: ['HELLO', 'WORLD'] });
    const js = generateJS(ir);
    const out = [];
    runGenerated(js, { print: (s) => out.push(String(s)) });
    assert.deepStrictEqual(out, ['HELLO', 'WORLD']);
  });

  it('prints multiple expressions from exprs', () => {
    const ir = [];
    ir.push({ op: 'PRINT', exprs: [ { type:'num', value:1 }, { type:'num', value:2 } ] });
    const js = generateJS(ir);
    const out = [];
    runGenerated(js, { print: (s) => out.push(String(s)) });
    assert.deepStrictEqual(out, ['1', '2']);
  });
};
