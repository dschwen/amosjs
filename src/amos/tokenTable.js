'use strict';
const fs = require('fs');
const path = require('path');
const { deek, leek } = require('../utils/binary');

// Parse C header file containing: unsigned char ext00_base [] = { 0x.., ... };
function loadBaseExtensionBytes(rootDir) {
  const hdr = fs.readFileSync(path.join(rootDir, 'background/amostools/extensions/00_base.h'), 'utf8');
  const m = hdr.match(/ext00_base\s*\[\s*\]\s*=\s*\{([\s\S]*?)\}/);
  if (!m) throw new Error('Could not locate ext00_base array in 00_base.h');
  const body = m[1];
  const bytes = [];
  for (const tok of body.split(/[,\s\n\r]+/)) {
    if (!tok) continue;
    if (/^0x[0-9a-fA-F]+$/.test(tok)) {
      bytes.push(parseInt(tok, 16) & 0xff);
    } else if (/^\d+$/.test(tok)) {
      bytes.push(parseInt(tok, 10) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

// Minimal port of AMOS_parse_extension for token names/types
function parseExtension(src, slot = 0, start = 6) {
  const len = src.length;
  if (len < 54) throw new Error('Extension too small');
  if (leek(src, 0) !== 0x3f3 || leek(src, 24) !== 0x3e9) throw new Error('Not an AMIGA hunk file');
  let tkoff = (leek(src, 32) >>> 0) + 32 + 18;
  if (leek(src, 32 + 18) === 0x41503230) tkoff += 4; // AP20
  if (tkoff > len) throw new Error('Bad token table offset');
  const tokens = new Map();
  let p = tkoff + start;
  while ((p + 2) < len) {
    const key = ((slot << 16) | (((p - 0) - tkoff) & 0xffff)) >>> 0;
    if (deek(src, p) === 0) break; // end of list
    p += 4;
    let pnameStart = p;
    while (p < len && src[p] < 0x80) p++;
    if (p >= len) break;
    const pnameEnd = p; // p points to last char with high bit set
    p++;
    const type = src[p] || 0;
    // skip parameters until >= 0xFD
    while (p < len && src[p] < 0xFD) p++;
    p++;
    if ((p & 1) === 1) p++;
    // Decode name bytes with last char stripped of high bit
    const arr = Array.from(src.slice(pnameStart, pnameEnd + 1)).map((b, i, a) => (i === a.length - 1 ? (b & 0x7f) : b));
    const name = String.fromCharCode(...arr).replace(/\s+$/,'');
    tokens.set(key, { name, type });
  }
  return tokens;
}

// Build a lookup for core tokens using 00_base.h
function buildCoreTokenTable(rootDir) {
  const bytes = loadBaseExtensionBytes(rootDir);
  const tokens = parseExtension(bytes, 0, 6);
  return tokens; // Map key-> {name,type}
}

module.exports = { buildCoreTokenTable, parseExtension, loadBaseExtensionBytes };

