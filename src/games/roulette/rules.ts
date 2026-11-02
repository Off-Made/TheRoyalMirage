/**
 * THE ROYAL MIRAGE — Regole della roulette europea (zero singolo)
 *
 * Modulo PURO: niente Pixi, niente DOM, niente store. Qui vive tutta la
 * matematica del tavolo, cosi' i test la verificano senza avviare un
 * renderer e la scena si limita a recitarla.
 *
 * ── Una sola formula per tutte le puntate ──
 * Su 37 caselle, una puntata che copre `k` numeri paga `36/k − 1` a uno:
 *
 *     pieno      1 numero   → 35:1        cavallo   2 → 17:1
 *     terzina    3          → 11:1        carre'    4 →  8:1
 *     sestina    6          →  5:1        colonna/dozzina 12 → 2:1
 *     chance semplici 18    →  1:1
 *
 * Il ritorno lordo atteso di OGNI puntata e' quindi (36/k)·(k/37) = 36/37
 * = 97,297%: il vantaggio del banco e' tutto nello zero, uguale per ogni
 * scelta. I test lo verificano in aritmetica intera, puntata per puntata —
 * se una tabella dei pagamenti avesse un refuso, il numero non tornerebbe.
 *
 * ── Identificativi delle puntate ──
 * Ogni puntata e' una stringa leggibile e stabile:
 *   'straight:17'  'split:17-20'  'street:16-17-18'  'corner:1-2-4-5'
 *   'line:1-2-3-4-5-6'  'trio:0-1-2'  'basket:0-1-2-3'
 *   'column:1..3'  'dozen:1..3'  'red' 'black' 'even' 'odd' 'low' 'high'
 * I numeri sono sempre in ordine crescente: lo stesso cavallo cliccato da
 * due lati diversi del bordo produce lo stesso id, quindi la stessa pila.
 *
 * Nessuna regola "La Partage" / "En Prison": le chance semplici perdono
 * per intero sullo zero, come in tutte le roulette europee online. Cosi'
 * l'RTP e' davvero lo stesso per ogni puntata, e il registro dice il vero.
 */

/** Ordine fisico delle caselle sul cilindro, in senso orario dallo zero. */
export const WHEEL_ORDER: readonly number[] = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22,
  18, 29, 7, 28, 12, 35, 3, 26,
];

export const POCKETS = 37;

/** Posizione di ciascun numero sul cilindro (inversa di WHEEL_ORDER). */
export const WHEEL_INDEX: readonly number[] = (() => {
  const idx = new Array<number>(POCKETS).fill(0);
  WHEEL_ORDER.forEach((n, i) => (idx[n] = i));
  return idx;
})();

export const RED_NUMBERS: ReadonlySet<number> = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type NumColor = 'red' | 'black' | 'green';

