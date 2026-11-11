/**
 * THE ROYAL MIRAGE — Il tavolo di blackjack
 *
 *   world
 *   ├─ table      feltro smeraldo, bracciolo in pelle, scritte d'oro (una texture)
 *   ├─ shoe       il sabot, da cui parte ogni carta
 *   ├─ dealerRow  le carte del banco
 *   ├─ insurance  la pila dell'assicurazione, sulla fascia dedicata
 *   └─ hands      una Container per mano del giocatore (carte, fiche, totale)
 *
 * ── Chi decide cosa ──
 * `BlackjackRound` e' l'unica fonte di verita': la scena gli chiede le
 * mosse legali (`legal()`) a OGNI aggiornamento dei pulsanti e anima le
 * carte che lui ha gia' estratto. Nessuna copia dello stato qui: una copia
 * prima o poi diverge, e un pulsante "Dividi" acceso su una mano non
 * divisibile e' un bug che costa fiche.
 *
 * ── Contabilita' ──
 *   puntata iniziale   placeBet(puntata)                     → apre la giocata
 *   raddoppio/divisione/assicurazione  placeBet(costo, {countRound:false})
 *   fine mano          settle(totale giocato, vincita lorda)  → UNA volta
 * `settle` del registro e' gia' idempotente; qui c'e' in piu' il gettone
 * `token`, che impedisce a una coroutine di una mano vecchia (ancora in
 * volo durante i 0,55 s della transizione d'uscita) di toccare la nuova.
 *
 * ── Doppi click ──
 * Durante un'animazione `phase` vale 'acting' e ogni comando la ignora; i
 * pulsanti si riaccendono appena la carta e' atterrata, non dopo un timer.
 */

import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { gsap } from 'gsap';
import { GameScene, type SceneHudOptions } from '@/games/common/GameScene';
import { makeText } from '@/games/common/text';
import { button, div, el } from '@/ui/dom/el';
import { settings, wallet } from '@/state/store';
import { formatMoney } from '@/state/wallet';
import { bake } from '@/art/textureCache';
import { PALETTE, rgba } from '@/art/palette';
import { defaultRng } from '@/games/slots/engine/rng';
import { Shoe, type Card } from '@/games/cards/card';
import { CardView } from '@/games/cards/CardView';
import { warmCardTextures } from '@/games/cards/art';
import { ChipStack } from '@/games/cards/chips';
import {
  FELT_EMERALD,
  arcText,
  brassEdge,
  cardSlot,
  feltStar,
  goldArc,
  leatherRail,
  makeShoe,
  velvet,
  SHOE_MOUTH,
} from '@/games/cards/table';
import { sfxBetConfirm, sfxCardDeal, sfxCardFlip, sfxChip, sfxLose } from '@/audio/synth';
import { BlackjackRound, handTotal, isBlackjack, insuranceCost, type HandOutcome } from './rules';
import { SEATS, badgeLabel, fanOffsets, moveCost, seatXs, settlement, type PaidMove } from './flow';
import { bs } from './strings';
import type { TutorialStep } from '@/ui/dom/Tutorial';


// ─────────────────────────────────────────────── GEOMETRIA (px di design)

const TABLE_Y = 96;
const TABLE_H = 834;
/**
 * Alto abbastanza da restare sopra l'arco "il banco sta su tutti i 17"
 * anche con cinque carte: l'arco SALE verso i lati, mentre la mano del banco
 * si allarga lateralmente. A 252 la quarta carta copriva la scritta.
 */
const DEALER_Y = 226;
const HAND_Y = 640;
const BADGE_Y = 760;
/**
 * Le fiche stanno sul cerchio della postazione, non di lato: le mani
 * esterne finirebbero oltre il bordo curvo del tavolo.
 */
const CHIP_Y = 836;
/** Centro (in coordinate della texture) degli archi delle scritte: sopra il banco. */
const ARC_CY = -110;
/**
 * La pila dell'assicurazione sta SULLA fascia "assicurazione paga 2 a 1",
 * a destra della scritta: e' li' che il mazziere la posa.
 */
const INS_X = 1230;
const INS_Y = TABLE_Y + ARC_CY + Math.sqrt(505 ** 2 - (INS_X - 960) ** 2) + 12;
const SHOE_POS = { x: 1648, y: 246 };
const DEALER_CARD_W = 140;
const PLAYER_CARD_W = 150;

