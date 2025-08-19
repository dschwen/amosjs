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
  it('delegates CALL and CMD to io hooks and supports generic func calls', () => {
    const ir = [];
    // CALL MyProc(1,2)
    ir.push({ op: 'CALL', name: 'MYPROC', args: [ {type:'num', value:1}, {type:'num', value:2} ] });
    // PRINT MyFunc(3,4)
    ir.push({ op: 'PRINT', expr: { type:'call', name:'MYFUNC', args:[{type:'num', value:3},{type:'num', value:4}] } });
    // Hslider 10,20 To 30
    ir.push({ op: 'CMD', name: 'HSLIDER', parts: [ { keyword:null, args:[{type:'num', value:10},{type:'num', value:20}] }, { keyword:'TO', args:[{type:'num', value:30}] } ] });
    ir.push({ op: 'END' });

    const js = generateJS(ir);
    const calls = [];
    const cmds = [];
    const out = [];
    const io = {
      print: (s) => out.push(String(s)),
      func: (name, args) => { calls.push({ kind:'func', name, args }); return `R(${args.join('+')})`; },
      call: (name, args) => { calls.push({ kind:'call', name, args }); },
      cmd: (name, parts) => { cmds.push({ name, parts }); },
    };
    runGenerated(js, io);
    assert.deepStrictEqual(out, ['R(3+4)']);
    assert.deepStrictEqual(calls, [
      { kind:'call', name:'MYPROC', args:[1,2] },
      { kind:'func', name:'MYFUNC', args:[3,4] },
    ]);
    assert.strictEqual(cmds.length, 1);
    assert.strictEqual(cmds[0].name, 'HSLIDER');
    assert.deepStrictEqual(cmds[0].parts, [
      { keyword: null, args: [10,20] },
      { keyword: 'TO', args: [30] },
    ]);
  });
};

