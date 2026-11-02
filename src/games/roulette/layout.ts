/**
 * THE ROYAL MIRAGE — Geometria del tappeto e del racetrack
 *
 * Anche questo modulo e' puro (niente Pixi): misure, hit-test e punti di
 * appoggio delle fiche. Lo usano sia la grafica cotta (`tableArt.ts`) sia
 * la scena, e soprattutto i test: "un click sul bordo fra 17 e 20 e' un
 * cavallo 17/20" e' una regola del tavolo, non un dettaglio grafico.
 *
 * ── Il tappeto (coordinate locali, origine in alto a sinistra) ──
 *
 *        ┌────┬────┬────┬ ··· ┬────┬─────┐
 *        │    │  3 │  6 │     │ 36 │ 2:1 │   riga 0
 *        │ 0  │  2 │  5 │     │ 35 │ 2:1 │   riga 1
 *        │    │  1 │  4 │     │ 34 │ 2:1 │   riga 2
 *        └────┼────┴────┴ ··· ┴────┼─────┘
 *             │ 1ª 12 │ 2ª 12 │ 3ª 12 │       dozzine
 *             │1-18│PARI│ ◆ │ ◆ │DISP│19-36│  chance semplici
 *
 * I bordi delle caselle numeriche sono zone di puntata a loro volta:
 *   · bordo verticale fra due numeri           → cavallo orizzontale
 *   · bordo orizzontale fra due numeri         → cavallo verticale
 *   · incrocio di quattro numeri               → carre'
 *   · bordo inferiore di una colonna           → terzina (street)
 *   · incrocio sul bordo inferiore             → sestina
 *   · bordo con lo zero                        → cavallo 0/n, terzine 0-1-2 e
 *                                                0-2-3, angolo basso = 0-1-2-3
 * La fascia sensibile e' larga `EDGE` pixel per lato: abbastanza per
 * centrarla col mouse, non tanto da rubare il pieno a chi clicca vicino.
 */

import {
  BASKET,
  TRIO_012,
  TRIO_023,
  WHEEL_ORDER,
  columnId,
  cornerId,
  dozenId,
  lineId,
  numberAt,
  colOf,
  rowOf,
  spot,
  splitId,
  straightId,
  streetId,
  POCKETS,
  type CallBetId,
} from './rules';

// ─────────────────────────────────────────────── TAPPETO

export const PAD = 16;
export const ZW = 78;
export const CW = 70;
export const CH = 92;
export const DH = 60;
export const EH = 60;
/** Origine della griglia dei numeri 1..36. */
export const X0 = PAD + ZW;
export const Y0 = PAD;
export const TABLE_W = X0 + 13 * CW + PAD;
export const TABLE_H = Y0 + 3 * CH + DH + EH + PAD;
export const EDGE = 12;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const inRect = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

export function cellRect(n: number): Rect {
  if (n === 0) return { x: PAD, y: Y0, w: ZW, h: 3 * CH };
  return { x: X0 + colOf(n) * CW, y: Y0 + rowOf(n) * CH, w: CW, h: CH };
}

/** Caselle delle puntate esterne (colonne, dozzine, chance semplici). */
export const OUTSIDE_RECTS: ReadonlyMap<string, Rect> = (() => {
  const m = new Map<string, Rect>();
  for (let r = 0; r < 3; r++) m.set(columnId((3 - r) as 1 | 2 | 3), { x: X0 + 12 * CW, y: Y0 + r * CH, w: CW, h: CH });
  for (let k = 0; k < 3; k++) m.set(dozenId((k + 1) as 1 | 2 | 3), { x: X0 + k * 4 * CW, y: Y0 + 3 * CH, w: 4 * CW, h: DH });
  const even = ['low', 'even', 'red', 'black', 'odd', 'high'];
  even.forEach((id, k) => m.set(id, { x: X0 + k * 2 * CW, y: Y0 + 3 * CH + DH, w: 2 * CW, h: EH }));
  return m;
})();

