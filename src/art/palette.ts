/**
 * THE ROYAL MIRAGE — Design tokens: il colore
 *
 * Unica fonte di verita' per il colore. Il canvas Pixi legge questi numeri,
 * il DOM li riceve come custom property (`art/cssVars.ts`): `gold.core`
 * diventa `--gold-core` e `--gold-core-rgb`. Nessun altro file del progetto
 * puo' contenere un colore letterale — lo verifica `tests/palette-sync.test.ts`.
 *
 * ── DIREZIONE ARTISTICA: MEZZANOTTE SULLA STRIP ──
 * Una sala privata alle due di notte: velluto prugna quasi nero, oro
 * spazzolato, rosso marquee. Il neon esiste, ma solo per SEGNALARE (una
 * vincita, il pulsante attivo, l'insegna del logo): steso come decorazione
 * diventa una sala giochi di periferia.
 *
 * Tre regole che tengono insieme tutto:
 *   1. Il fondo non e' mai nero neutro: e' prugna. Il nero puro accanto
 *      all'oro lo fa sembrare plastica; il prugna lo fa sembrare velluto.
 *   2. L'oro e' una RAMPA, non un giallo: un metallo credibile ha un
 *      riflesso quasi bianco e un'ombra bruna. Un oro piatto e' senape.
 *   3. Il rosso e il rosa neon non si toccano mai sulla stessa superficie:
 *      il rosso e' materia (velluto, fiche, pulsante di gioco), il rosa e'
 *      luce (alone, filo dell'insegna).
 */

export const PALETTE = {
  // ─────────────────────────────────────── VELLUTO (fondi e superfici)
  // Dal piu' arretrato al piu' in primo piano. Ogni passo e' abbastanza
  // distante dal precedente da leggersi come un piano diverso senza ombra.
  plum: {
    /** Bordo estremo delle vignette e delle bande di letterbox. */
    abyss: 0x0a040b,
    /** Fondo dell'applicazione. */
    base: 0x120814,
    /** Superficie 1: barre, card, pannelli a riposo. */
    raised: 0x1d0f21,
    /** Superficie 2: modali, card attive, menu aperti. */
    lifted: 0x2a1630,
    /** Superficie 3: hover e campi selezionati. */
    high: 0x37203e,
    /** Filetto: bordi e separatori. */
    line: 0x46284d,
    /** Testo e bordi disattivati. */
    mist: 0x6b4a72,
  },

  // ─────────────────────────────────────── ORO (accento primario)
  gold: {
    hot: 0xfff6d6,
    light: 0xffe29a,
    core: 0xf2c14e,
    mid: 0xd49a2f,
    deep: 0xa87622,
    shadow: 0x5c3d0c,
  },

  // ─────────────────────────────────────── ROSSO MARQUEE (accento secondario)
  red: {
    light: 0xff6b7a,
    core: 0xd21e34,
    /** Rosso piu' acceso, per scritte su fondo oro (lo spicchio ×50). */
    bright: 0xff1f3d,
    deep: 0x8c1226,
    shadow: 0x4a0712,
  },

  // ─────────────────────────────────────── NEON (solo luce, mai superficie)
  neon: {
    /** Il rosa dell'insegna "Welcome to Fabulous Las Vegas". */
    pink: 0xff4f9a,
    /** Il suo alone, piu' chiaro: e' cio' che fa leggere "tubo acceso". */
    halo: 0xffa3c9,
    /** Ciano: luce fredda d'accento (riflessi dello skyline, qualche simbolo delle slot). */
    cyan: 0x45e3ff,
  },

  // ─────────────────────────────────────── TESTO
  // Avorio caldo, mai bianco: il bianco puro sul prugna vibra.
  text: {
    /** Titoli, numeri, corpo: 16:1 sul fondo. */
    strong: 0xf8f0e3,
    /** Testo secondario: 8:1. */
    soft: 0xc2aec4,
    /** Solo testi grandi o disattivati: 4.6:1. */
    mute: 0x977f9b,
    /** Testo su oro e su superfici chiare. */
    ink: 0x1f0d20,
  },

  // ─────────────────────────────────────── ESITO
  win: { light: 0x8ff0b9, core: 0x3bd483, deep: 0x16804a },
  loss: { light: 0xffa0a5, core: 0xff5c64, deep: 0x9e2129 },

  // ─────────────────────────────────────── TAVOLO
  /** Panno verde smeraldo: blackjack, roulette, video poker. */
  felt: { light: 0x1f8a5c, core: 0x0f5a3c, deep: 0x06281a },
  /** Panno cremisi: baccarat, il tavolo dei grandi giocatori. */
  feltRed: { light: 0x9a2238, core: 0x5e1222, deep: 0x2c0610 },
  /** Bordo imbottito in pelle e legno della ruota. */
  leather: { light: 0x6e4630, core: 0x3e2416, deep: 0x1c0f08 },

  // ─────────────────────────────────────── CARTE DA GIOCO
  card: {
    face: 0xfbf8f2,
    edge: 0xe2d8c6,
    red: 0xc8102e,
    black: 0x1a1220,
  },

  // ─────────────────────────────────────── FICHE
  // Un colore per taglio, come nei casino' veri: il giocatore legge il
  // valore dal colore prima ancora che dalla cifra.
  chip: {
    white: 0xf2ece2,
    red: 0xd0243a,
    blue: 0x2a5bd7,
    green: 0x1e9a5c,
    black: 0x1e1622,
    purple: 0x7d3fd0,
    orange: 0xe8862a,
    pink: 0xe84d9a,
    teal: 0x1aa8a0,
    /** Inserti chiari sul bordo della fiche. */
    insert: 0xfaf6ee,
  },

  // ─────────────────────────────────────── ACCENTI DEI GIOCHI
  // Ogni gioco ha una tinta di riconoscimento per copertina e cornice.
  // Stanno qui e non nei giochi perche' sono colori come tutti gli altri.
  accent: {
    sapphire: { light: 0x8fb0ff, core: 0x3a6df0, deep: 0x16307a },
    violet: { light: 0xcfa8ff, core: 0x9b5cff, deep: 0x3d1a78 },
    emerald: { light: 0x7ff0bd, core: 0x1fbf7a, deep: 0x0b5a3a },
    amber: { light: 0xffd08a, core: 0xff9f2e, deep: 0x8a4a06 },
  },

  // ─────────────────────────────────────── RANGHI
  // Il colore di ogni rango e' il colore del suo nome: tutti chiari, perche'
  // si leggono SEMPRE su velluto. Black Card e' avorio con l'oro come bordo.
  tier: {
    guest: 0xb3a2b6,
    bronze: 0xe0a070,
    silver: 0xd6dae3,
    gold: 0xf2c14e,
    platinum: 0xe9ecf2,
    sapphire: 0x8fb0ff,
    diamond: 0x9feaff,
    blackCard: 0xfff6d6,
    legend: 0xff4f9a,
  },

  /** Tinta neutra degli sprite Pixi: "nessuna colorazione". */
  white: 0xffffff,
  /** Solo per maschere e moltiplicazioni in Pixi, mai come colore visibile. */
  black: 0x000000,
} as const;