type Phase = 'idle' | 'dealing' | 'insurance' | 'player' | 'acting' | 'dealer';

interface HandView {
  node: Container;
  cards: CardView[];
  chips: ChipStack;
  badge: Container;
  badgeText: Text;
}

export class BlackjackScene extends GameScene {
  readonly name = 'blackjack';
  readonly gameId = 'blackjack' as const;
  protected backdropDim = 0.42;
  /** Il tavolo sta nel salone: lo stesso fondale di tutti i tavoli. */

  private readonly rng = defaultRng();
  private readonly shoe = new Shoe(this.rng, { decks: 6, penetration: 0.75 });
  private round: BlackjackRound | null = null;
  private phase: Phase = 'idle';
  /** Identita' della mano: ogni coroutine controlla di essere ancora la sua. */
  private token = 0;
  private settledToken = -1;

  private shoeSprite!: Sprite;
  private shoeCount!: Text;
  private dealerRow = new Container();
  private dealerViews: CardView[] = [];
  private dealerBadge!: Container;
  private dealerBadgeText!: Text;
  private dealerLabel!: Text;
  private handsLayer = new Container();
  private handViews: HandView[] = [];
  private insuranceChips = new ChipStack(0.7);

  private btn: Record<'hit' | 'stand' | 'double' | 'split' | 'insurance' | 'noInsurance', HTMLButtonElement> | null = null;

  protected hudOptions(): SceneHudOptions {
    return { primaryLabel: bs('deal'), onPrimary: () => void this.deal(), betMode: 'chips' };
  }

  protected build(): void {
    const table = new Sprite(tableTexture());
    table.position.set(0, TABLE_Y);

    this.shoeSprite = makeShoe();
    this.shoeSprite.position.set(SHOE_POS.x, SHOE_POS.y);
    this.shoeSprite.rotation = -0.08;
    this.shoeCount = makeText('', 'small', 18, { fill: PALETTE.card.face });
    this.shoeCount.position.set(SHOE_POS.x, SHOE_POS.y + 106);

    // "BANCO" accanto al totale del banco, non sopra le carte: sopra non c'e'
    // spazio fra la testata dell'HUD e la prima riga di carte.
    const dealerLabel = makeText(bs('dealer').toUpperCase(), 'label', 20, { fill: PALETTE.gold.hot });
    dealerLabel.alpha = 0.8;
    dealerLabel.position.set(960 - 190, DEALER_Y - 44);
    this.dealerLabel = dealerLabel;

    [this.dealerBadge, this.dealerBadgeText] = badge();
    this.dealerBadge.position.set(960 - 190, DEALER_Y);
    this.dealerBadge.visible = false;

    this.insuranceChips.position.set(INS_X, INS_Y);

    this.world.addChild(
      table,
      this.shoeSprite,
      this.shoeCount,
      dealerLabel,
      this.dealerRow,
      this.dealerBadge,
      this.insuranceChips,
      this.handsLayer
    );
    this.updateShoeCount();
  }

  /**
   * Cuoce il mazzo DUE carte per frame mentre il tavolo e' fermo.
   *
   * `warmCardTextures` esisteva da sempre con questo scopo scritto nel suo
   * commento, ma nessuno la chiamava: ogni faccia veniva disegnata e cotta
   * nel frame in cui la carta partiva dal sabot — 2-4 ms di singhiozzo per
   * carta, esattamente durante il volo, e solo le prime volte che un rango
   * compare (quindi un difetto che si manifesta a chi gioca poco e
   * scompare per chi collauda a lungo: il peggiore da notare).
   *
   * La condizione su `roundActive` e' il punto: si cuoce nei momenti morti,
   * mai mentre una mano e' in corso, altrimenti si sposterebbe il costo
   * invece di eliminarlo.
   */
  protected tick(): void {
    if (!this.roundActive) warmCardTextures(2);
  }

