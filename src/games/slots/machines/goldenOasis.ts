/**
 * THE ROYAL MIRAGE — La macchina di casa
 *
 * 5 rulli x 3 righe, 20 linee fisse.
 *   · Wild "Palazzo" solo sui rulli 2-3-4: quando atterra si espande a
 *     tutta la colonna (in base e nei giri gratis).
 *   · Scatter "Lampada": 3+ ovunque assegnano 11/16/22 giri gratis con
 *     vincite triplicate e strisce piu' ricche di Palazzi. Riattivabili.
 *
 * RTP dichiarato 96,2%: verificato da `tests/goldenOasis.rtp.test.ts`.
 * Per ritoccarlo si cambiano SOLO le frequenze qui sotto.
 */

import type { MachineDef, Payline, SymbolDef } from '../engine/types';
import { buildStrip, type StripCounts } from '../engine/strips';
import { PALETTE } from '@/art/palette';

export const GO_SYMBOLS: readonly SymbolDef[] = [
  { id: 'W', label: 'Wild', glyph: '🃏', tint: PALETTE.gold.core, wild: true },
  {
    id: 'S',
    label: 'Stella',
    glyph: '⭐',
    tint: PALETTE.red.light,
    scatter: true,
    scatterPays: { 3: 3, 4: 10, 5: 50 },
    freeSpins: { 3: 11, 4: 16, 5: 22 },
  },
  { id: 'F', label: 'Sette', glyph: '7', tint: PALETTE.accent.sapphire.light, pays: { 3: 35, 4: 140, 5: 700 } },
  { id: 'C', label: 'Bar', glyph: '▬', tint: PALETTE.gold.light, pays: { 3: 28, 4: 105, 5: 420 } },
  { id: 'O', label: 'Campana', glyph: '🔔', tint: PALETTE.neon.cyan, pays: { 3: 20, 4: 70, 5: 280 } },
  { id: 'D', label: 'Diamante', glyph: '💎', tint: PALETTE.accent.sapphire.light, pays: { 3: 16, 4: 56, 5: 210 } },
  { id: 'G', label: 'Quadrifoglio', glyph: '🍀', tint: PALETTE.gold.light, pays: { 3: 14, 4: 42, 5: 140 } },
  { id: 'A', label: 'Anguria', glyph: '🍉', tint: PALETTE.red.light, pays: { 3: 7, 4: 28, 5: 105 } },
  { id: 'K', label: 'Uva', glyph: '🍇', tint: PALETTE.win.light, pays: { 3: 7, 4: 21, 5: 84 } },
  { id: 'Q', label: 'Mandarino', glyph: '🍊', tint: PALETTE.accent.violet.light, pays: { 3: 5, 4: 17, 5: 70 } },
  { id: 'J', label: 'Limone', glyph: '🍋', tint: PALETTE.accent.sapphire.light, pays: { 3: 4, 4: 14, 5: 56 } },
  { id: 'T', label: 'Ciliegie', glyph: '🍒', tint: PALETTE.gold.light, pays: { 3: 3, 4: 11, 5: 42 } },
];

/** Le 20 linee, una riga per rullo (0 = alto, 1 = centro, 2 = basso). */
export const GO_PAYLINES: readonly Payline[] = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2],
  [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 2, 0, 2, 0], [2, 0, 2, 0, 2], [1, 0, 2, 0, 1],
];

/** Frequenze per rullo nel gioco base. Indice = rullo. */
export const GO_BASE_COUNTS: readonly StripCounts[] = [
  { S: 1, F: 2, C: 3, O: 3, D: 4, G: 4, A: 5, K: 5, Q: 6, J: 7, T: 7 },
  { W: 2, S: 2, F: 2, C: 3, O: 3, D: 4, G: 4, A: 5, K: 5, Q: 6, J: 7, T: 7 },
  { W: 2, S: 1, F: 2, C: 3, O: 3, D: 4, G: 4, A: 5, K: 5, Q: 6, J: 7, T: 7 },
  { W: 2, S: 2, F: 2, C: 3, O: 3, D: 4, G: 4, A: 5, K: 5, Q: 6, J: 7, T: 7 },
  { S: 1, F: 2, C: 3, O: 3, D: 4, G: 4, A: 5, K: 5, Q: 6, J: 7, T: 7 },
];

/** Nei giri gratis: piu' Palazzi, meno carte basse. */
export const GO_FREE_COUNTS: readonly StripCounts[] = [
  { S: 1, F: 3, C: 3, O: 3, D: 4, G: 4, A: 5, K: 5, Q: 5, J: 5, T: 5 },
  { W: 3, S: 1, F: 3, C: 3, O: 3, D: 4, G: 4, A: 5, K: 5, Q: 5, J: 5, T: 5 },
  { W: 3, S: 2, F: 3, C: 3, O: 3, D: 4, G: 4, A: 5, K: 5, Q: 5, J: 5, T: 5 },
  { W: 3, S: 1, F: 3, C: 3, O: 3, D: 4, G: 4, A: 5, K: 5, Q: 5, J: 5, T: 5 },
  { S: 1, F: 3, C: 3, O: 3, D: 4, G: 4, A: 5, K: 5, Q: 5, J: 5, T: 5 },
];

export function makeGoldenOasis(
  base: readonly StripCounts[] = GO_BASE_COUNTS,
  free: readonly StripCounts[] = GO_FREE_COUNTS
): MachineDef {
  return {
    id: 'goldenOasis',
    name: 'Lucky Sevens',
    reels: 5,
    rows: 3,
    strips: base.map((c, i) => buildStrip(c, 0x60a5 + i * 977)),
    symbols: GO_SYMBOLS,
    paylines: GO_PAYLINES,
    evalMode: 'lines',
    wild: { expanding: true, reels: [1, 2, 3], expandIn: 'both' },
    freeSpins: {
      strips: free.map((c, i) => buildStrip(c, 0xf2ee + i * 1571)),
      ladder: [3],
      retrigger: true,
      cap: 60,
    },
    rtpTarget: 96.2,
    betDivisor: 20,
  };
}

export const GOLDEN_OASIS: MachineDef = makeGoldenOasis();
