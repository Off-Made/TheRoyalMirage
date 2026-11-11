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

/**
 * Lunghezza minima di una combinazione che NON parte dal rullo 1. Dal rullo 1
 * vale la tabella dei premi (che oggi parte comunque da 3); altrove servono
 * almeno 3 simboli di fila, altrimenti una coppia qualunque pagherebbe.
 */
export const MIN_RUN = 3;

/**
 * Vincite su linee fisse: 3 o piu' simboli uguali su rulli ADIACENTI della
 * linea, letti da sinistra a destra ma a partire da QUALUNQUE rullo (1-2-3,
 * 2-3-4, 3-4-5...). Una sola vincita per linea, la migliore.
 */
export function evaluateLines(m: MachineDef, grid: Grid, lineBet: number, mult: number): WinLine[] {
  const { byId, wild } = symbolIndex(m);
  const wins: WinLine[] = [];
  const wildDef = wild ? byId.get(wild) : undefined;
  const wildMult = m.wild?.multiplier ?? 1;

  m.paylines.forEach((line, lineIndex) => {
    const syms = line.map((row, reel) => grid[reel]![row]!);
    let best: WinLine | null = null;
    const consider = (w: WinLine) => {
      if (w.payout > 0 && (!best || w.payout > best.payout)) best = w;
    };

    for (let s = 0; s <= syms.length - (s === 0 ? 1 : MIN_RUN); s++) {
      // Una corsa che inizia DENTRO un'altra dello stesso simbolo e' solo
      // la sua coda, piu' corta: non puo' pagare di piu'.
      if (s > 0 && syms[s - 1] === syms[s] && syms[s] !== wild) continue;

      // Corsa di soli wild in testa: puo' pagare da sola (se il wild ha pays)
      // o "diventare" il primo simbolo pagante che la interrompe.
      let wildEnd = s;
      while (wildEnd < syms.length && syms[wildEnd] === wild) wildEnd++;
      const wildRun = wildEnd - s;

      if (wildDef?.pays && wildRun > 0 && (s === 0 || wildRun >= MIN_RUN)) {
        const p = wildDef.pays[wildRun] ?? 0;
        if (p > 0) consider(mkLine(wild!, s, wildRun, lineIndex, line, p * lineBet * mult, mult));
      }

      const target = syms[wildEnd];
      const tdef = target !== undefined ? byId.get(target) : undefined;
      if (!tdef || tdef.scatter || !tdef.pays) continue;
      let n = wildEnd;
      while (n < syms.length && (syms[n] === target || syms[n] === wild)) n++;
      const count = n - s;
      if (s > 0 && count < MIN_RUN) continue;
      const usesWild = syms.slice(s, n).includes(wild!);
      const k = mult * (usesWild ? wildMult : 1);
      consider(mkLine(target!, s, count, lineIndex, line, (tdef.pays[count] ?? 0) * lineBet * k, k));
    }

    if (best) wins.push(best);
  });
  return wins;
}

function mkLine(
  symbol: SymId,
  startReel: number,
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
    startReel,
    lineIndex,
    cells: line.slice(startReel, startReel + count).map((row, i) => [startReel + i, row] as const),
    payout,
    multiplier,
  };
}

/**
 * Vincite "ways": un simbolo vince se compare su 3 o piu' rulli ADIACENTI,
 * a partire da qualunque rullo, in qualunque riga. Il numero di modi e' il
 * prodotto delle occorrenze sul tratto. Una sola vincita per simbolo (il
 * tratto che paga di piu'), pagata `pays[len] * modi`.
 */
export function evaluateWays(m: MachineDef, grid: Grid, bet: number, mult: number): WinLine[] {
  const { paying, wild } = symbolIndex(m);
  const wins: WinLine[] = [];
  const wildMult = m.wild?.multiplier ?? 1;

  for (const s of paying) {
    // Occorrenze (simbolo o wild) rullo per rullo.
    const per = grid.map((col) => col.reduce((n, id) => n + (id === s.id || id === wild ? 1 : 0), 0));
    let best: WinLine | null = null;
    let r = 0;
    while (r < grid.length) {
      if (per[r] === 0) {
        r++;
        continue;
      }
      // Tratto massimale di rulli consecutivi che contengono il simbolo: a
      // parita' di inizio, piu' lungo paga sempre di piu' (premi e modi crescono).
      const from = r;
      let ways = 1;
      while (r < grid.length && per[r]! > 0) ways *= per[r++]!;
      const len = r - from;
      if (from > 0 && len < MIN_RUN) continue;
      const p = s.pays![len] ?? 0;
      if (p <= 0) continue;
      const cells: [number, number][] = [];
      let usesWild = false;
      for (let c = from; c < r; c++) {
        grid[c]!.forEach((id, row) => {
          if (id === s.id || id === wild) {
            cells.push([c, row]);
            if (id === wild) usesWild = true;
          }
        });
      }
      const k = mult * (usesWild ? wildMult : 1);
      const payout = p * bet * ways * k;
      if (!best || payout > best.payout) {
        best = { kind: 'ways', symbol: s.id, count: len, startReel: from, cells, payout, multiplier: k };
      }
    }
    if (best) wins.push(best);
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
