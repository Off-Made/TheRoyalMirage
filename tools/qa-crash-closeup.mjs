/** Primo piano del Golden Chip in volo (fiche, scia) a moltiplicatore alto. */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'shell', protocolTimeout: 180000,
  args: ['--no-sandbox', '--mute-audio', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1600,900'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
await page.goto(`http://localhost:${process.argv[2] ?? '5273'}/`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction('window.GO && GO.wallet', { timeout: 60000 });
await page.evaluate(() => GO.realTime?.());
await page.evaluate(() => GO.play('crash'));
await page.waitForFunction(() => GO.scenes.currentScene?.name === 'crash' && GO.scenes.currentScene.fairReady, { timeout: 120000 });
// Volo lungo garantito: il punto di schianto si alza DOPO l'estrazione, solo per la foto.
for (let attempt = 0; attempt < 3; attempt++) {
  await page.evaluate(() => GO.scenes.currentScene.onPrimary());
  await page.waitForFunction(() => GO.scenes.currentScene.phase === 'flying', { timeout: 60000 });
  await page.evaluate(() => (GO.scenes.currentScene.crashCents = 5000));
  await page.waitForFunction(() => GO.scenes.currentScene.cents >= 260, { timeout: 120000 });
  const p = await page.evaluate(() => {
    const f = GO.scenes.currentScene.falcon.getGlobalPosition();
    const k = document.querySelector('canvas').getBoundingClientRect().width / GO.game.app.renderer.screen.width;
    return { x: f.x * k, y: f.y * k };
  });
  await page.screenshot({ path: 'shots/qa-click/crash-closeup.png', clip: { x: Math.max(0, p.x - 300), y: Math.max(0, p.y - 160), width: 420, height: 320 } });
  console.log('scintille vive:', await page.evaluate(() => GO.scenes.currentScene.sparks.children.length), 'particleScale:', await page.evaluate(() => GO.scenes.currentScene.quality.particleScale));
  break;
}
await sleep(300);
await browser.close();
