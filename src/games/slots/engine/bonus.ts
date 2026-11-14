/**
 * THE ROYAL MIRAGE — Bonus interni delle slot
 *
 *   · Ruota della fortuna (Lucky Sevens)
 *   · Cascata (Hollywood Nights)
 *   · Forzieri (Diamond Royale)
 *
 * Come i giri gratis e l'Hold & Win, ogni bonus e' calcolato PER INTERO nel
 * momento del click: la vista poi "recita" un esito gia' deciso. Uscire a
 * meta' animazione non cambia niente, e la matematica e' simulabile a
 * milioni di giri senza vista (test RTP).
 *
 * Tutte le funzioni sono pure a parte l'`Rng` che ricevono.
 */

import type { Rng } from './rng';
import type {
  CascadeOutcome,
  CascadeRule,
  CascadeStep,
  ChestOutcome,
  ChestRule,
  Grid,
  MachineDef,
  SymId,
  WheelOutcome,
  WheelRule,
  WheelSegment,
} from './types';
import { evaluateWays, evaluateLines, expandWilds } from './evaluate';

/** Quante volte compare un simbolo sulla griglia. */
export function countSymbol(grid: Grid, id: SymId): number {
  let n = 0;
  for (const col of grid) for (const s of col) if (s === id) n++;
  return n;
}

function pickIndex(weights: readonly number[], rng: Rng): number {
  let total = 0;
  for (const w of weights) total += w;
  let x = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i]!;
    if (x < 0) return i;
  }
  return weights.length - 1;
}

// ═══════════════════════════════════════════════ RUOTA DELLA FORTUNA

/** Uno spicchio "scarso": NULLA o un moltiplicatore basso. */
function isLow(rule: WheelRule, s: WheelSegment): boolean {
  return s.kind === 'blank' || (s.kind === 'mult' && s.value <= rule.lowUpTo);
}

/**
 * Pesi correnti degli spicchi.
 *   · `damped`: dopo un premio alto, i premi alti pesano meno (freno)
 *   · `boosted`: dopo un giro scarso, i moltiplicatori grandi pesano di piu'
 *     e quelli scarsi di meno (rimonta)
 */
export function wheelWeights(rule: WheelRule, damped: boolean, boosted = false, first = false): number[] {
  // Primo giro: pesi quasi uniformi, senza freno ne' rimonta.
  if (first) return rule.segments.map((s) => s.first ?? s.weight);
  return rule.segments.map((s) => {
    let w = s.weight;
    if (boosted) {
      // Dopo un giro scarso: piu' moltiplicatori grandi, meno spicchi scarsi
      // e meno STOP (chiudere la ruota proprio adesso sarebbe una beffa).
      if (s.kind === 'mult' && s.value >= rule.boostFrom) w *= rule.boostHigh;
      else if (isLow(rule, s) || s.kind === 'stop') w *= rule.boostLow;
    }
    if (damped && s.kind === 'mult' && s.value >= rule.highFrom) w *= rule.highDamp;
    return w;
  });
}

/**
 * La ruota MOLTIPLICA la vincita. Finche' non esce un moltiplicatore la
 * vincita e' 0; il primo moltiplicatore si applica alla puntata, i
 * successivi a quanto accumulato. Con 1 € puntato: ×2 → 2 €, poi ×3 → 6 €.
 * "NULLA" non vince niente in quel giro (la vincita resta quella che era,
 * anche 0). `total` e' il moltiplicatore accumulato, con il tetto `maxTotal`.
 */