  async enter(): Promise<void> {
    await super.enter();
    // Mosse GRANDI e al centro della barra (richiesta del committente: erano
    // piccole e schiacciate a destra). Ogni mossa ha la sua lettera da
    // tastiera, scritta sul pulsante.
    const mk = (label: string, key: string, variant: 'primary' | 'secondary', fn: () => void) => {
      const b = button(label, { variant, size: 'lg', onClick: fn });
      b.classList.add('go-hud__move');
      b.append(el('kbd', { class: 'go-hud__key', text: key.toUpperCase() }));
      b.dataset.key = key.toLowerCase();
      this.hud.actions.append(b);
      return b;
    };
    this.btn = {
      insurance: mk(bs('insurance'), bs('keyInsurance'), 'secondary', () => void this.insurance(true)),
      noInsurance: mk(bs('noInsurance'), bs('keyNoInsurance'), 'secondary', () => void this.insurance(false)),
      split: mk(bs('split'), bs('keySplit'), 'secondary', () => void this.paidMove('split')),
      double: mk(bs('double'), bs('keyDouble'), 'secondary', () => void this.paidMove('double')),
      hit: mk(bs('hit'), bs('keyHit'), 'primary', () => void this.hit()),
      stand: mk(bs('stand'), bs('keyStand'), 'primary', () => void this.stand()),
    };
    this.onMoveKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const tgt = e.target as HTMLElement | null;
      if (tgt && /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName)) return;
      if (document.querySelector('.go-modal')) return;
      const k = e.key.toLowerCase();
      const b = Object.values(this.btn ?? {}).find((x) => x.dataset.key === k && x.style.display !== 'none' && !x.disabled);
      if (b) {
        e.preventDefault();
        b.click();
      }
    };
    window.addEventListener('keydown', this.onMoveKey);
    this.refreshControls();
    this.hud.message(bs('placeBet'));
  }

  // ═══════════════════════════════════════════════ STATO

  private onMoveKey: ((e: KeyboardEvent) => void) | null = null;

  private get disposed(): boolean {
    return this.root.destroyed;
  }

  /** Vero se la coroutine della mano `t` puo' ancora toccare il tavolo. */
  private alive(t: number): boolean {
    return !this.disposed && this.token === t;
  }

  private get speed(): number {
    return settings().reducedMotion ? 0.05 : 1;
  }

  /**
   * Accende i pulsanti leggendo `legal()` del motore. Fuori dalla fase di
   * gioco (o durante un'animazione) tutto spento: e' lo stato del giro, e
   * non un timer, a neutralizzare i doppi click.
   */
  private refreshControls(): void {
    const b = this.btn;
    if (!b) return;
    const r = this.round;
    const legal = r && (this.phase === 'player' || this.phase === 'insurance') ? r.legal() : null;
    const inPlay = this.phase !== 'idle';
    const insuring = this.phase === 'insurance';
    b.insurance.style.display = insuring ? '' : 'none';
    b.noInsurance.style.display = insuring ? '' : 'none';
    for (const k of ['hit', 'stand', 'double', 'split'] as const) b[k].style.display = inPlay && !insuring ? '' : 'none';
    b.insurance.disabled = !legal?.insurance;
    b.noInsurance.disabled = !legal?.insurance;
    b.hit.disabled = !legal?.hit;
    b.stand.disabled = !legal?.stand;
    b.double.disabled = !legal?.double;
    b.split.disabled = !legal?.split;
    // La barra non ha posto per nove fiche E quattro mosse: durante la mano
    // la scelta del gettone sparisce (la puntata resta visibile nel contatore)
    // e al suo posto compaiono le mosse.
    const chipRow = this.hud.root.querySelector<HTMLElement>('.go-hud__chips');
    if (chipRow) chipRow.style.display = inPlay ? 'none' : '';
    this.hud.setActing(inPlay);
    this.hud.setPrimaryEnabled(this.phase === 'idle');
    this.hud.lockBet(this.phase !== 'idle');
  }

  private updateShoeCount(): void {
    this.shoeCount.text = `${bs('shoeLabel')} · ${bs('shoeCards', { n: this.shoe.remaining })}`;
  }

  // ═══════════════════════════════════════════════ LA MANO

  private async deal(): Promise<void> {
    if (this.phase !== 'idle') return;
    const bet = wallet().bet;
    // Il rimescolo avviene FRA le mani, mai a meta': lo decide la carta di taglio.
    const shuffled = this.shoe.shuffleIfNeeded();
    if (!this.placeBet(bet)) {
      this.hud.message(bs('noFunds'), 'warn');
      return;
    }
    const t = ++this.token;
    this.roundActive = true;
    sfxBetConfirm();
    this.phase = 'dealing';
    this.hud.setWin(0);
    this.hud.message(shuffled ? bs('shuffling') : '');
    this.refreshControls();
    await this.clearTable();
    if (!this.alive(t)) return;

    const r = new BlackjackRound(this.shoe, bet);
    this.round = r;
    this.updateShoeCount();
    this.addHandView(0, 960);
    this.syncChips();

    // Ordine reale: giocatore, banco scoperta, giocatore, banco coperta.
    const [p1, p2] = r.hands[0]!.cards;
    const [d1, d2] = r.dealer;
    await this.dealToHand(0, p1!, t);
    if (!this.alive(t)) return;
    await this.dealToDealer(d1!, true, t);
    if (!this.alive(t)) return;
    await this.dealToHand(0, p2!, t);
    if (!this.alive(t)) return;
    await this.dealToDealer(d2!, false, t);
    if (!this.alive(t)) return;

    await this.resume(t);
  }

  /** Dopo la distribuzione o l'assicurazione: si gioca, oppure la mano e' gia' decisa. */
  private async resume(t: number): Promise<void> {
    const r = this.round!;
    if (r.phase === 'insurance') {
      this.phase = 'insurance';
      this.hud.message(`${bs('insuranceAsk')} — ${bs('insuranceCost', { n: insuranceCost(r.baseBet) })}`);
      this.refreshControls();
      return;
    }
    if (r.phase === 'player') {
      this.enterPlayerTurn();
      return;
    }
    await this.dealerTurn(t);
  }

  private enterPlayerTurn(): void {
    const r = this.round!;
    this.phase = 'player';
    this.hud.message(r.hands.length > 1 ? bs('yourTurn', { i: r.active + 1, n: r.hands.length }) : bs('yourTurnOne'));
    this.markActive();
    this.refreshControls();
  }

  /** Esegue una mossa animata e poi decide dove va la mano. */
  private async act(fn: (t: number) => Promise<void>): Promise<void> {
    if (this.phase !== 'player' || !this.round) return;
    const t = this.token;
    this.phase = 'acting';
    this.refreshControls();
    await fn(t);
    if (!this.alive(t)) return;
    this.updateBadges();
    if (this.round.phase === 'player') this.enterPlayerTurn();
    else await this.dealerTurn(t);
  }

  private hit(): Promise<void> {
    return this.act(async (t) => {
      const r = this.round!;
      const idx = r.active;
      const c = r.hit();
      if (!c) return;
      await this.dealToHand(idx, c, t);
      if (!this.alive(t)) return;
      const h = r.hands[idx]!;
      if (handTotal(h.cards).total > 21) this.hud.message(bs('bust', { n: handTotal(h.cards).total }), 'warn');
    });
  }

  private stand(): Promise<void> {
    return this.act(async () => {
      this.round!.stand();
    });
  }

  /**
   * Raddoppio e divisione: le fiche escono PRIMA della mossa. Se il saldo
   * non basta la mossa non avviene e la mano resta com'era.
   */
  private paidMove(move: Exclude<PaidMove, 'insurance'>): Promise<void> {
    if (this.phase !== 'player' || !this.round) return Promise.resolve();
    const cost = moveCost(this.round, move);
    if (cost <= 0) return Promise.resolve();
    if (!this.placeBet(cost, { countRound: false })) {
      this.hud.message(bs('noFunds'), 'warn');
      return Promise.resolve();
    }
    sfxChip();
    return this.act(async (t) => {
      const r = this.round!;
      const idx = r.active;
      if (move === 'double') {
        const c = r.double();
        this.syncChips();
        if (c) await this.dealToHand(idx, c, t, Math.PI / 2);
        return;
      }
      // Divisione: la seconda carta passa a una mano nuova subito a destra.
      const from = this.handViews[idx]!;
      const moved = from.cards.pop()!;
      const pair = r.split();
      if (!pair) return;
      const fresh = this.addHandView(idx + 1, from.node.x);
      const gp = moved.getGlobalPosition();
      fresh.node.addChild(moved);
      moved.position.copyFrom(fresh.node.toLocal(gp));
      fresh.cards.push(moved);
      this.syncChips();
      await this.layoutHands();
      if (!this.alive(t)) return;
      await this.dealToHand(idx, pair[0], t);
      if (!this.alive(t)) return;
      await this.dealToHand(idx + 1, pair[1], t);
    });
  }

  private async insurance(take: boolean): Promise<void> {
    if (this.phase !== 'insurance' || !this.round) return;
    const r = this.round;
    const t = this.token;
    if (take) {
      const cost = moveCost(r, 'insurance');
      if (!this.placeBet(cost, { countRound: false })) {
        this.hud.message(bs('noFunds'), 'warn');
        return;
      }
      sfxChip();
      r.takeInsurance();
    } else {
      r.declineInsurance();
    }
    this.phase = 'acting';
    this.syncChips();
    this.refreshControls();
    await this.resume(t);
  }

  // ═══════════════════════════════════════════════ BANCO E SALDO

  private async dealerTurn(t: number): Promise<void> {
    const r = this.round!;
    this.phase = 'dealer';
    this.markActive(true);
    this.refreshControls();
    // Scopre la coperta.
    const hole = this.dealerViews[1];
    if (hole && !hole.isFaceUp) {
      sfxCardFlip();
      await hole.flip(true, 0.34 * this.speed);
      if (!this.alive(t)) return;
    }
    this.updateBadges(true);
    const before = r.dealer.length;
    r.playDealer();
    for (const c of r.dealer.slice(before)) {
      await this.dealToDealer(c, true, t);
      if (!this.alive(t)) return;
      this.updateBadges(true);
    }
    await this.finishHand(t);
  }

  /** Salda la mano UNA volta. Chiamata dalla fine animazione o da `resolvePending`. */
  private settleOnce(): void {
    const r = this.round;
    if (!r || this.settledToken === this.token) return;
    this.settledToken = this.token;
    const { stake, payout } = settlement(r);
    this.settle(stake, payout);
    this.roundActive = false;
  }

  private async finishHand(t: number): Promise<void> {
    const r = this.round!;
    this.settleOnce();
    const { stake, payout } = settlement(r);
    this.updateBadges(true);
    this.hud.setWin(payout);
    this.hud.message(this.verdict(r), payout > stake ? 'win' : payout === 0 ? 'warn' : 'info');
    this.phase = 'idle';
    this.hud.setPrimary(bs('newHand'));
    this.refreshControls();
    this.updateShoeCount();

    const outs = r.outcomes();
    outs.forEach((o, i) => {
      const v = this.handViews[i];
      if (v && (o.result === 'win' || o.result === 'blackjack')) for (const c of v.cards) c.setGlow(true);
    });
    if (payout > stake) {
      // Il presentatore suona gia' la vincita: niente sfxWin doppio.
      if (!this.alive(t)) return;
      await this.presenter.present(payout, stake, { y: 520 });
    } else if (payout === stake) {
      sfxChip();
    } else if (payout === 0) {
      sfxLose();
    }
  }

  /** Il messaggio di fine mano: singola mano = esito preciso, piu' mani = bilancio. */
  private verdict(r: BlackjackRound): string {
    const outs = r.outcomes();
    const dTot = handTotal(r.dealer).total;
    const dBJ = isBlackjack(r.dealer);
    if (outs.length === 1) {
      const o = outs[0]!;
      const p = handTotal(r.hands[0]!.cards).total;
      let line = describe(o, p, dTot, dBJ);
      if (r.insurance > 0 && r.insuranceReturn() > 0) line += ` · ${bs('insuranceWon')}`;
      return line;
    }
    const { stake, payout } = settlement(r);
    if (payout > stake) return bs('totalWin', { n: formatMoney(payout - stake) });
    if (payout === stake) return bs('totalPush');
    return dTot > 21 ? bs('dealerBust', { n: dTot }) : bs('totalLose');
  }

  protected resolvePending(): void {
    if (!this.round || this.settledToken === this.token) return;
    // Uscita a mano aperta: si sta su tutto, il banco gioca, si paga.
    this.round.forceFinish();
    this.settleOnce();
    // Le coroutine ancora in volo vedono un gettone nuovo e si fermano.
    this.token++;
    this.phase = 'idle';
  }

  // ═══════════════════════════════════════════════ CARTE E FICHE

  private shoeMouth(): { x: number; y: number } {
    const c = Math.cos(this.shoeSprite.rotation);
    const s = Math.sin(this.shoeSprite.rotation);
    return {
      x: SHOE_POS.x + SHOE_MOUTH.x * c - SHOE_MOUTH.y * s,
      y: SHOE_POS.y + SHOE_MOUTH.x * s + SHOE_MOUTH.y * c,
    };
  }

  private async dealToDealer(c: Card, faceUp: boolean, t: number): Promise<void> {
    const v = new CardView(c, { width: DEALER_CARD_W });
    v.rotation = 0.5;
    this.dealerRow.addChild(v);
    this.dealerViews.push(v);
    const offs = fanOffsets(this.dealerViews.length, 58, 0);
    this.dealerViews.slice(0, -1).forEach((cv, i) => gsap.to(cv, { x: 960 + offs[i]!.x, duration: 0.25 * this.speed }));
    sfxCardDeal();
    const mouth = this.shoeMouth();
    v.position.set(mouth.x, mouth.y);
    await v.deal({
      from: mouth,
      to: { x: 960 + offs[offs.length - 1]!.x, y: DEALER_Y },
      flip: faceUp,
      duration: 0.5 * this.speed,
    });
    if (!this.alive(t)) return;
    this.updateShoeCount();
    this.updateBadges();
  }

  private async dealToHand(idx: number, c: Card, t: number, rotation?: number): Promise<void> {
    const hv = this.handViews[idx];
    if (!hv) return;
    const v = new CardView(c, { width: PLAYER_CARD_W });
    v.rotation = 0.5;
    hv.node.addChild(v);
    hv.cards.push(v);
    const offs = fanOffsets(hv.cards.length);
    hv.cards.slice(0, -1).forEach((cv, i) =>
      gsap.to(cv, { x: offs[i]!.x, y: HAND_Y + offs[i]!.y, duration: 0.25 * this.speed })
    );
    const mouth = hv.node.toLocal(this.shoeMouth(), this.world);
    sfxCardDeal();
    const last = offs[offs.length - 1]!;
    await v.deal({
      from: mouth,
      to: { x: last.x, y: HAND_Y + last.y },
      flip: true,
      rotation,
      duration: 0.5 * this.speed,
    });
    if (!this.alive(t)) return;
    this.updateShoeCount();
    this.updateBadges();
  }

  private addHandView(at: number, x: number): HandView {
    const node = new Container();
    node.x = x;
    const chips = new ChipStack(0.7);
    chips.position.set(0, CHIP_Y);
    const [b, bt] = badge();
    b.position.set(0, BADGE_Y);
    b.visible = false;
    node.addChild(chips, b);
    const hv: HandView = { node, cards: [], chips, badge: b, badgeText: bt };
    this.handsLayer.addChild(node);
    this.handViews.splice(at, 0, hv);
    return hv;
  }

  /** Riporta le mani nelle loro postazioni (dopo una divisione). */
  private layoutHands(): Promise<void> {
    const xs = seatXs(this.handViews.length);
    const tweens = this.handViews.map(
      (hv, i) =>
        new Promise<void>((res) => {
          const offs = fanOffsets(hv.cards.length);
          hv.cards.forEach((cv, j) =>
            gsap.to(cv, { x: offs[j]!.x, y: HAND_Y + offs[j]!.y, rotation: 0, duration: 0.3 * this.speed })
          );
          gsap.to(hv.node, { x: xs[i]!, duration: 0.35 * this.speed, ease: 'power2.inOut', onComplete: res });
        })
    );
    return Promise.all(tweens).then(() => undefined);
  }

  /** Le pile seguono le puntate del motore: raddoppio, divisione, assicurazione. */
  private syncChips(): void {
    const r = this.round;
    if (!r) return;
    r.hands.forEach((h, i) => this.handViews[i]?.chips.set(h.bet, !settings().reducedMotion));
    this.insuranceChips.set(r.insurance, !settings().reducedMotion);
  }

  private updateBadges(revealDealer = false): void {
    const r = this.round;
    if (!r) return;
    r.hands.forEach((h, i) => {
      const v = this.handViews[i];
      if (!v || v.cards.length < h.cards.length || h.cards.length === 0) return;
      v.badge.visible = true;
      const bj = isBlackjack(h.cards, h.fromSplit);
      v.badgeText.text = bj ? bs('blackjack') : badgeLabel(handTotal(h.cards), false, h.done || r.phase === 'done');
      v.badgeText.style.fill = handTotal(h.cards).total > 21 ? PALETTE.red.light : bj ? PALETTE.gold.light : PALETTE.text.strong;
    });
    const shown = this.dealerViews.filter((c) => c.isFaceUp).length;
    if (shown === 0) return;
    const hole = this.dealerViews[1];
    const visible = revealDealer || (hole?.isFaceUp ?? false) ? r.dealer.slice(0, this.dealerViews.length) : [r.dealerUp];
    this.dealerBadge.visible = true;
    const left = this.dealerViews[0]!.x - DEALER_CARD_W / 2 - 70;
    this.dealerBadge.x = Math.min(960 - 190, left);
    this.dealerLabel.x = this.dealerBadge.x;
    this.dealerBadgeText.text = badgeLabel(handTotal(visible), visible.length === 2 && isBlackjack(visible), r.phase === 'done');
    this.dealerBadgeText.style.fill = handTotal(visible).total > 21 ? PALETTE.red.light : PALETTE.text.strong;
  }

  /** Alone sulla mano attiva quando ce n'e' piu' d'una. */
  private markActive(off = false): void {
    const r = this.round;
    this.handViews.forEach((v, i) => {
      const on = !off && !!r && r.hands.length > 1 && i === r.active;
      for (const c of v.cards) c.setGlow(on, !settings().reducedMotion);
    });
  }

  /** Raccoglie le carte della mano precedente verso il pozzo a sinistra. */
  private async clearTable(): Promise<void> {
    const all = [...this.dealerViews, ...this.handViews.flatMap((h) => h.cards)];
    const pit = { x: 210, y: 230 };
    if (all.length && !settings().reducedMotion) {
      await Promise.all(all.map((c, i) => c.sweep(c.parent!.toLocal(pit, this.world), i * 0.02, 0.35)));
    }
    for (const c of all) c.destroy();
    for (const h of this.handViews) h.node.destroy({ children: true });
    this.handViews = [];
    this.dealerViews = [];
    this.dealerBadge.visible = false;
    this.insuranceChips.clear();
  }

  // ═══════════════════════════════════════════════ REGOLE

  protected tutorialGame(): TutorialStep[] {
    return [
      { title: bs('tutGoalT'), text: bs('tutGoalX'), target: this.designTarget(470, 120, 980, 700) },
      { title: bs('tutMovesT'), text: bs('tutMovesX'), target: '.go-hud__bar' },
    ];
  }

  protected rules(): Node {
    const p = (text: string) => el('p', { text });
    return div(
      'go-pay',
      el('h3', { text: bs('rulesTable') }),
      ...bs('rulesTableBody').split('\n').map(p),
      el('h3', { text: bs('rulesMoves') }),
      p(bs('rulesHit')),
      p(bs('rulesStand')),
      p(bs('rulesDouble')),
      p(bs('rulesSplit')),
      p(bs('rulesInsurance')),
      el('h3', { text: bs('rulesPays') }),
      p(bs('rulesPayBJ')),
      p(bs('rulesPayWin')),
      p(bs('rulesPayPush')),
      p(bs('rulesPayIns')),
      el('p', { class: 'go-pay__note', text: bs('rulesRound') }),
      el('p', { class: 'go-pay__note', text: bs('rulesRtp') })
    );
  }

  dispose(): void {
    // Le coroutine in volo trovano un gettone nuovo e non toccano piu' nulla.
    this.token++;
    this.btn = null;
    if (this.onMoveKey) window.removeEventListener('keydown', this.onMoveKey);
    this.onMoveKey = null;
    super.dispose();
  }
}

