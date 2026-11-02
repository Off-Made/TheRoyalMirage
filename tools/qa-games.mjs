/**
 * Collaudo contabile degli otto giochi, nel browser vero.
 *
 * Non giudica la grafica — per quella ci sono gli screenshot. Verifica cio'
 * che uno screenshot NON puo' mostrare: che il saldo si muova esattamente di
 * quanto dicono la puntata e la vincita. Una regola per tutti i giochi:
 *
 *     saldo_finale == saldo_iniziale − giocato + vincita
 *
 * Il saldo si legge dallo store (`GO.wallet()`), non dall'HUD: l'etichetta
 * arrotonda per la lettura ("10.0 K") e un errore da poche fiche sarebbe
 * invisibile.
 *
 * Dopo ogni gioco si esce in sala e si RIENTRA. Le fughe di stato — un timer
 * rimasto vivo, una giocata non chiusa, un listener di tastiera doppio — non
 * si vedono alla prima partita: si vedono alla seconda.
 *
 *   node tools/qa-games.mjs            # tutti
 *   node tools/qa-games.mjs roulette   # solo alcuni
 *
 * In headless il rendering e' software (~6 fps) e il tempo di gioco scorre
 * molto piu' lento del reale: le attese sono volutamente generose.
 */

import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  // Il rendering software e' lento e una `draw()` di gioco puo' restare in
  // attesa decine di secondi: col timeout di protocollo predefinito (30 s)
  // sarebbe lo STRUMENTO a fallire, non il gioco.
  protocolTimeout: 180000,
  args: [
    '--no-sandbox',
    '--mute-audio',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--window-size=1600,900',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });

const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() !== 'error') return;
  if (t.includes('favicon') || t.includes('404')) return;
  errors.push(`[console] ${t.slice(0, 160)}`);
});

await page.goto('http://localhost:5273/', { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction('window.GO && GO.wallet', { timeout: 60000 });
// Senza questo, GSAP rallenta di proposito il tempo di gioco quando un
// frame dura piu' di mezzo secondo (e qui, col rendering software, il bake
// di una texture ci arriva): una mano da 3 s ne impiegava 25.
await page.evaluate(() => GO.realTime?.());
await sleep(3000);

const balance = () => page.evaluate(() => GO.wallet().balance);
const spins = () => page.evaluate(() => GO.wallet().spins);
const scene = () => page.evaluate(() => GO.scenes.currentScene?.name ?? null);
/** Chiama un metodo della scena corrente. Le scene sono pilotabili dai loro metodi. */
const call = async (fn, ...args) => {
  const r = await rawCall(fn, ...args);
  // `rawCall` restituisce una stringa quando il metodo non esiste. Senza
  // questo controllo un nome sbagliato passava in silenzio e il verdetto
  // diventava un generico "nessuna giocata contabilizzata": l'errore
  // sembrava del gioco mentre era del collaudo.
  if (typeof r === 'string' && r.startsWith('metodo ')) throw new Error(`${r} sulla scena corrente`);
  return r;
};
const rawCall = (fn, ...args) =>
  page.evaluate(
    (f, a) => {
      const s = GO.scenes.currentScene;
      return typeof s?.[f] === 'function' ? s[f](...a) : `metodo ${f} assente`;
    },
    fn,
    args
  );
const setBet = (n) => page.evaluate((v) => GO.actions.setBet(v), n);

/**
 * Registra le contabilizzazioni vere.
 *
 * `wallet:settle` e' l'evento che lo store emette dentro `settle()`: e' lo
 * stesso percorso che muove il saldo e che alimenta i riconoscimenti.
 * Leggere da qui, e non da un campo che la scena espone per il collaudo,
 * significa misurare il gioco e non la sua dichiarazione di intenti — e fa
 * emergere il doppio accredito, che e' il difetto che piu' temiamo.
 */
const armLedger = () =>
  page.evaluate(() => {
    window.__qa = [];
    window.__qaBonus = [];
    window.__qaOff?.();
    window.__qaOffA?.();
    window.__qaOff = GO.bus.on('wallet:settle', (p) => window.__qa.push(p));
    // I riconoscimenti pagano una ricompensa sullo stesso portafoglio: se
    // non li contassimo, "prima puntata" + "prima vincita" (100 + 100)
    // sembrerebbero un accredito doppio del gioco. E' il primo falso
    // allarme che questo strumento ha prodotto.
    window.__qaOffA = GO.bus.on('achievement:unlocked', (p) => window.__qaBonus.push(p.id));
  });
/**
 * Attende che il gioco contabilizzi la giocata, invece di dormire a tempo.
 *
 * E' la differenza fra un collaudo che dipende dalla velocita' della
 * macchina e uno che dipende dal gioco: in headless il rendering software
 * fa variare la durata di una giocata di sei volte, e ogni `sleep` tarato
 * a mano era destinato a fallire sulla giocata piu' lenta.
 */
const waitSettle = async (limit = 90000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < limit) {
    if (await page.evaluate(() => (window.__qa ?? []).length > 0)) return true;
    await sleep(500);
  }
  return false;
};
/** Attende che la scena entri in una fase (es. 'hold' del video poker). */
const waitPhase = async (name, limit = 120000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < limit) {
    if (await page.evaluate((n) => GO.scenes.currentScene?.phase === n, name)) return true;
    await sleep(500);
  }
  throw new Error(`fase "${name}" non raggiunta in ${limit / 1000}s`);
};
const readLedger = () => page.evaluate(() => ({ settles: window.__qa ?? [], bonus: window.__qaBonus ?? [] }));

/**
 * Un verdetto per gioco. `play` deve restituire { staked, won } letti dal
 * GIOCO (non calcolati dal saldo, altrimenti il controllo sarebbe circolare).
 */
