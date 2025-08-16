'use strict';
const { deek, leek, align2 } = require('./utils/binary');
const { buildCoreTokenTable } = require('./amos/tokenTable');

// Token constants
const TK_VAR = 0x0006;
const TK_LAB = 0x000C;
const TK_PRO = 0x0012;
const TK_LGO = 0x0018;
const TK_BIN = 0x001E;
const TK_CH1 = 0x0026;
const TK_CH2 = 0x002E;
const TK_HEX = 0x0036;
const TK_ENT = 0x003E;
const TK_FLT = 0x0046;
const TK_EXT = 0x004E;
const TK_REM1 = 0x064A;
const TK_REM2 = 0x0652;
const TK_FOR  = 0x023C;
const TK_RPT  = 0x0250;
const TK_WHL  = 0x0268;
const TK_DO   = 0x027E;
const TK_IF   = 0x02BE;
const TK_ELSE = 0x02D0;
const TK_DATA = 0x0404;
const TK_ELSIF= 0x25A4; // AMOS Pro
const TK_ON   = 0x0316;
const TK_PROC = 0x0376;

function parseHeader(buf) {
  if (buf.length < 20) throw new Error('Buffer too small');
  const sig = String.fromCharCode(...buf.subarray(0,4));
  // We accept any text; srclen at 16 is authoritative
  const srclen = leek(buf, 16);
  const srcStart = 20;
  const srcEnd = Math.min(buf.length, srcStart + srclen);
  return { src: new Uint8Array(buf.subarray(srcStart, srcEnd)) };
}

function readVarLike(src, off, token) {
  // Format: token(2) then 2 bytes unk, 1 byte len, 1 byte flags, then name padded to even, null-terminated.
  const length = src[off + 2];
  const flags = src[off + 3];
  const nameBytes = src.slice(off + 4, off + 4 + length);
  const name = String.fromCharCode(...nameBytes);
  const size = ((length & 1) ? 5 : 4) + length; // as in listamos
  return { kind: token, name, flags, size };
}

function readConst(src, off, token) {
  switch (token) {
    case TK_BIN: return { size: 4, value: leek(src, off) };
    case TK_CH1: {
      const len = deek(src, off);
      const s = String.fromCharCode(...src.slice(off + 2, off + 2 + len));
      return { size: len + 2 + (len & 1 ? 1 : 0), value: s };
    }
    case TK_CH2: {
      const len = deek(src, off);
      const s = String.fromCharCode(...src.slice(off + 2, off + 2 + len));
      return { size: len + 2 + (len & 1 ? 1 : 0), value: s };
    }
    case TK_HEX: return { size: 4, value: leek(src, off) };
    case TK_ENT: return { size: 4, value: (leek(src, off) | 0) };
    case TK_FLT: return { size: 4, value: leek(src, off) }; // raw, not IEEE
    default: return { size: 0 };
  }
}

function buildTokenTable(rootDir) {
  // Core only for now
  return buildCoreTokenTable(rootDir);
}

function keyForToken(token, src, off) {
  if (token === TK_EXT) {
    const slot = src[off] >>> 0; // 1..25
    const offs = deek(src, off + 2) >>> 0;
    return ((slot << 16) | offs) >>> 0;
  } else {
    return token >>> 0; // slot 0
  }
}

// IR opcodes
// PRINT {args:[literal|string|varName]}
// GOTO {label}
// GOSUB {label}
// RETURN
// END
// LABEL {name}
// FOR {var, from, to, step, loopStartIp}
// NEXT {var, forIp}

