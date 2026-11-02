/**
 * THE ROYAL MIRAGE — Golden Chip (id interno: crash)
 *
 * Punti, poi la fiche d'oro della casa si alza e il moltiplicatore sale.
 * Incassi quando vuoi; se la fiche va in pezzi prima, la puntata e' persa.
 *
 * ── Chi decide l'esito ──
 * Nessuno, durante il volo. Il punto di schianto e' calcolato da `fair.ts`
 * PRIMA del decollo, dal seme del volo di cui l'impronta e' gia' pubblica.
 * Da qui derivano due scelte di questa scena:
 *
 *   1. **Uscire a volo in corso incassa al moltiplicatore corrente** invece
 *      di perdere la puntata (`resolvePending`). Non e' sfruttabile: il
 *      crash e' gia' fissato, uscire un istante prima non puo' "salvare" un
 *      volo che sarebbe comunque arrivato fin li'. E' la lettura piu'
 *      generosa di un esito che il giocatore non ha modo di influenzare.
 *   2. **La curva e' presentazione, non matematica.** `tick()` muove un
 *      moltiplicatore nel tempo e si ferma quando raggiunge il valore
 *      deciso; cambiare la velocita' della curva (fastPlay) non cambia
 *      l'esito ne' l'RTP, solo la durata dello spettacolo.
 *
 * ── La curva ──
 * `mult = exp(k·t + j·t²)`: l'accelerazione quadratica e' cio' che da' la
 * tensione. Con un'esponenziale pura il tratto fra ×1 e ×2 dura quanto
 * quello fra ×50 e ×100, e i voli lunghi diventano noiosi invece di
 * vertiginosi.
 *
 * ── Un solo accredito ──
 * `settle` passa dal registro di `GameScene` (idempotente), ma la scena
 * tiene comunque il proprio `roundActive`: fra l'incasso e il ritorno in
 * fase di puntata ci sono una `reveal()` asincrona e una presentazione
 * della vincita che continuano a girare durante i 0,55 s della transizione
 * d'uscita, e ognuna di quelle continuazioni deve poter capire da sola che
 * la giocata non c'e' piu'.
 */

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { gsap } from 'gsap';
import { GameScene, type SceneHudOptions } from '@/games/common/GameScene';
import { HUD_TOP } from '@/games/common/GameHud';
import { makeText } from '@/games/common/text';
import { button, div, el } from '@/ui/dom/el';
import { PALETTE } from '@/art/palette';
import { settings, wallet } from '@/state/store';
import { formatMoney } from '@/state/wallet';
import { sfxCrash, sfxCrashTick, sfxBetConfirm, sfxCashout, sfxDenied } from '@/audio/synth';
import { bus } from '@/state/events';
import { gameById } from '@/games/registry';
import type { EnvironmentId } from '@/fx/environment/registry';
import { barTexture, chartPanelTexture, flareTexture, glowTexture, shardTexture } from './art';
import { houseChipTexture } from '@/art/houseChip';
import { FairDealer, verify, type RevealedRound } from './fair';
import { cs } from './strings';

// ─────────────────────────────────────────────── GEOMETRIA

/** Pannello del grafico: riempie la fascia libera fra HUD alto e basso. */
const PANEL = { x: 268, y: HUD_TOP + 34, w: 1384, h: 596 } as const;
/** Area di tracciato dentro il pannello. */
const PLOT = {
  x0: PANEL.x + 104,
  x1: PANEL.x + PANEL.w - 96,
  y0: PANEL.y + PANEL.h - 76, // base (moltiplicatore ×1.00)
  y1: PANEL.y + 96, // cielo
} as const;

/** Secondi del conto alla rovescia fra un volo e il successivo. */
const COOLDOWN = 2.6;
/** Voli mostrati nel tabellone. */
const HISTORY_MAX = 12;

/** Moltiplicatore in centesimi al tempo `t` di volo. Vedi testata. */
function multCentsAt(t: number): number {
  return Math.max(100, Math.floor(100 * Math.exp(0.1 * t + 0.0042 * t * t)));
}

/** Centesimi → "2.47", la forma con cui il giocatore legge il moltiplicatore. */
function fmtMult(cents: number): string {
  return (cents / 100).toFixed(2);
}

type Phase = 'idle' | 'flying' | 'over';

export class CrashScene extends GameScene {
  readonly name = 'crash';
  readonly gameId = 'crash' as const;

