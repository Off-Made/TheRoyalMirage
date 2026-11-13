/**
 * THE ROYAL MIRAGE — Un rullo
 *
 * Il rullo e' un NASTRO: `pos` e' una posizione continua, in celle, lungo
 * la striscia. La cella in alto mostra `strip[floor(pos)]`, spostata in
 * basso della parte frazionaria. Girare = far decrescere `pos`; fermarsi =
 * portare `pos` esattamente sullo stop deciso dal motore.
 *
 * Usa `rows + 2` sprite riciclati (uno sopra e uno sotto la finestra), a
 * cui cambia solo la texture: nessuna allocazione durante il giro.
 */

import { PALETTE } from '@/art/palette';
import { BlurFilter, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { gsap } from 'gsap';
import type { SymId } from '../engine/types';

export interface ReelViewOptions {
  index: number;
  rows: number;
  cellW: number;
  cellH: number;
  texture: (id: SymId) => Texture;
  /** Scala dello sprite dentro la cella. */
  symbolScale: number;
  blur: boolean;
}

type ReelState = 'idle' | 'starting' | 'spinning' | 'stopping';

/**
 * Piano d'arresto: da dove ripartire e dove arrivare.
 *
 * Il motore ha gia' deciso lo stop; il rullo deve solo ARRIVARCI. Prima si
 * cercava lo stop "piu' vicino davanti" lungo la striscia vera, che poteva
 * stare fino a un giro intero piu' in la' (47-72 celle): 2-4 secondi per
 * rullo. Ora, a rullo lanciato e sfocato, il nastro viene riposizionato
 * `minCells` celle prima dello stop (conservando la parte frazionaria, cosi'
 * le celle non saltano di mezza altezza) e la frenata e' sempre corta.
 * Le ultime celle che scorrono sono quelle vere della striscia: l'arrivo e'
 * autentico, solo il tratto "in volo" e' accorciato. L'esito non cambia.
 */
export function stopPlan(pos: number, stop: number, minCells: number): { from: number; to: number } {
  const frac = pos - Math.floor(pos);
  return { from: stop + minCells + frac, to: stop };
}

export class ReelView extends Container {
  readonly strip: SymId[] = [];
  private sprites: Sprite[] = [];
  private symbols = new Container();
  private blurFilter: BlurFilter | null = null;
  private pos = 0;
  private speed = 0;
  private state: ReelState = 'idle';
  private stopTween: gsap.core.Tween | null = null;

  /** Velocita' a regime in celle/secondo. */
  maxSpeed = 17;

  /**
   * Suspense: il rullo ancora in corsa rallenta fino a `speed` celle al
   * secondo in `duration` secondi, senza fermarsi. Il simbolo che potrebbe
   * arrivare si "vede passare" prima dell'arresto.
   */
  slowTo(speed: number, duration: number): void {
    if (this.state !== 'spinning') return;
    gsap.to(this, { speed, duration, ease: 'power2.out' });
  }

  constructor(private o: ReelViewOptions) {
    super();
    this.label = `reel-${o.index}`;
    const mask = new Graphics().rect(0, 0, o.cellW, o.cellH * o.rows).fill(PALETTE.white);
    this.addChild(mask, this.symbols);
    this.symbols.mask = mask;
    for (let i = 0; i < o.rows + 2; i++) {
      const s = new Sprite();
      s.anchor.set(0.5);
      s.scale.set(o.symbolScale);
      s.x = o.cellW / 2;
      this.sprites.push(s);
      this.symbols.addChild(s);
    }
    if (o.blur) {
      this.blurFilter = new BlurFilter({ strength: 0, quality: 2 });
      this.blurFilter.strengthX = 0;
    }
  }

  get isIdle(): boolean {
    return this.state === 'idle';
  }

  /** Sostituisce la striscia (base ↔ giri gratis) e si posiziona su `stop`. */
  setStrip(strip: readonly SymId[], stop = 0): void {
    this.strip.length = 0;
    this.strip.push(...strip);
    this.pos = stop;
    this.layout();
  }

  /**
   * Sostituisce la striscia senza scatti visivi: tiene la stessa posizione
   * modulo la nuova lunghezza. Va chiamata solo a rullo in moto (col blur
   * il cambio di simboli e' invisibile).
   */
  swapStrip(strip: readonly SymId[]): void {
    this.strip.length = 0;
    this.strip.push(...strip);
    this.pos = this.pos % strip.length;
  }

  private sym(i: number): SymId {
    const L = this.strip.length;
    return this.strip[((i % L) + L) % L]!;
  }

  /** Sprite della riga visibile `row` (rullo fermo). */
  cell(row: number): Sprite {
    return this.sprites[row + 1]!;
  }

  /** Simbolo mostrato alla riga `row` adesso. */
  symbolAt(row: number): SymId {
    return this.sym(Math.round(this.pos) + row);
  }

  /** Sostituisce la texture di una cella ferma (es. moneta con valore). */
  setCellTexture(row: number, tex: Texture): void {
    this.cell(row).texture = tex;
  }

  private layout(): void {
    const base = Math.floor(this.pos);
    const frac = this.pos - base;
    const { cellH } = this.o;
    for (let j = -1; j <= this.o.rows; j++) {
      const s = this.sprites[j + 1]!;
      s.texture = this.o.texture(this.sym(base + j));
      s.y = (j - frac) * cellH + cellH / 2;
    }
  }

  /** Avvio con piccolo "caricamento" all'indietro, come un rullo meccanico. */
  start(delay = 0): void {
    this.stopTween?.kill();
    for (const s of this.sprites) {
      gsap.killTweensOf(s.scale);
      s.scale.set(this.o.symbolScale);
      s.alpha = 1;
      s.tint = PALETTE.white;
    }
    this.state = 'starting';
    gsap.to(this, {
      pos: this.pos + 0.28,
      duration: 0.14,
      delay,
      ease: 'power1.out',
      onComplete: () => {
        this.state = 'spinning';
        this.speed = 0;
        gsap.to(this, { speed: this.maxSpeed, duration: 0.18, ease: 'power2.in' });
      },
    });
  }

  /**
   * Ferma il rullo sullo stop `stop` dopo `minCells` celle di corsa, in
   * `duration` secondi. Il rimbalzo finale (back.out) da' peso al rullo.
   */
  stopAt(stop: number, minCells = 3, duration = 0.3): Promise<void> {
    return new Promise((resolve) => {
      const go = () => {
        gsap.killTweensOf(this, 'speed');
        const { from, to: target } = stopPlan(this.pos, stop, minCells);
        this.pos = from;
        this.state = 'stopping';
        this.stopTween = gsap.to(this, {
          pos: target,
          duration,
          ease: 'back.out(1.3)',
          onComplete: () => {
            this.pos = stop;
            this.speed = 0;
            this.state = 'idle';
            this.stopTween = null;
            this.layout();
            resolve();
          },
        });
      };
      // Uno stop chiesto durante il "caricamento" aspetta che il rullo giri.
      if (this.state === 'starting') {
        const wait = () => (this.state === 'starting' ? requestAnimationFrame(wait) : go());
        wait();
      } else go();
    });
  }

  /**
   * Suspense: UNA sola frenata continua, lunga `duration` secondi, dalla
   * velocita' piena fino allo stop. Il salto di posizione avviene subito,
   * mentre il rullo corre ancora sfocato: poi la velocita' cala senza scatti
   * (la stessa di partenza, quindi niente strappo) e si posa con un piccolo
   * rimbalzo. `hurry` accelera la fine se il giocatore chiede l'arresto rapido.
   */
  teaseStop(stop: number, duration: number, hurry: () => boolean = () => false): Promise<void> {
    return new Promise((resolve) => {
      const go = () => {
        gsap.killTweensOf(this, 'speed');
        // back.out(0.6) parte con velocita' 3,6 × (distanza / durata): la
        // distanza e' scelta perche' coincida con la velocita' attuale.
        const v0 = Math.max(this.speed, 4);
        const cells = Math.max(3, Math.round((v0 * duration) / 3.6));
        const frac = this.pos - Math.floor(this.pos);
        this.pos = stop + cells + frac;
        this.state = 'stopping';
        let last = this.pos;
        const tw: gsap.core.Tween = gsap.to(this, {
          pos: stop,
          duration,
          ease: 'back.out(0.6)',
          onUpdate: () => {
            const dt = Math.max(1 / 240, gsap.ticker.deltaRatio() / 60);
            this.speed = Math.abs(last - this.pos) / dt;
            last = this.pos;
            if (hurry() && tw.timeScale() === 1) tw.timeScale(5);
          },
          onComplete: () => {
            this.pos = stop;
            this.speed = 0;
            this.state = 'idle';
            this.stopTween = null;
            this.layout();
            resolve();
          },
        });
        this.stopTween = tw;
      };
      if (this.state === 'starting') {
        const wait = () => (this.state === 'starting' ? requestAnimationFrame(wait) : go());
        wait();
      } else go();
    });
  }

  update(dt: number): void {
    if (this.state === 'spinning') this.pos -= this.speed * dt;
    if (this.state !== 'idle') this.layout();

    if (this.blurFilter) {
      // Blur verticale proporzionale alla velocita': a rullo lento i simboli
      // tornano nitidi PRIMA di fermarsi, cosi' l'occhio legge l'esito.
      const v = this.state === 'spinning' ? this.speed : this.state === 'stopping' ? this.speed * 0.4 : 0;
      const k = Math.min(1, v / this.maxSpeed);
      this.blurFilter.strengthY = k * 14;
      this.symbols.filters = k > 0.05 ? [this.blurFilter] : [];
    }
  }
}
