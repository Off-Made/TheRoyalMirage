/**
 * THE ROYAL MIRAGE — Il cilindro, cotto in texture
 *
 * ── Il falso onesto della vista di tre quarti ──
 * Una ruota vista di tre quarti sarebbe una proiezione prospettica: le
 * caselle vicine piu' alte di quelle lontane, i numeri ruotati nello spazio.
 * Costa un renderer 3D e non serve. Qui la ruota e' disegnata DALL'ALTO,
 * circolare, e messa in un contenitore con `scale.y = WHEEL_SQUASH`: un
 * cerchio diventa un'ellisse con rapporto costante, e un cerchio che ruota
 * resta la stessa ellisse. E' questo che rende il trucco invisibile — una
 * prospettiva vera, sbagliata di un grado, si noterebbe subito; un'ellisse
 * coerente non ha nulla da tradire.
 *
 * Conseguenza voluta: i numeri sul rotore sono compressi in verticale,
 * esattamente come su una ruota vera inquadrata di lato.
 *
 * ── Come si divide il lavoro ──
 *   `rotorTexture()`  le 37 caselle, i diaframmi, il cono, il mozzo: GIRA.
 *   `bowlTexture()`   il catino, la gola della pallina, i deflettori: FERMO.
 *   `ballTexture()`   la pallina, in un livello non schiacciato (una
 *                     pallina schiacciata e' una lenticchia).
 *
 * I raggi vengono da `spin.ts`, che li usa per la traiettoria: ancora una
 * volta disegno e matematica leggono le stesse costanti.
 */

import { Container, Sprite, type Texture } from 'pixi.js';
import { bake } from '@/art/textureCache';
import { PALETTE, css, rgba } from '@/art/palette';
import { type Ctx, clearGlow, goldFill, metalRamp, setGlow } from '@/art/materials';
import { FONT_STACK } from '@/core/fonts';
import { POCKETS, WHEEL_ORDER, colorOf } from './rules';
import {
  APRON_R,
  BOWL_R,
  DEFLECTOR_ANGLES,
  DEFLECTOR_R,
  POCKET_ARC,
  POCKET_R,
  ROTOR_R,
  TRACK_R,
  pocketAngle,
} from './spin';
import { POCKET_FILL } from './tableArt';

/** Rapporto ry/rx della vista. 1 = dall'alto, 0 = di profilo. */
export const WHEEL_SQUASH = 0.56;

const TAU = Math.PI * 2;
/** Lato della texture: il catino piu' il margine per l'ombra esterna. */
const SIZE = Math.ceil(BOWL_R * 2 + 48);
const C = SIZE / 2;

function brass(ctx: Ctx, x: number, y: number, w: number, h: number, polish = 0.8): CanvasGradient {
  const r = Math.hypot(w, h) / 2;
  const g = ctx.createLinearGradient(x + w / 2, y + h / 2 - r, x + w / 2, y + h / 2 + r);
  metalRamp(g, PALETTE.gold, polish);
  return g;
}