/** Rampa oro ordinata dal piu' chiaro al piu' scuro: base di ogni gradiente metallico. */
export const GOLD_RAMP: readonly number[] = [
  PALETTE.gold.hot,
  PALETTE.gold.light,
  PALETTE.gold.core,
  PALETTE.gold.mid,
  PALETTE.gold.deep,
  PALETTE.gold.shadow,
];

/**
 * Colori delle linee di pagamento, nell'ordine in cui le linee si accendono.
 * Dieci tinte distinguibili sul fondo dei rulli, tutte derivate dai token.
 */
export const PAYLINE_COLORS: readonly number[] = [
  PALETTE.gold.light,
  PALETTE.neon.pink,
  PALETTE.win.core,
  PALETTE.accent.sapphire.light,
  PALETTE.accent.violet.light,
  PALETTE.accent.amber.core,
  PALETTE.neon.cyan,
  PALETTE.red.light,
  PALETTE.accent.emerald.light,
  PALETTE.text.strong,
];

/** Numero hex Pixi -> stringa CSS `#rrggbb`. */
export function css(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/** Numero hex -> `r,g,b`, il formato delle custom property `--x-rgb` del CSS. */
export function rgbTriple(hex: number): string {
  return `${(hex >> 16) & 0xff},${(hex >> 8) & 0xff},${hex & 0xff}`;
}

/** Numero hex -> `rgba(r,g,b,a)`, per ombre e glow in CSS/Canvas2D. */
export function rgba(hex: number, alpha: number): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Interpolazione lineare fra due colori hex. `t` in [0,1]. */
export function mix(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return (r << 16) | (g << 8) | bl;
}

/** Schiarisce verso l'avorio del testo (non verso il bianco: resta caldo). */
export function lighten(hex: number, t: number): number {
  return mix(hex, PALETTE.text.strong, t);
}

/**
 * Scurisce verso il fondo prugna. E' l'ombra di questo tema: verso il nero
 * puro una tinta vira al grigio, verso il prugna resta viva.
 */
export function shade(hex: number, t: number): number {
  return mix(hex, PALETTE.plum.abyss, t);
}

/** Campiona la rampa oro in modo continuo (0 = riflesso, 1 = ombra). */
export function goldAt(t: number): number {
  const k = Math.max(0, Math.min(0.9999, t)) * (GOLD_RAMP.length - 1);
  const i = Math.floor(k);
  return mix(GOLD_RAMP[i]!, GOLD_RAMP[Math.min(i + 1, GOLD_RAMP.length - 1)]!, k - i);
}

/** Luminanza relativa WCAG di un colore. */
export function luminance(hex: number): number {
  const c = [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

/** Rapporto di contrasto WCAG fra due colori (1..21). */
export function contrast(a: number, b: number): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Colore per tier di vincita, usato da HUD e WinPresenter. */
export const WIN_TIER_COLOR = {
  normal: PALETTE.gold.core,
  big: PALETTE.gold.light,
  mega: PALETTE.win.core,
  epic: PALETTE.neon.pink,
  legendary: PALETTE.gold.hot,
} as const;

export type WinTier = keyof typeof WIN_TIER_COLOR;
