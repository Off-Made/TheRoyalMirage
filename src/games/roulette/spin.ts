/**
 * THE ROYAL MIRAGE — Traiettoria di ruota e pallina
 *
 * Modulo PURO (niente Pixi): la scena lo interroga a ogni fotogramma, i test
 * lo interrogano a tempi scelti. E' qui la promessa piu' importante di una
 * roulette finta: la pallina si ferma ESATTAMENTE nella casella del numero
 * gia' estratto. Non "vicino", non "con un'animazione a caso e poi un
 * cartello": chi guarda il cilindro deve poter leggere il risultato.
 *
 * ── Il trucco: lavorare nel riferimento della ruota ──
 * Se pallina e ruota si muovessero ciascuna per conto suo, far coincidere
 * la pallina con una casella che a sua volta gira richiederebbe di
 * risolvere un'equazione a ogni giro. Invece si descrive la pallina
 * RELATIVA alla ruota: `rel(t)` parte da dove si trova e arriva, con una
 * frenata morbida, all'angolo della casella estratta. La posizione nel
 * mondo e' `ruota(t) + rel(t)`.
 *
 *   · alla fine `rel` e' fermo → la pallina si muove con la ruota: e'
 *     "dentro la casella", senza scatti di velocita';
 *   · all'inizio `rel` corre all'indietro molto piu' veloce della ruota →
 *     nel mondo la pallina gira in senso opposto, come al tavolo vero.
 *
 * Angoli in radianti, positivi in senso orario sullo schermo (y verso il
 * basso, la convenzione di Pixi). Angolo 0 della casella 0 = ore 12.
 */

import { POCKETS, WHEEL_INDEX, WHEEL_ORDER } from './rules';

const TAU = Math.PI * 2;
export const POCKET_ARC = TAU / POCKETS;

// Raggi nello spazio della ruota (texture circolare, prima dello schiacciamento).
export const ROTOR_R = 270;
export const BOWL_R = 336;
/** Pista della pallina: la gola sotto il bordo del catino. */
export const TRACK_R = 308;
/** Fine dello scivolo dei deflettori: qui la pallina tocca il rotore. */
export const APRON_R = 262;
/** Dove riposa la pallina dentro una casella. */
export const POCKET_R = 219;
/** Anello dei deflettori, fissi nel catino. */
export const DEFLECTOR_R = 285;
export const DEFLECTORS = 8;

/** Angolo (riferimento della ruota) del centro della casella di indice `i`. */
export function pocketAngle(i: number): number {
  return -Math.PI / 2 + i * POCKET_ARC;
}

/** Angoli dei deflettori nel riferimento del catino (fisso). */
export const DEFLECTOR_ANGLES: readonly number[] = Array.from(
  { length: DEFLECTORS },
  (_, k) => -Math.PI / 2 + (k + 0.5) * (TAU / DEFLECTORS)
);

/** Angolo ridotto in [0, 2π). */
export function wrap(a: number): number {
  return ((a % TAU) + TAU) % TAU;
}

/** Numero della casella che si trova all'angolo `rel` (riferimento della ruota). */
export function numberAtAngle(rel: number): number {
  const i = Math.round(wrap(rel + Math.PI / 2) / POCKET_ARC) % POCKETS;
  return WHEEL_ORDER[i]!;
}

export interface SpinPlan {
  readonly n: number;
  /** Corsa libera della pallina, fino all'ingresso nella casella. */
  readonly duration: number;
  /** Tempo in cui la ruota, con la pallina dentro, finisce di rallentare. */
  readonly settle: number;
  readonly rotor0: number;
  readonly rotorTravel: number;
  readonly rel0: number;
  readonly relTravel: number;
}

export interface SpinOptions {
  duration: number;
  settle: number;
  /** Giri della ruota sull'intera animazione (senso orario). */
  rotorTurns?: number;
  /** Giri all'indietro della pallina rispetto alla ruota, oltre al minimo. */
  ballTurns?: number;
}

/**
 * Prepara l'animazione per il numero `n` GIA' estratto.
 * `rotor0` e `ball0` sono gli angoli attuali (la ruota non riparte da zero a
 * ogni giro: chi guarda noterebbe lo scatto).
 */
export function planSpin(n: number, rotor0: number, ball0: number, o: SpinOptions): SpinPlan {
  const duration = Math.max(0.05, o.duration);
  const settle = Math.max(0, o.settle);
  const rotorTravel = TAU * (o.rotorTurns ?? 1.6);
  const rel0 = ball0 - rotor0;
  const target = pocketAngle(WHEEL_INDEX[n]!);
  // Distanza all'indietro fino alla casella, in (−2π, 0], piu' i giri pieni.
  let back = wrap(target - rel0) - TAU;
  if (back <= -TAU) back += TAU;
  const relTravel = back - TAU * Math.max(0, Math.round(o.ballTurns ?? 4));
  return { n, duration, settle, rotor0, rotorTravel, rel0, relTravel };
}

const easeOutQuad = (p: number) => 1 - (1 - p) * (1 - p);
const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;
const clamp01 = (p: number) => Math.max(0, Math.min(1, p));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function totalTime(p: SpinPlan): number {
  return p.duration + p.settle;
}

/** Rotazione della ruota al tempo `t`. */
export function rotorAt(p: SpinPlan, t: number): number {
  return p.rotor0 + p.rotorTravel * easeOutQuad(clamp01(t / totalTime(p)));
}

/** Posizione della pallina relativa alla ruota (angolo) al tempo `t`. */
export function relAt(p: SpinPlan, t: number): number {
  return p.rel0 + p.relTravel * easeOutCubic(clamp01(t / p.duration));
}

/**
 * Raggio della pallina: corre in gola, scende lungo i deflettori, poi
 * saltella fra i diaframmi e si posa. L'altezza dei rimbalzi si spegne con
 * il tempo, cosi' a fine corsa il raggio vale esattamente POCKET_R.
 */
export function radiusAt(p: SpinPlan, t: number): number {
  const q = clamp01(t / p.duration);
  if (q < 0.52) return TRACK_R;
  if (q < 0.84) return TRACK_R + (APRON_R - TRACK_R) * smooth(0.52, 0.84, q);
  const k = (q - 0.84) / 0.16;
  const hop = 15 * Math.abs(Math.sin(k * Math.PI * 3)) * (1 - k);
  return APRON_R + (POCKET_R - APRON_R) * smooth(0, 0.55, k) + hop;
}

export interface BallState {
  /** Angolo nel riferimento del catino (fisso), quello che si disegna. */
  angle: number;
  rel: number;
  radius: number;
  /** Vero da quando la pallina e' entrata nella casella. */
  landed: boolean;
}

export function ballAt(p: SpinPlan, t: number): BallState {
  const rel = relAt(p, t);
  return { angle: rotorAt(p, t) + rel, rel, radius: radiusAt(p, t), landed: t >= p.duration };
}
