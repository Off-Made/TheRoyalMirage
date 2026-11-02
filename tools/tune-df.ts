/**
 * Taratura di Desert Falcon: prova varianti e stampa le statistiche.
 *   npx vite-node tools/tune-df.ts [spins]
 * Le varianti si scrivono qui sotto; il modello definitivo va copiato in
 * `src/games/slots/machines/desertFalcon.ts`.
 */
import { simulate, formatStats } from '../src/games/slots/engine/simulate';
import { makeDesertFalcon, DF_SYMBOLS } from '../src/games/slots/machines/desertFalcon';
import type { StripCounts } from '../src/games/slots/engine/strips';
import type { SymbolDef } from '../src/games/slots/engine/types';

const spins = Number(process.argv[2] ?? 1_000_000);
const reels = (first: Record<string, number>, rest: Record<string, number>): StripCounts[] =>
  [first, rest, rest, rest, rest];
const scale = (k: number, kLow = k): SymbolDef[] =>
  DF_SYMBOLS.map((s) => {
    if (!s.pays) return s;
    const f = 'AKQJT'.includes(s.id) ? kLow : k;
    return { ...s, pays: Object.fromEntries(Object.entries(s.pays).map(([n, v]) => [n, Math.round(v * f * 10) / 10])) };
  });

const V = JSON.parse(process.env.V ?? '[]') as { n: string; b: Record<string, number>; w: number; fw: number; st: Record<string, number>; k?: number; kl?: number; s?: number[] }[];
for (const v of V) {
  const sc = (rs: StripCounts[]) => rs.map((c, i) => (v.s ? { ...c, S: v.s[i]! } : c));
  const m = makeDesertFalcon(sc(reels(v.b, { ...v.b, W: v.w })), sc(reels(v.b, { ...v.b, W: v.fw })), scale(v.k ?? 1, v.kl ?? v.k ?? 1), v.st);
  console.log(formatStats(v.n, simulate(m, spins, 7)), 'L', m.strips[1]!.length);
}
