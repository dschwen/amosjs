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
  it('lowers IF ... THEN ... ELSE via conditional branch (true case)', () => {
    // Program:
    // SET X=2
    // IF X=2 THEN goto THENLBL else fallthrough to ELSELBL
    // ELSELBL: PRINT "NO" : GOTO END
    // THENLBL: PRINT "YES"
    // END: END
    const ir = [];
    ir.push({ op: 'SET', var: 'X', value: 2 }); // 0
    ir.push({ op: 'IF_EQ', var: 'X', value: 2, target: 4 }); // 1 -> jump to THENLBL
    ir.push({ op: 'PRINT', args: ['NO'] }); // 2 ELSELBL
    ir.push({ op: 'GOTO', label: 'END', target: 6 }); // 3
    ir.push({ op: 'PRINT', args: ['YES'] }); // 4 THENLBL
    ir.push({ op: 'GOTO', label: 'END', target: 6 }); // 5 (explicit end jump for clarity)
    ir.push({ op: 'END' }); // 6 END

    const js = generateJS(ir);
    const out = [];
    runGenerated(js, { print: (s) => out.push(String(s)) });
    assert.deepStrictEqual(out, ['YES']);
  });

  it('lowers IF ... THEN ... ELSE via conditional branch (false case)', () => {
    const ir = [];
    ir.push({ op: 'SET', var: 'X', value: 1 }); // 0
    ir.push({ op: 'IF_EQ', var: 'X', value: 2, target: 4 }); // 1 (won't jump)
    ir.push({ op: 'PRINT', args: ['NO'] }); // 2
    ir.push({ op: 'GOTO', label: 'END', target: 6 }); // 3
    ir.push({ op: 'PRINT', args: ['YES'] }); // 4
    ir.push({ op: 'GOTO', label: 'END', target: 6 }); // 5
    ir.push({ op: 'END' }); // 6

    const js = generateJS(ir);
    const out = [];
    runGenerated(js, { print: (s) => out.push(String(s)) });
    assert.deepStrictEqual(out, ['NO']);
  });
};

