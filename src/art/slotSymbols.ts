/**
 * THE ROYAL MIRAGE — Simboli delle slot
 *
 * Un simbolo e' una COMPOSIZIONE cotta in texture, mai un disegno:
 *   · icona 3D (`art/images.ts`) su un alone nella tinta del simbolo, oppure
 *   · tipografia metallica (7, BAR, A K Q J 10) in Big Shoulders,
 *   · eventualmente un nastro d'oro con la funzione (WILD, BONUS).
 *
 * Le tre macchine dichiarano qui SOLO la loro tabella: quale icona o quale
 * scritta per ogni id del motore. Gli id e la matematica restano quelli di
 * `games/slots/machines/*`: cambia l'aspetto, non il gioco.
 *
 * Le icone vanno precaricate (`slotSymbolImages`) prima della prima cottura:
 * la scena lo fa nel suo `preload()`.
 */

import type { Texture } from 'pixi.js';
import { bake } from './textureCache';
import { PALETTE, css, rgba } from './palette';
import { goldFill, setGlow, clearGlow, roundRectPath } from './materials';
import { iconUrl, loadedImage, type IconName } from './images';
import { FONT_STACK } from '@/core/fonts';
import { getLanguage } from '@/i18n';
import { drawWheelSymbol, drawChestSymbol } from './bonusArt';

export const SYMBOL_SIZE = 240;

type Tone = { light: number; core: number; deep: number };

/** Testo del nastro: fisso (WILD, BONUS) o tradotto (RUOTA / WHEEL). */
type RibbonText = string | { it: string; en: string };

type SymbolSpec =
  | { kind: 'icon'; icon: IconName; tone: Tone; ribbon?: RibbonText; scale?: number }
  | { kind: 'type'; text: string; tone: Tone; ribbon?: RibbonText; size?: number }
  | { kind: 'bar'; tone: Tone }
  /** Simboli dei bonus: composizione disegnata in `bonusArt.ts`. */
  | { kind: 'custom'; draw: (ctx: CanvasRenderingContext2D, S: number) => void; ribbon?: RibbonText };

function ribbonText(r: RibbonText): string {
  return typeof r === 'string' ? r : r[getLanguage()];
}

const GOLD: Tone = { light: PALETTE.gold.hot, core: PALETTE.gold.core, deep: PALETTE.gold.deep };
const RED: Tone = PALETTE.red;
const VIOLET: Tone = PALETTE.accent.violet;
const SAPPHIRE: Tone = PALETTE.accent.sapphire;
const EMERALD: Tone = PALETTE.accent.emerald;
const AMBER: Tone = PALETTE.accent.amber;
const PINK: Tone = { light: PALETTE.neon.halo, core: PALETTE.neon.pink, deep: PALETTE.red.deep };

/** Lucky Sevens: la slot classica della Strip, frutta e sette. */
const LUCKY_SEVENS: Record<string, SymbolSpec> = {
  W: { kind: 'type', text: 'WILD', tone: RED, size: 0.3 },
  S: { kind: 'icon', icon: 'glowing-star', tone: GOLD, ribbon: 'BONUS' },
  F: { kind: 'type', text: '7', tone: RED, size: 0.78 },
  C: { kind: 'bar', tone: GOLD },
  O: { kind: 'icon', icon: 'bell', tone: AMBER },
  D: { kind: 'icon', icon: 'gem-stone', tone: SAPPHIRE },
  G: { kind: 'icon', icon: 'four-leaf-clover', tone: EMERALD },
  A: { kind: 'icon', icon: 'watermelon', tone: RED, scale: 0.7 },
  K: { kind: 'icon', icon: 'grapes', tone: VIOLET, scale: 0.7 },
  Q: { kind: 'icon', icon: 'tangerine', tone: AMBER, scale: 0.68 },
  J: { kind: 'icon', icon: 'lemon', tone: GOLD, scale: 0.66 },
  T: { kind: 'icon', icon: 'cherries', tone: PINK, scale: 0.68 },
  R: { kind: 'custom', draw: drawWheelSymbol, ribbon: { it: 'RUOTA', en: 'WHEEL' } },
};

/** Hollywood Nights: la prima di gala. */
const HOLLYWOOD: Record<string, SymbolSpec> = {
  W: { kind: 'icon', icon: 'trophy', tone: GOLD, ribbon: 'WILD' },
  S: { kind: 'icon', icon: 'clapper-board', tone: VIOLET, ribbon: 'BONUS' },
  H: { kind: 'icon', icon: 'movie-camera', tone: SAPPHIRE },
  R: { kind: 'icon', icon: 'bottle-with-popping-cork', tone: EMERALD },
  P: { kind: 'icon', icon: 'top-hat', tone: PINK },
  F: { kind: 'icon', icon: 'popcorn', tone: RED },
  A: { kind: 'type', text: 'A', tone: GOLD },
  K: { kind: 'type', text: 'K', tone: RED },
  Q: { kind: 'type', text: 'Q', tone: PINK },
  J: { kind: 'type', text: 'J', tone: SAPPHIRE },
  T: { kind: 'type', text: '10', tone: EMERALD, size: 0.5 },
  B: { kind: 'icon', icon: 'admission-tickets', tone: PINK, ribbon: { it: 'CASCATA', en: 'TUMBLE' } },
};

