/**
 * Taratura di The Royal Mirage: prova varianti delle frequenze e stampa l'RTP.
 *   npx vite-node tools/tune-go.ts
 */
import { simulate, formatStats } from '../src/games/slots/engine/simulate';
import { makeGoldenOasis, GO_BASE_COUNTS, GO_FREE_COUNTS } from '../src/games/slots/machines/goldenOasis';
import type { StripCounts } from '../src/games/slots/engine/strips';

type Patch = (reel: number, c: Record<string, number>) => void;
const apply = (src: readonly StripCounts[], fn: Patch) =>
  src.map((c, i) => {
    const x = { ...c } as Record<string, number>;
    fn(i, x);
    return x;
  });

const variants: Record<string, [Patch, Patch]> = JSON.parse(process.env.VARIANTS ?? 'null') ?? {};
void variants;

const S = (pat: number[]): Patch => (r, c) => { c.S = pat[r]!; };
const pat = [1, 2, 1, 2, 1];
const base: Patch = (r, c) => { c.S = pat[r]!; c.T = 7; c.J = 7; };
const opts: [string, number, Record<number, number>][] = [
  ['x3 10/15/20', 3, { 3: 10, 4: 15, 5: 20 }],
  ['x3 11/16/22', 3, { 3: 11, 4: 16, 5: 22 }],
  ['x3 12/18/25', 3, { 3: 12, 4: 18, 5: 25 }],
];
for (const [name, mult, fs] of opts) {
  const m0 = makeGoldenOasis(apply(GO_BASE_COUNTS, base), apply(GO_FREE_COUNTS, S([1, 1, 2, 1, 1])));
  const m = {
    ...m0,
    symbols: m0.symbols.map((x) => (x.scatter ? { ...x, freeSpins: fs } : x)),
    freeSpins: { ...m0.freeSpins!, ladder: [mult] },
  };
  console.log(formatStats(name, simulate(m, 2_000_000, 7)));
}