  private readonly dealer = new FairDealer();
  /** Pronto solo dopo `init()`: finche' e' falso non si punta. */
  private fairReady = false;

  private phase: Phase = 'idle';
  /** Fiche della giocata aperta. */
  private bet = 0;
  /** Punto di schianto del volo in corso, in centesimi. */
  private crashCents = 0;
  /** Moltiplicatore mostrato adesso, in centesimi. */
  private cents = 100;
  private flightT = 0;
  private cooldown = 0;
  /** Cresce a ogni volo: identifica le continuazioni asincrone. */
  private flightId = 0;

  private autoCents = 0;
  private autoInput!: HTMLInputElement;
  private autoBtn!: HTMLButtonElement;

  private readonly history: number[] = [];

  // Grafica
  private curve = new Graphics();
  private multText!: Text;
  private statusText!: Text;
  private falcon = new Container();
  private falconBody!: Sprite;
  private wingNear!: Sprite;
  private wingFar!: Sprite;
  private tipGlow!: Sprite;
  private tipFlare!: Sprite;
  private shards = new Container();
  /** Scia di scintille d'oro dietro la fiche in volo. */
  private sparks = new Container();
  private sparkAcc = 0;
  private barFill!: Sprite;
  private barWrap = new Container();
  private historyRow = new Container();

  /** Punti della traiettoria: [t, centesimi]. */
  private trail: [number, number][] = [];
  private sfxAcc = 0;

  protected hudOptions(): SceneHudOptions {
    return { primaryLabel: cs('fly'), onPrimary: () => this.onPrimary(), betMode: 'stepper' };
  }

  // ═══════════════════════════════════════════════ COSTRUZIONE

  /**
   * La Strip vista dall'alto, cielo nero: una curva che sale ha senso solo
   * se ha qualcosa da superare, e la fiche qui si alza sopra le torri.
   */
  protected backdropEnv: EnvironmentId = 'skyline';

  /**
   * Velo piu' scuro delle slot: la curva d'oro vive di contrasto, ma le
   * luci della citta' sull'orizzonte devono restare leggibili.
   */
  protected backdropDim = 0.4;

  protected build(): void {
    const panel = new Sprite(chartPanelTexture(PANEL.w, PANEL.h));
    panel.position.set(PANEL.x, PANEL.y);
    this.world.addChild(panel);

    // Griglia: solo i riferimenti del moltiplicatore. Il pannello ha gia' la
    // propria filigrana, un reticolo pieno la soffocherebbe.
    const grid = new Graphics();
    for (let i = 1; i <= 4; i++) {
      const y = PLOT.y0 - ((PLOT.y0 - PLOT.y1) * i) / 4;
      grid.moveTo(PLOT.x0 - 18, y).lineTo(PLOT.x1 + 10, y);
    }
    grid.stroke({ color: PALETTE.gold.light, alpha: 0.07, width: 1.5 });
    grid.moveTo(PLOT.x0 - 18, PLOT.y0).lineTo(PLOT.x1 + 10, PLOT.y0);
    grid.stroke({ color: PALETTE.gold.core, alpha: 0.3, width: 2 });
    this.world.addChild(grid, this.curve);

    // Il moltiplicatore sta in ALTO a sinistra e non al centro: il centro e'
    // dove passa la curva, e un numero di 150px sotto alla fiche lo renderebbe
    // illeggibile proprio nel momento in cui conta.
    this.multText = makeText('1.00×', 'numeric', 128);
    this.multText.anchor.set(0, 0.5);
    this.multText.position.set(PANEL.x + 72, PANEL.y + 108);
    this.statusText = makeText(cs('multiplier').toUpperCase(), 'label', 22);
    this.statusText.anchor.set(0, 0.5);
    this.statusText.position.set(PANEL.x + 76, PANEL.y + 44);
    this.world.addChild(this.statusText, this.multText);

    this.buildFalcon();

    this.tipGlow = new Sprite(glowTexture());
    this.tipGlow.anchor.set(0.5);
    this.tipGlow.scale.set(1.5);
    this.tipGlow.tint = PALETTE.gold.core;
    this.tipGlow.alpha = 0;
    this.tipFlare = new Sprite(flareTexture());
    this.tipFlare.anchor.set(0.5);
    // A piena scala i raggi lunghi bucano la cornice del pannello.
    this.tipFlare.scale.set(0.6);
    this.tipFlare.alpha = 0;
    this.world.addChild(this.sparks, this.tipGlow, this.tipFlare, this.falcon, this.shards);

    this.buildCountdown();
    this.buildHistory();
    this.resetFlightVisuals();
  }

