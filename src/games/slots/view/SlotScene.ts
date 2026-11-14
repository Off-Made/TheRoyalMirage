/**
 * THE ROYAL MIRAGE — Scena generica di una slot
 *
 * Una slot = un `MachineDef` (la matematica) + un `SlotTheme` (l'aspetto).
 * Questa classe fa tutto il resto: rulli, anticipazione, presentazione
 * delle vincite, giri gratis, auto e turbo. Le singole macchine la
 * estendono solo per cio' che hanno di unico (es. Hold & Win).
 *
 * ── Regia di una giocata ──
 *   click → placeBet → playRound (esito COMPLETO gia' deciso)
 *         → giro base recitato → vincite → [giri gratis] → [Hold & Win]
 *         → settle(totale) → auto?
 *
 * Le funzioni del MOTORE (wild espanso, giri gratis, Hold & Win) hanno la
 * regia qui e non nelle singole macchine: una macchina nuova con Hold & Win
 * deve funzionare dichiarando `holdAndWin` nel suo `MachineDef`, senza
 * riscrivere l'animazione.
 */

import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { gsap } from 'gsap';
import { DESIGN_WIDTH, game } from '@/core/App';
import { GameScene, type SceneHudOptions } from '@/games/common/GameScene';
import { HUD_BOTTOM, HUD_TOP } from '@/games/common/GameHud';
import { makeText } from '@/games/common/text';
import type { GameId } from '@/games/registry';
import { button, div, el } from '@/ui/dom/el';
import { PALETTE, PAYLINE_COLORS, rgba } from '@/art/palette';
import { preloadImages } from '@/art/images';
import { t as tr, getLanguage } from '@/i18n';
import { gameById } from '@/games/registry';
import { bake } from '@/art/textureCache';
import { wallet, settings, actions, store } from '@/state/store';
import { demoCriterion, demoRound } from '../demo';
import { formatMoney } from '@/state/wallet';
import { sfxReelStop, sfxSpinStart, sfxWin, sfxCoin, sfxTick, sfxLose, sfxConfirm, sfxJackpot } from '@/audio/synth';
import { defaultRng, type Rng } from '../engine/rng';
import { playRound, payoutCents } from '../engine/spin';
import { symbolIndex } from '../engine/evaluate';
import type { JackpotDef, MachineDef, RoundOutcome, SpinOutcome, SymId, WinLine } from '../engine/types';
import { ReelView } from './ReelView';
import { FRAME_CREST, frameTexture, reelBackTexture, windowSize, type FrameGeometry } from './frame';
import { ss } from './strings';
import type { TutorialStep } from '@/ui/dom/Tutorial';
import { wait, type BonusStage } from './bonusStage';
import { playWheel } from './wheelBonus';
import { playCascade } from './cascadeBonus';
import { playChests } from './chestBonus';

export { wait };


export interface SlotTheme {
  gameId: GameId;
  machine: MachineDef;
  texture: (id: SymId) => Texture;
  /** Colonna intera per il wild espanso. */
  wildColumn?: () => Texture;
  /** Disegno del simbolo su canvas, per la tabella pagamenti in DOM. */
  drawSymbol: (ctx: CanvasRenderingContext2D, id: SymId, size: number) => void;
  cellW: number;
  cellH: number;
  gap: number;
  symbolScale: number;
  /** Tono del fondo dei rulli e gemme della cornice. */
  reelTone: number;
  gem: { light: number; core: number; deep: number };
  /** Tono dei rulli durante i giri gratis. */
  freeTone: number;
  /** Paragrafi che descrivono le funzioni speciali nella modale regole. */
  features: () => string[];
  /**
   * Cornice e fondo dei rulli su misura. Assenti = la cornice d'oro di casa
   * (`frame.ts`). Una slot con identita' propria (bronzo, turchese...) li
   * fornisce qui invece di biforcare la scena.
   */
  frameTexture?: (geo: FrameGeometry) => Texture;
  reelBackTexture?: (key: string, geo: FrameGeometry, tone: number) => Texture;
  /** Spostamento verticale della macchina (es. per far posto a una barra jackpot). */
  offsetY?: number;
  /** Colore delle scintille all'atterraggio degli scatter. */
  scatterTint?: number;
  /** Colore dell'anticipazione (colonna di luce). Default oro. */
  accent?: { core: number; hot: number };
  /** Icone da decodificare prima di cuocere i simboli. */
  images?: readonly string[];
  /**
   * Guida passo passo dei giochi bonus, per la scheda «Vincite»: un titolo e
   * i passaggi in ordine (come si attiva, come si gioca, quanto si vince).
   */
  bonusGuide?: () => { title: string; steps: string[] }[];
}

const LINE_COLORS = PAYLINE_COLORS;

/**
 * Tempi del giro, in secondi, contando dal click all'ultimo rullo fermo:
 * ~1,7 s a giro normale, ~1,1 s in turbo. Il turbo e' il ritmo "normale"
 * della taratura dell'11/11: il committente ha chiesto un giro un poco piu'
 * lungo e di tenere quel tempo come modalita' veloce.
 */
const SPIN_T = {
  /** Corsa libera prima del primo arresto. */
  lead: 0.55,
  leadTurbo: 0.3,
  /** Intervallo fra l'inizio della frenata di un rullo e del successivo. */
  stagger: 0.2,
  staggerTurbo: 0.12,
  /** Durata della frenata di un rullo. */
  stop: 0.42,
  stopTurbo: 0.3,
  stopQuick: 0.15,
  /**
   * Suspense sul rullo "decisivo" (un simbolo bonus o scatter in meno di
   * quelli che servono): il rullo frena in un unico movimento continuo,
   * lungo `tease` + `teaseStop` secondi (`ReelView.teaseStop`).
   */
  tease: 1.6,
  teaseTurbo: 0.9,
  teaseStop: 0.85,
  /** Velocita' a cui scendono i rulli DOPO quello in suspense (celle/secondo, ×1,6). */
  teaseSpeed: 6,
} as const;


export class SlotScene extends GameScene {
  readonly name: string;
  readonly gameId: GameId;
  protected readonly m: MachineDef;
  protected readonly rng: Rng = defaultRng();

  protected reels: ReelView[] = [];
  protected geo: FrameGeometry;
  /** Origine della finestra dei rulli nel design space. */
  protected ox = 0;
  protected oy = 0;
  protected reelLayer = new Container();
  protected overlayLayer = new Container();
  /**
   * La macchina intera (alone, fondo, rulli, cornice) in un solo gruppo,
   * con il perno al centro: i bonus la girano come una carta (ruota) o la
   * spostano in alto rimpicciolita (forzieri).
   */
  protected machine = new Container();
  protected lineLayer = new Graphics();
  protected highlight = new Container();
  /** Valori delle monete Hold & Win visibili sulla griglia ferma. */
  protected coinLabels = new Container();
  private back!: Sprite;
  private backFree!: Sprite;
  private frame!: Sprite;
  private wildCols: Sprite[] = [];
  private fsPanel = new Container();
  private fsCount = makeText('', 'gold', 46);
  private fsMult = makeText('', 'numeric', 64);
  private fsWin = makeText('', 'numeric', 40);

  /** Puntata del giro in corso: serve a tradurre i valori-moneta in fiche. */
  private roundBet = 0;
  /** Esito in corso, per pagarlo se si esce a meta'. */
  private pending: RoundOutcome | null = null;
  private phase: 'idle' | 'spinning' | 'presenting' | 'bonus' = 'idle';
  /** Bonus in attesa del pulsante (GIRA!, APRI): chi lo risolve. */
  private pressResolve: (() => void) | null = null;
  private pressEnabled: (() => boolean) | null = null;
  /** Arresto rapido richiesto (secondo click): le sottoclassi lo leggono nelle loro animazioni. */
  protected quick = false;
  private auto = false;
  protected turbo = false;
  private autoBtn!: HTMLButtonElement;
  private turboBtn!: HTMLButtonElement;
  /** Combinazioni del giro mostrato, per il ciclo a riposo. */
  private idleWins: WinLine[] = [];
  private idleIndex = 0;
  private idleTimer = 0;

  /** Solo sviluppo: predicato sull'esito della prossima giocata. */
  want: ((o: RoundOutcome) => boolean) | null = null;

  constructor(protected theme: SlotTheme) {
    super();
    if (import.meta.env.DEV) (window as unknown as { GO?: Record<string, unknown> }).GO!.slot = this;
    this.gameId = theme.gameId;
    this.name = theme.gameId;
    this.m = theme.machine;
    this.geo = {
      reels: this.m.reels,
      rows: this.m.rows,
      cellW: theme.cellW,
      cellH: theme.cellH,
      gap: theme.gap,
      pad: 30,
    };
    this.backdropDim = 0.3;
    this.backdropEnv = 'strip';
  }

  protected async preload(): Promise<void> {
    if (this.theme.images?.length) await preloadImages(this.theme.images);
  }

  protected hudOptions(): SceneHudOptions {
    return { primaryLabel: ss('spin'), onPrimary: () => this.onSpinPressed(), betMode: 'stepper', betLabel: undefined };
  }

