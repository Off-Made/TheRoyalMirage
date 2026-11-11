/**
 * THE ROYAL MIRAGE — Presentazione delle vincite
 *
 * Un'unica regia per tutti i giochi, cosi' una Mega Vincita alla roulette
 * "pesa" come una Mega Vincita alla slot.
 *
 *   · normale   → cifra che sale dal punto della vincita + scintille
 *   · big+      → sipario scuro, raggiera che ruota, titolo che esplode,
 *                 contatore che sale con ticchettio, pioggia di monete,
 *                 scossa. Durata crescente col livello.
 *
 * `present()` restituisce una Promise che si risolve a sequenza finita.
 * `skip()` (o un click sul canvas) la porta subito al valore finale: chi
 * gioca veloce non deve mai essere ostaggio di un'animazione.
 */

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import { gsap } from 'gsap';
import { DESIGN_HEIGHT, DESIGN_WIDTH, game } from '@/core/App';
import { bake } from '@/art/textureCache';
import { PALETTE, WIN_TIER_COLOR, rgba } from '@/art/palette';
import { classifyWin, formatMoney, type WinTierName } from '@/state/wallet';
import { settings } from '@/state/store';
import { profileFor } from '@/state/settings';
import { t, type TranslationKey } from '@/i18n';
import { sfxTick, sfxWin, sfxJackpot, sfxCoin } from '@/audio/synth';
import { Emitter, coinRainEmitter, sparkBurstEmitter } from '@/fx/ParticleSystem';
import { makeText } from './text';

const TIER_INDEX: Record<WinTierName, number> = { normal: 0, big: 1, mega: 2, epic: 3, legendary: 4 };
/** Secondi di conteggio per livello. */
// Accorciati di ~40% su richiesta del committente ("troppo lento"): la
// festa resta, ma non trattiene il giocatore.
const COUNT_TIME: Record<WinTierName, number> = { normal: 0.6, big: 1.4, mega: 2.0, epic: 2.8, legendary: 3.8 };

export interface PresentOptions {
  /** Punto di partenza della cifra flottante (vincite normali). */
  x?: number;
  y?: number;
  /** Titolo forzato (es. "JACKPOT GRAND"), al posto di quello del livello. */
  title?: string;
  /** Forza la sequenza grande anche sotto la soglia (jackpot, fine free spin). */
  forceBig?: boolean;
  /** Forza la presentazione breve: seguira' una funzione che celebrera' il totale. */
  small?: boolean;
}

function sunburst() {
  return bake('fx/sunburst', 512, 512, (ctx, w) => {
    const c = w / 2;
    const rays = 24;
    for (let i = 0; i < rays; i++) {
      const a0 = (i / rays) * Math.PI * 2;
      const a1 = a0 + (Math.PI * 2) / rays / 2;
      const g = ctx.createRadialGradient(c, c, 0, c, c, c);
      g.addColorStop(0, rgba(PALETTE.gold.hot, 0.55));
      g.addColorStop(0.4, rgba(PALETTE.gold.core, 0.22));
      g.addColorStop(1, rgba(PALETTE.gold.deep, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, c, a0, a1);
      ctx.closePath();
      ctx.fill();
    }
    const core = ctx.createRadialGradient(c, c, 0, c, c, c * 0.5);
    core.addColorStop(0, rgba(PALETTE.gold.hot, 0.7));
    core.addColorStop(1, rgba(PALETTE.gold.core, 0));
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, w, w);
  });
}

export class WinPresenter extends Container {
  private emitters: Emitter[] = [];
  private coins: Emitter;
  private active: { finish: () => void } | null = null;
  private coinRate = 0;
  private coinAcc = 0;

  constructor(private shake: (amp: number, dur: number) => void) {
    super();
    this.label = 'win-presenter';
    this.coins = coinRainEmitter(DESIGN_WIDTH);
    this.addChild(this.coins);
  }

  private get profile() {
    return profileFor(settings());
  }

