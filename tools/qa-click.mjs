/**
 * Collaudo dei CLICK VERI sui giochi Pixi (roulette, baccarat, video poker)
 * e screenshot della transizione `chip`. A differenza di qa-games.mjs non
 * chiama i metodi della scena: preme il mouse dove lo premerebbe un giocatore,
 * cosi' un overlay DOM che ruba i click fa fallire il collaudo.
 *
 *   node tools/qa-click.mjs
 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = 'shots/qa-click';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  protocolTimeout: 180000,
  args: ['--no-sandbox', '--mute-audio', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1600,900'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(`[console] ${m.text().slice(0, 160)}`));

await page.goto('http://localhost:5273/', { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction('window.GO && GO.wallet', { timeout: 60000 });
await page.evaluate(() => GO.realTime?.());
await sleep(3000);

const scene = () => page.evaluate(() => GO.scenes.currentScene?.name ?? null);
const waitScene = (name) => page.waitForFunction((n) => GO.scenes.currentScene?.name === n && !GO.scenes.isTransitioning, { timeout: 120000 }, name);

/** Punto CSS di un oggetto Pixi della scena, a frazioni (fx, fy) dei suoi bounds. */
const pointOf = (prop, fx, fy) =>
  page.evaluate(
    (prop, fx, fy) => {
      const s = GO.scenes.currentScene;
      const obj = prop.split('.').reduce((o, k) => o?.[k], s);
      const b = obj.getBounds();
      const canvas = document.querySelector('canvas');
      const r = canvas.getBoundingClientRect();
      const k = r.width / GO.game.app.renderer.screen.width;
      return { x: r.left + (b.x + b.width * fx) * k, y: r.top + (b.y + b.height * fy) * k };
    },
    prop, fx, fy
  );

const results = [];
const check = (label, ok, extra = '') => {
  results.push(`${ok ? 'OK  ' : 'FAIL'} ${label} ${extra}`);
};

const ONLY_BACC = process.argv.includes('--baccarat');
if (!ONLY_BACC) {
// ── Transizione: menu → sala (screenshot a meta' cover)
await page.evaluate(() => void GO.shell.goLobby());
await sleep(250);
await page.screenshot({ path: `${OUT}/t1-menu-lobby.png` });
await sleep(4000);

// ── Sala → roulette con la transizione vera
await page.evaluate(() => void GO.shell.enterGame('roulette'));
await sleep(300);
await page.screenshot({ path: `${OUT}/t2-enter-roulette.png` });
await waitScene('roulette');
await sleep(2500);

// Click sul tappeto e sulla racetrack.
let p = await pointOf('table', 0.42, 0.3);
await page.mouse.click(p.x, p.y);
await sleep(1500);
const afterTable = await page.evaluate(() => GO.scenes.currentScene.bets.size);
check('roulette: click sul tappeto posa una fiche', afterTable > 0, `(caselle=${afterTable})`);
p = await pointOf('racetrack', 0.5, 0.5);
await page.mouse.click(p.x, p.y);
await sleep(1500);
const afterRt = await page.evaluate(() => GO.scenes.currentScene.bets.size);
check('roulette: click sulla racetrack posa fiche', afterRt > afterTable, `(caselle=${afterRt})`);
await page.screenshot({ path: `${OUT}/r1-bets.png` });

// Pulsante HUD "Gira" ancora cliccabile (click vero).
const before = await page.evaluate(() => GO.wallet().balance);
await page.click('.go-hud__bar .go-btn--primary');
await page.waitForFunction(() => GO.scenes.currentScene.phase === 'result', { timeout: 120000 });
const after = await page.evaluate(() => GO.wallet().balance);
check('roulette: «Gira» dal HUD gioca e salda', after !== before, `(saldo ${before} → ${after})`);
await page.screenshot({ path: `${OUT}/r2-result.png` });

// ── Uscita verso la sala con la transizione
await page.evaluate(() => void GO.shell.exitGame());
await sleep(300);
await page.screenshot({ path: `${OUT}/t3-exit.png` });
await page.waitForFunction(() => GO.scenes.currentScene?.name !== 'roulette' && !GO.scenes.isTransitioning, { timeout: 120000 });
await sleep(2000);

}
// ── Baccarat: click Pixi su un riquadro di puntata
await page.evaluate(() => GO.play('baccarat'));
await waitScene('baccarat');
await sleep(2500);
const bacc = await page.evaluate(() => {
  const s = GO.scenes.currentScene;
  const hits = [];
  s.world.children.forEach(function walk(c) {
    if (c.eventMode === 'static') hits.push(c);
    c.children?.forEach(walk);
  });
  // Le zone del baccarat sono Container vuoti con `hitArea`: i bounds sono nulli.
  const h = hits.find((c) => c.hitArea) ?? hits[0];
  const a = h.hitArea;
  const g = h.toGlobal({ x: a.x + a.width / 2, y: a.y + a.height / 2 });
  const r = document.querySelector('canvas').getBoundingClientRect();
  const k = r.width / GO.game.app.renderer.screen.width;
  return { x: r.left + g.x * k, y: r.top + g.y * k, n: hits.length };
});
const stakeBefore = await page.evaluate(() => JSON.stringify(GO.scenes.currentScene.board?.bets ?? null));
await page.mouse.click(bacc.x, bacc.y);
await sleep(1500);
const stakeAfter = await page.evaluate(() => JSON.stringify(GO.scenes.currentScene.board?.bets ?? null));
check('baccarat: click sul riquadro cambia la puntata', stakeBefore !== stakeAfter, `(${stakeBefore} → ${stakeAfter})`);
await page.screenshot({ path: `${OUT}/b1.png` });

console.log(results.join('\n'));
console.log(errors.length ? `ERRORI:\n${errors.join('\n')}` : 'nessun errore in console');
await browser.close();
