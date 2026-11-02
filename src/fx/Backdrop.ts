/**
 * THE ROYAL MIRAGE — Sfondo in parallasse
 *
 * Container riutilizzabile: ogni scena ne crea uno e lo mette in fondo.
 * COSA disegnare lo dice un `EnvironmentSpec` (vedi fx/environment/); questa
 * classe sa solo COME: parallasse, animazioni, ciclo di vita delle texture e
 * passaggio da un ambiente all'altro.
 *
 * ── Parallasse senza telecamera ──
 * Non abbiamo una camera: muoviamo i livelli in funzione di un offset
 * "sguardo" (mouse o animazione lenta) moltiplicato per la profondita'.
 * Piu' il livello e' vicino, piu' si muove: e' il contrario dell'intuizione
 * di chi lo vede per la prima volta, ma e' come funziona la parallasse reale.
 *
 * ── Texture: mai distruggerle qui ──
 * Le texture appartengono alla cache e sono condivise fra Backdrop (due
 * tavoli diversi usano lo stesso salone).
 * Smontare un ambiente distrugge SOLO gli oggetti grafici e rilascia il
 * namespace: la cache libera la memoria quando nessuno lo usa piu'.
 */

import { Container, Graphics, Sprite } from 'pixi.js';
import { gsap } from 'gsap';
import { DESIGN_HEIGHT, DESIGN_WIDTH, game } from '@/core/App';
import { bakeIn, retainNamespace, releaseNamespace } from '@/art/textureCache';
import { PALETTE } from '@/art/palette';
import { preloadImages } from '@/art/images';
import { Emitter } from './ParticleSystem';
import { getEnvironment, type EnvironmentId } from './environment/registry';
import { atLeast, type EnvironmentSpec, type LayerAnim, type Quality } from './environment/types';

export interface BackdropOptions {
  /** Ambiente da mostrare. Default: il salone. */
  env?: EnvironmentId | EnvironmentSpec;
  /** Intensita' generale: le scene di gioco lo abbassano per non distrarre. */
  dim?: number;
  /** Disattiva blur e animazioni fini sui preset di qualita' bassa. */
  quality?: Quality;
}

interface Layer {
  view: Container;
  depth: number;
  baseX: number;
  baseY: number;
  bob?: number;
  anim?: LayerAnim;
}

interface Built {
  spec: EnvironmentSpec;
  root: Container;
  layers: Layer[];
  emitters: Emitter[];
}

const DEFAULT_AMP = { x: 46, y: 22 };

function resolve(env: BackdropOptions['env']): EnvironmentSpec {
  if (env && typeof env === 'object') return env;
  return getEnvironment(env ?? 'salon');
}

export class Backdrop extends Container {
  private current: Built;
  /** Vignetta + abbassamento: sempre sopra all'ambiente, qualunque esso sia. */
  private readonly veil = new Container();
  private gaze = { x: 0, y: 0 };
  private gazeTarget = { x: 0, y: 0 };
  private time = 0;
  private switching: Promise<void> | null = null;
  private readonly offResize: () => void;

  constructor(private opts: BackdropOptions = {}) {
    super();
    this.label = 'backdrop';
    this.current = this.build(resolve(opts.env));
    this.addChild(this.current.root, this.veil);
    this.buildVeil(this.current.spec);
    this.offResize = game.onResize(() => this.cover());
    this.cover();
  }

  /**
   * Ingrandisce l'ambiente dal centro finche' copre tutta la finestra, come
   * `background-size: cover`. Senza, su una finestra piu' larga del 16:9 si
   * vedevano due colonne ai lati: lo spazio fuori dal design space.
   * Scala uniforme: la foto si ritaglia ai bordi, non si deforma mai.
   */
  private cover(): void {
    if (this.destroyed) return;
    const r = game.screenRect;
    const s = Math.max(1, r.width / DESIGN_WIDTH, r.height / DESIGN_HEIGHT);
    this.scale.set(s);
    this.position.set((DESIGN_WIDTH * (1 - s)) / 2, (DESIGN_HEIGHT * (1 - s)) / 2);
  }

  private get quality(): Quality {
    return this.opts.quality ?? 'high';
  }

  /** Il namespace viene trattenuto QUI e rilasciato solo in `teardown`. */
  private build(spec: EnvironmentSpec): Built {
    retainNamespace(spec.id);
    const q = this.quality;
    // Il design space e' 1920x1080, ma i livelli sono piu' larghi per avere
    // margine di scorrimento: 1.12x copre uno spostamento di ±115px.
    const W = DESIGN_WIDTH * 1.12;
    const ox = -(W - DESIGN_WIDTH) / 2;
    const ctx = {
      quality: q,
      W,
      ox,
      tex: (key: string, w: number, h: number, draw: Parameters<typeof bakeIn>[4], o?: Parameters<typeof bakeIn>[5]) =>
        bakeIn(spec.id, key, w, h, draw, o),
    };

    const root = new Container();
    root.label = `env:${spec.id}`;
    const layers: Layer[] = [];
    const emitters: Emitter[] = [];

    for (const l of spec.layers) {
      if (l.minQuality && !atLeast(q, l.minQuality)) continue;
      const view = l.make(ctx);
      view.label = l.key;
      root.addChild(view);
      if (view instanceof Emitter) emitters.push(view);
      // La posizione di riposo si cattura ORA: `update` la usa come origine e
      // non deve mai leggere la posizione corrente (accumulerebbe la deriva).
      if (l.depth !== null || l.anim) {
        layers.push({ view, depth: l.depth ?? 0, baseX: view.x, baseY: view.y, bob: l.bob, anim: l.anim });
      }
    }
    return { spec, root, layers, emitters };
  }

