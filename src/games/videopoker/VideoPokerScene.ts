/**
 * THE ROYAL MIRAGE — Video poker "Jacks or Better 9/6"
 *
 *   world
 *   ├─ cabinet    cornice laccata e velluto ametista (art.ts, una texture)
 *   ├─ paytable   vetro scuro + colonna delle monete + riga accesa + cifre
 *   ├─ status     monete in gioco, puntata totale, combinazione in mano
 *   └─ cards      cinque carte fisse con il loro cartiglio TENUTA
 *
 * ── Il giro ──
 *   Distribuisci → placeBet(monete × valore) → cinque carte girate in fila
 *   click (o tasti 1-5) → TENUTA sulle carte da tenere
 *   Pesca → le altre si rigirano e arrivano le nuove → evaluate → settle
 *
 * Lo stato della mano vive in `VideoPokerMachine` (puro, testato): la
 * scena lo interroga e anima. `finish()` pesca UNA volta sola, quindi ne'
 * un doppio "Pesca" ne' l'uscita a meta' animazione possono pescare due
 * volte; il gettone `token` ferma le animazioni di una mano chiusa.
 *
 * Come sulle macchine vere, durante la scelta la tabella accende gia' la
 * riga della combinazione servita: e' l'aiuto che impedisce di scartare
 * per distrazione una coppia di Fanti.
 */

import { Container, Sprite, Text } from 'pixi.js';
import { gsap } from 'gsap';
import { GameScene, type SceneHudOptions } from '@/games/common/GameScene';
import { makeText } from '@/games/common/text';
import { button, div, el } from '@/ui/dom/el';
import { settings, store, wallet } from '@/state/store';
import { formatMoney } from '@/state/wallet';
import { PALETTE } from '@/art/palette';
import { defaultRng } from '@/games/slots/engine/rng';
import { CardView } from '@/games/cards/CardView';
import { warmCardTextures } from '@/games/cards/art';
import { isModalOpen } from '@/ui/dom/Modal';
import { sfxBetConfirm, sfxCardDeal, sfxCardFlip, sfxChip, sfxLose } from '@/audio/synth';
import { MAX_COINS, PAY_ORDER, PokerHand, coinsWon, type HandRank } from './rules';
import { VideoPokerMachine, type DrawResult } from './machine';
import {
  CAB,
  CARD_WIDTH,
  CARD_XS,
  CARD_Y,
  PAY,
  PAY_COL_W,
  cabinetTexture,
  columnHighlightTexture,
  holdBadgeTexture,
  paytableTexture,
  rowHighlightTexture,
} from './art';
import { vs } from './strings';

/** Riga di stato fra tabella (fondo a 436) e carte (cima a 474): testo basso, niente sollevamenti. */
const STATUS_Y = 455;
const CARD_H = (CARD_WIDTH / 200) * 280;
const HOLD_Y = CARD_Y + CARD_H / 2 + 30;

type Phase = 'idle' | 'dealing' | 'hold' | 'drawing';

interface Pending {
  token: number;
  result: DrawResult;
}

export class VideoPokerScene extends GameScene {
  readonly name = 'videopoker';
  readonly gameId = 'videopoker' as const;
  protected backdropDim = 0.46;
  /** Il tavolo sta nella sala in marmo del palazzo, la stessa della lobby. */

  private readonly rng = defaultRng();
  private readonly machine = new VideoPokerMachine();
  private phase: Phase = 'idle';
  private token = 0;
  private pending: Pending | null = null;

  private cards: CardView[] = [];
  private holds: Sprite[] = [];
  private colHL!: Sprite;
  private rowHL!: Sprite;
  private payCells: Text[][] = [];
  private coinsText!: Text;
  private stakeText!: Text;
  private handText!: Text;

  private betOneBtn: HTMLButtonElement | null = null;
  private betMaxBtn: HTMLButtonElement | null = null;
  private readonly onKey = (e: KeyboardEvent) => this.handleKey(e);
  private unsubBet: (() => void) | null = null;

  protected hudOptions(): SceneHudOptions {
    return {
      primaryLabel: vs('deal'),
      onPrimary: () => this.onPrimary(),
      betMode: 'stepper',
      betLabel: vs('coinValue'),
      // La puntata e' il valore di UNA moneta: la giocata e' moneta × monete.
      stakeFactor: () => this.machine.coins,
    };
  }

