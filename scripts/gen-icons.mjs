#!/usr/bin/env node
/**
 * Draws the app icon in code — the same red cube, the same white eyes — and
 * writes the PNG/ICO files Tauri bundles. No image libraries, no binary assets
 * in the repository: `npm run icons` regenerates everything.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "src-tauri", "icons");
mkdirSync(outDir, { recursive: true });

/* ── PNG ─────────────────────────────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ── Drawing ─────────────────────────────────────────────────────────────── */

const mix = (a, b, t) => a + (b - a) * t;
const mixColor = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function insideRoundedRect(x, y, left, top, size, radius) {
  if (x < left || y < top || x > left + size || y > top + size) return false;
  const cx = Math.min(Math.max(x, left + radius), left + size - radius);
  const cy = Math.min(Math.max(y, top + radius), top + size - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function insideEllipse(x, y, cx, cy, rx, ry) {
  return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
}

/** One sample of the icon at normalised coordinates (0..1024). */
function sample(x, y, size) {
  const scale = size / 1024;
  const px = x / scale;
  const py = y / scale;

  // Background: dark rounded square with a red glow behind the cube.
  const pad = 42;
  if (!insideRoundedRect(px, py, pad, pad, 1024 - pad * 2, 200)) return [0, 0, 0, 0];

  const glow = Math.max(0, 1 - Math.hypot(px - 512, py - 470) / 520);
  let color = mixColor([13, 13, 16], [46, 12, 14], glow * 0.9);

  const s = 470;
  const dx = s * 0.3;
  const dy = s * 0.27;
  const ox = 512 - (s + dx) / 2;
  const oy = 512 - (s + dy) / 2 - 14;

  const top = [
    [ox, oy + dy],
    [ox + s, oy + dy],
    [ox + s + dx, oy],
    [ox + dx, oy],
  ];
  const right = [
    [ox + s, oy + dy],
    [ox + s + dx, oy],
    [ox + s + dx, oy + s],
    [ox + s, oy + s + dy],
  ];
  const front = [
    [ox, oy + dy],
    [ox + s, oy + dy],
    [ox + s, oy + s + dy],
    [ox, oy + s + dy],
  ];

  if (insidePolygon(px, py, top)) {
    const t = ((px - ox) + (py - oy)) / (s + dx + dy);
    color = mixColor([255, 150, 136], [255, 58, 47], Math.max(0, Math.min(1, t)));
  } else if (insidePolygon(px, py, right)) {
    const t = (py - oy) / (s + dy);
    color = mixColor([179, 18, 22], [100, 4, 7], Math.max(0, Math.min(1, t)));
  } else if (insidePolygon(px, py, front)) {
    const t = (px - ox + (py - oy - dy)) / (s * 1.6);
    color = mixColor([251, 58, 49], [184, 16, 26], Math.max(0, Math.min(1, t)));
    // Soft gloss along the top of the front face.
    const gloss = Math.max(0, 1 - (py - oy - dy) / (s * 0.42));
    color = mixColor(color, [255, 150, 140], gloss * 0.18);
  }

  // Eyes.
  const eyeY = oy + dy + s * 0.45;
  for (const eyeX of [ox + s * 0.31, ox + s * 0.69]) {
    if (insideEllipse(px, py, eyeX, eyeY, s * 0.15, s * 0.175)) {
      color = [255, 255, 255];
      if (insideEllipse(px, py, eyeX + s * 0.012, eyeY + s * 0.012, s * 0.05, s * 0.054)) {
        color = [42, 5, 8];
      }
    }
  }

  return [Math.round(color[0]), Math.round(color[1]), Math.round(color[2]), 255];
}

function render(size) {
  const buffer = Buffer.alloc(size * size * 4);
  const samples = 3;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const [sr, sg, sb, sa] = sample(x + (sx + 0.5) / samples, y + (sy + 0.5) / samples, size);
          const alpha = sa / 255;
          r += sr * alpha;
          g += sg * alpha;
          b += sb * alpha;
          a += alpha;
        }
      }
      const count = samples * samples;
      const offset = (y * size + x) * 4;
      buffer[offset] = a ? Math.round(r / a) : 0;
      buffer[offset + 1] = a ? Math.round(g / a) : 0;
      buffer[offset + 2] = a ? Math.round(b / a) : 0;
      buffer[offset + 3] = Math.round((a / count) * 255);
    }
  }
  return encodePng(size, size, buffer);
}

/* ── ICO (PNG-compressed, Vista+) ────────────────────────────────────────── */

function encodeIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = 0; // 256 px
  entry[1] = 0;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, png]);
}

/* ── Files ───────────────────────────────────────────────────────────────── */

const outputs = [
  [32, "32x32.png"],
  [128, "128x128.png"],
  [256, "128x128@2x.png"],
  [512, "icon.png"],
  // Master for `tauri icon`, which derives the Android mipmaps from it.
  [1024, "icon-1024.png"],
];

for (const [size, name] of outputs) {
  writeFileSync(join(outDir, name), render(size));
  console.log(`icons/${name}`);
}

const icoPng = render(256);
writeFileSync(join(outDir, "icon.ico"), encodeIco(icoPng));
console.log("icons/icon.ico");
