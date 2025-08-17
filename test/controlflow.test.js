'use strict';
const assert = require('assert');
const { generateJS } = require('../src/codegen');

// Helper to run generated code to completion by patching setTimeout to sync
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
  it('covers LABEL/GOTO/GOSUB/RETURN/FOR/NEXT/END flow', () => {
    // IR program:
    // 0: LABEL START
    // 1: FOR I = 1 TO 3 STEP 1
    // 2: PRINT "LOOP"
    // 3: NEXT I
    // 4: GOSUB SUB
    // 5: PRINT "AFTER"
    // 6: GOTO END
    // 7: LABEL SUB
    // 8: PRINT "SUB"
    // 9: RETURN
    // 10: LABEL END
    // 11: END
    const ir = [];
    ir.push({ op: 'LABEL', name: 'START' }); // 0
    ir.push({ op: 'FOR', var: 'I', from: 1, to: 3, step: 1 }); // 1
    ir.push({ op: 'PRINT', args: ['LOOP'] }); // 2
    ir.push({ op: 'NEXT', var: 'I', forIp: 1 }); // 3
    ir.push({ op: 'GOSUB', label: 'SUB', target: 7 }); // 4
    ir.push({ op: 'PRINT', args: ['AFTER'] }); // 5
    ir.push({ op: 'GOTO', label: 'END', target: 10 }); // 6
    ir.push({ op: 'LABEL', name: 'SUB' }); // 7
    ir.push({ op: 'PRINT', args: ['SUB'] }); // 8
    ir.push({ op: 'RETURN' }); // 9
    ir.push({ op: 'LABEL', name: 'END' }); // 10
    ir.push({ op: 'END' }); // 11

    const js = generateJS(ir);
    const out = [];
    runGenerated(js, { print: (s) => out.push(String(s)) });
    assert.deepStrictEqual(out, ['LOOP','LOOP','LOOP','SUB','AFTER']);
  });
};

