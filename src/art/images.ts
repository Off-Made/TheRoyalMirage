/**
 * THE ROYAL MIRAGE — Asset raster (foto e icone 3D)
 *
 * Tutto cio' che e' FIGURA in questo casino' viene da qui: foto notturne
 * della Strip e icone 3D renderizzate (licenze in `docs/CREDITS.md`). Il
 * codice non disegna figure; compone queste immagini con tipografia e
 * gradienti di materiale.
 *
 * I file vivono in `public/assets/` e sono prodotti da
 * `tools/build-assets.mjs` (WebP, icone a 256 px, foto <= 1920 px).
 *
 * ── Due modi di usarle ──
 *   DOM:  `iconUrl('crown')` dentro un `<img>` o un `background-image`.
 *   Pixi: `await preloadImages([...])` e poi `imageTexture(url)` sincrono.
 * Il caricamento e' sempre asincrono; la lettura e' sincrona solo per cio'
 * che e' gia' stato precaricato, cosi' una scena non costruisce mai uno
 * sprite con una texture vuota.
 */

import { Texture } from 'pixi.js';

const BASE = `${import.meta.env.BASE_URL}assets/`;

/** Le icone disponibili: il nome e' quello del file in `public/assets/icons/`. */
export type IconName =
  | 'cherries' | 'bell' | 'gem-stone' | 'glowing-star' | 'star' | 'four-leaf-clover' | 'watermelon'
  | 'grapes' | 'tangerine' | 'lemon' | 'trophy' | 'clapper-board' | 'movie-camera'
  | 'bottle-with-popping-cork' | 'top-hat' | 'popcorn' | 'crown' | 'coin' | 'money-bag' | 'ring'
  | 'game-die' | 'slot-machine' | 'sparkles' | 'kiss-mark' | 'party-popper' | 'spade-suit'
  | 'heart-suit' | 'diamond-suit' | 'club-suit' | 'joker' | 'wrapped-gift' | 'gear' | 'fire'
  | 'chart-increasing' | 'admission-tickets' | 'clinking-glasses' | 'red-heart';

/** Le foto di sfondo. `-m` e' la variante leggera per schermi stretti. */
export type PhotoName = 'strip' | 'strip-m' | 'bellagio' | 'skyline' | 'lights' | 'strip-blur';

export const iconUrl = (name: IconName): string => `${BASE}icons/${name}.webp`;
export const photoUrl = (name: PhotoName): string => `${BASE}bg/${name}.webp`;

const images = new Map<string, Promise<HTMLImageElement>>();
const ready = new Map<string, HTMLImageElement>();
const textures = new Map<string, Texture>();

/** Carica (una volta sola) e decodifica un'immagine. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  let p = images.get(url);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        ready.set(url, img);
        resolve(img);
      };
      img.onerror = () => reject(new Error(`Immagine non caricata: ${url}`));
      img.src = url;
    });
    images.set(url, p);
  }
  return p;
}

/**
 * Precarica un insieme di immagini. Non lancia: un'icona mancante non deve
 * impedire di giocare. Chi la legge dopo ricevera' `Texture.EMPTY`.
 */
export async function preloadImages(urls: readonly string[]): Promise<void> {
  const results = await Promise.allSettled(urls.map(loadImage));
  if (import.meta.env.DEV) {
    for (const r of results) if (r.status === 'rejected') console.warn('[images]', r.reason);
  }
}

/** L'immagine gia' decodificata, o `null` se non e' stata precaricata. */
export function loadedImage(url: string): HTMLImageElement | null {
  return ready.get(url) ?? null;
}

/** Texture Pixi di un'immagine precaricata. Memoizzata: una sola sorgente GPU per file. */
export function imageTexture(url: string): Texture {
  const cached = textures.get(url);
  if (cached) return cached;
  const img = ready.get(url);
  if (!img) {
    if (import.meta.env.DEV) console.warn(`[images] ${url} letta prima del precaricamento`);
    return Texture.EMPTY;
  }
  const tex = Texture.from(img);
  tex.source.scaleMode = 'linear';
  textures.set(url, tex);
  return tex;
}