  protected build(): void {
    const cab = new Sprite(cabinetTexture());
    cab.position.set(CAB.x, CAB.y);

    const pay = new Sprite(paytableTexture(PAY_ORDER.length));
    pay.position.set(PAY.x, PAY.y);
    this.colHL = new Sprite(columnHighlightTexture());
    this.colHL.y = PAY.y + 9;
    this.rowHL = new Sprite(rowHighlightTexture());
    this.rowHL.x = PAY.x + 10;
    this.rowHL.visible = false;

    const cells = new Container();
    PAY_ORDER.forEach((rank, i) => {
      const y = PAY.y + PAY.pad + i * PAY.rowH + PAY.rowH / 2;
      const name = makeText(vs(rank).toUpperCase(), 'label', 19, { fill: PALETTE.gold.light, letterSpacing: 2 });
      name.anchor.set(0, 0.5);
      name.position.set(PAY.x + 34, y);
      const row = [name];
      for (let c = 1; c <= MAX_COINS; c++) {
        const v = makeText(String(coinsWon(rank, c)), 'value', 21, { fill: PALETTE.text.strong });
        v.position.set(PAY.x + PAY.nameW + (c - 0.5) * PAY_COL_W, y);
        row.push(v);
      }
      this.payCells.push(row);
      cells.addChild(...row);
    });

    this.coinsText = makeText('', 'label', 19, { fill: PALETTE.text.strong });
    this.coinsText.anchor.set(0, 0.5);
    this.coinsText.position.set(CARD_XS[0]! - CARD_WIDTH / 2, STATUS_Y);
    this.stakeText = makeText('', 'label', 19, { fill: PALETTE.text.strong });
    this.stakeText.anchor.set(1, 0.5);
    this.stakeText.position.set(CARD_XS[4]! + CARD_WIDTH / 2, STATUS_Y);
    this.handText = makeText('', 'gold', 23);
    this.handText.position.set(960, STATUS_Y);

    const cardLayer = new Container();
    CARD_XS.forEach((x, i) => {
      const v = new CardView(null, { width: CARD_WIDTH });
      v.position.set(x, CARD_Y);
      v.eventMode = 'static';
      v.cursor = 'pointer';
      v.on('pointertap', () => this.toggleHold(i));
      this.cards.push(v);
      const h = new Sprite(holdBadgeTexture(vs('held')));
      h.anchor.set(0.5);
      h.position.set(x, HOLD_Y);
      h.visible = false;
      this.holds.push(h);
      cardLayer.addChild(v, h);
    });

    this.world.addChild(cab, pay, this.colHL, this.rowHL, cells, this.coinsText, this.stakeText, this.handText, cardLayer);
    this.refreshMeters();
  }

  /** Cuoce il mazzo a tavolo fermo. Vedi `BlackjackScene.tick`. */
  protected tick(): void {
    if (!this.roundActive) warmCardTextures(2);
  }

  async enter(): Promise<void> {
    await super.enter();
    const mk = (label: string, fn: () => void) => {
      const b = button(label, { variant: 'secondary', size: 'sm', onClick: fn });
      b.classList.add('go-hud__toggle');
      this.hud.extra.append(b);
      return b;
    };
    this.betOneBtn = mk(vs('betOne'), () => this.betOne());
    this.betMaxBtn = mk(vs('betMax'), () => this.betMax());
    window.addEventListener('keydown', this.onKey);
    // La denominazione si cambia dall'HUD: la puntata totale a schermo la segue.
    this.unsubBet = store.subscribe(() => this.refreshMeters());
    this.refreshControls();
    this.hud.message(vs('hintIdle'));
  }

  // ═══════════════════════════════════════════════ STATO

  private get disposed(): boolean {
    return this.root.destroyed;
  }

  private alive(t: number): boolean {
    return !this.disposed && this.token === t;
  }

  private get speed(): number {
    return settings().reducedMotion ? 0.05 : 1;
  }

  /** Valore della moneta: la mano in corso usa quello fissato alla distribuzione. */
  private get denom(): number {
    return wallet().bet;
  }

