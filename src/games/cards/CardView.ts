/**
 * THE ROYAL MIRAGE — Vista di una carta
 *
 *   CardView (Container, origine al centro della carta)
 *   ├─ shadow   ombra morbida, si allontana quando la carta "si alza"
 *   └─ body     la carta vera e propria (scala X = rotazione sul lato lungo)
 *       ├─ glow   alone d'oro (carte vincenti / tenute), spento di norma
 *       └─ face   sprite con la faccia o il dorso
 *
 * ── Il volo dal sabot ──
 * Una carta distribuita non va in linea retta: il mazziere la fa scivolare
 * con un arco basso, ruotandola leggermente, e la carta "atterra" con un
 * piccolo assestamento. Qui la traiettoria e' una Bezier quadratica con il
 * punto di controllo sollevato sopra la congiungente; la rotazione passa
 * dall'angolo del sabot a un angolo finale quasi dritto (un grado o due di
 * imperfezione: le carte perfettamente allineate sembrano finte).
 *
 * ── Il giro ──
 * Una vera rotazione 3D non serve: comprimendo `body.scale.x` fino a zero,
 * cambiando texture a meta' e riaprendo, l'occhio legge un giro sul lato
 * lungo. Durante il giro la carta si solleva (scala +6%) e l'ombra si
 * allontana, che e' cio' che vende la terza dimensione.
 */

import { Container, Sprite } from 'pixi.js';
import { gsap } from 'gsap';
import { settings } from '@/state/store';
import type { Card } from './card';
import { CARD_W, cardBackTexture, cardGlowTexture, cardShadowTexture, cardTexture } from './art';

export interface DealOptions {
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Durata del volo in secondi. */
  duration?: number;
  delay?: number;
  /** Rotazione finale in radianti (default: piccola imperfezione casuale). */
  rotation?: number;
  /** Gira la carta all'arrivo. */
  flip?: boolean;
  /** Altezza dell'arco in px di design (negativo = verso l'alto). */
  arc?: number;
}

export class CardView extends Container {
  readonly shadow: Sprite;
  readonly body = new Container();
  readonly face: Sprite;
  readonly glow: Sprite;
  private faceUp = false;
  private lift = 0;

  constructor(
    public card: Card | null,
    opts: { width?: number; faceUp?: boolean } = {}
  ) {
    super();
    this.shadow = new Sprite(cardShadowTexture());
    this.shadow.anchor.set(0.5);
    this.shadow.alpha = 0.55;
    this.glow = new Sprite(cardGlowTexture());
    this.glow.anchor.set(0.5);
    this.glow.alpha = 0;
    this.glow.visible = false;
    this.face = new Sprite(cardBackTexture());
    this.face.anchor.set(0.5);
    this.body.addChild(this.glow, this.face);
    this.addChild(this.shadow, this.body);
    this.scale.set((opts.width ?? CARD_W) / CARD_W);
    if (opts.faceUp && card) this.showFace(true);
    this.setLift(0);
  }

  get isFaceUp(): boolean {
    return this.faceUp;
  }

  /** Imposta subito faccia o dorso, senza animazione. */
  showFace(up: boolean): void {
    if (this.destroyed) return;
    this.faceUp = up && this.card !== null;
    this.face.texture = this.faceUp ? cardTexture(this.card!) : cardBackTexture();
  }

  setCard(c: Card | null): void {
    this.card = c;
    if (this.faceUp) this.showFace(true);
  }

  /** 0 = posata sul feltro, 1 = sollevata (in volo / in giro). */
  setLift(k: number): void {
    if (this.destroyed) return;
    this.lift = k;
    this.shadow.position.set(4 + k * 14, 6 + k * 22);
    this.shadow.alpha = 0.55 - k * 0.2;
    this.shadow.scale.set(1 + k * 0.04);
  }

