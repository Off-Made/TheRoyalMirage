/**
 * THE ROYAL MIRAGE — Le carte da gioco
 *
 * Un mazzo da tavolo di casino', cotto in texture (`bake`) una carta alla
 * volta, la prima volta che serve.
 *
 * ── Direzione artistica ──
 *   · faccia avorio caldo, mai bianco ottico: sul panno scuro il bianco puro
 *     "buca" lo schermo
 *   · semi a inchiostro pieno, rosso carminio e nero prugna: sono le carte
 *     dei tavoli veri, leggibili a colpo d'occhio anche piccole
 *   · figure TIPOGRAFICHE: la lettera grande in Big Shoulders dentro una
 *     cornice d'oro, ripetuta capovolta come nei mazzi reali. Nessuna figura
 *     disegnata a mano.
 *   · dorso cremisi del Mirage: losanghe d'oro, doppio filetto, monogramma RM
 *
 * Spazio logico CARD_W x CARD_H (200 x 280, il rapporto 2.5" x 3.5" delle
 * carte da poker). La texture e' cotta a densita' `getBakeResolution()`.
 */

import type { Texture } from 'pixi.js';
import { bake } from '@/art/textureCache';
import { PALETTE, css, rgba } from '@/art/palette';
import { type Ctx, goldFill, setGlow, clearGlow, roundRectPath } from '@/art/materials';
import { FONT_STACK } from '@/core/fonts';
import { type Card, type Suit, cardId, isRed, rankLabel, makeDeck } from './card';

export const CARD_W = 200;
export const CARD_H = 280;
export const CARD_R = 14;
/** Margine attorno alle texture di ombra e alone (per non tagliare la sfocatura). */
export const CARD_PAD = 28;

const ink = (suit: Suit) => (isRed(suit) ? PALETTE.card.red : PALETTE.card.black);

// ═══════════════════════════════════════════════ SEMI

/** Tracciato di un seme in un box centrato (cx, cy) alto `s`, coordinate in [-0.5, 0.5]. */
function suitPath(ctx: Ctx, suit: Suit, cx: number, cy: number, s: number): void {
  const X = (x: number) => cx + x * s;
  const Y = (y: number) => cy + y * s;
  ctx.beginPath();
  switch (suit) {
    case 'H':
      ctx.moveTo(X(0), Y(0.45));
      ctx.bezierCurveTo(X(-0.08), Y(0.32), X(-0.5), Y(0.08), X(-0.5), Y(-0.17));
      ctx.bezierCurveTo(X(-0.5), Y(-0.36), X(-0.36), Y(-0.47), X(-0.24), Y(-0.47));
      ctx.bezierCurveTo(X(-0.12), Y(-0.47), X(-0.03), Y(-0.39), X(0), Y(-0.28));
      ctx.bezierCurveTo(X(0.03), Y(-0.39), X(0.12), Y(-0.47), X(0.24), Y(-0.47));
      ctx.bezierCurveTo(X(0.36), Y(-0.47), X(0.5), Y(-0.36), X(0.5), Y(-0.17));
      ctx.bezierCurveTo(X(0.5), Y(0.08), X(0.08), Y(0.32), X(0), Y(0.45));
      break;
    case 'D':
      ctx.moveTo(X(0), Y(-0.5));
      ctx.quadraticCurveTo(X(0.13), Y(-0.17), X(0.39), Y(0));
      ctx.quadraticCurveTo(X(0.13), Y(0.17), X(0), Y(0.5));
      ctx.quadraticCurveTo(X(-0.13), Y(0.17), X(-0.39), Y(0));
      ctx.quadraticCurveTo(X(-0.13), Y(-0.17), X(0), Y(-0.5));
      break;
    case 'S':
      ctx.moveTo(X(0), Y(-0.5));
      ctx.bezierCurveTo(X(0.07), Y(-0.36), X(0.5), Y(-0.13), X(0.5), Y(0.1));
      ctx.bezierCurveTo(X(0.5), Y(0.28), X(0.36), Y(0.36), X(0.24), Y(0.36));
      ctx.bezierCurveTo(X(0.14), Y(0.36), X(0.07), Y(0.31), X(0.04), Y(0.25));
      ctx.quadraticCurveTo(X(0.06), Y(0.42), X(0.22), Y(0.5));
      ctx.lineTo(X(-0.22), Y(0.5));
      ctx.quadraticCurveTo(X(-0.06), Y(0.42), X(-0.04), Y(0.25));
      ctx.bezierCurveTo(X(-0.07), Y(0.31), X(-0.14), Y(0.36), X(-0.24), Y(0.36));
      ctx.bezierCurveTo(X(-0.36), Y(0.36), X(-0.5), Y(0.28), X(-0.5), Y(0.1));
      ctx.bezierCurveTo(X(-0.5), Y(-0.13), X(-0.07), Y(-0.36), X(0), Y(-0.5));
      break;
    case 'C': {
      // Tre lobi come sotto-tracciati circolari nello stesso verso: con la
      // regola nonzero si fondono in un'unica sagoma piena.
      const r = 0.215;
      const lobes: [number, number][] = [
        [0, -0.25],
        [-0.25, 0.06],
        [0.25, 0.06],
      ];
      for (const [lx, ly] of lobes) {
        ctx.moveTo(X(lx + r), Y(ly));
        ctx.arc(X(lx), Y(ly), r * s, 0, Math.PI * 2);
      }
      // Cuore del trifoglio, per chiudere il vuoto fra i lobi.
      ctx.moveTo(X(-0.12), Y(-0.06));
      ctx.lineTo(X(0.12), Y(-0.06));
      ctx.lineTo(X(0.1), Y(0.16));
      ctx.lineTo(X(-0.1), Y(0.16));
      ctx.closePath();
      // Gambo a coda di rondine.
      ctx.moveTo(X(0.04), Y(0.08));
      ctx.quadraticCurveTo(X(0.06), Y(0.4), X(0.22), Y(0.5));
      ctx.lineTo(X(-0.22), Y(0.5));
      ctx.quadraticCurveTo(X(-0.06), Y(0.4), X(-0.04), Y(0.08));
      ctx.closePath();
      break;
    }
  }
}

