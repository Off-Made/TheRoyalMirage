/**
 * THE ROYAL MIRAGE — Il tavolo privé del baccarat (Punto Banco)
 *
 *   world
 *   ├─ table     velluto lapis, segnapunti, tre aree di puntata (una texture)
 *   ├─ roads     Big Road e Bead Plate, ridisegnati a ogni colpo
 *   ├─ shoe      il sabot da 8 mazzi, al centro fra le due mani
 *   ├─ areas     zone cliccabili Punto / Pareggio / Banco con le loro fiche
 *   └─ cards     le carte del colpo in corso
 *
 * ── Il colpo e' deciso prima di essere mostrato ──
 * Al click su "Distribuisci" `playCoup` estrae dal sabot TUTTE le carte e
 * stabilisce il vincitore; la scena poi le recita una alla volta,
 * nell'ordine reale (Punto, Banco, Punto, Banco, terza del Punto, terza
 * del Banco). E' il rituale che vende il tavolo: il giocatore non decide
 * nulla, ma guarda il destino arrivare carta per carta. Siccome l'esito e'
 * gia' noto, `resolvePending()` puo' pagarlo subito se si esce a meta'.
 *
 * ── Contabilita' ──
 * Le fiche posate sul tappeto NON escono dal portafoglio: escono tutte
 * insieme con un solo `placeBet(totale)` alla distribuzione, e tornano con
 * un solo `settle`. La tavola (`BetBoard`) impedisce di posare piu' fiche
 * del saldo, cosi' quel `placeBet` non puo' fallire per una puntata che il
 * giocatore ha costruito un gettone alla volta.
 */

import { Container, Graphics, Rectangle, Sprite, Text, type Texture } from 'pixi.js';
import { gsap } from 'gsap';
import { GameScene, type SceneHudOptions } from '@/games/common/GameScene';
import { FONT_STACK } from '@/core/fonts';
import { makeText } from '@/games/common/text';
import { button, div, el } from '@/ui/dom/el';
import { settings, wallet } from '@/state/store';
import { formatMoney } from '@/state/wallet';
import { bake } from '@/art/textureCache';
import { PALETTE, css, rgba } from '@/art/palette';
import { roundRectPath, setGlow, clearGlow } from '@/art/materials';
import { gameById } from '@/games/registry';
import { defaultRng } from '@/games/slots/engine/rng';
import { Shoe } from '@/games/cards/card';
import { CardView } from '@/games/cards/CardView';
import { warmCardTextures } from '@/games/cards/art';
import { ChipStack } from '@/games/cards/chips';
import { FELT_COBALT, brassEdge, embossedText, feltStar, leatherRail, makeShoe, velvet, SHOE_MOUTH } from '@/games/cards/table';
import { sfxBetConfirm, sfxCardDeal, sfxChip, sfxLose } from '@/audio/synth';
import {
  AREAS,
  type BetArea,
  type Bets,
  type Coup,
  type Outcome,
  type Side,
  beadPlate,
  bigRoad,
  handTotal,
  payout,
  playCoup,
} from './rules';
import { BetBoard, recital, roadWindow } from './board';
import { bs } from './strings';
import type { TutorialStep } from '@/ui/dom/Tutorial';


// ─────────────────────────────────────────────── GEOMETRIA (px di design)