  private refreshMeters(): void {
    if (this.disposed || !this.coinsText) return;
    const m = this.machine;
    this.coinsText.text = `${vs('coins').toUpperCase()} ${m.coins}`;
    this.stakeText.text = `${vs('total').toUpperCase()} ${formatMoney(m.stake(this.denom))}`;
    this.colHL.x = PAY.x + PAY.nameW + (m.coins - 1) * PAY_COL_W;
    this.payCells.forEach((row) =>
      row.slice(1).forEach((t, c) => (t.style.fill = c + 1 === m.coins ? PALETTE.text.strong : PALETTE.text.soft))
    );
    // Cambiare le monete sposta il tetto del valore moneta: la plancia deve
    // ricalcolare quali comandi rapidi hanno ancora effetto.
    this.hud?.refresh();
  }

  private refreshControls(): void {
    const free = this.phase === 'idle';
    if (this.betOneBtn) this.betOneBtn.disabled = !free;
    if (this.betMaxBtn) this.betMaxBtn.disabled = !free;
    this.hud.lockBet(!free);
    this.hud.setPrimary(this.phase === 'hold' || this.phase === 'drawing' ? vs('draw') : vs('deal'), {
      enabled: free || this.phase === 'hold',
    });
  }

  private highlightRow(rank: HandRank | null, strong: boolean): void {
    gsap.killTweensOf(this.rowHL);
    const i = rank ? PAY_ORDER.indexOf(rank as (typeof PAY_ORDER)[number]) : -1;
    if (i < 0) {
      this.rowHL.visible = false;
      return;
    }
    this.rowHL.visible = true;
    this.rowHL.y = PAY.y + PAY.pad + i * PAY.rowH;
    this.rowHL.alpha = strong ? 1 : 0.45;
    if (strong && !settings().reducedMotion) gsap.to(this.rowHL, { alpha: 0.55, duration: 0.45, yoyo: true, repeat: 7, ease: 'sine.inOut' });
  }

  // ═══════════════════════════════════════════════ CONTROLLI

  private onPrimary(): void {
    if (this.phase === 'idle') void this.deal();
    else if (this.phase === 'hold') void this.draw();
  }

  private betOne(): void {
    if (this.phase !== 'idle') return;
    sfxChip();
    this.machine.betOne();
    this.refreshMeters();
  }

  /** "Punta max" fa come le macchine vere: cinque monete e distribuisce subito. */
  private betMax(): void {
    if (this.phase !== 'idle') return;
    this.machine.betMax();
    this.refreshMeters();
    void this.deal();
  }

