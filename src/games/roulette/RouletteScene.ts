/**
 * THE ROYAL MIRAGE — Roulette europea
 *
 * ── Contabilita': una sola puntata, molte caselle ──
 * Il tappeto si riempie di fiche mentre il portafoglio e' ancora intatto:
 * `placeBet` avviene UNA volta sola, su `totalStake(bets)`, quando si preme
 * «Gira». Prima di allora le fiche sul panno sono una promessa, e
 * «Annulla»/«Cancella» non devono rimborsare nulla — se scalassimo fiche a
 * ogni click, ogni annullamento sarebbe un rimborso, e il registro
 * racconterebbe venti giocate dove ce n'e' una.
 *
 * Il limite del tavolo (`spotLimit`) si applica invece PER CASELLA, non sul
 * totale: coprire mezzo tappeto e' gioco legittimo, e un tetto sul totale
 * vieterebbe cose che al tavolo vero si fanno (gli annunci da nove fiche).
 * Il tetto per casella garantisce comunque che nessuna singola vincita possa
 * superare 36 volte il tetto del pieno.
 *
 * ── La pallina dice il vero ──
 * Il numero si estrae PRIMA dell'animazione, e la traiettoria viene
 * calcolata per finire in quella casella (`spin.ts`). Non c'e' un secondo
 * sorteggio e non c'e' un "aggiustamento" finale: chi guarda il cilindro
 * vede la pallina ferma nel numero che l'HUD annuncia. E' l'unica cosa che
 * rende credibile una roulette senza legno e senza ottone.
 *
 * ── Animazione e uscita ──
 * Tutto il moto vive in `tick()`: nessun `setTimeout`, nessuna promise che
 * paga. Se la scena muore durante i 0,55 s della transizione d'uscita, il
 * moto muore con lei; e cio' che era gia' deciso lo paga `resolvePending()`.
 */

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { GameScene, type SceneHudOptions } from '@/games/common/GameScene';
import { makeText } from '@/games/common/text';
import { ChipStack } from '@/games/cards/chips';
import { PALETTE, rgba } from '@/art/palette';
import { bake } from '@/art/textureCache';
import { goldFill, roundRectPath } from '@/art/materials';
import { betCeiling, settings, wallet } from '@/state/store';
import { formatMoney } from '@/state/wallet';
import { defaultRng } from '@/games/slots/engine/rng';
import { button, div, el } from '@/ui/dom/el';
import { sfxBallTick, sfxChip, sfxConfirm, sfxDenied, sfxLose, sfxBetConfirm } from '@/audio/synth';
import {
  CALL_BETS,
  POCKETS,
  WHEEL_INDEX,
  colorOf,
  expandCall,
  grossPayout,
  neighboursBet,
  spotLimit,
  stats,
  totalStake,
  winningIds,
  type CallChip,
} from './rules';
import { anchorOf, cellRect, hitRacetrack, hitTable } from './layout';
import { makeTable, racetrackTexture } from './tableArt';
import { WheelView } from './wheelArt';
import {
  DEFLECTORS,
  POCKET_R,
  TRACK_R,
  ballAt,
  pocketAngle,
  planSpin,
  rotorAt,
  totalTime,
  type SpinPlan,
} from './spin';
import { rs } from './strings';
import type { TutorialStep } from '@/ui/dom/Tutorial';


const TAU = Math.PI * 2;

/** Composizione: ruota a sinistra, racetrack e tabellone a destra, tappeto sotto. */
const WHEEL_X = 332;
const WHEEL_Y = 278;
const WHEEL_SCALE = 0.9;
// Il tappeto finisce a y≈854: sotto, fino a 920, c'e' la striscia dei
// messaggi dell'HUD, che altrimenti coprirebbe le chance semplici.
const TABLE_SCALE = 0.92;
const TABLE_X = 470;
const TABLE_Y = 460;
const RT_SCALE = 0.62;
const RT_X = 702;
const RT_Y = 178;
const BOARD_X = 1356;
const BOARD_Y = 150;
const BOARD_W = 536;
/** Altezza del tabellone: 16 uscite su due righe + quattro righe di statistiche. */
const BOARD_H = 300;

type Phase = 'bet' | 'spin' | 'result';

export class RouletteScene extends GameScene {
  readonly name = 'roulette';
  readonly gameId = 'roulette' as const;

  private readonly rng = defaultRng();
  private phase: Phase = 'bet';
  private disposed = false;

