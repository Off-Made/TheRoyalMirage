/**
 * Taratura di Lucky Sevens (id `goldenOasis`): prova varianti delle strisce
 * base e stampa RTP e frequenza di vincita. L'RTP si chiude poi moltiplicando
 * tutti i premi per uno stesso fattore (l'RTP e' lineare nei premi).
 *
 *   npx vite-node tools/tune-go.ts [spins]
 */
import { simulate, formatStats } from '../src/games/slots/engine/simulate';
import { makeGoldenOasis, GO_BASE_COUNTS, GO_FREE_COUNTS } from '../src/games/slots/machines/goldenOasis';
import type { StripCounts } from '../src/games/slots/engine/strips';
import type { MachineDef } from '../src/games/slots/engine/types';

const spins = Number(process.argv[2] ?? 1_000_000);

type Counts = Record<string, number>;
/** Applica le stesse frequenze dei simboli normali a tutti i rulli (W e S restano). */
const withLow = (src: readonly StripCounts[], low: Counts): StripCounts[] =>
  src.map((c) => {
    const x = { ...c, ...low } as Counts;
    // W esiste solo sui rulli 2-4; S tiene il suo schema per rullo se non indicato.
    if (!('W' in c)) delete x.W;
    if (low.S2 !== undefined) x.S = 'W' in c && (c as Counts).S === 2 ? low.S2 : (c as Counts).S!;
    delete x.S2;
    return x as StripCounts;
  });

/** Moltiplica tutti i premi (linee e scatter). */
export function scalePays(m: MachineDef, k: number): MachineDef {
  const sc = (o?: Record<number, number>) =>
    o && Object.fromEntries(Object.entries(o).map(([n, v]) => [n, Math.round(v * k * 100) / 100]));
  return { ...m, symbols: m.symbols.map((s) => ({ ...s, pays: sc(s.pays), scatterPays: sc(s.scatterPays) })) };
}

const VARIANTS: [string, Counts][] = process.env.FACTOR ? [] : JSON.parse(process.env.VARIANTS ?? "null") ?? [
  ['attuale', {}],
  ['A', { F: 2, C: 3, O: 3, D: 4, G: 4, A: 4, K: 4, Q: 4, J: 5, T: 5 }],
  ['B', { F: 2, C: 3, O: 3, D: 4, G: 4, A: 4, K: 4, Q: 4, J: 4, T: 4 }],
  ['C', { F: 3, C: 3, O: 4, D: 4, G: 4, A: 4, K: 4, Q: 4, J: 4, T: 4 }],
];

for (const [name, low] of VARIANTS) {
  const m = makeGoldenOasis(withLow(GO_BASE_COUNTS, low), GO_FREE_COUNTS);
  const s = simulate(m, spins, 7);
  console.log(`${formatStats(name, s)} · fattore premi per 96,2%: ${(96.2 / s.rtp).toFixed(3)}`);
}

// Verifica con premi scalati: FACTOR=1.278 LOW='{"W":1,...}' npx vite-node tools/tune-go.ts 4000000
if (process.env.FACTOR) {
  const low: Counts = JSON.parse(process.env.LOW ?? '{}');
  const k = Number(process.env.FACTOR);
  const m = scalePays(makeGoldenOasis(withLow(GO_BASE_COUNTS, low), GO_FREE_COUNTS), k);
  for (const seed of [20261028, 99]) console.log(formatStats(`×${k} seme ${seed}`, simulate(m, spins, seed)));
}
