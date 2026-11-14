/**
 * HOLLYWOOD NIGHTS — La slot della prima di gala (id interno: desertFalcon)
 *
 * Tutta la logica sta in `SlotScene`; qui ci sono solo l'identita' visiva e
 * la descrizione delle funzioni speciali. Rulli viola da sala cinematografica,
 * giri gratis in rosa neon: deve riconoscersi al primo sguardo come un'altra
 * macchina rispetto a Lucky Sevens, dentro lo stesso cabinet di casa.
 */

import { SlotScene } from '@/games/slots/view/SlotScene';
import { DESERT_FALCON, DF_LADDER, DF_CASCADE } from '@/games/slots/machines/desertFalcon';
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
    cascade: 'Cascata — 3, 4 o 5 Biglietti ovunque danno {spins} giri a cascata, con un moltiplicatore che sale a ogni cascata ({ladder}) e, se non vinci, scende di un solo gradino. I dettagli sono più sotto, in «Giochi bonus».',
    gTitle: 'Cascata',
    g1: 'Come si attiva: 3, 4 o 5 simboli BIGLIETTO (nastro “CASCATA”) ovunque sui rulli danno {spins} giri a cascata.',
    g2: 'A ogni giro la griglia si riempie di simboli che piovono dall’alto. Le combinazioni pagano come nel gioco normale: stessa tabella, 1024 modi.',
    g3: 'Le combinazioni vincenti si illuminano ed esplodono; i simboli rimasti cadono verso il basso e dall’alto ne entrano di nuovi. Può nascere un’altra vincita, e così via.',
    g4: 'Ogni caduta consuma un giro. Se non c’è nessuna vincita, la griglia si rifà da capo: anche questo consuma un giro.',
    g5: 'Moltiplicatore: parte da ×1 e sale a ogni cascata: {ladder}. Finché vinci non scende mai. Solo quando una griglia nuova non vince scende al gradino precedente (da ×5 a ×4, da ×4 a ×3...), mai direttamente a ×1.',
    g6: 'Esempio con 1 € puntato: una vincita da 0,40 € alla seconda cascata vale 0,40 € × 2 = 0,80 €; alla quarta vale × 4 = 1,60 €.',
    g7: 'Raramente, sul rullo centrale, compare un BIGLIETTO: aggiunge 5 giri a cascata (al massimo 2 volte). Il totale della cascata si somma alla vincita del giro che l’ha aperta.',
  },
  en: {
    ways: '1024 ways to win — no paylines: a symbol pays when it lands on adjacent reels starting from the leftmost, in any row.',
    wild: 'Golden Statuette (WILD) — appears on reels 2, 3, 4 and 5 and substitutes for every symbol except the Clapperboard.',
    scatter: 'Clapperboard (BONUS) — pays anywhere on the total bet. 3, 4 or 5 Clapperboards award 8, 12 or 16 free spins.',
    free: 'Free spins with a progressive multiplier — every spin is worth more than the last: {ladder}, then ×10 until the end. Statuettes land far more often and new Clapperboards award extra spins.',
    cascade: 'Tumble — 3, 4 or 5 Tickets anywhere award {spins} tumble spins, with a multiplier that rises on every tumble ({ladder}) and, when you do not win, steps down only one level. Full details below, under “Bonus games”.',
    gTitle: 'Tumble',
    g1: 'How it starts: 3, 4 or 5 TICKET symbols (“TUMBLE” ribbon) anywhere on the reels award {spins} tumble spins.',
    g2: 'On every spin the grid fills with symbols raining down from the top. Combinations pay as in the normal game: same paytable, 1024 ways.',
    g3: 'Winning combinations light up and explode; the remaining symbols fall down and new ones drop in from the top. Another win can follow, and so on.',
    g4: 'Every fall uses one spin. With no win at all, the grid is dealt afresh: that also uses one spin.',
    g5: 'Multiplier: it starts at ×1 and rises on every tumble: {ladder}. As long as you win it never goes down. Only when a fresh grid does not win does it step down one level (from ×5 to ×4, from ×4 to ×3...), never straight to ×1.',
    g6: 'Example with a 1 € bet: a 0.40 € win on the second tumble is worth 0.40 € × 2 = 0.80 €; on the fourth it is worth × 4 = 1.60 €.',
    g7: 'Rarely, on the middle reel, a TICKET shows up: it adds 5 tumble spins (at most twice). The tumble total adds to the spin that opened it.',
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
        s('cascade', {
          spins: Object.values(DF_CASCADE.spins).join(' / '),
          ladder: DF_CASCADE.ladder.map((m) => `×${m}`).join(' → '),
        }),
      ],
      bonusGuide: () => {
        const vars = {
          spins: Object.values(DF_CASCADE.spins).join(' / '),
          ladder: DF_CASCADE.ladder.map((m) => `×${m}`).join(' → '),
        };
        return [{ title: s('gTitle'), steps: ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7'].map((k) => s(k as 'g1', vars)) }];
      },
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
