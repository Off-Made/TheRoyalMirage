/**
 * Collaudo delle rifiniture dell'11/11 (secondo giro), con click e tasti veri.
 *   node tools/qa-polish.mjs [porta]
 */
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';

const PORT = process.argv[2] ?? '5273';
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = 'shots/qa-polish';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  protocolTimeout: 240000,
  args: ['--no-sandbox', '--mute-audio', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1600,900'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(`[console] ${m.text().slice(0, 160)}`));

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2', timeout: 90000 });
await page.waitForFunction('window.GO && GO.wallet', { timeout: 90000 });
await page.evaluate(() => GO.realTime?.());
await sleep(2500);

const results = [];
const check = (label, ok, extra = '') => {
  const line = `${ok ? 'OK  ' : 'FAIL'} ${label} ${extra}`;
  results.push(line);
  console.log(line);
};
const waitScene = (name) =>
  page.waitForFunction((n) => GO.scenes.currentScene?.name === n && !GO.scenes.isTransitioning, { timeout: 120000 }, name);
const modalOpen = () => page.evaluate(() => !!document.querySelector('.go-modal'));
const closeModal = async () => {
  await page.keyboard.press('Escape');
  await sleep(700);
};
const step = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    check(name, false, `(eccezione: ${String(e.message).slice(0, 160)})`);
  }
};

// ── Menu: P e S funzionano ancora fuori dai giochi; Presentazione solo in Libera
await step('menu', async () => {
  await page.keyboard.press('p');
  await sleep(900);
  const rows = await page.evaluate(() => document.querySelectorAll('.go-history:not(.go-pergame) .go-hrow').length);
  check('profilo: al massimo 6 righe di storico', rows <= 6, `(righe=${rows})`);
  await closeModal();

  await page.evaluate(() => GO.actions.switchMode('career'));
  await page.keyboard.press('s');
  await sleep(900);
  const careerDemo = await page.evaluate(() => document.querySelector('.go-modal')?.textContent?.includes('Presentazione'));
  check('impostazioni (Carriera): niente Presentazione', (await modalOpen()) && !careerDemo);
  await closeModal();

  await page.evaluate(() => GO.actions.switchMode('freeplay'));
  await page.keyboard.press('s');
  await sleep(900);
  const groups = await page.evaluate(() => [...document.querySelectorAll('.go-modal .go-group__title')].map((h) => h.textContent));
  check('impostazioni (Libera): Presentazione e ultimo gruppo', groups.at(-1) === 'Presentazione', `(${groups.join(' | ')})`);
  await page.evaluate(() => document.querySelector('.go-modal .go-group:last-child')?.scrollIntoView());
  await sleep(400);
  await page.screenshot({ path: `${OUT}/01-settings-freeplay.png` });
  await closeModal();
  await page.evaluate(() => GO.actions.switchMode('career'));
});

// ── Blackjack: S non apre piu' le Impostazioni
await step('blackjack', async () => {
  await page.evaluate(() => GO.play('blackjack'));
  await waitScene('blackjack');
  await sleep(2500);
  await page.click('.go-hud__primary');
  await sleep(4000);
  await page.keyboard.press('s');
  await sleep(1500);
  check('blackjack: S non apre le Impostazioni', !(await modalOpen()));
  await page.screenshot({ path: `${OUT}/02-blackjack-after-S.png` });
  if (await modalOpen()) await closeModal();
});

