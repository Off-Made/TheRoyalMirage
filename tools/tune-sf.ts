/**
 * Taratura di Sheikh's Fortune: statistiche estese sull'Hold & Win.
 *   V='[{"n":"x","landChance":0.03}]' npx vite-node tools/tune-sf.ts [spins]
 * Ogni variante e' un `SheikhsFortuneTuning` parziale (+ `n` = nome).
 */
import { seededRng } from '../src/games/slots/engine/rng';
import { playRound, rawPayout } from '../src/games/slots/engine/spin';
import { makeSheikhsFortune, jackpotForValue, type SheikhsFortuneTuning } from '../src/games/slots/machines/sheikhsFortune';

const spins = Number(process.argv[2] ?? 1_000_000);
const V = JSON.parse(process.env.V ?? '[{"n":"default"}]') as (SheikhsFortuneTuning & { n: string })[];
for (const v of V) {
  const m = makeSheikhsFortune(v);
  const rng = seededRng(7);
  const bet = m.betDivisor;
  let tot = 0, base = 0, hits = 0, hw = 0, hwPay = 0, grand = 0, max = 0, fill = 0;
  const jp: Record<string, number> = {};
  for (let i = 0; i < spins; i++) {
    const r = playRound(m, bet, rng);
    const p = rawPayout(r) / bet;
    tot += p;
    base += r.base.payout / bet;
    if (p > 0) hits++;
    if (p > max) max = p;
    const h = r.holdAndWin;
    if (h) {
      hw++;
      hwPay += h.payout / bet;
      if (h.jackpot) grand++;
      fill += h.cells.flat().filter((x) => x !== null).length;
      for (const x of h.cells.flat()) {
        const j = x !== null ? jackpotForValue(m, x) : undefined;
        if (j) jp[j.label] = (jp[j.label] ?? 0) + 1;
      }
    }
  }
  console.log(
    `${v.n}: RTP ${((tot / spins) * 100).toFixed(2)} base ${((base / spins) * 100).toFixed(2)} hit ${((hits / spins) * 100).toFixed(1)}%` +
      ` H&W 1/${(spins / hw).toFixed(0)} avg ${(hwPay / hw).toFixed(1)}x fill ${(fill / hw).toFixed(1)} GRAND ${grand}` +
      ` jp ${JSON.stringify(jp)} max ${max.toFixed(0)}x`
  );
}
