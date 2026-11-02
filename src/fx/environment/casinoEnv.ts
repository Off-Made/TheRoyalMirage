/**
 * THE ROYAL MIRAGE — Gli ambienti dietro ai giochi
 *
 * Ogni ambiente e' UNA fotografia (WebP, vedi `art/images.ts`) piu' due
 * strati di luce: un velo prugna che la fa arretrare e un alone che da' al
 * tavolo un punto di luce. Nessuna scenografia a livelli: la profondita' la
 * fa la foto, che e' gia' profonda.
 *
 *   salon    — luci della Strip sfocate: i tavoli (carte, roulette, video poker)
 *   strip    — le fontane del Bellagio sfocate: le slot
 *   skyline  — la Strip dall'alto, cielo nero: il Golden Chip ci vola sopra
 */

import { Container, Sprite } from 'pixi.js';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '@/core/App';
import { PALETTE, rgba } from '@/art/palette';
import { imageTexture, photoUrl, type PhotoName } from '@/art/images';
import type { DrawFn } from '@/art/textureCache';
import type { EnvBuildContext, EnvironmentSpec, LayerSpec } from './types';

/** Foto adattata a riempire il design space ("cover"), centrata. */
function photoLayer(name: PhotoName, alpha = 1): LayerSpec {
  return {
    key: `photo:${name}`,
    depth: 0.35,
    make: (c: EnvBuildContext) => {
      const tex = imageTexture(photoUrl(name));
      const s = new Sprite(tex);
      const w = tex.width || 1;
      const h = tex.height || 1;
      // Piu' largo del design space di `W`: la parallasse ha margine per
      // scorrere senza scoprire il bordo.
      const k = Math.max(c.W / w, (DESIGN_HEIGHT * 1.06) / h);
      s.scale.set(k);
      s.position.set(c.ox + (c.W - w * k) / 2, (DESIGN_HEIGHT - h * k) / 2);
      s.alpha = alpha;
      return s;
    },
  };
}

/**
 * Velo verticale: piu' denso in basso, dove sta la plancia, e in alto,
 * dove stanno i titoli. Al centro lascia respirare la foto.
 */
function veilLayer(key: string, top: number, mid: number, bottom: number): LayerSpec {
  return {
    key: `veil:${key}`,
    depth: null,
    make: (c) => {
      const s = new Sprite(
        c.tex(`veil-${key}`, 8, 256, (ctx, w, h) => {
          const g = ctx.createLinearGradient(0, 0, 0, h);
          g.addColorStop(0, rgba(PALETTE.plum.base, top));
          g.addColorStop(0.45, rgba(PALETTE.plum.base, mid));
          g.addColorStop(1, rgba(PALETTE.plum.abyss, bottom));
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
        }, { res: 1 })
      );
      s.width = DESIGN_WIDTH;
      s.height = DESIGN_HEIGHT;
      return s;
    },
  };
}

/** Alone ellittico morbido: la "lampada sopra il tavolo". */
function glowLayer(key: string, color: number, alpha: number, cy: number, rx: number, ry: number): LayerSpec {
  return {
    key: `glow:${key}`,
    depth: 0.1,
    anim: { kind: 'alpha', base: 1, a1: 0.05, f1: 0.4, a2: 0.03, f2: 0.23 },
    make: (c) => {
      const s = new Sprite(
        c.tex(`glow-${key}`, 256, 256, (ctx, w, h) => {
          const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
          g.addColorStop(0, rgba(color, alpha));
          g.addColorStop(0.5, rgba(color, alpha * 0.35));
          g.addColorStop(1, rgba(color, 0));
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
        }, { res: 1 })
      );
      s.anchor.set(0.5);
      s.position.set(DESIGN_WIDTH / 2, cy);
      s.width = rx * 2;
      s.height = ry * 2;
      s.blendMode = 'add';
      return s;
    },
  };
}

/** Vignettatura verso il fondo estremo: chiude l'inquadratura come un obiettivo. */
const vignette: { draw: DrawFn; w: number; h: number } = {
  w: 320,
  h: 180,
  draw: (ctx, w, h) => {
    ctx.save();
    ctx.scale(1, h / w);
    const g = ctx.createRadialGradient(w / 2, w / 2, w * 0.22, w / 2, w / 2, w * 0.62);
    g.addColorStop(0, rgba(PALETTE.plum.abyss, 0));
    g.addColorStop(1, rgba(PALETTE.plum.abyss, 0.85));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
    ctx.restore();
  },
};

export const SALON: EnvironmentSpec = {
  id: 'env-salon',
  images: [photoUrl('lights')],
  amp: { x: 18, y: 8 },
  ambient: PALETTE.plum.base,
  vignette,
  layers: [
    photoLayer('lights', 0.9),
    veilLayer('salon', 0.5, 0.32, 0.78),
    glowLayer('salon', PALETTE.gold.core, 0.22, DESIGN_HEIGHT * 0.42, 820, 420),
  ],
};

export const STRIP: EnvironmentSpec = {
  id: 'env-strip',
  images: [photoUrl('strip-blur')],
  amp: { x: 22, y: 10 },
  ambient: PALETTE.plum.base,
  vignette,
  layers: [
    photoLayer('strip-blur'),
    veilLayer('strip', 0.4, 0.22, 0.78),
    glowLayer('strip', PALETTE.neon.pink, 0.16, DESIGN_HEIGHT * 0.5, 900, 460),
  ],
};

export const SKYLINE: EnvironmentSpec = {
  id: 'env-skyline',
  images: [photoUrl('skyline')],
  amp: { x: 26, y: 12 },
  ambient: PALETTE.plum.abyss,
  vignette,
  layers: [
    photoLayer('skyline'),
    veilLayer('skyline', 0.35, 0.18, 0.6),
    glowLayer('skyline', PALETTE.neon.cyan, 0.1, DESIGN_HEIGHT * 0.86, 1100, 260),
  ],
};

/** Contenitore vuoto: usato da chi non vuole nessuno sfondo (collaudo). */
export const NONE: EnvironmentSpec = {
  id: 'env-none',
  ambient: PALETTE.plum.base,
  layers: [{ key: 'empty', depth: null, make: () => new Container() }],
};