  /** Puntate sul tappeto, non ancora scalate dal portafoglio. */
  private readonly bets = new Map<string, number>();
  /** Pila di click, per «Annulla»: ogni voce e' (casella, fiche aggiunte). */
  private readonly undoStack: { id: string; amount: number }[][] = [];
  private lastBets: Map<string, number> | null = null;

  private readonly history: number[] = [];

  private wheel!: WheelView;
  private table!: Sprite;
  private racetrack!: Sprite;
  private chips!: Container;
  private readonly stacks = new Map<string, ChipStack>();
  private marks!: Graphics;
  private board!: Container;
  private boardNumbers!: Container;
  private boardLines: Text[] = [];
  private plaqueText!: Text;
  private plaqueBg!: Graphics;
  private stakeLabel!: Text;

  private anim: { plan: SpinPlan; t: number } | null = null;
  /** Posizione della pallina nella casella, per tenerla dentro a giro finito. */
  private restRel: number | null = null;
  private lastTickSlot = 0;
  private lastTickAt = 0;
  private clock = 0;
  /** Numero estratto della giocata aperta: lo paga anche `resolvePending()`. */
  private drawn: number | null = null;

  private undoBtn!: HTMLButtonElement;
  private clearBtn!: HTMLButtonElement;
  private repeatBtn!: HTMLButtonElement;

  protected backdropDim = 0.4;
  /** Il tavolo sta nella sala in marmo del palazzo, la stessa della lobby. */

  protected hudOptions(): SceneHudOptions {
    return { primaryLabel: rs('spin'), onPrimary: () => this.onPrimary(), betMode: 'chips' };
  }

  // ═══════════════════════════════════════════════ COSTRUZIONE

  protected build(): void {
    this.wheel = new WheelView();
    this.wheel.position.set(WHEEL_X, WHEEL_Y);
    this.wheel.scale.set(WHEEL_SCALE);
    this.world.addChild(this.wheel);

    this.table = makeTable();
    this.table.position.set(TABLE_X, TABLE_Y);
    this.table.scale.set(TABLE_SCALE);
    this.table.eventMode = 'static';
    this.table.cursor = 'pointer';
    this.table.on('pointertap', (e) => {
      const p = e.getLocalPosition(this.table);
      this.onTableClick(p.x, p.y);
    });
    this.world.addChild(this.table);

    this.racetrack = new Sprite(racetrackTexture());
    this.racetrack.position.set(RT_X, RT_Y);
    this.racetrack.scale.set(RT_SCALE);
    this.racetrack.eventMode = 'static';
    this.racetrack.cursor = 'pointer';
    this.racetrack.on('pointertap', (e) => {
      const p = e.getLocalPosition(this.racetrack);
      this.onRacetrackClick(p.x, p.y);
    });
    this.world.addChild(this.racetrack);

    // Le fiche vivono nello stesso spazio del tappeto, quindi `anchorOf`
    // (misure di `layout.ts`) vale senza conversioni: una fiche non puo'
    // finire su una casella diversa da quella che il hit-test ha scelto.
    this.marks = new Graphics();
    this.chips = new Container();
    const layer = new Container();
    layer.position.set(TABLE_X, TABLE_Y);
    layer.scale.set(TABLE_SCALE);
    layer.addChild(this.marks, this.chips);
    this.world.addChild(layer);

    this.buildPlaque();
    this.buildBoard();
    this.refreshBoard();

    this.wheel.setRotor(0);
  }

  /** Targa d'ottone sotto al cilindro: il numero uscito, grande e leggibile. */
  private buildPlaque(): void {
    const c = new Container();
    c.position.set(236, 572);
    this.plaqueBg = new Graphics();
    this.plaqueText = makeText('—', 'numeric', 64);
    this.plaqueText.position.set(0, 0);
    c.addChild(this.plaqueBg, this.plaqueText);
    this.world.addChild(c);
    this.drawPlaque(null);

    this.stakeLabel = makeText('', 'small', 24);
    this.stakeLabel.position.set(236, 634);
    this.world.addChild(this.stakeLabel);
  }

