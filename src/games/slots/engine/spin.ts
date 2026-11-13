/**
 * THE ROYAL MIRAGE — Esecuzione di una giocata
 *
 * `playRound` calcola TUTTA la giocata nel momento del click: giro base,
 * eventuale sessione di giri gratuiti, eventuale Hold & Win. La vista poi
 * "recita" un esito gia' deciso.
 *
 * E' cosi' che funzionano le slot reali, e ha due conseguenze utili:
 *   · la matematica e' simulabile senza vista (test RTP a milioni di giri)
 *   · uscire a meta' animazione non cambia niente: la vincita e' nota e
 *     viene pagata subito (vedi `GameScene.resolvePending`)
 */

import type { Rng } from './rng';
import type {
  Grid,
  HoldAndWinOutcome,
  MachineDef,
  RoundOutcome,
  SpinOutcome,
  SymId,
  WinLine,
} from './types';
import { evaluateLines, evaluateScatter, evaluateWays, expandWilds } from './evaluate';
import { countSymbol, runCascade, runChests, runWheel } from './bonus';
import type { CascadeOutcome, ChestOutcome, WheelOutcome } from './types';

/** Estrae gli stop e costruisce la griglia visibile. */
export function spinGrid(
  m: MachineDef,
  strips: readonly (readonly SymId[])[],
  rng: Rng
): { grid: Grid; stops: number[] } {
  const stops: number[] = [];
  const grid: Grid = [];
  for (let r = 0; r < m.reels; r++) {
    const strip = strips[r]!;
    const stop = rng.int(strip.length);
    stops.push(stop);
    const col: SymId[] = [];
    for (let row = 0; row < m.rows; row++) col.push(strip[(stop + row) % strip.length]!);
    grid.push(col);
  }
  return { grid, stops };
}

/** Valuta una griglia gia' estratta. Separata da `spinGrid` per i test. */
export function evaluateGrid(
  m: MachineDef,
  raw: Grid,
  stops: readonly number[],
  bet: number,
  phase: 'base' | 'free',
  multiplier = 1
): SpinOutcome {
  const lineBet = bet / m.betDivisor;
  const { grid, reels: expandedReels } = expandWilds(m, raw, phase);

  const wins: WinLine[] =
    m.evalMode === 'ways' ? evaluateWays(m, grid, lineBet, multiplier) : evaluateLines(m, grid, lineBet, multiplier);

  // Lo scatter si conta sulla griglia ORIGINALE: un wild espanso non deve
  // coprire uno scatter atterrato sotto di lui.
  const sc = evaluateScatter(m, raw, bet, multiplier);
  if (sc.win) wins.push(sc.win);

  const payout = wins.reduce((s, w) => s + w.payout, 0);
  return { grid: raw, wins, payout, freeSpinsAwarded: sc.freeSpins, expandedReels, stops, multiplier };
}

function pickWeighted(values: readonly number[], weights: readonly number[], rng: Rng): number {
  let total = 0;
  for (const w of weights) total += w;
  let x = rng.next() * total;
  for (let i = 0; i < values.length; i++) {
    x -= weights[i]!;
    if (x < 0) return values[i]!;
  }
  return values[values.length - 1]!;
}

/** Valori delle monete visibili in griglia (per mostrarli gia' nel giro base). */
function coinValuesFor(m: MachineDef, grid: Grid, rng: Rng): (number | null)[][] | undefined {
  const hw = m.holdAndWin;
  if (!hw) return undefined;
  return grid.map((col) => col.map((id) => (id === hw.coin ? pickWeighted(hw.values, hw.weights, rng) : null)));
}

/**
 * Hold & Win: le monete si bloccano, le celle libere girano. Ogni moneta
 * nuova riporta i respin al massimo. Finisce a respin esauriti o griglia piena.
 */
export function runHoldAndWin(m: MachineDef, initial: readonly (readonly (number | null)[])[], bet: number, rng: Rng): HoldAndWinOutcome {
  const hw = m.holdAndWin!;
  const cells = initial.map((c) => c.slice());
  const respins: HoldAndWinOutcome['respins'][number][] = [];
  const total = m.reels * m.rows;
  let filled = cells.flat().filter((v) => v !== null).length;
  let left = hw.respins;

  while (left > 0 && filled < total) {
    const landed: { reel: number; row: number; value: number }[] = [];
    for (let r = 0; r < m.reels; r++) {
      for (let row = 0; row < m.rows; row++) {
        if (cells[r]![row] !== null) continue;
        if (rng.chance(hw.landChance)) {
          const value = pickWeighted(hw.values, hw.weights, rng);
          cells[r]![row] = value;
          landed.push({ reel: r, row, value });
          filled++;
        }
      }
    }
    left = landed.length > 0 ? hw.respins : left - 1;
    respins.push({ landed, left: filled >= total ? 0 : left });
  }

  const sum = cells.flat().reduce<number>((s, v) => s + (v ?? 0), 0);
  // Griglia piena = jackpot massimo, in aggiunta al valore delle monete.
  const jackpot = filled >= total ? hw.jackpots[hw.jackpots.length - 1] : undefined;
  const payout = (sum + (jackpot?.mult ?? 0)) * bet;
  return { cells, initial: initial.map((c) => c.slice()), respins, jackpot, payout };
}

