/**
 * THE ROYAL MIRAGE — La slot di casa
 *
 * Tutta la logica sta in `SlotScene`; qui ci sono solo l'identita' visiva e
 * la descrizione delle funzioni speciali.
 */

import { SlotScene } from '@/games/slots/view/SlotScene';
import { GOLDEN_OASIS } from '@/games/slots/machines/goldenOasis';
import { slotSymbolTexture, drawSlotSymbol, slotSymbolImages, wildColumnTexture } from '@/art/slotSymbols';
import { PALETTE } from '@/art/palette';
import { defineStrings } from '@/games/common/strings';
import { bus } from '@/state/events';
import type { SpinOutcome } from '@/games/slots/engine/types';

const s = defineStrings({
  it: {
    wild: 'WILD — compare solo sui rulli 2, 3 e 4. Quando atterra si espande a tutta la colonna e sostituisce ogni simbolo tranne la Stella.',
    scatter: 'Stella BONUS — paga ovunque sulla puntata totale. 3, 4 o 5 Stelle assegnano 11, 16 o 22 giri gratis.',
    free: 'Giri gratis — tutte le vincite sono triplicate, i WILD sono più frequenti e nuove Stelle aggiungono altri giri.',
  },
  en: {
    wild: 'WILD — appears on reels 2, 3 and 4 only. When it lands it expands to fill the whole reel and substitutes for every symbol except the Star.',
    scatter: 'BONUS Star — pays anywhere on the total bet. 3, 4 or 5 Stars award 11, 16 or 22 free spins.',
    free: 'Free spins — every win is tripled, WILDs land more often and new Stars award extra spins.',
  },
});

export class GoldenOasisScene extends SlotScene {
  constructor() {
    super({
      gameId: 'goldenOasis',
      machine: GOLDEN_OASIS,
      texture: (id) => slotSymbolTexture('goldenOasis', id),
      wildColumn: () => wildColumnTexture(3),
      drawSymbol: (ctx, id, size) => drawSlotSymbol('goldenOasis', ctx, id, size),
      images: slotSymbolImages('goldenOasis'),
      cellW: 214,
      cellH: 196,
      gap: 10,
      symbolScale: 0.8,
      reelTone: PALETTE.red.core,
      gem: PALETTE.red,
      // Giri gratis: i rulli virano all'oro, la macchina "si accende".
      freeTone: PALETTE.gold.core,
      features: () => [s('wild'), s('scatter'), s('free')],
    });
  }

  /** Segnala ai riconoscimenti i momenti speciali di questa macchina. */
  protected async playSpin(o: SpinOutcome, phase: 'base' | 'free'): Promise<void> {
    await super.playSpin(o, phase);
    if (o.expandedReels.length >= 3) bus.emit('game:event', { game: this.gameId, kind: 'go:palace3' });
    if (phase === 'base' && o.freeSpinsAwarded > 0) bus.emit('game:event', { game: this.gameId, kind: 'go:free' });
  }
}
