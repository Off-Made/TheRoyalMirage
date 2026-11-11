/**
 * THE ROYAL MIRAGE — Desert Falcon
 *
 * 5 rulli x 4 righe, 1024 "ways" (4^5): nessuna linea, conta solo che un
 * simbolo compaia su rulli ADIACENTI da sinistra, in qualunque riga.
 *   · Wild "Falco d'Oro" solo sui rulli 2-5: sostituisce tutto tranne la Luna.
 *   · Scatter "Luna sulle Dune": 3+ ovunque assegnano giri gratis con
 *     MOLTIPLICATORE PROGRESSIVO ×2 → ×3 → ×4 → ×5 → ×6 → ×8 → ×10: ogni
 *     giro gratis vale piu' del precedente, e dal settimo in poi tutto
 *     paga ×10. Riattivabili.
 *
 * ── Perche' la scala e' il cuore della volatilita' ──
 * Il moltiplicatore cresce col NUMERO di giri, non con le vincite: una
 * sessione lunga (riattivazioni) spende quasi tutti i giri a ×10. E' li'
 * che nascono le vincite da migliaia di volte la puntata, ed e' per questo
 * che le strisce dei giri gratis restano relativamente povere: la scala
 * moltiplica gia' abbastanza.
 *
 * ── Base di pagamento ──
 * Nelle "ways" la tabella e' in multipli della puntata di BASE
 * (puntata totale ÷ 50) e si moltiplica per il numero di modi: 3 Cappucci
 * con due copie sul rullo 2 = 2 modi = 2 x pays[3].
 *
 * RTP dichiarato 96,0%: verificato da `tests/slotRtp.test.ts`.
 */

import type { MachineDef, SymbolDef } from '../engine/types';
import { buildStrip, type StripCounts } from '../engine/strips';
import { PALETTE } from '@/art/palette';

export const DF_SYMBOLS: readonly SymbolDef[] = [
  { id: 'W', label: 'Statuetta d’Oro', glyph: '🏆', tint: PALETTE.gold.core, wild: true },
  {
    id: 'S',
    label: 'Ciak',
    glyph: '🎬',
    tint: PALETTE.accent.sapphire.light,
    scatter: true,
    scatterPays: { 3: 2, 4: 10, 5: 50 },
    freeSpins: { 3: 8, 4: 12, 5: 16 },
  },
  { id: 'H', label: 'Cinepresa', glyph: '🎥', tint: PALETTE.red.light, pays: { 3: 5.45, 4: 25.6, 5: 174.1 } },
  { id: 'R', label: 'Champagne', glyph: '🍾', tint: PALETTE.neon.halo, pays: { 3: 4.4, 4: 17.9, 5: 113.15 } },
  { id: 'P', label: 'Cilindro', glyph: '🎩', tint: PALETTE.win.light, pays: { 3: 3.4, 4: 12.8, 5: 87.05 } },
  { id: 'F', label: 'Popcorn', glyph: '🍿', tint: PALETTE.gold.light, pays: { 3: 2.7, 4: 10.25, 5: 69.65 } },
  { id: 'A', label: 'Asso', glyph: 'A', tint: PALETTE.accent.sapphire.light, pays: { 3: 1.7, 4: 5.1, 5: 34.8 } },
  { id: 'K', label: 'Re', glyph: 'K', tint: PALETTE.win.light, pays: { 3: 1.7, 4: 5.1, 5: 30.45 } },
  { id: 'Q', label: 'Regina', glyph: 'Q', tint: PALETTE.accent.violet.light, pays: { 3: 1, 4: 4.1, 5: 21.75 } },
  { id: 'J', label: 'Fante', glyph: 'J', tint: PALETTE.neon.pink, pays: { 3: 1, 4: 3.6, 5: 17.4 } },
  { id: 'T', label: 'Dieci', glyph: '10', tint: PALETTE.neon.cyan, pays: { 3: 0.65, 4: 2.55, 5: 13.05 } },
];

/**
 * Frequenze per rullo nel gioco base. Il rullo 1 non ha wild; la Luna e'
 * doppia solo sul rullo centrale, che e' cosi' il "rullo della speranza":
 * con due Lune gia' a terra e' quello che si guarda rallentare.
 */
export const DF_BASE_COUNTS: readonly StripCounts[] = [
  { S: 1, H: 4, R: 4, P: 4, F: 6, A: 6, K: 6, Q: 8, J: 8, T: 8 },
  { W: 2, S: 1, H: 4, R: 4, P: 4, F: 6, A: 6, K: 6, Q: 8, J: 8, T: 8 },
  { W: 2, S: 2, H: 4, R: 4, P: 4, F: 6, A: 6, K: 6, Q: 8, J: 8, T: 8 },
  { W: 2, S: 1, H: 4, R: 4, P: 4, F: 6, A: 6, K: 6, Q: 8, J: 8, T: 8 },
  { W: 2, S: 1, H: 4, R: 4, P: 4, F: 6, A: 6, K: 6, Q: 8, J: 8, T: 8 },
];

/**
 * Nei giri gratis i Falchi sono molto piu' frequenti: con la scala che arriva
 * a ×10, ogni wild in piu' vale dieci volte tanto.
 */
export const DF_FREE_COUNTS: readonly StripCounts[] = [
  { S: 1, H: 4, R: 4, P: 4, F: 6, A: 6, K: 6, Q: 8, J: 8, T: 9 },
  { W: 5, S: 1, H: 4, R: 4, P: 4, F: 6, A: 6, K: 6, Q: 8, J: 8, T: 8 },
  { W: 5, S: 2, H: 4, R: 4, P: 4, F: 6, A: 6, K: 6, Q: 8, J: 8, T: 8 },
  { W: 5, S: 1, H: 4, R: 4, P: 4, F: 6, A: 6, K: 6, Q: 8, J: 8, T: 8 },
  { W: 4, S: 1, H: 4, R: 4, P: 4, F: 6, A: 6, K: 6, Q: 8, J: 8, T: 8 },
];

/** La scala dei giri gratis: l'n-esimo giro usa `DF_LADDER[min(n, 6)]`. */
export const DF_LADDER: readonly number[] = [2, 3, 4, 5, 6, 8, 10];

/**
 * Altezza dei blocchi impilati sulle strisce. Le pile fanno due cose: abbassano
 * la frequenza di vincita (una finestra 4x5 mostra MENO simboli diversi) e
 * creano i rulli "pieni" da cui nascono le vincite da centinaia di modi.
 */
export const DF_STACK: Readonly<Record<string, number>> = { H: 2, R: 2, P: 2, F: 2, A: 2, K: 2, Q: 2, J: 2, T: 2 };

export function makeDesertFalcon(
  base: readonly StripCounts[] = DF_BASE_COUNTS,
  free: readonly StripCounts[] = DF_FREE_COUNTS,
  symbols: readonly SymbolDef[] = DF_SYMBOLS,
  stack: Readonly<Record<string, number>> = DF_STACK
): MachineDef {
  return {
    id: 'desertFalcon',
    name: 'Hollywood Nights',
    reels: 5,
    rows: 4,
    strips: base.map((c, i) => buildStrip(c, 0xdf01 + i * 733, stack)),
    symbols,
    paylines: [],
    evalMode: 'ways',
    freeSpins: {
      strips: free.map((c, i) => buildStrip(c, 0xdf77 + i * 1259, stack)),
      ladder: DF_LADDER,
      retrigger: true,
      cap: 50,
    },
    rtpTarget: 96.0,
    betDivisor: 50,
  };
}

export const DESERT_FALCON: MachineDef = makeDesertFalcon();
