/**
 * THE ROYAL MIRAGE — Scena base dei giochi
 *
 * Tutto cio' che ogni tavolo ha in comune, cosi' una scena di gioco si
 * occupa solo delle proprie regole e della propria grafica:
 *
 *   root
 *   ├─ backdrop   foto della Strip abbassata dal velo prugna (in cache)
 *   ├─ world      il gioco vero e proprio — e' QUESTO che trema nelle vincite
 *   └─ fx         presentazione vincite, sempre sopra e mai scossa
 *
 * ── Ciclo di una giocata ──
 *   1. `this.placeBet(n)`    scala le fiche (false = non partire!)
 *   2. `this.roundActive = true` finche' l'esito non e' saldato
 *   3. `this.settle(bet, payout)` accredita e chiude la giocata
 *
 * Se l'utente esce a meta' (Esc, "Esci"), `beforeExit` chiede conferma e poi
 * chiama `resolvePending()`: la sottoclasse paga cio' che e' gia' deciso
 * (una slot conosce l'esito dal click) e abbandona cio' che non lo e'.
 */

import { Container } from 'pixi.js';
import { DESIGN_WIDTH, game, type Viewport } from '@/core/App';
import { gsap } from 'gsap';
import { Scene } from '@/core/Scene';
import { Backdrop } from '@/fx/Backdrop';
import type { EnvironmentId } from '@/fx/environment/registry';
import { actions, settings } from '@/state/store';
import { profileFor, type QualityProfile } from '@/state/settings';
import { t } from '@/i18n';
import { runTutorial, isTutorialOpen, type ScreenRect, type TutorialStep } from '@/ui/dom/Tutorial';
import { progression } from '@/state/store';
import { confirmModal, showModal } from '@/ui/dom/Modal';
import { gameById, type GameId } from '@/games/registry';
import { GameHud, HUD_BOTTOM, HUD_TOP, type HudOptions } from './GameHud';
import { WinPresenter } from './WinPresenter';
import { RoundLedger } from './ledger';

export type SceneHudOptions = Omit<HudOptions, 'onExit' | 'title' | 'onInfo'>;

export abstract class GameScene extends Scene {
  abstract readonly gameId: GameId;

  protected backdrop!: Backdrop;
  /** Contenuto del gioco. Coordinate di design 1920x1080. */
  protected readonly world = new Container();
  /** Effetti sopra al gioco (non partecipano allo scuotimento). */
  protected readonly fx = new Container();
  protected presenter!: WinPresenter;
  protected hud!: GameHud;
  protected readonly quality: QualityProfile = profileFor(settings());

  /** Vero dalla puntata al saldo. Governa la conferma d'uscita. */
  protected roundActive = false;

  /** Fiche uscite e non ancora saldate. Rende `settle` idempotente. */
  private readonly ledger = new RoundLedger();

  private shakeLeft = 0;
  private shakeDur = 0;
  private shakeAmp = 0;
  /** Posizione di riposo del mondo: la scossa oscilla attorno a questa. */
  private worldBase = { x: 0, y: 0 };

  /** Opzioni dell'HUD (pulsante principale, modalita' puntata...). */
  protected abstract hudOptions(): SceneHudOptions;
  /** Costruisce la grafica del gioco dentro `this.world`. */
  protected abstract build(): void | Promise<void>;
  /** Contenuto della modale "Regole e vincite". Null = nessun pulsante. */
  protected rules(): Node | null {
    return null;
  }
  /** Logica per frame della sottoclasse. */
  protected tick(_dt: number, _elapsed: number): void {}
  /** Asset da decodificare prima di `build()` (icone dei simboli, ecc.). */
  protected async preload(): Promise<void> {}
  /** Uscita a giocata aperta: salda cio' che e' gia' deciso. */
  protected resolvePending(): void {}

  /** Opacita' del velo sullo sfondo: i tavoli lo vogliono piu' scuro delle slot. */
  protected backdropDim = 0.38;

  /**
   * L'ambiente dietro al gioco: il salone per i tavoli, le fontane per le
   * slot, lo skyline per il Golden Chip. Le texture sono in cache: due
   * tavoli nello stesso salone non costano una seconda cottura.
   */
  protected backdropEnv: EnvironmentId = 'salon';

