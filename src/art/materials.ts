/**
 * THE ROYAL MIRAGE — Materiali
 *
 * Un "materiale" e' una funzione che restituisce un riempimento Canvas2D
 * (gradiente o pattern) per una superficie: oro spazzolato, gemma, bevel.
 * Non disegna figure: le figure di questo casino' sono foto e icone 3D
 * (vedi `art/images.ts`), o geometria di gioco (fiche, ruota, carte).
 *
 * Perche' Canvas2D e non Pixi Graphics: Pixi v8 non ha gradienti conici,
 * `shadowBlur` sui tracciati ne' rampe a piu' fermate sui tratti. Il costo
 * lo paghiamo una volta, cuocendo in texture via `textureCache.ts`.
 */

import { PALETTE, css, rgba } from './palette';

export type Ctx = CanvasRenderingContext2D;

// ─────────────────────────────────────────────────────────────── METALLO

export interface GoldOptions {
  /** Angolo della luce in radianti. 0 = da sinistra, -PI/2 = dall'alto. */
  lightAngle?: number;
  /** 0 = oro spazzolato, 1 = specchio. */
  polish?: number;
}

/** I sei toni di una rampa metallica (vedi `PALETTE.gold`). */
export interface MetalTone {
  hot: number;
  light: number;
  core: number;
  mid: number;
  deep: number;
  shadow: number;
}

/**
 * Gradiente lineare che simula metallo su un box.
 *
 * Il metallo credibile non e' questione di colore ma di INVERSIONI di
 * luminanza: un metallo riflette l'ambiente, quindi la rampa va
 * chiaro → scuro → chiaro piu' volte. Un gradiente monotono legge come
 * plastica gialla.
 */
export function goldFill(ctx: Ctx, x: number, y: number, w: number, h: number, opts: GoldOptions = {}): CanvasGradient {
  const { lightAngle = -Math.PI / 2, polish = 0.75 } = opts;
  const r = Math.hypot(w, h) / 2;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const g = ctx.createLinearGradient(
    cx - Math.cos(lightAngle) * r,
    cy - Math.sin(lightAngle) * r,
    cx + Math.cos(lightAngle) * r,
    cy + Math.sin(lightAngle) * r
  );
  metalRamp(g, PALETTE.gold, polish);
  return g;
}

/** Rampa a inversioni multiple: il profilo dice "metallo", i toni dicono quale. */
export function metalRamp(g: CanvasGradient, T: MetalTone, polish: number): void {
  g.addColorStop(0.0, css(T.deep));
  g.addColorStop(0.1, css(T.mid));
  g.addColorStop(0.24, css(T.light));
  g.addColorStop(0.34, css(polish > 0.5 ? T.hot : T.light));
  g.addColorStop(0.46, css(T.core));
  g.addColorStop(0.6, css(T.deep));
  g.addColorStop(0.72, css(T.mid));
  g.addColorStop(0.84, css(T.light));
  g.addColorStop(1.0, css(T.shadow));
}

// ─────────────────────────────────────────────────────────────── GEMME

/**
 * Volume sferico: gradiente radiale decentrato. Il decentramento
 * (`0.35, 0.3`) e' cio' che fa leggere una sfera e non un disco. Usato da
 * pulsanti, fiche, mozzo della ruota.
 */
export function gemFill(
  ctx: Ctx,
  cx: number,
  cy: number,
  radius: number,
  tone: { light: number; core: number; deep: number }
): CanvasGradient {
  const g = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.3, radius * 0.05, cx, cy, radius);
  g.addColorStop(0, css(PALETTE.text.strong));
  g.addColorStop(0.18, css(tone.light));
  g.addColorStop(0.55, css(tone.core));
  g.addColorStop(1, css(tone.deep));
  return g;
}

// ─────────────────────────────────────────────────────────────── EFFETTI

/** Alone luminoso attorno al tracciato successivo. Ricordati di resettarlo. */
export function setGlow(ctx: Ctx, color: number, blur: number, alpha = 0.9): void {
  ctx.shadowColor = rgba(color, alpha);
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

export function clearGlow(ctx: Ctx): void {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

/**
 * Bordo smussato: due passate sfalsate, chiara in alto e scura in basso.
 * Tre pixel di bevel valgono piu' di qualunque gradiente per far sembrare
 * un oggetto scolpito invece che stampato.
 */
export function bevelStroke(
  ctx: Ctx,
  path: () => void,
  width: number,
  lightColor: number = PALETTE.gold.hot,
  darkColor: number = PALETTE.plum.abyss
): void {
  ctx.save();
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.translate(0, -width * 0.4);
  ctx.strokeStyle = rgba(lightColor, 0.55);
  path();
  ctx.stroke();
  ctx.translate(0, width * 0.8);
  ctx.strokeStyle = rgba(darkColor, 0.6);
  path();
  ctx.stroke();
  ctx.restore();
}

/** Rettangolo con angoli arrotondati come tracciato (non riempie ne' traccia). */
export function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/** Stella a N punte come tracciato chiuso: la forma delle scintille. */
export function starPath(ctx: Ctx, cx: number, cy: number, outer: number, inner: number, points: number, rotation = 0): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation + (i * Math.PI) / points;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