  /**
   * La fiche d'oro della casa (`art/houseChip.ts`). I due sprite "ala"
   * restano vuoti perche' la regia del volo li anima senza sapere cosa
   * siano; qui servono solo a non cambiarne il contratto.
   */
  private buildFalcon(): void {
    this.wingFar = new Sprite();
    this.wingNear = new Sprite();
    this.falconBody = new Sprite(houseChipTexture('gold'));
    this.falconBody.anchor.set(0.5);
    this.falcon.addChild(this.wingFar, this.falconBody, this.wingNear);
    this.falcon.scale.set(0.6);
  }

  private buildCountdown(): void {
    const w = 420;
    const track = new Graphics()
      .roundRect(0, 0, w, 10, 5)
      .fill({ color: PALETTE.plum.lifted, alpha: 0.9 })
      .stroke({ color: PALETTE.gold.core, alpha: 0.3, width: 1 });
    this.barFill = new Sprite(barTexture());
    this.barFill.width = w;
    this.barFill.height = 10;
    this.barWrap.addChild(track, this.barFill);
    // Dentro il pannello, sotto la linea di base: fuori, collide con il
    // titolo del tabellone.
    this.barWrap.position.set(960 - w / 2, PLOT.y0 + 34);
    this.barWrap.alpha = 0;
    this.world.addChild(this.barWrap);
  }

  private buildHistory(): void {
    this.historyRow.position.set(960, PANEL.y + PANEL.h + 74);
    const label = makeText(cs('history').toUpperCase(), 'label', 18);
    label.anchor.set(0.5, 1);
    label.position.set(960, PANEL.y + PANEL.h + 54);
    label.alpha = 0.75;
    this.world.addChild(label, this.historyRow);
    this.renderHistory();
  }

  /** Tabellone dei voli passati: pillole, verdi se alti, rosse se istantanei. */
  private renderHistory(): void {
    this.historyRow.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (!this.history.length) {
      const empty = makeText(cs('noHistory'), 'small', 20);
      empty.alpha = 0.4;
      this.historyRow.addChild(empty);
      return;
    }
    const gap = 112;
    const n = this.history.length;
    this.history.forEach((c, i) => {
      const hot = c >= 200;
      // Il testo va in un Container ACCANTO allo sfondo, non dentro di esso:
      // in Pixi 8 un Graphics non e' piu' un genitore legittimo (per ora e'
      // solo un avviso di deprecazione, ma il gruppo serve comunque per
      // spostare pastiglia e numero come un pezzo solo).
      const pill = new Container();
      pill.addChild(
        new Graphics()
          .roundRect(-48, -18, 96, 36, 18)
          .fill({ color: PALETTE.text.strong, alpha: 0.84 })
          .stroke({ color: hot ? PALETTE.win.core : PALETTE.red.core, alpha: 0.75, width: 1.5 }),
        makeText(`${fmtMult(c)}×`, 'value', 22, {
          fill: hot ? PALETTE.win.light : PALETTE.red.light,
        })
      );
      pill.x = (i - (n - 1) / 2) * gap;
      this.historyRow.addChild(pill);
    });
  }

  async enter(): Promise<void> {
    await super.enter();

    // Auto-incasso: un campo e un interruttore nell'area libera dell'HUD.
    // Non e' un'impostazione del gioco ma della giocata, quindi sta accanto
    // al pulsante d'azione e non nelle preferenze.
    this.autoInput = el('input', {
      class: 'go-input',
      attrs: {
        type: 'number',
        inputmode: 'decimal',
        min: '1.01',
        step: '0.1',
        placeholder: '2.00',
        'aria-label': cs('autoHint'),
        title: cs('autoHint'),
      },
      style: { width: '108px', textAlign: 'center' },
      on: { change: () => this.applyAuto(this.autoCents > 0) },
    });
    this.autoBtn = button(cs('autoLabel'), {
      variant: 'secondary',
      size: 'sm',
      attrs: { 'aria-pressed': 'false' },
      onClick: () => this.applyAuto(this.autoCents === 0),
    });
    this.autoBtn.classList.add('go-hud__toggle');
    this.hud.extra.append(
      div('', el('span', { class: 'go-hud__label', text: cs('autoLabel'), style: { marginRight: '8px' } }), this.autoInput),
      this.autoBtn
    );

    this.hud.message(cs('placeBet'));

    // L'impronta del primo volo va generata prima che si possa puntare: il
    // patto e' "impronta PRIMA della puntata", non "appena possibile".
    this.hud.setPrimaryEnabled(false);
    try {
      await this.dealer.init();
      this.fairReady = true;
    } catch {
      this.hud.message(cs('cryptoFail'), 'warn');
    }
    if (this.disposed) return;
    this.hud.setPrimaryEnabled(this.fairReady);
  }