/** Puntata sotto al punto (x, y) del tappeto, o null fuori dalle caselle. */
export function hitTable(x: number, y: number): string | null {
  const gx = x - X0;
  const gy = y - Y0;
  // Griglia dei numeri, allargata di EDGE a sinistra (bordo con lo zero) e
  // in basso (terzine e sestine si appoggiano sul bordo inferiore).
  if (gx >= -EDGE && gx <= 12 * CW && gy >= 0 && gy <= 3 * CH + EDGE) {
    const fx = gx / CW;
    const fy = gy / CH;
    const vi = Math.round(fx);
    const hi = Math.round(fy);
    const nearV = Math.abs(gx - vi * CW) <= EDGE && vi <= 11;
    const nearH = Math.abs(gy - hi * CH) <= EDGE && hi >= 1;
    const col = Math.max(0, Math.min(11, Math.floor(fx)));
    const row = Math.max(0, Math.min(2, Math.floor(fy)));

    if (nearV && vi === 0) {
      if (nearH) return hi === 1 ? TRIO_023 : hi === 2 ? TRIO_012 : BASKET;
      return splitId(0, numberAt(0, row));
    }
    if (nearV) {
      if (nearH && hi <= 2) {
        return cornerId([numberAt(vi - 1, hi - 1), numberAt(vi, hi - 1), numberAt(vi - 1, hi), numberAt(vi, hi)]);
      }
      if (nearH && hi === 3) return lineId(vi - 1);
      return splitId(numberAt(vi - 1, row), numberAt(vi, row));
    }
    if (nearH) {
      if (hi <= 2) return splitId(numberAt(col, hi - 1), numberAt(col, hi));
      return streetId(col);
    }
    if (gx < 0) return straightId(0);
    return straightId(numberAt(col, row));
  }
  if (inRect(cellRect(0), x, y)) return straightId(0);
  for (const [id, r] of OUTSIDE_RECTS) if (inRect(r, x, y)) return id;
  return null;
}

/** Punto del tappeto dove si appoggia la pila di fiche di una puntata. */
export function anchorOf(id: string): { x: number; y: number } {
  const s = spot(id);
  const out = OUTSIDE_RECTS.get(id);
  if (out) return { x: out.x + out.w / 2, y: out.y + out.h / 2 };
  const nums = s.numbers;
  const cx = (n: number) => X0 + colOf(n) * CW + CW / 2;
  const cy = (n: number) => Y0 + rowOf(n) * CH + CH / 2;
  switch (s.kind) {
    case 'straight': {
      const r = cellRect(nums[0]!);
      return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    }
    case 'split': {
      const [a, b] = nums as [number, number];
      if (a === 0) return { x: X0, y: cy(b) };
      if (rowOf(a) === rowOf(b)) return { x: X0 + colOf(b) * CW, y: cy(a) };
      return { x: cx(a), y: Y0 + Math.max(rowOf(a), rowOf(b)) * CH };
    }
    case 'corner': {
      const maxCol = Math.max(...nums.map(colOf));
      const maxRow = Math.max(...nums.map(rowOf));
      return { x: X0 + maxCol * CW, y: Y0 + maxRow * CH };
    }
    case 'street':
      return { x: cx(nums[0]!), y: Y0 + 3 * CH };
    case 'line':
      return { x: X0 + (colOf(nums[0]!) + 1) * CW, y: Y0 + 3 * CH };
    case 'trio':
      return { x: X0, y: Y0 + (id === TRIO_012 ? 2 : 1) * CH };
    case 'basket':
      return { x: X0, y: Y0 + 3 * CH };
    default:
      return { x: X0, y: Y0 };
  }
}

// ─────────────────────────────────────────────── RACETRACK
// Lo "stadio" della roulette francese: i 37 numeri nell'ordine del
// cilindro corrono lungo un anello ovale, con lo zero all'estremita'
// destra. Dentro, le quattro zone degli annunci. Le divisioni interne sono
// OBLIQUE perche' collegano i confini reali fra le zone sui due rettilinei.

export const RT_W = 1000;
export const RT_H = 224;
export const RT_BAND = 56;
/** Raggio della linea mediana dell'anello. */
export const RT_RC = RT_H / 2 - RT_BAND / 2;
export const RT_CY = RT_H / 2;
export const RT_CXL = RT_H / 2;
export const RT_CXR = RT_W - RT_H / 2;
const STRAIGHT = RT_CXR - RT_CXL;
const ARC = Math.PI * RT_RC;
export const RT_LEN = 2 * STRAIGHT + 2 * ARC;
export const RT_CELL = RT_LEN / POCKETS;

/**
 * Punto a distanza `s` lungo la linea mediana (s=0 all'estremita' destra,
 * crescente in senso orario sullo schermo), spostato di `off` verso
 * l'esterno. Restituisce anche la normale uscente.
 */
export function rtPoint(s: number, off = 0): { x: number; y: number; nx: number; ny: number } {
  let t = ((s % RT_LEN) + RT_LEN) % RT_LEN;
  const r = RT_RC + off;
  // 1) mezzo arco destro, dal punto piu' a destra fino al basso.
  if (t < ARC / 2) {
    const a = t / RT_RC;
    return { x: RT_CXR + Math.cos(a) * r, y: RT_CY + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) };
  }
  t -= ARC / 2;
  // 2) rettilineo inferiore, verso sinistra.
  if (t < STRAIGHT) return { x: RT_CXR - t, y: RT_CY + r, nx: 0, ny: 1 };
  t -= STRAIGHT;
  // 3) arco sinistro, dal basso all'alto passando per sinistra.
  if (t < ARC) {
    const a = Math.PI / 2 + t / RT_RC;
    return { x: RT_CXL + Math.cos(a) * r, y: RT_CY + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) };
  }
  t -= ARC;
  // 4) rettilineo superiore, verso destra.
  if (t < STRAIGHT) return { x: RT_CXL + t, y: RT_CY - r, nx: 0, ny: -1 };
  t -= STRAIGHT;
  // 5) ultimo quarto d'arco destro, dall'alto al punto piu' a destra.
  const a = -Math.PI / 2 + t / RT_RC;
  return { x: RT_CXR + Math.cos(a) * r, y: RT_CY + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) };
}