  async enter(): Promise<void> {
    const q = this.quality;
    await Promise.all([Backdrop.prepare(this.backdropEnv), this.preload()]);
    this.backdrop = new Backdrop({
      env: this.backdropEnv,
      dim: this.backdropDim,
      quality: !q.ambientParticles ? 'low' : q.bloom ? 'high' : 'medium',
    });
    this.world.label = 'world';
    this.fx.label = 'fx';
    this.root.addChild(this.backdrop, this.world, this.fx);

    this.presenter = new WinPresenter((amp, dur) => this.shake(amp, dur));
    this.fx.addChild(this.presenter);

    await this.build();

    const info = gameById(this.gameId);
    const rules = this.rules();
    this.hud = new GameHud({
      ...this.hudOptions(),
      title: t(info.nameKey),
      onExit: () => void this.requestExit(),
      onInfo: rules ? () => this.openRules() : undefined,
      onHelp: () => this.openTutorial(),
    });

    // Primo ingresso: il tutorial parte da solo. Con un ritardo, perche' le
    // sottoclassi aggiungono i propri comandi DOPO `super.enter()` e la
    // transizione d'ingresso deve essere finita.
    // Nei collaudi automatici (puppeteer: `navigator.webdriver`) non parte da
    // solo, altrimenti il velo bloccherebbe i click degli script; per
    // collaudare il tutorial stesso: localStorage 'rm:force-tutorial' = '1'.
    const automated = navigator.webdriver && localStorage.getItem('rm:force-tutorial') !== '1';
    if (!automated && !progression().tutorialsSeen.includes(this.gameId)) {
      setTimeout(() => {
        if (!this.root.destroyed && !this.roundActive && !isTutorialOpen()) this.openTutorial();
      }, 900);
    }
  }

  // ─────────────────────────────────────────────── TUTORIAL

  /**
   * Passi del tutorial: introduzione, saldo, puntata, pulsante principale,
   * poi i passi propri del gioco (`tutorialGame`), infine regolamento e
   * guida. Le sottoclassi di norma ridefiniscono solo `tutorialGame`.
   */
  protected tutorial(): TutorialStep[] {
    const info = gameById(this.gameId);
    const chips = this.hudOptions().betMode === 'chips';
    return [
      { title: t(info.nameKey), text: t('tut.intro', { tag: t(info.tagKey) }) },
      { title: t('tut.balance.t'), text: t('tut.balance.x'), target: '.go-hud__meter--balance' },
      { title: t('tut.bet.t'), text: t(chips ? 'tut.betChips.x' : 'tut.bet.x'), target: '.go-hud__bet' },
      ...this.tutorialGame(),
      { title: t('tut.primary.t'), text: t('tut.primary.x'), target: '.go-hud__primary' },
      ...(this.rules() ? [{ title: t('tut.rules.t'), text: t('tut.rules.x'), target: '.go-hud__info' }] : []),
      { title: t('tut.help.t'), text: t('tut.help.x'), target: '.go-hud__help' },
    ];
  }

  /** Passi specifici del gioco, fra la puntata e il pulsante principale. */
  protected tutorialGame(): TutorialStep[] {
    return [];
  }

  protected openTutorial(): void {
    if (this.root.destroyed) return;
    runTutorial(this.tutorial(), () => actions.markTutorialSeen(this.gameId));
  }

  /**
   * Bersaglio del tutorial da un rettangolo nello spazio di DESIGN del mondo
   * (1920×1080). Passa da `world.toGlobal`, quindi tiene conto anche del
   * ridimensionamento del mondo sul telefono (`fitWorld`). Con
   * `autoDensity` le coordinate globali di Pixi sono gia' pixel CSS.
   */
  protected designTarget(x: number, y: number, w: number, h: number): () => ScreenRect | null {
    return () => {
      if (this.world.destroyed) return null;
      const a = this.world.toGlobal({ x, y });
      const b = this.world.toGlobal({ x: x + w, y: y + h });
      const c = game.app.canvas.getBoundingClientRect();
      return { x: c.left + a.x, y: c.top + a.y, w: b.x - a.x, h: b.y - a.y };
    };
  }

  /** Bersaglio del tutorial da un oggetto Pixi (i suoi bounds attuali). */
  protected pixiTarget(obj: () => Container | null | undefined): () => ScreenRect | null {
    return () => {
      const o = obj();
      if (!o || o.destroyed) return null;
      const b = o.getBounds();
      const c = game.app.canvas.getBoundingClientRect();
      return { x: c.left + b.x, y: c.top + b.y, w: b.width, h: b.height };
    };
  }

  private async requestExit(): Promise<void> {
    // Import pigro: la Shell importa il registry, che importa (pigramente)
    // questa scena. Un import statico chiuderebbe il cerchio al caricamento.
    const { shell } = await import('@/ui/Shell');
    await shell.exitGame();
  }

  protected openRules(): void {
    const body = this.rules();
    if (body) showModal({ titleKey: 'game.rules', body, width: 960 });
  }

  async beforeExit(): Promise<boolean> {
    if (!this.roundActive) return true;
    const ok = await confirmModal({
      titleKey: 'game.leaveTitle',
      messageKey: 'game.leaveBody',
      confirmKey: 'game.leaveConfirm',
      danger: true,
    });
    if (ok && this.roundActive) {
      this.resolvePending();
      this.roundActive = false;
    }
    return ok;
  }