/** Seme a inchiostro pieno. `flip` lo capovolge (meta' inferiore della carta). */
export function drawSuit(ctx: Ctx, suit: Suit, cx: number, cy: number, s: number, opts: { flip?: boolean; color?: number } = {}): void {
  ctx.save();
  if (opts.flip) {
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI);
    ctx.translate(-cx, -cy);
  }
  suitPath(ctx, suit, cx, cy, s);
  ctx.fillStyle = css(opts.color ?? ink(suit));
  ctx.fill();
  ctx.restore();
}

// ═══════════════════════════════════════════════ FACCIA

/** Avorio con una vignettatura appena percepibile verso i bordi. */
function paper(ctx: Ctx, w: number, h: number): void {
  roundRectPath(ctx, 0.5, 0.5, w - 1, h - 1, CARD_R);
  const g = ctx.createRadialGradient(w / 2, h * 0.42, w * 0.2, w / 2, h / 2, w * 0.9);
  g.addColorStop(0, css(PALETTE.card.face));
  g.addColorStop(1, css(PALETTE.card.edge));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(PALETTE.plum.abyss, 0.28);
  ctx.stroke();
}

/** Indice d'angolo: valore in Manrope pieno + seme piccolo, ripetuto capovolto. */
function cornerIndex(ctx: Ctx, c: Card, w: number, h: number): void {
  const label = rankLabel(c.rank);
  const draw = () => {
    ctx.save();
    ctx.translate(24, 38);
    if (label.length > 1) ctx.scale(0.78, 1);
    ctx.font = `800 32px ${FONT_STACK.ui}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = css(ink(c.suit));
    ctx.fillText(label, 0, 0);
    ctx.restore();
    drawSuit(ctx, c.suit, 24, 56, 20);
  };
  draw();
  ctx.save();
  ctx.translate(w, h);
  ctx.rotate(Math.PI);
  draw();
  ctx.restore();
}

/** Disposizione classica dei semi. 'L' 'C' 'R' = colonna sinistra, centrale, destra. */
const PIPS: Record<number, [col: 'L' | 'C' | 'R', y: number][]> = {
  2: [['C', 0], ['C', 1]],
  3: [['C', 0], ['C', 0.5], ['C', 1]],
  4: [['L', 0], ['R', 0], ['L', 1], ['R', 1]],
  5: [['L', 0], ['R', 0], ['C', 0.5], ['L', 1], ['R', 1]],
  6: [['L', 0], ['R', 0], ['L', 0.5], ['R', 0.5], ['L', 1], ['R', 1]],
  7: [['L', 0], ['R', 0], ['C', 0.25], ['L', 0.5], ['R', 0.5], ['L', 1], ['R', 1]],
  8: [['L', 0], ['R', 0], ['C', 0.25], ['L', 0.5], ['R', 0.5], ['C', 0.75], ['L', 1], ['R', 1]],
  9: [['L', 0], ['R', 0], ['L', 1 / 3], ['R', 1 / 3], ['C', 0.5], ['L', 2 / 3], ['R', 2 / 3], ['L', 1], ['R', 1]],
  10: [['L', 0], ['R', 0], ['C', 1 / 6], ['L', 1 / 3], ['R', 1 / 3], ['L', 2 / 3], ['R', 2 / 3], ['C', 5 / 6], ['L', 1], ['R', 1]],
};

function pips(ctx: Ctx, c: Card, w: number, h: number): void {
  const layout = PIPS[c.rank]!;
  const colX = { L: w / 2 - 38, C: w / 2, R: w / 2 + 38 };
  const top = 64;
  const bottom = h - 64;
  for (const [col, fy] of layout) {
    drawSuit(ctx, c.suit, colX[col], top + (bottom - top) * fy, 38, { flip: fy > 0.5 });
  }
}

/** Asso: un solo seme grande. L'asso di picche porta la firma della casa. */
function ace(ctx: Ctx, c: Card, w: number, h: number): void {
  const big = c.suit === 'S' ? 112 : 96;
  drawSuit(ctx, c.suit, w / 2, h / 2 - (c.suit === 'S' ? 8 : 0), big);
  if (c.suit === 'S') {
    ctx.save();
    ctx.font = `800 13px ${FONT_STACK.display}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = css(PALETTE.gold.deep);
    ctx.fillText('THE ROYAL MIRAGE', w / 2, h / 2 + 76);
    ctx.restore();
  }
}

