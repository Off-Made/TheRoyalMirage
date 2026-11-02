/**
 * THE ROYAL MIRAGE — Materiali del tavolo
 *
 * Mattoni Canvas2D condivisi dai tavoli di carte: velluto, scritte d'oro
 * "a sbalzo", testo su arco, bracciolo in pelle, sabot.
 *
 * ── Il velluto ──
 * Un panno verde uniforme e' il segno del tavolo da gioco economico. Il
 * velluto vero ha tre cose: (1) un centro piu' chiaro dove cade la luce
 * della lampada, (2) bordi che sprofondano nel buio, (3) una grana di
 * fibre corte orientate a caso. Le facciamo tutte e tre, una volta sola,
 * nella texture del tavolo.
 *
 * ── L'oro a sbalzo ──
 * Le scritte del tavolo ("BLACKJACK PAGA 3 A 2") non sono stampate ma
 * impresse: ombra scura spostata in basso, luce chiara spostata in alto,
 * oro in mezzo. Tre passate dello stesso testo: il rilievo costa nulla.
 */

import { Sprite, type Texture } from 'pixi.js';
import { bake } from '@/art/textureCache';
import { PALETTE, css, rgba, mix } from '@/art/palette';
import { type Ctx, goldFill, roundRectPath, starPath, setGlow, clearGlow } from '@/art/materials';
import { FONT_STACK } from '@/core/fonts';
import { CARD_H, CARD_R, CARD_W, drawCardBack } from './art';

export interface FeltTone {
  light: number;
  core: number;
  deep: number;
}

/*
 * I panni del Mirage: saturi al centro, dove cade la luce della lampada, e
 * profondi ai bordi. Su un fondale notturno un panno chiaro ovunque
 * sembrerebbe un tappetino; e' il passaggio luce-ombra a dire "velluto".
 */
/** Verde smeraldo: blackjack e roulette. */
export const FELT_EMERALD: FeltTone = PALETTE.felt;
/** Cremisi: il baccarat, tavolo dei grandi giocatori. */
export const FELT_COBALT: FeltTone = PALETTE.feltRed;
/** Zaffiro notte: il video poker. */
export const FELT_TURQUOISE: FeltTone = { light: PALETTE.accent.sapphire.core, core: PALETTE.accent.sapphire.deep, deep: PALETTE.plum.abyss };

/**
 * Riempie il tracciato CORRENTE del contesto con un velluto.
 * `lx, ly` = centro della luce; `r` = raggio della luce.
 */
export function velvet(ctx: Ctx, w: number, h: number, tone: FeltTone, lx = w / 2, ly = h * 0.45, r = Math.max(w, h) * 0.6): void {
  ctx.save();
  ctx.clip();
  const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, r);
  g.addColorStop(0, css(tone.light));
  g.addColorStop(0.45, css(tone.core));
  g.addColorStop(1, css(tone.deep));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Fibre: trattini corti chiari e scuri. Il generatore e' deterministico
  // (stesso tavolo a ogni sessione) e la quantita' scala con l'area.
  let seed = 424242;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n = Math.round((w * h) / 260);
  ctx.lineWidth = 0.8;
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const a = rnd() * Math.PI;
    const len = 1.5 + rnd() * 3;
    ctx.strokeStyle = rnd() > 0.5 ? rgba(PALETTE.text.strong, 0.07) : rgba(PALETTE.plum.abyss, 0.06);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  // Seconda luce, calda: il riflesso della lampada sul pelo del velluto.
  const warm = ctx.createRadialGradient(lx, ly - r * 0.15, 0, lx, ly, r * 0.7);
  warm.addColorStop(0, rgba(PALETTE.gold.light, 0.08));
  warm.addColorStop(1, rgba(PALETTE.gold.light, 0));
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Testo d'oro impresso nel velluto (tre passate: ombra, luce, oro). */
export function embossedText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  size: number,
  opts: { font?: 'display' | 'display' | 'ui'; weight?: number; alpha?: number; spacing?: number } = {}
): void {
  const { font = 'display', weight = 700, alpha = 1, spacing = 0.12 } = opts;
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT_STACK[font]}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  (ctx as Ctx & { letterSpacing?: string }).letterSpacing = `${size * spacing}px`;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = rgba(PALETTE.plum.abyss, 0.33);
  ctx.fillText(text, x, y + size * 0.06);
  ctx.fillStyle = rgba(PALETTE.gold.hot, 0.25);
  ctx.fillText(text, x, y - size * 0.035);
  const m = ctx.measureText(text);
  ctx.fillStyle = goldFill(ctx, x - m.width / 2, y - size / 2, m.width, size, { lightAngle: -Math.PI / 2, polish: 0.8 });
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * Testo lungo un arco di cerchio, letto da sinistra a destra.
 * `below = true` (default): testo sulla parte bassa del cerchio, a
 * "sorriso", con la testa delle lettere verso il centro — la scritta
 * classica dei tavoli da blackjack.
 */
