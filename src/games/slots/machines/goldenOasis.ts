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

import type { MachineDef, Payline, SymbolDef, WheelRule, WheelSegment } from '../engine/types';
import { buildStrip, spreadApart, type StripCounts } from '../engine/strips';
import { PALETTE } from '@/art/palette';

export const GO_SYMBOLS: readonly SymbolDef[] = [
  { id: 'W', label: 'Wild', glyph: '🃏', tint: PALETTE.gold.core, wild: true },
  {
    id: 'S',
    label: 'Stella',
    glyph: '⭐',
    tint: PALETTE.red.light,
    scatter: true,
    scatterPays: { 3: 3.8, 4: 13, 5: 64 },
    freeSpins: { 3: 11, 4: 16, 5: 22 },
  },
  { id: 'F', label: 'Sette', glyph: '7', tint: PALETTE.accent.sapphire.light, pays: { 3: 14.6, 4: 90, 5: 806 } },
  { id: 'C', label: 'Bar', glyph: '▬', tint: PALETTE.gold.light, pays: { 3: 11.6, 4: 67, 5: 484 } },
  { id: 'O', label: 'Campana', glyph: '🔔', tint: PALETTE.neon.cyan, pays: { 3: 8.3, 4: 45, 5: 323 } },
  { id: 'D', label: 'Diamante', glyph: '💎', tint: PALETTE.accent.sapphire.light, pays: { 3: 6.7, 4: 36, 5: 242 } },
  { id: 'G', label: 'Quadrifoglio', glyph: '🍀', tint: PALETTE.gold.light, pays: { 3: 5.8, 4: 27, 5: 161 } },
  { id: 'A', label: 'Anguria', glyph: '🍉', tint: PALETTE.red.light, pays: { 3: 2.9, 4: 18, 5: 121 } },
  { id: 'K', label: 'Uva', glyph: '🍇', tint: PALETTE.win.light, pays: { 3: 2.9, 4: 13, 5: 97 } },
  { id: 'Q', label: 'Mandarino', glyph: '🍊', tint: PALETTE.accent.violet.light, pays: { 3: 2.1, 4: 11, 5: 81 } },
  { id: 'J', label: 'Limone', glyph: '🍋', tint: PALETTE.accent.sapphire.light, pays: { 3: 1.7, 4: 9, 5: 65 } },
  { id: 'T', label: 'Ciliegie', glyph: '🍒', tint: PALETTE.gold.light, pays: { 3: 1.3, 4: 7, 5: 48 } },
  // Non paga in combinazione: 3 Ruote (rulli 1, 3 e 5) aprono la Ruota della fortuna.
  { id: 'R', label: 'Ruota', glyph: '🎡', tint: PALETTE.gold.core },
];

/**
 * La Ruota della fortuna: 18 spicchi, disegnati in quest'ordine in senso
 * orario a partire dalla lancetta. I pesi NON sono uguali: gli spicchi
 * grandi hanno meno probabilita' (lo dice anche il regolamento in sala).
 *
 * I moltiplicatori MOLTIPLICANO la vincita accumulata (il primo si applica
 * alla puntata). Al PRIMO giro gli spicchi sono quasi equiprobabili (`first`,
 * i grandi un po' meno); dai giri dopo contano `weight` e quello che e'
 * uscito: dopo un giro scarso (NULLA, ×1, ×2) scatta la RIMONTA (i ×5 e oltre
 * pesano il doppio, scarsi e STOP meno), dopo un ×10 o piu' il FRENO. Media
 * di un bonus ≈ 18 volte la puntata, tetto 100 volte, 1 giro su ~225
 * (Ruote 3-2-3 sui rulli 1-3-5, mai due nella stessa finestra).
 */
