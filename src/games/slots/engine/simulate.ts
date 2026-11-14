/**
 * THE ROYAL MIRAGE — Simulatore Monte Carlo
 *
 * Gira una macchina N volte con un seme fisso e ne misura le statistiche.
 * Lo usano i test RTP e lo script di taratura (`tools/tune-slot.ts`).
 */

import { seededRng } from './rng';
import { playRound, rawPayout } from './spin';
import type { MachineDef } from './types';

export interface SimStats {
  spins: number;
  /** Ritorno al giocatore in percentuale. */
  rtp: number;
  /** Quota di giocate con vincita > 0. */
  hitRate: number;
  /** Una giocata ogni quante innesca i giri gratis. */
  freeSpinEvery: number;
  /** Una giocata ogni quante innesca Hold & Win. */
  holdAndWinEvery: number;
  /** Contributo dei giri gratis/H&W all'RTP, in punti percentuali. */
  featureRtp: number;
  /** Vincita massima osservata, in multipli della puntata. */
  maxWin: number;
  /** Errore standard stimato dell'RTP, in punti percentuali. */
  stdErr: number;
}

export function simulate(m: MachineDef, spins: number, seed = 1): SimStats {
  const it = run(m, spins, seed);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

/**
 * Come `simulate` (stesso seme, stessi numeri) ma cede il thread ogni
 * `chunk` giri: una simulazione da minuti non blocca chi la ospita (il
 * worker dei test deve poter rispondere al processo principale).
 */
export async function simulateAsync(m: MachineDef, spins: number, seed = 1, chunk = 200_000): Promise<SimStats> {
  const it = run(m, spins, seed, chunk);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    await new Promise((res) => setTimeout(res, 0));
  }
}

function* run(m: MachineDef, spins: number, seed: number, chunk = Infinity): Generator<void, SimStats> {
  const rng = seededRng(seed);
  const bet = m.betDivisor; // puntata di linea = 1: nessun arrotondamento in gioco
  let total = 0;
  let sq = 0;
  let hits = 0;
  let fs = 0;
  let hw = 0;
  let feature = 0;
  let maxWin = 0;
  for (let i = 0; i < spins; i++) {
    const r = playRound(m, bet, rng);
    const p = rawPayout(r);
    const x = p / bet;
    total += x;
    sq += x * x;
    if (p > 0) hits++;
    if (r.free.length > 0) fs++;
    if (r.holdAndWin) hw++;
    feature += (p - r.base.payout) / bet;
    if (x > maxWin) maxWin = x;
    if ((i + 1) % chunk === 0) yield;
  }
  const mean = total / spins;
  const variance = sq / spins - mean * mean;
  return {
    spins,
    rtp: mean * 100,
    hitRate: hits / spins,
    freeSpinEvery: fs ? spins / fs : Infinity,
    holdAndWinEvery: hw ? spins / hw : Infinity,
    featureRtp: (feature / spins) * 100,
    maxWin,
    stdErr: (Math.sqrt(variance / spins)) * 100,
  };
}

export function formatStats(name: string, s: SimStats): string {
  return [
    `${name}: RTP ${s.rtp.toFixed(3)}% (±${s.stdErr.toFixed(3)})`,
    `hit ${(s.hitRate * 100).toFixed(1)}%`,
    `FS 1/${s.freeSpinEvery.toFixed(0)}`,
    `H&W 1/${s.holdAndWinEvery.toFixed(0)}`,
    `feature ${s.featureRtp.toFixed(2)}pt`,
    `max ${s.maxWin.toFixed(0)}x`,
  ].join(' · ');
}
