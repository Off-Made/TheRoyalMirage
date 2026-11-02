/**
 * Collaudo del mix: apre `dev/music.html`, aspetta il rendering offline di
 * tutte le atmosfere e stampa picco/RMS. Esce con 1 se una partitura clippa,
 * produce NaN o e' muta: e' il test del mix che le orecchie non possono fare.
 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'shell', args: ['--no-sandbox', '--mute-audio'] });
const page = await browser.newPage();
page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('response', (r) => r.status() >= 400 && console.log('[http]', r.status(), r.url()));
await page.goto('http://localhost:5273/dev/music.html');
await page.waitForFunction('window.RESULT', { timeout: 240000 });
const res = await page.evaluate('window.RESULT');
await browser.close();
console.table(res);
const bad = res.filter((r) => r.peakDb > -0.3 || r.nan > 0 || r.rmsDb < -40);
if (bad.length) { console.log('PROBLEMI:', bad.map((r) => r.name).join(', ')); process.exit(1); }
console.log('OK: nessun clipping, nessun NaN, nessuna partitura muta');