export function colorOf(n: number): NumColor {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

// ─────────────────────────────────────────────── TIPI DI PUNTATA

export type BetKind =
  | 'straight'
  | 'split'
  | 'street'
  | 'trio'
  | 'corner'
  | 'basket'
  | 'line'
  | 'column'
  | 'dozen'
  | 'red'
  | 'black'
  | 'even'
  | 'odd'
  | 'low'
  | 'high';

/** Pagamento "a uno" di ciascun tipo (la posta torna in piu'). */
export const PAYOUT: Readonly<Record<BetKind, number>> = {
  straight: 35,
  split: 17,
  street: 11,
  trio: 11,
  corner: 8,
  basket: 8,
  line: 5,
  column: 2,
  dozen: 2,
  red: 1,
  black: 1,
  even: 1,
  odd: 1,
  low: 1,
  high: 1,
};

/** Puntate interne: si piazzano sui numeri e sui loro bordi. */
export const INSIDE_KINDS: ReadonlySet<BetKind> = new Set([
  'straight',
  'split',
  'street',
  'trio',
  'corner',
  'basket',
  'line',
]);

export interface BetSpot {
  readonly id: string;
  readonly kind: BetKind;
  /** Numeri coperti, in ordine crescente. */
  readonly numbers: readonly number[];
  /** Pagamento a uno (35 = 35:1). */
  readonly payout: number;
}

// ─────────────────────────────────────────────── GEOMETRIA DEL TAPPETO
// Il tappeto e' una griglia di 12 colonne x 3 righe. La riga 0 e' quella
// in alto (3, 6, 9 ... 36), la riga 2 quella in basso (1, 4, 7 ... 34).
// Le funzioni qui sotto servono sia a generare le puntate sia al layout.

/** Numero nella colonna `col` (0..11) e riga `row` (0 = alto). */
export function numberAt(col: number, row: number): number {
  return col * 3 + (3 - row);
}
export function colOf(n: number): number {
  return Math.floor((n - 1) / 3);
}
export function rowOf(n: number): number {
  return 2 - ((n - 1) % 3);
}

const OUTSIDE_IDS = ['red', 'black', 'even', 'odd', 'low', 'high'] as const;

function insideId(kind: BetKind, numbers: readonly number[]): string {
  return `${kind}:${[...numbers].sort((a, b) => a - b).join('-')}`;
}

export const straightId = (n: number): string => `straight:${n}`;
export const splitId = (a: number, b: number): string => insideId('split', [a, b]);
export const cornerId = (nums: readonly number[]): string => insideId('corner', nums);
/** Terzina della colonna `col` (0..11). */
export const streetId = (col: number): string => insideId('street', [col * 3 + 1, col * 3 + 2, col * 3 + 3]);
/** Sestina delle colonne `col` e `col+1` (col 0..10). */
export const lineId = (col: number): string =>
  insideId('line', [1, 2, 3, 4, 5, 6].map((k) => col * 3 + k));
/** Colonna 1 = 1,4,7...34 (riga in basso); colonna 3 = 3,6...36 (riga in alto). */
export const columnId = (k: 1 | 2 | 3): string => `column:${k}`;
export const dozenId = (k: 1 | 2 | 3): string => `dozen:${k}`;
export const TRIO_012 = 'trio:0-1-2';
export const TRIO_023 = 'trio:0-2-3';
export const BASKET = 'basket:0-1-2-3';

function build(): Map<string, BetSpot> {
  const m = new Map<string, BetSpot>();
  const add = (kind: BetKind, numbers: number[], id = insideId(kind, numbers)) => {
    const nums = [...numbers].sort((a, b) => a - b);
    m.set(id, { id, kind, numbers: nums, payout: PAYOUT[kind] });
  };
  const range = (from: number, to: number, f: (n: number) => boolean = () => true) => {
    const out: number[] = [];
    for (let n = from; n <= to; n++) if (f(n)) out.push(n);
    return out;
  };

  for (let n = 0; n <= 36; n++) add('straight', [n]);

  // Cavalli: orizzontali (stessa riga, colonne vicine), verticali (stessa
  // colonna, righe vicine) e i tre cavalli con lo zero (0-1, 0-2, 0-3).
  for (let c = 0; c < 11; c++) for (let r = 0; r < 3; r++) add('split', [numberAt(c, r), numberAt(c + 1, r)]);
  for (let c = 0; c < 12; c++) for (let r = 0; r < 2; r++) add('split', [numberAt(c, r), numberAt(c, r + 1)]);
  for (const n of [1, 2, 3]) add('split', [0, n]);

  for (let c = 0; c < 12; c++) add('street', [c * 3 + 1, c * 3 + 2, c * 3 + 3]);
  add('trio', [0, 1, 2]);
  add('trio', [0, 2, 3]);

  for (let c = 0; c < 11; c++) {
    for (let r = 0; r < 2; r++) {
      add('corner', [numberAt(c, r), numberAt(c + 1, r), numberAt(c, r + 1), numberAt(c + 1, r + 1)]);
    }
  }
  add('basket', [0, 1, 2, 3]);
  for (let c = 0; c < 11; c++) add('line', range(c * 3 + 1, c * 3 + 6));

  for (const k of [1, 2, 3] as const) add('column', range(1, 36, (n) => n % 3 === k % 3), columnId(k));
  for (const k of [1, 2, 3] as const) add('dozen', range((k - 1) * 12 + 1, k * 12), dozenId(k));

  const outside: Record<(typeof OUTSIDE_IDS)[number], (n: number) => boolean> = {
    red: (n) => RED_NUMBERS.has(n),
    black: (n) => !RED_NUMBERS.has(n),
    even: (n) => n % 2 === 0,
    odd: (n) => n % 2 === 1,
    low: (n) => n <= 18,
    high: (n) => n >= 19,
  };
  for (const id of OUTSIDE_IDS) add(id, range(1, 36, outside[id]), id);
  return m;
}

/** Tutte le puntate del tavolo, per id. Costruite una volta all'import. */
export const SPOTS: ReadonlyMap<string, BetSpot> = build();

export function spot(id: string): BetSpot {
  const s = SPOTS.get(id);
  if (!s) throw new Error(`Puntata sconosciuta: ${id}`);
  return s;
}

export function covers(id: string, n: number): boolean {
  return spot(id).numbers.includes(n);
}

// ─────────────────────────────────────────────── PAGAMENTI

/** Mappa id → fiche puntate. Le scene usano una Map, i test anche oggetti. */
export type BetMap = ReadonlyMap<string, number>;

export function totalStake(bets: BetMap): number {
  let t = 0;
  for (const v of bets.values()) t += v;
  return t;
}

/**
 * Vincita LORDA per il numero uscito: per ogni puntata vincente la posta
 * torna, piu' la posta per il pagamento a uno. Le perdenti valgono 0.
 * Interi in ingresso → intero in uscita: nessun arrotondamento possibile.
 */
export function grossPayout(bets: BetMap, n: number): number {
  let g = 0;
  for (const [id, amount] of bets) {
    const s = spot(id);
    if (s.numbers.includes(n)) g += amount * (s.payout + 1);
  }
  return g;
}

/** Puntate vincenti per il numero `n`. */
export function winningIds(bets: BetMap, n: number): string[] {
  const out: string[] = [];
  for (const id of bets.keys()) if (covers(id, n)) out.push(id);
  return out;
}

// ─────────────────────────────────────────────── ANNUNCI (CALL BETS)
// Le puntate "a voce" della roulette francese sono zone del CILINDRO, non
// del tappeto. Il croupier le traduce in fiche sul tappeto: qui c'e' la
// stessa traduzione, in unita' (1 unita' = una fiche del taglio scelto).

export type CallBetId = 'voisins' | 'tiers' | 'orphelins' | 'zero';

export interface CallChip {
  id: string;
  units: number;
}

export const CALL_BETS: Readonly<Record<CallBetId, readonly CallChip[]>> = {
  // Vicini dello zero: 17 numeri da 22 a 25, 9 fiche.
  // Terzina 0-2-3 e carre' 25-26-28-29 prendono due fiche ciascuno.
  voisins: [
    { id: TRIO_023, units: 2 },
    { id: splitId(4, 7), units: 1 },
    { id: splitId(12, 15), units: 1 },
    { id: splitId(18, 21), units: 1 },
    { id: splitId(19, 22), units: 1 },
    { id: cornerId([25, 26, 28, 29]), units: 2 },
    { id: splitId(32, 35), units: 1 },
  ],
  // Terzo del cilindro: i 12 numeri opposti allo zero, 6 cavalli.
  tiers: [
    { id: splitId(5, 8), units: 1 },
    { id: splitId(10, 11), units: 1 },
    { id: splitId(13, 16), units: 1 },
    { id: splitId(23, 24), units: 1 },
    { id: splitId(27, 30), units: 1 },
    { id: splitId(33, 36), units: 1 },
  ],
  // Orfanelli: gli 8 numeri rimasti fuori da Vicini e Terzo, 5 fiche.
  orphelins: [
    { id: straightId(1), units: 1 },
    { id: splitId(6, 9), units: 1 },
    { id: splitId(14, 17), units: 1 },
    { id: splitId(17, 20), units: 1 },
    { id: splitId(31, 34), units: 1 },
  ],
  // Gioco dello zero: i 7 numeri attorno allo zero, 4 fiche.
  zero: [
    { id: splitId(0, 3), units: 1 },
    { id: splitId(12, 15), units: 1 },
    { id: straightId(26), units: 1 },
    { id: splitId(32, 35), units: 1 },
  ],
};

/** I numeri del cilindro a distanza <= k da `n` (n compreso), in ordine di ruota. */
export function neighbours(n: number, k = 2): number[] {
  const i = WHEEL_INDEX[n]!;
  const out: number[] = [];
  for (let d = -k; d <= k; d++) out.push(WHEEL_ORDER[(i + d + POCKETS) % POCKETS]!);
  return out;
}

/** Annuncio "n e i suoi vicini": un pieno su ciascuno dei 2k+1 numeri. */
export function neighboursBet(n: number, k = 2): CallChip[] {
  return neighbours(n, k).map((x) => ({ id: straightId(x), units: 1 }));
}

/** Numeri coperti da un insieme di fiche (unione, ordinata). */
export function coveredNumbers(chips: readonly CallChip[] | readonly string[]): number[] {
  const set = new Set<number>();
  for (const c of chips) for (const n of spot(typeof c === 'string' ? c : c.id).numbers) set.add(n);
  return [...set].sort((a, b) => a - b);
}

/** Espande un annuncio in fiche reali di valore `chip`. */
export function expandCall(chips: readonly CallChip[], chip: number): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of chips) m.set(c.id, (m.get(c.id) ?? 0) + c.units * chip);
  return m;
}

