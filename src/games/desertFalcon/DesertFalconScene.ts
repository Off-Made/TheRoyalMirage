/**
 * HOLLYWOOD NIGHTS — La slot della prima di gala (id interno: desertFalcon)
 *
 * Tutta la logica sta in `SlotScene`; qui ci sono solo l'identita' visiva e
 * la descrizione delle funzioni speciali. Rulli viola da sala cinematografica,
 * giri gratis in rosa neon: deve riconoscersi al primo sguardo come un'altra
 * macchina rispetto a Lucky Sevens, dentro lo stesso cabinet di casa.
 */

import { SlotScene } from '@/games/slots/view/SlotScene';
import { DESERT_FALCON, DF_LADDER } from '@/games/slots/machines/desertFalcon';
import { slotSymbolTexture, drawSlotSymbol, slotSymbolImages } from '@/art/slotSymbols';
import { PALETTE } from '@/art/palette';
import { defineStrings } from '@/games/common/strings';
import { bus } from '@/state/events';
import type { SpinOutcome } from '@/games/slots/engine/types';

const s = defineStrings({
  it: {
    ways: '1024 modi di vincere — nessuna linea: un simbolo paga se compare su rulli adiacenti a partire dal primo a sinistra, in qualunque riga.',
    wild: 'Statuetta d’Oro (WILD) — compare sui rulli 2, 3, 4 e 5 e sostituisce ogni simbolo tranne il Ciak.',
    scatter: 'Ciak (BONUS) — paga ovunque sulla puntata totale. 3, 4 o 5 Ciak assegnano 8, 12 o 16 giri gratis.',
    free: 'Giri gratis con moltiplicatore progressivo — ogni giro vale più del precedente: {ladder}, poi ×10 fino alla fine. Le Statuette sono molto più frequenti e nuovi Ciak aggiungono altri giri.',
  },
  en: {
    ways: '1024 ways to win — no paylines: a symbol pays when it lands on adjacent reels starting from the leftmost, in any row.',
    wild: 'Golden Statuette (WILD) — appears on reels 2, 3, 4 and 5 and substitutes for every symbol except the Clapperboard.',
    scatter: 'Clapperboard (BONUS) — pays anywhere on the total bet. 3, 4 or 5 Clapperboards award 8, 12 or 16 free spins.',
    free: 'Free spins with a progressive multiplier — every spin is worth more than the last: {ladder}, then ×10 until the end. Statuettes land far more often and new Clapperboards award extra spins.',
  },
});

export class DesertFalconScene extends SlotScene {
  constructor() {
    super({
      gameId: 'desertFalcon',
      machine: DESERT_FALCON,
      texture: (id) => slotSymbolTexture('desertFalcon', id),
      drawSymbol: (ctx, id, size) => drawSlotSymbol('desertFalcon', ctx, id, size),
      images: slotSymbolImages('desertFalcon'),
      // 5 x 4: celle piu' basse di The Royal Mirage (5 x 3) per far stare la
      // quarta riga fra le due barre dell'HUD senza toccare la cresta.
      cellW: 190,
      cellH: 168,
      gap: 10,
      symbolScale: 0.7,
      reelTone: PALETTE.accent.violet.core,
      gem: PALETTE.accent.violet,
      freeTone: PALETTE.neon.pink,
      scatterTint: PALETTE.accent.violet.light,
      accent: { core: PALETTE.neon.pink, hot: PALETTE.neon.halo },
      features: () => [
        s('ways'),
        s('wild'),
        s('scatter'),
        s('free', { ladder: DF_LADDER.map((m) => `×${m}`).join(' → ') }),
      ],
    });
  }

  /** Segnala ai riconoscimenti i momenti speciali di questa macchina. */
  protected async playSpin(o: SpinOutcome, phase: 'base' | 'free'): Promise<void> {
    await super.playSpin(o, phase);
    // Il riconoscimento premia una VINCITA al gradino piu' alto della scala,
    // non il solo raggiungerlo: arrivare a ×10 senza vincere non e' un'impresa.
    const top = DF_LADDER[DF_LADDER.length - 1]!;
    if (phase === 'free' && o.multiplier >= top && o.payout > 0) {
      bus.emit('game:event', { game: this.gameId, kind: 'df:x10' });
    }
  }
}
