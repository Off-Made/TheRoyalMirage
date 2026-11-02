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
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack ?? ''}`));
page.on('requestfailed', (r) => logs.push(`[netfail] ${r.url()} — ${r.failure()?.errorText}`));

// `pageerror` NON vede le promise rifiutate, e qui quasi tutto il gioco e'
// asincrono: una mano che si interrompe a meta' lascia la scena in uno stato
// incoerente senza stampare una riga. Questo gancio va installato prima del
// goto, altrimenti perde i rifiuti del boot.
await page.evaluateOnNewDocument(() => {
  addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    console.error(`[rejection] ${r?.message ?? r}\n${r?.stack ?? ''}`);
  });
});

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
    } else if (k === '--dom') {
      // Clicca il comando DOM il cui testo corrisponde (senza distinguere
      // maiuscole). Serve perche' l'interfaccia scrive "Vola" e il CSS lo
      // rende "VOLA": il selettore `text/` di Puppeteer cerca il testo
      // vero, non quello reso, e non lo trova mai.
      const hit = await page.evaluate((re) => {
        const rx = new RegExp(re, 'i');
        // `offsetParent` NON basta: le schermate qui non si nascondono con
        // display:none ma spegnendo opacita' e pointer-events, quindi i
        // comandi del menu e della lobby restano "visibili" per il DOM anche
        // mentre si gioca. Senza questo controllo un --dom "Entra" cliccava
        // la lobby invisibile sotto il tavolo.
        const clickable = (x) => {
          const r = x.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return false;
          // Opacita' e visibilita' vanno controllate sugli antenati — e'
          // cosi' che queste schermate si nascondono. NON pointer-events:
          // i pannelli di comando lo spengono sul contenitore e lo
          // riaccendono sui figli, quindi risalirlo boccia i bottoni veri.
          for (let n = x; n instanceof HTMLElement; n = n.parentElement) {
            const s = getComputedStyle(n);
            if (s.display === 'none' || s.visibility === 'hidden') return false;
            if (Number(s.opacity) === 0) return false;
          }
          // La prova decisiva: chi sta davvero sotto quel punto. Cattura
          // tutto il resto — z-index, velo di una modale, fuori schermo.
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return top === x || x.contains(top);
        };
        const b = [...document.querySelectorAll('button:not([disabled])')].find(
          (x) => rx.test(x.textContent ?? '') && clickable(x)
        );
        if (b) b.click();
        return b ? (b.textContent ?? '').trim().slice(0, 40) : null;
      }, v);
      logs.push(hit ? `[dom] /${v}/i → "${hit}"` : `[step-fail] --dom ${v} — nessun comando visibile`);
      await new Promise((r) => setTimeout(r, Number(arg('click-wait', 1200))));
    } else if (k === '--tap') {
      // Click a coordinate nello spazio di DESIGN (1920×1080), non in pixel
      // di viewport. I comandi dei giochi sono testo Pixi dentro il canvas:
      // nessun selettore DOM li raggiunge, e scrivere le coordinate nello
      // spazio in cui sono state progettate rende il comando indipendente
      // dal --size con cui si fotografa.
      const [dx, dy] = v.split(',').map(Number);
      await page.mouse.click((dx / 1920) * w, (dy / 1080) * h);
      logs.push(`[tap] ${dx},${dy} → ${Math.round((dx / 1920) * w)},${Math.round((dy / 1080) * h)}`);
      await new Promise((r) => setTimeout(r, Number(arg('click-wait', 1200))));
    } else if (k === '--eval') {
      await page.evaluate(v);
      logs.push(`[eval] ${v.slice(0, 80)}`);
    } else if (k === '--probe') {
      // Come --eval, ma STAMPA il risultato. Il collaudo contabile vive qui:
      // il saldo si legge dallo store, non dall'HUD, cosi' un errore di
      // formattazione non puo' mascherare un errore di cassa.
      const r = await page.evaluate(`(() => (${v}))()`);
      logs.push(`[probe] ${v} = ${JSON.stringify(r)}`);
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
