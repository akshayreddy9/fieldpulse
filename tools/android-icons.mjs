// Generates the Android launcher icons and splash screens from the MSR Pulse mark.
// Run: node tools/android-icons.mjs   (after `npx cap add android`)
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const RES = 'android/app/src/main/res';
const LINE = [[6, 34], [18, 34], [23, 22], [31, 46], [37, 30], [41, 34], [58, 34]];
const TEAL = [94, 234, 212];

function crcTable() { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; }
const CRC = crcTable();
const crc = (b) => { let r = 0xffffffff; for (const x of b) r = CRC[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
function chunk(type, data) { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); }

// opts: { bg: true|false, round: bool, scale: size of the mark relative to the shorter side }
function draw(w, h, { bg = true, round = false, scale = 1 }) {
  const s = Math.min(w, h) * scale;
  const ox = (w - s) / 2;
  const oy = (h - s) / 2;
  const pts = LINE.map(([x, y]) => [ox + (x / 64) * s, oy + (y / 64) * s]);
  const half = ((5.5 / 64) * s) / 2;
  const seg = (px, py, [ax, ay], [bx, by]) => { const dx = bx - ax; const dy = by - ay; let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy); t = Math.max(0, Math.min(1, t)); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
  const row = w * 4 + 1;
  const buf = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) {
    buf[y * row] = 0;
    for (let x = 0; x < w; x++) {
      const cx = x + 0.5; const cy = y + 0.5;
      let d = 1e9;
      for (let k = 0; k < pts.length - 1; k++) d = Math.min(d, seg(cx, cy, pts[k], pts[k + 1]));
      const a = Math.max(0, Math.min(1, half - d + 0.5));
      const t = cy / h;
      const base = [30 * (1 - t) + 13 * t, 58 * (1 - t) + 80 * t, 95 * (1 - t) + 100 * t];
      let alpha = bg ? 255 : Math.round(a * 255);
      if (round) { const r = Math.hypot(cx - w / 2, cy - h / 2); alpha = Math.round(alpha * Math.max(0, Math.min(1, w / 2 - r + 0.5))); }
      const c = bg ? base.map((v, i) => v * (1 - a) + TEAL[i] * a) : TEAL;
      const o = y * row + 1 + x * 4;
      buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = alpha;
    }
  }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(buf)), chunk('IEND', Buffer.alloc(0))]);
}
const sizeOf = (file) => { const b = fs.readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

let n = 0;
const DENS = { mdpi: [48, 108], hdpi: [72, 162], xhdpi: [96, 216], xxhdpi: [144, 324], xxxhdpi: [192, 432] };
for (const [d, [icon, fg]] of Object.entries(DENS)) {
  const dir = path.join(RES, `mipmap-${d}`);
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), draw(icon, icon, { scale: 0.8 }));
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), draw(icon, icon, { round: true, scale: 0.7 }));
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), draw(fg, fg, { bg: false, scale: 0.5 }));
  n += 3;
}
for (const dir of fs.readdirSync(RES).filter((x) => x.startsWith('drawable'))) {
  const f = path.join(RES, dir, 'splash.png');
  if (!fs.existsSync(f)) continue;
  const [w, h] = sizeOf(f);
  fs.writeFileSync(f, draw(w, h, { scale: 0.32 }));
  n++;
}
fs.writeFileSync(path.join(RES, 'values', 'ic_launcher_background.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1E3A5F</color>\n</resources>\n');
console.log(`Wrote ${n} Android icon and splash images`);