// ─────────────────────────────────────────────── LIMITI DEL TAVOLO

/**
 * Massimo per singola puntata, proporzionale ai numeri coperti — come ai
 * tavoli veri, dove il cavallo ammette il doppio del pieno e la chance
 * semplice diciotto volte tanto. `ceiling` e' il tetto del pieno (dal rango
 * VIP del giocatore): cosi' la vincita massima di ogni casella e' la stessa,
 * 36 volte il tetto.
 */
export function spotLimit(id: string, ceiling: number): number {
  return ceiling * spot(id).numbers.length;
}

// ─────────────────────────────────────────────── DESCRIZIONE DI UN NUMERO

export interface NumberTraits {
  color: NumColor;
  parity: 'even' | 'odd' | null;
  half: 'low' | 'high' | null;
  dozen: 1 | 2 | 3 | null;
  column: 1 | 2 | 3 | null;
}

export function traits(n: number): NumberTraits {
  if (n === 0) return { color: 'green', parity: null, half: null, dozen: null, column: null };
  return {
    color: colorOf(n),
    parity: n % 2 === 0 ? 'even' : 'odd',
    half: n <= 18 ? 'low' : 'high',
    dozen: (Math.floor((n - 1) / 12) + 1) as 1 | 2 | 3,
    column: (((n - 1) % 3) + 1) as 1 | 2 | 3,
  };
}