  // ═══════════════════════════════════════════════ CONTROLLI

  /** Auto-incasso: legge il campo, valida, aggiorna messaggio e stato. */
  private applyAuto(on: boolean): void {
    const raw = Number(this.autoInput.value.replace(',', '.'));
    const cents = Math.round(raw * 100);
    if (!on || !Number.isFinite(cents) || cents < 101) {
      this.autoCents = 0;
      this.autoBtn.classList.remove('is-on');
      this.autoBtn.setAttribute('aria-pressed', 'false');
      if (on) sfxDenied();
      if (this.phase === 'idle') this.hud.message(cs('autoOff'));
      return;
    }
    this.autoCents = cents;
    this.autoBtn.classList.add('is-on');
    this.autoBtn.setAttribute('aria-pressed', 'true');
    this.autoInput.value = fmtMult(cents);
    if (this.phase === 'idle') this.hud.message(cs('autoOn', { m: fmtMult(cents) }));
  }

  private onPrimary(): void {
    if (this.phase === 'flying') {
      this.cashOut();
      return;
    }
    if (this.phase === 'idle') void this.launch();
  }

  // ═══════════════════════════════════════════════ GIOCATA

  private async launch(): Promise<void> {
    if (this.phase !== 'idle' || !this.fairReady) return;
    const bet = wallet().bet;
    if (!this.placeBet(bet)) {
      sfxDenied();
      this.hud.message(cs('insufficient'), 'warn');
      return;
    }

    this.bet = bet;
    this.roundActive = true;
    // La fase passa a 'flying' solo a crash noto: `tick()` non deve poter
    // girare con `crashCents` a zero, che significherebbe schianto immediato
    // su un volo il cui esito non e' ancora stato letto.
    const id = ++this.flightId;
    this.hud.lockBet(true);
    this.hud.setWin(0);
    this.hud.setPrimary(cs('launching'), { enabled: false });
    this.hud.message(cs('launching'));
    this.resetFlightVisuals();

    let decided: number;
    try {
      decided = await this.dealer.roll();
    } catch {
      // Senza WebCrypto non c'e' esito verificabile: la puntata torna
      // indietro (payout = puntata) invece di restare in un limbo.
      if (!this.disposed && this.flightId === id) {
        this.finish(bet);
        this.hud.message(cs('cryptoFail'), 'warn');
        this.toIdle();
      }
      return;
    }
    if (this.disposed || this.flightId !== id) return;

    this.crashCents = decided;
    this.flightT = 0;
    this.cents = 100;
    this.trail = [[0, 100]];
    this.phase = 'flying';
    sfxBetConfirm();
    this.hud.setPrimary(cs('cashOut', { m: '1.00' }), { enabled: true, variant: 'danger' });
    this.hud.message('');
  }

  /** Incasso volontario (pulsante) o automatico, al moltiplicatore mostrato. */
  private cashOut(): void {
    if (this.phase !== 'flying' || !this.roundActive) return;
    const cents = this.cents;
    const payout = Math.floor((this.bet * cents) / 100);
    this.phase = 'over';
    this.finish(payout);
    this.endFlight(cents, true);
    sfxCashout();
    this.hud.message(cs('cashedOut', { m: fmtMult(cents), win: formatMoney(payout) }), 'win');
    bus.emit('game:event', { game: this.gameId, kind: 'crash:cashout' });
    // La presentazione e' asincrona e non deve trattenere i controlli: la
    // fase e' gia' 'over' e il conto alla rovescia parte comunque.
    void this.presenter.present(payout, this.bet, { x: this.falcon.x, y: this.falcon.y });
  }

  /** Lo schianto: il volo ha raggiunto il punto deciso dal seme. */
  private boom(): void {
    const cents = this.crashCents;
    this.cents = cents;
    this.phase = 'over';
    this.finish(0);
    this.endFlight(cents, false);
    sfxCrash();
    this.shake(14, 0.5);
    this.hud.message(cs('crashedLost', { m: fmtMult(cents) }), 'warn');
    this.spawnShards();
    bus.emit('game:event', { game: this.gameId, kind: 'crash:boom' });
  }

