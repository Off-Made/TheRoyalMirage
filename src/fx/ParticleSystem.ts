/**
 * THE ROYAL MIRAGE — Sistema particellare
 *
 * Un solo sistema per tutto: sabbia, lucciole dorate, pioggia di monete,
 * scintille, coriandoli. La differenza fra un effetto e l'altro sta solo
 * nell'emettitore (`EmitterConfig`), non nel codice.
 *
 * ── Scelte di performance ──
 * 1. POOL: le particelle non vengono mai allocate durante il gioco. Si crea
 *    il pool al setup e si riciclano. Allocare sprite durante una vincita e'
 *    il modo piu' sicuro di far scattare il GC proprio nel momento in cui
 *    l'utente guarda l'animazione.
 * 2. UN SOLO CONTAINER per emettitore con la stessa texture → Pixi le batcha
 *    in una sola draw call.
 * 3. Fisica in coordinate del design space, integrata con dt reale.
 */

import { Container, Sprite, Texture, BLEND_MODES } from 'pixi.js';
import { bake, bakeSquare } from '@/art/textureCache';
import { PALETTE, css, rgba } from '@/art/palette';
import { setGlow, clearGlow, starPath } from '@/art/materials';
import { FONT_STACK } from '@/core/fonts';

// ─────────────────────────────────────────────── TEXTURE DELLE PARTICELLE