/**
 * Figura tipografica: cornice d'oro sottile, la lettera grande e il seme,
 * ripetuti capovolti nella meta' inferiore come nei mazzi reali (cosi' la
 * carta si legge dritta da entrambi i lati del tavolo).
 */
function court(ctx: Ctx, c: Card, w: number, h: number): void {
  const fx = 44;
  const fy = 30;
  const fw = w - fx * 2;
  const fh = h - fy * 2;
  // Campo tinto appena nel colore del seme.
  roundRectPath(ctx, fx, fy, fw, fh, 8);
  ctx.fillStyle = rgba(ink(c.suit), 0.06);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = goldFill(ctx, fx, fy, fw, fh, { polish: 1 });
  ctx.stroke();
  // Linea mediana: separa le due meta' speculari.
  ctx.beginPath();
  ctx.moveTo(fx + 12, h / 2);
  ctx.lineTo(fx + fw - 12, h / 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(PALETTE.gold.deep, 0.55);
  ctx.stroke();

  const label = rankLabel(c.rank);
  const half = () => {
    ctx.save();
    ctx.font = `900 74px ${FONT_STACK.display}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = css(ink(c.suit));
    ctx.fillText(label, w / 2 - 14, h / 2 - 18);
    ctx.restore();
    drawSuit(ctx, c.suit, w / 2 + 30, h / 2 - 44, 30);
  };
  half();
  ctx.save();
  ctx.translate(w, h);
  ctx.rotate(Math.PI);
  half();
  ctx.restore();
}

/** Disegna la faccia di una carta. Esportata anche per i canvas DOM (regole). */
export function drawCardFace(ctx: Ctx, c: Card, w = CARD_W, h = CARD_H): void {
  ctx.save();
  ctx.scale(w / CARD_W, h / CARD_H);
  paper(ctx, CARD_W, CARD_H);
  if (c.rank === 1) ace(ctx, c, CARD_W, CARD_H);
  else if (c.rank >= 11) court(ctx, c, CARD_W, CARD_H);
  else pips(ctx, c, CARD_W, CARD_H);
  cornerIndex(ctx, c, CARD_W, CARD_H);
  ctx.restore();
}

// ═══════════════════════════════════════════════ DORSO

/** Dorso cremisi del Mirage: losanghe d'oro, doppio filetto, monogramma. */
export function drawCardBack(ctx: Ctx, w = CARD_W, h = CARD_H): void {
  ctx.save();
  ctx.scale(w / CARD_W, h / CARD_H);
  const W = CARD_W;
  const H = CARD_H;
  // Bordo bianco avorio, come i mazzi da casino'.
  roundRectPath(ctx, 0.5, 0.5, W - 1, H - 1, CARD_R);
  ctx.fillStyle = css(PALETTE.card.face);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(PALETTE.plum.abyss, 0.28);
  ctx.stroke();

  const m = 11;
  ctx.save();
  roundRectPath(ctx, m, m, W - m * 2, H - m * 2, 8);
  ctx.clip();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, css(PALETTE.red.core));
  g.addColorStop(1, css(PALETTE.red.deep));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Losanghe: due famiglie di diagonali, filo d'oro sottile.
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(PALETTE.gold.light, 0.32);
  const step = 16;
  for (let d = -H; d < W + H; d += step) {
    ctx.beginPath();
    ctx.moveTo(d, 0);
    ctx.lineTo(d + H, H);
    ctx.moveTo(d, 0);
    ctx.lineTo(d - H, H);
    ctx.stroke();
  }
  ctx.restore();

  // Doppio filetto.
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = goldFill(ctx, m, m, W - m * 2, H - m * 2, { polish: 1 });
  roundRectPath(ctx, m + 6, m + 6, W - (m + 6) * 2, H - (m + 6) * 2, 6);
  ctx.stroke();

  // Medaglione centrale col monogramma.
  const cx = W / 2;
  const cy = H / 2;
  ctx.save();
  setGlow(ctx, PALETTE.plum.abyss, 12, 0.7);
  ctx.beginPath();
  ctx.ellipse(cx, cy, 46, 58, 0, 0, Math.PI * 2);
  ctx.fillStyle = css(PALETTE.red.shadow);
  ctx.fill();
  clearGlow(ctx);
  ctx.lineWidth = 3;
  ctx.strokeStyle = goldFill(ctx, cx - 46, cy - 58, 92, 116, { polish: 1 });
  ctx.stroke();
  ctx.font = `800 54px ${FONT_STACK.marquee}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = goldFill(ctx, cx - 40, cy - 30, 80, 60, { polish: 1 });
  ctx.fillText('RM', cx, cy + 3);
  ctx.restore();
  ctx.restore();
}

// ═══════════════════════════════════════════════ TEXTURE

export function cardTexture(c: Card): Texture {
  return bake(`card/${cardId(c)}`, CARD_W, CARD_H, (ctx) => drawCardFace(ctx, c));
}

export function cardBackTexture(): Texture {
  return bake('card/back', CARD_W, CARD_H, (ctx) => drawCardBack(ctx));
}

/** Ombra morbida della carta, con margine `CARD_PAD` su ogni lato. */
export function cardShadowTexture(): Texture {
  const W = CARD_W + CARD_PAD * 2;
  const H = CARD_H + CARD_PAD * 2;
  return bake('card/shadow', W, H, (ctx) => {
    // La sagoma sta fuori campo: nel canvas cade solo la sua ombra spostata.
    ctx.shadowColor = rgba(PALETTE.plum.abyss, 0.6);
    ctx.shadowBlur = 16;
    ctx.shadowOffsetX = 2000;
    roundRectPath(ctx, CARD_PAD - 2000, CARD_PAD, CARD_W, CARD_H, CARD_R);
    ctx.fillStyle = css(PALETTE.plum.abyss);
    ctx.fill();
  });
}

/** Alone d'oro attorno alla carta (carte vincenti, carte tenute). */
export function cardGlowTexture(): Texture {
  const W = CARD_W + CARD_PAD * 2;
  const H = CARD_H + CARD_PAD * 2;
  return bake('card/glow', W, H, (ctx) => {
    setGlow(ctx, PALETTE.gold.light, 22, 1);
    roundRectPath(ctx, CARD_PAD, CARD_PAD, CARD_W, CARD_H, CARD_R);
    ctx.lineWidth = 5;
    ctx.strokeStyle = css(PALETTE.gold.light);
    ctx.stroke();
    clearGlow(ctx);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = css(PALETTE.gold.hot);
    ctx.stroke();
  });
}

/**
 * Cottura progressiva del mazzo: `n` carte per chiamata, dal `tick` della
 * scena a riposo, cosi' nessuna carta si cuoce nel frame in cui e'
 * distribuita. Restituisce true a mazzo completo.
 */
const deckOrder = makeDeck();
let warmIndex = 0;
export function warmCardTextures(n = 1): boolean {
  if (warmIndex === 0) {
    cardBackTexture();
    cardShadowTexture();
    cardGlowTexture();
  }
  for (let i = 0; i < n && warmIndex < deckOrder.length; i++) cardTexture(deckOrder[warmIndex++]!);
  return warmIndex >= deckOrder.length;
}
