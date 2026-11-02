/**
 * Strumento di sviluppo: confronto numerico fra due screenshot.
 *
 *   node tools/imgdiff.mjs a.png b.png [--out diff.png] [--threshold 24]
 *
 * Serve a verificare i refactor che NON devono cambiare la resa (porting di
 * una scenografia, migrazione della palette): "sembra uguale" non e' una
 * verifica. Usa lo stesso Chrome di `shot.mjs`, quindi non richiede librerie
 * di immagini installate. Le particelle ambientali sono casuali: una piccola
 * percentuale di pixel diversi e' attesa, sparsa, mai a blocchi.
 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));

const [a, b] = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
if (!a || !b || !CHROME) {
  console.error('uso: node tools/imgdiff.mjs a.png b.png [--out diff.png] [--threshold 24]');
  process.exit(1);
}
const out = arg('out', '');
const threshold = Number(arg('threshold', 24));
const toUrl = async (p) => `data:image/png;base64,${(await readFile(resolve(p))).toString('base64')}`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'shell' });
const page = await browser.newPage();
const res = await page.evaluate(
  async (ua, ub, thr, wantOut) => {
    const load = (u) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = u; });
    const [ia, ib] = await Promise.all([load(ua), load(ub)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { error: `dimensioni diverse ${ia.width}x${ia.height} / ${ib.width}x${ib.height}` };
    const w = ia.width, h = ia.height;
    const px = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const A = px(ia), B = px(ib);
    const diff = new ImageData(w, h);
    let same = 0, over = 0, sum = 0;
    // Griglia 16x9: dice DOVE stanno le differenze (sparse = particelle, a blocchi = regressione).
    const GX = 16, GY = 9, cells = new Array(GX * GY).fill(0);
    for (let i = 0; i < A.length; i += 4) {
      const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
      sum += d;
      if (d === 0) same++;
      if (d > thr) {
        over++;
        const p = i / 4, x = p % w, y = (p / w) | 0;
        cells[((y * GY / h) | 0) * GX + ((x * GX / w) | 0)]++;
        diff.data[i] = 255; diff.data[i + 3] = 255;
      } else {
        diff.data[i] = diff.data[i + 1] = diff.data[i + 2] = A[i] * 0.25; diff.data[i + 3] = 255;
      }
    }
    const n = w * h, cellN = n / (GX * GY);
    let url = '';
    if (wantOut) { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(diff, 0, 0); url = c.toDataURL('image/png'); }
    return {
      identical: (100 * same) / n,
      over: (100 * over) / n,
      mean: sum / n,
      worstCell: (100 * Math.max(...cells)) / cellN,
      url,
    };
  },
  await toUrl(a), await toUrl(b), threshold, Boolean(out)
);
await browser.close();

if (res.error) { console.error(res.error); process.exit(1); }
console.log(`identici ${res.identical.toFixed(2)}% · oltre soglia ${res.over.toFixed(3)}% · diff media ${res.mean.toFixed(3)} · cella peggiore ${res.worstCell.toFixed(2)}%`);
if (out) {
  await writeFile(resolve(out), Buffer.from(res.url.split(',')[1], 'base64'));
  console.log(`mappa delle differenze: ${out}`);
}
