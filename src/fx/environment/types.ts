/**
 * THE ROYAL MIRAGE — Descrizione dichiarativa di un ambiente
 *
 * Un ambiente e' una lista ORDINATA di livelli, dal fondo al primo piano.
 * Ogni livello dichiara come dati cio' che il `Backdrop` deve fare con lui —
 * profondita' di parallasse, oscillazione, animazione, qualita' minima — e
 * porta una piccola `make()` che costruisce l'oggetto grafico.
 *
 * Cio' che DEVE essere uniforme — parallasse, animazioni, ciclo di vita,
 * memoria — e' dato; la `make()` di ciascun livello si limita a posare una
 * foto o un alone.
 */

import type { Container } from 'pixi.js';
import type { BakeOptions, DrawFn } from '@/art/textureCache';
import type { Texture } from 'pixi.js';

export type Quality = 'low' | 'medium' | 'high';

const RANK: Record<Quality, number> = { low: 0, medium: 1, high: 2 };
export const atLeast = (q: Quality, min: Quality): boolean => RANK[q] >= RANK[min];

/** Animazioni ricorrenti, descritte come dati: `update()` le applica tutte. */
export type LayerAnim =
  /** alpha = base + a1·sin(t·f1) + a2·sin(t·f2). Due frequenze incommensurabili = nessun periodo percepibile. */
  | { kind: 'alpha'; base: number; a1: number; f1: number; a2?: number; f2?: number }
  /** rotazione = amp·sin(t·freq). */
  | { kind: 'rotate'; amp: number; freq: number };

/** Strumenti che il Backdrop passa a ogni `make()`. */
export interface EnvBuildContext {
  quality: Quality;
  /** Larghezza dei livelli in parallasse (piu' larghi dello schermo per avere margine). */
  W: number;
  /** Ascissa a cui posare un livello largo `W` perche' resti centrato. */
  ox: number;
  /** `bake` con il namespace dell'ambiente gia' applicato. */
  tex: (key: string, w: number, h: number, draw: DrawFn, opts?: BakeOptions) => Texture;
}

export interface LayerSpec {
  /** Solo per il debug e l'etichetta del nodo. */
  key: string;
  /**
   * Profondita' di parallasse: 0 = immobile (infinito), 1 = primo piano.
   * `null` = nessuna parallasse (emettitori di particelle, che si muovono da soli).
   */
  depth: number | null;
  /** Ampiezza dell'oscillazione verticale lenta, in px. */
  bob?: number;
  anim?: LayerAnim;
  /** Sotto questa qualita' il livello non viene nemmeno costruito. */
  minQuality?: Quality;
  make: (c: EnvBuildContext) => Container;
}

export interface EnvironmentSpec {
  /** Namespace delle texture: unico e stabile. */
  id: string;
  /** Immagini da precaricare prima di costruire i livelli (vedi `Backdrop.prepare`). */
  images?: readonly string[];
  layers: LayerSpec[];
  /** Vignettatura sopra a tutto (ma sotto l'abbassamento `dim`). */
  vignette?: { draw: DrawFn; w: number; h: number };
  /**
   * Ampiezza della parallasse in px. Un interno deve muoversi MENO di un
   * esterno, altrimenti legge come una carrellata dentro un diorama.
   */
  amp?: { x: number; y: number };
  /** Colore d'ambiente per le scene che vogliono armonizzarsi col fondo. */
  ambient: number;
}