/** Ascissa curvilinea del punto della linea mediana piu' vicino a (x, y). */
function rtParam(x: number, y: number): number {
  if (x >= RT_CXL && x <= RT_CXR) {
    // Rettilinei: sopra si va verso destra, sotto verso sinistra.
    if (y >= RT_CY) return ARC / 2 + (RT_CXR - x);
    return ARC / 2 + STRAIGHT + ARC + (x - RT_CXL);
  }
  if (x > RT_CXR) {
    let a = Math.atan2(y - RT_CY, x - RT_CXR); // -PI/2..PI/2
    if (a < 0) return RT_LEN + a * RT_RC;
    return a * RT_RC;
  }
  const a = Math.atan2(y - RT_CY, x - RT_CXL); // PI/2..3PI/2 (o negativo in alto)
  const aa = a < 0 ? a + 2 * Math.PI : a;
  return ARC / 2 + STRAIGHT + (aa - Math.PI / 2) * RT_RC;
}

/** Distanza dalla "spina" dello stadio (il segmento fra i due centri). */
function spineDist(x: number, y: number): number {
  const cx = Math.max(RT_CXL, Math.min(RT_CXR, x));
  return Math.hypot(x - cx, y - RT_CY);
}

/** Arco [s0, s1] della casella `i` (indice nell'ordine del cilindro). */
export function rtCellSpan(i: number): [number, number] {
  return [(i - 0.5) * RT_CELL, (i + 0.5) * RT_CELL];
}

/**
 * Le tre divisioni oblique interne. Ciascuna collega il confine fra due
 * caselle sul rettilineo superiore con quello sul rettilineo inferiore.
 * Sono espresse come indici di confine (fra la casella i-1 e la i).
 */
const DIVIDERS: readonly { top: number; bottom: number }[] = [
  { top: 23, bottom: 11 }, // Terzo | Orfanelli   (33|1 sopra, 6|27 sotto)
  { top: 28, bottom: 8 }, //  Orfanelli | Vicini  (9|22 sopra, 25|17 sotto)
  { top: 33, bottom: 3 }, //  Vicini | Zero       (28|12 sopra, 15|19 sotto)
];
const INNER_TOP = RT_CY - (RT_RC - RT_BAND / 2);
const INNER_BOTTOM = RT_CY + (RT_RC - RT_BAND / 2);

/** Segmenti delle divisioni, per il disegno: x sul bordo interno alto e basso. */
export function rtDividers(): { xTop: number; xBottom: number; yTop: number; yBottom: number }[] {
  return DIVIDERS.map((d) => ({
    xTop: rtPoint((d.top - 0.5) * RT_CELL).x,
    xBottom: rtPoint((d.bottom - 0.5) * RT_CELL).x,
    yTop: INNER_TOP,
    yBottom: INNER_BOTTOM,
  }));
}

/** Le zone interne da sinistra a destra. */
export const RT_SECTIONS: readonly CallBetId[] = ['tiers', 'orphelins', 'voisins', 'zero'];

export type RtHit = { type: 'number'; n: number } | { type: 'call'; id: CallBetId };

export function hitRacetrack(x: number, y: number): RtHit | null {
  const d = spineDist(x, y);
  if (Math.abs(d - RT_RC) <= RT_BAND / 2) {
    const i = Math.round(rtParam(x, y) / RT_CELL) % POCKETS;
    return { type: 'number', n: WHEEL_ORDER[i]! };
  }
  if (d < RT_RC - RT_BAND / 2) {
    const t = (y - INNER_TOP) / (INNER_BOTTOM - INNER_TOP);
    const divs = rtDividers();
    let k = 0;
    for (const dv of divs) if (x > dv.xTop + (dv.xBottom - dv.xTop) * t) k++;
    return { type: 'call', id: RT_SECTIONS[k]! };
  }
  return null;
}

/** Centro della zona interna di un annuncio (per l'etichetta). */
export function rtSectionCenter(id: CallBetId): { x: number; y: number } {
  const divs = rtDividers();
  const mid = (d: { xTop: number; xBottom: number }) => (d.xTop + d.xBottom) / 2;
  const k = RT_SECTIONS.indexOf(id);
  const left = k === 0 ? RT_CXL - RT_RC + RT_BAND / 2 : mid(divs[k - 1]!);
  const right = k === 3 ? RT_CXR + RT_RC - RT_BAND / 2 : mid(divs[k]!);
  return { x: (left + right) / 2, y: RT_CY };
}
