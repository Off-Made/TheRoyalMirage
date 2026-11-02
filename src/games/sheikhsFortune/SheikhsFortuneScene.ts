/**
 * DIAMOND ROYALE — La slot dei grandi giocatori (id interno: sheikhsFortune)
 *
 * Tutta la logica sta in `SlotScene`, compreso l'Hold & Win (funzione del
 * motore, non di questa macchina). Qui ci sono l'identita' visiva, la
 * descrizione delle funzioni speciali e la colonna dei jackpot.
 *
 * ── Perche' i jackpot sono sempre visibili ──
 * Un jackpot che si scopre solo quando lo vinci non fa sognare nessuno. La
 * colonna a sinistra mostra i quattro premi alla puntata corrente, e si
 * aggiorna quando la puntata cambia.
 */

import { Container, Graphics, type Text } from 'pixi.js';
import { SlotScene } from '@/games/slots/view/SlotScene';
import { SHEIKHS_FORTUNE, SF_JACKPOTS } from '@/games/slots/machines/sheikhsFortune';
import { slotSymbolTexture, drawSlotSymbol, slotSymbolImages } from '@/art/slotSymbols';
import { PALETTE } from '@/art/palette';
import { defineStrings } from '@/games/common/strings';
import { makeText } from '@/games/common/text';
import { bus } from '@/state/events';
import { wallet } from '@/state/store';
import { formatMoney } from '@/state/wallet';
import type { RoundOutcome } from '@/games/slots/engine/types';

const s = defineStrings({
  it: {
    ways: '4096 modi di vincere — nessuna linea: un simbolo paga se compare su rulli adiacenti a partire dal primo a sinistra, in qualunque riga.',
    wild: 'Corona (WILD) — compare sui rulli dal 2 al 6 e sostituisce ogni simbolo tranne la Moneta d’Oro.',
    coin: 'Moneta d’Oro — non paga in combinazione: ogni moneta mostra il proprio valore, in fiche, già nel giro base.',
    hold: 'Hold & Win — 6 o più Monete ovunque bloccano le monete e danno 3 respin alle altre celle. Ogni moneta nuova riporta i respin a 3. Alla fine si incassa la somma di tutte le monete.',
    jackpots: 'Jackpot — alcune monete valgono un jackpot fisso: MINI ×20, MINOR ×50, MAJOR ×200 la puntata. Riempire tutte le 24 celle vince il GRAND (×1000), in aggiunta alle monete.',
    jackpotsTitle: 'Jackpot',
  },
  en: {
    ways: '4096 ways to win — no paylines: a symbol pays when it lands on adjacent reels starting from the leftmost, in any row.',
    wild: 'Crown (WILD) — appears on reels 2 to 6 and substitutes for every symbol except the Gold Coin.',
    coin: 'Gold Coin — does not pay in combinations: every coin shows its own value, in chips, already in the base game.',
    hold: 'Hold & Win — 6 or more Coins anywhere lock in place and give the other cells 3 respins. Every new coin resets the respins to 3. At the end you collect the sum of all coins.',
    jackpots: 'Jackpots — some coins carry a fixed jackpot: MINI ×20, MINOR ×50, MAJOR ×200 the bet. Filling all 24 cells wins the GRAND (×1000), on top of the coins.',
    jackpotsTitle: 'Jackpots',
  },
});

export class SheikhsFortuneScene extends SlotScene {
  private jackpotValues: Text[] = [];
  private shownBet = -1;

  constructor() {
    super({
      gameId: 'sheikhsFortune',
      machine: SHEIKHS_FORTUNE,
      texture: (id) => slotSymbolTexture('sheikhsFortune', id),
      drawSymbol: (ctx, id, size) => drawSlotSymbol('sheikhsFortune', ctx, id, size),
      images: slotSymbolImages('sheikhsFortune'),
      // 6 x 4: la griglia piu' larga del casino'. Celle piu' strette di
      // Desert Falcon perche' la sesta colonna ci stia con il margine per la
      // colonna dei jackpot a sinistra e il contatore dei respin a destra.
      cellW: 172,
      cellH: 156,
      gap: 8,
      symbolScale: 0.63,
      reelTone: PALETTE.accent.sapphire.core,
      gem: PALETTE.accent.sapphire,
      freeTone: PALETTE.gold.core,
      scatterTint: PALETTE.gold.light,
      accent: { core: PALETTE.gold.core, hot: PALETTE.gold.hot },
      features: () => [s('ways'), s('wild'), s('coin'), s('hold'), s('jackpots')],
    });
  }

  /** Colonna dei jackpot a sinistra della macchina. */
  protected afterBuild(): void {
    const plaqueW = 250;
    const plaqueH = 104;
    const gapY = 18;
    const col = new Container();
    const title = makeText(s('jackpotsTitle').toUpperCase(), 'label', 20);
    title.position.set(plaqueW / 2, 0);
    col.addChild(title);
    // Dal maggiore al minore, dall'alto in basso: il GRAND in cima e' cio'
    // che l'occhio deve incontrare per primo.
    const list = [...SF_JACKPOTS].reverse();
    list.forEach((jp, i) => {
      const y = 30 + i * (plaqueH + gapY);
      const g = new Graphics()
        .roundRect(0, y, plaqueW, plaqueH, 18)
        .fill({ color: PALETTE.plum.raised, alpha: 0.9 })
        .roundRect(0, y, plaqueW, plaqueH, 18)
        .stroke({ color: jp.tint, width: i === 0 ? 3 : 2, alpha: 0.9 });
      const name = makeText(jp.label, 'title', i === 0 ? 34 : 28, { fill: jp.tint });
      name.position.set(plaqueW / 2, y + 34);
      const value = makeText('', 'value', 28);
      value.position.set(plaqueW / 2, y + 76);
      this.jackpotValues.push(value);
      col.addChild(g, name, value);
    });
    const colH = 30 + list.length * (plaqueH + gapY) - gapY;
    const x = Math.max(24, this.ox - this.geo.pad - 40 - plaqueW);
    col.position.set(x, this.oy + (this.m.rows * this.geo.cellH - colH) / 2 + 10);
    this.world.addChild(col);
    this.refreshJackpots();
  }

  private refreshJackpots(): void {
    const bet = wallet().bet;
    if (bet === this.shownBet) return;
    this.shownBet = bet;
    const list = [...SF_JACKPOTS].reverse();
    list.forEach((jp, i) => {
      const t = this.jackpotValues[i];
      if (t) t.text = formatMoney(jp.mult * bet);
    });
  }

  protected tick(dt: number): void {
    super.tick(dt);
    // La puntata cambia dall'HUD (DOM): basta un confronto per fotogramma,
    // e il testo si riscrive solo quando cambia davvero.
    this.refreshJackpots();
  }

  /** Segnala ai riconoscimenti i jackpot vinti, a moneta o a griglia piena. */
  protected async playHoldAndWin(o: RoundOutcome, bet: number): Promise<void> {
    await super.playHoldAndWin(o, bet);
    const hw = o.holdAndWin;
    if (!hw) return;
    const coinJackpot = hw.cells.some((c) => c.some((v) => v !== null && this.coinJackpot(v) !== undefined));
    if (hw.jackpot || coinJackpot) bus.emit('game:event', { game: this.gameId, kind: 'sf:jackpot' });
  }
}
