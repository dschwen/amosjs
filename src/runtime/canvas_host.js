'use strict';

// Simple ASCII canvas host with plotting and line drawing.

function createCanvasHost(width = 40, height = 20, opts = {}) {
  const w = Math.max(1, width|0);
  const h = Math.max(1, height|0);
  const palette = (opts.palette && Array.isArray(opts.palette)) ? opts.palette : [' ', '.', ':', '-', '=', '+', '*', '#', '%', '@'];
  let inkIdx = 7; // default visible color
  let paperIdx = 0; // background
  const rows = new Array(h);
  for (let y = 0; y < h; y++) rows[y] = new Array(w).fill(paperIdx);

  function inBounds(x, y){ return x >= 0 && y >= 0 && x < w && y < h; }

  function clear(){
    for (let y = 0; y < h; y++) rows[y].fill(paperIdx);
  }
  function ink(c){ if (typeof c === 'number') inkIdx = Math.max(0, Math.min(palette.length - 1, c|0)); }
  function paper(c){ if (typeof c === 'number') paperIdx = Math.max(0, Math.min(palette.length - 1, c|0)); }
  function print(s){ /* no-op by default; external tests can override */ }

  function plot(x, y){
    x = x|0; y = y|0;
    if (inBounds(x,y)) rows[y][x] = inkIdx;
  }

  function line(x1, y1, x2, y2){
    x1|=0; y1|=0; x2|=0; y2|=0;
    // Bresenham
    let dx = Math.abs(x2 - x1), sx = x1 < x2 ? 1 : -1;
    let dy = -Math.abs(y2 - y1), sy = y1 < y2 ? 1 : -1;
    let err = dx + dy;
    for(;;){
      plot(x1, y1);
      if (x1 === x2 && y1 === y2) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x1 += sx; }
      if (e2 <= dx) { err += dx; y1 += sy; }
    }
  }

  function rect(x1, y1, x2, y2){
    x1|=0; y1|=0; x2|=0; y2|=0;
    // Normalize
    if (x1 > x2) { const t = x1; x1 = x2; x2 = t; }
    if (y1 > y2) { const t = y1; y1 = y2; y2 = t; }
    for (let x = x1; x <= x2; x++) { plot(x, y1); plot(x, y2); }
    for (let y = y1; y <= y2; y++) { plot(x1, y); plot(x2, y); }
  }

  function circle(cx, cy, r){
    cx|=0; cy|=0; r = Math.max(0, r|0);
    // Midpoint circle algorithm (outline)
    let x = r; let y = 0; let err = 0;
    while (x >= y) {
      plot(cx + x, cy + y); plot(cx + y, cy + x);
      plot(cx - y, cy + x); plot(cx - x, cy + y);
      plot(cx - x, cy - y); plot(cx - y, cy - x);
      plot(cx + y, cy - x); plot(cx + x, cy - y);
      y += 1; err += 1 + 2*y;
      if (2*(err - x) + 1 > 0) { x -= 1; err += 1 - 2*x; }
    }
  }

  function toString(){
    return rows.map(r => r.map(idx => palette[idx] || ' ').join('')).join('\n');
  }

  function getBuffer(){ return rows.map(r => r.slice()); }

  function toPPM(){
    // ASCII PPM (P3), grayscale from palette index
    const maxc = palette.length > 1 ? (palette.length - 1) : 1;
    const lines = [];
    lines.push('P3');
    lines.push(`${w} ${h}`);
    lines.push('255');
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x = 0; x < w; x++) {
        const idx = rows[y][x] | 0;
        const v = Math.round((idx / maxc) * 255);
        row.push(`${v} ${v} ${v}`);
      }
      lines.push(row.join(' '));
    }
    return lines.join('\n');
  }

  return { width: w, height: h, print, clear, ink, paper, plot, line, rect, circle, toString, getBuffer, toPPM };
}

module.exports = { createCanvasHost };
