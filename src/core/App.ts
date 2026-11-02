/**
 * THE ROYAL MIRAGE — Bootstrap del renderer
 *
 * Incapsula l'Application Pixi e le decisioni globali di rendering:
 * backend (WebGPU con fallback WebGL2), device pixel ratio, resize,
 * e il "design space" virtuale.
 *
 * ── Design space ──
 * Tutte le scene disegnano in uno spazio logico fisso 1920x1080 e vengono
 * poi scalate con "fit" (letterbox) dentro la finestra reale. Questo rende il
 * layout deterministico: una slot machine posizionata a (960, 540) e' al centro
 * su qualunque schermo, senza matematica responsive sparsa nel codice.
 */

import { Application, ColorMatrixFilter, Container, Rectangle } from 'pixi.js';
import { PALETTE, mix } from '@/art/palette';

export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;

export type RendererBackend = 'webgpu' | 'webgl';

export interface Viewport {
  /** Scala applicata al design space. */
  scale: number;
  /** Offset in pixel CSS del design space dentro la finestra (letterbox). */
  offsetX: number;
  offsetY: number;
  /** Dimensioni reali della finestra in pixel CSS. */
  screenWidth: number;
  screenHeight: number;
  /**
   * Schermo da telefono (lato corto <= 500 px CSS). L'HUD passa a misure in
   * pixel reali (`hud.css`, `.is-compact`) e le scene di gioco adattano il
   * mondo alla fascia fra le due barre (`GameScene.fitWorld`).
   */
  compact: boolean;
  /** Finestra piu' alta che larga. */
  portrait: boolean;
}

/** Lato corto, in px CSS, sotto il quale lo schermo e' considerato un telefono. */
export const COMPACT_MAX_SIDE = 500;

class GameApp {
  app!: Application;
  backend: RendererBackend = 'webgl';

  /** Radice del design space: tutto il gioco va qui dentro. */
  stage!: Container;


