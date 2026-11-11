/**
 * Arresto dei rulli: la frenata deve essere corta e sempre uguale,
 * qualunque sia la posizione del nastro. Prima poteva percorrere un giro
 * intero della striscia (fino a 72 celle, 4 s per rullo).
 */
import { describe, expect, it } from 'vitest';
import { stopPlan } from '@/games/slots/view/ReelView';

describe('stopPlan', () => {
  it('arriva esattamente sullo stop deciso dal motore', () => {
    for (const pos of [0, 3.7, 41.2, -12.5, 999.99]) expect(stopPlan(pos, 17, 3).to).toBe(17);
  });
  it('percorre sempre fra minCells e minCells+1 celle', () => {
    for (let i = 0; i < 200; i++) {
      const pos = Math.random() * 500 - 100;
      const stop = Math.floor(Math.random() * 72);
      const { from, to } = stopPlan(pos, stop, 3);
      expect(from - to).toBeGreaterThanOrEqual(3);
      expect(from - to).toBeLessThan(4);
    }
  });
  it('conserva la parte frazionaria: le celle non saltano di mezza altezza', () => {
    const { from } = stopPlan(10.25, 4, 3);
    expect(from - Math.floor(from)).toBeCloseTo(0.25);
  });
});