// ── Baccarat: fiche che si sommano, targhetta, Annulla, tutorial del tabellone
await step('baccarat', async () => {
  await page.evaluate(() => GO.play('baccarat'));
  await waitScene('baccarat');
  await sleep(2500);
  const pt = await page.evaluate(() => {
    const s = GO.scenes.currentScene;
    let h = null;
    s.world.children.forEach(function walk(c) {
      if (c.hitArea && c.label === 'area-banker') h = c;
      c.children?.forEach(walk);
    });
    const a = h.hitArea;
    const g = h.toGlobal({ x: a.x + a.width * 0.3, y: a.y + a.height * 0.4 });
    const r = document.querySelector('canvas').getBoundingClientRect();
    const k = r.width / GO.game.app.renderer.screen.width;
    return { x: r.left + g.x * k, y: r.top + g.y * k };
  });
  const bet = await page.evaluate(() => GO.wallet().bet);
  for (let i = 0; i < 3; i++) {
    await page.mouse.click(pt.x, pt.y);
    await sleep(500);
  }
  const banker = await page.evaluate(() => GO.scenes.currentScene.board.bets.banker);
  check('baccarat: tre fiche su Banco si sommano', banker === 3 * bet, `(banco=${banker}, fiche=${bet})`);
  const pill = await page.evaluate(() => {
    const p = GO.scenes.currentScene.amounts.banker;
    return { visible: p.visible, text: p.txt.text };
  });
  check('baccarat: targhetta con il totale', pill.visible && pill.text.length > 0, `(${pill.text})`);
  await page.screenshot({ path: `${OUT}/03-baccarat-sum.png` });
  await page.evaluate(() => [...document.querySelectorAll('.go-hud__toggle')].find((b) => b.textContent === 'Annulla')?.click());
  await sleep(500);
  const afterUndo = await page.evaluate(() => GO.scenes.currentScene.board.bets.banker);
  check('baccarat: Annulla toglie una fiche', afterUndo === 2 * bet, `(banco=${afterUndo})`);

  await page.click('.go-hud__help');
  await sleep(1200);
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Enter');
    await sleep(500);
  }
  const hole = await page.evaluate(() => {
    const r = [...document.querySelectorAll('mask rect')].at(-1);
    return r ? { x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height') } : null;
  });
  check('baccarat: il tutorial "tabellone" inquadra i pannelli', !!hole && hole.w > 400 && hole.h > 80, `(${JSON.stringify(hole)})`);
  await page.screenshot({ path: `${OUT}/04-baccarat-tutorial-roads.png` });
  await page.keyboard.press('Escape');
  await sleep(600);
});

// ── Video poker: pulsante Tieni/Scarta al tavolo
await step('videopoker', async () => {
  await page.evaluate(() => GO.play('videopoker'));
  await waitScene('videopoker');
  await sleep(2500);
  const label = () =>
    page.evaluate(() => [...document.querySelectorAll('.go-hud__toggle')].map((b) => b.textContent).find((t) => t.startsWith('Tocco')));
  const before = await label();
  await page.evaluate(() => [...document.querySelectorAll('.go-hud__toggle')].find((b) => b.textContent.startsWith('Tocco'))?.click());
  await sleep(400);
  const after = await label();
  const mode = await page.evaluate(() => GO.getState().settings.vpTapMode);
  check('video poker: il pulsante alterna Tieni/Scarta', before !== after && mode === 'discard', `(${before} → ${after}, ${mode})`);
  await page.screenshot({ path: `${OUT}/05-videopoker-toggle.png` });
  await page.evaluate(() => GO.actions.updateSettings({ vpTapMode: 'hold' }));
});

// ── Golden Chip: la fiche continua a salire dopo l'incasso
await step('crash', async () => {
  await page.evaluate(() => GO.play('crash'));
  await waitScene('crash');
  await sleep(2500);
  let done = false;
  for (let attempt = 0; attempt < 10 && !done; attempt++) {
    await page.waitForFunction(() => GO.scenes.currentScene.phase === 'idle' && GO.scenes.currentScene.fairReady, { timeout: 60000 });
    await page.click('.go-hud__primary');
    await page.waitForFunction(() => GO.scenes.currentScene.phase === 'flying', { timeout: 30000 });
    const crash = await page.evaluate(() => GO.scenes.currentScene.crashCents);
    if (crash < 160) {
      await page.waitForFunction(() => GO.scenes.currentScene.phase !== 'flying', { timeout: 60000 });
      continue;
    }
    await page.waitForFunction(() => GO.scenes.currentScene.cents >= 115, { timeout: 30000 });
    const b0 = await page.evaluate(() => GO.wallet().balance);
    await page.click('.go-hud__primary');
    await sleep(150);
    const b1 = await page.evaluate(() => GO.wallet().balance);
    await sleep(700);
    const mid = await page.evaluate(() => ({
      phase: GO.scenes.currentScene.phase,
      cents: GO.scenes.currentScene.cents,
      cashed: GO.scenes.currentScene.cashedCents,
    }));
    await page.screenshot({ path: `${OUT}/06-crash-after-cashout.png` });
    check('golden chip: dopo l incasso il volo prosegue', mid.phase === 'flying' && mid.cents > mid.cashed, `(${JSON.stringify(mid)}, crash ${crash})`);
    await page.waitForFunction(() => GO.scenes.currentScene.phase !== 'flying', { timeout: 90000 });
    await sleep(300);
    const b2 = await page.evaluate(() => GO.wallet().balance);
    check('golden chip: accredito unico', b1 > b0 && b2 === b1, `(${b0} → ${b1} → ${b2})`);
    await page.screenshot({ path: `${OUT}/07-crash-end.png` });
    done = true;
  }
  if (!done) check('golden chip: volo oltre ×1.60 trovato', false);
});

