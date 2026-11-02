/** THE ROYAL MIRAGE — Transizione "fade" (estratta da SceneManager). */
import { Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import { game } from '@/core/App';
import { PALETTE } from '@/art/palette';
import type { Transition } from './types';

/** Dissolvenza su luce. Economica, per i cambi rapidi fra menu, lobby e gioco. */
export function fadeTransition(): Transition {
  const view = new Container();
  const r = game.screenRect;
  const g = new Graphics().rect(r.x, r.y, r.width, r.height).fill(PALETTE.plum.base);
  g.alpha = 0;
  view.addChild(g);
  return {
    view,
    cover: () =>
      new Promise<void>((res) => {
        gsap.to(g, { alpha: 1, duration: 0.16, ease: 'power2.in', onComplete: res });
      }),
    reveal: () =>
      new Promise<void>((res) => {
        gsap.to(g, { alpha: 0, duration: 0.22, ease: 'power2.out', onComplete: res });
      }),
  };
}