  private handleKey(e: KeyboardEvent): void {
    if (e.repeat || isModalOpen()) return;
    const tgt = e.target as HTMLElement | null;
    if (tgt && /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName)) return;
    const m = /^(?:Digit|Numpad)([1-5])$/.exec(e.code);
    if (!m) return;
    e.preventDefault();
    this.toggleHold(Number(m[1]) - 1);
  }

  private toggleHold(i: number): void {
    if (this.phase !== 'hold' || !this.machine.toggle(i)) return;
    sfxChip();
    const on = this.machine.held[i]!;
    this.holds[i]!.visible = on;
    this.cards[i]!.setGlow(on, !settings().reducedMotion);
  }

  // ═══════════════════════════════════════════════ LA MANO

  private async deal(): Promise<void> {
    if (this.phase !== 'idle') return;
    const denom = this.denom;
    const stake = this.machine.stake(denom);
    if (!this.placeBet(stake)) {
      this.hud.message(vs('insufficient', { coins: this.machine.coins }), 'warn');
      return;
    }
    const t = ++this.token;
    this.roundActive = true;
    this.phase = 'dealing';
    sfxBetConfirm();
    this.machine.start(new PokerHand(this.rng), denom);
    this.hud.setWin(0);
    this.hud.message('');
    this.handText.text = '';
    this.highlightRow(null, false);
    this.refreshControls();
    this.refreshMeters();

    // Giu' le carte della mano precedente, tutte insieme.
    await Promise.all(
      this.cards.map((c, i) => {
        this.holds[i]!.visible = false;
        c.setGlow(false, false);
        gsap.killTweensOf(c);
        c.y = CARD_Y;
        return c.flip(false, 0.24 * this.speed);
      })
    );
    if (!this.alive(t)) return;
    const hand = this.machine.hand!;
    for (let i = 0; i < 5; i++) {
      this.cards[i]!.setCard(hand.cards[i]!);
      sfxCardDeal();
      await this.cards[i]!.flip(true, 0.26 * this.speed);
      if (!this.alive(t)) return;
    }

    this.phase = 'hold';
    const pre = this.machine.preview();
    if (pre && pre.rank !== 'nothing') {
      this.handText.text = vs(pre.rank);
      this.highlightRow(pre.rank, false);
    }
    this.hud.message(vs('hint'));
    this.refreshControls();
  }

  private async draw(): Promise<void> {
    if (this.phase !== 'hold') return;
    const result = this.machine.finish();
    if (!result) return;
    const t = this.token;
    this.pending = { token: t, result };
    this.phase = 'drawing';
    this.hud.message('');
    this.refreshControls();

    const hand = this.machine.hand!;
    await Promise.all(result.replaced.map((i) => this.cards[i]!.flip(false, 0.22 * this.speed)));
    if (!this.alive(t)) return;
    for (const i of result.replaced) {
      this.cards[i]!.setCard(hand.cards[i]!);
      sfxCardFlip();
      await this.cards[i]!.flip(true, 0.26 * this.speed);
      if (!this.alive(t)) return;
    }
    this.finishHand(t);
  }

  /** Salda la mano UNA volta: dalla fine dell'animazione o da `resolvePending`. */
  private settleOnce(): Pending | null {
    const p = this.pending;
    if (!p) return null;
    this.pending = null;
    this.settle(p.result.stake, p.result.win);
    this.roundActive = false;
    return p;
  }

  private finishHand(t: number): void {
    const p = this.pending;
    if (!p || p.token !== t) return;
    this.settleOnce();
    const { evaluation, win, stake } = p.result;
    this.phase = 'idle';
    this.refreshControls();
    this.hud.setWin(win);
    for (const h of this.holds) h.visible = false;
    this.cards.forEach((c, i) => {
      gsap.killTweensOf(c);
      c.y = CARD_Y;
      c.setGlow(evaluation.cards.includes(i), !settings().reducedMotion);
    });
    if (win > 0) {
      this.handText.text = evaluation.rank === 'royalFlush' ? vs('royalTitle') : vs(evaluation.rank);
      this.highlightRow(evaluation.rank, true);
      this.hud.message(vs('youWin', { hand: vs(evaluation.rank), amount: formatMoney(win) }), 'win');
      void this.presenter.present(win, stake, {
        y: 470,
        title: evaluation.rank === 'royalFlush' ? vs('royalTitle') : undefined,
        forceBig: evaluation.rank === 'royalFlush',
      });
    } else {
      this.handText.text = '';
      this.highlightRow(null, false);
      this.hud.message(vs('noWin'));
      sfxLose();
    }
  }

  protected resolvePending(): void {
    // A mano aperta la macchina pesca con le carte gia' tenute e paga.
    if (this.phase === 'hold' || this.phase === 'dealing') {
      const result = this.machine.finish();
      if (result) this.pending = { token: this.token, result };
    }
    this.settleOnce();
    this.token++;
    this.phase = 'idle';
  }

  // ═══════════════════════════════════════════════ REGOLE

  protected rules(): Node {
    const p = (text: string) => el('p', { text });
    const head = el('tr', {}, el('th', { text: vs('rulesHand') }));
    for (let c = 1; c <= MAX_COINS; c++) head.append(el('th', { text: vs('rulesCoin', { n: c }) }));
    const table = el('table', { style: { width: '100%', borderCollapse: 'collapse', margin: '6px 0 14px' } }, head);
    for (const rank of PAY_ORDER) {
      const tr = el('tr', {}, el('td', { text: vs(rank) }));
      for (let c = 1; c <= MAX_COINS; c++) {
        tr.append(el('td', { text: String(coinsWon(rank, c)), style: { textAlign: 'center' } }));
      }
      table.append(tr);
    }
    return div(
      'go-pay',
      el('h3', { text: vs('rulesHow') }),
      p(vs('rules1')),
      p(vs('rules2')),
      p(vs('rules3')),
      p(vs('rules4')),
      el('h3', { text: vs('rulesPays') }),
      table,
      el('p', { class: 'go-pay__note', text: vs('rulesNote') }),
      el('p', { class: 'go-pay__note', text: vs('rulesRtp') }),
      el('p', { class: 'go-pay__note', text: vs('rulesExit') })
    );
  }

  dispose(): void {
    this.token++;
    window.removeEventListener('keydown', this.onKey);
    this.unsubBet?.();
    this.unsubBet = null;
    gsap.killTweensOf(this.rowHL);
    this.betOneBtn = null;
    this.betMaxBtn = null;
    super.dispose();
  }
}
