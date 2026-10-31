/**
 * Minimal zero-dependency PNG writer (8-bit RGBA, non-interlaced).
 *
 * Write-only by design. Reading PNGs back would be needed to import
 * hand-drawn art — see the "Replacing the placeholder art" section of
 * README.md, which sketches what that decoder involves.
 *
 * We only ever need to *write* sprite sheets, and Node ships zlib, so pulling
 * in `sharp` or `pngjs` for this would be a dependency we'd have to maintain
 * for the life of the project. This is ~80 lines instead.
 */
const zlib = require('node:zlib');

// ---------------------------------------------------------------------------
// CRC32 (PNG chunk checksums)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

/** Builds a length-prefixed, CRC-suffixed PNG chunk. */
function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Encodes raw RGBA bytes into a PNG buffer.
 *
 * @param {number} width
 * @param {number} height
 * @param {Buffer|Uint8Array} rgba - width * height * 4 bytes
 * @returns {Buffer}
 */
function encodePNG(width, height, rgba) {
  const expected = width * height * 4;
  if (rgba.length !== expected) {
    throw new Error(`encodePNG: expected ${expected} bytes, got ${rgba.length}`);
  }

  // Each scanline is prefixed with a filter byte. Filter 0 (None) keeps this
  // simple; sprite sheets are tiny and mostly flat colour, so zlib handles the
  // compression fine without per-line filtering.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer ?? rgba, rgba.byteOffset ?? 0, rgba.length).copy(
      raw,
      y * (stride + 1) + 1,
      y * stride,
      y * stride + stride,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace: none

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Nearest-neighbour upscale
// ---------------------------------------------------------------------------

/**
 * Scales RGBA pixel data by an integer factor using nearest-neighbour, which
 * is what keeps pixel art crisp. We bake the scale into the shipped PNG rather
 * than relying on the renderer, because React Native's <Image> applies bilinear
 * filtering on Android with no reliable way to opt out.
 */
function upscaleRGBA(rgba, width, height, factor) {
  if (factor === 1) return rgba;
  const outW = width * factor;
  const outH = height * factor;
  const out = Buffer.alloc(outW * outH * 4);

  for (let y = 0; y < outH; y++) {
    const srcY = (y / factor) | 0;
    for (let x = 0; x < outW; x++) {
      const srcX = (x / factor) | 0;
      const si = (srcY * width + srcX) * 4;
      const di = (y * outW + x) * 4;
      out[di] = rgba[si];
      out[di + 1] = rgba[si + 1];
      out[di + 2] = rgba[si + 2];
      out[di + 3] = rgba[si + 3];
    }
  }
  return out;
}

module.exports = { encodePNG, upscaleRGBA };
