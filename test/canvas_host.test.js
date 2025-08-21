'use strict';
const assert = require('assert');
const { generateJS } = require('../src/codegen');
const { createDefaultIO } = require('../src/runtime/default_io');
const { createCanvasHost } = require('../src/runtime/canvas_host');

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
  it('draws a horizontal line and a pixel on the canvas host', () => {
    const ir = [];
    // INK 7 (choose a visible character)
    ir.push({ op: 'CMD', name: 'INK', parts: [ { keyword:null, args:[{type:'num', value:7}] } ] });
    // LINE 0,0 To 3,0
    ir.push({ op: 'CMD', name: 'LINE', parts: [ { keyword:null, args:[{type:'num', value:0}, {type:'num', value:0}] }, { keyword:'TO', args:[{type:'num', value:3}, {type:'num', value:0}] } ] });
    // PLOT 2,2
    ir.push({ op: 'CMD', name: 'PLOT', parts: [ { keyword:null, args:[{type:'num', value:2}, {type:'num', value:2}] } ] });
    ir.push({ op: 'END' });

    const js = generateJS(ir);
    const host = createCanvasHost(5, 3); // width=5, height=3
    const io = createDefaultIO(host);
    runGenerated(js, io);
    const ascii = host.toString().split('\n');
    // Row 0 should have 4 drawn pixels at positions 0..3 (palette[7] = '#')
    assert.strictEqual(ascii[0].slice(0,4), '####');
    // Row 2, col 2 should be marked
    assert.strictEqual(ascii[2][2], '#');
  });
};

