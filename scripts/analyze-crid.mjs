// analyze-crid.mjs — motion probe for recorded clips: per-second count of changed
// pixels and the centroid of the change, so a climb/hop/landing shows up as data
// even without eyes on the frames. Usage: node scripts/analyze-crid.mjs <mp4> [stepFrames]
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const file = process.argv[2];
const step = +(process.argv[3] || 15);
const W = 320, H = 200; // downscale for speed: ffmpeg does it
const r = spawnSync("ffmpeg", ["-v", "error", "-i", file,
  "-vf", `scale=${W}:${H}`, "-f", "rawvideo", "-pix_fmt", "gray", "-"],
  { maxBuffer: 1024 * 1024 * 1024 });
if (r.status !== 0) { console.error(r.stderr?.toString().slice(-400)); process.exit(1); }
const buf = r.stdout, n = Math.floor(buf.length / (W * H));
let prev = null, second = -1, lastSec = -1;
const rows = [];
for (let i = 0; i < n; i += step) {
  const sec = Math.floor(i / 30);
  if (sec !== lastSec) { if (rows.length) flush(); rows.length = 0; lastSec = sec; }
  const f = buf.subarray(i * W * H, (i + 1) * W * H);
  if (prev) {
    let cnt = 0, sy = 0, sx = 0;
    for (let p = 0; p < f.length; p += 4) {           // sample every 4th px
      const d = Math.abs(f[p] - prev[p]);
      if (d > 18) { cnt++; sy += (p / 4 / W) | 0; sx += (p / 4 % W); }
    }
    if (cnt > 30) rows.push({ sec, cnt, cy: +(sy / cnt).toFixed(0), cx: +(sx / cnt).toFixed(0) });
  }
  prev = Buffer.from(f);
}
function flush() {
  if (!rows.length) return;
  const c = rows.reduce((a, b) => a + b.cnt, 0) / rows.length;
  const cy = rows.reduce((a, b) => a + b.cy, 0) / rows.length;
  const cx = rows.reduce((a, b) => a + b.cx, 0) / rows.length;
  console.log(`  t=${String(lastSec).padStart(2)}s  motion=${String(Math.round(c)).padStart(5)}px  centroid=(${Math.round(cx)},${Math.round(cy)})`);
}
flush();