/** Una giocata completa. `bet` e' la puntata totale in fiche. */
export function playRound(m: MachineDef, bet: number, rng: Rng): RoundOutcome {
  const { grid, stops } = spinGrid(m, m.strips, rng);
  const base = evaluateGrid(m, grid, stops, bet, 'base');
  base.coinValues = coinValuesFor(m, grid, rng);

  const free: SpinOutcome[] = [];
  const fsRule = m.freeSpins;
  let left = base.freeSpinsAwarded;
  const cap = fsRule?.cap ?? 100;
  let played = 0;
  while (left > 0 && played < cap) {
    left--;
    const ladder = fsRule?.ladder;
    const mult = ladder ? ladder[Math.min(played, ladder.length - 1)]! : 1;
    const sg = spinGrid(m, fsRule?.strips ?? m.strips, rng);
    const o = evaluateGrid(m, sg.grid, sg.stops, bet, 'free', mult);
    free.push(o);
    played++;
    if (fsRule?.retrigger && o.freeSpinsAwarded > 0) left += o.freeSpinsAwarded;
  }

  let holdAndWin: HoldAndWinOutcome | undefined;
  const hw = m.holdAndWin;
  if (hw && base.coinValues) {
    const coins = base.coinValues.flat().filter((v) => v !== null).length;
    if (coins >= hw.trigger) holdAndWin = runHoldAndWin(m, base.coinValues, bet, rng);
  }

  // Bonus interni: contano i simboli sulla griglia ORIGINALE del giro base
  // (un wild espanso non copre un simbolo bonus atterrato sotto di lui).
  let wheel: WheelOutcome | undefined;
  if (m.wheel && countSymbol(grid, m.wheel.symbol) >= m.wheel.trigger) wheel = runWheel(m.wheel, bet, rng);

  let cascade: CascadeOutcome | undefined;
  if (m.cascade) {
    const n = countSymbol(grid, m.cascade.symbol);
    const award = bonusAtMost(m.cascade.spins, n);
    if (award > 0) cascade = runCascade(m, m.cascade, award, bet, rng);
  }

  let chests: ChestOutcome | undefined;
  if (m.chests) {
    const n = countSymbol(grid, m.chests.symbol);
    if (n >= m.chests.trigger) chests = runChests(m.chests, n, bet, rng);
  }

  const out: RoundOutcome = { base, free, holdAndWin, wheel, cascade, chests, totalPayout: 0, bet };
  return { ...out, totalPayout: payoutCents(rawPayout(out)) };
}

/** Valore della tabella per il conteggio piu' alto <= n; 0 se nessuno. */
function bonusAtMost(table: Readonly<Record<number, number>>, n: number): number {
  let best = 0;
  let bestKey = -1;
  for (const [k, v] of Object.entries(table)) {
    const kk = Number(k);
    if (kk <= n && kk > bestKey) {
      bestKey = kk;
      best = v;
    }
  }
  return best;
}

/**
 * Da vincita esatta (frazioni di centesimo) a centesimi da accreditare.
 *
 * Arrotonda al centesimo piu' vicino, come sempre, con UNA eccezione: una
 * vincita vera non vale mai 0,00 €. Con le puntate piu' basse la puntata
 * base delle slot a combinazioni scende sotto il centesimo (0,10 € ÷ 50 =
 * 0,2 centesimi) e i premi minori finivano arrotondati a zero: il giocatore
 * vedeva una combinazione illuminata e riceveva 0,00 €.
 *
 * Tutte le altre vincite restano identiche. L'effetto sull'RTP esiste solo
 * sotto i ~0,50 € di puntata ed e' di qualche decimo di punto a 0,10 €.
 */
export function payoutCents(raw: number): number {
  if (!(raw > 0)) return 0;
  return Math.max(1, Math.round(raw));
}

/** Payout esatto (non arrotondato), per le simulazioni RTP. */
export function rawPayout(r: RoundOutcome): number {
  return (
    r.base.payout +
    r.free.reduce((s, f) => s + f.payout, 0) +
    (r.holdAndWin?.payout ?? 0) +
    (r.wheel?.payout ?? 0) +
    (r.cascade?.payout ?? 0) +
    (r.chests?.payout ?? 0)
  );
}
