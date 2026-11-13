/**
 * THE ROYAL MIRAGE — Slot: modalita' "Presentazione"
 *
 * Per le dimostrazioni dal vivo: alza la frequenza di vincite grandi, giri
 * gratis e Hold & Win. Vale SOLO in modalita' Libera (fiche finte, niente
 * progressione): in Carriera e High Roller e' sempre spenta, anche se gli
 * interruttori restano salvati.
 *
 * Non tocca il motore: si estrae di nuovo l'esito finche' non soddisfa uno
 * dei criteri accesi. Simulazione e test di RTP non la vedono mai.
 */

import { playRound } from './engine/spin';
import type { Rng } from './engine/rng';
import type { MachineDef, RoundOutcome } from './engine/types';
import type { SettingsState } from '@/state/settings';
import type { ModeId } from '@/state/modes';

/** Quota dei giri "pilotati": non tutti, perche' una vincita fissa non convince nessuno. */
export const DEMO_SHARE = 1 / 3;
/** Soglia di "vincita grande", in multipli della puntata. */
export const DEMO_BIG_WIN = 25;
/** Tetto ai tentativi: se un criterio e' troppo raro si tiene l'ultimo esito. */
const MAX_TRIES = 2000;

type DemoFlags = Pick<SettingsState, 'demoBigWins' | 'demoFreeSpins' | 'demoHoldWin' | 'demoBonus'>;

/** Criterio da soddisfare per questo giro, o null se il giro e' normale. */
export function demoCriterion(
  m: MachineDef,
  bet: number,
  mode: ModeId,
  s: DemoFlags,
  roll: number,
  pick: number = Math.random()
): ((o: RoundOutcome) => boolean) | null {
  if (mode !== 'freeplay' || roll >= DEMO_SHARE) return null;
  const tests: ((o: RoundOutcome) => boolean)[] = [];
  if (s.demoBigWins) tests.push((o) => o.totalPayout >= DEMO_BIG_WIN * bet);
  if (s.demoFreeSpins && m.freeSpins) tests.push((o) => o.free.length > 0);
  if (s.demoHoldWin && m.holdAndWin) tests.push((o) => !!o.holdAndWin);
  if (s.demoBonus && (m.wheel || m.cascade || m.chests)) tests.push((o) => !!(o.wheel || o.cascade || o.chests));
  if (tests.length === 0) return null;
  // Un solo evento per giro pilotato, scelto a caso tra quelli accesi: se
  // bastasse "uno qualsiasi", vincerebbe sempre il piu' frequente (le vincite
  // grandi) e i bonus rari non uscirebbero quasi mai.
  return tests[Math.min(tests.length - 1, Math.floor(pick * tests.length))]!;
}

/** Esito del giro, eventualmente ritirato finche' non soddisfa `want`. */
export function demoRound(m: MachineDef, bet: number, rng: Rng, want: (o: RoundOutcome) => boolean): RoundOutcome {
  let o = playRound(m, bet, rng);
  for (let i = 0; i < MAX_TRIES && !want(o); i++) o = playRound(m, bet, rng);
  return o;
}
