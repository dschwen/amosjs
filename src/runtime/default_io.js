'use strict';

// Minimal default IO/runtime shims for generic AMOS commands/functions.
// Consumers can pass a host with callbacks to observe or implement side effects.
// host API (optional):
// - log(msg)
// - print(str)
// - input(prompt?) -> string
// - clear()
// - ink(color)
// - paper(color)
// - hslider(config|parts)

function createDefaultIO(host = {}) {
  const log = (host && host.log) || ((...a) => { if (typeof console !== 'undefined') console.log(...a); });
  const printOut = (host && host.print) || ((s) => { if (typeof process !== 'undefined' && process.stdout) process.stdout.write(String(s)); else log(String(s)); });
  const readIn = (host && host.input) || (() => '');

  function print(s) { printOut(String(s)); }
  function input(prompt) { return readIn(prompt); }

  function func(name, args, state) {
    const n = String(name || '').toUpperCase();
    try {
      switch (n) {
        case 'LEN': return (args && args.length) ? String(args[0]).length : 0;
        case 'VAL': return (args && args.length) ? Number(args[0]) || 0 : 0;
        case 'STR$': return (args && args.length) ? String(args[0]) : '';
        default:
          // Unknown function: return 0 by default
          return 0;
      }
    } catch (e) {
      log('io.func error', n, e && e.message);
      return 0;
    }
  }

  function call(name, args, state) {
    const n = String(name || '').toUpperCase();
    try {
      switch (n) {
        default:
          // No-op by default; host may observe
          if (host && typeof host.call === 'function') host.call(n, args, state);
          break;
      }
    } catch (e) {
      log('io.call error', n, e && e.message);
    }
  }

  function cmd(name, parts, state) {
    const n = String(name || '').toUpperCase();
    try {
      switch (n) {
        case 'CLS':
          if (host && typeof host.clear === 'function') host.clear();
          break;
        case 'INK':
          if (host && typeof host.ink === 'function') host.ink(parts && parts[0] && parts[0].args ? parts[0].args[0] : undefined);
          break;
        case 'PAPER':
          if (host && typeof host.paper === 'function') host.paper(parts && parts[0] && parts[0].args ? parts[0].args[0] : undefined);
          break;
        case 'PLOT': {
          if (host && typeof host.plot === 'function') {
            const a = parts && parts[0] && parts[0].args || [];
            host.plot(a[0]|0, a[1]|0);
          }
          break;
        }
        case 'LINE': {
          if (host && typeof host.line === 'function') {
            const a0 = parts && parts[0] && parts[0].args || [];
            let x1 = a0[0]|0, y1 = a0[1]|0, x2 = x1, y2 = y1;
            const pTo = (parts || []).find(p => (p.keyword||'').toUpperCase() === 'TO');
            if (pTo && pTo.args && pTo.args.length >= 2) { x2 = pTo.args[0]|0; y2 = pTo.args[1]|0; }
            host.line(x1, y1, x2, y2);
          }
          break;
        }
        case 'BOX': {
          if (host && typeof host.rect === 'function') {
            const a0 = parts && parts[0] && parts[0].args || [];
            let x1 = a0[0]|0, y1 = a0[1]|0, x2 = x1, y2 = y1;
            const pTo = (parts || []).find(p => (p.keyword||'').toUpperCase() === 'TO');
            if (pTo && pTo.args && pTo.args.length >= 2) { x2 = pTo.args[0]|0; y2 = pTo.args[1]|0; }
            host.rect(x1, y1, x2, y2);
          }
          break;
        }
        case 'CIRCLE': {
          if (host && typeof host.circle === 'function') {
            const a0 = parts && parts[0] && parts[0].args || [];
            const cx = a0[0]|0, cy = a0[1]|0, r = (a0[2]|0);
            host.circle(cx, cy, r);
          }
          break;
        }
        case 'HSLIDER':
          if (host && typeof host.hslider === 'function') host.hslider(parts);
          break;
        default:
          if (host && typeof host.cmd === 'function') host.cmd(n, parts, state);
          break;
      }
    } catch (e) {
      log('io.cmd error', n, e && e.message);
    }
  }

  return { print, input, func, call, cmd };
}

module.exports = { createDefaultIO };