  get busy(): boolean {
    return this.active !== null;
  }

  /** Porta la presentazione in corso al termine. */
  skip(): void {
    this.active?.finish();
  }

  update(dt: number): void {
    if (this.coinRate > 0) {
      this.coinAcc += dt * this.coinRate;
      const n = Math.floor(this.coinAcc);
      if (n > 0) {
        this.coins.burst(n);
        this.coinAcc -= n;
      }
    }
    this.coins.update(dt);
    for (const e of this.emitters) e.update(dt);
  }

  /** Scintille in un punto, utili anche fuori dalla sequenza di vincita. */
  sparks(x: number, y: number, count = 40, tint = PALETTE.gold.hot as number): void {
    const n = Math.round(count * this.profile.particleScale);
    if (n <= 0) return;
    const e = sparkBurstEmitter(x, y, tint);
    this.addChild(e);
    this.emitters.push(e);
    e.burst(n);
    // Gli emettitori a burst si smontano da soli dopo la vita massima.
    setTimeout(() => {
      this.emitters = this.emitters.filter((x) => x !== e);
      e.destroy({ children: true });
    }, 1400);
  }

  async present(payout: number, bet: number, opts: PresentOptions = {}): Promise<void> {
    if (payout <= 0) return;
    this.skip();
    const tier = opts.forceBig && classifyWin(payout, bet) === 'normal' ? 'big' : classifyWin(payout, bet);
    if (tier === 'normal' || opts.small || settings().fastPlay) return this.small(payout, opts, opts.small ? 'normal' : tier);
    return this.big(payout, tier, opts);
  }

  // ─────────────────────────────────────────────── VINCITA NORMALE

  private small(payout: number, opts: PresentOptions, tier: WinTierName): Promise<void> {
    const x = opts.x ?? DESIGN_WIDTH / 2;
    const y = opts.y ?? DESIGN_HEIGHT * 0.45;
    sfxWin(TIER_INDEX[tier]);
    this.sparks(x, y, 36, WIN_TIER_COLOR[tier] as number);

    const label = makeText(`+${formatMoney(payout)}`, 'numeric', 72);
    label.position.set(x, y);
    label.scale.set(0.4);
    this.addChild(label);

    return new Promise((resolve) => {
      const tl = gsap.timeline({
        onComplete: () => {
          label.destroy();
          this.active = null;
          resolve();
        },
      });
      tl.to(label.scale, { x: 1, y: 1, duration: 0.25, ease: 'back.out(2.4)' })
        .to(label, { y: y - 80, duration: 0.75, ease: 'power2.out' }, 0)
        .to(label, { alpha: 0, duration: 0.25 }, 0.5);
      this.active = { finish: () => tl.progress(1) };
    });
  }

  // ─────────────────────────────────────────────── VINCITA GRANDE