  /**
   * Unico punto di accredito della scena. `roundActive` chiude la porta a
   * ogni continuazione asincrona ancora in volo (reveal, presentazione,
   * transizione d'uscita); il registro di `GameScene` e' la seconda rete.
   */
  private finish(payout: number): void {
    if (!this.roundActive) return;
    this.roundActive = false;
    this.settle(this.bet, payout);
    this.hud.setWin(payout);
  }

  /** Coda comune a incasso e schianto: grafica, reveal del seme, countdown. */
  private endFlight(cents: number, cashed: boolean): void {
    // Il tabellone registra dove il volo SI SAREBBE schiantato, non dove si
    // e' incassato: e' la storia del gioco, non del giocatore. Il valore e'
    // pubblico da qui in poi, perche' il seme viene rivelato subito sotto.
    this.history.unshift(this.crashCents);
    if (this.history.length > HISTORY_MAX) this.history.length = HISTORY_MAX;
    this.renderHistory();
    this.multText.text = `${fmtMult(cents)}×`;
    this.multText.style.fill = cashed ? PALETTE.win.light : PALETTE.red.light;
    this.statusText.text = (cashed ? cs('cashedShort', { m: fmtMult(cents) }) : cs('crashed', { m: fmtMult(cents) })).toUpperCase();
    this.drawCurve(cashed ? PALETTE.win.core : PALETTE.red.core);
    this.falcon.visible = cashed;
    this.tipFlare.alpha = 0;
    this.tipGlow.alpha = 0;
    this.hud.setPrimary(cs('waiting'), { enabled: false, variant: 'secondary' });
    this.cooldown = settings().fastPlay ? COOLDOWN * 0.6 : COOLDOWN;
    this.barWrap.alpha = 1;

    const id = this.flightId;
    // Finche' il seme non e' ruotato non si punta: un decollo in questa
    // finestra userebbe il crash gia' calcolato e la rotazione arriverebbe
    // a volo in corso, rompendo la verifica di entrambi i voli.
    this.fairReady = false;
    // Il seme va rivelato e ruotato: da qui in avanti l'impronta mostrata
    // nella modale e' quella del volo SUCCESSIVO.
    void this.dealer
      .reveal()
      .catch(() => null)
      .then((r) => {
        if (this.disposed || this.flightId !== id) return;
        this.fairReady = r !== null;
        if (!r) this.hud.message(cs('cryptoFail'), 'warn');
        else if (this.phase === 'idle') this.hud.setPrimaryEnabled(true);
      });
  }

  /** Ritorno in fase di puntata. */
  private toIdle(): void {
    this.phase = 'idle';
    this.cooldown = 0;
    this.barWrap.alpha = 0;
    this.hud.lockBet(false);
    this.hud.setPrimary(cs('fly'), { enabled: this.fairReady, variant: 'primary' });
    this.resetFlightVisuals();
    this.hud.message(this.autoCents > 0 ? cs('autoOn', { m: fmtMult(this.autoCents) }) : cs('placeBet'));
  }

  /**
   * A volo in corso non si chiede conferma: la conferma generica di
   * `GameScene` avvisa che "le puntate aperte sono perse", che qui sarebbe
   * falso — uscire incassa (vedi testata). Fuori dal volo vale la base.
   */
  async beforeExit(): Promise<boolean> {
    if (this.phase === 'flying' && this.roundActive) {
      this.resolvePending();
      return true;
    }
    return super.beforeExit();
  }

  protected resolvePending(): void {
    if (this.phase === 'flying') {
      // Decisione di prodotto: uscire a volo in corso INCASSA. Vedi testata.
      this.phase = 'over';
      this.finish(Math.floor((this.bet * this.cents) / 100));
    } else {
      // Volo gia' concluso ma non ancora saldato (non puo' succedere oggi,
      // perche' `finish` precede sempre `endFlight`): paga zero, non resta
      // nulla di deciso in favore del giocatore.
      this.finish(0);
    }
  }

  // ═══════════════════════════════════════════════ FOTOGRAMMA