export function runWheel(rule: WheelRule, bet: number, rng: Rng): WheelOutcome {
  const spins: { segment: number; total: number; left: number }[] = [];
  let left = rule.spins;
  let total = 0;
  let damped = false;
  let boosted = false;
  while (left > 0 && spins.length < rule.maxSpins) {
    const i = pickIndex(wheelWeights(rule, damped, boosted, spins.length === 0), rng);
    const seg: WheelSegment = rule.segments[i]!;
    // La rimonta vale solo per il giro subito dopo uno scarso.
    boosted = isLow(rule, seg);
    left--;
    if (seg.kind === 'mult') {
      total = Math.min(rule.maxTotal, total === 0 ? seg.value : total * seg.value);
      if (seg.value >= rule.highFrom) damped = true;
    } else if (seg.kind === 'blank') {
      // Giro a vuoto: niente da aggiungere, la vincita accumulata resta.
    } else if (seg.kind === 'spin') {
      // ALTRO GIRO: il giro appena fatto non si conta e se ne aggiunge uno
      // (con 2 giri rimasti se ne hanno 3).
      left += 2;
    } else {
      left = 0;
    }
    // Il tetto vale anche per i "+1": all'ultimo giro consentito non se ne aggiungono.
    if (spins.length + 1 >= rule.maxSpins) left = 0;
    spins.push({ segment: i, total, left });
  }
  return { spins, total, payout: total * bet };
}

// ═══════════════════════════════════════════════ CASCATA

/**
 * Nella cascata non compaiono gli scatter; il simbolo bonus solo se puo'
 * aggiungere giri (e allora sta nelle strisce proprie della cascata).
 */
function cascadeStrips(m: MachineDef): SymId[][] {
  const drop = new Set<SymId>();
  if (!(m.cascade!.retriggerSpins > 0)) drop.add(m.cascade!.symbol);
  for (const s of m.symbols) if (s.scatter) drop.add(s.id);
  return (m.cascade!.strips ?? m.strips).map((st) => st.filter((id) => !drop.has(id)));
}

const stripCache = new WeakMap<MachineDef, SymId[][]>();
function stripsFor(m: MachineDef): SymId[][] {
  let s = stripCache.get(m);
  if (!s) {
    s = cascadeStrips(m);
    stripCache.set(m, s);
  }
  return s;
}

/**
 * Esegue il bonus a cascata.
 *
 * Ogni rullo ricorda la posizione della cella piu' in alto (`top`): quando
 * esplodono k simboli, quelli rimasti scendono e dall'alto entrano i k
 * simboli che sulla striscia stanno sopra `top`, come se il rullo
 * scorresse. Cosi' la cascata rispetta le stesse frequenze del rullo.
 */
