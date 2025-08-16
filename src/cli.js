#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { transpile, run } = require('./index');

function usage() {
  console.log('Usage: amosjs <command> <file.AMOS> [options]');
  console.log('Commands:');
  console.log('  transpile <in> -o <out.js>');
  console.log('  run <in>');
}

async function main(argv) {
  const args = argv.slice(2);
  if (args.length === 0) { usage(); process.exit(1); }
  const cmd = args[0];
  if ((cmd === 'transpile' || cmd === 'run') && !args[1]) { usage(); process.exit(1); }
  const infile = args[1];
  if (!fs.existsSync(infile)) { console.error(`No such file: ${infile}`); process.exit(1); }
  const buf = fs.readFileSync(infile);

  if (cmd === 'transpile') {
    const outIdx = args.indexOf('-o');
    const outFile = outIdx !== -1 ? args[outIdx + 1] : path.basename(infile, path.extname(infile)) + '.js';
    const { code } = transpile(buf, { filename: infile });
    fs.writeFileSync(outFile, code);
    console.log(`Wrote ${outFile}`);
  } else if (cmd === 'run') {
    await run(buf, { filename: infile, io: { print: (s) => process.stdout.write(String(s)) } });
  } else {
    usage();
    process.exit(1);
  }
}

main(process.argv).catch((e) => { console.error(e); process.exit(1); });

