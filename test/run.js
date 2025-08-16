'use strict';
const fs = require('fs');
const path = require('path');

let failures = 0;
function it(name, fn) {
  try { fn(); console.log(`ok - ${name}`); }
  catch (e) { failures++; console.error(`not ok - ${name}`); console.error(e.stack || e); }
}

// Load all *.test.js in this directory
for (const f of fs.readdirSync(__dirname)) {
  if (f.endsWith('.test.js')) require(path.join(__dirname, f))({ it });
}

if (failures) process.exit(1);

