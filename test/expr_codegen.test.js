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
  it('emits expressions for PRINT and respects arithmetic precedence', () => {
    const ir = [];
    // SET X=1 (use SET op supported by codegen)
    ir.push({ op: 'SET', var: 'X', value: 1 });
    // PRINT X + 2 * 3 -> 7
    ir.push({ op: 'PRINT', expr: { type:'binary', op:'+', left: {type:'var', name:'X'}, right: { type:'binary', op:'*', left: {type:'num', value:2}, right: {type:'num', value:3} } } });
    ir.push({ op: 'END' });
    const js = generateJS(ir);
    const out=[]; runGenerated(js, { print: (s)=>out.push(String(s)) });
    assert.deepStrictEqual(out, ['7']);
  });
};

