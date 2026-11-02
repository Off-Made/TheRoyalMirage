/**
 * THE ROYAL MIRAGE — Cache di texture procedurali
 *
 * Tutta l'arte del gioco nasce qui: una funzione di disegno Canvas2D viene
 * eseguita UNA VOLTA, caricata sulla GPU come Texture Pixi, e poi riusata
 * per tutta la sessione.
 *
 * Perche' importa: disegnare un falco vettoriale con 40 tracciati e 6 gradienti
 * costa ~2ms in Canvas2D. Farlo 15 volte per frame (una per simbolo visibile)
 * ucciderebbe il framerate. Facendolo una volta e usando sprite, il costo per
 * frame crolla a una singola draw call in batch.
 */

import { CanvasSource, Texture } from 'pixi.js';
import type { Ctx } from './materials';

/** Funzione che dipinge un'icona dentro un canvas `size x size` (o w x h). */
export type DrawFn = (ctx: Ctx, w: number, h: number) => void;

const cache = new Map<string, Texture>();

/** Risoluzione di bake. 2 = texture a densita' doppia, nitide su schermi HiDPI. */
let bakeResolution = 2;

export function setBakeResolution(r: number): void {
  bakeResolution = Math.max(1, Math.min(3, r));
}

export function getBakeResolution(): number {
  return bakeResolution;
}

/**
 * Cuoce una funzione di disegno in una Texture, con cache per chiave.
 *
 * Il canvas e' fisicamente `w*res x h*res` px ma il contesto e' scalato,
 * quindi la funzione di disegno lavora sempre in coordinate logiche.
 */
export interface BakeOptions {
  /**
   * Risoluzione di QUESTA texture, al posto di quella globale.
   *
   * Una texture costa `w × h × 4 × res²` byte di VRAM. Gradienti, aloni,
   * vignette e livelli gia' sfocati non guadagnano nulla da res 2: e' il
   * quadruplo della memoria per pixel che nessuno distingue. Per questi
   * livelli si passa `res: 1`.
   */
  res?: number;
}

export function bake(key: string, w: number, h: number, draw: DrawFn, opts: BakeOptions = {}): Texture {
  const cached = cache.get(key);
  if (cached) return cached;

  // Mai sopra la risoluzione globale: se l'utente ha scelto la qualita'
  // bassa, un livello non deve poterla scavalcare.
  const res = Math.min(bakeResolution, opts.res ?? bakeResolution);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w * res));
  canvas.height = Math.max(1, Math.ceil(h * res));

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas2D non disponibile: impossibile generare le texture.');

  ctx.scale(res, res);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx, w, h);

  // ATTENZIONE: la risoluzione va dichiarata alla CREAZIONE della sorgente.
  // `Texture.from(canvas)` assume resolution 1 e calcola subito frame/orig in
  // pixel fisici; impostare `source.resolution` dopo non li ricalcola, e ogni
  // sprite finisce grande `res` volte il dovuto. Passando width/height logici
  // insieme a resolution, Pixi sa che il canvas e' a densita' doppia.
  const source = new CanvasSource({
    resource: canvas,
    width: w,
    height: h,
    resolution: res,
    scaleMode: 'linear',
    antialias: true,
    autoDensity: false,
  });
  const texture = new Texture({ source });
  cache.set(key, texture);
  return texture;
}

// ─────────────────────────────────────────────── NAMESPACE

/**
 * Le scenografie usano chiavi con namespace (`env/desert/sky`) per due
 * ragioni: due ambienti possono avere un livello "sky" diverso, e un intero
 * ambiente deve poter essere liberato senza toccare simboli, carte e fiche.
 */
export function nsKey(ns: string, key: string): string {
  return `env/${ns}/${key}`;
}

export function bakeIn(ns: string, key: string, w: number, h: number, draw: DrawFn, opts?: BakeOptions): Texture {
  return bake(nsKey(ns, key), w, h, draw, opts);
}

/**
 * Conteggio dei riferimenti per namespace.
 *
 * Lo stesso ambiente puo' essere in uso da piu' Backdrop contemporaneamente
 * (lo sfondo persistente del menu E quello di una scena di gioco, durante
 * la transizione). Liberare al primo smontaggio distruggerebbe texture che
 * l'altro sta ancora disegnando: si libera solo quando il conto torna a zero.
 */
const nsRefs = new Map<string, number>();

export function retainNamespace(ns: string): void {
  nsRefs.set(ns, (nsRefs.get(ns) ?? 0) + 1);
}

/** Restituisce il numero di texture effettivamente distrutte. */
export function releaseNamespace(ns: string): number {
  const n = (nsRefs.get(ns) ?? 0) - 1;
  if (n > 0) {
    nsRefs.set(ns, n);
    return 0;
  }
  nsRefs.delete(ns);
  const prefix = `env/${ns}/`;
  let freed = 0;
  for (const [key, tex] of cache) {
    if (!key.startsWith(prefix)) continue;
    tex.destroy(true);
    cache.delete(key);
    freed++;
  }
  return freed;
}

/** Variante quadrata, il caso piu' comune per i simboli. */
export function bakeSquare(key: string, size: number, draw: DrawFn): Texture {
  return bake(key, size, size, draw);
}

/** Texture gia' presente in cache, se c'e'. */
export function peek(key: string): Texture | undefined {
  return cache.get(key);
}

export function cacheSize(): number {
  return cache.size;
}

/** Libera tutto (usato solo al cambio di preset qualita', che richiede re-bake). */
export function clearTextureCache(): void {
  for (const tex of cache.values()) tex.destroy(true);
  cache.clear();
}

/**
 * Canvas scratch riutilizzabile per calcoli intermedi (es. maschere, pattern).
 * Evita di allocare un canvas nuovo dentro un ciclo di disegno.
 */
let scratch: HTMLCanvasElement | null = null;
export function scratchCtx(w: number, h: number): Ctx {
  if (!scratch) scratch = document.createElement('canvas');
  scratch.width = w;
  scratch.height = h;
  const ctx = scratch.getContext('2d');
  if (!ctx) throw new Error('Canvas2D non disponibile.');
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

/**
 * Contesto offscreen INDIPENDENTE, a differenza di `scratchCtx`.
 *
 * `scratchCtx` e' un solo canvas condiviso: una funzione di disegno che lo
 * usa mentre la funzione che l'ha chiamata lo sta gia' usando li corrompe
 * entrambe. Le scenografie compongono sotto-immagini (lo skyline dentro le
 * vetrate, le silhouette riflesse nel pavimento) e devono usare questo.
 */
export function offscreenCtx(w: number, h: number): Ctx {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas2D non disponibile.');
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return ctx;
}

/**
 * Crea un CanvasPattern ripetibile da una funzione di disegno su tile.
 * Usato per i motivi geometrici islamici di fondo.
 */
export function makePattern(ctx: Ctx, tile: number, draw: DrawFn): CanvasPattern | null {
  const c = document.createElement('canvas');
  c.width = tile;
  c.height = tile;
  const tctx = c.getContext('2d');
  if (!tctx) return null;
  draw(tctx, tile, tile);
  return ctx.createPattern(c, 'repeat');
}