  protected tick(dt: number, elapsed: number): void {
    if (this.phase === 'flying') {
      this.advanceFlight(dt);
    } else if (this.cooldown > 0) {
      this.cooldown -= dt;
      const total = settings().fastPlay ? COOLDOWN * 0.6 : COOLDOWN;
      this.barFill.width = 420 * Math.max(0, this.cooldown / total);
      if (this.cooldown <= 0) this.toIdle();
    }
    if (this.falcon.visible) this.animateFalcon(dt, elapsed);
  }

  private advanceFlight(dt: number): void {
    // fastPlay accelera la REGIA, non l'esito: il crash resta quello del seme.
    this.flightT += dt * (settings().fastPlay ? 1.55 : 1);
    const cents = multCentsAt(this.flightT);

    if (cents >= this.crashCents) {
      this.cents = this.crashCents;
      this.pushTrail();
      this.boom();
      return;
    }

    this.cents = cents;
    this.pushTrail();
    this.multText.text = `${fmtMult(cents)}×`;
    this.hud.setPrimary(cs('cashOut', { m: fmtMult(cents) }), { enabled: true, variant: 'danger' });
    this.drawCurve(PALETTE.gold.core);

    // Auto-incasso: la soglia va controllata DOPO lo schianto, mai prima —
    // un obiettivo oltre il punto di crash non deve poter pagare.
    if (this.autoCents > 0 && cents >= this.autoCents) {
      this.cashOut();
      return;
    }

    // Ticchettio: a cadenza fissa, non per fotogramma (a 120 fps sarebbe
    // un ronzio continuo) e mai con il movimento ridotto.
    this.emitSparks(dt);

    this.sfxAcc += dt;
    if (this.sfxAcc >= 0.16) {
      this.sfxAcc = 0;
      sfxCrashTick(cents / 100);
    }
  }

  private pushTrail(): void {
    this.trail.push([this.flightT, this.cents]);
    // Decimazione: oltre ~700 punti la polilinea costa piu' di quanto si
    // veda, perche' due punti consecutivi cadono sullo stesso pixel.
    if (this.trail.length > 700) this.trail = this.trail.filter((_, i) => i % 2 === 0 || i === this.trail.length - 1);
  }

  /** Scala automatica: la curva riempie sempre il pannello. */
  private plotScale(): { tMax: number; cMax: number } {
    return {
      tMax: Math.max(8, this.flightT * 1.08),
      cMax: Math.max(220, this.cents * 1.16),
    };
  }

  private drawCurve(tint: number): void {
    const { tMax, cMax } = this.plotScale();
    const px = (t: number) => PLOT.x0 + (t / tMax) * (PLOT.x1 - PLOT.x0);
    const py = (c: number) => PLOT.y0 - ((c - 100) / (cMax - 100)) * (PLOT.y0 - PLOT.y1);

    const g = this.curve;
    g.clear();
    if (this.trail.length < 2) {
      this.placeTip(px(0), py(100), 0);
      return;
    }

    const pts = this.trail.map(([t, c]) => [px(t), py(c)] as const);
    const last = pts[pts.length - 1]!;

    // Velo sotto la curva: l'area e' cio' che fa leggere "sale" a colpo
    // d'occhio, la linea da sola e' un filo.
    g.moveTo(pts[0]![0], PLOT.y0);
    for (const [x, y] of pts) g.lineTo(x, y);
    g.lineTo(last[0], PLOT.y0);
    g.closePath();
    g.fill({ color: tint, alpha: 0.16 });

    // Due passate: una larga e tenue (il bagliore), una sottile e piena.
    for (const [w, a] of [
      [11, 0.2],
      [4, 1],
    ] as const) {
      g.moveTo(pts[0]![0], pts[0]![1]);
      for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
      g.stroke({ color: tint, alpha: a, width: w, cap: 'round', join: 'round' });
    }

    const prev = pts[Math.max(0, pts.length - 6)]!;
    this.placeTip(last[0], last[1], Math.atan2(last[1] - prev[1], last[0] - prev[0]));
  }

  /** Fiche, alone e stella di luce sulla punta della curva. */
  private placeTip(x: number, y: number, slope: number): void {
    // La fiche poggia sulla punta, non la infilza: il centro sta mezzo
    // raggio sopra. Non si inclina con la curva — una moneta non ha un
    // "davanti" — rotola su se stessa (`animateFalcon`).
    this.falcon.position.set(x + 8, y - 34);
    void slope;
    this.tipGlow.position.set(x, y);
    this.tipFlare.position.set(x, y);
    if (this.phase === 'flying') {
      this.tipGlow.alpha = 0.75;
      this.tipFlare.alpha = Math.min(0.85, 0.25 + (this.cents - 100) / 2400);
    }
  }

