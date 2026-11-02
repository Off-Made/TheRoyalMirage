/**
 * Strumento di sviluppo: screenshot del gioco con log di console.
 *
 * Non fa parte del bundle. Serve a me (e a te) per vedere il risultato
 * reale del renderer senza aprire una finestra, e soprattutto per leggere
 * gli errori WebGL che altrimenti restano invisibili in uno screenshot.
 *
 *   node tools/shot.mjs [--out shots/x.png] [--wait 4000] [--route "#/lobby"]
 *                       [--click "#play"] [--size 1600x900]
 */

import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

const out = resolve(arg('out', 'shots/shot.png'));
const wait = Number(arg('wait', 4500));
const route = arg('route', '');
const [w, h] = arg('size', '1600x900').split('x').map(Number);
const url = `${arg('url', 'http://localhost:5273/')}${route}`;

const { existsSync } = await import('node:fs');
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error('Nessun Chrome/Edge trovato nei percorsi noti.');
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'shell',
  args: [
    '--no-sandbox',
    '--disable-gpu-sandbox',
    // SwiftShader: WebGL2 software. Lento ma fedele, e soprattutto funziona
    // su una macchina senza GPU accessibile in headless.
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--hide-scrollbars',
    '--mute-audio',
    '--disable-extensions',
    `--window-size=${w},${h}`,
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });

const logs = [];
// Copia privata (agente B): niente HMR. Altri agenti modificano file in
// parallelo e Vite ricaricherebbe la pagina a meta' collaudo.
await page.evaluateOnNewDocument(() => {
  const W = window.WebSocket;
  function Fake(url, proto) {
    if (String(proto).includes('vite')) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
    return new W(url, proto);
  }
  Fake.prototype = W.prototype;
  Object.assign(Fake, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  window.WebSocket = Fake;
});
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack ?? ''}`));
page.on('requestfailed', (r) => logs.push(`[netfail] ${r.url()} — ${r.failure()?.errorText}`));

try {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
} catch (e) {
  logs.push(`[goto] ${e.message}`);
}

// Attesa reale: diamo tempo al bake delle texture e ai primi frame.
await new Promise((r) => setTimeout(r, wait));

// Passi in ordine di riga di comando: --click <sel> · --eval <js> · --sleep <ms>.
// Ogni click attende poi --click-wait ms (default 1200).
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length - 1; i++) {
  const [k, v] = [argv[i], argv[i + 1]];
  try {
    if (k === '--click') {
      await page.click(v);
      logs.push(`[click] ${v}`);
      await new Promise((r) => setTimeout(r, Number(arg('click-wait', 1200))));
    } else if (k === '--eval') {
      await page.evaluate(v);
      logs.push(`[eval] ${v.slice(0, 80)}`);
    } else if (k === '--snap') {
      await mkdir(dirname(resolve(v)), { recursive: true });
      await page.screenshot({ path: resolve(v) });
      logs.push(`[snap] ${v}`);
    } else if (k === '--sleep') {
      await new Promise((r) => setTimeout(r, Number(v)));
    }
  } catch (e) {
    logs.push(`[step-fail] ${k} ${v} — ${e.message}`);
  }
}

// Stato del boot: dice subito se siamo rimasti bloccati sul loader.
const diag = await page.evaluate(() => ({
  bootHidden: document.getElementById('boot')?.classList.contains('done') ?? null,
  bootStatus: document.getElementById('boot-status')?.textContent ?? null,
  fatalShown: document.getElementById('fatal')?.classList.contains('show') ?? null,
  fatalMsg: document.getElementById('fatal-msg')?.textContent ?? null,
  fps: window.GO?.game?.fps ?? null,
  backend: window.GO?.game?.backend ?? null,
  scene: window.GO?.scenes?.currentName ?? null,
}));

await mkdir(dirname(out), { recursive: true });
await page.screenshot({ path: out });
await browser.close();

console.log('── DIAGNOSTICA ──');
console.log(JSON.stringify(diag, null, 2));
if (logs.length) {
  console.log('── CONSOLE ──');
  console.log(logs.slice(0, 60).join('\n'));
}
console.log(`\nScreenshot: ${out}`);
if (flag('fail-on-error') && logs.some((l) => l.startsWith('[pageerror]'))) process.exit(2);
