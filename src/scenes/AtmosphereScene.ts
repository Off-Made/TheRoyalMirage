/**
 * THE ROYAL MIRAGE — Scena atmosferica
 *
 * La scena Pixi che gira sotto la home e la sala giochi. Quelle due
 * schermate sono overlay HTML a tutta finestra con il proprio fondo
 * fotografico (responsive, anche in verticale); questa scena tiene acceso
 * il salone dietro di loro e fa da fondale alle transizioni verso i tavoli.
 */

import { Scene } from '@/core/Scene';
import { Backdrop } from '@/fx/Backdrop';
import type { EnvironmentId } from '@/fx/environment/registry';
import { game } from '@/core/App';
import { settings } from '@/state/store';
import { profileFor } from '@/state/settings';

export interface AtmosphereOptions {
  /** Ambiente iniziale. Default: il salone. */
  env?: EnvironmentId;
}

export class AtmosphereScene extends Scene {
  readonly name = 'atmosphere';
  private backdrop!: Backdrop;
  private offPointer?: () => void;

  constructor(private opts: AtmosphereOptions = {}) {
    super();
  }

  /** Cambia ambiente con una dissolvenza. Vedi `Backdrop.setEnvironment`. */
  setEnvironment(id: EnvironmentId, fade?: number): Promise<void> {
    return this.backdrop.setEnvironment(id, fade);
  }

  get environment(): EnvironmentId | string {
    return this.backdrop.environment.id;
  }

  async enter(): Promise<void> {
    const p = profileFor(settings());
    const env = this.opts.env ?? 'salon';
    await Backdrop.prepare(env);
    this.backdrop = new Backdrop({
      env,
      quality: !p.ambientParticles ? 'low' : p.bloom ? 'high' : 'medium',
    });
    this.root.addChild(this.backdrop);

    // Lo sguardo segue il puntatore: micro-interazione che fa sembrare
    // lo sfondo una finestra invece di un'immagine.
    const onMove = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      this.backdrop.setGaze(nx, ny);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    this.offPointer = () => window.removeEventListener('pointermove', onMove);

    void game; // il renderer e' gia' inizializzato; riferimento per chiarezza
  }

  update(dt: number): void {
    this.backdrop?.update(dt);
  }

  dispose(): void {
    this.offPointer?.();
    super.dispose();
  }
}
