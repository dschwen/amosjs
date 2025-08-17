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
  let nameBytes = src.slice(off + 4, off + 4 + length);
  // Trim at first NUL within declared length, if any
  let cut = nameBytes.indexOf(0);
  if (cut !== -1) nameBytes = nameBytes.slice(0, cut);
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

// -------- Expression parsing (minimal) ---------
// AST nodes: {type:'num'|'str'|'var'|'binary'|'unary', ...}
const OP_PRECEDENCE = new Map([
  ['OR', 1],
  ['AND', 2],
  ['=', 3], ['<>', 3], ['<', 3], ['>', 3], ['<=', 3], ['>=', 3],
  ['+', 4], ['-', 4],
  ['*', 5], ['/', 5]
]);

function tokenName(src, p, tk, tokTable) {
  if (tk === 0) return { name: null, adv: 0 };
  if (tk === TK_EXT) {
    const key = keyForToken(tk, src, p);
    const ent = tokTable.get(key);
    return { name: ent ? ent.name.toUpperCase() : null, adv: 4 };
  } else {
    const key = keyForToken(tk, src, p);
    const ent = tokTable.get(key);
    return { name: ent ? ent.name.toUpperCase() : null, adv: 0 };
  }
}

function parsePrimary(src, cursor, end, tokTable) {
  if (cursor.p >= end) return null;
  const tk = deek(src, cursor.p);
  if (tk === 0) return null;
  cursor.p += 2;
  if (tk <= TK_LGO) {
    const v = readVarLike(src, cursor.p, tk);
    cursor.p += v.size;
    if (tk === TK_VAR) return { type: 'var', name: v.name.toUpperCase() };
    return null;
  } else if (tk < TK_EXT || tk === 0x2B6A) {
    if (tk === TK_ENT) { const c = readConst(src, cursor.p, tk); cursor.p += c.size; return { type: 'num', value: Number(c.value|0) }; }
    if (tk === TK_CH1 || tk === TK_CH2) { const c = readConst(src, cursor.p, tk); cursor.p += c.size; return { type: 'str', value: String(c.value) }; }
    const c = readConst(src, cursor.p, tk); cursor.p += c.size; return null;
  } else {
    const { name, adv } = tokenName(src, cursor.p, tk, tokTable);
    cursor.p += adv;
    if (name === '(') {
      const expr = parseExpression(src, cursor, end, tokTable, 0);
      // consume closing ')'
      const tk2 = deek(src, cursor.p); cursor.p += 2; const t2 = tokenName(src, cursor.p, tk2, tokTable); cursor.p += t2.adv;
      return expr;
    }
    if (name === 'NOT') {
      const rhs = parsePrimary(src, cursor, end, tokTable);
      return { type: 'unary', op: 'NOT', expr: rhs };
    }
    // Generic function call: NAME '(' args ')' -> {type:'call', name, args}
    const nextTk = deek(src, cursor.p);
    const tNext = tokenName(src, cursor.p + 2, nextTk, tokTable);
    if (tNext.name === '(') {
      cursor.p += 2 + (nextTk === TK_EXT ? 4 : 0); // consume '('
      const args = [];
      while (cursor.p < end) {
        const arg = parseExpression(src, cursor, end, tokTable, 0);
        if (arg) args.push(arg);
        const sepTk = deek(src, cursor.p);
        const tSep = tokenName(src, cursor.p + 2, sepTk, tokTable);
        if (tSep.name === ',') {
          cursor.p += 2 + (sepTk === TK_EXT ? 4 : 0);
          continue;
        }
        break;
      }
      const closeTk = deek(src, cursor.p); cursor.p += 2; const tClose = tokenName(src, cursor.p, closeTk, tokTable); cursor.p += tClose.adv;
      return { type: 'call', name, args };
    }
    return null;
  }
}

function parseBinRhs(src, cursor, end, tokTable, exprPrec, lhs) {
  for (;;) {
    const save = cursor.p;
    const tk = deek(src, cursor.p);
    if (tk === 0) return lhs;
    const t = tokenName(src, cursor.p + 2, tk, tokTable); // name lookup without bumping p yet
    // consume tk now
    cursor.p += 2 + (tk === TK_EXT ? 4 : 0);
    if (!t.name || !OP_PRECEDENCE.has(t.name)) { cursor.p = save; return lhs; }
    const prec = OP_PRECEDENCE.get(t.name);
    if (prec < exprPrec) { cursor.p = save; return lhs; }

    let rhs = parsePrimary(src, cursor, end, tokTable);
    if (!rhs) return lhs;
    for (;;) {
      const nextTk = deek(src, cursor.p);
      const look = tokenName(src, cursor.p + 2, nextTk, tokTable);
      const nextPrec = look.name ? (OP_PRECEDENCE.get(look.name) || -1) : -1;
      if (nextPrec > prec) {
        rhs = parseBinRhs(src, cursor, end, tokTable, prec + 1, rhs);
      } else break;
    }
    lhs = { type: 'binary', op: t.name, left: lhs, right: rhs };
  }
}