export function arcText(
  ctx: Ctx,
  text: string,
  cx: number,
  cy: number,
  radius: number,
  size: number,
  opts: { font?: 'display' | 'display' | 'ui'; weight?: number; spacing?: number; color?: 'gold' | string; alpha?: number } = {}
): void {
  const { font = 'display', weight = 700, spacing = 0.18, color = 'gold', alpha = 1 } = opts;
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT_STACK[font]}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = alpha;
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width + size * spacing);
  const total = widths.reduce((a, b) => a + b, 0);
  let off = 0;
  for (let i = 0; i < chars.length; i++) {
    const cw = widths[i]!;
    const a = Math.PI / 2 + total / 2 / radius - (off + cw / 2) / radius;
    off += cw;
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a - Math.PI / 2);
    ctx.fillStyle = rgba(PALETTE.plum.abyss, 0.3);
    ctx.fillText(chars[i]!, 0, size * 0.06);
    ctx.fillStyle =
      color === 'gold' ? goldFill(ctx, -size / 2, -size / 2, size, size, { lightAngle: -Math.PI / 2 }) : color;
    ctx.fillText(chars[i]!, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

/** Filetto d'oro lungo un arco (le "corsie" del tavolo). */
export function goldArc(ctx: Ctx, cx: number, cy: number, r: number, a0: number, a1: number, width = 2, alpha = 0.85): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(cx, cy, r, a0, a1);
  ctx.lineWidth = width + 2;
  ctx.strokeStyle = rgba(PALETTE.plum.abyss, 0.27);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r, a0, a1);
  ctx.lineWidth = width;
  ctx.strokeStyle = goldFill(ctx, cx - r, cy - r, r * 2, r * 2, { lightAngle: -Math.PI / 2 });
  ctx.stroke();
  ctx.restore();
}

/** Piccola losanga d'oro impressa nel velluto (il rombo delle carte). */
export function feltStar(ctx: Ctx, x: number, y: number, r: number, alpha = 0.9): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  starPath(ctx, x, y + 1, r, r * 0.42, 4, -Math.PI / 2);
  ctx.fillStyle = rgba(PALETTE.plum.abyss, 0.3);
  ctx.fill();
  starPath(ctx, x, y, r, r * 0.42, 4, -Math.PI / 2);
  ctx.fillStyle = goldFill(ctx, x - r, y - r, r * 2, r * 2, { polish: 1 });
  ctx.fill();
  ctx.restore();
}

/**
 * Bracciolo in pelle imbottita lungo il tracciato corrente (stroke).
 * Pelle color tabacco con cucitura d'oro e filetti d'ottone ai lati.
 */
export function leatherRail(ctx: Ctx, path: () => void, width: number): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Ombra portata sul velluto.
  setGlow(ctx, PALETTE.plum.abyss, 26, 0.468);
  path();
  ctx.lineWidth = width;
  ctx.strokeStyle = css(PALETTE.leather.deep);
  ctx.stroke();
  clearGlow(ctx);
  // Pelle: tre passate concentriche, dalla piu' larga e scura alla piu' stretta e chiara.
  const layers: [number, string][] = [
    [1, css(PALETTE.leather.deep)],
    [0.82, css(PALETTE.leather.core)],
    [0.55, css(mix(PALETTE.leather.core, PALETTE.leather.light, 0.5))],
    [0.28, css(PALETTE.leather.light)],
  ];
  for (const [k, c] of layers) {
    path();
    ctx.lineWidth = width * k;
    ctx.strokeStyle = c;
    ctx.stroke();
  }
  // Cucitura: tratteggio d'oro al centro.
  path();
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = rgba(PALETTE.gold.light, 0.55);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** Bordo d'ottone (filetto doppio) lungo il tracciato corrente. */
export function brassEdge(ctx: Ctx, path: () => void, width = 4): void {
  ctx.save();
  path();
  ctx.lineWidth = width + 3;
  ctx.strokeStyle = rgba(PALETTE.plum.abyss, 0.36);
  ctx.stroke();
  path();
  ctx.lineWidth = width;
  ctx.strokeStyle = goldFill(ctx, 0, 0, 1920, 1080, { lightAngle: -Math.PI / 2, polish: 0.9 });
  ctx.stroke();
  ctx.restore();
}

