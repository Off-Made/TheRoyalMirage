/**
 * THE ROYAL MIRAGE — Transizione "fiche"
 *
 * Sostituisce l'iride (un disco scuro che si apriva e richiudeva). Un velo
 * di velluto rosso marquee sale in dissolvenza e al centro gira la fiche
 * della casa — monogramma RM, scritta THE ROYAL MIRAGE sull'anello — come
 * nelle schermate di caricamento dei casino' online. Poi la fiche si
 * allontana e il velo si scioglie sulla scena nuova.
 *
 * ── Perche' la fiche gira anche "fra" cover e reveal ──
 * Fra le due fasi il SceneManager scambia la scena, e il caricatore del
 * gioco e' un import asincrono: puo' durare un istante come mezzo secondo.
 * Una fiche ferma in quel tempo sembrerebbe un blocco; una fiche che gira e'
 * un indicatore di caricamento che non ha bisogno di spiegazioni.
 *
 * ── Il flip senza 3D ──
 * `scale.x = cos(φ)` su un disco piatto si legge come una rotazione
 * sull'asse verticale. Quando il coseno e' negativo si vede il retro (la
 * stessa faccia, un tono piu' scura): e' quel cambio di luce a far credere
 * all'occhio che la moneta abbia due lati. Il disegno della fiche e' in
 * `art/houseChip.ts`, condiviso col Golden Chip.
 */
import { Container, Sprite, type Texture } from 'pixi.js';
import { gsap } from 'gsap';
import { DESIGN_HEIGHT, DESIGN_WIDTH, game } from '@/core/App';
import { PALETTE, css, rgba, shade } from '@/art/palette';
import { bake } from '@/art/textureCache';
import { houseChipTexture } from '@/art/houseChip';
import { settings } from '@/state/store';
import type { Transition } from './types';

const TAU = Math.PI * 2;
/** Il velo e' un gradiente: cotto piccolo e scalato, non perde nulla. */
const VEIL_W = 480;
const VEIL_H = 270;

function veilTexture(): Texture {
  return bake(
    'fx/chip-veil',
    VEIL_W,
    VEIL_H,
    (ctx, w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(w, h) / 2);
      // Monotono dal centro al bordo: un anello piu' scuro a meta' strada
      // si leggerebbe come un secondo cerchio, cioe' di nuovo un'iride.
      g.addColorStop(0, css(PALETTE.red.deep));
      g.addColorStop(0.6, css(PALETTE.red.shadow));
      g.addColorStop(1, css(shade(PALETTE.red.shadow, 0.35)));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // Alone d'oro dietro la fiche: la luce della sala che la illumina.
      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, h * 0.42);
      halo.addColorStop(0, rgba(PALETTE.gold.core, 0.18));
      halo.addColorStop(1, rgba(PALETTE.gold.core, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);
    },
    { res: 1 }
  );
}

export function chipTransition(): Transition {
  const view = new Container();
  const reduced = settings().reducedMotion;

  // Il velo copre la finestra intera, non solo il design space: dura meno di
  // un secondo, quindi basta misurarla alla creazione.
  const screen = game.screenRect;
  const veil = new Sprite(veilTexture());
  veil.position.set(screen.x, screen.y);
  veil.width = screen.width;
  veil.height = screen.height;
  veil.alpha = 0;

  const chip = new Container();
  chip.position.set(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2);
  const front = new Sprite(houseChipTexture('red'));
  const back = new Sprite(houseChipTexture('redBack'));
  for (const s of [front, back]) s.anchor.set(0.5);
  back.visible = false;
  chip.addChild(back, front);
  chip.alpha = 0;
  chip.scale.set(reduced ? 1 : 0.6);

  view.addChild(veil, chip);
  // Catturata ora: a `destroyed` emesso, `chip.scale` potrebbe non esserci piu'.
  const zoom = chip.scale;

  // Il flip: un angolo che avanza all'infinito, letto come coseno.
  const spin = { phi: 0 };
  const flip = reduced
    ? null
    : gsap.to(spin, {
        phi: TAU,
        duration: 0.9,
        ease: 'none',
        repeat: -1,
        onUpdate: () => {
          const c = Math.cos(spin.phi);
          // Mai esattamente 0: una fiche di taglio sparirebbe per un frame.
          const sx = Math.max(0.04, Math.abs(c));
          front.visible = c >= 0;
          back.visible = c < 0;
          front.scale.x = sx;
          back.scale.x = sx;
        },
      });
  // Anche se la transizione viene smontata per un errore a meta', il tween
  // infinito non deve sopravvivere ai suoi sprite.
  view.once('destroyed', () => {
    flip?.kill();
    gsap.killTweensOf([veil, chip, zoom]);
  });

  return {
    view,
    cover: () =>
      new Promise<void>((res) => {
        gsap.to(veil, { alpha: 1, duration: 0.22, ease: 'power2.out' });
        gsap.to(chip, { alpha: 1, duration: 0.18, ease: 'power1.out' });
        if (reduced) {
          gsap.delayedCall(0.24, res);
          return;
        }
        gsap.to(zoom, { x: 1, y: 1, duration: 0.26, ease: 'back.out(1.6)', onComplete: res });
      }),
    reveal: () =>
      new Promise<void>((res) => {
        gsap.to(chip, { alpha: 0, duration: 0.2, ease: 'power1.in' });
        if (!reduced) gsap.to(zoom, { x: 1.12, y: 1.12, duration: 0.22, ease: 'power2.in' });
        gsap.to(veil, { alpha: 0, duration: 0.28, delay: 0.04, ease: 'power2.inOut', onComplete: res });
      }),
  };
}
