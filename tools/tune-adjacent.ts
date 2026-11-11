/**
 * Taratura dei premi dopo la regola "3+ su rulli adiacenti da qualunque rullo"
 * (11/11/2026). Scala i premi per numero di simboli e, se serve, l'altezza
 * delle pile sui nastri (la leva che abbassa la frequenza di vincita).
 *
 *   V='[{"n":"a","m":"sheikhsFortune","k":{"3":0.4,"4":0.6},"stack":3}]' npx vite-node tools/tune-adjacent.ts [spins]
 */
import { simulate, formatStats } from '../src/games/slots/engine/simulate';
import type { MachineDef, SymbolDef } from '../src/games/slots/engine/types';
import { GOLDEN_OASIS } from '../src/games/slots/machines/goldenOasis';
import { DF_BASE_COUNTS, DF_FREE_COUNTS, DF_STACK, DF_SYMBOLS, makeDesertFalcon } from '../src/games/slots/machines/desertFalcon';
import { SF_COUNTS, SF_STACK, SF_SYMBOLS, makeSheikhsFortune } from '../src/games/slots/machines/sheikhsFortune';

type V = { n: string; m: string; k?: Record<string, number>; stack?: number | Record<string, number>; land?: number; counts?: Record<string, number> };
const spins = Number(process.argv[2] ?? 1_000_000);
const variants = JSON.parse(process.env.V ?? '[]') as V[];

const scale = (syms: readonly SymbolDef[], k: Record<string, number> = {}): SymbolDef[] =>
  syms.map((s) =>
    s.pays
      ? { ...s, pays: Object.fromEntries(Object.entries(s.pays).map(([n, p]) => [n, +(p * (k[n] ?? 1)).toFixed(2)])) }
      : s
  );
const restack = (st: Readonly<Record<string, number>>, h?: number | Record<string, number>) =>
  typeof h === "object" ? { ...st, ...h } :
  h ? Object.fromEntries(Object.keys(st).map((x) => [x, h])) : st;

for (const v of variants) {
  let m: MachineDef;
  if (v.m === 'goldenOasis') m = { ...GOLDEN_OASIS, symbols: scale(GOLDEN_OASIS.symbols, v.k) };
  else if (v.m === 'desertFalcon')
    m = makeDesertFalcon(DF_BASE_COUNTS, DF_FREE_COUNTS, scale(DF_SYMBOLS, v.k), restack(DF_STACK, v.stack));
  else m = makeSheikhsFortune({ counts: v.counts ? SF_COUNTS.map((c) => ({ ...c, ...v.counts })) : undefined, symbols: scale(SF_SYMBOLS, v.k), stack: restack(SF_STACK, v.stack), landChance: v.land });
  const s = simulate(m, spins, 20261111);
  console.log(`${v.n}: ${formatStats(v.m, s)} · target ${m.rtpTarget}`);
}