// ─────────────────────────────────────────────── SABOT

export const SHOE_W = 230;
export const SHOE_H = 170;

/**
 * Sabot: scatola di ebano laccato con bordi d'oro e la carta in uscita
 * dalla bocca inclinata. Vista dall'alto e di tre quarti.
 */
export function shoeTexture(): Texture {
  return bake('cards/shoe', SHOE_W, SHOE_H, (ctx, w, h) => {
    // Corpo.
    ctx.save();
    setGlow(ctx, PALETTE.plum.abyss, 18, 0.44);
    ctx.beginPath();
    ctx.moveTo(18, 30);
    ctx.lineTo(w - 54, 18);
    ctx.lineTo(w - 10, 60);
    ctx.lineTo(w - 22, h - 18);
    ctx.lineTo(24, h - 14);
    ctx.closePath();
    const body = ctx.createLinearGradient(0, 0, 0, h);
    // Sabot in noce caldo, non in ebano: e' un oggetto grande sul panno.
    body.addColorStop(0, css(PALETTE.leather.light));
    body.addColorStop(0.5, css(PALETTE.leather.core));
    body.addColorStop(1, css(PALETTE.leather.deep));
    ctx.fillStyle = body;
    ctx.fill();
    clearGlow(ctx);
    ctx.lineWidth = 3;
    ctx.strokeStyle = goldFill(ctx, 0, 0, w, h, { polish: 1 });
    ctx.stroke();
    ctx.restore();

    // Carte impilate visibili dall'apertura superiore (dorsi lapis).
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(34, 40);
    ctx.lineTo(w - 64, 30);
    ctx.lineTo(w - 40, 62);
    ctx.lineTo(40, 76);
    ctx.closePath();
    ctx.clip();
    ctx.translate(30, 18);
    ctx.rotate(-0.06);
    ctx.scale(0.8, 0.3);
    drawCardBack(ctx, CARD_W, CARD_H);
    ctx.restore();

    // Bocca d'uscita: la carta che sporge, pronta per essere estratta.
    ctx.save();
    ctx.translate(w - 60, 70);
    ctx.rotate(0.5);
    ctx.beginPath();
    roundRectPath(ctx, -42, -10, 84, 60, 6);
    ctx.clip();
    ctx.translate(-42, -10);
    ctx.scale(84 / CARD_W, 120 / CARD_H);
    drawCardBack(ctx, CARD_W, CARD_H);
    ctx.restore();

    // Piastra frontale d'oro con stella.
    ctx.save();
    roundRectPath(ctx, 44, h - 56, 100, 28, 6);
    ctx.fillStyle = goldFill(ctx, 44, h - 56, 100, 28, { polish: 1 });
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = css(PALETTE.gold.shadow);
    ctx.stroke();
    ctx.font = `700 14px ${FONT_STACK.display}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = css(PALETTE.gold.shadow);
    ctx.fillText('THE ROYAL MIRAGE', 94, h - 41);
    ctx.restore();
  });
}

export function makeShoe(): Sprite {
  const s = new Sprite(shoeTexture());
  s.anchor.set(0.5);
  return s;
}

/** Bocca del sabot rispetto al centro dello sprite: da qui partono le carte. */
export const SHOE_MOUTH = { x: SHOE_W / 2 - 60, y: 70 - SHOE_H / 2 };

/** Area segnaposto di una carta sul feltro (contorno tratteggiato d'oro). */
export function cardSlot(ctx: Ctx, cx: number, cy: number, scale: number, alpha = 0.45): void {
  const w = CARD_W * scale;
  const h = CARD_H * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, CARD_R * scale);
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = css(PALETTE.gold.light);
  ctx.stroke();
  ctx.restore();
}