// ─────────────────────────────────────────────── AIUTI

function describe(o: HandOutcome, p: number, d: number, dBJ: boolean): string {
  switch (o.result) {
    case 'blackjack':
      return bs('blackjack');
    case 'bust':
      return bs('bust', { n: p });
    case 'push':
      return bs('push', { n: dBJ ? 'BJ' : p });
    case 'win':
      return d > 21 ? bs('dealerBust', { n: d }) : bs('win', { n: p, d });
    case 'lose':
      return dBJ ? bs('dealerBlackjack') : bs('lose', { n: p, d });
  }
}

/** Pillola scura con il totale: leggibile sopra qualunque carta o feltro. */
function badge(): [Container, Text] {
  const c = new Container();
  const g = new Graphics().roundRect(-52, -19, 104, 38, 19).fill({ color: PALETTE.plum.abyss, alpha: 0.8 });
  g.roundRect(-52, -19, 104, 38, 19).stroke({ color: PALETTE.gold.core, width: 1.5, alpha: 0.9 });
  const t = makeText('', 'value', 22);
  c.addChild(g, t);
  return [c, t];
}

/**
 * Il tavolo, cotto una volta: lato del banco dritto in alto, lato dei
 * giocatori a semicerchio in basso, come i tavoli veri. Le scritte seguono
 * archi concentrici al banco, cosi' "si leggono" dal posto del giocatore.
 */