function parseExpression(src, cursor, end, tokTable, minPrec = 0) {
  const lhs = parsePrimary(src, cursor, end, tokTable);
  if (!lhs) return null;
  return parseBinRhs(src, cursor, end, tokTable, minPrec, lhs);
}

// ---- Token handlers ----

function handlePrint(state) {
  let { src, p, ir, lineIndex, endline, tokTable } = state;
  // Allow multiple comma/semicolon separated expressions
  do {
    const cursor = { p };
    const ast = parseExpression(src, cursor, endline, tokTable, 0);
    p = cursor.p;
    if (ast) ir.push({ op: 'PRINT', expr: ast, lineIndex });
    else ir.push({ op: 'PRINT', args: [], lineIndex });
    const sepTk = deek(src, p);
    const tSep = tokenName(src, p + 2, sepTk, tokTable);
    if (!tSep.name || (tSep.name !== ',' && tSep.name !== ';')) break;
    p += 2 + (sepTk === TK_EXT ? 4 : 0);
  } while (p < endline);
  return p;
}

function handleGoto(state) {
  let { src, p, ir, pendingLabelRefs, lineIndex } = state;
  const nextTk = deek(src, p);
  if (nextTk === TK_LGO) {
    p += 2;
    const v = readVarLike(src, p, nextTk);
    p += v.size;
    ir.push({ op: 'GOTO', label: v.name.toUpperCase(), lineIndex });
    pendingLabelRefs.push({ ip: ir.length - 1, kind: 'GOTO', name: v.name.toUpperCase() });
  }
  return p;
}

function handleGosub(state) {
  let { src, p, ir, pendingLabelRefs, lineIndex } = state;
  const nextTk = deek(src, p);
  if (nextTk === TK_LGO) {
    p += 2;
    const v = readVarLike(src, p, nextTk);
    p += v.size;
    ir.push({ op: 'GOSUB', label: v.name.toUpperCase(), lineIndex });
    pendingLabelRefs.push({ ip: ir.length - 1, kind: 'GOSUB', name: v.name.toUpperCase() });
  }
  return p;
}

function handleReturn(state) {
  const { ir, lineIndex } = state;
  ir.push({ op: 'RETURN', lineIndex });
  return state.p;
}

function handleEnd(state) {
  const { ir, lineIndex } = state;
  ir.push({ op: 'END', lineIndex });
  return state.p;
}

function handleFor(state) {
  let { src, p, ir, tokTable, forStack, lineIndex } = state;
  const varTk = deek(src, p);
  if (varTk === TK_VAR) {
    p += 2;
    const vref = readVarLike(src, p, varTk);
    p += vref.size;
    const eqTk = deek(src, p);
    if (eqTk >= 0) {
      const key2 = keyForToken(eqTk, src, p + 2);
      const ent2 = tokTable.get(key2);
      const name2 = ent2 ? ent2.name.toUpperCase() : '';
      if (eqTk === TK_EXT) p += 4;
      p += 2;
      if (name2 !== '=') {
        // unmatched, leave p as-is
      }
    }
    let from = 0, to = 0, step = 1;
    if (deek(src, p) === TK_ENT) {
      p += 2; const c1 = readConst(src, p, TK_ENT); from = c1.value|0; p += c1.size;
    }
    const toTk = deek(src, p);
    const kTo = keyForToken(toTk, src, p + 2);
    const entTo = tokTable.get(kTo); const nameTo = entTo ? entTo.name.toUpperCase() : '';
    if (toTk === TK_EXT) p += 4; p += 2;
    if (nameTo === 'TO') {
      if (deek(src, p) === TK_ENT) { p += 2; const c2 = readConst(src, p, TK_ENT); to = c2.value|0; p += c2.size; }
      const stepTk = deek(src, p);
      const kS = keyForToken(stepTk, src, p + 2);
      const entS = tokTable.get(kS); const nameS = entS ? entS.name.toUpperCase() : '';
      if (stepTk === TK_EXT) p += 4;
      if (nameS === 'STEP') {
        p += 2; if (deek(src, p) === TK_ENT) { p += 2; const c3 = readConst(src, p, TK_ENT); step = c3.value|0; p += c3.size; }
      }
      ir.push({ op: 'FOR', var: vref.name.toUpperCase(), from, to, step, lineIndex });
      forStack.push({ name: vref.name.toUpperCase(), ip: ir.length - 1 });
    }
  }
  return p;
}