/** Diamond Royale: la sala dei grandi giocatori. */
const DIAMOND_ROYALE: Record<string, SymbolSpec> = {
  W: { kind: 'icon', icon: 'crown', tone: GOLD, ribbon: 'WILD' },
  C: { kind: 'icon', icon: 'coin', tone: GOLD, scale: 0.74 },
  X: { kind: 'icon', icon: 'money-bag', tone: AMBER },
  R: { kind: 'icon', icon: 'gem-stone', tone: SAPPHIRE },
  E: { kind: 'icon', icon: 'ring', tone: PINK },
  Y: { kind: 'icon', icon: 'game-die', tone: RED },
  A: { kind: 'type', text: 'A', tone: GOLD },
  K: { kind: 'type', text: 'K', tone: RED },
  Q: { kind: 'type', text: 'Q', tone: VIOLET },
  J: { kind: 'type', text: 'J', tone: SAPPHIRE },
  T: { kind: 'type', text: '10', tone: EMERALD, size: 0.5 },
  F: { kind: 'custom', draw: drawChestSymbol },
};

const MACHINES = {
  goldenOasis: LUCKY_SEVENS,
  desertFalcon: HOLLYWOOD,
  sheikhsFortune: DIAMOND_ROYALE,
} as const;

export type SlotArtId = keyof typeof MACHINES;

/** Le immagini da precaricare per una macchina. */
export function slotSymbolImages(machine: SlotArtId): string[] {
  const out = new Set<string>();
  for (const s of Object.values(MACHINES[machine])) if (s.kind === 'icon') out.add(iconUrl(s.icon));
  return [...out];
}

// ─────────────────────────────────────────────── COMPOSIZIONE

/** Alone nella tinta del simbolo: lo stacca dal vetro scuro del rullo. */
function halo(ctx: CanvasRenderingContext2D, S: number, tone: Tone, strength = 0.42): void {
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.5);
  g.addColorStop(0, rgba(tone.core, strength));
  g.addColorStop(0.55, rgba(tone.core, strength * 0.25));
  g.addColorStop(1, rgba(tone.core, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
}

/** Tipografia metallica: riempimento nella tinta, filo d'oro, contorno scuro. */
function metalText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, size: number, tone: Tone, maxW: number): void {
  ctx.save();
  ctx.font = `900 ${Math.round(size)}px ${FONT_STACK.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // Ombra portata e contorno esterno scuro.
  setGlow(ctx, PALETTE.plum.abyss, size * 0.12, 0.9);
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = css(PALETTE.plum.abyss);
  ctx.strokeText(text, cx, cy, maxW);
  clearGlow(ctx);
  // Filo d'oro.
  ctx.lineWidth = size * 0.08;
  ctx.strokeStyle = goldFill(ctx, cx - size, cy - size / 2, size * 2, size, { polish: 1 });
  ctx.strokeText(text, cx, cy, maxW);
  // Corpo nella tinta, con luce in alto.
  const g = ctx.createLinearGradient(0, cy - size * 0.45, 0, cy + size * 0.45);
  g.addColorStop(0, css(tone.light));
  g.addColorStop(0.5, css(tone.core));
  g.addColorStop(1, css(tone.deep));
  ctx.fillStyle = g;
  ctx.fillText(text, cx, cy, maxW);
  ctx.restore();
}

/** Nastro d'oro con la funzione del simbolo (WILD, BONUS). */
function ribbon(ctx: CanvasRenderingContext2D, S: number, text: RibbonText): void {
  const label = ribbonText(text);
  const w = S * 0.74;
  const h = S * 0.2;
  const x = (S - w) / 2;
  const y = S * 0.74;
  ctx.save();
  setGlow(ctx, PALETTE.plum.abyss, 10, 0.7);
  roundRectPath(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = goldFill(ctx, x, y, w, h, { polish: 1 });
  ctx.fill();
  clearGlow(ctx);
  ctx.lineWidth = 2;
  ctx.strokeStyle = css(PALETTE.gold.shadow);
  ctx.stroke();
  ctx.font = `900 ${Math.round(h * 0.72)}px ${FONT_STACK.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = css(PALETTE.red.deep);
  ctx.fillText(label, S / 2, y + h * 0.54, w - 16);
  ctx.restore();
}

/** Targa rossa del WILD tipografico, con il bordo d'oro. */
function wildPlate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  setGlow(ctx, PALETTE.red.core, 18, 0.6);
  roundRectPath(ctx, x, y, w, h, Math.min(w, h) * 0.16);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, css(PALETTE.red.core));
  g.addColorStop(1, css(PALETTE.red.shadow));
  ctx.fillStyle = g;
  ctx.fill();
  clearGlow(ctx);
  ctx.lineWidth = 5;
  ctx.strokeStyle = goldFill(ctx, x, y, w, h, { polish: 1 });
  ctx.stroke();
  ctx.restore();
}