  /** Alone d'oro on/off (carte vincenti, carte tenute nel video poker). */
  setGlow(on: boolean, animate = true): void {
    gsap.killTweensOf(this.glow);
    if (on) this.glow.visible = true;
    if (!animate) {
      this.glow.alpha = on ? 1 : 0;
      this.glow.visible = on;
      return;
    }
    gsap.to(this.glow, {
      alpha: on ? 1 : 0,
      duration: 0.25,
      onComplete: () => {
        if (!on) this.glow.visible = false;
      },
    });
  }

  private get fast(): number {
    return settings().fastPlay ? 0.55 : 1;
  }

  /** Gira la carta. Risolve a giro finito. */
  flip(up = !this.faceUp, duration = 0.34): Promise<void> {
    const d = duration * this.fast;
    if (up === this.faceUp) return Promise.resolve();
    return new Promise((resolve) => {
      const proxy = { k: 0 };
      gsap.killTweensOf(this.body.scale);
      const tl = gsap.timeline({ onComplete: () => resolve() });
      tl.to(this.body.scale, { x: 0, y: 1.06, duration: d / 2, ease: 'power2.in' });
      tl.to(proxy, { k: 1, duration: d / 2, ease: 'power2.in', onUpdate: () => this.setLift(Math.max(this.lift, proxy.k * 0.6)) }, 0);
      tl.call(() => this.showFace(up));
      tl.to(this.body.scale, { x: 1, y: 1, duration: d / 2, ease: 'power2.out' });
      tl.to(proxy, { k: 0, duration: d / 2, ease: 'power2.out', onUpdate: () => this.setLift(proxy.k * 0.6) }, '<');
    });
  }

  /** Volo dal sabot alla posizione sul tavolo, con giro opzionale all'arrivo. */
  deal(o: DealOptions): Promise<void> {
    const dur = (o.duration ?? 0.5) * this.fast;
    const finalRot = o.rotation ?? (Math.random() - 0.5) * 0.05;
    const startRot = this.rotation;
    const startScale = this.scale.x;
    const arc = o.arc ?? -70;
    const cx = (o.from.x + o.to.x) / 2;
    const cy = Math.min(o.from.y, o.to.y) + arc;
    this.position.set(o.from.x, o.from.y);
    this.setLift(1);
    return new Promise((resolve) => {
      const p = { t: 0 };
      gsap.to(p, {
        t: 1,
        duration: dur,
        delay: (o.delay ?? 0) * this.fast,
        ease: 'power2.out',
        onUpdate: () => {
          if (this.destroyed) return;
          const t = p.t;
          const u = 1 - t;
          this.x = u * u * o.from.x + 2 * u * t * cx + t * t * o.to.x;
          this.y = u * u * o.from.y + 2 * u * t * cy + t * t * o.to.y;
          // Rotazione: un mezzo giro "di polso" che si esaurisce all'arrivo.
          this.rotation = startRot + (finalRot - startRot) * t + Math.sin(t * Math.PI) * 0.25;
          // La carta parte un po' piu' piccola (lontana, nel sabot) e cresce.
          this.scale.set(startScale * (0.82 + 0.18 * t));
          this.setLift(1 - t * t);
        },
        onComplete: () => {
          if (this.destroyed) return resolve();
          this.setLift(0);
          if (o.flip && this.card) void this.flip(true).then(resolve);
          else resolve();
        },
      });
    });
  }

  /** Scivola via verso un punto (raccolta delle carte a fine mano). */
  sweep(to: { x: number; y: number }, delay = 0, duration = 0.45): Promise<void> {
    return new Promise((resolve) => {
      gsap.to(this, {
        x: to.x,
        y: to.y,
        rotation: this.rotation + 0.4,
        alpha: 0,
        delay: delay * this.fast,
        duration: duration * this.fast,
        ease: 'power2.in',
        onStart: () => this.setLift(0.6),
        onComplete: () => resolve(),
      });
    });
  }

  destroy(options?: Parameters<Container['destroy']>[0]): void {
    gsap.killTweensOf(this);
    gsap.killTweensOf(this.body.scale);
    gsap.killTweensOf(this.glow);
    gsap.killTweensOf(this.scale);
    super.destroy(options ?? { children: true });
  }
}
