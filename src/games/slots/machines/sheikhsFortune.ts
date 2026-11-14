/**
 * THE ROYAL MIRAGE — Sheikh's Fortune
 *
 * 6 rulli x 4 righe, 4096 "ways" (4^6), con HOLD & WIN.
 *   · Wild "Corona" sui rulli 2-6: sostituisce ogni simbolo tranne la Moneta.
 *   · Moneta d'Oro: non paga in combinazione. Ogni moneta porta un VALORE
 *     (multiplo della puntata totale) visibile gia' nel giro base.
 *     6+ monete ovunque innescano l'Hold & Win:
 *       - le monete si bloccano, le altre celle fanno 3 respin
 *       - ogni moneta nuova riporta i respin a 3
 *       - alla fine si incassa la somma di tutte le monete
 *       - riempire le 24 celle vince il GRAND, in aggiunta alle monete
 *     Alcune monete sono "monete jackpot": il loro valore E' un jackpot
 *     fisso (MINI ×20, MINOR ×50, MAJOR ×200). La vista le riconosce
 *     cercando il valore fra `jackpots` (vedi `jackpotForValue`).
 *
 * ── Perche' ways e non linee ──
 * Con 6x4 celle, 50 linee coprirebbero male la griglia e renderebbero
 * illeggibile la presentazione (decine di linee incrociate). Le ways pagano
 * qualunque disposizione adiacente e si mostrano illuminando le celle: piu'
 * chiaro per il giocatore, e le monete restano protagoniste.
 *
 * ── Dove sta l'RTP ──
 * Circa due terzi nel gioco base, un terzo nell'Hold & Win. La frequenza
 * della feature e' governata dal numero di monete per rullo; il suo valore
 * medio da `values`/`weights` e da `landChance`.
 *
 * RTP dichiarato 95,8%: verificato da `tests/slotRtp.test.ts`.
 */

import type { ChestRule, JackpotDef, MachineDef, SymbolDef } from '../engine/types';
import { buildStrip, type StripCounts } from '../engine/strips';
import { PALETTE } from '@/art/palette';

export const SF_SYMBOLS: readonly SymbolDef[] = [
  { id: 'W', label: 'Corona', glyph: '👑', tint: PALETTE.gold.core, wild: true },
  { id: 'C', label: 'Moneta d’Oro', glyph: '🪙', tint: PALETTE.gold.light },
  { id: 'X', label: 'Sacco d’Oro', glyph: '💰', tint: PALETTE.gold.light, pays: { 3: 6.35, 4: 26.75, 5: 102.8, 6: 381.8 } },
  { id: 'R', label: 'Diamante', glyph: '💎', tint: PALETTE.red.light, pays: { 3: 4.6, 4: 17.2, 5: 58.75, 6: 267.25 } },
  { id: 'E', label: 'Anello', glyph: '💍', tint: PALETTE.win.light, pays: { 3: 3.55, 4: 13.35, 5: 49.95, 6: 190.9 } },
  { id: 'Y', label: 'Dadi', glyph: '🎲', tint: PALETTE.accent.sapphire.light, pays: { 3: 2.55, 4: 9.55, 5: 41.1, 6: 133.65 } },
  { id: 'A', label: 'Asso', glyph: 'A', tint: PALETTE.red.light, pays: { 3: 1.25, 4: 5.35, 5: 20.55, 6: 64.9 } },
  { id: 'K', label: 'Re', glyph: 'K', tint: PALETTE.win.light, pays: { 3: 1.25, 4: 5.35, 5: 17.6, 6: 53.45 } },
  { id: 'Q', label: 'Regina', glyph: 'Q', tint: PALETTE.accent.violet.light, pays: { 3: 0.8, 4: 3.8, 5: 14.7, 6: 38.2 } },
  { id: 'J', label: 'Fante', glyph: 'J', tint: PALETTE.accent.sapphire.light, pays: { 3: 0.8, 4: 3.05, 5: 11.75, 6: 30.55 } },
  { id: 'T', label: 'Dieci', glyph: '10', tint: PALETTE.neon.halo, pays: { 3: 0.5, 4: 2.3, 5: 9.4, 6: 26.75 } },
  // Non paga in combinazione: 5 o piu' Forzieri ovunque aprono la scelta dei forzieri.
  { id: 'F', label: 'Forziere', glyph: '🧰', tint: PALETTE.gold.core },
];

/**
 * I Forzieri: cinque forzieri, cinque moltiplicatori diversi della puntata.
 * 4 o piu' Forzieri sui rulli aprono il bonus; piu' Forzieri = tabella piu'
 * ricca: con 4 un 50× e' raro, con 6 o piu' diventa una possibilita' concreta.
 */