function drawSpec(ctx: CanvasRenderingContext2D, s: SymbolSpec, S: number): void {
  if (s.kind === 'custom') {
    if (s.ribbon) {
      // Con il nastro il disegno sale e si rimpicciolisce, come le icone.
      ctx.save();
      ctx.translate(S * 0.17, S * 0.03);
      ctx.scale(0.66, 0.66);
      s.draw(ctx, S);
      ctx.restore();
      ribbon(ctx, S, s.ribbon);
    } else s.draw(ctx, S);
    return;
  }
  if (s.kind === 'icon') {
    halo(ctx, S, s.tone);
    const img = loadedImage(iconUrl(s.icon));
    const k = s.scale ?? (s.ribbon ? 0.66 : 0.78);
    const size = S * k;
    const y = s.ribbon ? S * 0.06 : (S - size) / 2;
    if (img) {
      ctx.save();
      setGlow(ctx, PALETTE.plum.abyss, 14, 0.7);
      ctx.drawImage(img, (S - size) / 2, y, size, size);
      ctx.restore();
    }
    if (s.ribbon) ribbon(ctx, S, s.ribbon);
    return;
  }
  if (s.kind === 'bar') {
    halo(ctx, S, s.tone, 0.3);
    // Tre barre impilate: il simbolo BAR delle macchine a rulli classiche.
    const w = S * 0.74;
    const h = S * 0.17;
    for (let i = 0; i < 3; i++) {
      const y = S * 0.2 + i * (h + S * 0.04);
      const x = (S - w) / 2;
      ctx.save();
      setGlow(ctx, PALETTE.plum.abyss, 8, 0.8);
      roundRectPath(ctx, x, y, w, h, 6);
      ctx.fillStyle = css(PALETTE.plum.abyss);
      ctx.fill();
      clearGlow(ctx);
      ctx.lineWidth = 3;
      ctx.strokeStyle = goldFill(ctx, x, y, w, h, { polish: 1 });
      ctx.stroke();
      ctx.restore();
      metalText(ctx, 'BAR', S / 2, y + h * 0.55, h * 0.95, GOLD, w - 12);
    }
    return;
  }
  // Tipografico.
  if (s.text === 'WILD') {
    wildPlate(ctx, S * 0.08, S * 0.22, S * 0.84, S * 0.56);
    metalText(ctx, 'WILD', S / 2, S * 0.51, S * (s.size ?? 0.3), GOLD, S * 0.74);
    return;
  }
  halo(ctx, S, s.tone, 0.32);
  metalText(ctx, s.text, S / 2, S * 0.53, S * (s.size ?? 0.62), s.tone, S * 0.86);
  if (s.ribbon) ribbon(ctx, S, s.ribbon);
}

/** Texture del simbolo `id` della macchina (cotta una volta, poi in cache). */
export function slotSymbolTexture(machine: SlotArtId, id: string): Texture {
  // I nastri tradotti cambiano con la lingua: la chiave della cache la include.
  const spec = MACHINES[machine][id as keyof (typeof MACHINES)[typeof machine]] as SymbolSpec | undefined;
  const lang = spec && 'ribbon' in spec && spec.ribbon && typeof spec.ribbon !== 'string' ? `/${getLanguage()}` : '';
  return bake(`sym/${machine}/${id}${lang}`, SYMBOL_SIZE, SYMBOL_SIZE, (ctx, w) => drawSlotSymbol(machine, ctx, id, w));
}

/** Disegno diretto su un contesto (tabella dei pagamenti in DOM). */
export function drawSlotSymbol(machine: SlotArtId, ctx: CanvasRenderingContext2D, id: string, S = SYMBOL_SIZE): void {
  const spec = MACHINES[machine][id as keyof (typeof MACHINES)[typeof machine]] as SymbolSpec | undefined;
  if (spec) drawSpec(ctx, spec, S);
}

/**
 * Colonna intera del WILD espanso di Lucky Sevens: una targa alta con le
 * lettere impilate, come l'insegna verticale di un casino'.
 */
export function wildColumnTexture(rows = 3): Texture {
  const S = SYMBOL_SIZE;
  return bake(`sym/goldenOasis/W-tall-${rows}`, S, S * rows, (ctx, w, h) => {
    wildPlate(ctx, w * 0.1, h * 0.03, w * 0.8, h * 0.94);
    const letters = ['W', 'I', 'L', 'D'];
    const step = (h * 0.8) / letters.length;
    letters.forEach((l, i) => metalText(ctx, l, w / 2, h * 0.14 + step * (i + 0.5), step * 0.82, GOLD, w * 0.7));
  });
}
