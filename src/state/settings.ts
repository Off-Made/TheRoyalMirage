/**
 * THE ROYAL MIRAGE — Impostazioni
 *
 * I preset di qualita' non sono "alto/medio/basso" arbitrari: ogni livello
 * disattiva una categoria di costo precisa, in ordine da quella che rende
 * meno per frame speso.
 */

export type Quality = 'low' | 'medium' | 'high' | 'ultra';
export type Language = 'it' | 'en';

export interface QualityProfile {
  /** Risoluzione di bake delle texture (1 = 1x, 2 = HiDPI). */
  bakeResolution: number;
  /** Bloom e glow a schermo. Il costo piu' alto in assoluto. */
  bloom: boolean;
  /** Blur di profondita' di campo sui livelli lontani. */
  depthOfField: boolean;
  /** Particellari ambientali (sabbia, lucciole). */
  ambientParticles: boolean;
  /** Moltiplicatore sul numero di particelle delle vincite. */
  particleScale: number;
  /** Motion blur sui rulli in rotazione. */
  reelBlur: boolean;
  /** Grading finale (vignettatura animata, aberrazione cromatica). */
  colorGrade: boolean;
  /** Tetto di FPS. 0 = nessun limite (usa il refresh rate). */
  fpsCap: number;
}

export const QUALITY_PROFILES: Record<Quality, QualityProfile> = {
  // Obiettivo: 60fps su GPU integrate vecchie. Si rinuncia a tutto cio'
  // che costa fill rate a schermo intero.
  low: {
    bakeResolution: 1,
    bloom: false,
    depthOfField: false,
    ambientParticles: false,
    particleScale: 0.3,
    reelBlur: false,
    colorGrade: false,
    fpsCap: 60,
  },
  medium: {
    bakeResolution: 1,
    bloom: false,
    depthOfField: true,
    ambientParticles: true,
    particleScale: 0.6,
    reelBlur: true,
    colorGrade: false,
    fpsCap: 60,
  },
  high: {
    bakeResolution: 2,
    bloom: true,
    depthOfField: true,
    ambientParticles: true,
    particleScale: 1,
    reelBlur: true,
    colorGrade: true,
    fpsCap: 0,
  },
  // Ultra alza solo la densita' di particelle e la nitidezza delle texture:
  // oltre, il rendimento visivo per frame speso crolla.
  ultra: {
    bakeResolution: 3,
    bloom: true,
    depthOfField: true,
    ambientParticles: true,
    particleScale: 1.6,
    reelBlur: true,
    colorGrade: true,
    fpsCap: 0,
  },
};

export interface SettingsState {
  language: Language;
  quality: Quality;
  /** Volumi 0..1, indipendenti per bus. */
  volumeMaster: number;
  volumeMusic: number;
  volumeSfx: number;
  muted: boolean;
  /** Rispetta `prefers-reduced-motion`: riduce scuotimenti e zoom. */
  reducedMotion: boolean;
  /** Salta le animazioni lunghe di vincita (per chi gioca veloce). */
  fastPlay: boolean;
  /** Mostra l'overlay FPS/diagnostica. */
  showFps: boolean;
  /**
   * Video poker: il tocco su una carta la TIENE (standard dei casino') o la
   * SCARTA (piu' intuitivo per chi impara).
   */
  vpTapMode: 'hold' | 'discard';
  /**
   * Presentazione (solo modalita' Libera, vedi `games/slots/demo.ts`):
   * slot con vincite grandi, giri gratis e Hold & Win piu' frequenti.
   */
  demoBigWins: boolean;
  demoFreeSpins: boolean;
  demoHoldWin: boolean;
  /** Bonus interni (ruota, cascata, forzieri) piu' frequenti. */
  demoBonus: boolean;
  /** Auto-spin: numero di spin consecutivi. 0 = disattivato. */
  autoSpinCount: number;
}

/**
 * Qualita' iniziale dedotta dall'hardware. Non e' una scienza esatta:
 * `deviceMemory` e `hardwareConcurrency` sono grossolani, ma meglio che
 * partire in ultra su un portatile da ufficio e mostrare 12fps al primo avvio.
 */
export function guessQuality(): Quality {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 4;
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (mobile) return cores >= 6 ? 'medium' : 'low';
  if (cores >= 12 && mem >= 8) return 'high';
  if (cores >= 6) return 'high';
  if (cores >= 4) return 'medium';
  return 'low';
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function'
    ? matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/** Lingua iniziale dal browser, con fallback italiano. */
function guessLanguage(): Language {
  const l = (navigator.language || 'it').toLowerCase();
  return l.startsWith('it') ? 'it' : 'en';
}

export function initialSettings(): SettingsState {
  return {
    language: guessLanguage(),
    quality: guessQuality(),
    volumeMaster: 0.75,
    volumeMusic: 0.45,
    volumeSfx: 0.8,
    muted: false,
    reducedMotion: prefersReducedMotion(),
    fastPlay: false,
    showFps: false,
    vpTapMode: 'hold',
    demoBigWins: false,
    demoFreeSpins: false,
    demoHoldWin: false,
    demoBonus: false,
    autoSpinCount: 0,
  };
}

export function profileFor(s: SettingsState): QualityProfile {
  const p = QUALITY_PROFILES[s.quality];
  // reducedMotion non e' un preset di qualita', ma annulla gli effetti di
  // movimento indipendentemente da esso: e' una scelta di accessibilita'
  // che deve avere la precedenza.
  if (!s.reducedMotion) return p;
  return { ...p, ambientParticles: false, particleScale: Math.min(p.particleScale, 0.4), colorGrade: false };
}

/** Volume effettivo di un bus, applicando master e mute. */
export function effectiveVolume(s: SettingsState, bus: 'music' | 'sfx'): number {
  if (s.muted) return 0;
  const b = bus === 'music' ? s.volumeMusic : s.volumeSfx;
  return Math.max(0, Math.min(1, s.volumeMaster * b));
}
