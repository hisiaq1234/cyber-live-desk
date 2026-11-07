// fetch-crid-views.mjs — run once on your own computer (Node 18+, nothing to install).
//   node fetch-crid-views.mjs
// Uses YOUR avatar's preview URL and changes only two things:
//   body=      -> the 5 body shapes your editor offers (for the lean -> bigger sub mechanic)
//   rotation=  -> viewing angles (for side / three-quarter frames)
// Saves PNGs into ./views and a labelled contact sheet at ./views/index.html.

import { mkdir, writeFile } from "node:fs/promises";

const BASE =
  "https://preview.bitmoji.com/bm-preview/v3/avatar/body?scale=1&gender=1&style=5&rotation=0&bag=10094406&bag_tone1=16771495&bag_tone10=16776696&bag_tone2=16771495&bag_tone3=16766295&bag_tone4=16766295&bag_tone5=14591745&bag_tone6=12171705&bag_tone7=16766295&bag_tone8=16776696&bag_tone9=16766295&beard=8696&body=0&bottom=10001984&bottom_tone1=0&bottom_tone10=0&bottom_tone2=0&bottom_tone3=0&bottom_tone4=0&bottom_tone5=0&bottom_tone6=0&bottom_tone7=0&bottom_tone8=0&bottom_tone9=0&breast=0&brow=1538&brow_tone=1579802&cheek_details=-1&clothing_type=1&ear=1424&earringL_lobe1=5&earringL_lobe1_tone1=16763909&earringL_lobe1_tone2=16763909&earringL_lobe1_tone3=16763909&earringL_lobe1_tone4=16763909&earringR_lobe1=5&earringR_lobe1_tone1=16763909&earringR_lobe1_tone2=16763909&earringR_lobe1_tone3=16763909&earringR_lobe1_tone4=16763909&eye=1626&eyelash=-1&eye_details=-1&eye_size=0&eye_spacing=0&face_lines=-1&face_proportion=10&footwear=866&footwear_tone1=16448250&footwear_tone10=16448250&footwear_tone2=16448250&footwear_tone3=16448250&footwear_tone4=16448250&footwear_tone5=16448250&footwear_tone6=16448250&footwear_tone7=16448250&footwear_tone8=16448250&footwear_tone9=16448250&glasses=-1&hair=1657&hair_tone=2039326&hat=-1&hat_tone1=10626095&hat_tone2=10626095&hat_tone3=10626095&hat_tone4=10626095&hat_tone5=10626095&hat_tone6=10626095&hat_tone7=10626095&hat_tone8=10626095&hat_tone9=10626095&is_tucked=0&jaw=1396&mouth=2338&nose=1449&pupil_tone=5977116&skin_tone=8080170&sock=295&sock_tone1=1907997&sock_tone2=8158331&sock_tone3=15132132&sock_tone4=1907997&ua=2";

// Body-shape values for the male avatar set, from libmoji's data. The order says nothing about
// size, so open views/index.html and tell me which one is leanest -> biggest.
const SHAPES = [0, 3, 5, 1, 2];
// Angles to try. Bitmoji may reject some; the log shows which ones came back.
const ANGLES = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const SCALES = [3, 1]; // bigger render first, fall back to scale=1

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function make(changes, scale) {
  const u = new URL(BASE);
  for (const [k, v] of Object.entries({ ...changes, scale })) u.searchParams.set(k, String(v));
  return u.toString();
}

async function grab(changes) {
  for (const scale of SCALES) {
    try {
      const res = await fetch(make(changes, scale));
      const type = res.headers.get("content-type") || "";
      if (!res.ok || !type.includes("image")) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 2000) return { buf, scale };
    } catch {}
    await sleep(250);
  }
  return null;
}

await mkdir("views", { recursive: true });
const done = [];
const jobs = [
  ...SHAPES.map((b) => ({ name: `shape-${b}`, label: `body=${b}`, changes: { body: b, rotation: 0 } })),
  ...ANGLES.filter((r) => r !== 0).map((r) => ({ name: `angle-${r}`, label: `rotation=${r}`, changes: { rotation: r } })),
];

for (const job of jobs) {
  const got = await grab(job.changes);
  if (got) {
    await writeFile(`views/${job.name}.png`, got.buf);
    console.log(`OK    ${job.label.padEnd(12)} scale ${got.scale}  ${(got.buf.length / 1024).toFixed(0)} KB`);
    done.push(job);
  } else {
    console.log(`MISS  ${job.label}`);
  }
  await sleep(300);
}

const cards = done
  .map((j) => `<figure><img src="${j.name}.png"><figcaption>${j.label}</figcaption></figure>`)
  .join("");
await writeFile(
  "views/index.html",
  `<!doctype html><meta charset="utf-8"><title>CRID views</title>
<style>body{margin:0;padding:24px;background:#0F0B17;color:#F4F0FF;font:14px system-ui;display:flex;flex-wrap:wrap;gap:20px}
figure{margin:0;width:240px;text-align:center}img{width:240px;height:320px;object-fit:contain;
background:repeating-conic-gradient(#1F1736 0 25%,#161025 0 50%) 0 0/20px 20px;border-radius:12px}</style>${cards}`
);

console.log(`\n${done.length} of ${jobs.length} saved. Open views/index.html, then tell me:`);
console.log("1) which body= value is leanest -> biggest, 2) which rotation= values look like side / three-quarter views.");