  private buildVeil(spec: EnvironmentSpec): void {
    for (const c of this.veil.removeChildren()) c.destroy();
    if (spec.vignette) {
      const { draw, w, h } = spec.vignette;
      // Un gradiente radiale cotto in texture: nitido, senza costo di filtro,
      // e con un profilo di caduta controllabile (impossibile con rettangoli).
      const vig = new Sprite(bakeIn(spec.id, 'vignette', w, h, draw, { res: 1 }));
      vig.width = DESIGN_WIDTH;
      vig.height = DESIGN_HEIGHT;
      this.veil.addChild(vig);
    }
    const dim = this.opts.dim ?? 0;
    if (dim > 0) {
      // Il velo spinge la foto indietro verso il prugna del fondo: gli
      // elementi del gioco (oro, panno, neon) staccano per luminosita'.
      this.veil.addChild(
        new Graphics().rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill({ color: PALETTE.plum.base, alpha: dim })
      );
    }
  }

  /**
   * Precarica le foto di un ambiente. Va attesa PRIMA di costruire il
   * Backdrop: la costruzione e' sincrona e legge texture gia' decodificate.
   */
  static async prepare(env: BackdropOptions['env']): Promise<void> {
    const spec = resolve(env);
    if (spec.images?.length) await preloadImages(spec.images);
  }

  private teardown(b: Built): void {
    for (const e of b.emitters) e.stop();
    gsap.killTweensOf(b.root);
    // NIENTE `texture: true`: le texture sono della cache, non nostre.
    b.root.destroy({ children: true });
    releaseNamespace(b.spec.id);
  }

  /** L'ambiente visualizzato. */
  get environment(): EnvironmentSpec {
    return this.current.spec;
  }

  /**
   * Passa a un altro ambiente con una dissolvenza incrociata.
   *
   * La cottura delle texture nuove e' sincrona e puo' costare decine di ms:
   * chi chiama dovrebbe farlo con lo schermo coperto (una transizione),
   * cosi' lo scatto non si vede. Chiamate sovrapposte vengono accodate.
   */
  async setEnvironment(next: EnvironmentId | EnvironmentSpec, fade = 0.45): Promise<void> {
    if (this.switching) await this.switching;
    const spec = resolve(next);
    await Backdrop.prepare(spec);
    if (spec === this.current.spec) return;

    const old = this.current;
    const fresh = this.build(spec);
    fresh.root.alpha = fade > 0 ? 0 : 1;
    this.addChildAt(fresh.root, this.getChildIndex(old.root) + 1);
    this.current = fresh;
    this.buildVeil(spec);

    if (fade <= 0) {
      this.teardown(old);
      return;
    }
    this.switching = new Promise<void>((done) => {
      gsap.to(fresh.root, {
        alpha: 1,
        duration: fade,
        ease: 'power1.inOut',
        onComplete: () => {
          this.teardown(old);
          this.switching = null;
          done();
        },
      });
    });
    await this.switching;
  }

  /**
   * Imposta il punto di sguardo normalizzato (-1..1). Tipicamente dal mouse.
   * Il movimento vero e' smorzato in `update`, cosi' il parallasse non scatta.
   */
  setGaze(nx: number, ny: number): void {
    this.gazeTarget.x = Math.max(-1, Math.min(1, nx));
    this.gazeTarget.y = Math.max(-1, Math.min(1, ny));
  }

  update(dt: number): void {
    this.time += dt;

    // Smorzamento esponenziale indipendente dal framerate.
    const k = 1 - Math.exp(-dt * 3.2);
    this.gaze.x += (this.gazeTarget.x - this.gaze.x) * k;
    this.gaze.y += (this.gazeTarget.y - this.gaze.y) * k;

    const amp = this.current.spec.amp ?? DEFAULT_AMP;
    const t = this.time;
    for (const l of this.current.layers) {
      l.view.x = l.baseX - this.gaze.x * amp.x * l.depth;
      let y = l.baseY - this.gaze.y * amp.y * l.depth;
      if (l.bob) y += Math.sin(t * 0.35) * l.bob;
      l.view.y = y;

      const a = l.anim;
      if (a?.kind === 'alpha') {
        l.view.alpha = a.base + Math.sin(t * a.f1) * a.a1 + (a.a2 && a.f2 ? Math.sin(t * a.f2) * a.a2 : 0);
      } else if (a?.kind === 'rotate') {
        l.view.rotation = Math.sin(t * a.freq) * a.amp;
      }
    }

    for (const e of this.current.emitters) e.update(dt);
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    if (!this.destroyed) {
      this.offResize();
      for (const e of this.current.emitters) e.stop();
      releaseNamespace(this.current.spec.id);
    }
    // Le opzioni del chiamante passano, ma la texture resta sempre della cache.
    const o = typeof options === 'object' ? { ...options, texture: false, textureSource: false } : { children: true };
    super.destroy(o);
  }

  /** Colore d'ambiente dell'ambiente corrente. */
  get ambientColor(): number {
    return this.current.spec.ambient;
  }
}
