/**
 * THE ROYAL MIRAGE — Cabinet delle slot
 *
 * Due texture distinte, perche' stanno a profondita' diverse:
 *   · `reelBackTexture` — fondo delle colonne, SOTTO i simboli
 *   · `frameTexture`    — il cabinet, SOPRA i simboli (ne copre i bordi)
 *
 * Il cabinet e' quello delle macchine della Strip: corpo in lacca nera con
 * filetti d'oro, una fila di lampadine sopra e sotto la finestra, e in cima
 * l'insegna rossa col nome del gioco. Nessuna figura: solo materiali e
 * geometria (rettangoli, cerchi, tipografia).
 */

import type { Texture } from 'pixi.js';
import { bake } from '@/art/textureCache';
import { PALETTE, css, rgba, mix, shade } from '@/art/palette';
import { goldFill, setGlow, clearGlow, roundRectPath, bevelStroke, gemFill } from '@/art/materials';
import { FONT_STACK } from '@/core/fonts';

export interface FrameGeometry {
  reels: number;
  rows: number;
  cellW: number;
  cellH: number;
  gap: number;
  /** Spessore della cornice attorno alla finestra. */
  pad: number;
}

export function windowSize(g: FrameGeometry): { w: number; h: number } {
  return { w: g.reels * g.cellW + (g.reels - 1) * g.gap, h: g.rows * g.cellH };
}

/**
 * Fondo delle colonne: vetro scuro nella tinta della macchina, piu' chiaro
 * al centro (il rullo e' un cilindro illuminato di fronte) e chiuso in alto
 * e in basso da un'ombra di curvatura.
 */
export function reelBackTexture(key: string, g: FrameGeometry, tone: number): Texture {
  const { w, h } = windowSize(g);
  return bake(`slot/back-${key}`, w, h, (ctx) => {
    ctx.fillStyle = css(PALETTE.plum.abyss);
    ctx.fillRect(0, 0, w, h);
    for (let r = 0; r < g.reels; r++) {
      const x = r * (g.cellW + g.gap);
      const grad = ctx.createLinearGradient(x, 0, x + g.cellW, 0);
      grad.addColorStop(0, css(shade(tone, 0.82)));
      grad.addColorStop(0.5, css(shade(tone, 0.55)));
      grad.addColorStop(1, css(shade(tone, 0.82)));
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, g.cellW, h);
      // Riflesso morbido al centro della colonna.
      const spot = ctx.createRadialGradient(x + g.cellW / 2, h / 2, 0, x + g.cellW / 2, h / 2, h * 0.6);
      spot.addColorStop(0, rgba(tone, 0.22));
      spot.addColorStop(1, rgba(tone, 0));
      ctx.fillStyle = spot;
      ctx.fillRect(x, 0, g.cellW, h);
      // Ombra di curvatura in alto e in basso.
      const v = ctx.createLinearGradient(0, 0, 0, h);
      v.addColorStop(0, rgba(PALETTE.plum.abyss, 0.75));
      v.addColorStop(0.16, rgba(PALETTE.plum.abyss, 0));
      v.addColorStop(0.84, rgba(PALETTE.plum.abyss, 0));
      v.addColorStop(1, rgba(PALETTE.plum.abyss, 0.8));
      ctx.fillStyle = v;
      ctx.fillRect(x, 0, g.cellW, h);
      // Divisori fra le righe, appena accennati.
      ctx.fillStyle = rgba(PALETTE.gold.light, 0.06);
      for (let row = 1; row < g.rows; row++) ctx.fillRect(x + 14, row * g.cellH - 0.5, g.cellW - 28, 1);
    }
    // Montanti fra le colonne: lacca con un filo d'oro al centro.
    for (let r = 1; r < g.reels; r++) {
      const x = r * (g.cellW + g.gap) - g.gap;
      ctx.fillStyle = css(PALETTE.plum.abyss);
      ctx.fillRect(x, 0, g.gap, h);
      ctx.fillStyle = rgba(PALETTE.gold.core, 0.55);
      ctx.fillRect(x + g.gap / 2 - 0.75, 0, 1.5, h);
    }
  });
}

/** Fila di lampadine fra due punti: cerchi caldi con alone, a passo costante. */
function bulbRow(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, step: number, r: number): void {
  const n = Math.max(2, Math.floor((x1 - x0) / step));
  const s = (x1 - x0) / n;
  ctx.save();
  for (let i = 0; i <= n; i++) {
    const cx = x0 + i * s;
    setGlow(ctx, PALETTE.gold.core, r * 3, 0.85);
    ctx.beginPath();
    ctx.arc(cx, y, r, 0, Math.PI * 2);
    ctx.fillStyle = gemFill(ctx, cx, y, r, { light: PALETTE.gold.hot, core: PALETTE.gold.light, deep: PALETTE.gold.mid });
    ctx.fill();
  }
  clearGlow(ctx);
  ctx.restore();
}