  // ═══════════════════════════════════════════════ COSTRUZIONE

  protected build(): void {
    const t = this.theme;
    const { w, h } = windowSize(this.geo);
    this.ox = Math.round((DESIGN_WIDTH - w) / 2);
    // Centro verticale della fascia libera fra le due barre dell'HUD, un po'
    // piu' in basso per lasciare respiro alla cresta della cornice.
    this.oy = Math.round((HUD_TOP + HUD_BOTTOM) / 2 - h / 2 + FRAME_CREST / 2 + (t.offsetY ?? 0));

    const backTex = t.reelBackTexture ?? reelBackTexture;
    this.back = new Sprite(backTex(`${t.gameId}`, this.geo, t.reelTone));
    this.backFree = new Sprite(backTex(`${t.gameId}-free`, this.geo, t.freeTone));
    this.backFree.alpha = 0;
    for (const s of [this.back, this.backFree]) s.position.set(this.ox, this.oy);

    // Alone sfumato dietro la cornice: stacca la macchina dal deserto senza
    // disegnare un rettangolo dai bordi duri.
    const halo = new Sprite(
      bake('slot/halo', 256, 160, (ctx, hw, hh) => {
        const g = ctx.createRadialGradient(hw / 2, hh / 2, 0, hw / 2, hh / 2, hw / 2);
        g.addColorStop(0, rgba(PALETTE.gold.core, 0.32));
        g.addColorStop(0.6, rgba(PALETTE.neon.pink, 0.1));
        g.addColorStop(1, rgba(PALETTE.neon.pink, 0));
        ctx.save();
        ctx.scale(1, hh / hw);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, hw, hw);
        ctx.restore();
      })
    );
    halo.anchor.set(0.5);
    halo.blendMode = 'add';
    halo.position.set(this.ox + w / 2, this.oy + h / 2 - 20);
    halo.width = w * 1.7;
    halo.height = h * 1.9;

    this.reelLayer.position.set(this.ox, this.oy);
    for (let r = 0; r < this.m.reels; r++) {
      const reel = new ReelView({
        index: r,
        rows: this.m.rows,
        cellW: t.cellW,
        cellH: t.cellH,
        texture: t.texture,
        symbolScale: t.symbolScale,
        blur: this.quality.reelBlur,
      });
      reel.x = r * (t.cellW + t.gap);
      reel.setStrip(this.m.strips[r]!, this.rng.int(this.m.strips[r]!.length));
      this.reels.push(reel);
      this.reelLayer.addChild(reel);
    }

    this.frame = new Sprite(t.frameTexture ? t.frameTexture(this.geo) : frameTexture(t.gameId, this.geo, t.gem, tr(gameById(t.gameId).nameKey)));
    this.frame.position.set(this.ox - this.geo.pad, this.oy - this.geo.pad - FRAME_CREST);

    this.overlayLayer.position.set(this.ox, this.oy);
    this.lineLayer.blendMode = 'add';
    this.overlayLayer.addChild(this.highlight, this.lineLayer, this.coinLabels);

    this.buildFreePanel(w);