function tableTexture(): Texture {
  return bake(
    'bj/table',
    1920,
    TABLE_H,
    (ctx, w, h) => {
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(120, 22);
        ctx.lineTo(w - 120, 22);
        ctx.lineTo(w - 120, 300);
        ctx.bezierCurveTo(w - 160, 690, 1340, h - 10, 960, h - 10);
        ctx.bezierCurveTo(580, h - 10, 160, 690, 120, 300);
        ctx.closePath();
      };
      path();
      velvet(ctx, w, h, FELT_EMERALD, w / 2, h * 0.5, w * 0.55);
      // Ombra del bracciolo sul feltro: il feltro "scende" sotto la pelle.
      ctx.save();
      path();
      ctx.clip();
      const v = ctx.createRadialGradient(w / 2, h * 0.45, h * 0.35, w / 2, h * 0.45, w * 0.6);
      v.addColorStop(0, rgba(PALETTE.plum.abyss, 0));
      v.addColorStop(1, rgba(PALETTE.plum.abyss, 0.3));
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // Le scritte e la fascia dell'assicurazione, su archi centrati sul banco.
      // Fra le carte del banco (fondo a ~324) e quelle del giocatore (cima a
      // ~479) ci sono 160 px: tre righe, misurate, non una di piu'.
      const cx = 960;
      const cy = ARC_CY;
      arcText(ctx, bs('tableRule'), cx, cy, 392, 22, { alpha: 0.85 });
      arcText(ctx, bs('tablePay'), cx, cy, 440, 34, { font: 'display', alpha: 0.95 });
      goldArc(ctx, cx, cy, 478, Math.PI * 0.21, Math.PI * 0.79, 1.6, 0.7);
      arcText(ctx, bs('tableIns'), cx, cy, 499, 17, { alpha: 0.7, spacing: 0.3 });
      goldArc(ctx, cx, cy, 520, Math.PI * 0.21, Math.PI * 0.79, 1.6, 0.7);
      feltStar(ctx, cx - 352, cy + 372, 8, 0.8);
      feltStar(ctx, cx + 352, cy + 372, 8, 0.8);

      // Postazioni: segnaposto delle carte e cerchio della puntata.
      for (const x of SEATS) {
        cardSlot(ctx, x, HAND_Y - TABLE_Y, PLAYER_CARD_W / 200, 0.3);
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, CHIP_Y - TABLE_Y - 12, 46, 0, Math.PI * 2);
        ctx.fillStyle = rgba(PALETTE.plum.abyss, 0.108);
        ctx.fill();
        ctx.restore();
        goldArc(ctx, x, CHIP_Y - TABLE_Y - 12, 46, 0, Math.PI * 2, 1.4, 0.6);
      }
      // Segnaposto del banco.
      cardSlot(ctx, 960 - 29, DEALER_Y - TABLE_Y, DEALER_CARD_W / 200, 0.3);
      cardSlot(ctx, 960 + 29, DEALER_Y - TABLE_Y, DEALER_CARD_W / 200, 0.3);

      // Bracciolo e ottone sopra a tutto.
      leatherRail(ctx, path, 30);
      brassEdge(ctx, path, 3);
    },
    { res: 1 }
  );
}