/** Altezza dell'insegna sopra la finestra. */
export const FRAME_CREST = 70;

/**
 * Il cabinet: anello di lacca attorno alla finestra, filetti d'oro, file di
 * lampadine, insegna rossa col nome. Trasparente al centro.
 */
export function frameTexture(
  key: string,
  g: FrameGeometry,
  gem: { light: number; core: number; deep: number },
  title = ''
): Texture {
  const { w: ww, h: wh } = windowSize(g);
  const P = g.pad;
  const crest = FRAME_CREST;
  const W = ww + P * 2;
  const H = wh + P * 2 + crest;
  return bake(`slot/frame-${key}`, W, H, (ctx) => {
    const top = crest;

    // ── Corpo: lacca nera con un velo della tinta della macchina.
    ctx.save();
    setGlow(ctx, PALETTE.plum.abyss, 40, 0.8);
    ctx.beginPath();
    roundRectInto(ctx, 0, top, W, H - top, 26);
    roundRectInto(ctx, P, top + P, ww, wh, 8);
    const body = ctx.createLinearGradient(0, top, 0, H);
    body.addColorStop(0, css(mix(PALETTE.plum.high, gem.deep, 0.35)));
    body.addColorStop(0.5, css(PALETTE.plum.raised));
    body.addColorStop(1, css(PALETTE.plum.abyss));
    ctx.fillStyle = body;
    ctx.fill('evenodd');
    clearGlow(ctx);
    ctx.restore();

    // ── Filetti d'oro: esterno e attorno alla finestra.
    ctx.lineWidth = 3;
    ctx.strokeStyle = goldFill(ctx, 0, top, W, H - top, { polish: 1 });
    roundRectPath(ctx, 1.5, top + 1.5, W - 3, H - top - 3, 25);
    ctx.stroke();
    bevelStroke(ctx, () => roundRectPath(ctx, P - 3, top + P - 3, ww + 6, wh + 6, 10), 4);
    ctx.lineWidth = 3;
    ctx.strokeStyle = goldFill(ctx, P, top + P, ww, wh, { polish: 1 });
    roundRectPath(ctx, P - 1.5, top + P - 1.5, ww + 3, wh + 3, 9);
    ctx.stroke();

    // ── Lampadine sopra e sotto la finestra.
    bulbRow(ctx, P + 10, W - P - 10, top + P / 2, 30, 4.2);
    bulbRow(ctx, P + 10, W - P - 10, H - P / 2, 30, 4.2);

    // ── Insegna: targa rossa con filo d'oro e il nome del gioco.
    const cw = Math.min(W * 0.62, 640);
    const ch = crest + P * 0.55;
    const cx = (W - cw) / 2;
    ctx.save();
    setGlow(ctx, PALETTE.red.core, 30, 0.55);
    roundRectPath(ctx, cx, 0, cw, ch, 18);
    const plate = ctx.createLinearGradient(0, 0, 0, ch);
    plate.addColorStop(0, css(PALETTE.red.core));
    plate.addColorStop(1, css(PALETTE.red.shadow));
    ctx.fillStyle = plate;
    ctx.fill();
    clearGlow(ctx);
    ctx.lineWidth = 3;
    ctx.strokeStyle = goldFill(ctx, cx, 0, cw, ch, { polish: 1 });
    ctx.stroke();
    ctx.restore();
    bulbRow(ctx, cx + 22, cx + cw - 22, 11, 26, 3.4);

    if (title) {
      ctx.save();
      const size = Math.round(ch * 0.5);
      ctx.font = `800 ${size}px ${FONT_STACK.marquee}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tx = W / 2;
      const ty = ch * 0.58;
      const label = title.toUpperCase();
      setGlow(ctx, PALETTE.gold.core, 14, 0.6);
      const fill = ctx.createLinearGradient(0, ty - size / 2, 0, ty + size / 2);
      fill.addColorStop(0, css(PALETTE.gold.hot));
      fill.addColorStop(0.45, css(PALETTE.gold.light));
      fill.addColorStop(1, css(PALETTE.gold.mid));
      ctx.fillStyle = fill;
      ctx.fillText(label, tx, ty, cw - 60);
      ctx.restore();
    }
  });
}

/** Come roundRectPath ma senza beginPath: serve per comporre tracciati evenodd. */
function roundRectInto(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
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