  /**
   * La fiche rotola, sempre piu' veloce col moltiplicatore, e vibra quando
   * il volo si fa alto: la tensione si vede prima di leggerla nel numero.
   */
  private animateFalcon(dt: number, elapsed: number): void {
    if (settings().reducedMotion || this.phase !== 'flying') {
      this.falconBody.position.set(0, 0);
      return;
    }
    this.falconBody.rotation += dt * (2.4 + Math.min(7, (this.cents - 100) / 140));
    const k = 1 + Math.min(3, (this.cents - 100) / 500);
    this.falconBody.position.set(Math.sin(elapsed * 41) * k, Math.cos(elapsed * 37) * k);
  }

  /** Scintille d'oro che si staccano dalla fiche e ricadono dietro di lei. */
  private emitSparks(dt: number): void {
    if (settings().reducedMotion) return;
    this.sparkAcc += dt;
    const every = 0.04 / Math.max(0.25, this.quality.particleScale);
    while (this.sparkAcc >= every) {
      this.sparkAcc -= every;
      const s = new Sprite(glowTexture());
      s.anchor.set(0.5);
      const ox = this.falcon.x - 20 + (Math.random() - 0.5) * 30;
      const oy = this.falcon.y + 14 + (Math.random() - 0.5) * 30;
      s.position.set(ox, oy);
      s.tint = Math.random() < 0.5 ? PALETTE.gold.light : PALETTE.gold.core;
      s.scale.set(0.11 + Math.random() * 0.12);
      // Additiva: la scintilla e' luce, deve schiarire il cielo, non coprirlo.
      s.blendMode = 'add';
      s.alpha = 1;
      this.sparks.addChild(s);
      gsap.to(s, {
        x: ox - 50 - Math.random() * 90,
        y: oy + 30 + Math.random() * 70,
        alpha: 0,
        duration: 0.5 + Math.random() * 0.4,
        ease: 'power1.out',
        onComplete: () => {
          if (!s.destroyed) s.destroy();
        },
      });
      gsap.to(s.scale, { x: 0.01, y: 0.01, duration: 0.8, ease: 'power1.in' });
    }
  }

  private resetFlightVisuals(): void {
    this.trail = [[0, 100]];
    this.cents = 100;
    this.flightT = 0;
    this.curve.clear();
    this.multText.text = '1.00×';
    this.multText.style.fill = PALETTE.text.strong;
    this.statusText.text = cs('multiplier').toUpperCase();
    this.falcon.visible = true;
    this.falcon.alpha = 1;
    this.falcon.scale.set(0.6);
    this.falconBody.rotation = 0;
    this.sparkAcc = 0;
    for (const c of this.sparks.removeChildren()) {
      gsap.killTweensOf([c, c.scale]);
      c.destroy();
    }
    this.tipGlow.alpha = 0;
    this.tipFlare.alpha = 0;
    this.placeTip(PLOT.x0, PLOT.y0, 0);
  }

  /** La fiche va in pezzi: schegge d'oro con gravita'. */
  private spawnShards(): void {
    const n = settings().reducedMotion ? 0 : Math.round(18 * this.quality.particleScale);
    const ox = this.falcon.x;
    const oy = this.falcon.y;
    for (let i = 0; i < n; i++) {
      const s = new Sprite(shardTexture());
      s.anchor.set(0.5);
      s.position.set(ox, oy);
      s.rotation = Math.random() * Math.PI * 2;
      s.scale.set(0.6 + Math.random() * 0.8);
      this.shards.addChild(s);
      const a = Math.random() * Math.PI * 2;
      const v = 160 + Math.random() * 320;
      gsap.to(s, {
        x: ox + Math.cos(a) * v,
        y: oy + Math.sin(a) * v * 0.6 + 260,
        rotation: s.rotation + (Math.random() - 0.5) * 9,
        alpha: 0,
        duration: 0.9 + Math.random() * 0.5,
        ease: 'power2.in',
        onComplete: () => {
          if (!s.destroyed) s.destroy();
        },
      });
    }
  }

  protected get disposed(): boolean {
    return this.root.destroyed;
  }

  // ═══════════════════════════════════════════════ MODALE REGOLE

