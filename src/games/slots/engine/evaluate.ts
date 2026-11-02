/**
 * THE ROYAL MIRAGE — Valutazione di una griglia
 *
 * Funzioni pure: griglia + macchina + puntata → combinazioni vincenti.
 * Nessuna casualita' qui dentro (quella sta in `spin.ts`), quindi ogni
 * regola e' verificabile con una griglia scritta a mano nei test.
 */

import type { Grid, MachineDef, SymbolDef, SymId, WinLine } from './types';

export interface SymbolIndex {
  byId: Map<SymId, SymbolDef>;
  wild: SymId | null;
  scatter: SymId | null;
  /** Simboli che pagano su linea/ways (non wild-only, non scatter). */
  paying: SymbolDef[];
}

const indexCache = new WeakMap<MachineDef, SymbolIndex>();

export function symbolIndex(m: MachineDef): SymbolIndex {
  let idx = indexCache.get(m);
  if (idx) return idx;
  const byId = new Map(m.symbols.map((s) => [s.id, s]));
  idx = {
    byId,
    wild: m.symbols.find((s) => s.wild)?.id ?? null,
    scatter: m.symbols.find((s) => s.scatter)?.id ?? null,
    paying: m.symbols.filter((s) => !s.scatter && !s.wild && s.pays),
  };
  indexCache.set(m, idx);
  return idx;
}

/**
 * Espande i wild a colonna intera sui rulli consentiti.
 * Restituisce la griglia nuova (l'originale resta intatta: la vista mostra
 * prima l'atterraggio e POI l'espansione) e i rulli espansi.
 */
export function expandWilds(m: MachineDef, grid: Grid, phase: 'base' | 'free'): { grid: Grid; reels: number[] } {
  const rule = m.wild;
  const { wild } = symbolIndex(m);
  if (!rule?.expanding || !wild) return { grid, reels: [] };
  const when = rule.expandIn ?? 'both';
  if (when !== 'both' && when !== phase) return { grid, reels: [] };

  const reels: number[] = [];
  const out = grid.map((col, r) => {
    if (rule.reels && !rule.reels.includes(r)) return col;
    if (!col.includes(wild)) return col;
    reels.push(r);
    return col.map(() => wild);
  });
  return { grid: out, reels };
}

/** Vincite su linee fisse, da sinistra a destra. */
export function evaluateLines(m: MachineDef, grid: Grid, lineBet: number, mult: number): WinLine[] {
  const { byId, wild } = symbolIndex(m);
  const wins: WinLine[] = [];
  const wildDef = wild ? byId.get(wild) : undefined;
  const wildMult = m.wild?.multiplier ?? 1;

  m.paylines.forEach((line, lineIndex) => {
    const syms = line.map((row, reel) => grid[reel]![row]!);

    // Corsa di soli wild in testa: puo' pagare da sola (se il wild ha pays)
    // o "diventare" il primo simbolo pagante che la interrompe.
    let wildRun = 0;
    while (wildRun < syms.length && syms[wildRun] === wild) wildRun++;

    let best: WinLine | null = null;

    if (wildDef?.pays && wildRun > 0) {
      const p = wildDef.pays[wildRun] ?? 0;
      if (p > 0) {
        best = mkLine(wild!, wildRun, lineIndex, line, p * lineBet * mult, mult);
      }
    }

    const target = syms[wildRun];
    const tdef = target !== undefined ? byId.get(target) : undefined;
    if (tdef && !tdef.scatter && tdef.pays) {
      let n = wildRun;
      while (n < syms.length && (syms[n] === target || syms[n] === wild)) n++;
      const usesWild = syms.slice(0, n).includes(wild!);
      const k = mult * (usesWild ? wildMult : 1);
      const pay = (tdef.pays[n] ?? 0) * lineBet * k;
      if (pay > 0 && (!best || pay > best.payout)) {
        best = mkLine(target!, n, lineIndex, line, pay, k);
      }
    }

    if (best) wins.push(best);
  });
  return wins;
}

function mkLine(
  symbol: SymId,
  count: number,
  lineIndex: number,
  line: readonly number[],
  payout: number,
  multiplier: number
): WinLine {
  return {
    kind: 'line',
    symbol,
    count,
    lineIndex,
    cells: line.slice(0, count).map((row, reel) => [reel, row] as const),
    payout,
    multiplier,
  };
}

/**
 * Vincite "ways": un simbolo vince se compare su rulli ADIACENTI da sinistra,
 * in qualunque riga. Il numero di modi e' il prodotto delle occorrenze.
 * Una sola vincita per simbolo, pagata `pays[len] * modi`.
 */
export function evaluateWays(m: MachineDef, grid: Grid, bet: number, mult: number): WinLine[] {
  const { paying, wild } = symbolIndex(m);
  const wins: WinLine[] = [];
  const wildMult = m.wild?.multiplier ?? 1;

  for (const s of paying) {
    let ways = 1;
    let len = 0;
    let usesWild = false;
    const cells: [number, number][] = [];
    for (let r = 0; r < grid.length; r++) {
      let n = 0;
      grid[r]!.forEach((id, row) => {
        if (id === s.id || id === wild) {
          n++;
          cells.push([r, row]);
          if (id === wild) usesWild = true;
        }
      });
      if (n === 0) break;
      ways *= n;
      len++;
    }
    const p = s.pays![len] ?? 0;
    if (p <= 0) continue;
    const keep = cells.filter(([r]) => r < len);
    const k = mult * (usesWild ? wildMult : 1);
    wins.push({ kind: 'ways', symbol: s.id, count: len, cells: keep, payout: p * bet * ways * k, multiplier: k });
  }
  return wins;
}

/** Scatter: paga per conteggio sulla puntata TOTALE e assegna giri gratis. */
export function evaluateScatter(
  m: MachineDef,
  grid: Grid,
  totalBet: number,
  mult: number
): { win: WinLine | null; freeSpins: number } {
  const { scatter, byId } = symbolIndex(m);
  if (!scatter) return { win: null, freeSpins: 0 };
  const def = byId.get(scatter)!;
  const cells: [number, number][] = [];
  grid.forEach((col, r) => col.forEach((id, row) => id === scatter && cells.push([r, row])));
  const n = cells.length;
  const fs = def.freeSpins ? (bestAtMost(def.freeSpins, n) ?? 0) : 0;
  const p = def.scatterPays ? (bestAtMost(def.scatterPays, n) ?? 0) : 0;
  const win =
    p > 0 ? { kind: 'scatter' as const, symbol: scatter, count: n, cells, payout: p * totalBet * mult, multiplier: mult } : null;
  return { win, freeSpins: fs };
}

/** Valore della tabella per il conteggio piu' alto <= n (5 scatter pagano come "5+"). */
function bestAtMost(table: Readonly<Record<number, number>>, n: number): number | undefined {
  let best: number | undefined;
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