function parseSourceToIR(buf, options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const tokTable = buildTokenTable(rootDir);
  const { src } = parseHeader(buf);
  const ir = [];
  const labels = new Map();
  const pendingLabelRefs = []; // {ip, kind:'GOTO'|'GOSUB', name}
  const forStack = []; // for matching with NEXT tokens by name

  for (let inpos = 0, lineIndex = 0; inpos < src.length; lineIndex++) {
    const lineStart = inpos;
    const linelen = (src[inpos] || 0) * 2;
    if (linelen === 0) break; // bad data
    const endline = lineStart + linelen;
    const indent = src[inpos + 1] || 0;
    inpos += 2; // move past len+indent

    let p = inpos;
    // Keep a simple statement builder
    while (p < endline) {
      const token = deek(src, p - 2 + 2); // actually p points to tokens already
      // But since we track p as pointer to tokens area, we need to read directly
      const tk = deek(src, p);
      if (tk === 0) { p += 2; break; }
      p += 2;

      if (tk <= TK_LGO) {
        const v = readVarLike(src, p - 2, tk);
        p += v.size;
        if (tk === TK_LAB) {
          // label definition at start of line or mid-line
          labels.set(v.name.toUpperCase(), ir.length); // next ip
          ir.push({ op: 'LABEL', name: v.name.toUpperCase(), lineIndex });
        }
        // other variable-like tokens handled as part of following ops
        continue;
      } else if (tk < TK_EXT || tk === 0x2B6A) {
        const c = readConst(src, p, tk);
        p += c.size;
        // constants are arguments to preceding ops (handled inline below)
        continue;
      } else {
        // General token: look up name
        const key = keyForToken(tk, src, p);
        if (tk === TK_EXT) p += 4; // consumed ext token payload
        const ent = tokTable.get(key);
        const name = ent ? ent.name : `UNK_${(key>>>16)}_${(key&0xffff).toString(16)}`;
        const upper = name.toUpperCase();
        if (upper === 'PRINT') {
          // Very minimal: expect a string or number constant next
          const nextTk = deek(src, p);
          let arg = null;
          if (nextTk === TK_CH1 || nextTk === TK_CH2) {
            p += 2;
            const c = readConst(src, p, nextTk);
            arg = c.value;
            p += c.size;
          } else if (nextTk === TK_ENT) {
            p += 2;
            const c = readConst(src, p, nextTk);
            arg = String(c.value);
            p += c.size;
          }
          ir.push({ op: 'PRINT', args: arg != null ? [arg] : [], lineIndex });
        } else if (upper === 'GOTO') {
          // Next token must be label ref
          const nextTk = deek(src, p);
          if (nextTk === TK_LGO) {
            p += 2;
            const v = readVarLike(src, p, nextTk);
            p += v.size;
            ir.push({ op: 'GOTO', label: v.name.toUpperCase(), lineIndex });
            pendingLabelRefs.push({ ip: ir.length - 1, kind: 'GOTO', name: v.name.toUpperCase() });
          }
        } else if (upper === 'GOSUB') {
          const nextTk = deek(src, p);
          if (nextTk === TK_LGO) {
            p += 2;
            const v = readVarLike(src, p, nextTk);
            p += v.size;
            ir.push({ op: 'GOSUB', label: v.name.toUpperCase(), lineIndex });
            pendingLabelRefs.push({ ip: ir.length - 1, kind: 'GOSUB', name: v.name.toUpperCase() });
          }
        } else if (upper === 'RETURN') {
          ir.push({ op: 'RETURN', lineIndex });
        } else if (upper === 'END') {
          ir.push({ op: 'END', lineIndex });
        } else if (tk === TK_FOR) {
          // Support very limited: FOR <var> = <int> TO <int> [STEP <int>]
          // After FOR, expect variable token TK_VAR
          const varTk = deek(src, p);
          if (varTk === TK_VAR) {
            p += 2;
            const vref = readVarLike(src, p, varTk);
            p += vref.size;
            const eqTk = deek(src, p); // expect '=' token name
            // skip '=' if present by looking up name
            if (eqTk >= TK_EXT || eqTk < TK_EXT) {
              const key2 = keyForToken(eqTk, src, p + 2);
              const ent2 = tokTable.get(key2);
              const name2 = ent2 ? ent2.name.toUpperCase() : '';
              // move past this token payload if extension
              if (eqTk === TK_EXT) p += 4; // after reading deek only; adjust minimal
              p += 2; // consume token code itself
              if (name2 !== '=') {
                // roll back token consumption failure safety
              }
            }
            // read start int const
            let from = 0, to = 0, step = 1;
            if (deek(src, p) === TK_ENT) {
              p += 2; const c1 = readConst(src, p, TK_ENT); from = c1.value|0; p += c1.size;
            }
            // expect TO
            const toTk = deek(src, p);
            const kTo = keyForToken(toTk, src, p + 2);
            const entTo = tokTable.get(kTo); const nameTo = entTo ? entTo.name.toUpperCase() : '';
            if (toTk === TK_EXT) p += 4; p += 2;
            if (nameTo !== 'TO') {
              // not recognized; skip building FOR
            } else {
              if (deek(src, p) === TK_ENT) { p += 2; const c2 = readConst(src, p, TK_ENT); to = c2.value|0; p += c2.size; }
              // optional STEP
              const stepTk = deek(src, p);
              const kS = keyForToken(stepTk, src, p + 2);
              const entS = tokTable.get(kS); const nameS = entS ? entS.name.toUpperCase() : '';
              if (stepTk === TK_EXT) p += 4;
              if (nameS === 'STEP') { p += 2; if (deek(src, p) === TK_ENT) { p += 2; const c3 = readConst(src, p, TK_ENT); step = c3.value|0; p += c3.size; } }
              ir.push({ op: 'FOR', var: vref.name.toUpperCase(), from, to, step, lineIndex });
              forStack.push({ name: vref.name.toUpperCase(), ip: ir.length - 1 });
            }
          }
        } else if (upper === 'NEXT') {
          // NEXT [var]
          let varName = null;
          const t = deek(src, p);
          if (t === TK_VAR) { p += 2; const vref = readVarLike(src, p, t); p += vref.size; varName = vref.name.toUpperCase(); }
          // match to top of forStack (best-effort)
          let matchIp = null;
          for (let i = forStack.length - 1; i >= 0; i--) {
            if (!varName || forStack[i].name === varName) { matchIp = forStack[i].ip; break; }
          }
          ir.push({ op: 'NEXT', var: varName, forIp: matchIp, lineIndex });
        } else if (tk === TK_REM1 || tk === TK_REM2) {
          // skip remark payload
          const len = src[p + 1] || 0; p += 2 + len + (len & 1 ? 1 : 0);
          ir.push({ op: 'REM', lineIndex });
        } else if (tk === TK_PROC) {
          // Skip PROC metadata
          p += 8; ir.push({ op: 'PROC', lineIndex });
        } else {
          // Unknown token: ignore for now
        }
      }
    }

    inpos = endline;
  }

  // Resolve GOTO/GOSUB labels (best-effort)
  for (const ref of pendingLabelRefs) {
    const target = labels.get(ref.name);
    if (target != null) ir[ref.ip].target = target;
  }

  return { ir, labels };
}

module.exports = { parseSourceToIR };