  viewport: Viewport = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    screenWidth: DESIGN_WIDTH,
    screenHeight: DESIGN_HEIGHT,
    compact: false,
    portrait: false,
  };

  private resizeListeners = new Set<(v: Viewport) => void>();
  private initialized = false;

  async init(container: HTMLElement): Promise<void> {
    if (this.initialized) return;

    this.app = new Application();

    // Pixi v8 sceglie WebGPU se disponibile. Lo chiediamo esplicitamente con
    // `preference` e leggiamo poi cosa ha effettivamente ottenuto: su molte
    // GPU integrate Windows WebGPU esiste ma e' piu' lento di WebGL2, quindi
    // la preferenza e' un suggerimento, non una garanzia.
    await this.app.init({
      preference: 'webgpu',
      background: PALETTE.plum.base,
      antialias: true,
      // Cap a 2: oltre non si distingue e il costo di fill rate quadruplica.
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      resizeTo: window,
      powerPreference: 'high-performance',
      // Necessario per poter fare screenshot / export del canvas.
      preserveDrawingBuffer: false,
    });

    this.backend = (this.app.renderer.type === 2 ? 'webgpu' : 'webgl') as RendererBackend;

    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.id = 'game-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);

    this.stage = new Container();
    this.stage.label = 'design-root';
    this.app.stage.addChild(this.stage);

    // Abilitiamo l'hit testing su tutto lo stage ma solo dove serve:
    // `static` = reagisce ai click ma non muove il cursore ogni frame.
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = new Rectangle(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

    this.app.renderer.on('resize', () => this.layout());
    this.layout();

    this.initialized = true;
  }

  private grade: ColorMatrixFilter | null = null;

  /**
   * Grading cromatico finale ("Qualita' alta" e "Ultra").
   *
   * Un solo passaggio a schermo intero, quindi niente split-toning: una
   * matrice colore e' lineare e non puo' tingere ombre e luci in modo
   * diverso. Fa tre cose, tutte piccole: un filo di contrasto (i neri
   * dell'ossidiana diventano piu' profondi e l'oro piu' acceso), un po' di
   * saturazione, e un leggerissimo spostamento verso il caldo — rosso su,
   * blu giu' — che e' la luce delle lampade a olio del palazzo. Spinto
   * oltre, l'avorio diventa giallo e lo smeraldo verde marcio: e' per
   * questo che i valori sono cosi' bassi.
   *
   * `filterArea` fissa: senza, Pixi ricalcolerebbe a ogni frame i limiti di
   * tutto l'albero della scena per sapere quanto e' grande il filtro.
   */
  setColorGrade(on: boolean): void {
    if (!this.initialized) return;
    if (!on) {
      this.app.stage.filters = [];
      return;
    }
    if (!this.grade) {
      const f = new ColorMatrixFilter();
      f.contrast(0.08, false);
      f.saturate(0.06, true);
      // Tinta calda (rosso pieno, verde e blu appena sotto) e una
      // luminosita' che restituisce cio' che la tinta toglie: il bilancio
      // netto e' lo spostamento di colore, non un'immagine piu' scura.
      f.tint(mix(PALETTE.white, PALETTE.gold.hot, 0.55), true);
      f.brightness(1.03, true);
      this.grade = f;
    }
    this.app.stage.filters = [this.grade];
    this.app.stage.filterArea = new Rectangle(0, 0, this.viewport.screenWidth, this.viewport.screenHeight);
  }

  /** Ricalcola scala e letterbox del design space. */
  private layout(): void {
    // `screen` e' gia' in pixel CSS. Dividere `renderer.width` per la
    // risoluzione (come si faceva in Pixi 7) in Pixi 8 dimezzava la scala su
    // ogni schermo ad alta densita': su un iPhone (dpr 3) il gioco era un terzo.
    const sw = this.app.renderer.screen.width;
    const sh = this.app.renderer.screen.height;

    const scale = Math.min(sw / DESIGN_WIDTH, sh / DESIGN_HEIGHT);
    const offsetX = (sw - DESIGN_WIDTH * scale) / 2;
    const offsetY = (sh - DESIGN_HEIGHT * scale) / 2;

    this.stage.scale.set(scale);
    this.stage.position.set(offsetX, offsetY);

    this.app.stage.hitArea = new Rectangle(0, 0, sw, sh);
    if (this.grade && this.app.stage.filters?.length) {
      this.app.stage.filterArea = new Rectangle(0, 0, sw, sh);
    }

    const compact = Math.min(sw, sh) <= COMPACT_MAX_SIDE;
    const portrait = sh > sw;
    this.viewport = { scale, offsetX, offsetY, screenWidth: sw, screenHeight: sh, compact, portrait };

    // Esponiamo la geometria al layer CSS, cosi' l'overlay HTML puo'
    // allinearsi esattamente al canvas (es. cornici intorno ai rulli).
    const root = document.documentElement;
    root.style.setProperty('--vp-scale', String(scale));
    root.style.setProperty('--vp-offset-x', `${offsetX}px`);
    root.style.setProperty('--vp-offset-y', `${offsetY}px`);
    root.style.setProperty('--vp-width', `${DESIGN_WIDTH * scale}px`);
    root.style.setProperty('--vp-height', `${DESIGN_HEIGHT * scale}px`);
    // Spazio fra il design space e il bordo della finestra, in px di DESIGN:
    // serve agli elementi dell'HUD che devono arrivare fino al bordo.
    root.style.setProperty('--vp-ext-x', `${offsetX / scale}px`);
    root.style.setProperty('--vp-ext-y', `${offsetY / scale}px`);
    root.classList.toggle('is-compact', compact);
    root.classList.toggle('is-portrait', portrait);

    for (const fn of this.resizeListeners) fn(this.viewport);
  }

  onResize(fn: (v: Viewport) => void): () => void {
    this.resizeListeners.add(fn);
    return () => this.resizeListeners.delete(fn);
  }

  /**
   * L'intera finestra espressa in coordinate di design.
   *
   * Il gioco si dispone in 1920x1080 e viene scalato "fit": su una finestra
   * di proporzioni diverse avanza spazio ai lati (o sopra e sotto). Cio' che
   * deve arrivare fino ai bordi dello schermo — sfondo, veli, transizioni —
   * si dimensiona su questo rettangolo, cosi' le bande non esistono: i
   * contenuti restano proporzionati e centrati, l'ambiente riempie tutto.
   */
  get screenRect(): Rectangle {
    const { scale, offsetX, offsetY, screenWidth, screenHeight } = this.viewport;
    return new Rectangle(-offsetX / scale, -offsetY / scale, screenWidth / scale, screenHeight / scale);
  }

  /** Converte coordinate finestra → coordinate design space. */
  toDesignSpace(clientX: number, clientY: number): { x: number; y: number } {
    const { scale, offsetX, offsetY } = this.viewport;
    return { x: (clientX - offsetX) / scale, y: (clientY - offsetY) / scale };
  }

  get ticker() {
    return this.app.ticker;
  }

  /** FPS corrente, per l'overlay di debug. */
  get fps(): number {
    return this.app.ticker.FPS;
  }
}

/** Singleton: c'e' un solo renderer per pagina. */
export const game = new GameApp();
