/** Screenshot della transizione `chip` a schermo coperto (due istanti del flip). */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'shell', protocolTimeout: 180000,
  args: ['--no-sandbox', '--mute-audio', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1600,900'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5273/', { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction('window.GO && GO.wallet', { timeout: 60000 });
await page.evaluate(() => GO.realTime?.());
await sleep(3000);
await page.evaluate(async () => { window.__t = GO.scenes.mountTransition('chip'); await window.__t.cover(); });
// Il menu e' DOM sopra il canvas: per vedere il velo Pixi lo si nasconde.
await page.evaluate(() => document.querySelectorAll('#overlay > *').forEach((e) => (e.style.visibility = 'hidden')));
for (let i = 0; i < 6; i++) {
  await page.screenshot({ path: `shots/qa-click/chip-${i}.png`, clip: { x: 600, y: 250, width: 400, height: 400 } });
  await sleep(110);
}
await page.evaluate(async () => { await window.__t.reveal(); GO.scenes.unmountTransition(window.__t); });
await sleep(1500);
console.log(errors.length ? errors.join('\n') : 'nessun errore');
await browser.close();
