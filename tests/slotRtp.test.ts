/**
 * L'RTP dichiarato in lobby deve essere VERO.
 *
 * Simulazione a seme fisso: il risultato e' deterministico, quindi il test
 * non "balla" fra un'esecuzione e l'altra.
 *
 * ── La tolleranza segue l'errore misurato ──
 * Una tolleranza fissa di ±0,5 punti era circa UN errore standard per le slot
 * ad alta varianza: a 4M giocate Desert Falcon (vincita massima ~3000×) ha
 * σ ≈ 0,47. Un modello perfettamente tarato falliva quindi con circa un seme
 * su tre, e quello scelto era fra gli sfortunati — 95,08% misurato contro un
 * valore vero di 95,93% ± 0,22 a 20M giocate. Il limite corretto e' 3σ (un
 * falso allarme ogni ~370 semi), mai sotto 0,5.
 *
 * La taratura fine resta compito di `tools/sim-slot.ts` a 20M+ giocate: i
 * valori di riferimento sono annotati in docs/STATO.md.
 */
import { describe, expect, it } from 'vitest';
import { simulateAsync, formatStats } from '@/games/slots/engine/simulate';
import { MACHINES } from '@/games/slots/machines';
import { GAMES } from '@/games/registry';

const SPINS = 4_000_000;

describe.each(Object.entries(MACHINES))('RTP %s', (id, m) => {
  it(`resta entro 3σ dal ${m.rtpTarget}% dichiarato`, async () => {
    const s = await simulateAsync(m, SPINS, 20261028);
    console.info(formatStats(id, s));
    // Un σ enorme vorrebbe dire una simulazione troppo corta per dire
    // qualcosa: in quel caso il test deve fallire, non allargarsi all'infinito.
    expect(s.stdErr).toBeLessThan(0.6);
    expect(Math.abs(s.rtp - m.rtpTarget)).toBeLessThan(Math.max(0.5, 3 * s.stdErr));
    // Una slot che non paga mai, o che paga sempre, e' rotta anche con l'RTP giusto.
    expect(s.hitRate).toBeGreaterThan(0.15);
    expect(s.hitRate).toBeLessThan(0.6);
  // 4M giri durano 1-2 minuti, di piu' su un PC carico: il test misura l'RTP, non la velocita'.
  }, 300_000);

  it('dichiara in lobby lo stesso RTP del modello', () => {
    expect(GAMES.find((g) => g.id === id)?.rtp).toBe(m.rtpTarget);
  });
});
