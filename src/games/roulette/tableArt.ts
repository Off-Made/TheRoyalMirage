/**
 * THE ROYAL MIRAGE — Il tappeto della roulette, cotto in texture
 *
 * Ogni misura viene da `layout.ts` e da nessun'altra parte. Non e' pigrizia:
 * il hit-test (`hitTable`) e il disegno devono coincidere al pixel, altrimenti
 * si clicca su una casella e la fiche si posa su quella accanto. Se una misura
 * cambia, cambia in `layout.ts` e il tappeto si ridisegna da solo.
 *
 * ── Diciture neutre ──
 * La texture si cuoce una volta: non puo' seguire il cambio di lingua. Sul
 * panno quindi solo cio' che e' universale ai tavoli europei — numeri, "2:1",
 * i rombi rosso e nero, PAIR / IMPAIR e gli annunci francesi del racetrack.
 * Sono le stesse parole che si leggono in un casino italiano vero.
 */

import { Sprite, type Texture } from 'pixi.js';
import { bake } from '@/art/textureCache';
import { PALETTE, css, rgba } from '@/art/palette';
import { type Ctx, goldFill, roundRectPath } from '@/art/materials';
import { FONT_STACK } from '@/core/fonts';
import { velvet, embossedText, FELT_EMERALD } from '@/games/cards/table';
import { POCKETS, WHEEL_ORDER, colorOf, type NumColor } from './rules';
import {
  CH,
  CW,
  DH,
  EH,
  PAD,
  RT_BAND,
  RT_CELL,
  RT_CXL,
  RT_CXR,
  RT_CY,
  RT_H,
  RT_RC,
  RT_SECTIONS,
  RT_W,
  TABLE_H,
  TABLE_W,
  X0,
  Y0,
  cellRect,
  rtDividers,
  rtPoint,
  rtSectionCenter,
} from './layout';

/** Colori delle caselle: rubino e onice, non il rosso e nero da pennarello. */
export const POCKET_FILL: Record<NumColor, { top: string; bottom: string }> = {
  red: { top: css(PALETTE.red.core), bottom: css(PALETTE.red.deep) },
  black: { top: css(PALETTE.plum.high), bottom: css(PALETTE.plum.abyss) },
  green: { top: css(PALETTE.felt.light), bottom: css(PALETTE.felt.core) },
};

function pocketGradient(ctx: Ctx, c: NumColor, y: number, h: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, POCKET_FILL[c].top);
  g.addColorStop(1, POCKET_FILL[c].bottom);
  return g;
}

/** Filo d'oro: ombra sotto, oro sopra. Le linee del tappeto sono "cucite". */
function goldLine(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, w = 2): void {
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(x0, y0 + 1);
  ctx.lineTo(x1, y1 + 1);
  ctx.lineWidth = w + 1.5;
  ctx.strokeStyle = rgba(PALETTE.plum.abyss, 0.33);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineWidth = w;
  ctx.strokeStyle = rgba(PALETTE.gold.light, 0.9);
  ctx.stroke();
  ctx.restore();
}