  private big(payout: number, tier: WinTierName, opts: PresentOptions): Promise<void> {
    const idx = TIER_INDEX[tier];
    const color = WIN_TIER_COLOR[tier];
    const motion = !settings().reducedMotion;
    const cx = DESIGN_WIDTH / 2;
    const cy = DESIGN_HEIGHT * 0.44;

    const layer = new Container();
    this.addChildAt(layer, 0);
    // Bloom solo qui e solo sui preset alti: e' il filtro piu' caro, ma per
    // i pochi secondi di una Mega Vincita fa brillare l'oro come metallo vero.
    if (this.profile.bloom) {
      layer.filters = [new AdvancedBloomFilter({ threshold: 0.55, bloomScale: 0.9, brightness: 1, blur: 6, quality: 4 })];
    }

    const sr = game.screenRect;
    const veil = new Graphics().rect(sr.x, sr.y, sr.width, sr.height).fill({ color: PALETTE.plum.abyss, alpha: 0.52 });
    veil.alpha = 0;
    veil.eventMode = 'static';
    veil.cursor = 'pointer';
    layer.addChild(veil);

    const rays = new Sprite(sunburst());
    rays.anchor.set(0.5);
    rays.position.set(cx, cy);
    rays.width = rays.height = 1500;
    rays.tint = color;
    rays.blendMode = 'add';
    rays.alpha = 0;
    layer.addChild(rays);

    const rays2 = new Sprite(sunburst());
    rays2.anchor.set(0.5);
    rays2.position.set(cx, cy);
    rays2.width = rays2.height = 1000;
    rays2.blendMode = 'add';
    rays2.alpha = 0;
    layer.addChild(rays2);

    const title = makeText(opts.title ?? t(`win.${tier}` as TranslationKey), 'title', 120 + idx * 12);
    title.position.set(cx, cy - 110);
    title.scale.set(0);
    layer.addChild(title);

    const amount: Text = makeText('0', 'numeric', 150);
    amount.position.set(cx, cy + 70);
    amount.alpha = 0;
    layer.addChild(amount);

    const hint = makeText(t('win.collect'), 'label', 22, { fill: PALETTE.text.strong });
    hint.position.set(cx, cy + 210);
    hint.alpha = 0;
    layer.addChild(hint);

    if (idx >= 3) sfxJackpot();
    else sfxWin(idx + 1);
    if (motion) this.shake(6 + idx * 5, 0.5 + idx * 0.15);
    this.coinRate = (40 + idx * 45) * this.profile.particleScale;
    this.sparks(cx, cy - 110, 70 + idx * 30, color);

    const counter = { v: 0 };
    let lastTick = 0;
    const duration = COUNT_TIME[tier];

    return new Promise((resolve) => {
      let finished = false;
      const tl = gsap.timeline();
      tl.to(veil, { alpha: 1, duration: 0.3 }, 0)
        .to([rays, rays2], { alpha: 0.9, duration: 0.5 }, 0)
        .to(title.scale, { x: 1, y: 1, duration: 0.7, ease: 'back.out(2.2)' }, 0.05)
        .to(amount, { alpha: 1, duration: 0.3 }, 0.25)
        .to(
          counter,
          {
            v: payout,
            duration,
            ease: 'power1.out',
            onUpdate: () => {
              amount.text = formatMoney(counter.v);
              const now = performance.now();
              if (now - lastTick > 65) {
                lastTick = now;
                sfxTick(counter.v / payout);
                if (Math.random() < 0.3) sfxCoin();
              }
            },
          },
          0.3
        )
        .to(hint, { alpha: 0.7, duration: 0.4 }, 0.8);

      // Respiro del titolo e rotazione dei raggi: vivono finche' la sequenza e' a schermo.
      const pulse = gsap.to(title.scale, { x: 1.06, y: 1.06, duration: 0.55, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 0.75 });
      const spin = gsap.to(rays, { rotation: Math.PI * 2, duration: 22, repeat: -1, ease: 'none' });
      const spin2 = gsap.to(rays2, { rotation: -Math.PI * 2, duration: 30, repeat: -1, ease: 'none' });

      const close = () => {
        this.coinRate = 0;
        if (layer.destroyed) return resolve();
        gsap.timeline({
          onComplete: () => {
            pulse.kill();
            spin.kill();
            spin2.kill();
            layer.destroy({ children: true });
            resolve();
          },
        }).to(layer, { alpha: 0, duration: 0.3, ease: 'power2.in' });
      };

      const finish = () => {
        if (finished) return;
        finished = true;
        this.active = null;
        if (layer.destroyed) return resolve();
        tl.progress(1);
        amount.text = formatMoney(payout);
        gsap.fromTo(amount.scale, { x: 1.18, y: 1.18 }, { x: 1, y: 1, duration: 0.4, ease: 'back.out(3)' });
        gsap.delayedCall(0.6, close);
      };

      // Fine naturale: mantiene la cifra piena un istante prima di chiudere.
      tl.eventCallback('onComplete', () => {
        gsap.delayedCall(0.7, finish);
      });
      veil.on('pointerdown', finish);
      this.active = { finish };
    });
  }
}
