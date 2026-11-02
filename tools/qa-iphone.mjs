/**
 * Collaudo "iPhone": emula un iPhone 15 Pro (852x393 in orizzontale, tocco,
 * Safari iOS) e fotografa home, sala, ogni gioco e l'invito a ruotare.
 * Poi tocca davvero il tappeto della roulette (touchscreen, non mouse).
 *
 *   node tools/qa-iphone.mjs [porta] [id-gioco ...]
 */
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));
const PORT = process.argv[2] ?? '5273';
const ONLY = process.argv.slice(3);
const OUT = 'shots/iphone';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const LAND = { width: 852, height: 393, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true };
const PORT_VP = { width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: false };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'shell', protocolTimeout: 240000,
  args: ['--no-sandbox', '--mute-audio', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage();
await page.setUserAgent(UA);
await page.setViewport(LAND);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text().slice(0, 160)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction('window.GO && GO.wallet', { timeout: 60000 });
await page.evaluate(() => GO.realTime?.());
await sleep(2500);
const idle = () => page.waitForFunction(() => !GO.scenes.isTransitioning, { timeout: 120000 });

if (!ONLY.length || ONLY.includes('lobby')) {
  await page.screenshot({ path: `${OUT}/0-menu.png` });
  await page.evaluate(() => void GO.shell.goLobby());
  await sleep(2500);
  await page.screenshot({ path: `${OUT}/0-lobby.png` });
}

const GAMES = ONLY.length ? ONLY.filter((g) => g !== 'lobby') : ['goldenOasis', 'desertFalcon', 'sheikhsFortune', 'blackjack', 'roulette', 'baccarat', 'videopoker', 'crash'];
for (const id of GAMES) {
  await page.evaluate((id) => GO.play(id), id);
  await idle();
  await page.waitForFunction((id) => GO.scenes.currentScene?.gameId === id, { timeout: 120000 }, id);
  await sleep(2500);
  await page.screenshot({ path: `${OUT}/g-${id}.png` });
  if (id === 'blackjack') {
    // Una mano vera, dal pulsante della console toccato col dito.
    await page.tap('.go-hud__bar .go-hud__primary');
    await sleep(6000);
    await page.screenshot({ path: `${OUT}/g-blackjack-hand.png` });
  }
  if (id === 'roulette') {
    const p = await page.evaluate(() => {
      const b = GO.scenes.currentScene.table.getBounds();
      const r = document.querySelector('canvas').getBoundingClientRect();
      const k = r.width / GO.game.app.renderer.screen.width;
      return { x: r.left + (b.x + b.width * 0.42) * k, y: r.top + (b.y + b.height * 0.3) * k };
    });
    await page.touchscreen.tap(p.x, p.y);
    await sleep(1200);
    const n = await page.evaluate(() => GO.scenes.currentScene.bets.size);
    console.log(`${n > 0 ? 'OK  ' : 'FAIL'} roulette: tocco sul tappeto posa una fiche (caselle=${n})`);
    await page.screenshot({ path: `${OUT}/g-roulette-tap.png` });
  }
}

if (!ONLY.length) {
  await page.setViewport(PORT_VP);
  await sleep(2000);
  await page.screenshot({ path: `${OUT}/p-rotate.png` });
  await page.evaluate(() => void GO.shell.exitGame());
  await idle();
  await sleep(2500);
  await page.screenshot({ path: `${OUT}/p-lobby.png` });
}
const vis = await page.evaluate(() => getComputedStyle(document.querySelector('.go-rotate')).display);
console.log('invito a ruotare ora:', vis);
console.log(errors.length ? `ERRORI:\n${errors.join('\n')}` : 'nessun errore in console');
await browser.close();