  // ─────────────────────────────────────────────── PORTAFOGLIO

  /**
   * Scala la puntata. False = saldo insufficiente, non avviare la giocata.
   *
   * `countRound: false` per i costi aggiuntivi della STESSA giocata
   * (raddoppio, divisione, assicurazione): le fiche escono davvero, ma la
   * giocata resta una.
   */
  protected placeBet(amount: number, opts?: { countRound?: boolean }): boolean {
    const ok = actions.placeBet(this.gameId, amount, opts);
    if (ok) this.ledger.add(Math.round(amount));
    return ok;
  }

  /**
   * Accredita la vincita lorda (0 = persa) e chiude la giocata.
   *
   * Idempotente per costruzione: una seconda chiamata sulla stessa giocata
   * viene scartata dal registro. Le scene possono quindi chiamare `settle`
   * sia dalla fine dell'animazione sia da `resolvePending()` senza poter mai
   * pagare due volte.
   */
  protected settle(bet: number, payout: number): void {
    if (!this.ledger.close()) {
      if (import.meta.env.DEV) {
        console.warn(`[${this.gameId}] settle() senza una giocata aperta: accredito scartato`);
      }
      return;
    }
    actions.settle(this.gameId, bet, payout);
  }

  /** Fiche gia' uscite nella giocata aperta (puntata + eventuali raddoppi). */
  protected get openStake(): number {
    return this.ledger.stake;
  }

  // ─────────────────────────────────────────────── TELEFONO

  resize(vp: Viewport): void {
    this.fitWorld(vp);
  }

  /**
   * Al telefono l'HUD ha misure in pixel reali (`.is-compact` in hud.css),
   * quindi le sue barre occupano nel design space un'altezza diversa da
   * quella per cui i giochi sono disposti (fra HUD_TOP e HUD_BOTTOM). Qui il
   * mondo si scala e si centra nella fascia che le barre lasciano davvero
   * libera: nessun gioco deve conoscere le misure dell'HUD.
   * Mai ingrandito oltre 1: la composizione di ogni gioco e' pensata a quella scala.
   */
  private fitWorld(vp: Viewport): void {
    let k = 1;
    let x = 0;
    let y = 0;
    if (vp.compact && this.hud) {
      const band = this.hud.band();
      const natural = HUD_BOTTOM - HUD_TOP;
      k = Math.min(1, (band.bottom - band.top - 6) / natural, game.screenRect.width / DESIGN_WIDTH);
      x = (DESIGN_WIDTH * (1 - k)) / 2;
      y = (band.top + band.bottom) / 2 - (k * (HUD_TOP + HUD_BOTTOM)) / 2;
    }
    this.worldBase = { x, y };
    this.world.scale.set(k);
    this.world.position.set(x, y);
  }

  // ─────────────────────────────────────────────── EFFETTI

  /** Scossa del mondo di gioco. Ignorata con "Riduci il movimento". */
  shake(amp: number, dur: number): void {
    if (settings().reducedMotion) return;
    if (amp < this.shakeAmp && this.shakeLeft > 0) return;
    this.shakeAmp = amp;
    this.shakeDur = dur;
    this.shakeLeft = dur;
  }

  update(dt: number, elapsed: number): void {
    // `enter()` e' asincrono (attende le foto): i primi frame possono
    // arrivare prima che sfondo e presentatore esistano.
    if (!this.backdrop || !this.presenter) return;
    this.backdrop.update(dt);
    this.presenter.update(dt);

    if (this.shakeLeft > 0) {
      this.shakeLeft -= dt;
      const k = Math.max(0, this.shakeLeft / this.shakeDur);
      const a = this.shakeAmp * k * k;
      const { x, y } = this.worldBase;
      this.world.position.set(x + (Math.random() * 2 - 1) * a, y + (Math.random() * 2 - 1) * a);
      if (this.shakeLeft <= 0) {
        this.world.position.set(x, y);
        this.shakeAmp = 0;
      }
    }

    this.tick(dt, elapsed);
  }

  dispose(): void {
    this.hud?.destroy();
    killTweensDeep(this.root);
    super.dispose();
  }
}

/**
 * Ferma ogni tween gsap ancora attivo su un albero di oggetti.
 * Un tween che sopravvive alla scena scrive su oggetti distrutti e lancia
 * un'eccezione al frame successivo.
 */
export function killTweensDeep(node: Container): void {
  gsap.killTweensOf(node);
  gsap.killTweensOf(node.scale);
  gsap.killTweensOf(node.position);
  gsap.killTweensOf(node.pivot);
  for (const c of node.children) killTweensDeep(c as Container);
}
