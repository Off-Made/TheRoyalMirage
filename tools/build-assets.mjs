/**
 * THE ROYAL MIRAGE — Conversione degli asset raster in WebP
 *
 * Non fa parte del bundle. Prende le foto e le icone scaricate (licenze in
 * docs/CREDITS.md) da una cartella ESTERNA al progetto e scrive in
 * `public/assets/` versioni ridimensionate e compresse.
 *
 *   node tools/build-assets.mjs <cartella-sorgenti>
 *
 * Usa il Chrome di sistema come encoder: `canvas.toDataURL('image/webp')`
 * produce WebP con canale alfa, e ci evita una dipendenza nativa (sharp).
 */

import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const SRC = resolve(process.argv[2] ?? '');
if (!process.argv[2] || !existsSync(SRC)) {
  console.error('Uso: node tools/build-assets.mjs <cartella-sorgenti>');
  process.exit(1);
}
const OUT = resolve('public/assets');

/**
 * Foto di sfondo. `blur` in px sfoca a monte: le scene di gioco vogliono
 * solo LUCI dietro al tavolo, non architetture leggibili che competono.
 */
const PHOTOS = [
  { src: 'photos/1_Las_vegas_strip.jpg', out: 'bg/strip.webp', w: 1920, q: 0.55 },
  { src: 'photos/1_Las_vegas_strip.jpg', out: 'bg/strip-m.webp', w: 960, q: 0.72 },
  { src: 'photos/Bellagio_15378753127_.jpg', out: 'bg/bellagio.webp', w: 1600, q: 0.55 },
  { src: 'photos/2007_12_24_Night_in_Las_Vegas.jpg', out: 'bg/skyline.webp', w: 1920, q: 0.5 },
  { src: 'photos/2020_New_Years_Eve_on_the_Las_Vegas_Strip.jpg', out: 'bg/lights.webp', w: 1280, q: 0.7, blur: 28 },
  { src: 'photos/1_Las_vegas_strip.jpg', out: 'bg/strip-blur.webp', w: 1280, q: 0.7, blur: 22 },
];

/** Icone 3D (Fluent Emoji, MIT): 256 px in origine. */
const ICONS = [
  'cherries', 'bell', 'gem_stone', 'glowing_star', 'star', 'four_leaf_clover', 'watermelon', 'grapes',
  'tangerine', 'lemon', 'trophy', 'clapper_board', 'movie_camera', 'bottle_with_popping_cork', 'top_hat',
  'popcorn', 'crown', 'coin', 'money_bag', 'ring', 'game_die', 'rocket', 'slot_machine', 'sparkles',
  'kiss_mark', 'party_popper', 'spade_suit', 'heart_suit', 'diamond_suit', 'club_suit', 'joker',
  'wrapped_gift', 'gear', 'fire', 'chart_increasing', 'admission_tickets', 'clinking_glasses', 'red_heart',
].map((n) => ({ src: `fluent/${n}_3d.png`, out: `icons/${n.replace(/_/g, '-')}.webp`, w: 256, q: 0.9 }));

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'shell' });
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

let total = 0;
for (const job of [...PHOTOS, ...ICONS]) {
  const file = join(SRC, job.src);
  if (!existsSync(file)) {
    console.warn(`manca ${job.src}`);
    continue;
  }
  const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const dataUrl = `data:${mime};base64,${readFileSync(file).toString('base64')}`;
  const webp = await page.evaluate(
    async ({ dataUrl, w, q, blur }) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const scale = Math.min(1, w / img.naturalWidth);
      const cw = Math.round(img.naturalWidth * scale);
      const ch = Math.round(img.naturalHeight * scale);
      const c = document.getElementById('c');
      c.width = cw;
      c.height = ch;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, cw, ch);
      if (blur) {
        // Si disegna piu' grande del canvas: la sfocatura altrimenti
        // tirerebbe dentro dai bordi un alone trasparente.
        ctx.filter = `blur(${blur}px)`;
        ctx.drawImage(img, -blur * 2, -blur * 2, cw + blur * 4, ch + blur * 4);
      } else {
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, cw, ch);
      }
      return c.toDataURL('image/webp', q);
    },
    { dataUrl, w: job.w, q: job.q, blur: job.blur ?? 0 }
  );
  const buf = Buffer.from(webp.split(',')[1], 'base64');
  const dest = join(OUT, job.out);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  total += buf.length;
  console.log(`${job.out.padEnd(34)} ${(buf.length / 1024).toFixed(1).padStart(7)} KB`);
}
console.log(`totale ${(total / 1024).toFixed(0)} KB`);
await browser.close();