  private drawPlaque(n: number | null): void {
    const w = 300;
    const h = 92;
    // A riposo la targa e' la superficie del pannello: il COLORE arriva solo
    // con l'uscita di un numero, ed e' il cambio a farla notare.
    const tone = n === null ? PALETTE.plum.lifted : n === 0 ? PALETTE.felt.light : colorOf(n) === 'red' ? PALETTE.red.core : PALETTE.plum.abyss;
    this.plaqueBg
      .clear()
      .roundRect(-w / 2, -h / 2, w, h, 14)
      .fill({ color: tone, alpha: 0.95 })
      .roundRect(-w / 2, -h / 2, w, h, 14)
      .stroke({ color: PALETTE.gold.core, width: 3, alpha: 0.9 });
    this.plaqueText.text = n === null ? '—' : String(n);
    // Il preset `numeric` e' oro col contorno scuro: sulle tinte sature si
    // legge, sul marmo a riposo il trattino va in oro profondo.
    this.plaqueText.alpha = n === null ? 0.55 : 1;
  }

  private static boardTexture() {
    return bake(
      'roulette/board',
      BOARD_W,
      BOARD_H,
      (ctx, w, h) => {
        roundRectPath(ctx, 2, 2, w - 4, h - 4, 16);
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, rgba(PALETTE.plum.lifted, 0.94));
        g.addColorStop(1, rgba(PALETTE.plum.abyss, 0.94));
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = goldFill(ctx, 0, 0, w, h, { polish: 0.7 });
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(18, 52);
        ctx.lineTo(w - 18, 52);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = rgba(PALETTE.gold.light, 0.4);
        ctx.stroke();
      },
      { res: 1 }
    );
  }

  private buildBoard(): void {
    this.board = new Container();
    this.board.position.set(BOARD_X, BOARD_Y);
    const bg = new Sprite(RouletteScene.boardTexture());
    const title = makeText(rs('history'), 'label', 22);
    title.position.set(BOARD_W / 2, 28);
    this.boardNumbers = new Container();
    this.boardNumbers.position.set(0, 0);
    this.board.addChild(bg, title, this.boardNumbers);
    this.boardLines = [];
    for (let i = 0; i < 4; i++) {
      const t = makeText('', 'small', 21);
      t.anchor.set(0, 0.5);
      t.position.set(22, 204 + i * 24);
      this.boardLines.push(t);
      this.board.addChild(t);
    }
    this.world.addChild(this.board);
  }

  /** Ultime uscite come gettoni colorati + riepilogo da `stats()`. */
  private refreshBoard(): void {
    this.boardNumbers.removeChildren().forEach((c) => c.destroy({ children: true }));
    const s = stats(this.history);
    const cols = 8;
    const size = 54;
    const gap = 6;
    const x0 = (BOARD_W - (cols * size + (cols - 1) * gap)) / 2;
    this.history.slice(0, 16).forEach((n, i) => {
      const gx = x0 + (i % cols) * (size + gap);
      const gy = 72 + Math.floor(i / cols) * (size + gap);
      const c = colorOf(n);
      const g = new Graphics()
        .roundRect(gx, gy, size, size, 8)
        .fill({ color: c === 'red' ? PALETTE.red.core : c === 'black' ? PALETTE.plum.abyss : PALETTE.felt.core, alpha: i === 0 ? 1 : 0.78 })
        .roundRect(gx, gy, size, size, 8)
        .stroke({ color: i === 0 ? PALETTE.gold.core : PALETTE.gold.deep, width: i === 0 ? 2.5 : 1.2, alpha: 0.85 });
      const t = makeText(String(n), 'value', 26, { fill: PALETTE.text.strong });
      t.position.set(gx + size / 2, gy + size / 2);
      this.boardNumbers.addChild(g, t);
    });
    const fmt = (xs: readonly number[]) => (xs.length ? xs.join(' · ') : '—');
    const lines = [
      rs('statsColor', { n: s.count, r: s.red, b: s.black, z: s.zero }),
      rs('statsSplit', { e: s.even, o: s.odd, l: s.low, h: s.high }),
      `${rs('hot')}: ${fmt(s.hot)}`,
      `${rs('cold')}: ${fmt(s.cold)}`,
    ];
    this.boardLines.forEach((t, i) => (t.text = lines[i] ?? ''));
  }

  async enter(): Promise<void> {
    await super.enter();
    this.undoBtn = button(rs('undo'), { variant: 'secondary', size: 'sm', icon: '↺', onClick: () => this.undo() });
    this.clearBtn = button(rs('clear'), { variant: 'secondary', size: 'sm', icon: '✕', onClick: () => this.clearBets() });
    this.repeatBtn = button(rs('repeat'), { variant: 'secondary', size: 'sm', icon: '⟳', onClick: () => this.repeatBets() });
    // In alto a destra e non nella barra: la fila dei nove tagli di fiche
    // occupa gia' la barra, e tre pulsanti in piu' vi diventerebbero illeggibili.
    this.hud.topExtra.append(this.repeatBtn, this.undoBtn, this.clearBtn);
    this.hud.message(rs('place'));
    this.syncControls();
  }

  // ═══════════════════════════════════════════════ PUNTATE

  private syncControls(): void {
    if (this.disposed) return;
    const betting = this.phase === 'bet';
    const any = this.bets.size > 0;
    this.undoBtn.disabled = !betting || this.undoStack.length === 0;
    this.clearBtn.disabled = !betting || !any;
    this.repeatBtn.disabled = !betting || !this.lastBets;
    this.hud.setPrimaryEnabled(this.phase !== 'spin');
    const stake = totalStake(this.bets);
    this.stakeLabel.text = stake > 0 ? rs('stake', { amount: formatMoney(stake) }) : '';
  }

  private deny(msg: string): void {
    sfxDenied();
    this.hud.message(msg, 'warn');
  }

  /**
   * Prova a posare `chips` fiche. O passano tutte o nessuna: un annuncio da
   * nove fiche a meta' sarebbe una puntata che il giocatore non ha chiesto.
   */
  private addChips(chips: readonly { id: string; amount: number }[]): void {
    if (this.phase !== 'bet') return;
    const ceiling = betCeiling();
    const balance = wallet().balance;
    let extra = 0;
    for (const c of chips) {
      const cur = this.bets.get(c.id) ?? 0;
      const max = spotLimit(c.id, ceiling);
      if (cur + c.amount > max) {
        this.deny(rs('overLimit', { max: formatMoney(max) }));
        return;
      }
      extra += c.amount;
    }
    if (totalStake(this.bets) + extra > balance) {
      this.deny(rs('noMoney'));
      return;
    }
    for (const c of chips) this.bets.set(c.id, (this.bets.get(c.id) ?? 0) + c.amount);
    this.undoStack.push(chips.map((c) => ({ ...c })));
    sfxChip();
    this.hud.message('');
    this.refreshChips();
    this.syncControls();
  }

  private onTableClick(x: number, y: number): void {
    if (this.phase !== 'bet') return;
    const id = hitTable(x, y);
    if (!id) return;
    this.addChips([{ id, amount: wallet().bet }]);
  }

  private onRacetrackClick(x: number, y: number): void {
    if (this.phase !== 'bet') return;
    const hit = hitRacetrack(x, y);
    if (!hit) return;
    const chip = wallet().bet;
    const spread: readonly CallChip[] = hit.type === 'number' ? neighboursBet(hit.n, 2) : CALL_BETS[hit.id];
    const m = expandCall(spread, chip);
    this.addChips([...m].map(([id, amount]) => ({ id, amount })));
  }

  private undo(): void {
    if (this.phase !== 'bet') return;
    const last = this.undoStack.pop();
    if (!last) return;
    for (const c of last) {
      const left = (this.bets.get(c.id) ?? 0) - c.amount;
      if (left > 0) this.bets.set(c.id, left);
      else this.bets.delete(c.id);
    }
    sfxChip();
    this.refreshChips();
    this.syncControls();
  }

  private clearBets(): void {
    if (this.phase !== 'bet') return;
    this.bets.clear();
    this.undoStack.length = 0;
    sfxChip();
    this.refreshChips();
    this.syncControls();
  }

  private repeatBets(): void {
    if (this.phase !== 'bet' || !this.lastBets) return;
    this.bets.clear();
    this.undoStack.length = 0;
    this.addChips([...this.lastBets].map(([id, amount]) => ({ id, amount })));
  }

  /** Allinea le pile di fiche alla mappa delle puntate. */
  private refreshChips(): void {
    for (const [id, stack] of this.stacks) {
      if (!this.bets.has(id)) {
        stack.destroy();
        this.stacks.delete(id);
      }
    }
    for (const [id, amount] of this.bets) {
      let stack = this.stacks.get(id);
      if (!stack) {
        stack = new ChipStack(0.62);
        const p = anchorOf(id);
        stack.position.set(p.x, p.y);
        this.chips.addChild(stack);
        this.stacks.set(id, stack);
      }
      if (stack.value !== amount) stack.set(amount);
    }
  }

  // ═══════════════════════════════════════════════ GIOCATA

  private onPrimary(): void {
    if (this.phase === 'spin') return;
    if (this.phase === 'result') {
      this.newRound();
      return;
    }
    this.spin();
  }

  private newRound(): void {
    this.phase = 'bet';
    this.bets.clear();
    this.undoStack.length = 0;
    this.refreshChips();
    this.marks.clear();
    this.hud.setWin(0);
    this.hud.setPrimary(rs('spin'));
    this.hud.lockBet(false);
    this.hud.message(rs('place'));
    this.syncControls();
  }

  private spin(): void {
    const stake = totalStake(this.bets);
    if (stake <= 0) {
      this.deny(rs('noBets'));
      return;
    }
    if (!this.placeBet(stake)) {
      this.deny(rs('noMoney'));
      return;
    }
    this.lastBets = new Map(this.bets);
    this.roundActive = true;
    this.phase = 'spin';
    this.marks.clear();
    this.hud.lockBet(true);
    this.hud.setWin(0);
    this.hud.message(rs('noMoreBets'));
    this.syncControls();
    sfxBetConfirm();

    // Il numero PRIMA del moto: l'animazione lo recita, non lo decide.
    const n = this.rng.int(POCKETS);
    this.drawn = n;
    this.drawPlaque(null);

    const s = settings();
    // Lancio lungo e pochi giri: la frenata e' una cubica, quindi la velocita'
    // di partenza vale ~3 × giri/durata. A 7 s e 4 giri l'occhio segue la
    // pallina invece di vedere una scia (con 4,6 s e 5 giri era quasi il doppio).
    const duration = s.reducedMotion ? 0.45 : s.fastPlay ? 3.5 : 7;
    const settle = s.reducedMotion ? 0.1 : s.fastPlay ? 0.9 : 1.8;
    const ball0 = this.restRel === null ? this.wheel.rotorAngle - Math.PI / 2 : this.wheel.rotorAngle + this.restRel;
    const plan = planSpin(n, this.wheel.rotorAngle, ball0, {
      duration,
      settle,
      rotorTurns: s.reducedMotion ? 0.35 : 1.4,
      ballTurns: s.reducedMotion ? 1 : s.fastPlay ? 3 : 4,
    });
    this.anim = { plan, t: 0 };
    this.restRel = null;
    this.lastTickSlot = Math.floor((this.wheel.rotorAngle + ball0) / (TAU / DEFLECTORS));
  }

  /** La pallina e' nella casella: da qui l'esito e' pubblico e pagabile. */
  private land(): void {
    if (this.disposed || this.drawn === null) return;
    const n = this.drawn;
    const stake = this.openStake;
    const payout = grossPayout(this.bets, n);
    const wins = winningIds(this.bets, n);

    this.phase = 'result';
    this.settle(stake, payout);
    this.roundActive = false;
    this.drawn = null;

    this.history.unshift(n);
    this.drawPlaque(n);
    this.refreshBoard();
    this.markWinners(n, wins);

    const color = rs(colorOf(n) === 'red' ? 'red' : colorOf(n) === 'black' ? 'black' : 'green');
    this.hud.setWin(payout);
    this.hud.setPrimary(rs('newRound'));
    this.hud.message(
      payout > 0 ? rs('win', { n, color, amount: formatMoney(payout) }) : rs('lose', { n, color }),
      payout > 0 ? 'win' : 'info'
    );
    this.syncControls();

    const p = this.wheel.pocketPoint(pocketAngle(WHEEL_INDEX[n]!));
    this.presenter.sparks(p.x, p.y, payout > 0 ? 44 : 16, payout > 0 ? PALETTE.gold.hot : PALETTE.plum.raised);
    if (payout > 0) void this.presenter.present(payout, Math.max(1, stake), { x: 960, y: 420 });
    else sfxLose();
    if (payout > 0) sfxConfirm();
  }

  /** Evidenzia la casella uscita sul tappeto e le pile vincenti. */
  private markWinners(n: number, wins: readonly string[]): void {
    const g = this.marks.clear();
    const r = cellRect(n);
    g.roundRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 8).stroke({ color: PALETTE.gold.hot, width: 4, alpha: 0.95 });
    for (const id of wins) {
      const p = anchorOf(id);
      g.circle(p.x, p.y, 34).stroke({ color: PALETTE.win.core, width: 4, alpha: 0.9 });
    }
  }

  protected resolvePending(): void {
    // Il numero e' gia' estratto da prima dell'animazione: uscire a meta'
    // non annulla nulla, paga quello che il cilindro ha gia' deciso.
    const n = this.drawn;
    this.drawn = null;
    this.anim = null;
    this.settle(this.openStake, n === null ? 0 : grossPayout(this.bets, n));
  }

  // ═══════════════════════════════════════════════ MOTO

  protected tick(dt: number): void {
    if (this.disposed) return;
    this.clock += dt;
    const anim = this.anim;
    if (anim) {
      anim.t += dt;
      const total = totalTime(anim.plan);
      const b = ballAt(anim.plan, anim.t);
      this.wheel.setRotor(rotorAt(anim.plan, anim.t));
      this.wheel.setBall(b.angle, b.radius);
      this.deflectorTicks(b.angle, b.radius);
      if (this.phase === 'spin' && anim.t >= anim.plan.duration) {
        this.restRel = b.rel;
        this.land();
      }
      if (anim.t >= total) {
        this.restRel = b.rel;
        this.anim = null;
      }
      return;
    }
    // Riposo: il cilindro continua a girare piano e la pallina resta nella
    // sua casella. E' la prova visibile che il risultato non e' un cartello.
    if (!settings().reducedMotion) {
      this.wheel.setRotor(this.wheel.rotorAngle + dt * 0.14);
      if (this.restRel !== null) this.wheel.setBall(this.wheel.rotorAngle + this.restRel, POCKET_R);
    }
  }

  /** Tic della pallina sui deflettori, con il tono legato alla velocita'. */
  private deflectorTicks(angle: number, radius: number): void {
    const step = TAU / DEFLECTORS;
    const slot = Math.floor(angle / step);
    if (slot === this.lastTickSlot) return;
    const crossed = Math.abs(slot - this.lastTickSlot);
    this.lastTickSlot = slot;
    if (this.clock - this.lastTickAt < 0.05) return;
    this.lastTickAt = this.clock;
    // Piu' la pallina e' bassa e lenta, piu' il tono scende: la frenata si
    // sente prima di vedersi.
    const fast = Math.min(1, crossed / 2);
    const low = Math.max(0, Math.min(1, (radius - POCKET_R) / (TRACK_R - POCKET_R)));
    sfxBallTick(0.65 + fast * 0.5 + low * 0.35);
  }

  // ═══════════════════════════════════════════════ REGOLE

  protected tutorialGame(): TutorialStep[] {
    return [
      { title: rs('tutTableT'), text: rs('tutTableX'), target: this.pixiTarget(() => this.table) },
      { title: rs('tutWheelT'), text: rs('tutWheelX'), target: this.pixiTarget(() => this.wheel) },
      { title: rs('tutToolsT'), text: rs('tutToolsX'), target: '.go-hud__top-extra' },
    ];
  }

  protected rules(): Node {
    const pay = [
      ['kStraight', '35:1'],
      ['kSplit', '17:1'],
      ['kStreet', '11:1'],
      ['kTrio', '11:1'],
      ['kCorner', '8:1'],
      ['kBasket', '8:1'],
      ['kLine', '5:1'],
      ['kColumn', '2:1'],
      ['kDozen', '2:1'],
      ['kEven', '1:1'],
    ] as const;
    const grid = div('go-pay__grid');
    for (const [key, odds] of pay) {
      grid.append(
        div('go-pay__item', div('go-pay__text', el('strong', { text: odds }), el('span', { text: rs(key) })))
      );
    }
    return div(
      'go-pay',
      el('h3', { text: rs('rulesTitle') }),
      el('p', { text: rs('rulesIntro') }),
      el('h3', { text: rs('rulesPays') }),
      grid,
      el('p', { class: 'go-pay__note', text: rs('rulesLimit') }),
      el('p', { class: 'go-pay__note', text: rs('rulesZero') }),
      el('p', { class: 'go-pay__note', text: rs('rulesFair') })
    );
  }

  dispose(): void {
    // Prima di tutto: ogni callback residuo deve trovare la scena "morta".
    this.disposed = true;
    this.anim = null;
    for (const s of this.stacks.values()) s.destroy();
    this.stacks.clear();
    super.dispose();
  }
}

