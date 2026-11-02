/**
 * Collaudo visivo: bande di letterbox opache (finestra piu' larga e piu' alta
 * del 16:9) e Golden Chip in volo / in pezzi.
 *
 *   node tools/qa-letterbox.mjs [porta]
 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));
const PORT = process.argv[2] ?? '5273';
const OUT = 'shots/qa-click';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'shell', protocolTimeout: 180000,
  args: ['--no-sandbox', '--mute-audio', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1920,1000'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text().slice(0, 160)));
await page.setViewport({ width: 1920, height: 820 });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction('window.GO && GO.wallet', { timeout: 60000 });
await page.evaluate(() => GO.realTime?.());
await sleep(2500);
const waitScene = (n) => page.waitForFunction((n) => GO.scenes.currentScene?.name === n && !GO.scenes.isTransitioning, { timeout: 120000 }, n);

for (const id of ['goldenOasis', 'roulette']) {
  await page.evaluate((id) => GO.play(id), id);
  await page.waitForFunction(() => !GO.scenes.isTransitioning && GO.scenes.currentScene?.name !== 'atmosphere', { timeout: 120000 });
  await sleep(3000);
  await page.screenshot({ path: `${OUT}/lb-wide-${id}.png` });
}

// Crash: volo con click vero su «Vola».
await page.evaluate(() => GO.play('crash'));
await waitScene('crash');
await page.waitForFunction(() => GO.scenes.currentScene.fairReady, { timeout: 60000 });
await sleep(1500);
await page.evaluate(() => {
  window.__ach = [];
  GO.bus.on('achievement:unlocked', (p) => window.__ach.push([p.id, GO.achievementReward(p.id)]));
});
const bal0 = await page.evaluate(() => GO.wallet().balance);
await page.click('.go-hud__bar .go-btn--primary');
await page.waitForFunction(() => GO.scenes.currentScene.phase === 'flying', { timeout: 60000 });
await page.waitForFunction(() => GO.scenes.currentScene.phase !== 'flying' || GO.scenes.currentScene.cents >= 115, { timeout: 60000 });
await page.screenshot({ path: `${OUT}/crash-fly.png` });
let cashed = false;
if (await page.evaluate(() => GO.scenes.currentScene.phase === 'flying')) {
  // Il pulsante viene ridisegnato a ogni fotogramma del volo: un click puo'
  // cadere fra due ridisegni, e allora conta l'esito, non il click.
  try {
    await page.click('.go-hud__bar .go-btn--primary');
    cashed = true;
  } catch {}
}
await page.waitForFunction(() => GO.scenes.currentScene.phase === 'over', { timeout: 60000 });
await sleep(400);
await page.screenshot({ path: `${OUT}/crash-end.png` });
const bal1 = await page.evaluate(() => GO.wallet().balance);
const st = await page.evaluate(() => ({ cents: GO.scenes.currentScene.cents, bet: GO.scenes.currentScene.bet }));
const ach = await page.evaluate(() => window.__ach);
const bonus = ach.reduce((a, [, r]) => a + r, 0);
console.log('riconoscimenti:', JSON.stringify(ach));
console.log(`crash: ${cashed ? 'incassato' : 'schianto'} a ${st.cents / 100}x, puntata ${st.bet}, saldo ${bal0} -> ${bal1} (atteso al netto dei premi: ${bal1 - bonus})`);

// Finestra piu' alta del 16:9: bande sopra e sotto.
await page.setViewport({ width: 1200, height: 1000 });
await sleep(2500);
await page.screenshot({ path: `${OUT}/lb-tall-crash.png` });

console.log(errors.length ? `ERRORI:\n${errors.join('\n')}` : 'nessun errore in console');
await browser.close();