  protected rules(): Node {
    const info = gameById(this.gameId);
    const mono = { fontFamily: 'var(--font-ui)', wordBreak: 'break-all' as const, fontSize: '0.8rem' };

    // Tabella a due colonne con stili in linea: `.go-pay__lines` e' la
    // griglia stretta delle linee di pagamento delle slot, e un'impronta di
    // 64 cifre in una colonna da 96px diventa una colonna di caratteri.
    const grid = (): HTMLDivElement => {
      const d = div();
      Object.assign(d.style, {
        display: 'grid',
        gridTemplateColumns: 'minmax(170px, 230px) 1fr',
        gap: '6px 18px',
        alignItems: 'center',
        margin: '0.4em 0 0.8em',
      });
      return d;
    };
    const label = (text: string) =>
      el('strong', { text, style: { fontFamily: 'var(--font-serif)', color: 'var(--ivory)', fontSize: '0.84rem' } });
    const row = (k: string, value: string): Node[] => [label(k), el('span', { text: value, style: mono })];

    // Equita': l'impronta del volo CORRENTE e il seme dell'ultimo rivelato.
    // Mostrarli insieme e' il punto: l'uno e' una promessa, l'altro la prova
    // che la promessa precedente e' stata mantenuta.
    const fair = grid();
    fair.append(...row(cs('fairCommit'), this.dealer.serverHash || '—'));
    fair.append(...row(cs('fairNonce'), String(this.dealer.nonce)));

    const seedInput = el('input', {
      class: 'go-input',
      attrs: { type: 'text', maxlength: '64', value: this.dealer.clientSeed, 'aria-label': cs('fairClientSeed') },
      style: { width: '260px' },
    });
    const seedMsg = el('p', { class: 'go-pay__note' });
    fair.append(
      label(cs('fairClientSeed')),
      div(
        '',
        seedInput,
        button(cs('fairClientApply'), {
          variant: 'secondary',
          size: 'sm',
          onClick: () => {
            seedMsg.textContent = this.dealer.setClientSeed(seedInput.value)
              ? cs('fairClientOk')
              : cs('fairClientLocked');
          },
        })
      )
    );
    const seedRow = fair.lastElementChild as HTMLElement;
    Object.assign(seedRow.style, { display: 'flex', gap: '10px', alignItems: 'center' });

    const last: RevealedRound | null = this.dealer.last;
    const lastBox = grid();
    const verdict = el('p', { class: 'go-pay__note' });
    if (!last) {
      lastBox.append(el('p', { class: 'go-pay__note', text: cs('fairNone'), style: { gridColumn: '1 / -1' } }));
    } else {
      lastBox.append(...row(cs('fairSeed'), last.serverSeed));
      lastBox.append(...row(cs('fairCommit'), last.serverHash));
      lastBox.append(...row(cs('fairClientSeed'), last.clientSeed));
      lastBox.append(...row(cs('fairNonce'), String(last.nonce)));
      lastBox.append(...row(cs('fairCrash'), `×${fmtMult(last.crashCents)}`));
      lastBox.append(
        el('span'),
        button(cs('fairVerify'), {
          variant: 'primary',
          size: 'sm',
          onClick: () => {
            void verify(last.serverSeed, last.clientSeed, last.nonce, {
              hash: last.serverHash,
              crashCents: last.crashCents,
            }).then((v) => {
              verdict.textContent =
                v.hashOk && v.crashOk
                  ? cs('fairOk', { m: fmtMult(v.crashCents) })
                  : cs('fairBad', { hash: v.hash, crash: fmtMult(v.crashCents) });
            });
          },
        })
      );
    }

    return div(
      'go-pay',
      el('h3', { text: cs('rulesHow') }),
      el('p', { text: cs('rulesHow1') }),
      el('p', { text: cs('rulesHow2') }),
      el('p', { text: cs('rulesHow3') }),
      el('h3', { text: cs('rulesPays') }),
      el('p', { text: cs('rulesPays1') }),
      el('p', { text: cs('rulesPays2', { rtp: info.rtp.toFixed(1) }) }),
      el('h3', { text: cs('fairTitle') }),
      el('p', { text: cs('fairIntro') }),
      fair,
      seedMsg,
      el('h3', { text: cs('fairLast') }),
      lastBox,
      verdict,
      el('p', { class: 'go-pay__note', text: cs('fairFormula') })
    );
  }

  dispose(): void {
    // Il ticker e' gia' fermo, ma le schegge hanno tween propri che
    // scriverebbero su sprite distrutti al frame successivo.
    for (const s of this.shards.children) gsap.killTweensOf(s);
    super.dispose();
  }
}