async function check(id, play, opts = {}) {
  const t0 = Date.now();
  const row = { game: id };
  try {
    const before = await balance();
    const spinsBefore = await spins();
    await page.evaluate((g) => GO.play(g), id);
    await sleep(opts.open ?? 4000);
    row.aperta = (await scene()) === id ? 'si' : `NO (${await scene()})`;

    await armLedger();
    const r = (await play()) ?? {};
    await sleep(opts.after ?? 1800);

    const after = await balance();
    const { settles, bonus } = await readLedger();
    row.saldo = `${before}→${after}`;
    row.prova = r.note ?? '';
    if (settles.length === 0) {
      row.contabilita = 'ERRORE nessuna giocata contabilizzata';
    } else if (settles.length > 1) {
      row.contabilita = `ERRORE ${settles.length} accrediti per una giocata`;
    } else {
      const { bet, payout } = settles[0];
      row.giocato = bet;
      row.vinto = payout;
      const premi = await page.evaluate(
        (ids) => ids.reduce((t, id) => t + (GO.achievementReward?.(id) ?? 0), 0),
        bonus
      );
      row.premi = premi || '';
      const expected = before - bet + payout + premi;
      row.contabilita = after === expected ? 'ok' : `ERRORE atteso ${expected}, trovato ${after}`;
    }
    row.giri = (await spins()) - spinsBefore;

    // Uscita e secondo ingresso.
    await page.evaluate(() => GO.shell.exitGame());
    await sleep(2800);
    row.uscita = (await scene()) === 'atmosphere' ? 'si' : `NO (${await scene()})`;
    const balAfterExit = await balance();
    await page.evaluate((g) => GO.play(g), id);
    await sleep(opts.open ?? 4000);
    row.rientro = (await scene()) === id ? 'si' : `NO (${await scene()})`;
    // Un saldo che cambia da solo fra l'uscita e il rientro = giocata fantasma.
    const balReenter = await balance();
    row.rientroSaldo = balReenter === balAfterExit ? 'stabile' : `DERIVA ${balAfterExit}→${balReenter}`;
    await page.evaluate(() => GO.shell.exitGame());
    await sleep(2200);
  } catch (e) {
    row.errore = String(e.message ?? e).slice(0, 140);
  }
  row.s = +((Date.now() - t0) / 1000).toFixed(0);
  return row;
}

/** Una slot: un giro completo. L'esito si legge dalla scena. */
const slotRun = (id) => () =>
  check(id, async () => {
    await setBet(10);
    // `spin()` e' il giro completo della slot: puntata, rulli, vincite,
    // giri gratis. Si attende la promise, non un tempo fisso.
    await page.evaluate(() => GO.scenes.currentScene.spin());
    return { note: 'un giro completo' };
  }, { open: 4500, after: 3000 });

const RUNS = {
  goldenOasis: slotRun('goldenOasis'),
  desertFalcon: slotRun('desertFalcon'),
  sheikhsFortune: slotRun('sheikhsFortune'),

  blackjack: () =>
    check('blackjack', async () => {
      await setBet(10);
      await call('deal');
      await sleep(7000);
      await call('stand');
      await waitSettle();
      return { note: 'mano: distribuisci + stai' };
    }, { after: 2500 }),

  roulette: () =>
    check('roulette', async () => {
      await setBet(10);
      await page.evaluate(() => {
        const s = GO.scenes.currentScene;
        s.addChips?.([{ id: 'red', amount: 10 }, { id: 'straight:17', amount: 10 }]);
      });
      await sleep(1200);
      await call('onPrimary');
      await waitSettle();
      return { note: 'rosso + pieno sul 17' };
    }, { after: 3000 }),

  baccarat: () =>
    check('baccarat', async () => {
      await setBet(10);
      await call('placeChip', 'player');
      await sleep(1000);
      await call('deal');
      await waitSettle();
      return { note: 'punto' };
    }, { after: 3000 }),

  videopoker: () =>
    check('videopoker', async () => {
      await call('betMax');
      await sleep(800);
      // `deal` va atteso per FASE, non a tempo: la prima mano cuoce le
      // texture delle facce delle carte e, col rendering software, cinque
      // carte possono prendere trenta secondi. Nessun `sleep` tarato a mano
      // sopravvive a una differenza del genere fra una macchina e l'altra.
      void rawCall('deal');
      await waitPhase('hold');
      await call('toggleHold', 0);
      await sleep(1200);
      void rawCall('draw');
      await waitSettle();
      return { note: 'punta max, tieni 1, pesca' };
    }, { after: 2500 }),

  crash: () =>
    check('crash', async () => {
      await setBet(10);
      await call('onPrimary');
      await sleep(9000);
      await call('cashOut');
      await waitSettle();
      return { note: 'volo + incasso' };
    }, { after: 3000 }),
};

const ids = only.length ? only : Object.keys(RUNS);
const rows = [];
for (const id of ids) {
  if (!RUNS[id]) {
    rows.push({ game: id, errore: 'gioco sconosciuto' });
    continue;
  }
  rows.push(await RUNS[id]());
}

await browser.close();
console.table(rows);
if (errors.length) {
  console.log('\n── ERRORI DI CONSOLE ──');
  for (const e of [...new Set(errors)]) console.log(e);
}
const bad = rows.filter(
  (r) => r.errore || r.aperta?.startsWith('NO') || r.rientro?.startsWith('NO') ||
         String(r.contabilita).startsWith('ERRORE') || String(r.rientroSaldo).startsWith('DERIVA')
);
console.log(bad.length ? `\nDA CORREGGERE: ${bad.map((r) => r.game).join(', ')}` : '\nTutti i giochi: apertura, giocata, contabilita, uscita e rientro a posto.');
process.exit(bad.length || errors.length ? 1 : 0);
