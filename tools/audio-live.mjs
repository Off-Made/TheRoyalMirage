/**
 * Collaudo dell'audio nel gioco vero: sblocco al primo gesto, musica del
 * menu avviata, cambio di atmosfera, silenziamento totale.
 */
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'shell',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));
await page.setViewport({ width: 1280, height: 720 });
await page.goto('http://localhost:5273/', { waitUntil: 'networkidle2' });
await page.waitForFunction('window.GO && GO.audio', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
const before = await page.evaluate(() => ({ mood: GO.audio.currentMood, ctx: GO.audioState() }));
await page.keyboard.press('Shift');
await new Promise((r) => setTimeout(r, 1500));
const after = await page.evaluate(() => ({ mood: GO.audio.currentMood, ctx: GO.audioState(), ready: GO.audio.ready }));
await page.evaluate(() => GO.play('goldenOasis'));
await new Promise((r) => setTimeout(r, 6000));
const inGame = await page.evaluate(() => ({ mood: GO.audio.currentMood, scene: GO.scenes.currentScene?.name }));
await page.evaluate(() => GO.shell.exitGame());
await new Promise((r) => setTimeout(r, 4000));
const back = await page.evaluate(() => ({ mood: GO.audio.currentMood, scene: GO.scenes.currentScene?.name }));
await page.evaluate(() => GO.audio.setMood('silence'));
await new Promise((r) => setTimeout(r, 3200));
const muted = await page.evaluate(() => ({ mood: GO.audio.currentMood }));
await browser.close();
console.log(JSON.stringify({ before, after, inGame, back, muted, errors }, null, 2));