export const SF_CHESTS: ChestRule = {
  symbol: 'F',
  trigger: 4,
  chests: 5,
  tables: [
    // Niente ×1: il premio minimo e' ×2. Con 4 Forzieri escono quasi sempre ×2-×5.
    { min: 4, values: [2, 3, 4, 5, 8, 10, 15, 25, 50], weights: [300, 220, 140, 60, 0.8, 0.35, 0.15, 0.06, 0.025] },
    { min: 5, values: [2, 3, 4, 5, 8, 10, 15, 25, 50], weights: [30, 30, 25, 20, 12, 7, 4, 1.9, 0.8] },
    { min: 6, values: [2, 3, 4, 5, 8, 10, 15, 25, 50], weights: [12, 14, 14, 15, 14, 12, 9, 5, 3] },
  ],
};

/** I quattro jackpot, dal minore al maggiore. L'ultimo (GRAND) e' quello a griglia piena. */
export const SF_JACKPOTS: readonly JackpotDef[] = [
  { id: 'mini', label: 'MINI', mult: 20, tint: PALETTE.win.light },
  { id: 'minor', label: 'MINOR', mult: 50, tint: PALETTE.accent.sapphire.light },
  { id: 'major', label: 'MAJOR', mult: 200, tint: PALETTE.red.light },
  { id: 'grand', label: 'GRAND', mult: 1000, tint: PALETTE.gold.light },
];

/**
 * Valori delle monete (multipli della puntata totale) e pesi. Gli ultimi tre
 * sono le monete jackpot: valori che NON compaiono fra quelli ordinari,
 * altrimenti la vista non saprebbe distinguerle.
 */
export const SF_COIN_VALUES: readonly number[] = [1, 2, 3, 4, 5, 8, 10, 15, 20, 50, 200];
export const SF_COIN_WEIGHTS: readonly number[] = [300, 240, 150, 100, 80, 50, 35, 20, 8, 2.5, 0.5];

/** Frequenze per rullo. Il rullo 1 non ha la Corona. */
export const SF_COUNTS: readonly StripCounts[] = [
  { F: 2, C: 5, X: 4, R: 4, E: 6, Y: 6, A: 8, K: 8, Q: 7, J: 8, T: 7 },
  { W: 2, F: 3, C: 5, X: 4, R: 4, E: 6, Y: 6, A: 8, K: 8, Q: 7, J: 8, T: 7 },
  { W: 2, F: 2, C: 5, X: 4, R: 4, E: 6, Y: 6, A: 8, K: 8, Q: 7, J: 8, T: 7 },
  { W: 2, F: 3, C: 5, X: 4, R: 4, E: 6, Y: 6, A: 8, K: 8, Q: 7, J: 8, T: 7 },
  { W: 2, F: 2, C: 5, X: 4, R: 4, E: 6, Y: 6, A: 8, K: 8, Q: 7, J: 8, T: 7 },
  { W: 2, F: 3, C: 5, X: 4, R: 4, E: 6, Y: 6, A: 8, K: 8, Q: 7, J: 8, T: 7 },
];

/** Pile: abbassano la frequenza di vincita e creano rulli "pieni". */
export const SF_STACK: Readonly<Record<string, number>> = { X: 2, R: 2, E: 2, Y: 2, A: 2, K: 3, Q: 3, J: 3, T: 3 };

export interface SheikhsFortuneTuning {
  counts?: readonly StripCounts[];
  symbols?: readonly SymbolDef[];
  stack?: Readonly<Record<string, number>>;
  weights?: readonly number[];
  landChance?: number;
  trigger?: number;
}

export function makeSheikhsFortune(t: SheikhsFortuneTuning = {}): MachineDef {
  const stack = t.stack ?? SF_STACK;
  return {
    id: 'sheikhsFortune',
    name: 'Diamond Royale',
    reels: 6,
    rows: 4,
    strips: (t.counts ?? SF_COUNTS).map((c, i) => buildStrip(c, 0x5f01 + i * 811, stack)),
    symbols: t.symbols ?? SF_SYMBOLS,
    paylines: [],
    evalMode: 'ways',
    holdAndWin: {
      coin: 'C',
      trigger: t.trigger ?? 6,
      respins: 3,
      values: SF_COIN_VALUES,
      weights: t.weights ?? SF_COIN_WEIGHTS,
      landChance: t.landChance ?? 0.054,
      jackpots: SF_JACKPOTS,
    },
    chests: SF_CHESTS,
    rtpTarget: 95.8,
    betDivisor: 50,
  };
}

export const SHEIKHS_FORTUNE: MachineDef = makeSheikhsFortune();

/**
 * Jackpot rappresentato da una moneta, se il suo valore e' quello di un
 * jackpot "a moneta" (tutti tranne l'ultimo, che si vince solo a griglia piena).
 */
export function jackpotForValue(m: MachineDef, value: number): JackpotDef | undefined {
  const js = m.holdAndWin?.jackpots ?? [];
  return js.slice(0, -1).find((j) => j.mult === value);
}
