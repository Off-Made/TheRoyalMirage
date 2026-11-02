/**
 * THE ROYAL MIRAGE — Arte del video poker
 *
 * La macchina e' un "cabinet" di lusso visto di fronte:
 *
 *   ┌──────────── cornice in lacca nera e oro ────────────┐
 *   │  ┌───────── tabella pagamenti (vetro scuro) ──────┐ │
 *   │  └────────────────────────────────────────────────┘ │
 *   │ MONETE   [carta] [carta] [carta] [carta] [carta]  PUNTATA
 *   │           velluto ametista con trama a stelle       │
 *   └─────────────────────────────────────────────────────┘
 *
 * Tutte le parti statiche si cuociono una volta; le luci della tabella
 * (colonna attiva, riga vincente) sono sprite a parte che la scena accende
 * e spegne senza ridisegnare nulla.
 */

import type { Texture } from 'pixi.js';
import { bake } from '@/art/textureCache';
import { PALETTE, css, rgba } from '@/art/palette';
import { goldFill, roundRectPath, setGlow, clearGlow, starPath } from '@/art/materials';
import { FONT_STACK } from '@/core/fonts';
import { FELT_TURQUOISE, velvet, feltStar, cardSlot, embossedText } from '@/games/cards/table';

// ─────────────────────────────────────────────── GEOMETRIA (px di design)

export const CAB = { x: 120, y: 104, w: 1680, h: 818 };
export const PAY = { x: 300, y: 122, w: 1320, h: 314, rowH: 32, pad: 13, nameW: 470 };
export const PAY_COL_W = (PAY.w - PAY.nameW) / 5;
export const CARD_WIDTH = 220;
export const CARD_Y = 628;
export const CARD_XS = [460, 710, 960, 1210, 1460];

/** Cornice della macchina con velluto e segnaposto delle carte. */
export function cabinetTexture(): Texture {
  return bake('vp/cabinet', CAB.w, CAB.h, (ctx, w, h) => {
    // Corpo in lacca nera con filo d'oro: lo stesso cabinet delle slot.
    ctx.save();
    setGlow(ctx, PALETTE.plum.abyss, 30, 0.495);
    roundRectPath(ctx, 10, 10, w - 20, h - 20, 34);
    const lac = ctx.createLinearGradient(0, 0, 0, h);
    lac.addColorStop(0, css(PALETTE.plum.high));
    lac.addColorStop(0.5, css(PALETTE.plum.raised));
    lac.addColorStop(1, css(PALETTE.plum.abyss));
    ctx.fillStyle = lac;
    ctx.fill();
    clearGlow(ctx);
    ctx.restore();
    roundRectPath(ctx, 10, 10, w - 20, h - 20, 34);
    ctx.lineWidth = 5;
    ctx.strokeStyle = goldFill(ctx, 0, 0, w, h, { lightAngle: -Math.PI / 2, polish: 1 });
    ctx.stroke();
    roundRectPath(ctx, 19, 19, w - 38, h - 38, 27);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = rgba(PALETTE.gold.light, 0.45);
    ctx.stroke();

    // Pannello di velluto.
    const ix = 30;
    const iy = 30;
    const iw = w - 60;
    const ih = h - 60;
    roundRectPath(ctx, ix, iy, iw, ih, 22);
    velvet(ctx, w, h, FELT_TURQUOISE, w / 2, h * 0.68, w * 0.62);
    // Trama di losanghe appena accennata nel pelo del velluto.
    ctx.save();
    roundRectPath(ctx, ix, iy, iw, ih, 22);
    ctx.clip();
    ctx.strokeStyle = rgba(PALETTE.gold.light, 0.06);
    ctx.lineWidth = 1;
    for (let y = iy; y < iy + ih + 60; y += 56) {
      for (let x = ix; x < ix + iw + 60; x += 56) {
        const ox = ((y - iy) / 56) % 2 === 0 ? 0 : 28;
        starPath(ctx, x + ox, y, 12, 5, 4, -Math.PI / 2);
        ctx.stroke();
      }
    }
    // Vignetta interna: il velluto sprofonda sotto la cornice.
    const v = ctx.createRadialGradient(w / 2, h * 0.6, h * 0.25, w / 2, h * 0.6, w * 0.6);
    v.addColorStop(0, rgba(PALETTE.plum.abyss, 0));
    v.addColorStop(1, rgba(PALETTE.plum.abyss, 0.33));
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    roundRectPath(ctx, ix, iy, iw, ih, 22);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = goldFill(ctx, ix, iy, iw, ih, { lightAngle: -Math.PI / 2 });
    ctx.stroke();

    // Stelle d'angolo sulla cornice.
    for (const [x, y] of [[44, 44], [w - 44, 44], [44, h - 44], [w - 44, h - 44]] as const) feltStar(ctx, x, y, 12);

    // Segnaposto delle carte, in coordinate del cabinet.
    for (const cx of CARD_XS) cardSlot(ctx, cx - CAB.x, CARD_Y - CAB.y, CARD_WIDTH / 200, 0.35);

    // Filetto ornamentale sotto le carte.
    const ly = CARD_Y - CAB.y + 206;
    const lg = ctx.createLinearGradient(w * 0.2, 0, w * 0.8, 0);
    lg.addColorStop(0, rgba(PALETTE.gold.core, 0));
    lg.addColorStop(0.5, rgba(PALETTE.gold.light, 0.6));
    lg.addColorStop(1, rgba(PALETTE.gold.core, 0));
    ctx.fillStyle = lg;
    ctx.fillRect(w * 0.2, ly, w * 0.6, 1.5);
    feltStar(ctx, w / 2, ly + 1, 7);

    embossedText(ctx, 'JACKS OR BETTER', 150, h - 70, 18, { alpha: 0.75, spacing: 0.14 });
    embossedText(ctx, '9 / 6', w - 150, h - 70, 22, { alpha: 0.75 });
  });
}

