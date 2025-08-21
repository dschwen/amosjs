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
  it('draws BOX and CIRCLE; PPM has correct header', () => {
    const ir = [];
    // INK 9 for high-contrast
    ir.push({ op: 'CMD', name: 'INK', parts: [ { keyword:null, args:[{type:'num', value:9}] } ] });
    // BOX 1,1 To 5,3
    ir.push({ op: 'CMD', name: 'BOX', parts: [ { keyword:null, args:[{type:'num', value:1}, {type:'num', value:1}] }, { keyword:'TO', args:[{type:'num', value:5}, {type:'num', value:3}] } ] });
    // CIRCLE 8,2,1
    ir.push({ op: 'CMD', name: 'CIRCLE', parts: [ { keyword:null, args:[{type:'num', value:8}, {type:'num', value:2}, {type:'num', value:1}] } ] });
    ir.push({ op: 'END' });

    const js = generateJS(ir);
    const host = createCanvasHost(12, 5);
    const io = createDefaultIO(host);
    runGenerated(js, io);
    const buf = host.getBuffer();
    // Corners of the box
    assert.ok(buf[1][1] !== 0 && buf[3][5] !== 0);
    // Circle points should mark at least 4 positions around (8,2)
    const points = [ [9,2],[7,2],[8,1],[8,3] ];
    assert.ok(points.every(([x,y]) => buf[y] && buf[y][x] && buf[y][x] !== 0));
    // PPM header
    const ppm = host.toPPM();
    console.log(host.toString());
    const lines = ppm.split('\n');
    assert.strictEqual(lines[0], 'P3');
    assert.strictEqual(lines[1], '12 5');
    assert.strictEqual(lines[2], '255');
  });
};