const TABLE_Y = 96;
const TABLE_H = 834;
// I tabelloni stanno DENTRO il bracciolo, lontani dagli angoli arrotondati
// del tavolo: una griglia tagliata dalla pelle sembra un errore di stampa.
const CELL = 26;
const ROWS = 6;
const ROAD_Y = 142;
const BEAD = { x: 196, cols: 12 };
const BIG = { x: 196 + 12 * CELL + 30, cols: 46 };
const CARD_W = 140;
const CARD_Y = 466;
const HAND_X: Record<Side, number> = { P: 620, B: 1300 };
const LABEL_Y = 352;
/** Il totale sta accanto al nome della mano, verso il centro: sotto le carte non c'e' spazio. */
const BADGE_DX = 178;
const SHOE_POS = { x: 960, y: 452 };
const AREA_Y = 626;
const AREA_H = 206;
const AREA_RECT: Record<BetArea, { x: number; w: number }> = {
  player: { x: 236, w: 556 },
  tie: { x: 812, w: 296 },
  banker: { x: 1128, w: 556 },
};
const AREA_TONE: Record<BetArea, number> = {
  player: PALETTE.accent.sapphire.core,
  tie: PALETTE.win.core,
  banker: PALETTE.red.core,
};
const SIDE_TONE: Record<Outcome, number> = {
  P: PALETTE.accent.sapphire.light,
  B: PALETTE.red.light,
  T: PALETTE.win.light,
};

type Phase = 'idle' | 'dealing';

interface Pending {
  token: number;
  coup: Coup;
  bets: Bets;
  stake: number;
}

export class BaccaratScene extends GameScene {
  readonly name = 'baccarat';
  readonly gameId = 'baccarat' as const;
  protected backdropDim = 0.42;
  /** Il tavolo sta nel salone: lo stesso fondale di tutti i tavoli. */

  private readonly rng = defaultRng();
  private readonly shoe = new Shoe(this.rng, { decks: 8, penetration: 0.94 });
  private readonly board = new BetBoard();
  private phase: Phase = 'idle';
  private token = 0;
  private pending: Pending | null = null;
  /** Esiti del sabot in corso, per i segnapunti. Si azzerano al rimescolo. */
  private results: Outcome[] = [];

  private shoeSprite!: Sprite;
  private roads = new Container();
  private cardsLayer = new Container();
  private cardViews: CardView[] = [];
  private stacks = {} as Record<BetArea, ChipStack>;
  private glows = {} as Record<BetArea, Graphics>;
  private badges = {} as Record<Side, { node: Container; text: Text }>;

  private clearBtn: HTMLButtonElement | null = null;
  private rebetBtn: HTMLButtonElement | null = null;

  protected hudOptions(): SceneHudOptions {
    return { primaryLabel: bs('deal'), onPrimary: () => void this.deal(), betMode: 'chips', betLabel: bs('chipLabel') };
  }

