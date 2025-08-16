'use strict';

function deek(buf, off) {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function leek(buf, off) {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

function align2(n) {
  return (n + 1) & ~1;
}

module.exports = { deek, leek, align2 };