// ─────────────────────────────────────────────── STATISTICHE

export interface SpinStats {
  count: number;
  /** Frequenza per numero 0..36. */
  freq: number[];
  hot: number[];
  cold: number[];
  red: number;
  black: number;
  zero: number;
  even: number;
  odd: number;
  low: number;
  high: number;
  dozens: [number, number, number];
}

/**
 * Statistiche sulle ultime uscite (la piu' recente per prima).
 * "Caldi" e "freddi" sono pura curiosita' da tavolo: ogni giro e'
 * indipendente e il cilindro non ha memoria. Lo dicono anche le regole.
 */
/** Indice "mai visto": grande ma finito, perche' Infinity − Infinity = NaN rompe il sort. */
const NEVER = 1e9;

export function stats(history: readonly number[], window = 100, top = 5): SpinStats {
  const h = history.slice(0, window);
  const freq = new Array<number>(POCKETS).fill(0);
  const lastSeen = new Array<number>(POCKETS).fill(NEVER);
  const s: SpinStats = {
    count: h.length,
    freq,
    hot: [],
    cold: [],
    red: 0,
    black: 0,
    zero: 0,
    even: 0,
    odd: 0,
    low: 0,
    high: 0,
    dozens: [0, 0, 0],
  };
  h.forEach((n, i) => {
    freq[n]!++;
    if (lastSeen[n] === NEVER) lastSeen[n] = i;
    const t = traits(n);
    if (t.color === 'red') s.red++;
    else if (t.color === 'black') s.black++;
    else s.zero++;
    if (t.parity === 'even') s.even++;
    if (t.parity === 'odd') s.odd++;
    if (t.half === 'low') s.low++;
    if (t.half === 'high') s.high++;
    if (t.dozen) s.dozens[t.dozen - 1]++;
  });
  const all = [...Array(POCKETS).keys()];
  // A parita' di frequenza: caldo = uscito piu' di recente, freddo = da piu' tempo.
  s.hot = [...all].filter((n) => freq[n]! > 0).sort((a, b) => freq[b]! - freq[a]! || lastSeen[a]! - lastSeen[b]!).slice(0, top);
  s.cold = [...all].sort((a, b) => freq[a]! - freq[b]! || lastSeen[b]! - lastSeen[a]!).slice(0, top);
  return s;
}
