/**
 * Icone dell'app per la schermata Home (iPhone/Android): la fiche RM della
 * casa (`src/art/houseChip.ts`) su velluto rosso. Le genera il gioco stesso,
 * nel browser, con gli stessi token di colore: niente copie a mano.
 *
 *   npm run dev            # in un altro terminale
 *   node tools/build-app-icons.mjs [porta]
 *
 * Scrive public/assets/app/icon-{180,192,512}.png (180 = apple-touch-icon).
 */
import puppeteer from 'puppeteer-core';
import { existsSync, writeFileSync } from 'node:fs';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => existsSync(p));
const PORT = process.argv[2] ?? '5273';
const SIZES = [180, 192, 512];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'shell', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction('window.GO', { timeout: 60000 });

const out = await page.evaluate(async (sizes) => {
  const { setBakeResolution } = await import('/src/art/textureCache.ts');
  const { PALETTE, css } = await import('/src/art/palette.ts');
  // Densita' alta solo qui: la fiche viene ridisegnata fresca a 3x per l'icona da 512.
  setBakeResolution(3);
  const { houseChipTexture } = await import('/src/art/houseChip.ts');
  const tex = houseChipTexture('red');
  const chip = tex.source.resource;
  const res = {};
  for (const n of sizes) {
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const ctx = c.getContext('2d');
    // Piena fino ai bordi: iOS arrotonda gli angoli da se'.
    const g = ctx.createRadialGradient(n / 2, n * 0.45, 0, n / 2, n / 2, n * 0.75);
    g.addColorStop(0, css(PALETTE.red.deep));
    g.addColorStop(1, css(PALETTE.plum.base));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, n, n);
    const d = n * 0.8;
    ctx.drawImage(chip, (n - d) / 2, (n - d) / 2, d, d);
    res[n] = c.toDataURL('image/png').split(',')[1];
  }
  return res;
}, SIZES);

for (const n of SIZES) {
  writeFileSync(`public/assets/app/icon-${n}.png`, Buffer.from(out[n], 'base64'));
  console.log(`public/assets/app/icon-${n}.png`);
}
await browser.close();