export function runCascade(m: MachineDef, rule: CascadeRule, spinsAwarded: number, bet: number, rng: Rng): CascadeOutcome {
  const strips = stripsFor(m);
  const lineBet = bet / m.betDivisor;
  const steps: CascadeStep[] = [];
  let left = spinsAwarded;
  let payout = 0;
  let grid: Grid | null = null;
  let top: number[] = [];
  let chain = 0;
  let explode: (readonly [number, number])[] = [];
  let retriggers = 0;
  let won = false;
  /** L'ultimo giro era una griglia nuova senza vincite. */
  let freshMiss = false;
  /** Griglie nuove senza vincite di fila (per il recupero). */
  let misses = 0;

  const evaluate = (g: Grid, mult: number) => {
    const { grid: evalGrid } = expandWilds(m, g, 'base');
    return m.evalMode === 'ways' ? evaluateWays(m, evalGrid, lineBet, mult) : evaluateLines(m, evalGrid, lineBet, mult);
  };
  const deal = () => {
    const st = strips.map((x) => rng.int(x.length));
    const g = strips.map((x, r) => Array.from({ length: m.rows }, (_, row) => x[(st[r]! + row) % x.length]!));
    return { stops: st, grid: g };
  };

  while (left > 0) {
    let kind: 'fresh' | 'drop';
    let stops: number[] | undefined;
    let rescue = false;
    if (grid === null || explode.length === 0) {
      kind = 'fresh';
      // Il moltiplicatore scende di un gradino SOLO dopo una griglia nuova
      // senza vincite (`stepBack`). Se finisce una catena di vincite resta
      // dov'e'. Senza `stepBack` torna a ×1 a ogni griglia nuova.
      if (!rule.stepBack) chain = 0;
      else if (freshMiss) chain = Math.max(0, chain - 1);
      const mult = rule.ladder[Math.min(chain, rule.ladder.length - 1)]!;
      let d = deal();
      // Recupero: dopo `pityAfter` griglie di fila senza vincite, la
      // prossima e' una griglia che vince qualcosa.
      if (rule.pityAfter && misses >= rule.pityAfter) {
        rescue = true;
        for (let k = 0; k < 60 && evaluate(d.grid, mult).length === 0; k++) d = deal();
      }
      stops = d.stops;
      top = stops.slice();
      grid = d.grid;
    } else {
      kind = 'drop';
      const gone = new Set(explode.map(([r, row]) => `${r},${row}`));
      grid = grid.map((col, r) => {
        const keep = col.filter((_, row) => !gone.has(`${r},${row}`));
        const k = col.length - keep.length;
        const st = strips[r]!;
        const fresh: SymId[] = [];
        for (let i = k; i >= 1; i--) fresh.push(st[(((top[r]! - i) % st.length) + st.length) % st.length]!);
        top[r] = (((top[r]! - k) % st.length) + st.length) % st.length;
        return [...fresh, ...keep];
      });
      // Sale solo dopo una vincita vera (non se e' esploso solo un Biglietto),
      // e mai oltre l'ultimo gradino.
      if (won) chain = Math.min(chain + 1, rule.ladder.length - 1);
    }
    left--;
    const multiplier = rule.ladder[Math.min(chain, rule.ladder.length - 1)]!;
    const wins = evaluate(grid, multiplier);
    const stepPay = wins.reduce((s, w) => s + w.payout, 0);
    payout += stepPay;
    const cells = new Map<string, readonly [number, number]>();
    for (const w of wins) for (const c of w.cells) cells.set(`${c[0]},${c[1]}`, c);
    // Un Biglietto nella griglia aggiunge giri (con un tetto) e poi esplode,
    // cosi' non resta fermo sul rullo.
    const bonusCells: (readonly [number, number])[] = [];
    if (rule.retriggerSpins > 0) {
      grid.forEach((col, r) => col.forEach((id, row) => {
        if (id === rule.symbol) bonusCells.push([r, row] as const);
      }));
    }
    let added = 0;
    if (bonusCells.length > 0 && retriggers < rule.retriggerCap) {
      added = rule.retriggerSpins;
      left += added;
      retriggers++;
    }
    for (const c of bonusCells) cells.set(`${c[0]},${c[1]}`, c);
    explode = [...cells.values()];
    won = wins.length > 0;
    if (kind === 'fresh') {
      freshMiss = !won;
      misses = won ? 0 : misses + 1;
    } else freshMiss = false;
    steps.push({ kind, grid, stops, wins, multiplier, payout: stepPay, left, explode, added, bonusCells, rescue });
  }
  // Vincita minima garantita: la cascata restituisce almeno `minWin` puntate.
  const floor = (rule.minWin ?? 0) * bet;
  const topUp = payout < floor ? floor - payout : 0;
  return { spins: spinsAwarded, steps, payout: payout + topUp, topUp };
}

// ═══════════════════════════════════════════════ FORZIERI

export function chestTable(rule: ChestRule, count: number) {
  let best = rule.tables[0]!;
  for (const t of rule.tables) if (t.min <= count && t.min >= best.min) best = t;
  return best;
}

/**
 * Riempie i forzieri: `chests` moltiplicatori TUTTI DIVERSI, estratti per
 * peso senza reinserimento dalla tabella del conteggio. Il premio e' uno
 * dei forzieri a caso: il giocatore sceglie quale aprire, ma tutti i
 * forzieri sono equivalenti, quindi decidere ora il contenuto di quello
 * che aprira' non cambia nessuna probabilita'.
 */
export function runChests(rule: ChestRule, count: number, bet: number, rng: Rng): ChestOutcome {
  const table = chestTable(rule, count);
  const pool = table.values.map((v, i) => ({ v, w: table.weights[i]! }));
  const drawn: number[] = [];
  for (let k = 0; k < rule.chests && pool.length > 0; k++) {
    const i = pickIndex(pool.map((p) => p.w), rng);
    drawn.push(pool[i]!.v);
    pool.splice(i, 1);
  }
  const at = rng.int(drawn.length);
  const prize = drawn[at]!;
  const others = drawn.filter((_, i) => i !== at);
  return { count, prize, others, payout: prize * bet };
}
