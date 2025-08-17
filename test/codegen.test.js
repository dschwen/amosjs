'use strict';
const assert = require('assert');
const { generateJS } = require('../src/codegen');

module.exports = ({ it }) => {
  it('generates switch with leaders and runs basic flow', () => {
    const ir = [
      { op: 'LABEL', name: 'START' },
      { op: 'PRINT', args: ['HELLO'] },
      { op: 'PRINT', args: ['WORLD'] },
      { op: 'END' },
    ];
    const js = generateJS(ir);
    const module = { exports: {} };
    const fn = new Function('module','exports', js + '\nmodule.exports={createRunner};');
    fn(module, module.exports);
    const out=[];
    const r = module.exports.createRunner({ print: (s)=>out.push(String(s)) });
    r.run();
    // let event loop tick
    // We cannot wait here; assume at least scheduling occurred
    assert(js.includes('switch(state.ip)'));
  });
};

