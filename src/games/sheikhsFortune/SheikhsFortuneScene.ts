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
    chests: 'I Forzieri — 4 o più Forzieri ovunque aprono la scelta fra 5 forzieri, ognuno con un moltiplicatore della puntata da ×2 a ×50. I dettagli sono più sotto, in «Giochi bonus».',
    gTitle: 'I Forzieri',
    hTitle: 'Hold & Win',
    h1: 'Come si attiva: 6 o più MONETE D’ORO ovunque sui rulli, nello stesso giro. Ogni moneta mostra già il suo valore in fiche.',
    h2: 'Le monete uscite restano bloccate al loro posto; tutte le altre celle diventano piccoli rulli che girano da soli: hai 3 respin.',
    h3: 'A ogni respin, se esce almeno una moneta nuova si blocca anche lei e i respin tornano a 3. Se non esce niente, i respin scendono di uno.',
    h4: 'Il gioco finisce quando i respin arrivano a 0 oppure quando tutte le 24 celle sono piene di monete.',
    h5: 'Alla fine incassi la somma di tutte le monete sulla griglia. Le monete jackpot valgono MINI ×20, MINOR ×50 o MAJOR ×200 la puntata; con tutte le 24 celle piene vinci anche il GRAND, ×1000 la puntata.',
    h6: 'Esempio con 1 € puntato: finisci con 9 monete da 0,50 € e una MINI → 9 × 0,50 € + 20,00 € = 24,50 €. La vincita si somma a quella del giro (e agli eventuali Forzieri).',
    g1: 'Come si attiva: 4 o più simboli FORZIERE ovunque sui rulli, nello stesso giro.',
    g2: 'La slot sale in alto e sotto compaiono 5 forzieri. Tocca un forziere per sceglierlo: gli altri si spengono. Puoi cambiare scelta finché non premi APRI.',
    g3: 'Premi APRI: il forziere si apre e mostra il suo moltiplicatore. Vinci la puntata per quel moltiplicatore (×2 è il doppio della puntata, ×10 dieci volte la puntata).',
    g4: 'I 5 forzieri contengono moltiplicatori tutti diversi fra ×2, ×3, ×4, ×5, ×8, ×10, ×15, ×25 e ×50: il premio più basso è ×2, il doppio della puntata.',
    g5: 'Più Forzieri sui rulli, più ricchi i forzieri: con 4 un ×50 è raro, con 5 è più probabile, con 6 o più lo è molto di più.',
    g6: 'Dopo l’apertura si aprono anche gli altri quattro, spenti, per mostrarti cosa contenevano.',
    g7: 'Esempio con 1 € puntato: apri un forziere ×8 → vinci 8,00 €. La vincita si somma a quella del giro (e all’eventuale Hold & Win).',
  },
  en: {
    ways: '4096 ways to win — no paylines: a symbol pays when it lands on adjacent reels starting from the leftmost, in any row.',
    wild: 'Crown (WILD) — appears on reels 2 to 6 and substitutes for every symbol except the Gold Coin.',
    coin: 'Gold Coin — does not pay in combinations: every coin shows its own value, in chips, already in the base game.',
    hold: 'Hold & Win — 6 or more Coins anywhere lock in place and give the other cells 3 respins. Every new coin resets the respins to 3. At the end you collect the sum of all coins.',
    jackpots: 'Jackpots — some coins carry a fixed jackpot: MINI ×20, MINOR ×50, MAJOR ×200 the bet. Filling all 24 cells wins the GRAND (×1000), on top of the coins.',
    jackpotsTitle: 'Jackpots',
    chests: 'The Treasure Chests — 4 or more Chests anywhere open a pick among 5 chests, each holding a multiplier of the bet from ×2 to ×50. Full details below, under “Bonus games”.',
    gTitle: 'The Treasure Chests',
    hTitle: 'Hold & Win',
    h1: 'How it starts: 6 or more GOLD COINS anywhere on the reels, in the same spin. Every coin already shows its value in chips.',
    h2: 'The coins that landed lock in place; every other cell becomes a small reel that spins on its own: you get 3 respins.',
    h3: 'On every respin, if at least one new coin lands it locks too and the respins go back to 3. If nothing lands, the respins drop by one.',
    h4: 'The game ends when the respins reach 0 or when all 24 cells are filled with coins.',
    h5: 'At the end you collect the sum of every coin on the grid. Jackpot coins are worth MINI ×20, MINOR ×50 or MAJOR ×200 the bet; with all 24 cells full you also win the GRAND, ×1000 the bet.',
    h6: 'Example with a 1 € bet: you end with 9 coins worth 0.50 € and one MINI → 9 × 0.50 € + 20.00 € = 24.50 €. The win adds to the spin (and to any Chests).',
    g1: 'How it starts: 4 or more CHEST symbols anywhere on the reels, in the same spin.',
    g2: 'The slot moves up and 5 chests appear below it. Tap a chest to pick it: the others dim. You can change your pick until you press OPEN.',
    g3: 'Press OPEN: the chest opens and shows its multiplier. You win the bet times that multiplier (×2 is twice the bet, ×10 ten times the bet).',
    g4: 'The 5 chests hold all different multipliers among ×2, ×3, ×4, ×5, ×8, ×10, ×15, ×25 and ×50: the lowest prize is ×2, twice the bet.',
    g5: 'The more Chests on the reels, the richer the chests: with 4 a ×50 is rare, with 5 it is more likely, with 6 or more far more so.',
    g6: 'After opening, the other four open too, dimmed, to show what they held.',
    g7: 'Example with a 1 € bet: you open a ×8 chest → you win 8.00 €. The win adds to the spin (and to any Hold & Win).',
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
      features: () => [s('ways'), s('wild'), s('coin'), s('hold'), s('jackpots'), s('chests')],
      bonusGuide: () => [
        { title: s('hTitle'), steps: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((k) => s(k as 'h1')) },
        { title: s('gTitle'), steps: ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7'].map((k) => s(k as 'g1')) },
      ],
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
