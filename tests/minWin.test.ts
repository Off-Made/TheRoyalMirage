/**
 * Vincita minima delle slot: una combinazione vincente non paga mai 0,00 €.
 *
 * Con 0,10 € di puntata la puntata base di Hollywood Nights e Diamond Royale
 * vale 0,2 centesimi: i premi minori finivano arrotondati a zero. Ora il
 * totale di una giocata vincente vale almeno 1 centesimo; tutto il resto
 * dell'arrotondamento e' rimasto quello di prima.
 */
import { describe, expect, it } from 'vitest';
import { evaluateGrid, payoutCents, playRound, rawPayout } from '@/games/slots/engine/spin';
import { seededRng } from '@/games/slots/engine/rng';
import { GOLDEN_OASIS } from '@/games/slots/machines/goldenOasis';
import { DESERT_FALCON } from '@/games/slots/machines/desertFalcon';
import { SHEIKHS_FORTUNE } from '@/games/slots/machines/sheikhsFortune';
import type { Grid } from '@/games/slots/engine/types';

describe('payoutCents', () => {
  it('nessuna vincita resta 0', () => {
    expect(payoutCents(0)).toBe(0);
    expect(payoutCents(-3)).toBe(0);
    expect(payoutCents(Number.NaN)).toBe(0);
  });

  it('una vincita sotto il centesimo vale 1 centesimo', () => {
    expect(payoutCents(0.001)).toBe(1);
    expect(payoutCents(0.32)).toBe(1);
    expect(payoutCents(0.49)).toBe(1);
  });

  it('dal mezzo centesimo in su arrotonda come prima', () => {
    expect(payoutCents(0.5)).toBe(1);
    expect(payoutCents(1.49)).toBe(1);
    expect(payoutCents(1.5)).toBe(2);
    expect(payoutCents(40.8)).toBe(41);
    expect(payoutCents(123456.4)).toBe(123456);
  });
});

describe('vincita minima nelle giocate vere', () => {
  const machines = [GOLDEN_OASIS, DESERT_FALCON, SHEIKHS_FORTUNE];
  const bets = [10, 13, 20, 37, 50, 100, 250, 1000];

  for (const m of machines) {
    it(`${m.name}: mai 0,00 € con una vincita, e sopra il centesimo nulla cambia`, () => {
      const rng = seededRng(2026);
      let tiny = 0;
      for (const bet of bets) {
        for (let i = 0; i < 4000; i++) {
          const r = playRound(m, bet, rng);
          const raw = rawPayout(r);
          if (raw > 0) {
            expect(r.totalPayout).toBeGreaterThanOrEqual(1);
            if (Math.round(raw) >= 1) expect(r.totalPayout).toBe(Math.round(raw));
            else tiny++;
          } else {
            expect(r.totalPayout).toBe(0);
          }
        }
      }
      // Lucky Sevens non ha premi sotto il mezzo centesimo nemmeno a 0,10 €.
      if (m !== GOLDEN_OASIS) expect(tiny).toBeGreaterThan(0);
    });
  }
});

describe('il caso segnalato: 3 J x 2 combinazioni a 0,10 €', () => {
  it('Diamond Royale paga 0,01 € invece di 0,00 €', () => {
    // 6 rulli x 4 righe. J sui rulli 1 e 3, due J sul rullo 2: 1x2x1 = 2 combinazioni.
    // Il rullo 4 non ha J ne' Corone, quindi la fila si ferma a 3.
    const grid: Grid = [
      ['J', 'A', 'Q', 'T'],
      ['J', 'J', 'K', 'Q'],
      ['T', 'J', 'A', 'K'],
      ['Q', 'K', 'A', 'T'],
      ['A', 'T', 'Q', 'K'],
      ['K', 'Q', 'T', 'A'],
    ];
    const o = evaluateGrid(SHEIKHS_FORTUNE, grid, [0, 0, 0, 0, 0, 0], 10, 'base');
    const jWin = o.wins.find((w) => w.symbol === 'J');
    expect(jWin).toBeDefined();
    expect(jWin!.count).toBe(3);
    // 0,10 € ÷ 50 = 0,2 centesimi; x 0,8 x 2 combinazioni = 0,32 centesimi.
    expect(jWin!.payout).toBeCloseTo(0.32, 5);
    expect(payoutCents(o.payout)).toBeGreaterThanOrEqual(1);
  });
});
