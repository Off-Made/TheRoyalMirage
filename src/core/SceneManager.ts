/**
 * THE ROYAL MIRAGE — Gestore di scene e transizioni
 *
 * Una transizione copre lo schermo, scambia la scena sotto, poi si apre.
 * Il punto chiave e' che il caricamento della scena nuova (`enter`, che puo'
 * cuocere texture per decine di ms) avviene MENTRE la tenda e' chiusa: cosi'
 * lo scatto di frame non si vede mai.
 */

import { Container, Texture } from 'pixi.js';
import { gsap } from 'gsap';
import { game } from './App';
import type { Scene } from './Scene';
import { TRANSITIONS, type AnimatedTransition, type Transition } from '@/fx/transitions';

export type TransitionKind = AnimatedTransition | 'instant';

/**
 * Ferma ogni tween gsap che punta a un oggetto dell'albero.
 *
 * `dispose()` distrugge la radice della scena, ma un tween ancora in corso
 * su un figlio (una vincita a meta', una carta in volo, la scossa del mondo)
 * continuerebbe a scrivere su un oggetto distrutto per il resto della sua
 * durata. In Pixi v8 questo lancia: e' un crash latente a ogni uscita
 * durante un'animazione.
 */
function killTweensDeep(node: Container): void {
  gsap.killTweensOf(node);
  gsap.killTweensOf(node.position);
  gsap.killTweensOf(node.scale);
  for (const child of node.children) killTweensDeep(child as Container);
}

type SceneFactory = () => Scene | Promise<Scene>;

class SceneManagerImpl {
  private current: Scene | null = null;
  private busy = false;

  /** Layer sopra ogni scena, dedicato alle transizioni. */
  private fxLayer = new Container();
  private sceneLayer = new Container();

  private elapsed = 0;
  private paused = false;

  install(): void {
    this.sceneLayer.label = 'scenes';
    this.fxLayer.label = 'transitions';
    game.stage.addChild(this.sceneLayer, this.fxLayer);

    game.ticker.add((t) => {
      // In pausa `elapsed` NON avanza: altrimenti al primo fotogramma dopo lo
      // scambio ogni animazione guidata dal tempo farebbe un salto.
      if (this.paused) return;
      const dt = Math.min(t.deltaMS / 1000, 1 / 20); // clamp: evita salti dopo un tab inattivo
      this.elapsed += dt;
      this.current?.update(dt, this.elapsed);
    });

    game.onResize((vp) => this.current?.resize(vp));
  }

  get currentName(): string | null {
    return this.current?.name ?? null;
  }

  /** La scena attiva (null durante uno scambio). */
  get currentScene(): Scene | null {
    return this.current;
  }

  /** Chiede alla scena corrente se l'utente puo' lasciarla adesso. */
  async canLeave(): Promise<boolean> {
    if (this.busy) return false;
    return this.current ? this.current.beforeExit() : true;
  }

  get isTransitioning(): boolean {
    return this.busy;
  }

  /**
   * Sostituisce la scena corrente.
   * Ignora chiamate concorrenti: due transizioni sovrapposte lascerebbero
   * scene orfane nello stage.
   */
  async goTo(factory: SceneFactory, kind: TransitionKind = 'fade'): Promise<void> {
    if (this.busy) return;
    this.busy = true;

    try {
      if (kind === 'instant') {
        await this.swap(factory);
      } else {
        const t = this.buildTransition(kind);
        this.fxLayer.addChild(t.view);
        await t.cover();
        // Schermo coperto: la scena uscente non deve piu' avanzare. E' la
        // finestra in cui una giocata a meta' gia' saldata da resolvePending()
        // potrebbe altrimenti finire la propria animazione e ripagare.
        this.paused = true;
        try {
          await this.swap(factory);
        } finally {
          this.paused = false;
        }
        await t.reveal();
        t.view.destroy({ children: true });
      }
    } finally {
      this.busy = false;
    }
  }

  private async swap(factory: SceneFactory): Promise<void> {
    const old = this.current;
    if (old) {
      await old.exit();
      this.sceneLayer.removeChild(old.root);
      // Subito null: la factory della scena nuova e' asincrona (import del
      // modulo del gioco) e nel frattempo il ticker continua a girare. Se
      // `current` puntasse ancora alla scena distrutta, il suo update()
      // toccherebbe oggetti gia' liberati e la transizione si bloccherebbe.
      this.current = null;
      killTweensDeep(old.root);
      old.dispose();
    }

    const next = await factory();
    this.current = next;
    this.sceneLayer.addChild(next.root);
    await next.enter();
    next.resize(game.viewport);
  }

  // ──────────────────────────────────────────────── TRANSIZIONI

  private buildTransition(kind: AnimatedTransition): Transition {
    return TRANSITIONS[kind]();
  }

  /**
   * Monta una transizione senza scambiare scena, e la restituisce a chi
   * governera' il tempismo.
   *
   * Serve a menu → lobby: sono due overlay DOM sopra la STESSA scena Pixi,
   * quindi non c'e' nessuno scambio da fare, ma le porte devono chiudersi,
   * coprire il cambio di ambiente e riaprirsi. Chi chiama deve sempre
   * passare da `unmountTransition` (anche in caso di errore).
   */
  mountTransition(kind: AnimatedTransition): Transition {
    const t = TRANSITIONS[kind]();
    this.fxLayer.addChild(t.view);
    return t;
  }

  unmountTransition(t: Transition): void {
    if (!t.view.destroyed) t.view.destroy({ children: true });
  }

  /**
   * Sospende l'aggiornamento della scena. Usato mentre lo schermo e' coperto:
   * animare cio' che nessuno vede costa frame proprio quando servono alla
   * transizione, e lascia girare le coroutine delle giocate.
   */
  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  /** Texture 1x1 bianca, utile come base per rettangoli colorati/tinti. */
  static get white(): Texture {
    return Texture.WHITE;
  }
}

export const scenes = new SceneManagerImpl();