/** Vetro scuro della tabella pagamenti, con righe e colonne incise. */
export function paytableTexture(rows: number): Texture {
  return bake('vp/paytable', PAY.w, PAY.h, (ctx, w, h) => {
    ctx.save();
    setGlow(ctx, PALETTE.plum.abyss, 18, 0.44);
    roundRectPath(ctx, 4, 4, w - 8, h - 8, 16);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, css(PALETTE.plum.lifted));
    g.addColorStop(1, css(PALETTE.plum.abyss));
    ctx.fillStyle = g;
    ctx.fill();
    clearGlow(ctx);
    ctx.restore();
    // Riflesso del vetro.
    ctx.save();
    roundRectPath(ctx, 4, 4, w - 8, h - 8, 16);
    ctx.clip();
    const gl = ctx.createLinearGradient(0, 0, 0, h * 0.5);
    gl.addColorStop(0, rgba(PALETTE.gold.hot, 0.08));
    gl.addColorStop(1, rgba(PALETTE.gold.hot, 0));
    ctx.fillStyle = gl;
    ctx.fillRect(0, 0, w, h * 0.5);
    // Righe alternate.
    for (let i = 0; i < rows; i++) {
      if (i % 2 === 1) {
        ctx.fillStyle = rgba(PALETTE.gold.light, 0.05);
        ctx.fillRect(0, PAY.pad + i * PAY.rowH, w, PAY.rowH);
      }
    }
    // Separatori di colonna.
    ctx.strokeStyle = rgba(PALETTE.gold.deep, 0.5);
    ctx.lineWidth = 1;
    for (let c = 0; c <= 4; c++) {
      const x = PAY.nameW + c * PAY_COL_W + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 10);
      ctx.lineTo(x, h - 10);
      ctx.stroke();
    }
    ctx.restore();
    roundRectPath(ctx, 4, 4, w - 8, h - 8, 16);
    ctx.lineWidth = 3;
    ctx.strokeStyle = goldFill(ctx, 0, 0, w, h, { lightAngle: -Math.PI / 2, polish: 1 });
    ctx.stroke();
    roundRectPath(ctx, 10, 10, w - 20, h - 20, 11);
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = rgba(PALETTE.gold.light, 0.35);
    ctx.stroke();
  });
}

/** Colonna attiva (monete in gioco): rubino profondo, come le macchine vere. */
export function columnHighlightTexture(): Texture {
  const h = PAY.h - 18;
  return bake('vp/col-hl', PAY_COL_W, h, (ctx, w) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    // Colonna attiva in rubino ACCESO: e' l'unico blocco saturo sulla
    // tabella chiara, e indica le monete in gioco senza bisogno di leggerle.
    g.addColorStop(0, css(PALETTE.red.light));
    g.addColorStop(0.5, css(PALETTE.red.core));
    g.addColorStop(1, css(PALETTE.red.deep));
    roundRectPath(ctx, 1, 1, w - 2, h - 2, 6);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = goldFill(ctx, 0, 0, w, h, { lightAngle: 0 });
    ctx.stroke();
  });
}

/** Riga accesa (combinazione in mano / vincente): barra d'oro traslucida. */
export function rowHighlightTexture(): Texture {
  const w = PAY.w - 20;
  const h = PAY.rowH;
  return bake('vp/row-hl', w, h, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, rgba(PALETTE.gold.core, 0.1));
    g.addColorStop(0.5, rgba(PALETTE.gold.light, 0.36));
    g.addColorStop(1, rgba(PALETTE.gold.core, 0.1));
    roundRectPath(ctx, 1, 2, w - 2, h - 4, 6);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = rgba(PALETTE.gold.hot, 0.9);
    ctx.stroke();
  });
}

/** Cartiglio "TENUTA" sotto la carta. */
export function holdBadgeTexture(label: string): Texture {
  return bake(`vp/hold/${label}`, 168, 46, (ctx, w, h) => {
    ctx.save();
    setGlow(ctx, PALETTE.gold.light, 14, 0.8);
    roundRectPath(ctx, 6, 5, w - 12, h - 10, (h - 10) / 2);
    ctx.fillStyle = goldFill(ctx, 6, 5, w - 12, h - 10, { lightAngle: -Math.PI / 2, polish: 1 });
    ctx.fill();
    clearGlow(ctx);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = css(PALETTE.gold.shadow);
    ctx.stroke();
    ctx.restore();
    ctx.font = `800 21px ${FONT_STACK.display}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '3px';
    ctx.fillStyle = rgba(PALETTE.gold.hot, 0.6);
    ctx.fillText(label, w / 2, h / 2 + 2);
    ctx.fillStyle = css(PALETTE.gold.shadow);
    ctx.fillText(label, w / 2, h / 2 + 1);
  });
}

/** Piccolo pannello per i contatori laterali (monete, puntata). */
export function meterTexture(): Texture {
  return bake('vp/meter', 200, 150, (ctx, w, h) => {
    roundRectPath(ctx, 4, 4, w - 8, h - 8, 14);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, rgba(PALETTE.plum.abyss, 0.85));
    g.addColorStop(1, rgba(PALETTE.plum.abyss, 0.94));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = goldFill(ctx, 0, 0, w, h, { lightAngle: -Math.PI / 2 });
    ctx.stroke();
  });
}
