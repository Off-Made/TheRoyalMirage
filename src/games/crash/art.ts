/**
 * THE ROYAL MIRAGE — Golden Chip: texture di supporto
 *
 * La fiche che vola e' in `art/houseChip.ts`; qui restano solo cio' che e'
 * luce o materiale: il pannello di vetro del grafico, l'alone sulla punta,
 * la stella di luce, le schegge della fiche in pezzi, la barra del conto alla
 * rovescia. Ogni funzione dipinge in Canvas2D una volta e passa per `bake()`.
 */

import type { Texture } from 'pixi.js';
import { bake, bakeSquare } from '@/art/textureCache';
import { PALETTE, css, rgba } from '@/art/palette';
import { goldFill, setGlow, clearGlow, roundRectPath } from '@/art/materials';

const G = PALETTE.gold;

/** Alone morbido radiale, da tingere (aura del falco, flash dello schianto). */
export function glowTexture(): Texture {
  return bakeSquare('crash/glow', 256, (ctx, w) => {
    const c = w / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, rgba(PALETTE.text.strong, 0.9));
    g.addColorStop(0.18, rgba(PALETTE.text.strong, 0.5));
    g.addColorStop(0.45, rgba(PALETTE.text.strong, 0.16));
    g.addColorStop(1, rgba(PALETTE.text.strong, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
}

/** Stella di luce a quattro raggi lunghi: il "riflesso d'obiettivo" sulla punta della curva. */
export function flareTexture(): Texture {
  return bakeSquare('crash/flare', 256, (ctx, w) => {
    const c = w / 2;
    ctx.globalCompositeOperation = 'lighter';
    for (const [len, thick, a] of [
      [c, 3.2, 0],
      [c, 3.2, Math.PI / 2],
      [c * 0.55, 2, Math.PI / 4],
      [c * 0.55, 2, -Math.PI / 4],
    ] as const) {
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(a);
      const g = ctx.createLinearGradient(-len, 0, len, 0);
      g.addColorStop(0, rgba(G.core, 0));
      g.addColorStop(0.5, rgba(G.hot, 0.95));
      g.addColorStop(1, rgba(G.core, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, len, thick, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const core = ctx.createRadialGradient(c, c, 0, c, c, c * 0.22);
    core.addColorStop(0, rgba(PALETTE.text.strong, 1));
    core.addColorStop(0.4, rgba(G.light, 0.6));
    core.addColorStop(1, rgba(G.core, 0));
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, w, w);
  });
}

/** Scheggia d'oro triangolare: il falco che si frantuma. */
export function shardTexture(): Texture {
  return bake('crash/shard', 40, 24, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(2, 12);
    ctx.lineTo(36, 3);
    ctx.lineTo(28, 21);
    ctx.closePath();
    ctx.fillStyle = goldFill(ctx, 0, 0, 40, 24, { lightAngle: -0.8 });
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(G.hot, 0.8);
    ctx.stroke();
  });
}

// ─────────────────────────────────────────────── PANNELLO DEL GRAFICO

/**
 * Lastra di vetro scuro con filo d'oro e un filo interno al neon. Il fondo
 * NON e' opaco: la Strip deve intravedersi dietro alla curva.
 */
export function chartPanelTexture(w: number, h: number): Texture {
  return bake(`crash/panel-${w}x${h}`, w, h, (ctx) => {
    const r = 26;
    const inset = 8;
    roundRectPath(ctx, inset, inset, w - inset * 2, h - inset * 2, r);
    const glass = ctx.createLinearGradient(0, 0, 0, h);
    glass.addColorStop(0, rgba(PALETTE.plum.abyss, 0.86));
    glass.addColorStop(0.6, rgba(PALETTE.plum.base, 0.62));
    glass.addColorStop(1, rgba(PALETTE.plum.abyss, 0.5));
    ctx.fillStyle = glass;
    ctx.fill();

    // Bagliore d'orizzonte dal basso: la citta' illuminata.
    ctx.save();
    roundRectPath(ctx, inset, inset, w - inset * 2, h - inset * 2, r);
    ctx.clip();
    const horizon = ctx.createLinearGradient(0, h, 0, h * 0.45);
    horizon.addColorStop(0, rgba(G.core, 0.1));
    horizon.addColorStop(1, rgba(G.core, 0));
    ctx.fillStyle = horizon;
    ctx.fillRect(0, h * 0.45, w, h * 0.55);
    ctx.restore();

    // Cornice: filo d'oro esterno + filo di luce calda interno.
    roundRectPath(ctx, inset, inset, w - inset * 2, h - inset * 2, r);
    setGlow(ctx, G.core, 16, 0.35);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = goldFill(ctx, 0, 0, w, h, { lightAngle: -Math.PI * 0.6 });
    ctx.stroke();
    clearGlow(ctx);
    roundRectPath(ctx, inset + 9, inset + 9, w - (inset + 9) * 2, h - (inset + 9) * 2, r - 8);
    setGlow(ctx, G.light, 10, 0.5);
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(G.light, 0.4);
    ctx.stroke();
    clearGlow(ctx);
  });
}

/** Barra orizzontale sfumata per il conto alla rovescia. */
export function barTexture(): Texture {
  return bake('crash/bar', 256, 16, (ctx, w, h) => {
    roundRectPath(ctx, 0, 0, w, h, h / 2);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, css(G.light));
    g.addColorStop(0.45, css(G.core));
    g.addColorStop(1, css(G.deep));
    ctx.fillStyle = g;
    ctx.fill();
  });
}
