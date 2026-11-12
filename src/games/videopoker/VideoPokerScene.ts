/**
 * THE ROYAL MIRAGE — Video poker "Jacks or Better 9/6"
 *
 *   world
 *   ├─ cabinet    cornice laccata e velluto ametista (art.ts, una texture)
 *   ├─ paytable   vetro scuro + colonna dei premi + riga accesa + cifre
 *   ├─ status     puntata della mano, combinazione in mano
 *   └─ cards      cinque carte fisse con il loro cartiglio TENUTA
 *
 * ── Il giro ──
 *   Distribuisci → placeBet(puntata) → cinque carte girate in fila
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
import { actions, settings, store, wallet } from '@/state/store';
import { formatMoney } from '@/state/wallet';
import { PALETTE } from '@/art/palette';
import { defaultRng } from '@/games/slots/engine/rng';
import { CardView } from '@/games/cards/CardView';
import { warmCardTextures } from '@/games/cards/art';
import { isModalOpen } from '@/ui/dom/Modal';
import { sfxBetConfirm, sfxCardDeal, sfxCardFlip, sfxChip, sfxLose } from '@/audio/synth';
import { PAYS, PAY_ORDER, PokerHand, type HandRank } from './rules';
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
import type { TutorialStep } from '@/ui/dom/Tutorial';

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
  /** Etichette "CAMBIA" della modalita' "tocca per scartare". */
  private discards: Sprite[] = [];

  /** Modalita' di tocco scelta nelle Impostazioni. */
  private get discardMode(): boolean {
    return settings().vpTapMode === 'discard';
  }
  private colHL!: Sprite;
  private rowHL!: Sprite;
  private stakeText!: Text;
  private handText!: Text;

  /** Tieni/Scarta dal tavolo: lo stesso dato della voce nelle Impostazioni. */
  private tapBtn: HTMLButtonElement | null = null;
  private readonly onKey = (e: KeyboardEvent) => this.handleKey(e);
  private unsubBet: (() => void) | null = null;

  protected hudOptions(): SceneHudOptions {
    return {
      primaryLabel: vs('deal'),
      onPrimary: () => this.onPrimary(),
      betMode: 'stepper',
    };
  }

  protected build(): void {
    const cab = new Sprite(cabinetTexture());
    cab.position.set(CAB.x, CAB.y);

    const pay = new Sprite(paytableTexture(PAY_ORDER.length));
    pay.position.set(PAY.x, PAY.y);
    this.colHL = new Sprite(columnHighlightTexture());
    // Una sola colonna di premi (multipli della puntata), sempre accesa.
    this.colHL.position.set(PAY.x + PAY.nameW, PAY.y + 9);
    this.rowHL = new Sprite(rowHighlightTexture());
    this.rowHL.x = PAY.x + 10;
    this.rowHL.visible = false;

    const cells = new Container();
    PAY_ORDER.forEach((rank, i) => {
      const y = PAY.y + PAY.pad + i * PAY.rowH + PAY.rowH / 2;
      const name = makeText(vs(rank).toUpperCase(), 'label', 19, { fill: PALETTE.gold.light, letterSpacing: 2 });
      name.anchor.set(0, 0.5);
      name.position.set(PAY.x + 34, y);
      const v = makeText(`${PAYS[rank]}×`, 'value', 21, { fill: PALETTE.text.strong });
      v.position.set(PAY.x + PAY.nameW + PAY_COL_W / 2, y);
      cells.addChild(name, v);
    });

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
      const d = new Sprite(holdBadgeTexture(vs('discard')));
      d.anchor.set(0.5);
      d.position.set(x, HOLD_Y);
      d.visible = false;
      this.discards.push(d);
      cardLayer.addChild(v, h, d);
    });

    this.world.addChild(cab, pay, this.colHL, this.rowHL, cells, this.stakeText, this.handText, cardLayer);
    this.refreshMeters();
  }

  /** Cuoce il mazzo a tavolo fermo. Vedi `BlackjackScene.tick`. */
  protected tick(): void {
    if (!this.roundActive) warmCardTextures(2);
  }

  async enter(): Promise<void> {
    await super.enter();
    this.tapBtn = button('', { variant: 'secondary', size: 'sm', onClick: () => this.toggleTapMode() });
    this.tapBtn.classList.add('go-hud__toggle');
    this.hud.topExtra.append(this.tapBtn);
    window.addEventListener('keydown', this.onKey);
    // La puntata si cambia dall'HUD: quella a schermo la segue.
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

  /** Puntata dell'HUD: la mano in corso usa quella fissata alla distribuzione. */
  private get denom(): number {
    return wallet().bet;
  }

  private refreshMeters(): void {
    if (this.disposed || !this.stakeText) return;
    this.stakeText.text = `${vs('total').toUpperCase()} ${formatMoney(this.machine.stake(this.denom))}`;
  }

  /**
   * Solo a mano ferma: a carte servite il modo ha gia' deciso quali carte
   * partono tenute (`holdAll` in modalita' Scarta), e cambiarlo li' le
   * scambierebbe di significato sotto gli occhi del giocatore.
   */
  private toggleTapMode(): void {
    if (this.phase !== 'idle') return;
    actions.updateSettings({ vpTapMode: this.discardMode ? 'hold' : 'discard' });
    this.hud.message(this.discardMode ? vs('tapNowDiscard') : vs('tapNowHold'));
    this.refreshControls();
  }

  private refreshControls(): void {
    const free = this.phase === 'idle';
    if (this.tapBtn) {
      this.tapBtn.textContent = this.discardMode ? vs('tapDiscard') : vs('tapHold');
      this.tapBtn.disabled = !free;
    }
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
    this.paintHold(i);
  }

  /**
   * Stato visivo di una carta durante la scelta. "Tieni": la carta tenuta
   * brilla e porta TENUTA. "Scarta": tutte partono tenute, quella toccata
   * si abbassa, si spegne e porta CAMBIA. Il motore e' lo stesso: cambia solo
   * cosa significa il tocco.
   */
  private paintHold(i: number): void {
    const held = this.machine.held[i]!;
    const card = this.cards[i]!;
    if (this.discardMode) {
      this.holds[i]!.visible = false;
      this.discards[i]!.visible = !held;
      card.setGlow(false, false);
      card.alpha = held ? 1 : 0.5;
      card.y = held ? CARD_Y : CARD_Y + 18;
    } else {
      this.discards[i]!.visible = false;
      this.holds[i]!.visible = held;
      card.alpha = 1;
      card.setGlow(held, !settings().reducedMotion);
    }
  }

  // ═══════════════════════════════════════════════ LA MANO

  private async deal(): Promise<void> {
    if (this.phase !== 'idle') return;
    const denom = this.denom;
    const stake = this.machine.stake(denom);
    if (!this.placeBet(stake)) {
      this.hud.message(vs('insufficient'), 'warn');
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
        this.discards[i]!.visible = false;
        c.alpha = 1;
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
    if (this.discardMode) {
      this.machine.holdAll();
      for (let i = 0; i < 5; i++) this.paintHold(i);
    }
    const pre = this.machine.preview();
    if (pre && pre.rank !== 'nothing') {
      this.handText.text = vs(pre.rank);
      this.highlightRow(pre.rank, false);
    }
    this.hud.message(vs(this.discardMode ? 'hintDiscard' : 'hint'));
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
    for (const d of this.discards) d.visible = false;
    this.cards.forEach((c) => {
      c.alpha = 1;
      c.y = CARD_Y;
    });
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

  protected tutorialGame(): TutorialStep[] {
    return [
      { title: vs('tutPayT'), text: vs('tutPayX'), target: this.designTarget(PAY.x, PAY.y, PAY.w, PAY.h) },
      {
        title: vs('tutCardsT'),
        text: vs(this.discardMode ? 'tutCardsDiscard' : 'tutCardsHold'),
        target: this.designTarget(CARD_XS[0]! - CARD_WIDTH / 2, CARD_Y - CARD_H / 2, CARD_XS[4]! - CARD_XS[0]! + CARD_WIDTH, CARD_H + 70),
      },
      { title: vs('tutCoinsT'), text: vs('tutCoinsX'), target: '.go-hud__meter--bet' },
    ];
  }

  protected rules(): Node {
    const p = (text: string) => el('p', { text });
    const head = el('tr', {}, el('th', { text: vs('rulesHand') }), el('th', { text: vs('rulesPay') }));
    const table = el('table', { style: { width: '100%', borderCollapse: 'collapse', margin: '6px 0 14px' } }, head);
    for (const rank of PAY_ORDER) {
      const tr = el('tr', {}, el('td', { text: vs(rank) }), el('td', { text: `${PAYS[rank]}×`, style: { textAlign: 'center' } }));
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
    super.dispose();
  }
}
