/**
 * THE ROYAL MIRAGE — Palcoscenico dei bonus delle slot
 *
 * Ruota, cascata e forzieri vivono in file propri. La scena della slot
 * presta loro solo cio' che serve (cornice, rulli, HUD, presentatore,
 * tempi) attraverso questa interfaccia: i bonus non toccano la regia del
 * giro e la scena non conosce i dettagli dei bonus.
 *
 * Qui stanno anche i pezzi d'interfaccia comuni ai tre bonus: il pulsante
 * grande sotto il gioco (GIRA!, APRI) e il pannello laterale.
 */

import { Container, Graphics, Sprite } from 'pixi.js';
import { gsap } from 'gsap';
import { bake } from '@/art/textureCache';
import { drawBonusButton } from '@/art/bonusArt';
import { PALETTE } from '@/art/palette';
import { makeText } from '@/games/common/text';
import type { GameHud } from '@/games/common/GameHud';
import type { WinPresenter } from '@/games/common/WinPresenter';
import type { MachineDef } from '../engine/types';
import type { ReelView } from './ReelView';
import type { FrameGeometry } from './frame';
import { sfxConfirm } from '@/audio/synth';

export interface BonusStage {
  readonly m: MachineDef;
  readonly world: Container;
  /** Strato sopra tutto (cartelli, scintille). */
  readonly fx: Container;
  /** La macchina intera (cornice + rulli), con il perno al suo centro. */
  readonly machine: Container;
  readonly reelLayer: Container;
  readonly reels: readonly ReelView[];
  readonly presenter: WinPresenter;
  readonly hud: GameHud;
  readonly geo: FrameGeometry;
  /** Origine della finestra dei rulli nel design space. */
  readonly ox: number;
  readonly oy: number;
  readonly symbolScale: number;
  texture(id: string): import('pixi.js').Texture;
  /** Arresto rapido richiesto dal giocatore (secondo click). */
  quick(): boolean;
  resetQuick(): void;
  turbo(): boolean;
  /** Gioco automatico attivo: i pulsanti dei bonus si premono da soli. */
  auto(): boolean;
  reducedMotion(): boolean;
  disposed(): boolean;
  shake(amp: number, dur: number): void;
  titleCard(text: string, sub: string, tint: number, hold: number): Promise<void>;
  /**
   * Aspetta che il giocatore prema il pulsante principale dell'HUD con
   * l'etichetta data (o chiami `press()`). In automatico si preme da solo.
   */
  waitPress(label: string, enabled?: () => boolean): Promise<void>;
  /** Preme il pulsante in attesa (il pulsante grande del bonus lo usa). */
  press(): void;
  /** Riallinea l'HUD al pulsante del bonus (abilitato o no). */
  setPressEnabled(on: boolean): void;
}

/** Attesa in secondi, interrompibile da una condizione (arresto rapido). */
export function wait(sec: number, interrupt: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const end = performance.now() + sec * 1000;
    const loop = () => {
      if (interrupt() || performance.now() >= end) resolve();
      else requestAnimationFrame(loop);
    };
    loop();
  });
}

export interface BonusButton {
  view: Container;
  setEnabled(on: boolean): void;
  setLabel(text: string): void;
}

/**
 * Pulsante grande dei bonus: la pillola rossa con l'anello d'oro, la stessa
 * famiglia del pulsante GIRA dell'HUD, ma dentro la scena, sotto il gioco.
 */
export function bonusButton(label: string, onTap: () => void, w = 360, h = 112): BonusButton {
  const view = new Container();
  const on = new Sprite(bake(`bonus/btn-on-${w}x${h}`, w, h, (ctx, bw, bh) => drawBonusButton(ctx, bw, bh, true)));
  const off = new Sprite(bake(`bonus/btn-off-${w}x${h}`, w, h, (ctx, bw, bh) => drawBonusButton(ctx, bw, bh, false)));
  for (const s of [on, off]) s.anchor.set(0.5);
  off.visible = false;
  const text = makeText(label, 'title', Math.round(h * 0.4));
  text.y = -2;
  view.addChild(on, off, text);
  let enabled = true;
  view.eventMode = 'static';
  view.cursor = 'pointer';
  view.on('pointerover', () => enabled && gsap.to(view.scale, { x: 1.05, y: 1.05, duration: 0.15 }));
  view.on('pointerout', () => gsap.to(view.scale, { x: 1, y: 1, duration: 0.15 }));
  view.on('pointertap', () => {
    if (!enabled) return;
    sfxConfirm();
    gsap.fromTo(view.scale, { x: 0.94, y: 0.94 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(3)' });
    onTap();
  });
  // Respiro leggero mentre aspetta: si capisce che va premuto.
  const pulse = gsap.to(on, { alpha: 0.82, duration: 0.7, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  view.once('destroyed', () => {
    pulse.kill();
    gsap.killTweensOf(view.scale);
  });
  return {
    view,
    setEnabled(v: boolean) {
      enabled = v;
      on.visible = v;
      off.visible = !v;
      view.cursor = v ? 'pointer' : 'default';
      text.alpha = v ? 1 : 0.5;
    },
    setLabel(t: string) {
      text.text = t;
    },
  };
}

export interface SidePanel {
  view: Container;
  /** Righe: etichetta piccola + valore grande. */
  set(i: number, value: string): void;
  bump(i: number): void;
}

/** Pannello laterale dei bonus, stesso stile del pannello dei giri gratis. */
export function sidePanel(labels: readonly string[], width = 300): SidePanel {
  const view = new Container();
  const rowH = 96;
  const h = 30 + labels.length * rowH;
  view.addChild(
    new Graphics()
      .roundRect(0, 0, width, h, 24)
      .fill({ color: PALETTE.plum.raised, alpha: 0.92 })
      .stroke({ color: PALETTE.gold.core, width: 2, alpha: 0.8 })
  );
  const values = labels.map((l, i) => {
    const y = 26 + i * rowH;
    const lab = makeText(l.toUpperCase(), 'label', 16);
    lab.position.set(width / 2, y + 14);
    const v = makeText('', i === 0 ? 'numeric' : 'gold', i === 0 ? 50 : 38);
    v.position.set(width / 2, y + 56);
    view.addChild(lab, v);
    return v;
  });
  return {
    view,
    set: (i, value) => {
      const v = values[i];
      if (v) v.text = value;
    },
    bump: (i) => {
      const v = values[i];
      if (v) gsap.fromTo(v.scale, { x: 1.45, y: 1.45 }, { x: 1, y: 1, duration: 0.45, ease: 'back.out(2.2)' });
    },
  };
}
