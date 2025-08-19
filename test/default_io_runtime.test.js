'use strict';
const assert = require('assert');
const { generateJS } = require('../src/codegen');
const { createDefaultIO } = require('../src/runtime/default_io');

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
  it('default IO implements simple functions and a few commands', () => {
    const ir = [];
    // PRINT LEN("abc")
    ir.push({ op: 'PRINT', expr: { type:'call', name:'LEN', args: [{type:'str', value:'abc'}] } });
    // CLS
    ir.push({ op: 'CMD', name: 'CLS', parts: [ { keyword:null, args: [] } ] });
    // Hslider 10,20 To 30
    ir.push({ op: 'CMD', name: 'HSLIDER', parts: [ { keyword:null, args:[{type:'num', value:10},{type:'num', value:20}] }, { keyword:'TO', args:[{type:'num', value:30}] } ] });
    ir.push({ op: 'END' });

    const js = generateJS(ir);
    const events = { cleared: 0, hslider: [] };
    const host = {
      print: (s) => {},
      clear: () => { events.cleared++; },
      hslider: (parts) => { events.hslider.push(parts); },
    };
    const io = createDefaultIO(host);
    const out=[];
    // Override print to capture just for this test
    io.print = (s) => out.push(String(s));
    runGenerated(js, io);
    assert.deepStrictEqual(out, ['3']);
    assert.strictEqual(events.cleared, 1);
    assert.strictEqual(events.hslider.length, 1);
    assert.strictEqual(events.hslider[0][0].args[0], 10);
  });
};