export const GO_WHEEL_SEGMENTS: readonly WheelSegment[] = [
  { kind: 'mult', value: 50, weight: 0.05, first: 0.3 },
  { kind: 'mult', value: 2, weight: 26 / 3, first: 1 },
  { kind: 'mult', value: 10, weight: 0.5, first: 0.8 },
  { kind: 'mult', value: 1, weight: 21, first: 1 },
  { kind: 'mult', value: 5, weight: 5 / 3, first: 1 },
  { kind: 'stop', value: 0, weight: 8, first: 1 },
  { kind: 'mult', value: 20, weight: 0.125, first: 0.5 },
  { kind: 'mult', value: 2, weight: 26 / 3, first: 1 },
  { kind: 'mult', value: 5, weight: 5 / 3, first: 1 },
  { kind: 'mult', value: 15, weight: 0.2, first: 0.6 },
  { kind: 'mult', value: 1, weight: 21, first: 1 },
  { kind: 'spin', value: 0, weight: 4, first: 1 },
  { kind: 'mult', value: 10, weight: 0.5, first: 0.8 },
  { kind: 'mult', value: 2, weight: 26 / 3, first: 1 },
  { kind: 'blank', value: 0, weight: 7, first: 1 },
  { kind: 'mult', value: 5, weight: 5 / 3, first: 1 },
  { kind: 'mult', value: 20, weight: 0.125, first: 0.5 },
  { kind: 'mult', value: 15, weight: 0.2, first: 0.6 },
];

export const GO_WHEEL: WheelRule = {
  symbol: 'R',
  trigger: 3,
  spins: 3,
  maxSpins: 8,
  segments: GO_WHEEL_SEGMENTS,
  // Dopo un ×10 o piu', i premi alti diventano molto meno probabili.
  highFrom: 10,
  highDamp: 0.25,
  // Vincita massima della ruota: 100 volte la puntata.
  maxTotal: 100,
  // Rimonta dopo un giro scarso (NULLA, ×1, ×2): ×5 e oltre ×2, scarsi e STOP ×0,6.
  lowUpTo: 2,
  boostFrom: 5,
  boostHigh: 2,
  boostLow: 0.6,
};

/** Le 20 linee, una riga per rullo (0 = alto, 1 = centro, 2 = basso). */
export const GO_PAYLINES: readonly Payline[] = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2],
  [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 2, 0, 2, 0], [2, 0, 2, 0, 2], [1, 0, 2, 0, 1],
];

/**
 * Frequenze per rullo nel gioco base. Indice = rullo.
 * Strisce "piatte" (simboli quasi tutti a pari frequenza) e un solo Palazzo
 * per rullo: si vince in ~44,5% dei giri invece del 58%. Le vincite sono piu'
 * rare ma piu' ricche: i premi sono stati alzati del 28% per tenere l'RTP.
 */
export const GO_BASE_COUNTS: readonly StripCounts[] = [
  { R: 3, S: 1, F: 3, C: 4, O: 4, D: 4, G: 4, A: 5, K: 5, Q: 5, J: 5, T: 5 },
  { W: 1, S: 2, F: 3, C: 4, O: 4, D: 4, G: 4, A: 5, K: 5, Q: 5, J: 5, T: 5 },
  { W: 1, R: 2, S: 1, F: 3, C: 4, O: 4, D: 4, G: 4, A: 5, K: 5, Q: 5, J: 5, T: 5 },
  { W: 1, S: 2, F: 3, C: 4, O: 4, D: 4, G: 4, A: 5, K: 5, Q: 5, J: 5, T: 5 },
  { R: 3, S: 1, F: 3, C: 4, O: 4, D: 4, G: 4, A: 5, K: 5, Q: 5, J: 5, T: 5 },
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
    // Due Ruote sullo stesso rullo non devono mai stare nella stessa finestra.
    strips: base.map((c, i) => spreadApart(buildStrip(c, 0x60a5 + i * 977), 'R', 3)),
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
    wheel: GO_WHEEL,
    rtpTarget: 96.2,
    betDivisor: 20,
  };
}

export const GOLDEN_OASIS: MachineDef = makeGoldenOasis();