function ring(ctx: Ctx, r: number, width: number, stroke: string | CanvasGradient): void {
  ctx.beginPath();
  ctx.arc(C, C, r, 0, TAU);
  ctx.lineWidth = width;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

// ─────────────────────────────────────────────── ROTORE

export function drawRotor(ctx: Ctx): void {
  // Anello delle caselle: fondo scuro, poi ogni casella come settore.
  ctx.save();
  setGlow(ctx, PALETTE.plum.abyss, 20, 0.385);
  ctx.beginPath();
  ctx.arc(C, C, ROTOR_R, 0, TAU);
  ctx.fillStyle = css(PALETTE.plum.abyss);
  ctx.fill();
  clearGlow(ctx);
  ctx.restore();

  const rOut = ROTOR_R - 6;
  const rIn = POCKET_R - 26;

  for (let i = 0; i < POCKETS; i++) {
    const n = WHEEL_ORDER[i]!;
    const a = pocketAngle(i);
    const a0 = a - POCKET_ARC / 2;
    const a1 = a + POCKET_ARC / 2;

    ctx.beginPath();
    ctx.arc(C, C, rOut, a0, a1);
    ctx.arc(C, C, rIn, a1, a0, true);
    ctx.closePath();
    // Gradiente radiale per casella: il fondo della casella e' in ombra,
    // il bordo esterno prende la luce. E' questo che da' profondita'.
    const g = ctx.createRadialGradient(C, C, rIn, C, C, rOut);
    const fill = POCKET_FILL[colorOf(n)];
    g.addColorStop(0, fill.bottom);
    g.addColorStop(0.65, fill.top);
    g.addColorStop(1, fill.bottom);
    ctx.fillStyle = g;
    ctx.fill();

    // Numero, disposto radialmente con la testa verso il centro.
    ctx.save();
    ctx.translate(C + Math.cos(a) * (POCKET_R + 22), C + Math.sin(a) * (POCKET_R + 22));
    ctx.rotate(a + Math.PI / 2);
    ctx.font = `800 ${n > 9 ? 27 : 30}px ${FONT_STACK.ui}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(PALETTE.plum.abyss, 0.42);
    ctx.fillText(String(n), 0, 1.5);
    ctx.fillStyle = css(PALETTE.text.strong);
    ctx.fillText(String(n), 0, 0);
    ctx.restore();
  }

  // Diaframmi: le lamelle d'ottone fra due caselle. Vanno DOPO i
  // riempimenti, perche' e' il bordo illuminato a separare le caselle.
  for (let i = 0; i < POCKETS; i++) {
    const a = pocketAngle(i) - POCKET_ARC / 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(C + cos * rIn, C + sin * rIn);
    ctx.lineTo(C + cos * rOut, C + sin * rOut);
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = rgba(PALETTE.plum.abyss, 0.36);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(C + cos * rIn, C + sin * rIn);
    ctx.lineTo(C + cos * rOut, C + sin * rOut);
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = rgba(PALETTE.gold.light, 0.85);
    ctx.stroke();
  }
  ring(ctx, rOut, 3, brass(ctx, C - rOut, C - rOut, rOut * 2, rOut * 2, 1));
  ring(ctx, rIn, 2.5, brass(ctx, C - rIn, C - rIn, rIn * 2, rIn * 2, 0.6));

  // Cono centrale: la cupola di legno lucido che spinge la pallina fuori.
  const coneR = rIn;
  const cone = ctx.createRadialGradient(C - coneR * 0.3, C - coneR * 0.35, 0, C, C, coneR);
  cone.addColorStop(0, css(PALETTE.leather.light));
  cone.addColorStop(0.55, css(PALETTE.leather.core));
  cone.addColorStop(1, css(PALETTE.leather.deep));
  ctx.beginPath();
  ctx.arc(C, C, coneR, 0, TAU);
  ctx.fillStyle = cone;
  ctx.fill();

  // Otto costoloni d'ottone sul cono: danno il senso di rotazione anche
  // quando la ruota e' quasi ferma (senza, un disco liscio sembra immobile).
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(C, C);
    ctx.lineTo(C + Math.cos(a) * coneR, C + Math.sin(a) * coneR);
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(PALETTE.gold.mid, 0.5);
    ctx.stroke();
    ctx.restore();
  }

  // Mozzo in ottone: tre corone, una torretta e la stella del casino.
  const hub = coneR * 0.52;
  ctx.save();
  setGlow(ctx, PALETTE.plum.abyss, 16, 0.385);
  ctx.beginPath();
  ctx.arc(C, C, hub, 0, TAU);
  ctx.fillStyle = brass(ctx, C - hub, C - hub, hub * 2, hub * 2, 0.9);
  ctx.fill();
  clearGlow(ctx);
  ctx.restore();
  ring(ctx, hub, 3, rgba(PALETTE.plum.abyss, 0.3));
  ring(ctx, hub * 0.72, 2, rgba(PALETTE.gold.light, 0.8));
  ctx.beginPath();
  ctx.arc(C, C, hub * 0.46, 0, TAU);
  ctx.fillStyle = brass(ctx, C - hub * 0.46, C - hub * 0.46, hub * 0.92, hub * 0.92, 1);
  ctx.fill();
  // Punta superiore del mozzo: un riflesso quasi bianco fuori centro.
  const spec = ctx.createRadialGradient(C - hub * 0.2, C - hub * 0.25, 0, C, C, hub * 0.5);
  spec.addColorStop(0, rgba(PALETTE.gold.hot, 0.85));
  spec.addColorStop(1, rgba(PALETTE.gold.hot, 0));
  ctx.fillStyle = spec;
  ctx.beginPath();
  ctx.arc(C, C, hub * 0.5, 0, TAU);
  ctx.fill();
}

export function rotorTexture(): Texture {
  return bake('roulette/rotor', SIZE, SIZE, (ctx) => drawRotor(ctx));
}

// ─────────────────────────────────────────────── CATINO

export function drawBowl(ctx: Ctx): void {
  // Sponda esterna in noce lucido.
  ctx.save();
  setGlow(ctx, PALETTE.plum.abyss, 34, 0.495);
  ctx.beginPath();
  ctx.arc(C, C, BOWL_R, 0, TAU);
  const wood = ctx.createRadialGradient(C - BOWL_R * 0.3, C - BOWL_R * 0.4, BOWL_R * 0.2, C, C, BOWL_R);
  wood.addColorStop(0, css(PALETTE.leather.light));
  wood.addColorStop(0.6, css(PALETTE.leather.core));
  // Mogano caldo fino al bordo: il catino quasi nero della versione
  // notturna era la massa piu' scura della schermata.
  wood.addColorStop(1, css(PALETTE.leather.deep));
  ctx.fillStyle = wood;
  ctx.fill();
  clearGlow(ctx);
  ctx.restore();
  ring(ctx, BOWL_R - 2, 4, goldFill(ctx, C - BOWL_R, C - BOWL_R, BOWL_R * 2, BOWL_R * 2, { polish: 0.9 }));

  // Gola della pallina: una fascia incavata fra due filetti d'ottone.
  ctx.beginPath();
  ctx.arc(C, C, TRACK_R + 15, 0, TAU);
  ctx.arc(C, C, TRACK_R - 15, TAU, 0, true);
  const groove = ctx.createRadialGradient(C, C, TRACK_R - 15, C, C, TRACK_R + 15);
  groove.addColorStop(0, css(PALETTE.leather.deep));
  groove.addColorStop(0.5, css(PALETTE.leather.light));
  groove.addColorStop(1, css(PALETTE.leather.deep));
  ctx.fillStyle = groove;
  ctx.fill();
  ring(ctx, TRACK_R + 15, 2, rgba(PALETTE.gold.mid, 0.7));
  ring(ctx, TRACK_R - 15, 2, rgba(PALETTE.gold.light, 0.5));

  // Scivolo dalla gola al rotore, in ombra verso il basso.
  ctx.beginPath();
  ctx.arc(C, C, TRACK_R - 15, 0, TAU);
  ctx.arc(C, C, APRON_R - 10, TAU, 0, true);
  const apron = ctx.createRadialGradient(C, C, APRON_R - 10, C, C, TRACK_R - 15);
  apron.addColorStop(0, css(PALETTE.leather.core));
  apron.addColorStop(1, css(PALETTE.leather.light));
  ctx.fillStyle = apron;
  ctx.fill();

  // Deflettori ("canoe"): rombi d'ottone sporgenti. La pallina li colpisce,
  // e il suono del tick e' agganciato a questi angoli in `RouletteScene`.
  for (const a of DEFLECTOR_ANGLES) {
    const x = C + Math.cos(a) * DEFLECTOR_R;
    const y = C + Math.sin(a) * DEFLECTOR_R;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    setGlow(ctx, PALETTE.plum.abyss, 8, 0.44);
    ctx.beginPath();
    ctx.moveTo(-20, 0);
    ctx.lineTo(0, -8);
    ctx.lineTo(20, 0);
    ctx.lineTo(0, 8);
    ctx.closePath();
    ctx.fillStyle = brass(ctx, -20, -8, 40, 16, 1);
    ctx.fill();
    clearGlow(ctx);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = rgba(PALETTE.plum.abyss, 0.33);
    ctx.stroke();
    ctx.restore();
  }

  // Buco centrale: il rotore sta sotto, il catino non lo deve coprire.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(C, C, APRON_R - 10, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function bowlTexture(): Texture {
  return bake('roulette/bowl', SIZE, SIZE, (ctx) => drawBowl(ctx));
}

/**
 * Velo d'ombra sopra al cilindro: la meta' lontana piu' scura. E' il
 * dettaglio che fa leggere l'ellisse come "inclinata" e non come "ovale".
 */
export function shadeTexture(): Texture {
  return bake(
    'roulette/wheelShade',
    SIZE,
    SIZE,
    (ctx) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(C, C, BOWL_R, 0, TAU);
      ctx.clip();
      const g = ctx.createLinearGradient(0, C - BOWL_R, 0, C + BOWL_R);
      g.addColorStop(0, rgba(PALETTE.plum.abyss, 0.3));
      g.addColorStop(0.45, rgba(PALETTE.plum.abyss, 0.036));
      g.addColorStop(0.75, rgba(PALETTE.gold.hot, 0.05));
      g.addColorStop(1, rgba(PALETTE.plum.abyss, 0.132));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.restore();
    },
    { res: 1 }
  );
}

export const BALL_R = 13;

export function ballTexture(): Texture {
  const s = BALL_R * 2 + 10;
  return bake('roulette/ball', s, s, (ctx) => {
    const c = s / 2;
    ctx.save();
    setGlow(ctx, PALETTE.plum.abyss, 7, 0.44);
    ctx.beginPath();
    ctx.arc(c, c + 1.5, BALL_R, 0, TAU);
    ctx.fillStyle = css(PALETTE.plum.abyss);
    ctx.fill();
    clearGlow(ctx);
    ctx.restore();
    const g = ctx.createRadialGradient(c - BALL_R * 0.35, c - BALL_R * 0.45, 0, c, c, BALL_R);
    g.addColorStop(0, css(PALETTE.white));
    g.addColorStop(0.45, css(PALETTE.card.face));
    g.addColorStop(0.85, css(PALETTE.card.edge));
    g.addColorStop(1, css(PALETTE.plum.mist));
    ctx.beginPath();
    ctx.arc(c, c, BALL_R, 0, TAU);
    ctx.fillStyle = g;
    ctx.fill();
    // Riflesso speculare: una pallina d'avorio ha un punto di luce netto.
    ctx.beginPath();
    ctx.ellipse(c - BALL_R * 0.33, c - BALL_R * 0.4, BALL_R * 0.26, BALL_R * 0.18, -0.6, 0, TAU);
    ctx.fillStyle = rgba(PALETTE.white, 0.95);
    ctx.fill();
  });
}

// ─────────────────────────────────────────────── VISTA

/**
 * Il cilindro completo, pronto da aggiungere al mondo.
 *
 * Gerarchia: un contenitore schiacciato tiene rotore e catino (cerchi che
 * diventano ellissi), mentre la pallina sta in un livello NON schiacciato e
 * riceve la posizione gia' proiettata. Cosi' la pallina resta rotonda su
 * un'orbita ellittica, che e' esattamente quello che si vede al tavolo.
 */
export class WheelView extends Container {
  private readonly rotor: Sprite;
  private readonly ball: Sprite;
  private readonly squashed = new Container();
  /** Angolo corrente del rotore, in radianti. */
  rotorAngle = 0;

  constructor() {
    super();
    this.squashed.scale.set(1, WHEEL_SQUASH);
    this.addChild(this.squashed);

    this.rotor = new Sprite(rotorTexture());
    this.rotor.anchor.set(0.5);
    const bowl = new Sprite(bowlTexture());
    bowl.anchor.set(0.5);
    const shade = new Sprite(shadeTexture());
    shade.anchor.set(0.5);
    this.squashed.addChild(this.rotor, bowl, shade);

    this.ball = new Sprite(ballTexture());
    this.ball.anchor.set(0.5);
    this.ball.visible = false;
    this.addChild(this.ball);
  }

  /** Mezza altezza occupata sullo schermo: serve a comporre la scena. */
  static get halfHeight(): number {
    return BOWL_R * WHEEL_SQUASH;
  }

  static get halfWidth(): number {
    return BOWL_R;
  }

  setRotor(angle: number): void {
    this.rotorAngle = angle;
    this.rotor.rotation = angle;
  }

  /** Posiziona la pallina su (angolo, raggio) dello spazio circolare. */
  setBall(angle: number, radius: number): void {
    this.ball.visible = true;
    this.ball.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * WHEEL_SQUASH);
    // La pallina sul lato lontano e' piu' piccola e piu' spenta: due pixel
    // di prospettiva che costano una moltiplicazione.
    const depth = 0.86 + 0.14 * (Math.sin(angle) + 1);
    this.ball.scale.set(depth);
    this.ball.alpha = 0.72 + 0.28 * depth;
  }

  hideBall(): void {
    this.ball.visible = false;
  }

  /** Punto nel mondo della scena di (angolo, raggio): per scintille e aloni. */
  pointAt(angle: number, radius: number): { x: number; y: number } {
    return { x: this.x + Math.cos(angle) * radius, y: this.y + Math.sin(angle) * radius * WHEEL_SQUASH };
  }

  /** Centro sullo schermo della casella del numero `n`, per evidenziarlo. */
  pocketPoint(indexAngle: number): { x: number; y: number } {
    return this.pointAt(this.rotorAngle + indexAngle, POCKET_R);
  }
}