/** Punto luminoso morbido. La base di sabbia, polvere e scintille. */
export function dotTexture(color: number, key: string): Texture {
  return bakeSquare(`p/dot-${key}`, 32, (ctx, w) => {
    const r = w / 2;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    // Nucleo nel COLORE, non bianco: in blend additiva un centro bianco
    // satura immediatamente e ogni particella diventa un punto bianco,
    // perdendo l'identita' cromatica dell'effetto.
    g.addColorStop(0, rgba(color, 1));
    g.addColorStop(0.2, rgba(color, 0.7));
    g.addColorStop(0.55, rgba(color, 0.22));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
}

/**
 * Granello di sabbia. Due accortezze per NON farlo sembrare neve:
 *  - nessun bianco: il picco e' sabbia chiara, non #fff
 *  - forma allungata in orizzontale, come un granello in volo nel vento
 */
export function grainTexture(): Texture {
  return bake('p/grain', 24, 10, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, rgba(PALETTE.gold.light, 0.75));
    g.addColorStop(0.45, rgba(PALETTE.gold.core, 0.3));
    g.addColorStop(1, rgba(PALETTE.gold.deep, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Scintilla a 4 punte, per le vincite. */
export function sparkTexture(color = PALETTE.gold.hot): Texture {
  return bakeSquare('p/spark', 64, (ctx, w) => {
    const c = w / 2;
    setGlow(ctx, color, 14, 0.9);
    ctx.fillStyle = css(color);
    starPath(ctx, c, c, c * 0.92, c * 0.1, 4, -Math.PI / 2);
    ctx.fill();
    clearGlow(ctx);
    ctx.fillStyle = rgba(PALETTE.white, 0.95);
    ctx.beginPath();
    ctx.arc(c, c, c * 0.13, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * Moneta d'oro con bordo godronato e cifra.
 * Il "flip" non e' una vera rotazione 3D: scaliamo la X con |cos(angolo)| e
 * scuriamo la faccia quando e' di profilo. A velocita' di caduta e' del tutto
 * convincente e costa una moltiplicazione invece di una matrice 3D.
 */
export function coinTexture(): Texture {
  return bakeSquare('p/coin', 72, (ctx, w) => {
    const c = w / 2;
    const r = c * 0.9;
    // Bordo
    const rim = ctx.createLinearGradient(0, 0, w, w);
    rim.addColorStop(0, css(PALETTE.gold.light));
    rim.addColorStop(0.35, css(PALETTE.gold.core));
    rim.addColorStop(0.6, css(PALETTE.gold.deep));
    rim.addColorStop(1, css(PALETTE.gold.mid));
    setGlow(ctx, PALETTE.gold.core, 10, 0.7);
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fill();
    clearGlow(ctx);
    // Godronatura
    ctx.strokeStyle = rgba(PALETTE.gold.shadow, 0.55);
    ctx.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * r * 0.86, c + Math.sin(a) * r * 0.86);
      ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      ctx.stroke();
    }
    // Faccia interna
    const face = ctx.createRadialGradient(c - r * 0.3, c - r * 0.3, 0, c, c, r * 0.82);
    face.addColorStop(0, css(PALETTE.gold.hot));
    face.addColorStop(0.45, css(PALETTE.gold.light));
    face.addColorStop(1, css(PALETTE.gold.mid));
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(c, c, r * 0.82, 0, Math.PI * 2);
    ctx.fill();
    // Simbolo dell'euro inciso: le monete del Mirage sono euro virtuali.
    ctx.font = `800 ${Math.round(r * 1.05)}px ${FONT_STACK.ui}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(PALETTE.gold.hot, 0.55);
    ctx.fillText('€', c, c + 1.5);
    ctx.fillStyle = rgba(PALETTE.gold.deep, 0.85);
    ctx.fillText('€', c, c);
  });
}

// ─────────────────────────────────────────────── MODELLO

interface Particle {
  sprite: Sprite;
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  rot: number;
  vrot: number;
  size: number;
  /** Fase per il flip della moneta e per le oscillazioni. */
  phase: number;
  spinSpeed: number;
}

export interface EmitterConfig {
  texture: Texture;
  /** Particelle massime vive contemporaneamente (dimensione del pool). */
  max: number;
  /** Particelle al secondo. 0 = solo burst manuali. */
  rate?: number;
  /** Durata in secondi [min, max]. */
  life: [number, number];
  /** Area/punto di emissione, in coordinate del design space. */
  spawn: (i: number) => { x: number; y: number };
  /** Velocita' iniziale. */
  velocity: () => { vx: number; vy: number };
  /** Scala dello sprite [min, max]. */
  size: [number, number];
  gravity?: number;
  /** Resistenza dell'aria: 0 = nessuna, 1 = fermo immediato. */
  drag?: number;
  /** Rotazione iniziale casuale + velocita' angolare. */
  spin?: [number, number];
  /** Oscillazione orizzontale (foglia che cade / lucciola). */
  sway?: { amp: number; freq: number };
  /** Effetto "moneta che gira": scala X pulsante. */
  flip?: boolean;
  alpha?: [number, number];
  blend?: BLEND_MODES;
  tint?: number;
  /** Curva di dissolvenza: 'out' | 'inOut' | 'none'. */
  fade?: 'out' | 'inOut' | 'none';
  /** Riavvolge le particelle che escono dallo schermo invece di ucciderle. */
  wrap?: { w: number; h: number };
}

export class Emitter extends Container {
  private pool: Particle[] = [];
  private accumulator = 0;
  private spawnIndex = 0;
  private rnd = Math.random;
  running = true;

  constructor(private cfg: EmitterConfig) {
    super();
    this.label = 'emitter';
    for (let i = 0; i < cfg.max; i++) {
      const sprite = new Sprite(cfg.texture);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      if (cfg.blend) sprite.blendMode = cfg.blend;
      if (cfg.tint !== undefined) sprite.tint = cfg.tint;
      this.addChild(sprite);
      this.pool.push({
        sprite,
        alive: false,
        x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 1,
        rot: 0, vrot: 0, size: 1,
        phase: 0, spinSpeed: 0,
      });
    }
  }

  /** Riempie subito il pool: usato per sabbia/stelle che devono esserci dal frame 1. */
  prewarm(): void {
    for (const p of this.pool) {
      this.spawn(p);
      // Distribuisce le eta' in modo che non muoiano tutte insieme.
      p.life = this.rnd() * p.maxLife;
    }
  }

  /** Emette `n` particelle immediatamente (vincite, impatti). */
  burst(n: number): void {
    let emitted = 0;
    for (const p of this.pool) {
      if (emitted >= n) break;
      if (!p.alive) {
        this.spawn(p);
        emitted++;
      }
    }
  }

  private spawn(p: Particle): void {
    const c = this.cfg;
    const pos = c.spawn(this.spawnIndex++);
    const vel = c.velocity();
    p.x = pos.x;
    p.y = pos.y;
    p.vx = vel.vx;
    p.vy = vel.vy;
    p.maxLife = c.life[0] + this.rnd() * (c.life[1] - c.life[0]);
    p.life = 0;
    p.size = c.size[0] + this.rnd() * (c.size[1] - c.size[0]);
    p.rot = c.spin ? this.rnd() * Math.PI * 2 : 0;
    p.vrot = c.spin ? c.spin[0] + this.rnd() * (c.spin[1] - c.spin[0]) : 0;
    p.phase = this.rnd() * Math.PI * 2;
    p.spinSpeed = 4 + this.rnd() * 7;
    p.alive = true;
    p.sprite.visible = true;
  }

  update(dt: number): void {
    const c = this.cfg;

    // Emissione continua
    if (this.running && c.rate) {
      this.accumulator += dt * c.rate;
      while (this.accumulator >= 1) {
        this.accumulator -= 1;
        const free = this.pool.find((p) => !p.alive);
        if (!free) break;
        this.spawn(free);
      }
    }

    const grav = c.gravity ?? 0;
    const drag = c.drag ?? 0;
    const [aMin, aMax] = c.alpha ?? [1, 1];
    const fade = c.fade ?? 'out';

    for (const p of this.pool) {
      if (!p.alive) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        if (c.wrap) {
          this.spawn(p);
          continue;
        }
        p.alive = false;
        p.sprite.visible = false;
        continue;
      }

      p.vy += grav * dt;
      if (drag > 0) {
        // Smorzamento esponenziale: indipendente dal framerate, a differenza
        // del classico `v *= 0.98` che cambia comportamento a 144Hz.
        const k = Math.exp(-drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;

      if (c.sway) {
        p.x += Math.sin(p.life * c.sway.freq + p.phase) * c.sway.amp * dt;
      }

      if (c.wrap) {
        if (p.x < -40) p.x += c.wrap.w + 80;
        else if (p.x > c.wrap.w + 40) p.x -= c.wrap.w + 80;
        if (p.y < -40) p.y += c.wrap.h + 80;
        else if (p.y > c.wrap.h + 40) p.y -= c.wrap.h + 80;
      }

      const t = p.life / p.maxLife;
      let a: number;
      if (fade === 'none') a = aMax;
      else if (fade === 'inOut') a = Math.sin(t * Math.PI) * (aMax - aMin) + aMin;
      else a = (1 - t) * (aMax - aMin) + aMin;

      const s = p.sprite;
      s.x = p.x;
      s.y = p.y;
      s.rotation = p.rot;
      s.alpha = a;

      if (c.flip) {
        // Finto flip 3D: schiacciamento orizzontale + scurimento di profilo.
        const f = Math.cos(p.life * p.spinSpeed + p.phase);
        s.scale.set(p.size * Math.max(0.12, Math.abs(f)), p.size);
        s.tint = Math.abs(f) < 0.35 ? PALETTE.gold.deep : (c.tint ?? PALETTE.white);
      } else {
        s.scale.set(p.size);
      }
    }
  }

  /** Numero di particelle attualmente vive (per il pannello di debug). */
  get liveCount(): number {
    return this.pool.reduce((n, p) => n + (p.alive ? 1 : 0), 0);
  }

  stop(): void {
    this.running = false;
  }
}

// ─────────────────────────────────────────────── PRESET

const R = () => Math.random();

/** Sabbia trasportata dal vento, a schermo intero. Livello ambientale. */
export function sandDriftEmitter(w: number, h: number): Emitter {
  return new Emitter({
    texture: grainTexture(),
    max: 220,
    life: [6, 14],
    // Solo nella meta' bassa: la sabbia al vento sta vicino al suolo.
    spawn: () => ({ x: R() * w, y: h * 0.58 + R() * h * 0.46 }),
    // Fortemente orizzontale: vy minuscola. Una vy comparabile a vx
    // trasforma la sabbia in neve, che era esattamente il difetto.
    velocity: () => ({ vx: 40 + R() * 95, vy: -3 + R() * 6 }),
    size: [0.2, 0.62],
    drag: 0,
    sway: { amp: 9, freq: 0.9 },
    alpha: [0, 0.28],
    fade: 'inOut',
    blend: 'add',
    wrap: { w, h },
  });
}

/** Lucciole dorate: punti che vagano lenti. Danno "vita" a una scena statica. */
export function firefliesEmitter(w: number, h: number, count = 46): Emitter {
  return new Emitter({
    texture: dotTexture(PALETTE.gold.light, 'gold'),
    max: count,
    life: [5, 11],
    spawn: () => ({ x: R() * w, y: h * 0.4 + R() * h * 0.5 }),
    velocity: () => ({ vx: (R() - 0.5) * 22, vy: -4 - R() * 16 }),
    size: [0.14, 0.36],
    sway: { amp: 34, freq: 1.3 },
    alpha: [0, 0.75],
    fade: 'inOut',
    blend: 'add',
    wrap: { w, h },
  });
}

/**
 * Pulviscolo sospeso nei fasci di luce di un interno.
 *
 * Differisce dalle lucciole del deserto per una ragione fisica: la polvere
 * non ha moto proprio, galleggia. Quindi velocita' minime, deriva lenta e
 * prevalentemente orizzontale, vita lunga, e concentrazione nella fascia
 * illuminata dal lampadario — dove la luce la rende visibile.
 */
export function dustMotesEmitter(w: number, h: number, count = 56): Emitter {
  return new Emitter({
    texture: dotTexture(PALETTE.gold.light, 'dust'),
    max: count,
    life: [9, 18],
    // Addensato al centro, dove scende la luce: la polvere c'e' anche ai lati,
    // ma al buio non si vede, e disegnarla la' sarebbe una bugia luminosa.
    spawn: () => ({ x: w * 0.18 + R() * w * 0.64, y: h * 0.12 + R() * h * 0.72 }),
    velocity: () => ({ vx: (R() - 0.5) * 9, vy: (R() - 0.5) * 5 }),
    size: [0.07, 0.2],
    sway: { amp: 12, freq: 0.5 },
    alpha: [0, 0.5],
    fade: 'inOut',
    blend: 'add',
    wrap: { w, h },
  });
}

/** Pioggia di monete dall'alto. Il premio visivo di ogni vincita. */
export function coinRainEmitter(w: number): Emitter {
  return new Emitter({
    texture: coinTexture(),
    max: 260,
    life: [1.5, 2.8],
    spawn: () => ({ x: R() * w, y: -60 - R() * 220 }),
    velocity: () => ({ vx: (R() - 0.5) * 130, vy: 320 + R() * 260 }),
    size: [0.45, 1.05],
    gravity: 900,
    spin: [-7, 7],
    alpha: [0.1, 1],
    fade: 'out',
    flip: true,
  });
}

/** Scoppio di scintille da un punto. Usato sui simboli vincenti. */
export function sparkBurstEmitter(x: number, y: number, tint: number = PALETTE.gold.hot): Emitter {
  return new Emitter({
    texture: sparkTexture(),
    max: 90,
    life: [0.45, 1.1],
    spawn: () => ({ x, y }),
    velocity: () => {
      const a = R() * Math.PI * 2;
      const sp = 170 + R() * 420;
      return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp };
    },
    size: [0.2, 0.72],
    gravity: 420,
    drag: 2.2,
    spin: [-11, 11],
    alpha: [0, 1],
    fade: 'out',
    blend: 'add',
    tint,
  });
}
