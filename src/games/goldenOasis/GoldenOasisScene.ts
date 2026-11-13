/**
 * THE ROYAL MIRAGE — La slot di casa
 *
 * Tutta la logica sta in `SlotScene`; qui ci sono solo l'identita' visiva e
 * la descrizione delle funzioni speciali.
 */

import { SlotScene } from '@/games/slots/view/SlotScene';
import { GOLDEN_OASIS, GO_WHEEL } from '@/games/slots/machines/goldenOasis';
import { wheelOdds } from '@/games/slots/view/wheelBonus';
import { getLanguage } from '@/i18n';
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
    wheel: 'Ruota della fortuna — 3 Ruote sui rulli 1, 3 e 5 aprono la ruota: 3 giri in cui ogni moltiplicatore MOLTIPLICA la vincita accumulata (il primo si applica alla puntata). Vincita massima della ruota: 100 volte la puntata. I dettagli sono più sotto, in «Giochi bonus».',
    odds: 'Probabilità di ogni spicchio al primo giro (nei giri dopo cambiano in base a quello che è uscito): {odds}.',
    gTitle: 'Ruota della fortuna',
    g1: 'Come si attiva: 3 simboli RUOTA nello stesso giro. La Ruota compare solo sui rulli 1, 3 e 5, quindi ne serve una su ognuno.',
    g2: 'La slot si gira e dietro compare la ruota con 18 spicchi. Hai 3 giri di ruota: per lanciarla premi GIRA!, il pulsante sotto la ruota o quello in basso a destra.',
    g3: 'All’inizio la vincita della ruota è 0. Il primo moltiplicatore che esce si applica alla puntata, i successivi moltiplicano la vincita accumulata.',
    g4: 'Esempio con 1 € puntato: esce ×2 → 2 €; poi ×5 → 10 €; poi ×2 → 20 €. ×1 lascia la vincita com’è.',
    g5: 'NULLA: in quel giro non vinci niente, la vincita accumulata resta (se esce al primo giro resta a 0).',
    g6: 'ALTRO GIRO: quel giro non si conta e in più ne guadagni uno (con 2 giri rimasti ne hai 3). STOP: la ruota si ferma subito e tieni quanto accumulato fino a quel momento.',
    g7: 'Al primo giro gli spicchi escono quasi tutti con la stessa probabilità (i moltiplicatori grandi un po’ meno). Dal secondo giro conta quello che è uscito prima. Rimonta: dopo un giro scarso (NULLA, ×1 o ×2) il giro successivo ha molte più probabilità di un ×5 o più, e meno di un altro giro scarso o di uno STOP. Dopo un ×10 o più, invece, i moltiplicatori alti diventano più rari.',
    g8: 'Al massimo 8 giri in tutto; vincita massima della ruota: 100 volte la puntata. La vincita si somma a quella del giro che ha aperto la ruota.',
  },
  en: {
    wild: 'WILD — appears on reels 2, 3 and 4 only. When it lands it expands to fill the whole reel and substitutes for every symbol except the Star.',
    scatter: 'BONUS Star — pays anywhere on the total bet. 3, 4 or 5 Stars award 11, 16 or 22 free spins.',
    free: 'Free spins — every win is tripled, WILDs land more often and new Stars award extra spins.',
    wheel: 'Wheel of fortune — 3 Wheels on reels 1, 3 and 5 open the wheel: 3 spins in which every multiplier MULTIPLIES the accumulated win (the first one applies to the bet). Maximum wheel win: 100 times the bet. Full details below, under “Bonus games”.',
    odds: 'Odds of each segment on the first spin (later spins change with what came out before): {odds}.',
    gTitle: 'Wheel of fortune',
    g1: 'How it starts: 3 WHEEL symbols in the same spin. The Wheel only lands on reels 1, 3 and 5, so you need one on each.',
    g2: 'The slot flips over and the 18-segment wheel appears behind it. You get 3 wheel spins: press SPIN!, the button under the wheel or the one at the bottom right.',
    g3: 'At first the wheel win is 0. The first multiplier applies to the bet, every later one multiplies the accumulated win.',
    g4: 'Example with a 1 € bet: ×2 → 2 €; then ×5 → 10 €; then ×2 → 20 €. ×1 leaves the win as it is.',
    g5: 'BLANK: nothing is won on that spin, the accumulated win stays (if it comes first, it stays at 0).',
    g6: 'EXTRA SPIN: that spin does not count and you gain one more (with 2 spins left you now have 3). STOP: the wheel ends at once and you keep what you have accumulated.',
    g7: 'On the first spin the segments are almost equally likely (big multipliers a little less). From the second spin on, what came out before counts. Comeback: after a poor spin (BLANK, ×1 or ×2) the next spin is far more likely to land ×5 or more, and less likely to land another poor one or a STOP. After a ×10 or higher, on the other hand, high multipliers become rarer.',
    g8: 'At most 8 spins in total; maximum wheel win: 100 times the bet. The win adds to the spin that opened the wheel.',
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
      features: () => [
        s('wild'),
        s('scatter'),
        s('free'),
        s('wheel'),
        s('odds', {
          odds: wheelOdds(GO_WHEEL)
            .map((x) => `${x.label} ${x.pct.toLocaleString(getLanguage(), { maximumFractionDigits: 1 })}%`)
            .join(' · '),
        }),
      ],
      bonusGuide: () => [{ title: s('gTitle'), steps: ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8'].map((k) => s(k as 'g1')) }],
    });
  }

  /** Segnala ai riconoscimenti i momenti speciali di questa macchina. */
  protected async playSpin(o: SpinOutcome, phase: 'base' | 'free'): Promise<void> {
    await super.playSpin(o, phase);
    if (o.expandedReels.length >= 3) bus.emit('game:event', { game: this.gameId, kind: 'go:palace3' });
    if (phase === 'base' && o.freeSpinsAwarded > 0) bus.emit('game:event', { game: this.gameId, kind: 'go:free' });
  }
}