  protected build(): void {
    const table = new Sprite(tableTexture());
    table.position.set(0, TABLE_Y);

    this.shoeSprite = makeShoe();
    this.shoeSprite.position.set(SHOE_POS.x, SHOE_POS.y);
    this.shoeSprite.scale.set(0.82);

    const areas = new Container();
    for (const a of AREAS) {
      const r = AREA_RECT[a];
      const glow = new Graphics()
        .roundRect(r.x, AREA_Y, r.w, AREA_H, 26)
        .fill({ color: PALETTE.gold.light, alpha: 0.1 })
        .roundRect(r.x, AREA_Y, r.w, AREA_H, 26)
        .stroke({ color: PALETTE.gold.hot, width: 4 });
      glow.alpha = 0;
      this.glows[a] = glow;

      // La zona cliccabile e' l'intera area disegnata: un bersaglio piccolo
      // sul tappeto e' il motivo numero uno delle puntate "sbagliate".
      const hit = new Container();
      hit.hitArea = new Rectangle(r.x, AREA_Y, r.w, AREA_H);
      hit.eventMode = 'static';
      hit.cursor = 'pointer';
      hit.on('pointertap', () => this.placeChip(a));
      hit.label = `area-${a}`;

      const stack = new ChipStack(0.8);
      stack.position.set(r.x + r.w / 2, AREA_Y + AREA_H - 44);
      this.stacks[a] = stack;
      areas.addChild(glow, hit, stack);
    }

    const labels = new Container();
    for (const side of ['P', 'B'] as const) {
      const name = makeText(bs(side === 'P' ? 'player' : 'banker').toUpperCase(), 'gold', 30);
      name.position.set(HAND_X[side], LABEL_Y);
      const [node, text] = badge(SIDE_TONE[side]);
      node.position.set(HAND_X[side] + (side === 'P' ? BADGE_DX : -BADGE_DX), LABEL_Y);
      node.visible = false;
      this.badges[side] = { node, text };
      labels.addChild(name, node);
    }

    this.world.addChild(table, this.roads, areas, labels, this.shoeSprite, this.cardsLayer);
    this.drawRoads();
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
      // In alto a destra: la barra in basso e' gia' occupata dai nove gettoni.
      this.hud.topExtra.append(b);
      return b;
    };
    this.clearBtn = mk(bs('clear'), () => this.clearBets());
    this.rebetBtn = mk(bs('rebet'), () => this.rebet());
    this.refreshControls();
    this.hud.message(bs('placeBets'));
  }

  // ═══════════════════════════════════════════════ STATO

  private get disposed(): boolean {
    return this.root.destroyed;
  }

  private alive(t: number): boolean {
    return !this.disposed && this.token === t;
  }

  private get speed(): number {
    if (settings().reducedMotion) return 0.05;
    return settings().fastPlay ? 0.55 : 1;
  }

  /** Attesa interrompibile dall'uscita: risolve comunque, chi aspetta controlla `alive`. */
  private pause(sec: number): Promise<void> {
    return new Promise((res) => {
      if (this.disposed) return res();
      gsap.delayedCall(sec * this.speed, res);
    });
  }

  private refreshControls(): void {
    const idle = this.phase === 'idle';
    this.hud.setPrimaryEnabled(idle);
    this.hud.lockBet(!idle);
    if (this.clearBtn) this.clearBtn.disabled = !idle || this.board.empty;
    if (this.rebetBtn) this.rebetBtn.disabled = !idle || !this.board.last || !this.board.empty;
  }

  private syncStacks(bets: Bets = this.board.bets): void {
    for (const a of AREAS) this.stacks[a].set(bets[a], !settings().reducedMotion);
  }

  private showTableTotal(): void {
    const t = this.board.total;
    this.hud.message(t > 0 ? `${bs('onTable')}: ${formatMoney(t)}` : bs('placeBets'));
  }

  // ═══════════════════════════════════════════════ PUNTATE

  private placeChip(area: BetArea): void {
    if (this.phase !== 'idle') return;
    this.resetResultView();
    const res = this.board.add(area, wallet().bet, wallet().balance);
    if (res !== 'ok') {
      this.hud.message(bs('insufficient'), 'warn');
      return;
    }
    sfxChip();
    this.syncStacks();
    this.showTableTotal();
    this.refreshControls();
  }

  private clearBets(): void {
    if (this.phase !== 'idle' || this.board.empty) return;
    this.board.clear();
    this.syncStacks();
    this.hud.message(bs('cleared'));
    this.refreshControls();
  }

  private rebet(): void {
    if (this.phase !== 'idle') return;
    this.resetResultView();
    const r = this.board.rebet(wallet().balance);
    if (r === 'none') return this.hud.message(bs('noPrevious'), 'warn');
    if (r === 'insufficient') return this.hud.message(bs('insufficient'), 'warn');
    sfxChip();
    this.syncStacks();
    this.showTableTotal();
    this.refreshControls();
  }

  /** Il primo gesto dopo un colpo spegne l'evidenziazione del vincitore. */
  private resetResultView(): void {
    for (const a of AREAS) {
      gsap.killTweensOf(this.glows[a]);
      this.glows[a].alpha = 0;
    }
  }

  // ═══════════════════════════════════════════════ IL COLPO

  private async deal(): Promise<void> {
    if (this.phase !== 'idle') return;
    if (this.board.empty) {
      this.hud.message(bs('noBets'), 'warn');
      return;
    }
    const stake = this.board.total;
    if (!this.placeBet(stake)) {
      this.hud.message(bs('insufficient'), 'warn');
      return;
    }
    // Rimescolo solo FRA un colpo e l'altro; con lui ricominciano i segnapunti.
    const shuffled = this.shoe.shuffleIfNeeded();
    if (shuffled) {
      this.results = [];
      this.drawRoads();
    }
    const t = ++this.token;
    const bets = this.board.commit();
    const coup = playCoup(() => this.shoe.draw());
    this.pending = { token: t, coup, bets, stake };
    this.roundActive = true;
    this.phase = 'dealing';
    sfxBetConfirm();
    this.resetResultView();
    this.syncStacks(bets);
    this.hud.setWin(0);
    this.hud.message(shuffled ? bs('shuffling') : bs('dealing'));
    this.refreshControls();

    await this.sweepCards();
    if (!this.alive(t)) return;
    for (const s of ['P', 'B'] as const) this.badges[s].node.visible = false;

    const steps = recital(coup);
    const shown: Record<Side, number> = { P: 0, B: 0 };
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i]!;
      if (st.slot === 2) {
        this.hud.message(bs(st.side === 'P' ? 'thirdPlayer' : 'thirdBanker'));
        await this.pause(0.45);
        if (!this.alive(t)) return;
      }
      await this.dealCard(st.side, st.slot, st.card, t);
      if (!this.alive(t)) return;
      shown[st.side]++;
      this.updateBadge(st.side, (st.side === 'P' ? coup.player : coup.banker).slice(0, shown[st.side]));
      if (i === 3) {
        if (coup.natural) this.hud.message(bs('natural'), 'win');
        await this.pause(coup.natural ? 0.7 : 0.35);
        if (!this.alive(t)) return;
      }
    }
    await this.pause(0.3);
    if (!this.alive(t)) return;
    this.finishCoup(t);
  }

  /** Salda il colpo UNA volta: dalla fine del rituale o da `resolvePending`. */
  private settleOnce(): Pending | null {
    const p = this.pending;
    if (!p) return null;
    this.pending = null;
    this.settle(p.stake, payout(p.bets, p.coup.winner));
    this.roundActive = false;
    return p;
  }

  private finishCoup(t: number): void {
    const p = this.pending;
    if (!p || p.token !== t) return;
    this.settleOnce();
    const { coup, bets, stake } = p;
    const won = payout(bets, coup.winner);
    this.results.push(coup.winner);
    this.drawRoads();

    const v = { p: coup.playerTotal, b: coup.bankerTotal };
    const line = coup.winner === 'P' ? bs('winPlayer', v) : coup.winner === 'B' ? bs('winBanker', v) : bs('winTie', v);
    this.hud.message(won === 0 ? `${line} · ${bs('lost')}` : line, won > stake ? 'win' : won === 0 ? 'warn' : 'info');
    this.hud.setWin(won);

    // L'area vincente pulsa; le fiche perse spariscono, le vincenti restano.
    const winArea: BetArea = coup.winner === 'P' ? 'player' : coup.winner === 'B' ? 'banker' : 'tie';
    const g = this.glows[winArea];
    g.alpha = 1;
    if (!settings().reducedMotion) gsap.to(g, { alpha: 0.35, duration: 0.6, yoyo: true, repeat: 5, ease: 'sine.inOut' });
    for (const a of AREAS) {
      const back = payout({ player: 0, banker: 0, tie: 0, [a]: bets[a] } as Bets, coup.winner);
      this.stacks[a].set(back, false);
    }
    const winSide = coup.winner === 'T' ? null : coup.winner;
    for (const c of this.cardViews) {
      const side = (c as CardView & { side?: Side }).side;
      if (winSide && side === winSide) c.setGlow(true, !settings().reducedMotion);
    }

    this.phase = 'idle';
    this.refreshControls();
    if (won > stake) void this.presenter.present(won, stake, { y: 470 });
    else if (won === 0) sfxLose();
    else sfxChip();
    // Le fiche restituite tornano al giocatore: il tappeto si svuota.
    gsap.delayedCall(1.6 * this.speed, () => {
      if (this.disposed || this.phase !== 'idle' || this.token !== t || !this.board.empty) return;
      this.syncStacks(this.board.bets);
    });
  }

  protected resolvePending(): void {
    // L'esito e' gia' scritto nel colpo: uscire non deve cambiarlo.
    if (!this.pending) return;
    const p = this.settleOnce();
    if (p) this.results.push(p.coup.winner);
    this.token++;
    this.phase = 'idle';
  }

  // ═══════════════════════════════════════════════ CARTE

  private slotPos(side: Side, slot: number): { x: number; y: number; rot: number } {
    const cx = HAND_X[side];
    if (slot < 2) {
      // Il Punto ha la prima carta verso l'esterno, il Banco verso il sabot:
      // le due mani si specchiano attorno al centro del tavolo.
      const outer = side === 'P' ? -1 : 1;
      const x = cx + (slot === 0 ? outer : -outer) * 76;
      return { x, y: CARD_Y, rot: 0 };
    }
    // Terza carta di traverso, all'esterno: si riconosce a colpo d'occhio.
    const dir = side === 'P' ? -1 : 1;
    return { x: cx + dir * (76 + CARD_W / 2 + 112), y: CARD_Y + 20, rot: Math.PI / 2 };
  }

  private async dealCard(side: Side, slot: number, card: Coup['player'][number], t: number): Promise<void> {
    const v = new CardView(card, { width: CARD_W }) as CardView & { side?: Side };
    v.side = side;
    v.rotation = side === 'P' ? -0.4 : 0.4;
    this.cardsLayer.addChild(v);
    this.cardViews.push(v);
    const mouth = {
      x: SHOE_POS.x + SHOE_MOUTH.x * this.shoeSprite.scale.x,
      y: SHOE_POS.y + SHOE_MOUTH.y * this.shoeSprite.scale.y,
    };
    const to = this.slotPos(side, slot);
    sfxCardDeal();
    await v.deal({ from: mouth, to, rotation: to.rot, flip: true, duration: 0.5 * this.speed });
    if (!this.alive(t)) return;
  }

  private updateBadge(side: Side, cs: Coup['player']): void {
    const b = this.badges[side];
    b.node.visible = true;
    b.text.text = `${bs('totalLabel')} ${handTotal(cs)}`;
  }

  private async sweepCards(): Promise<void> {
    const all = this.cardViews;
    this.cardViews = [];
    if (all.length && !settings().reducedMotion) {
      await Promise.all(all.map((c, i) => c.sweep({ x: SHOE_POS.x, y: 250 }, i * 0.03, 0.35)));
    }
    for (const c of all) c.destroy();
  }

  // ═══════════════════════════════════════════════ SEGNAPUNTI

  /**
   * Ridisegna i due tabelloni dai dati delle regole (`beadPlate`, `bigRoad`):
   * nessuna logica di impaginazione qui, solo pallini nelle celle date.
   */
  private drawRoads(): void {
    for (const c of this.roads.removeChildren()) c.destroy({ children: true });
    const g = new Graphics();
    this.roads.addChild(g);
    const r = CELL / 2 - 4;

    const beads = beadPlate(this.results, ROWS);
    const beadCols = beads.length ? beads[beads.length - 1]!.col + 1 : 0;
    const b0 = roadWindow(beadCols, BEAD.cols);
    for (const b of beads) {
      if (b.col < b0) continue;
      const x = BEAD.x + (b.col - b0) * CELL + CELL / 2;
      const y = ROAD_Y + b.row * CELL + CELL / 2;
      g.circle(x, y, r).fill({ color: SIDE_TONE[b.outcome] });
      g.circle(x, y, r).stroke({ color: PALETTE.plum.abyss, width: 1, alpha: 0.5 });
    }

    const cells = bigRoad(this.results, ROWS);
    const roadCols = cells.reduce((m, c) => Math.max(m, c.col + 1), 0);
    const c0 = roadWindow(roadCols, BIG.cols);
    for (const c of cells) {
      if (c.col < c0) continue;
      const x = BIG.x + (c.col - c0) * CELL + CELL / 2;
      const y = ROAD_Y + c.row * CELL + CELL / 2;
      g.circle(x, y, r).stroke({ color: SIDE_TONE[c.winner], width: 3 });
      if (c.ties > 0) {
        g.moveTo(x - r, y + r).lineTo(x + r, y - r).stroke({ color: PALETTE.win.light, width: 2.5 });
        if (c.ties > 1) {
          const n = makeText(String(c.ties), 'value', 13, { fill: PALETTE.win.light });
          n.position.set(x, y);
          this.roads.addChild(n);
        }
      }
    }
  }

  // ═══════════════════════════════════════════════ REGOLE

  protected tutorialGame(): TutorialStep[] {
    return [
      { title: bs('tutBetT'), text: bs('tutBetX'), target: this.designTarget(236, AREA_Y, 1448, AREA_H) },
      { title: bs('tutCardsT'), text: bs('tutCardsX'), target: this.designTarget(236, LABEL_Y - 40, 1448, 330) },
      { title: bs('tutRoadsT'), text: bs('tutRoadsX'), target: this.pixiTarget(() => this.roads) },
    ];
  }

  protected rules(): Node {
    const p = (text: string) => el('p', { text });
    const tableau: [string, 'rulesTableau0' | 'rulesTableau3' | 'rulesTableau4' | 'rulesTableau5' | 'rulesTableau6' | 'rulesTableau7'][] = [
      ['0–2', 'rulesTableau0'],
      ['3', 'rulesTableau3'],
      ['4', 'rulesTableau4'],
      ['5', 'rulesTableau5'],
      ['6', 'rulesTableau6'],
      ['7', 'rulesTableau7'],
    ];
    return div(
      'go-pay',
      el('h3', { text: bs('rulesHow') }),
      p(bs('rulesHow1')),
      p(bs('rulesHow2')),
      el('h3', { text: bs('rulesPays') }),
      p(bs('rulesPlayer')),
      p(bs('rulesBanker')),
      p(bs('rulesTie')),
      el('h3', { text: bs('rulesThird') }),
      p(bs('rulesThird1')),
      p(bs('rulesThird2')),
      ...tableau.map(([b, k]) => p(bs('rulesThirdRow', { b, rule: bs(k) }))),
      el('h3', { text: bs('rulesRoad') }),
      p(bs('rulesRoadBody')),
      el('p', { class: 'go-pay__note', text: bs('rulesShoe', { rtp: gameById('baccarat').rtp }) })
    );
  }

  dispose(): void {
    this.token++;
    for (const a of AREAS) gsap.killTweensOf(this.glows[a]);
    this.clearBtn = null;
    this.rebetBtn = null;
    super.dispose();
  }
}

