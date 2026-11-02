/**
 * THE ROYAL MIRAGE — Stili di testo in canvas
 *
 * Il testo dentro Pixi (titoli di vincita, valori sulle fiche, numeri della
 * roulette) usa questi preset. Nessuna scena costruisce un TextStyle a mano:
 * un titolo "MEGA VINCITA" in un font diverso da un gioco all'altro e' il
 * dettaglio che fa sembrare amatoriale un prodotto.
 *
 * Due famiglie, come nel DOM: Big Shoulders per insegne e titoli, Manrope per
 * etichette e numeri. Il testo semplice e' avorio, perche' ogni superficie
 * dei tavoli e' scura (panno, velluto, vetro prugna). Su superfici chiare
 * (le carte, le caselle della roulette) si chiede `fill` esplicito.
 *
 * ── L'oro nel testo ──
 * Stessa regola dei materiali: un oro credibile ha una luce in alto e
 * un'ombra in basso. Il gradiente e' verticale in spazio locale (0..1
 * sull'altezza della riga), quindi vale a qualunque dimensione.
 */

import { FillGradient, Text, TextStyle, type TextStyleOptions } from 'pixi.js';
import { FONT_STACK } from '@/core/fonts';
import { PALETTE } from '@/art/palette';

/** Gradiente oro verticale, condiviso: un FillGradient costruisce una texture. */
let goldGradient: FillGradient | null = null;
function gold(): FillGradient {
  if (!goldGradient) {
    const G = PALETTE.gold;
    goldGradient = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      textureSpace: 'local',
      colorStops: [
        { offset: 0, color: G.hot },
        { offset: 0.3, color: G.light },
        { offset: 0.58, color: G.core },
        { offset: 1, color: G.deep },
      ],
    });
  }
  return goldGradient;
}

export type TextPreset = 'title' | 'gold' | 'label' | 'value' | 'small' | 'numeric';

function preset(kind: TextPreset, size: number): TextStyleOptions {
  const shadow = { color: PALETTE.plum.abyss, alpha: 0.6, blur: size * 0.14, distance: size * 0.04, angle: Math.PI / 2 };
  switch (kind) {
    // Insegne: vincite, nome del gioco, banner dei giri gratis.
    case 'title':
      return {
        fontFamily: FONT_STACK.display,
        fontWeight: '900',
        fontSize: size,
        fill: gold(),
        stroke: { color: PALETTE.gold.shadow, width: Math.max(2, size * 0.05), join: 'round' },
        dropShadow: shadow,
        letterSpacing: size * 0.03,
        align: 'center',
        padding: size * 0.3,
      };
    case 'gold':
      return {
        fontFamily: FONT_STACK.display,
        fontWeight: '800',
        fontSize: size,
        fill: gold(),
        stroke: { color: PALETTE.gold.shadow, width: Math.max(1, size * 0.04), join: 'round' },
        dropShadow: shadow,
        letterSpacing: size * 0.03,
        align: 'center',
        padding: size * 0.25,
      };
    case 'label':
      return {
        fontFamily: FONT_STACK.ui,
        fontWeight: '700',
        fontSize: size,
        fill: PALETTE.text.soft,
        letterSpacing: size * 0.04,
        align: 'center',
      };
    // Cifre: cifre tabellari, per non far "ballare" un contatore che sale.
    case 'numeric':
      return {
        fontFamily: FONT_STACK.num,
        fontWeight: '800',
        fontSize: size,
        fill: gold(),
        stroke: { color: PALETTE.gold.shadow, width: Math.max(2, size * 0.06), join: 'round' },
        dropShadow: shadow,
        align: 'center',
        padding: size * 0.25,
      };
    case 'value':
      return {
        fontFamily: FONT_STACK.ui,
        fontWeight: '800',
        fontSize: size,
        fill: PALETTE.text.strong,
        align: 'center',
      };
    case 'small':
    default:
      return {
        fontFamily: FONT_STACK.ui,
        fontWeight: '600',
        fontSize: size,
        fill: PALETTE.text.soft,
        align: 'center',
      };
  }
}

/** Stile di testo pronto all'uso. `extra` sovrascrive campi singoli. */
export function textStyle(kind: TextPreset, size: number, extra: Partial<TextStyleOptions> = {}): TextStyle {
  return new TextStyle({ ...preset(kind, size), ...extra });
}

/** Testo centrato (anchor 0.5) con un preset. */
export function makeText(text: string, kind: TextPreset, size: number, extra: Partial<TextStyleOptions> = {}): Text {
  const t = new Text({ text, style: textStyle(kind, size, extra) });
  t.anchor.set(0.5);
  return t;
}