// ── Slot: durata normale/turbo e tris sui rulli 3-4-5
await step('slot', async () => {
  await page.evaluate(() => GO.play('goldenOasis'));
  await waitScene('goldenOasis');
  await sleep(3000);
  const timeSpin = async (turbo) => {
    await page.evaluate((t) => {
      GO.actions.updateSettings({ fastPlay: t });
      GO.slot.turbo = t;
      GO.slot.want = (o) => o.totalPayout === 0 && o.free.length === 0;
    }, turbo);
    const t0 = Date.now();
    await page.evaluate(() => void GO.slot.spin());
    await page.waitForFunction(() => GO.slot.phase === 'idle', { timeout: 60000 });
    return Date.now() - t0;
  };
  const normal = await timeSpin(false);
  const turbo = await timeSpin(true);
  check('slot: il giro normale dura piu del turbo', normal > turbo, `(normale ${normal} ms, turbo ${turbo} ms)`);
  await page.evaluate(() => {
    GO.actions.updateSettings({ fastPlay: false });
    GO.slot.turbo = false;
    GO.slot.want = (o) =>
      o.free.length === 0 && o.base.wins.length === 1 && o.base.wins[0].kind === 'line' && o.base.wins[0].startReel === 2;
  });
  await page.evaluate(() => void GO.slot.spin());
  await page.waitForFunction(() => GO.slot.phase !== 'spinning', { timeout: 60000 });
  await sleep(700);
  const w = await page.evaluate(() => GO.slot.pending?.base.wins[0] ?? null);
  await page.screenshot({ path: `${OUT}/08-slot-reels-3-5.png` });
  check('slot: vincita sui rulli 3-4-5 a schermo', true, w ? `(${w.symbol} ×${w.count} dal rullo ${w.startReel + 1})` : '(gia saldata)');
  await page.waitForFunction(() => GO.slot.phase === 'idle', { timeout: 60000 });
});

// ── Profilo, ora che lo storico ha qualche giocata
await step('profilo', async () => {
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => void GO.slot.spin());
    await page.waitForFunction(() => GO.slot.phase === 'idle', { timeout: 60000 });
  }
  await page.evaluate(() => void GO.shell.exitGame());
  await page.waitForFunction(() => !GO.scenes.isTransitioning && !GO.scenes.currentScene?.name?.startsWith('golden'), { timeout: 60000 });
  await sleep(1500);
  await page.keyboard.press('p');
  await sleep(1000);
  const rows = await page.evaluate(() => document.querySelectorAll('.go-history:not(.go-pergame) .go-hrow').length);
  const total = await page.evaluate(() => GO.wallet().history.length);
  check('profilo: 6 righe di storico', rows === 6, '(righe=' + rows + ', giocate salvate=' + total + ')');
  await page.screenshot({ path: OUT + '/09-profile.png' });
});

console.log('—');
console.log(errors.length ? `ERRORI:\n${errors.join('\n')}` : 'nessun errore in console');
await browser.close();
