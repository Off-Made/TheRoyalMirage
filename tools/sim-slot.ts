/**
 * Strumento di taratura: misura l'RTP delle slot.
 *
 *   npx vite-node tools/sim-slot.ts [spins] [machine]
 *
 * Non fa parte del bundle.
 */

import { simulate, formatStats } from '../src/games/slots/engine/simulate';
import { MACHINES } from '../src/games/slots/machines';

const spins = Number(process.argv[2] ?? 1_000_000);
const only = process.argv[3];

for (const [id, m] of Object.entries(MACHINES)) {
  if (only && id !== only) continue;
  const t0 = Date.now();
  const s = simulate(m, spins, 12345);
  console.log(`${formatStats(id, s)} · target ${m.rtpTarget}% · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
