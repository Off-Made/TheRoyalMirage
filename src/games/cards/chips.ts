/**
 * THE ROYAL MIRAGE — Fiche sul tavolo
 *
 * Le fiche dell'HUD sono DOM (pulsanti); quelle posate sul feltro sono
 * sprite, con gli stessi colori per taglio (`chipTone` dell'HUD), cosi'
 * il giocatore riconosce sul tavolo la fiche che ha appena scelto.
 *
 * Una fiche vera, vista dall'alto: bordo a "tacche" alternate (gli
 * inserti bianchi dei casino'), anello interno tratteggiato d'oro, faccia
 * centrale col valore. Una pila e' un Container di fiche
 * sfalsate di qualche pixel verso l'alto, con lo spessore disegnato.
 */

import { Container, Sprite, type Texture } from 'pixi.js';
import { gsap } from 'gsap';
import { bake } from '@/art/textureCache';
import { PALETTE, css, rgba, lighten, shade } from '@/art/palette';
import { goldFill, setGlow, clearGlow } from '@/art/materials';
import { FONT_STACK } from '@/core/fonts';
import { chipTone } from '@/games/common/GameHud';

export const CHIP_SIZE = 84;
const CHIP_VALUES = [25_000, 5_000, 1_000, 500, 100, 25, 10, 5, 1];

/** Gli stessi tagli e colori delle fiche dell'HUD (`chipTone`), dai token. */
const TONES: Record<string, { base: number; ink: number }> = {
  ivory: { base: PALETTE.chip.white, ink: PALETTE.text.ink },
  sapphire: { base: PALETTE.chip.teal, ink: PALETTE.text.strong },
  red: { base: PALETTE.chip.red, ink: PALETTE.text.strong },
  lapis: { base: PALETTE.chip.blue, ink: PALETTE.text.strong },
  emerald: { base: PALETTE.chip.green, ink: PALETTE.text.strong },
  black: { base: PALETTE.chip.black, ink: PALETTE.gold.light },
  amethyst: { base: PALETTE.chip.purple, ink: PALETTE.text.strong },
  gold: { base: PALETTE.gold.core, ink: PALETTE.text.ink },
};

function label(v: number): string {
  return v >= 1000 ? `${v / 1000}K` : String(v);
}

/** Texture di una fiche (vista dall'alto, con spessore sotto). */
export function chipTexture(value: number): Texture {
  const tone = TONES[chipTone(value)] ?? TONES.ivory!;
  const S = CHIP_SIZE;
  return bake(`chip/${value}`, S, S + 8, (ctx) => {
    const cx = S / 2;
    const cy = S / 2;
    const r = S / 2 - 4;
    // Spessore: il bordo laterale visto di tre quarti.
    ctx.save();
    setGlow(ctx, PALETTE.plum.abyss, 6, 0.33);
    ctx.beginPath();
    ctx.ellipse(cx, cy + 5, r, r, 0, 0, Math.PI * 2);
    ctx.fillStyle = css(shade(tone.base, 0.45));
    ctx.fill();
    clearGlow(ctx);
    ctx.restore();
    // Faccia.
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, 0, cx, cy, r);
    g.addColorStop(0, css(lighten(tone.base, 0.3)));
    g.addColorStop(0.7, css(tone.base));
    g.addColorStop(1, css(shade(tone.base, 0.3)));
    ctx.fillStyle = g;
    ctx.fill();
    // Inserti sul bordo.
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 4, a0, a0 + 0.26);
      ctx.lineWidth = 8;
      ctx.strokeStyle = rgba(PALETTE.chip.insert, 0.92);
      ctx.stroke();
    }
    // Anello interno tratteggiato d'oro.
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.68, 0, Math.PI * 2);
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = goldFill(ctx, cx - r, cy - r, r * 2, r * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Faccia centrale.
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2);
    const f = ctx.createRadialGradient(cx - 5, cy - 6, 0, cx, cy, r * 0.6);
    f.addColorStop(0, css(lighten(tone.base, 0.18)));
    f.addColorStop(1, css(shade(tone.base, 0.12)));
    ctx.fillStyle = f;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = rgba(PALETTE.gold.light, 0.8);
    ctx.stroke();
    ctx.font = `800 ${label(value).length > 2 ? 17 : 21}px ${FONT_STACK.ui}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(PALETTE.plum.abyss, 0.21);
    ctx.fillText(label(value), cx, cy + 1.5);
    ctx.fillStyle = css(tone.ink);
    ctx.fillText(label(value), cx, cy);
    // Bordo esterno.
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(PALETTE.plum.abyss, 0.3);
    ctx.stroke();
  });
}

/**
 * Scompone un importo nei tagli delle fiche (greedy, dal piu' alto).
 * 137 → [100, 25, 10, 1, 1]. Limitato a `max` fiche: oltre, la pila
 * mostra le fiche piu' alte (l'importo esatto e' nell'etichetta).
 */
export function chipBreakdown(amount: number, max = 12): number[] {
  const out: number[] = [];
  let left = Math.max(0, Math.round(amount));
  for (const v of CHIP_VALUES) {
    while (left >= v && out.length < max) {
      out.push(v);
      left -= v;
    }
  }
  return out;
}

/** Pila di fiche: la base in basso, ogni fiche 5 px piu' su. */
export class ChipStack extends Container {
  private amount = 0;

  constructor(private scaleK = 0.8) {
    super();
  }

  get value(): number {
    return this.amount;
  }

  set(amount: number, animate = true): void {
    const prev = this.amount;
    this.amount = Math.max(0, Math.round(amount));
    for (const c of this.removeChildren()) {
      gsap.killTweensOf(c);
      c.destroy();
    }
    const chips = chipBreakdown(this.amount).reverse(); // le piu' piccole in cima
    chips.sort((a, b) => b - a);
    chips.forEach((v, i) => {
      const s = new Sprite(chipTexture(v));
      s.anchor.set(0.5, 0.45);
      s.scale.set(this.scaleK);
      s.y = -i * 5 * this.scaleK;
      // Piccolo disallineamento: una pila perfetta sembra un cilindro di plastica.
      s.x = Math.sin(i * 2.3 + v) * 1.6;
      this.addChild(s);
      if (animate && this.amount > prev && i === chips.length - 1) {
        s.y -= 40;
        s.alpha = 0;
        gsap.to(s, { y: -i * 5 * this.scaleK, alpha: 1, duration: 0.22, ease: 'power2.out' });
      }
    });
  }

  clear(): void {
    this.set(0, false);
  }

  destroy(options?: Parameters<Container['destroy']>[0]): void {
    for (const c of this.children) gsap.killTweensOf(c);
    super.destroy(options ?? { children: true });
  }
}
