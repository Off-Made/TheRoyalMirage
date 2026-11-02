/**
 * THE ROYAL MIRAGE — Scena base
 *
 * Ogni schermata del gioco (lobby, slot, blackjack...) e' una Scene.
 * Il contratto e' volutamente minimale: il SceneManager garantisce che
 * `enter` venga chiamata una volta prima del primo `update`, e `dispose`
 * esattamente una volta alla fine.
 */

import { Container } from 'pixi.js';
import type { Viewport } from './App';

export abstract class Scene {
  /** Radice della scena nel design space. Aggiunta/rimossa dal SceneManager. */
  readonly root = new Container();

  /** Nome leggibile, usato per debug e analytics. */
  abstract readonly name: string;

  /**
   * Costruzione delle risorse della scena. Puo' essere async (es. bake di
   * texture pesanti): il SceneManager mostra il loader fino alla risoluzione.
   */
  async enter(): Promise<void> {}

  /** Chiamata ogni frame. `dt` in secondi (non in frame, per indipendenza dal refresh rate). */
  update(_dt: number, _elapsed: number): void {}

  /** Chiamata quando la finestra cambia dimensione. */
  resize(_vp: Viewport): void {}

  /**
   * Chiesta PRIMA di lasciare la scena per volonta' dell'utente (Esc, "Esci").
   * Un gioco con una mano in corso puo' chiedere conferma e restituire false
   * per restare. Default: si puo' uscire sempre.
   */
  async beforeExit(): Promise<boolean> {
    return true;
  }

  /** Transizione in uscita: opportunita' di animare prima di essere smontata. */
  async exit(): Promise<void> {}

  /** Rilascio definitivo. Sovrascrivi per distruggere texture/listener propri. */
  dispose(): void {
    this.root.destroy({ children: true });
  }
}