/** Numero d'avorio con ombra: deve leggersi anche quando la fiche lo copre a meta'. */
function ivoryNumber(ctx: Ctx, text: string, x: number, y: number, size: number): void {
  ctx.save();
  ctx.font = `800 ${size}px ${FONT_STACK.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = rgba(PALETTE.plum.abyss, 0.36);
  ctx.fillText(text, x, y + size * 0.06);
  ctx.fillStyle = css(PALETTE.text.strong);
  ctx.fillText(text, x, y);
  ctx.restore();
}

function diamond(ctx: Ctx, cx: number, cy: number, w: number, h: number, c: NumColor): void {
  ctx.save();
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(cx, cy - h / 2);
    ctx.lineTo(cx + w / 2, cy);
    ctx.lineTo(cx, cy + h / 2);
    ctx.lineTo(cx - w / 2, cy);
    ctx.closePath();
  };
  path();
  ctx.fillStyle = pocketGradient(ctx, c, cy - h / 2, h);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = goldFill(ctx, cx - w / 2, cy - h / 2, w, h, { polish: 0.9 });
  ctx.stroke();
  ctx.restore();
}

// ─────────────────────────────────────────────── TAPPETO

export function drawTable(ctx: Ctx, w: number, h: number): void {
  // Panno: il bordo arrotondato e' dentro PAD, quindi nessuna casella e' tagliata.
  roundRectPath(ctx, 0, 0, w, h, 18);
  velvet(ctx, w, h, FELT_EMERALD, w * 0.45, h * 0.4, w * 0.7);
  ctx.save();
  roundRectPath(ctx, 2, 2, w - 4, h - 4, 16);
  ctx.lineWidth = 3;
  ctx.strokeStyle = goldFill(ctx, 0, 0, w, h, { polish: 0.8 });
  ctx.stroke();
  ctx.restore();

  const gridR = X0 + 12 * CW;
  const gridB = Y0 + 3 * CH;

  // Zero: casella a punta verso sinistra, il profilo classico europeo.
  // La punta resta dentro il rettangolo di `cellRect(0)`: il hit-test e' il
  // rettangolo intero, il disegno ne e' un sottoinsieme che lo suggerisce.
  {
    const r = cellRect(0);
    const inset = 5;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(r.x + r.w - inset, r.y + inset);
    ctx.lineTo(r.x + 26, r.y + inset);
    ctx.lineTo(r.x + inset, r.y + r.h / 2);
    ctx.lineTo(r.x + 26, r.y + r.h - inset);
    ctx.lineTo(r.x + r.w - inset, r.y + r.h - inset);
    ctx.closePath();
    ctx.fillStyle = pocketGradient(ctx, 'green', r.y, r.h);
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.restore();
    ivoryNumber(ctx, '0', r.x + r.w / 2 + 6, r.y + r.h / 2, 46);
  }

  // Numeri 1..36: riquadro colorato rientrato, cosi' i bordi restano panno
  // verde e i cavalli si vedono come "terra di nessuno" fra due numeri.
  for (let n = 1; n <= 36; n++) {
    const r = cellRect(n);
    const inset = 6;
    roundRectPath(ctx, r.x + inset, r.y + inset, r.w - inset * 2, r.h - inset * 2, 8);
    ctx.fillStyle = pocketGradient(ctx, colorOf(n), r.y, r.h);
    ctx.fill();
    ctx.save();
    roundRectPath(ctx, r.x + inset, r.y + inset, r.w - inset * 2, r.h - inset * 2, 8);
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(PALETTE.gold.hot, 0.18);
    ctx.stroke();
    ctx.restore();
    ivoryNumber(ctx, String(n), r.x + r.w / 2, r.y + r.h / 2 + 1, 34);
  }

  // Colonne.
  for (let r = 0; r < 3; r++) {
    embossedText(ctx, '2:1', gridR + CW / 2, Y0 + r * CH + CH / 2, 24, { font: 'display', spacing: 0.04 });
  }

  // Dozzine.
  const dz = ['1 – 12', '13 – 24', '25 – 36'];
  dz.forEach((label, k) => embossedText(ctx, label, X0 + k * 4 * CW + 2 * CW, gridB + DH / 2, 26, { spacing: 0.08 }));

  // Chance semplici: ordine identico a OUTSIDE_RECTS (low, even, red, black, odd, high).
  const ey = gridB + DH + EH / 2;
  const ex = (k: number) => X0 + k * 2 * CW + CW;
  embossedText(ctx, '1 – 18', ex(0), ey, 24, { spacing: 0.06 });
  embossedText(ctx, 'PAIR', ex(1), ey, 24, { spacing: 0.14 });
  diamond(ctx, ex(2), ey, 92, 40, 'red');
  diamond(ctx, ex(3), ey, 92, 40, 'black');
  embossedText(ctx, 'IMPAIR', ex(4), ey, 22, { spacing: 0.1 });
  embossedText(ctx, '19 – 36', ex(5), ey, 24, { spacing: 0.06 });

  // Linee d'oro, per ultime: coprono i bordi dei riempimenti.
  goldLine(ctx, PAD, Y0, X0 + 13 * CW, Y0); // alto
  goldLine(ctx, PAD, gridB, X0 + 13 * CW, gridB); // base della griglia
  goldLine(ctx, X0, gridB + DH, gridR, gridB + DH);
  goldLine(ctx, X0, gridB + DH + EH, gridR, gridB + DH + EH);
  for (let r = 1; r < 3; r++) goldLine(ctx, X0, Y0 + r * CH, X0 + 13 * CW, Y0 + r * CH);
  goldLine(ctx, PAD, Y0, PAD, gridB);
  for (let c = 0; c <= 13; c++) goldLine(ctx, X0 + c * CW, Y0, X0 + c * CW, gridB);
  for (let k = 0; k <= 3; k++) goldLine(ctx, X0 + k * 4 * CW, gridB, X0 + k * 4 * CW, gridB + DH);
  for (let k = 0; k <= 6; k++) goldLine(ctx, X0 + k * 2 * CW, gridB + DH, X0 + k * 2 * CW, gridB + DH + EH);
}

export function tableTexture(): Texture {
  return bake('roulette/table', TABLE_W, TABLE_H, drawTable);
}

export function makeTable(): Sprite {
  return new Sprite(tableTexture());
}

// ─────────────────────────────────────────────── RACETRACK

/** Tracciato dello stadio a distanza `r` dalla spina. */
function stadiumPath(ctx: Ctx, r: number): void {
  ctx.beginPath();
  ctx.moveTo(RT_CXL, RT_CY - r);
  ctx.lineTo(RT_CXR, RT_CY - r);
  ctx.arc(RT_CXR, RT_CY, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(RT_CXL, RT_CY + r);
  ctx.arc(RT_CXL, RT_CY, r, Math.PI / 2, (Math.PI * 3) / 2);
  ctx.closePath();
}

const SECTION_LABEL: Record<(typeof RT_SECTIONS)[number], string> = {
  tiers: 'TIERS',
  orphelins: 'ORPHELINS',
  voisins: 'VOISINS',
  zero: 'ZÉRO',
};

export function drawRacetrack(ctx: Ctx, w: number, h: number): void {
  const outer = RT_RC + RT_BAND / 2;
  const inner = RT_RC - RT_BAND / 2;

  stadiumPath(ctx, outer + 4);
  velvet(ctx, w, h, FELT_EMERALD, w / 2, h / 2, w * 0.6);

  // Le 37 caselle dell'anello, nell'ordine del cilindro. Ogni casella e' un
  // poligono campionato lungo `rtPoint`, cosi' segue esattamente la forma
  // usata dal hit-test anche sulle curve.
  for (let i = 0; i < POCKETS; i++) {
    const s0 = (i - 0.5) * RT_CELL;
    const s1 = (i + 0.5) * RT_CELL;
    const steps = 6;
    ctx.beginPath();
    for (let k = 0; k <= steps; k++) {
      const p = rtPoint(s0 + ((s1 - s0) * k) / steps, RT_BAND / 2 - 3);
      if (k === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    for (let k = steps; k >= 0; k--) {
      const p = rtPoint(s0 + ((s1 - s0) * k) / steps, -RT_BAND / 2 + 3);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    const n = WHEEL_ORDER[i]!;
    const c = rtPoint(i * RT_CELL);
    ctx.fillStyle = pocketGradient(ctx, colorOf(n), c.y - RT_BAND / 2, RT_BAND);
    ctx.fill();
    ivoryNumber(ctx, String(n), c.x, c.y + 1, 22);
  }

  // Bordi d'oro dell'anello.
  for (const r of [outer, inner]) {
    stadiumPath(ctx, r);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = rgba(PALETTE.gold.light, 0.9);
    ctx.stroke();
  }

  // Divisioni oblique fra gli annunci.
  for (const d of rtDividers()) goldLine(ctx, d.xTop, d.yTop, d.xBottom, d.yBottom, 2);

  for (const id of RT_SECTIONS) {
    const p = rtSectionCenter(id);
    embossedText(ctx, SECTION_LABEL[id], p.x, p.y, id === 'orphelins' ? 17 : 20, { spacing: 0.12 });
  }
}

export function racetrackTexture(): Texture {
  return bake('roulette/racetrack', RT_W, RT_H, drawRacetrack);
}