    this.machine.addChild(halo, this.back, this.backFree, this.reelLayer, this.overlayLayer, this.frame);
    // Perno al centro della finestra: le posizioni dei figli non cambiano.
    const mcx = this.ox + w / 2;
    const mcy = this.oy + h / 2;
    this.machine.pivot.set(mcx, mcy);
    this.machine.position.set(mcx, mcy);
    this.world.addChild(this.machine, this.fsPanel);
    // Un tocco sui rulli in movimento li ferma (o salta la presentazione),
    // come il secondo click su Gira. A rulli fermi non fa partire nulla:
    // un giro deve partire solo dal pulsante.
    this.reelLayer.eventMode = 'static';
    this.reelLayer.cursor = 'pointer';
    this.reelLayer.hitArea = new Rectangle(0, 0, w, h);
    this.reelLayer.on('pointertap', () => {
      if (this.phase === 'spinning' || this.phase === 'presenting') this.onSpinPressed();
    });
    this.afterBuild();
  }

  /** Estensione per le sottoclassi (contatori jackpot, ecc.). */
  protected afterBuild(): void {}

  private buildFreePanel(w: number): void {
    const p = this.fsPanel;
    p.visible = false;
    const panelW = 300;
    const x = this.ox + w + this.geo.pad + 40;
    const bg = new Graphics()
      .roundRect(0, 0, panelW, 300, 24)
      .fill({ color: PALETTE.plum.raised, alpha: 0.92 })
      .stroke({ color: PALETTE.gold.core, width: 2, alpha: 0.8 });
    p.addChild(bg);
    const title = makeText(ss('freeLabel').toUpperCase(), 'label', 20);
    title.position.set(panelW / 2, 36);
    this.fsCount.position.set(panelW / 2, 86);
    const ml = makeText(ss('multiplier').toUpperCase(), 'label', 16);
    ml.position.set(panelW / 2, 140);
    this.fsMult.position.set(panelW / 2, 186);
    const wl = makeText(ss('freeTotal').toUpperCase(), 'label', 14);
    wl.position.set(panelW / 2, 236);
    this.fsWin.position.set(panelW / 2, 270);
    p.addChild(title, this.fsCount, ml, this.fsMult, wl, this.fsWin);
    // Se la finestra e' troppo larga per il pannello laterale, va sopra la cresta.
    if (x + panelW > DESIGN_WIDTH - 20) {
      p.position.set(DESIGN_WIDTH - panelW - 24, HUD_TOP + 10);
      p.scale.set(0.8);
    } else {
      p.position.set(x, this.oy + 40);
    }
  }

  async enter(): Promise<void> {
    await super.enter();
    // Controlli extra nell'HUD: auto e turbo.
    this.autoBtn = button(ss('auto'), { variant: 'secondary', size: 'sm', onClick: () => this.toggleAuto() });
    this.turboBtn = button(ss('turbo'), { variant: 'secondary', size: 'sm', icon: '⚡', onClick: () => this.toggleTurbo() });
    this.autoBtn.classList.add('go-hud__toggle');
    this.turboBtn.classList.add('go-hud__toggle');
    this.turbo = settings().fastPlay;
    this.turboBtn.classList.toggle('is-on', this.turbo);
    this.hud.extra.append(this.turboBtn, this.autoBtn);
    // RTP della sessione (solo modalita' Libera, se acceso nelle impostazioni).
    this.rtpEl = el('div', { class: 'go-hud__rtp numeric', attrs: { 'aria-live': 'off' } });
    this.hud.topExtra.prepend(this.rtpEl);
    this.updateRtp();
    // L'interruttore si puo' cambiare anche a gioco aperto.
    let shown = settings().showSlotRtp;
    this.unsubRtp = store.subscribe(() => {
      if (settings().showSlotRtp === shown) return;
      shown = settings().showSlotRtp;
      this.updateRtp();
    });
    // Il nome del gioco sta gia' sull'insegna del cabinet: in alto sarebbe un doppione.
    this.hud.root.classList.add('go-hud--marquee');
    this.hud.message(ss('good'));
    setTimeout(() => this.phase === 'idle' && this.hud.message(''), 2200);
  }

  // ═══════════════════════════════════════════════ CONTROLLI

  private toggleAuto(): void {
    this.auto = !this.auto;
    this.autoBtn.classList.toggle('is-on', this.auto);
    this.autoBtn.querySelector('.go-btn__label')!.textContent = this.auto ? ss('autoStop') : ss('auto');
    if (this.auto && this.phase === 'idle') void this.spin();
  }

  private toggleTurbo(): void {
    this.turbo = !this.turbo;
    this.turboBtn.classList.toggle('is-on', this.turbo);
    // Il turbo E' "Gioco rapido": ricordato fra le sessioni e valido anche
    // per le presentazioni delle vincite.
    actions.updateSettings({ fastPlay: this.turbo });
  }

  private stopAuto(): void {
    if (!this.auto) return;
    this.auto = false;
    this.autoBtn.classList.remove('is-on');
    this.autoBtn.querySelector('.go-btn__label')!.textContent = ss('auto');
  }

  private onSpinPressed(): void {
    // Un bonus aspetta il suo pulsante (GIRA!, APRI): il pulsante e' suo.
    if (this.pressResolve) {
      this.pressBonus();
      return;
    }
    if (this.phase === 'bonus') {
      this.quick = true;
      this.presenter.skip();
      return;
    }
    if (this.phase === 'spinning') {
      // Secondo click durante il giro = arresto rapido ("slam stop").
      this.quick = true;
      return;
    }
    if (this.phase === 'presenting') {
      this.quick = true;
      this.presenter.skip();
      return;
    }
    void this.spin();
  }

  // ═══════════════════════════════════════════════ GIOCATA

  /** RTP reale della sessione: puntato e vinto da quando si e' entrati. */
  private rtpEl: HTMLElement | null = null;
  private rtpBet = 0;
  private rtpWon = 0;
  private rtpSpins = 0;
  private rtpOpen = false;
  private unsubRtp: (() => void) | null = null;

  private updateRtp(): void {
    const show = store.getState().mode === 'freeplay' && settings().showSlotRtp;
    if (!this.rtpEl) return;
    this.rtpEl.hidden = !show;
    if (!show) return;
    const pct = this.rtpBet > 0 ? (this.rtpWon / this.rtpBet) * 100 : 0;
    const fmt = (v: number) => v.toLocaleString(getLanguage(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    this.rtpEl.textContent = ss('rtpLive', { pct: this.rtpSpins > 0 ? `${fmt(pct)}%` : '—', n: this.rtpSpins, target: `${fmt(this.m.rtpTarget)}%` });
    this.rtpEl.classList.toggle('is-up', this.rtpSpins > 0 && pct >= this.m.rtpTarget);
    this.rtpEl.classList.toggle('is-down', this.rtpSpins > 0 && pct < this.m.rtpTarget);
  }

  protected override settle(bet: number, payout: number): void {
    super.settle(bet, payout);
    if (!this.rtpOpen) return;
    this.rtpOpen = false;
    this.rtpWon += payout;
    this.updateRtp();
  }

  /** Contatore dei giri per la Presentazione (un giro pilotato ogni tre). */
  private demoTick = 0;

  protected async spin(): Promise<void> {
    if (this.phase !== 'idle') return;
    const bet = wallet().bet;
    if (!this.placeBet(bet)) {
      this.stopAuto();
      return;
    }
    this.rtpBet += bet;
    this.rtpSpins++;
    this.rtpOpen = true;
    // Presentazione: solo in modalita' Libera, ESATTAMENTE un giro su tre (`demo.ts`):
    // con un tiro a caso capitavano serie di 6-8 giri senza l'evento scelto.
    this.demoTick = (this.demoTick + 1) % 3;
    const demo = demoCriterion(this.m, bet, store.getState().mode, settings(), this.demoTick === 0 ? 0 : 1);
    let outcome = demo ? demoRound(this.m, bet, this.rng, demo) : playRound(this.m, bet, this.rng);
    // Solo sviluppo: `GO.slot.want = (o) => o.free.length > 0` forza un esito
    // con la caratteristica voluta, per collaudare le animazioni rare.
    if (import.meta.env.DEV && this.want) {
      for (let i = 0; i < 500_000 && !this.want(outcome); i++) outcome = playRound(this.m, bet, this.rng);
      this.want = null;
    }
    this.pending = outcome;
    this.roundBet = bet;
    this.roundActive = true;
    this.phase = 'spinning';
    this.quick = false;
    this.hud.lockBet(true);
    this.hud.setWin(0);
    this.hud.message('');
    this.hud.setPrimary(ss('stop'));
    this.clearWins();

    let paid = 0;
    await this.playSpin(outcome.base, 'base');
    if (this.disposed) return;
    paid += outcome.base.payout;
    const bonusFollows =
      outcome.free.length > 0 || !!outcome.holdAndWin || !!outcome.wheel || !!outcome.cascade || !!outcome.chests;
    await this.showWins(outcome.base, bet, paid, bonusFollows);
    if (this.disposed) return;

    if (outcome.free.length > 0) {
      paid = await this.playFreeSpins(outcome, bet, paid);
      if (this.disposed) return;
    }

    if (outcome.holdAndWin) {
      this.phase = 'presenting';
      await this.playHoldAndWin(outcome, bet);
      if (this.disposed) return;
      paid += outcome.holdAndWin.payout;
    }

    // Bonus interni: ruota, cascata, forzieri. Prima si spengono le cornici
    // delle vincite del giro base: resterebbero accese sopra il bonus.
    if (outcome.wheel || outcome.cascade || outcome.chests) {
      this.clearWins();
      this.idleWins = [];
    }
    if (outcome.wheel && this.m.wheel) {
      this.phase = 'bonus';
      await playWheel(this.stage(bet), this.m.wheel, outcome.wheel, bet);
      if (this.disposed) return;
      paid += outcome.wheel.payout;
      this.onBonusPlayed('wheel', outcome);
    }
    if (outcome.cascade && this.m.cascade) {
      this.phase = 'bonus';
      await playCascade(this.stage(bet), this.m.cascade, outcome.cascade, bet, outcome.base.grid);
      if (this.disposed) return;
      paid += outcome.cascade.payout;
      this.onBonusPlayed('cascade', outcome);
    }
    if (outcome.chests && this.m.chests) {
      this.phase = 'bonus';
      await playChests(this.stage(bet), outcome.chests, bet);
      if (this.disposed) return;
      paid += outcome.chests.payout;
      this.onBonusPlayed('chests', outcome);
    }
    void paid;

    this.finishRound(outcome);
  }

  /** Hook per le sottoclassi (riconoscimenti). */
  protected onBonusPlayed(_kind: 'wheel' | 'cascade' | 'chests', _o: RoundOutcome): void {}

  // ═══════════════════════════════════════════════ BONUS

  /** Cio' che la scena presta ai bonus (vedi `bonusStage.ts`). */
  private stage(bet: number): BonusStage {
    const self = this;
    return {
      m: this.m,
      world: this.world,
      fx: this.fx,
      machine: this.machine,
      reelLayer: this.reelLayer,
      reels: this.reels,
      presenter: this.presenter,
      hud: this.hud,
      geo: this.geo,
      ox: this.ox,
      oy: this.oy,
      symbolScale: this.theme.symbolScale,
      texture: (id) => this.theme.texture(id),
      quick: () => self.quick,
      resetQuick: () => {
        self.quick = false;
      },
      turbo: () => self.turbo,
      auto: () => self.auto,
      reducedMotion: () => settings().reducedMotion,
      disposed: () => self.disposed,
      shake: (a, d) => self.shake(a, d),
      titleCard: (t, s, tint, hold) => self.titleCard(t, s, tint, hold),
      waitPress: (label, enabled) => self.waitBonusPress(label, enabled),
      press: () => self.pressBonus(),
      setPressEnabled: (on) => self.hud.setPrimaryEnabled(on),
    };
    void bet;
  }

  private waitBonusPress(label: string, enabled?: () => boolean): Promise<void> {
    return new Promise((resolve) => {
      this.pressEnabled = enabled ?? null;
      this.pressResolve = () => {
        this.pressResolve = null;
        this.pressEnabled = null;
        this.hud.setPrimary(ss('skip'));
        resolve();
      };
      this.hud.setPrimary(label, { enabled: enabled ? enabled() : true });
      // In automatico il pulsante si preme da solo, appena e' premibile.
      if (this.auto) {
        const tryAuto = () => {
          if (!this.pressResolve || this.disposed) return;
          if (!this.pressEnabled || this.pressEnabled()) this.pressResolve();
          else setTimeout(tryAuto, 300);
        };
        setTimeout(tryAuto, this.turbo ? 500 : 900);
      }
    });
  }

  private pressBonus(): void {
    if (!this.pressResolve) return;
    if (this.pressEnabled && !this.pressEnabled()) return;
    this.pressResolve();
  }

  private finishRound(outcome: RoundOutcome): void {
    // La coroutine di `spin()` continua a girare durante i 0,55 s della
    // transizione d'uscita: `disposed` diventa vero solo DOPO. Se l'utente
    // esce a meta' giro, `resolvePending()` ha gia' pagato e azzerato
    // `pending`; senza questa guardia l'animazione che finisce dentro quella
    // finestra pagherebbe una seconda volta lo stesso esito.
    if (this.pending !== outcome) return;
    this.settle(outcome.bet, outcome.totalPayout);
    this.pending = null;
    this.roundActive = false;
    this.phase = 'idle';
    this.hud.setWin(outcome.totalPayout);
    this.hud.lockBet(false);
    this.hud.setPrimary(ss('spin'));
    if (outcome.totalPayout === 0) sfxLose();

    if (this.auto) {
      const delay = outcome.totalPayout > 0 ? 500 : 200;
      setTimeout(() => {
        if (!this.disposed && this.auto && this.phase === 'idle') void this.spin();
      }, this.turbo ? delay / 2 : delay);
    }
  }

  protected resolvePending(): void {
    // Prima di tutto: l'auto non deve far partire un nuovo giro mentre la
    // scena si sta chiudendo.
    this.stopAuto();
    if (!this.pending) return;
    // L'esito era deciso dal click: uscire non deve costare la vincita.
    this.settle(this.pending.bet, this.pending.totalPayout);
    this.pending = null;
  }

  protected get disposed(): boolean {
    return this.root.destroyed;
  }

  // ═══════════════════════════════════════════════ RULLI

  /** Recita un singolo giro: avvio, anticipazione, arresti, wild espansi. */
  protected async playSpin(o: SpinOutcome, phase: 'base' | 'free'): Promise<void> {
    this.phase = 'spinning';
    this.hideWildColumns();
    this.clearCoinLabels();
    const strips = phase === 'free' ? (this.m.freeSpins?.strips ?? this.m.strips) : this.m.strips;
    const turbo = this.turbo || this.quick;
    sfxSpinStart();

    this.reels.forEach((reel, r) => {
      reel.maxSpeed = this.quick ? 24 : 17;
      reel.start(this.quick ? 0 : r * (turbo ? 0.07 : 0.09));
      reel.swapStrip(strips[r]!);
    });

    await wait(turbo ? SPIN_T.leadTurbo : SPIN_T.lead, () => this.quick);

    // Arresti IN CASCATA: ogni rullo comincia a frenare `stagger` secondi
    // dopo il precedente, senza aspettare che quello abbia finito. Prima
    // ogni arresto era atteso per intero e un giro durava 10-13 secondi.
    const teasers = this.teasers();
    const landed: Promise<void>[] = [];
    for (let r = 0; r < this.reels.length; r++) {
      const reel = this.reels[r]!;
      // Suspense: se nei rulli gia' fermi manca UN SOLO simbolo bonus (o
      // scatter) a quelli che servono, e questo rullo puo' portarlo, il rullo
      // rallenta a vista e si fa attendere prima di fermarsi.
      const before = o.grid.slice(0, r).flat();
      const tease =
        !this.quick &&
        teasers.some((tz) => before.filter((x) => x === tz.id).length >= tz.need - 1 && strips[r]!.includes(tz.id));
      if (tease) {
        await Promise.all(landed);
        if (this.disposed) return;
        this.anticipate(r, true);
      } else if (r > 0) {
        await wait(this.quick ? 0 : turbo ? SPIN_T.staggerTurbo : SPIN_T.stagger, () => this.quick);
      }
      if (this.disposed) return;
      const dur = this.quick ? SPIN_T.stopQuick : turbo ? SPIN_T.stopTurbo : SPIN_T.stop;
      const teaseSec = turbo ? SPIN_T.teaseTurbo : SPIN_T.tease;
      // In suspense il rullo frena in un solo movimento continuo, lungo
      // quanto l'attesa piu' l'arresto; i rulli dopo rallentano un poco:
      // tutta la macchina trattiene il fiato.
      const stopped = tease
        ? reel.teaseStop(o.stops[r]!, teaseSec + SPIN_T.teaseStop, () => this.quick)
        : reel.stopAt(o.stops[r]!, this.quick ? 2 : 3, dur);
      if (tease) for (let k = r + 1; k < this.reels.length; k++) this.reels[k]!.slowTo(SPIN_T.teaseSpeed * 1.6, teaseSec * 0.8);
      landed.push(
        stopped.then(async () => {
          if (this.disposed) return;
          this.anticipate(r, false);
          sfxReelStop(r);
          const col = o.grid[r]!;
          for (const tz of teasers) {
            col.forEach((id, row) => id === tz.id && this.onScatterLanded(r, row));
          }
          if (o.coinValues) this.showCoinValues(r, o.coinValues[r]!);
          this.onReelLanded(r, o);
          // Il wild si espande nell'istante in cui il suo rullo si ferma.
          if (o.expandedReels.includes(r)) await this.expandWilds([r]);
        })
      );
      // I rulli dopo partono a frenare solo quando questo e' quasi fermo.
      if (tease) await wait(teaseSec, () => this.quick);
    }
    await Promise.all(landed);
  }

  /** Hook per le sottoclassi (es. monete con valore). */
  protected onReelLanded(_reel: number, _o: SpinOutcome): void {}

  /**
   * Simboli che fanno suspense, con quanti ne servono: lo scatter dei giri
   * gratis e i simboli dei bonus interni. Le monete dell'Hold & Win no: ne
   * escono troppe perche' l'attesa resti un evento.
   */
  private teasers(): { id: SymId; need: number }[] {
    const out: { id: SymId; need: number }[] = [];
    const { scatter, byId } = symbolIndex(this.m);
    const minKey = (t: Readonly<Record<number, number>> | undefined) =>
      t ? Math.min(...Object.keys(t).map(Number)) : Infinity;
    if (scatter) {
      const need = minKey(byId.get(scatter)?.freeSpins);
      if (Number.isFinite(need)) out.push({ id: scatter, need });
    }
    if (this.m.wheel) out.push({ id: this.m.wheel.symbol, need: this.m.wheel.trigger });
    if (this.m.cascade) out.push({ id: this.m.cascade.symbol, need: minKey(this.m.cascade.spins) });
    if (this.m.chests) out.push({ id: this.m.chests.symbol, need: this.m.chests.trigger });
    return out;
  }

  private onScatterLanded(reel: number, row: number): void {
    const s = this.reels[reel]!.cell(row);
    gsap.fromTo(s.scale, { x: this.theme.symbolScale * 1.25, y: this.theme.symbolScale * 1.25 }, {
      x: this.theme.symbolScale,
      y: this.theme.symbolScale,
      duration: 0.4,
      ease: 'back.out(3)',
    });
    const c = this.cellCenter(reel, row);
    this.presenter.sparks(c.x, c.y, 26, this.theme.scatterTint ?? PALETTE.red.light);
    sfxCoin();
  }

  private anticipation: Graphics[] = [];
  private anticipate(reel: number, on: boolean): void {
    if (!on) {
      for (const g of this.anticipation) g.destroy();
      this.anticipation = [];
      return;
    }
    const { cellW, cellH, gap } = this.geo;
    const x = reel * (cellW + gap);
    const h = cellH * this.m.rows;
    // Colonna di luce: velo dorato + doppio bordo (alone largo e filo netto).
    const g = new Graphics()
      .roundRect(x, 0, cellW, h, 12)
      .fill({ color: this.theme.accent?.core ?? PALETTE.gold.core, alpha: 0.14 })
      .roundRect(x - 4, -4, cellW + 8, h + 8, 14)
      .stroke({ color: this.theme.accent?.core ?? PALETTE.gold.core, width: 22, alpha: 0.3 })
      .roundRect(x - 2, -2, cellW + 4, h + 4, 13)
      .stroke({ color: this.theme.accent?.hot ?? PALETTE.gold.hot, width: 5, alpha: 1 });
    g.blendMode = 'add';
    this.overlayLayer.addChild(g);
    this.anticipation.push(g);
    gsap.fromTo(g, { alpha: 0.45 }, { alpha: 1, duration: 0.22, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    this.presenter.sparks(this.ox + x + cellW / 2, this.oy + h / 2, 30);
    sfxTick(0.5);
  }

  private async expandWilds(reels: readonly number[]): Promise<void> {
    if (!this.theme.wildColumn) return;
    const { cellW, cellH, gap } = this.geo;
    const tex = this.theme.wildColumn();
    const h = cellH * this.m.rows;
    sfxWin(1);
    await Promise.all(
      reels.map(
        (r, i) =>
          new Promise<void>((resolve) => {
            const s = new Sprite(tex);
            s.anchor.set(0.5);
            s.position.set(r * (cellW + gap) + cellW / 2, h / 2);
            const sc = Math.min(cellW / tex.width, h / tex.height);
            s.scale.set(sc, 0);
            this.overlayLayer.addChildAt(s, 0);
            this.wildCols.push(s);
            this.presenter.sparks(this.ox + s.x, this.oy + h / 2, 50);
            gsap.to(s.scale, {
              y: sc,
              duration: this.quick ? 0.15 : 0.45,
              delay: this.quick ? 0 : i * 0.12,
              ease: 'back.out(1.6)',
              onComplete: resolve,
            });
            this.shake(5, 0.3);
          })
      )
    );
  }

  private hideWildColumns(): void {
    for (const s of this.wildCols) s.destroy();
    this.wildCols = [];
  }

  /** Centro della cella nel design space. */
  protected cellCenter(reel: number, row: number): { x: number; y: number } {
    const { cellW, cellH, gap } = this.geo;
    return { x: this.ox + reel * (cellW + gap) + cellW / 2, y: this.oy + row * cellH + cellH / 2 };
  }

  // ═══════════════════════════════════════════════ VINCITE

  /** Descrizione di una combinazione per l'HUD. */
  private winText(w: WinLine): string {
    const coins = formatMoney(payoutCents(w.payout));
    if (w.kind === 'scatter') return ss('scatterWin', { n: w.count, coins });
    const label = symbolIndex(this.m).byId.get(w.symbol)?.label ?? w.symbol;
    if (w.kind === 'line') return ss('lineWin', { line: (w.lineIndex ?? 0) + 1, n: w.count, sym: label, coins });
    // Modi = copie del simbolo per rullo, moltiplicate fra loro.
    const perReel = new Map<number, number>();
    for (const [r] of w.cells) perReel.set(r, (perReel.get(r) ?? 0) + 1);
    let ways = 1;
    for (const n of perReel.values()) ways *= n;
    return ways > 1
      ? ss('waysWinMany', { n: w.count, sym: label, ways, coins })
      : ss('waysWin', { n: w.count, sym: label, coins });
  }

  private clearWins(): void {
    this.lineLayer.clear();
    this.highlight.removeChildren().forEach((c) => c.destroy());
    this.idleWins = [];
    for (const reel of this.reels) {
      for (let row = 0; row < this.m.rows; row++) {
        const s = reel.cell(row);
        s.tint = PALETTE.white;
        gsap.killTweensOf(s.scale);
        s.scale.set(this.theme.symbolScale);
      }
    }
  }

  /** Tratteggio fra due punti su `lineLayer` (Pixi non ha linee tratteggiate). */
  private dashTo(a: { x: number; y: number }, b: { x: number; y: number }, dash = 14, space = 12): void {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) return;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    for (let d = 0; d < len; d += dash + space) {
      const e = Math.min(len, d + dash);
      this.lineLayer.moveTo(a.x + ux * d, a.y + uy * d).lineTo(a.x + ux * e, a.y + uy * e);
    }
  }

  /** Disegna una o piu' combinazioni: linee luminose + celle in risalto. */
  private drawWins(wins: readonly WinLine[], dimOthers: boolean): void {
    this.lineLayer.clear();
    this.highlight.removeChildren().forEach((c) => c.destroy());
    const { cellW, cellH, gap } = this.geo;
    const on = new Set<string>();
    for (const w of wins) for (const [r, row] of w.cells) on.add(`${r},${row}`);

    for (const reel of this.reels) {
      for (let row = 0; row < this.m.rows; row++) {
        const s = reel.cell(row);
        const hot = on.has(`${this.reels.indexOf(reel)},${row}`);
        s.tint = dimOthers && !hot ? PALETTE.plum.mist : PALETTE.white;
        gsap.killTweensOf(s.scale);
        s.scale.set(this.theme.symbolScale);
        if (hot) {
          gsap.to(s.scale, {
            x: this.theme.symbolScale * 1.1,
            y: this.theme.symbolScale * 1.1,
            duration: 0.42,
            yoyo: true,
            repeat: -1,
            ease: 'sine.inOut',
          });
        }
      }
    }

    for (const key of on) {
      const [r, row] = key.split(',').map(Number) as [number, number];
      const g = new Graphics()
        .roundRect(r * (cellW + gap) + 4, row * cellH + 4, cellW - 8, cellH - 8, 16)
        .stroke({ color: PALETTE.gold.light, width: 4, alpha: 0.9 });
      g.blendMode = 'add';
      this.highlight.addChild(g);
    }

    for (const w of wins) {
      if (w.kind !== 'line' || w.lineIndex === undefined) continue;
      const color = LINE_COLORS[w.lineIndex % LINE_COLORS.length]!;
      const line = this.m.paylines[w.lineIndex]!;
      const pts = line.map((row, r) => ({ x: r * (cellW + gap) + cellW / 2, y: row * cellH + cellH / 2 }));
      // La linea e' piena SOLO sul tratto che paga (che puo' partire da
      // qualunque rullo); il resto e' tratteggiato e tenue, da bordo a bordo.
      // Se il tratto parte dal rullo 1, entra da fuori del bordo sinistro.
      const start = w.startReel ?? 0;
      const end = start + w.count - 1;
      const left = { x: pts[0]!.x - cellW / 2 - 10, y: pts[0]!.y };
      const right = { x: pts[pts.length - 1]!.x + cellW / 2 + 10, y: pts[pts.length - 1]!.y };
      const paid = [...(start === 0 ? [left] : []), ...pts.slice(start, end + 1)];
      for (const [width, alpha] of [
        [18, 0.18],
        [8, 0.55],
        [3, 1],
      ] as const) {
        this.lineLayer.moveTo(paid[0]!.x, paid[0]!.y);
        for (const p of paid.slice(1)) this.lineLayer.lineTo(p.x, p.y);
        this.lineLayer.stroke({ color, width, alpha, join: 'round', cap: 'round' });
      }
      const dashed = (seg: { x: number; y: number }[]) => {
        for (let i = 0; i < seg.length - 1; i++) this.dashTo(seg[i]!, seg[i + 1]!);
      };
      if (start > 0) dashed([left, ...pts.slice(0, start + 1)]);
      if (end < pts.length - 1) dashed([...pts.slice(end), right]);
      if (start > 0 || end < pts.length - 1) this.lineLayer.stroke({ color, width: 3, alpha: 0.35, cap: 'round' });
      if (wins.length === 1) {
        // Etichetta "3 DI FILA" sopra l'ultimo simbolo pagato.
        const last = pts[end]!;
        const tag = makeText(ss('inARow', { n: w.count }), 'gold', 26);
        tag.position.set(last.x, last.y - cellH / 2 + 22);
        this.highlight.addChild(tag);
      }
    }
  }

  /**
   * Mostra le vincite del giro appena fermato e attende la presentazione.
   * `more` = seguira' una funzione: niente sequenza Big Win ora, la si fa
   * sul totale alla fine.
   */
  private async showWins(o: SpinOutcome, bet: number, cumulative: number, more: boolean): Promise<void> {
    const wins = o.wins.filter((w) => w.payout > 0);
    if (wins.length === 0) return;
    this.phase = 'presenting';
    this.drawWins(wins, true);
    this.hud.setWin(payoutCents(cumulative));
    // Sempre una spiegazione: la combinazione se e' una sola, il riepilogo se
    // sono piu' d'una (poi scorrono una alla volta, vedi `tick`).
    this.hud.message(
      wins.length === 1
        ? this.winText(wins[0]!)
        : ss('multiWin', { n: wins.length, coins: formatMoney(payoutCents(o.payout)) }),
      'win'
    );
    const bounds = this.winCentroid(wins);
    await this.presenter.present(payoutCents(o.payout), bet, { ...bounds, small: more });
    this.idleWins = wins;
    this.idleIndex = 0;
    this.idleTimer = 0;
  }

  private winCentroid(wins: readonly WinLine[]): { x: number; y: number } {
    let x = 0;
    let y = 0;
    let n = 0;
    for (const w of wins)
      for (const [r, row] of w.cells) {
        const c = this.cellCenter(r, row);
        x += c.x;
        y += c.y;
        n++;
      }
    return n ? { x: x / n, y: y / n } : { x: DESIGN_WIDTH / 2, y: 500 };
  }

  // ═══════════════════════════════════════════════ GIRI GRATIS

  private async playFreeSpins(outcome: RoundOutcome, bet: number, paidSoFar: number): Promise<number> {
    const ladder = this.m.freeSpins?.ladder;
    const initial = outcome.base.freeSpinsAwarded;
    await this.freeIntro(initial, ladder?.[0] ?? 1, bet);
    if (this.disposed) return paidSoFar;
    this.setFreeLook(true);

    let total = initial;
    let freeWin = 0;
    let paid = paidSoFar;
    for (let i = 0; i < outcome.free.length; i++) {
      const f = outcome.free[i]!;
      this.fsCount.text = `${i + 1} / ${total}`;
      this.fsMult.text = `×${f.multiplier}`;
      this.fsWin.text = formatMoney(freeWin);
      this.hud.message(ss('freeCounter', { i: i + 1, n: total }));
      this.clearWins();
      await this.playSpin(f, 'free');
      if (this.disposed) return paid;
      freeWin += f.payout;
      paid += f.payout;
      this.fsWin.text = formatMoney(payoutCents(freeWin));
      if (f.payout > 0) await this.showWins(f, bet, paid, false);
      if (f.freeSpinsAwarded > 0) {
        total += f.freeSpinsAwarded;
        this.hud.message(ss('freeMore', { n: f.freeSpinsAwarded }), 'win');
        sfxConfirm();
        await wait(0.8, () => this.quick);
      } else {
        await wait(this.turbo ? 0.08 : 0.2, () => false);
      }
      this.quick = false;
    }

    this.setFreeLook(false);
    this.hud.message('');
    if (freeWin > 0) {
      this.phase = 'presenting';
      await this.presenter.present(payoutCents(freeWin), bet, { forceBig: true, title: ss('freeTotal').toUpperCase() });
    }
    return paid;
  }

  /** Hook: ingresso (true) e uscita (false) dalla sessione di giri gratis. */
  protected onFreeLook(_on: boolean): void {}

  private setFreeLook(on: boolean): void {
    this.onFreeLook(on);
    gsap.to(this.backFree, { alpha: on ? 1 : 0, duration: 0.8 });
    this.fsPanel.visible = on;
    if (on) {
      this.fsPanel.alpha = 0;
      gsap.to(this.fsPanel, { alpha: 1, duration: 0.5 });
    }
  }

  /** Schermata di ingresso ai giri gratis. */
  private freeIntro(n: number, mult: number, _bet: number): Promise<void> {
    this.phase = 'presenting';
    return this.titleCard(ss('freeIntro', { n }), mult > 1 ? ss('freeIntroSub', { m: mult }) : '', PALETTE.red.light, 1.4);
  }

  /**
   * Cartello a tutto schermo (ingresso giri gratis, Hold & Win, jackpot).
   * Si chiude da solo dopo `hold` secondi, al tocco o all'arresto rapido:
   * non puo' MAI trattenere la giocata oltre la propria durata.
   */
  protected titleCard(text: string, subText: string, tint: number, hold: number): Promise<void> {
    return new Promise((resolve) => {
      const layer = new Container();
      const sr = game.screenRect;
      const veil = new Graphics().rect(sr.x, sr.y, sr.width, sr.height).fill({ color: PALETTE.plum.abyss, alpha: 0.5 });
      veil.eventMode = 'static';
      const title = makeText(text, 'title', 110);
      title.position.set(DESIGN_WIDTH / 2, 470);
      const sub = makeText(subText, 'gold', 46);
      sub.position.set(DESIGN_WIDTH / 2, 590);
      layer.addChild(veil, title, sub);
      this.fx.addChild(layer);
      layer.alpha = 0;
      title.scale.set(0.2);
      sfxWin(3);
      this.shake(10, 0.6);
      this.presenter.sparks(DESIGN_WIDTH / 2, 470, 120, tint);
      let done = false;
      const close = () => {
        if (done) return;
        done = true;
        gsap.to(layer, {
          alpha: 0,
          duration: 0.35,
          onComplete: () => {
            layer.destroy({ children: true });
            resolve();
          },
        });
      };
      veil.on('pointerdown', close);
      gsap.to(layer, { alpha: 1, duration: 0.3 });
      gsap.to(title.scale, { x: 1, y: 1, duration: 0.7, ease: 'back.out(2)' });
      gsap.delayedCall(this.turbo ? hold / 2 : hold, close);
      const check = () => {
        if (done) return;
        if (this.quick) close();
        else requestAnimationFrame(check);
      };
      check();
    });
  }

  // ═══════════════════════════════════════════════ HOLD & WIN

  /**
   * Jackpot rappresentato da una moneta, se il suo valore e' quello di un
   * jackpot "a moneta". L'ultimo jackpot (GRAND) si vince solo a griglia
   * piena e non compare mai su una moneta: per questo e' escluso.
   */
  protected coinJackpot(value: number): JackpotDef | undefined {
    const js = this.m.holdAndWin?.jackpots ?? [];
    return js.slice(0, -1).find((j) => j.mult === value);
  }

  /** Testo del valore di una moneta: fiche, oppure il nome del jackpot. */
  private coinText(value: number, bet: number): { text: string; tint: number | null } {
    const jp = this.coinJackpot(value);
    return jp ? { text: jp.label, tint: jp.tint } : { text: formatMoney(Math.round(value * bet)), tint: null };
  }

  /** Etichetta del valore sopra una moneta (in coordinate della finestra rulli). */
  private coinLabel(value: number, bet: number, x: number, y: number): Container {
    const { text, tint } = this.coinText(value, bet);
    const size = Math.round(Math.min(this.geo.cellW, this.geo.cellH) * (text.length > 5 ? 0.17 : 0.22));
    const t = makeText(text, 'numeric', size, tint === null ? {} : { fill: tint });
    t.position.set(x, y);
    return t;
  }

  private clearCoinLabels(): void {
    this.coinLabels.removeChildren().forEach((c) => c.destroy());
  }

  /**
   * Mostra il valore delle monete appena atterrate su un rullo. Il valore e'
   * deciso dal motore gia' nel giro base: vederlo subito e' cio' che rende
   * l'attesa della sesta moneta una scommessa leggibile e non un mistero.
   */
  private showCoinValues(reel: number, col: readonly (number | null)[]): void {
    const { cellW, cellH, gap } = this.geo;
    col.forEach((v, row) => {
      if (v === null) return;
      const l = this.coinLabel(v, this.roundBet, reel * (cellW + gap) + cellW / 2, row * cellH + cellH / 2);
      this.coinLabels.addChild(l);
      if (!settings().reducedMotion) gsap.from(l.scale, { x: 0.3, y: 0.3, duration: 0.3, ease: 'back.out(2.5)' });
    });
  }

  /**
   * Regia dell'Hold & Win. Tutto e' gia' deciso in \`o.holdAndWin\`: qui si
   * RECITA, respin per respin, quello che il motore ha calcolato.
   *
   *   cartello → monete iniziali bloccate → per ogni respin: le celle libere
   *   "girano", atterrano le monete nuove, il contatore si ricarica o scende
   *   → [griglia piena = GRAND] → totale → pulizia
   *
   * Un secondo click (\`quick\`) azzera ogni attesa residua: la sequenza
   * arriva in fondo in pochi fotogrammi e i controlli tornano liberi.
   */
  protected async playHoldAndWin(o: RoundOutcome, bet: number): Promise<void> {
    const hw = o.holdAndWin;
    const rule = this.m.holdAndWin;
    if (!hw || !rule) return;
    const reduced = settings().reducedMotion;
    // Turbo (o "gioco veloce" nelle impostazioni, che lo accende all'ingresso)
    // dimezza i tempi; la riduzione del movimento toglie pop e tremolii ma
    // conserva il ritmo, altrimenti non si capirebbe cosa e' successo.
    const pace = this.turbo ? 0.5 : 1;
    const T = (sec: number) => (this.quick ? 0 : sec * pace);
    const { cellW, cellH, gap } = this.geo;
    const rows = this.m.rows;
    const coinTex = this.theme.texture(rule.coin);
    const initialCount = hw.initial.flat().filter((v) => v !== null).length;

    this.quick = false;
    this.clearWins();
    this.hud.message('');
    await this.titleCard(ss('hwTitle'), ss('hwSub', { n: initialCount, r: rule.respins }), PALETTE.gold.light, 1.4);
    if (this.disposed) return;
    this.quick = false;
    this.clearCoinLabels();

    // ── Scena: velo sulle celle libere, strato delle monete bloccate.
    const layer = new Container();
    const veil = new Graphics();
    const coinLayer = new Container();
    layer.addChild(veil, coinLayer);
    this.overlayLayer.addChild(layer);
    const locked: boolean[][] = hw.initial.map((c) => c.map((v) => v !== null));
    const drawVeil = () => {
      veil.clear();
      for (let r = 0; r < this.m.reels; r++)
        for (let row = 0; row < rows; row++) {
          if (locked[r]![row]) continue;
          veil.roundRect(r * (cellW + gap) + 3, row * cellH + 3, cellW - 6, cellH - 6, 14).fill({
            color: PALETTE.plum.abyss,
            alpha: 0.26,
          });
        }
    };
    drawVeil();

    const placeCoin = (r: number, row: number, value: number, pop: boolean) => {
      const x = r * (cellW + gap) + cellW / 2;
      const y = row * cellH + cellH / 2;
      const c = new Container();
      c.position.set(x, y);
      const jp = this.coinJackpot(value);
      if (jp) {
        // Moneta jackpot: alone nel colore del jackpot, perche' anche a
        // colpo d'occhio si distingua dalle monete ordinarie.
        const halo = new Graphics().circle(0, 0, Math.min(cellW, cellH) * 0.46).fill({ color: jp.tint, alpha: 0.35 });
        halo.blendMode = 'add';
        c.addChild(halo);
        if (!reduced) gsap.to(halo, { alpha: 0.6, duration: 0.5, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      }
      const s = new Sprite(coinTex);
      s.anchor.set(0.5);
      s.scale.set(this.theme.symbolScale);
      c.addChild(s, this.coinLabel(value, bet, 0, 0));
      coinLayer.addChild(c);
      // La cella sotto la moneta mostra la moneta stessa: altrimenti resta
      // l'ultimo simbolo del rimescolo e ne spuntano i bordi attorno al disco.
      this.reels[r]!.setCellTexture(row, coinTex);
      locked[r]![row] = true;
      if (pop && !reduced && !this.quick) {
        gsap.from(c.scale, { x: 1.6, y: 1.6, duration: 0.35, ease: 'back.out(2)' });
        this.presenter.sparks(this.ox + x, this.oy + y, jp ? 50 : 22, jp?.tint ?? PALETTE.gold.light);
      }
    };

    // ── Contatore dei respin: tre "pip" che si spengono e si riaccendono.
    const panel = new Container();
    const panelW = 260;
    const { w } = windowSize(this.geo);
    const px = this.ox + w + this.geo.pad + 40;
    if (px + panelW > DESIGN_WIDTH - 20) panel.position.set(DESIGN_WIDTH - panelW - 24, HUD_TOP + 10);
    else panel.position.set(px, this.oy + 40);
    panel.addChild(
      new Graphics()
        .roundRect(0, 0, panelW, 230, 24)
        .fill({ color: PALETTE.plum.raised, alpha: 0.92 })
        .stroke({ color: PALETTE.gold.core, width: 2, alpha: 0.8 })
    );
    const pt = makeText(ss('hwRespins').toUpperCase(), 'label', 20);
    pt.position.set(panelW / 2, 36);
    const num = makeText(String(rule.respins), 'numeric', 72);
    num.position.set(panelW / 2, 104);
    const pips = new Graphics();
    pips.position.set(panelW / 2, 172);
    const total = makeText(formatMoney(0), 'gold', 30);
    total.position.set(panelW / 2, 206);
    panel.addChild(pt, num, pips, total);
    this.world.addChild(panel);
    const setLeft = (n: number) => {
      num.text = String(n);
      pips.clear();
      for (let i = 0; i < rule.respins; i++) {
        const x = (i - (rule.respins - 1) / 2) * 34;
        pips.circle(x, 0, 11).fill({ color: i < n ? PALETTE.gold.light : PALETTE.text.mute, alpha: i < n ? 1 : 0.4 });
      }
    };
    let sum = 0;
    const setSum = () => (total.text = formatMoney(Math.round(sum * bet)));
    setLeft(rule.respins);

    // ── Monete iniziali: si bloccano una dopo l'altra, da sinistra.
    for (let r = 0; r < this.m.reels; r++)
      for (let row = 0; row < rows; row++) {
        const v = hw.initial[r]![row];
        if (v === null || v === undefined) continue;
        placeCoin(r, row, v, true);
        sum += v;
        setSum();
        sfxCoin();
        await wait(T(0.08), () => this.quick);
        if (this.disposed) return;
      }
    drawVeil();
    await wait(T(0.25), () => this.quick);

    // ── Respin.
    // Ogni cella libera diventa un MINI-RULLO: un nastro di simboli dentro la
    // maschera della cella che scende e si ferma con un rimbalzo, colonna
    // dopo colonna da sinistra. Prima le celle cambiavano solo texture a
    // scatti e non si capiva che si stesse girando.
    // Il rimescolo mostra solo simboli "di riempimento": niente monete, wild,
    // scatter o simboli dei bonus interni (un forziere qui confonderebbe).
    const bonusIds = new Set([this.m.wheel?.symbol, this.m.cascade?.symbol, this.m.chests?.symbol]);
    const filler = this.m.symbols
      .filter((d) => d.id !== rule.coin && !d.scatter && !d.wild && !bonusIds.has(d.id))
      .map((d) => d.id);
    const pick = () => filler[Math.floor(Math.random() * filler.length)]!;
    const spinLayer = new Container();
    layer.addChildAt(spinLayer, 0);
    // Nastro piu' lungo e corsa piu' lenta: il mini-rullo si vede girare e
    // rallentare, invece di "scattare" sull'esito.
    const STRIP_N = 12;
    let respinNo = 0;
    for (const step of hw.respins) {
      if (this.disposed) return;
      respinNo++;
      sfxSpinStart();
      this.respinBanner(respinNo, T(0.5));
      const landedAt = new Map(step.landed.map((c) => [`${c.reel},${c.row}`, c]));
      const spinDur = T(0.9);
      const colDelay = T(0.11);
      const rowDelay = T(0.035);
      const jobs: Promise<void>[] = [];
      for (let r = 0; r < this.m.reels; r++)
        for (let row = 0; row < rows; row++) {
          if (locked[r]![row]) continue;
          const coin = landedAt.get(`${r},${row}`);
          const finalId = coin ? null : pick();
          const land = () => {
            if (coin) {
              placeCoin(r, row, coin.value, true);
              sum += coin.value;
              setSum();
              sfxCoin();
              drawVeil();
            } else this.reels[r]!.setCellTexture(row, this.theme.texture(finalId!));
            // Lampo d'oro nella cella appena ferma: si legge il "clac" del rullo.
            if (!reduced && !this.quick) {
              const flash = new Graphics()
                .roundRect(r * (cellW + gap) + 4, row * cellH + 4, cellW - 8, cellH - 8, 14)
                .fill({ color: coin ? PALETTE.gold.light : PALETTE.gold.core, alpha: coin ? 0.5 : 0.22 });
              flash.blendMode = 'add';
              layer.addChild(flash);
              gsap.to(flash, { alpha: 0, duration: 0.35, ease: 'power2.out', onComplete: () => flash.destroy() });
            }
          };
          if (spinDur <= 0 || reduced) {
            land();
            continue;
          }
          // Nastro: sprite i a y = -i·cellH, l'ultimo e' l'esito; il nastro
          // scende di (STRIP_N-1) celle e l'esito arriva al centro della cella.
          const x = r * (cellW + gap);
          const y = row * cellH;
          const cellBox = new Container();
          cellBox.position.set(x, y);
          const mask = new Graphics().rect(0, 0, cellW, cellH).fill(PALETTE.white);
          const tape = new Container();
          for (let i = 0; i < STRIP_N; i++) {
            const last = i === STRIP_N - 1;
            const s = new Sprite(last && coin ? coinTex : this.theme.texture(last ? finalId! : pick()));
            s.anchor.set(0.5);
            s.scale.set(this.theme.symbolScale);
            s.position.set(cellW / 2, cellH / 2 - i * cellH);
            // I simboli di passaggio sono un po' spenti: l'esito "si accende" all'arrivo.
            if (!last) s.alpha = 0.7;
            tape.addChild(s);
          }
          cellBox.addChild(mask, tape);
          tape.mask = mask;
          spinLayer.addChild(cellBox);
          this.reels[r]!.setCellTexture(row, Texture.EMPTY);
          jobs.push(
            new Promise<void>((resolve) => {
              gsap.to(tape, {
                y: (STRIP_N - 1) * cellH,
                duration: spinDur,
                // A onda: colonna dopo colonna, e dentro la colonna dall'alto.
                delay: r * colDelay + row * rowDelay,
                ease: 'back.out(1.35)',
                onComplete: () => {
                  cellBox.destroy({ children: true });
                  if (!this.disposed) land();
                  resolve();
                },
              });
            })
          );
        }
      await Promise.all(jobs);
      if (this.disposed) return;
      if (step.landed.length) await wait(T(0.15), () => this.quick);
      setLeft(step.left);
      if (step.landed.length > 0 && step.left > 0) {
        this.hud.message(ss('hwReset'), 'win');
        if (!reduced) gsap.fromTo(num.scale, { x: 1.5, y: 1.5 }, { x: 1, y: 1, duration: 0.4, ease: 'back.out(2)' });
        sfxConfirm();
      } else {
        this.hud.message(ss('hwLeft', { n: step.left }));
        sfxTick(0.4);
      }
      await wait(T(0.3), () => this.quick);
    }
    spinLayer.destroy({ children: true });
    if (this.disposed) return;

    // ── Griglia piena: il GRAND, in aggiunta al valore delle monete.
    if (hw.jackpot) {
      sfxJackpot();
      this.shake(14, 0.8);
      await this.titleCard(
        ss('hwJackpot', { name: hw.jackpot.label }),
        `${ss('hwFull')} +${formatMoney(Math.round(hw.jackpot.mult * bet))}`,
        hw.jackpot.tint,
        1.8
      );
      if (this.disposed) return;
      sum += hw.jackpot.mult;
      setSum();
    }

    // ── Totale. Il presentatore gestisce da se' skip e fastPlay.
    // Il riepilogo in chiaro spiega da dove viene la cifra.
    const coinSum = hw.jackpot ? sum - hw.jackpot.mult : sum;
    this.hud.message(
      hw.jackpot
        ? ss('hwSummaryJp', {
            coins: formatMoney(Math.round(coinSum * bet)),
            jp: formatMoney(Math.round(hw.jackpot.mult * bet)),
            total: formatMoney(Math.round(hw.payout)),
          })
        : ss('hwSummary', { coins: formatMoney(Math.round(coinSum * bet)), total: formatMoney(Math.round(hw.payout)) }),
      'win'
    );
    this.hud.setWin(o.totalPayout);
    this.phase = 'presenting';
    await this.presenter.present(Math.round(hw.payout), bet, { forceBig: true, title: ss('hwTotal').toUpperCase() });
    if (this.disposed) return;

    // ── Pulizia: le celle tornano a mostrare la griglia del giro base.
    for (let r = 0; r < this.m.reels; r++)
      for (let row = 0; row < rows; row++) this.reels[r]!.setCellTexture(row, this.theme.texture(o.base.grid[r]![row]!));
    gsap.killTweensOf(num.scale);
    for (const c of coinLayer.children) for (const g of c.children) gsap.killTweensOf(g);
    const fade = T(0.35);
    await new Promise<void>((resolve) => {
      if (fade <= 0) return resolve();
      gsap.to([layer, panel], { alpha: 0, duration: fade, onComplete: () => resolve() });
    });
    layer.destroy({ children: true });
    panel.destroy({ children: true });
    this.quick = false;
  }

  /** Scritta "RESPIN n" al centro dei rulli, a ogni respin dell'Hold & Win. */
  private respinBanner(n: number, sec: number): void {
    if (sec <= 0) return;
    const { w, h } = windowSize(this.geo);
    const t = makeText(ss('hwRespinN', { n }), 'gold', 84);
    t.position.set(this.ox + w / 2, this.oy + h / 2);
    t.alpha = 0;
    t.scale.set(0.6);
    this.world.addChild(t);
    gsap
      .timeline({ onComplete: () => t.destroy() })
      .to(t, { alpha: 1, duration: sec * 0.25 }, 0)
      .to(t.scale, { x: 1, y: 1, duration: sec * 0.4, ease: 'back.out(2)' }, 0)
      .to(t, { alpha: 0, duration: sec * 0.35 }, sec * 0.65);
  }

  /**
   * Schema "come si vince": la griglia della macchina in piccolo, con un
   * esempio di combinazione vincente. Linee: tre simboli uguali dal primo
   * rullo lungo la linea centrale, poi il tratto che non conta. Ways: lo
   * stesso simbolo sui primi tre rulli in righe diverse, due volte sul
   * secondo (= 2 combinazioni).
   */
  private howToWinExample(symCanvas: (id: SymId) => HTMLCanvasElement): HTMLElement {
    const m = this.m;
    const cell = 52;
    const pad = 6;
    const c = document.createElement('canvas');
    c.width = m.reels * cell + pad * 2;
    c.height = m.rows * cell + pad * 2;
    c.className = 'go-pay__example';
    const ctx = c.getContext('2d')!;
    const pay = m.symbols.find((s) => !s.wild && !s.scatter && s.pays && Object.keys(s.pays).includes('3'));
    const icon = pay ? symCanvas(pay.id) : null;
    const mid = Math.floor(m.rows / 2);
    const hits: [number, number][] =
      m.evalMode === 'ways'
        ? [[0, mid], [1, 0], [1, m.rows - 1], [2, mid > 0 ? mid - 1 : 0]]
        : [[0, mid], [1, mid], [2, mid]];
    const isHit = (r: number, row: number) => hits.some(([a, b]) => a === r && b === row);
    for (let r = 0; r < m.reels; r++)
      for (let row = 0; row < m.rows; row++) {
        const x = pad + r * cell;
        const y = pad + row * cell;
        const hit = isHit(r, row);
        ctx.fillStyle = rgba(hit ? PALETTE.gold.core : PALETTE.text.strong, hit ? 0.28 : 0.07);
        ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);
        if (hit && icon) ctx.drawImage(icon, x + 4, y + 4, cell - 8, cell - 8);
      }
    ctx.lineCap = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = rgba(PALETTE.gold.light, 1);
    const ctr = (r: number, row: number) => [pad + r * cell + cell / 2, pad + row * cell + cell / 2] as const;
    if (m.evalMode === 'lines') {
      const [x0, y0] = ctr(0, mid);
      const [x2] = ctr(2, mid);
      ctx.beginPath();
      ctx.moveTo(x0 - cell / 2, y0);
      ctx.lineTo(x2, y0);
      ctx.stroke();
      ctx.setLineDash([8, 7]);
      ctx.strokeStyle = rgba(PALETTE.gold.light, 0.4);
      ctx.beginPath();
      ctx.moveTo(x2, y0);
      ctx.lineTo(pad + m.reels * cell, y0);
      ctx.stroke();
    } else {
      ctx.beginPath();
      // Ogni copia sul rullo 2 si collega alla prima e alla terza: si vedono
      // due percorsi, cioe' due combinazioni.
      const [a0, b0] = ctr(...hits[0]!);
      const [c0, d0] = ctr(...hits[3]!);
      for (const h of [hits[1]!, hits[2]!]) {
        const [x, y] = ctr(...h);
        ctx.moveTo(a0, b0);
        ctx.lineTo(x, y);
        ctx.lineTo(c0, d0);
      }
      ctx.stroke();
    }
    return div('go-pay__how', c, el('span', { text: ss(m.evalMode === 'ways' ? 'rulesHowWaysEx' : 'rulesHowLinesEx', { sym: pay?.label ?? '' }) }));
  }

  // ═══════════════════════════════════════════════ FRAME

  protected tick(dt: number): void {
    for (const r of this.reels) r.update(dt);

    // A riposo, le combinazioni vincenti scorrono una alla volta.
    if (this.phase === 'idle' && this.idleWins.length > 1) {
      this.idleTimer += dt;
      if (this.idleTimer > 1.5) {
        this.idleTimer = 0;
        const w = this.idleWins[this.idleIndex % this.idleWins.length]!;
        this.idleIndex++;
        this.drawWins([w], true);
        this.hud.message(this.winText(w), 'win');
      }
    }
  }

  // ═══════════════════════════════════════════════ REGOLE

  protected tutorialGame(): TutorialStep[] {
    const { w, h } = windowSize(this.geo);
    return [
      {
        title: ss('tutReelsT'),
        text: ss(this.m.evalMode === 'ways' ? 'tutReelsWays' : 'tutReelsLines'),
        target: this.designTarget(this.ox, this.oy, w, h),
      },
      { title: ss('tutFeatT'), text: this.theme.features().join(' ') },
      { title: ss('tutTurboT'), text: ss('tutTurboX'), target: '.go-hud__extra' },
    ];
  }

  protected rules(): Node {
    const m = this.m;
    const symCanvas = (id: SymId) => {
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      const ctx = c.getContext('2d')!;
      ctx.scale(96 / 240, 96 / 240);
      this.theme.drawSymbol(ctx, id, 240);
      c.className = 'go-pay__sym';
      return c;
    };

    // Premi anche IN EURO alla puntata attuale: "5× — 700" da solo non dice
    // quanto si vince davvero.
    const bet = wallet().bet;
    const euro = (mult: number, onTotal: boolean) => formatMoney(Math.round((mult * bet) / (onTotal ? 1 : m.betDivisor)));
    const pays = div('go-pay__grid');
    for (const s of m.symbols) {
      const rows: string[] = [];
      const table = s.scatter ? s.scatterPays : s.pays;
      if (table) {
        for (const [k, v] of Object.entries(table).sort((a, b) => Number(b[0]) - Number(a[0]))) {
          rows.push(`${k}× — ${v} (${euro(v, !!s.scatter)})`);
        }
      }
      if (s.freeSpins) {
        for (const [k, v] of Object.entries(s.freeSpins).sort((a, b) => Number(b[0]) - Number(a[0]))) {
          rows.push(`${k}× → ${v} ${ss('freeLabel').toLowerCase()}`);
        }
      }
      if (s.wild) rows.push('WILD');
      if (m.wheel && s.id === m.wheel.symbol) rows.push(ss('bonusTrigWheel'));
      if (m.cascade && s.id === m.cascade.symbol) {
        for (const [k, v] of Object.entries(m.cascade.spins).sort((a, b) => Number(b[0]) - Number(a[0]))) {
          rows.push(ss('bonusTrigCascade', { n: k, s: v }));
        }
      }
      if (m.chests && s.id === m.chests.symbol) rows.push(ss('bonusTrigChests', { n: m.chests.trigger }));
      pays.append(
        div(
          'go-pay__item',
          symCanvas(s.id),
          div('go-pay__text', el('strong', { text: s.label }), ...rows.map((r) => el('span', { text: r })))
        )
      );
    }

    const lines = div('go-pay__lines');
    if (m.evalMode === 'lines') {
      m.paylines.forEach((line, i) => {
        const c = document.createElement('canvas');
        c.width = 5 * 14 + 4;
        c.height = 3 * 14 + 4;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = rgba(PALETTE.text.strong, 0.08);
        for (let r = 0; r < m.reels; r++)
          for (let row = 0; row < m.rows; row++) ctx.fillRect(2 + r * 14, 2 + row * 14, 12, 12);
        ctx.fillStyle = rgba(LINE_COLORS[i % LINE_COLORS.length]!, 1);
        line.forEach((row, r) => ctx.fillRect(2 + r * 14, 2 + row * 14, 12, 12));
        lines.append(div('go-pay__line', el('span', { text: String(i + 1) }), c));
      });
    }

    return div(
      'go-pay',
      el('h3', { text: ss('rulesHow') }),
      this.howToWinExample(symCanvas),
      el('p', { text: ss(m.evalMode === 'ways' ? 'rulesHowWays' : 'rulesHowLines') }),
      m.evalMode === 'ways' ? el('p', { class: 'go-pay__note', text: ss('rulesStacks') }) : null,
      el('p', { class: 'go-pay__note', text: ss('rulesBetNow', { bet: formatMoney(bet) }) }),
      el('h3', { text: ss('rulesFeatures') }),
      ...this.theme.features().map((p) => el('p', { text: p })),
      ...(this.theme.bonusGuide
        ? [
            el('h3', { text: ss('rulesBonus') }),
            ...this.theme.bonusGuide().flatMap((g) => [
              el('h4', { class: 'go-pay__bonus-title', text: g.title }),
              el('ol', { class: 'go-pay__steps' }, ...g.steps.map((st) => el('li', { text: st }))),
            ]),
          ]
        : []),
      el('h3', { text: ss('rulesPays') }),
      el('p', {
        class: 'go-pay__note',
        text: ss(m.evalMode === 'ways' ? 'rulesWaysNote' : 'rulesPaysNote', { lines: m.betDivisor }),
      }),
      pays,
      m.evalMode === 'lines' ? el('h3', { text: ss('rulesLines') }) : null,
      m.evalMode === 'lines' ? lines : null,
      el('p', { class: 'go-pay__note', text: ss('rulesRtp', { rtp: m.rtpTarget }) })
    );
  }

  dispose(): void {
    this.unsubRtp?.();
    this.unsubRtp = null;
    this.stopAuto();
    this.hideWildColumns();
    for (const r of this.reels) gsap.killTweensOf(r);
    super.dispose();
  }
}