function handleNext(state) {
  let { src, p, ir, forStack, lineIndex } = state;
  let varName = null;
  const t = deek(src, p);
  if (t === TK_VAR) { p += 2; const vref = readVarLike(src, p, t); p += vref.size; varName = vref.name.toUpperCase(); }
  let matchIp = null;
  for (let i = forStack.length - 1; i >= 0; i--) {
    if (!varName || forStack[i].name === varName) { matchIp = forStack[i].ip; break; }
  }
  ir.push({ op: 'NEXT', var: varName, forIp: matchIp, lineIndex });
  return p;
}

function handleRemark(state) {
  let { src, p, ir, lineIndex } = state;
  const len = src[p + 1] || 0;
  const text = String.fromCharCode(...src.slice(p + 2, p + 2 + len));
  p += 2 + len + (len & 1 ? 1 : 0);
  ir.push({ op: 'REM', text, lineIndex });
  return p;
}

function handleProc(state) {
  let { p, ir, lineIndex } = state;
  p += 8; ir.push({ op: 'PROC', lineIndex });
  return p;
}

function handleGenericCommand(state, name) {
  let { src, p, ir, endline, tokTable, lineIndex } = state;
  const parts = [];
  let current = { keyword: null, args: [] };
  parts.push(current);
  while (p < endline) {
    const cursor = { p };
    const expr = parseExpression(src, cursor, endline, tokTable, 0);
    if (expr) {
      p = cursor.p;
      current.args.push(expr);
    } else {
      const tk = deek(src, p);
      const t = tokenName(src, p + 2, tk, tokTable);
      if (!t.name || t.name === ':') break;
      p += 2 + (tk === TK_EXT ? 4 : 0);
      current = { keyword: t.name, args: [] };
      parts.push(current);
    }
    const sepTk = deek(src, p);
    const tSep = tokenName(src, p + 2, sepTk, tokTable);
    if (tSep.name === ',' || tSep.name === ';') {
      p += 2 + (sepTk === TK_EXT ? 4 : 0);
      continue;
    }
  }
  ir.push({ op: 'CMD', name, parts, lineIndex });
  return p;
}

const NAME_HANDLERS = new Map([
  ['PRINT', handlePrint],
  ['GOTO', handleGoto],
  ['GOSUB', handleGosub],
  ['RETURN', handleReturn],
  ['END', handleEnd],
  ['FOR', handleFor],
  ['NEXT', handleNext],
]);

const CODE_HANDLERS = new Map([
  [TK_REM1, handleRemark],
  [TK_REM2, handleRemark],
  [TK_PROC, handleProc],
]);

// IR opcodes (for reference)
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
  const tokTable = options.tokTable || buildTokenTable(rootDir);
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
      const tk = deek(src, p);
      if (tk === 0) { p += 2; break; }
      p += 2;

      if (tk <= TK_LGO) {
        const v = readVarLike(src, p, tk);
        p += v.size;
        if (tk === TK_LAB) {
          labels.set(v.name.toUpperCase(), ir.length);
          ir.push({ op: 'LABEL', name: v.name.toUpperCase(), lineIndex });
        }
        continue;
      } else if (tk < TK_EXT || tk === 0x2B6A) {
        const c = readConst(src, p, tk);
        p += c.size;
        continue;
      } else {
        const codeHandler = CODE_HANDLERS.get(tk);
        if (codeHandler) {
          p = codeHandler({ src, p, ir, lineIndex, endline, tokTable, pendingLabelRefs, forStack });
          continue;
        }
        const key = keyForToken(tk, src, p);
        const nameStart = p - 2; // beginning of this token
        if (tk === TK_EXT) p += 4;
        const ent = tokTable.get(key);
        const name = ent ? ent.name : `UNK_${(key>>>16)}_${(key&0xffff).toString(16)}`;
        const upper = name.toUpperCase();
        const handler = NAME_HANDLERS.get(upper);
        if (handler) {
          p = handler({ src, p, ir, lineIndex, endline, tokTable, pendingLabelRefs, forStack });
        } else {
          const lookTk = deek(src, p);
          const look = tokenName(src, p + 2, lookTk, tokTable);
          if (look.name === '(') {
            const cursor = { p: nameStart };
            const expr = parseExpression(src, cursor, endline, tokTable, 0);
            p = cursor.p;
            if (expr && expr.type === 'call') {
              ir.push({ op: 'CALL', name: expr.name, args: expr.args, lineIndex });
            } else if (expr) {
              ir.push({ op: 'EXPR', expr, lineIndex });
            }
          } else {
            p = handleGenericCommand({ src, p, ir, lineIndex, endline, tokTable, pendingLabelRefs, forStack }, upper);
          }
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
