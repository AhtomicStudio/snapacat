/**
 * Contact sheet of every prop, for eyeballing the set as a group.
 * Not shipped — inspection only.
 */
const fs = require('node:fs');
const path = require('node:path');
const { encodePNG, upscaleRGBA } = require('./png');
const { PROPS, renderProp, SIZE } = require('./props');

const COLS = 5;
const CELL = SIZE + 2;
const ids = Object.keys(PROPS);
const rows = Math.ceil(ids.length / COLS);
const W = COLS * CELL;
const H = rows * CELL;
const buf = Buffer.alloc(W * H * 4);

// Mid-grey ground so both light and dark props are readable.
for (let i = 0; i < W * H; i++) {
  buf[i * 4] = 122; buf[i * 4 + 1] = 128; buf[i * 4 + 2] = 120; buf[i * 4 + 3] = 255;
}

ids.forEach((id, n) => {
  const canvas = renderProp(id);
  const ox = (n % COLS) * CELL + 1;
  const oy = Math.floor(n / COLS) * CELL + 1;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const col = canvas[y * SIZE + x];
      if (!col) continue;
      const hex = col.replace('#', '');
      const a = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      const d = ((oy + y) * W + (ox + x)) * 4;
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      buf[d] = Math.round(buf[d] * (1 - a) + r * a);
      buf[d + 1] = Math.round(buf[d + 1] * (1 - a) + g * a);
      buf[d + 2] = Math.round(buf[d + 2] * (1 - a) + b * a);
    }
  }
});

const S = 6;
const out = process.argv[2] || path.resolve(__dirname, 'propsheet.png');
fs.writeFileSync(out, encodePNG(W * S, H * S, upscaleRGBA(buf, W, H, S)));
console.log(`contact sheet: ${out} (${ids.length} props)`);
