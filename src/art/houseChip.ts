/**
 * THE ROYAL MIRAGE — La fiche della casa
 *
 * Monogramma RM al centro, THE ROYAL MIRAGE lungo l'anello, otto inserti sul
 * bordo come le fiche del tavolo (`cards/chips.ts`). La usano la transizione
 * fra le pagine (rossa, con il retro piu' scuro per il flip) e il Golden
 * Chip (d'oro, e' lei che vola sulla curva): una sola fonte, perche' due
 * copie dello stesso marchio finirebbero per divergere al primo ritocco.
 *
 * Solo tipografia e gradienti di materiale (vincolo 7), solo token (vincolo 2).
 */
import type { Texture } from 'pixi.js';
import { PALETTE, css, rgba, lighten, shade } from '@/art/palette';
import { bake } from '@/art/textureCache';
import { goldFill, setGlow, clearGlow } from '@/art/materials';
import { FONT_STACK } from '@/core/fonts';

export type HouseChipVariant = 'red' | 'redBack' | 'gold';

/** Lato della texture, in px di design. */
export const HOUSE_CHIP_SIZE = 220;

const TAU = Math.PI * 2;

interface Look {
  /** Corpo e faccia centrale. */
  base: number;
  insert: number;
  insertAlpha: number;
  /** Anelli, scritta e filo esterno. */
  ring: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => CanvasGradient | string;
  lettering: string;
  monogram: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => CanvasGradient | string;
}

const gold = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) =>
  goldFill(ctx, x, y, w, h, { polish: 0.85 });

const LOOKS: Record<HouseChipVariant, Look> = {
  red: {
    base: PALETTE.red.core,
    insert: PALETTE.chip.insert,
    insertAlpha: 0.92,
    ring: gold,
    lettering: css(PALETTE.gold.light),
    monogram: (ctx, x, y, w, h) => goldFill(ctx, x, y, w, h, { polish: 0.9 }),
  },
  redBack: {
    base: shade(PALETTE.red.core, 0.22),
    insert: PALETTE.chip.insert,
    insertAlpha: 0.75,
    ring: gold,
    lettering: css(PALETTE.gold.light),
    monogram: (ctx, x, y, w, h) => goldFill(ctx, x, y, w, h, { polish: 0.9 }),
  },
  // Oro con inchiostro rosso marquee: il rovescio cromatico della rossa, cosi'
  // le due si riconoscono come la stessa fiche in due tagli.
  gold: {
    base: PALETTE.gold.core,
    insert: PALETTE.red.core,
    insertAlpha: 0.95,
    ring: () => css(PALETTE.red.deep),
    lettering: css(PALETTE.red.deep),
    monogram: () => css(PALETTE.red.core),
  },
};

const KEYS: Record<HouseChipVariant, string> = {
  // Le chiavi della rossa restano quelle della transizione: la cache e' gia'
  // calda se la transizione e' passata prima.
  red: 'fx/chip-face/front',
  redBack: 'fx/chip-face/back',
  gold: 'house-chip/gold',
};

export function houseChipTexture(variant: HouseChipVariant): Texture {
  const L = LOOKS[variant];
  return bake(KEYS[variant], HOUSE_CHIP_SIZE, HOUSE_CHIP_SIZE, (ctx, S) => {
    const cx = S / 2;
    const cy = S / 2;
    const r = S / 2 - 6;
    const base = L.base;

    // Corpo, con un'ombra morbida verso il prugna.
    ctx.save();
    setGlow(ctx, PALETTE.plum.abyss, 10, 0.4);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, 0, cx, cy, r);
    g.addColorStop(0, css(lighten(base, 0.28)));
    g.addColorStop(0.7, css(base));
    g.addColorStop(1, css(shade(base, 0.3)));
    ctx.fillStyle = g;
    ctx.fill();
    clearGlow(ctx);
    ctx.restore();

    // Inserti sul bordo.
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * TAU;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 9, a0, a0 + 0.24);
      ctx.lineWidth = 18;
      ctx.strokeStyle = rgba(L.insert, L.insertAlpha);
      ctx.stroke();
    }

    // Anelli che portano la scritta.
    const ring = L.ring(ctx, cx - r, cy - r, r * 2, r * 2);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.74, 0, TAU);
    ctx.lineWidth = 3;
    ctx.strokeStyle = ring;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.5, 0, TAU);
    ctx.lineWidth = 2;
    ctx.strokeStyle = ring;
    ctx.stroke();

    // "THE ROYAL MIRAGE" lungo l'anello, un carattere alla volta: il canvas
    // non sa scrivere su una curva, ma sa ruotare.
    const text = 'THE ROYAL MIRAGE  ·  THE ROYAL MIRAGE  ·  ';
    const ringR = r * 0.62;
    ctx.font = `700 15px ${FONT_STACK.display}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = L.lettering;
    const step = TAU / text.length;
    for (let i = 0; i < text.length; i++) {
      const a = -Math.PI / 2 + i * step;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * ringR, cy + Math.sin(a) * ringR);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillText(text[i]!, 0, 0);
      ctx.restore();
    }

    // Faccia centrale col monogramma.
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.47, 0, TAU);
    const f = ctx.createRadialGradient(cx - 8, cy - 10, 0, cx, cy, r * 0.5);
    f.addColorStop(0, css(lighten(base, 0.14)));
    f.addColorStop(1, css(shade(base, 0.18)));
    ctx.fillStyle = f;
    ctx.fill();

    ctx.font = `900 64px ${FONT_STACK.marquee}`;
    ctx.fillStyle = rgba(PALETTE.plum.abyss, 0.35);
    ctx.fillText('RM', cx, cy + 3);
    ctx.fillStyle = L.monogram(ctx, cx - 40, cy - 34, 80, 68);
    ctx.fillText('RM', cx, cy);

    // Filo sul bordo: stacca la fiche da qualunque fondo, anche dello stesso tono.
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1.5, 0, TAU);
    ctx.lineWidth = 3;
    ctx.strokeStyle = variant === 'gold' ? css(PALETTE.gold.deep) : ring;
    ctx.stroke();
  });
}