// ─────────────────────────────────────────────── AIUTI

function badge(tone: number): [Container, Text] {
  const c = new Container();
  const g = new Graphics().roundRect(-78, -19, 156, 38, 19).fill({ color: PALETTE.plum.abyss, alpha: 0.8 });
  g.roundRect(-78, -19, 156, 38, 19).stroke({ color: tone, width: 2, alpha: 0.95 });
  const t = makeText('', 'value', 21);
  c.addChild(g, t);
  return [c, t];
}

/**
 * Il tavolo, cotto una volta: velluto lapis, i due tabelloni (vetro scuro
 * con la griglia incisa) e le tre aree di puntata con i loro pagamenti.
 */
function tableTexture(): Texture {
  return bake(
    'bac/table',
    1920,
    TABLE_H,
    (ctx, w, h) => {
      const path = () => roundRectPath(ctx, 86, 14, w - 172, h - 30, 120);
      path();
      velvet(ctx, w, h, FELT_COBALT, w / 2, h * 0.55, w * 0.55);

      // Pannelli dei segnapunti.
      const panel = (x: number, cols: number, title: string) => {
        const y = ROAD_Y - TABLE_Y;
        const pw = cols * CELL;
        const ph = ROWS * CELL;
        ctx.save();
        setGlow(ctx, PALETTE.plum.abyss, 12, 0.385);
        roundRectPath(ctx, x - 6, y - 6, pw + 12, ph + 12, 10);
        ctx.fillStyle = rgba(PALETTE.plum.abyss, 0.82);
        ctx.fill();
        clearGlow(ctx);
        ctx.restore();
        ctx.strokeStyle = rgba(PALETTE.gold.light, 0.12);
        ctx.lineWidth = 1;
        for (let c = 0; c <= cols; c++) {
          ctx.beginPath();
          ctx.moveTo(x + c * CELL + 0.5, y);
          ctx.lineTo(x + c * CELL + 0.5, y + ph);
          ctx.stroke();
        }
        for (let r = 0; r <= ROWS; r++) {
          ctx.beginPath();
          ctx.moveTo(x, y + r * CELL + 0.5);
          ctx.lineTo(x + pw, y + r * CELL + 0.5);
          ctx.stroke();
        }
        roundRectPath(ctx, x - 6, y - 6, pw + 12, ph + 12, 10);
        ctx.lineWidth = 2;
        ctx.strokeStyle = css(PALETTE.gold.mid);
        ctx.stroke();
        ctx.font = `700 15px ${FONT_STACK.display}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = rgba(PALETTE.gold.light, 0.85);
        ctx.fillText(title.toUpperCase(), x, y + ph + 12);
      };
      panel(BEAD.x, BEAD.cols, bs('beadPlate'));
      panel(BIG.x, BIG.cols, bs('bigRoad'));

      // Le tre aree di puntata.
      const pays: Record<BetArea, string> = { player: bs('playerPay'), tie: bs('tiePay'), banker: bs('bankerPay') };
      const names: Record<BetArea, string> = { player: bs('player'), tie: bs('tie'), banker: bs('banker') };
      for (const a of ['player', 'tie', 'banker'] as const) {
        const r = AREA_RECT[a];
        const y = AREA_Y - TABLE_Y;
        roundRectPath(ctx, r.x, y, r.w, AREA_H, 26);
        const g = ctx.createLinearGradient(0, y, 0, y + AREA_H);
        g.addColorStop(0, rgba(AREA_TONE[a], 0.42));
        g.addColorStop(1, rgba(AREA_TONE[a], 0.14));
        ctx.fillStyle = g;
        ctx.fill();
        brassEdge(ctx, () => roundRectPath(ctx, r.x, y, r.w, AREA_H, 26), 2.5);
        embossedText(ctx, names[a].toUpperCase(), r.x + r.w / 2, y + 46, a === 'tie' ? 30 : 40, { font: 'display' });
        embossedText(ctx, pays[a], r.x + r.w / 2, y + 88, 19, { font: 'ui', weight: 600, alpha: 0.85, spacing: 0.05 });
        // Cerchio delle fiche.
        ctx.beginPath();
        ctx.arc(r.x + r.w / 2, y + AREA_H - 50, 40, 0, Math.PI * 2);
        ctx.fillStyle = rgba(PALETTE.plum.abyss, 0.12);
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = rgba(PALETTE.gold.light, 0.5);
        ctx.stroke();
      }
      feltStar(ctx, 960, AREA_Y - TABLE_Y - 26, 9);

      leatherRail(ctx, path, 28);
      brassEdge(ctx, path, 3);
    },
    { res: 1 }
  );
}
