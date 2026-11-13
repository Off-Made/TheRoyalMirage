/**
 * Modalita' "Presentazione" delle slot: spenta fuori dalla modalita' Libera,
 * e quando agisce porta davvero all'evento scelto.
 */
import { describe, expect, it } from 'vitest';
import { DEMO_BIG_WIN, DEMO_SHARE, demoCriterion, demoRound } from '@/games/slots/demo';
import { seededRng } from '@/games/slots/engine/rng';
import { GOLDEN_OASIS } from '@/games/slots/machines/goldenOasis';
import { SHEIKHS_FORTUNE } from '@/games/slots/machines/sheikhsFortune';
import { DESERT_FALCON } from '@/games/slots/machines/desertFalcon';

const ON = { demoBigWins: true, demoFreeSpins: true, demoHoldWin: true, demoBonus: true };
const OFF = { demoBigWins: false, demoFreeSpins: false, demoHoldWin: false, demoBonus: false };
const BET = 100;

describe('presentazione', () => {
  it('non agisce mai in Carriera o High Roller, ne a interruttori spenti', () => {
    expect(demoCriterion(GOLDEN_OASIS, BET, 'career', ON, 0)).toBeNull();
    expect(demoCriterion(GOLDEN_OASIS, BET, 'highroller', ON, 0)).toBeNull();
    expect(demoCriterion(GOLDEN_OASIS, BET, 'freeplay', OFF, 0)).toBeNull();
  });

  it('pilota solo una parte dei giri', () => {
    expect(demoCriterion(GOLDEN_OASIS, BET, 'freeplay', ON, DEMO_SHARE - 0.01)).not.toBeNull();
    expect(demoCriterion(GOLDEN_OASIS, BET, 'freeplay', ON, DEMO_SHARE + 0.01)).toBeNull();
  });

  it('con piu interruttori accesi, ogni giro pilotato punta a UN solo evento scelto a caso', () => {
    const big = demoCriterion(GOLDEN_OASIS, BET, 'freeplay', ON, 0, 0)!;
    const bonus = demoCriterion(GOLDEN_OASIS, BET, 'freeplay', ON, 0, 0.99)!;
    const rng = seededRng(9);
    expect(demoRound(GOLDEN_OASIS, BET, rng, bonus).wheel).toBeTruthy();
    expect(demoRound(GOLDEN_OASIS, BET, rng, big).totalPayout).toBeGreaterThanOrEqual(DEMO_BIG_WIN * BET);
  });

  it('ignora le caratteristiche che la macchina non ha', () => {
    const hw = { ...OFF, demoHoldWin: true };
    expect(demoCriterion(GOLDEN_OASIS, BET, 'freeplay', hw, 0)).toBeNull();
    expect(demoCriterion(SHEIKHS_FORTUNE, BET, 'freeplay', hw, 0)).not.toBeNull();
  });

  it('porta all evento scelto', () => {
    const rng = seededRng(5);
    const fs = demoCriterion(GOLDEN_OASIS, BET, 'freeplay', { ...OFF, demoFreeSpins: true }, 0)!;
    expect(demoRound(GOLDEN_OASIS, BET, rng, fs).free.length).toBeGreaterThan(0);
    const big = demoCriterion(GOLDEN_OASIS, BET, 'freeplay', { ...OFF, demoBigWins: true }, 0)!;
    expect(demoRound(GOLDEN_OASIS, BET, rng, big).totalPayout).toBeGreaterThanOrEqual(DEMO_BIG_WIN * BET);
    const hw = demoCriterion(SHEIKHS_FORTUNE, BET, 'freeplay', { ...OFF, demoHoldWin: true }, 0)!;
    expect(demoRound(SHEIKHS_FORTUNE, BET, rng, hw).holdAndWin).toBeTruthy();
  });

  it('porta anche ai nuovi bonus: ruota, cascata, forzieri', () => {
    const rng = seededRng(6);
    const on = { ...OFF, demoBonus: true };
    expect(demoRound(GOLDEN_OASIS, BET, rng, demoCriterion(GOLDEN_OASIS, BET, 'freeplay', on, 0)!).wheel).toBeTruthy();
    expect(demoRound(DESERT_FALCON, BET, rng, demoCriterion(DESERT_FALCON, BET, 'freeplay', on, 0)!).cascade).toBeTruthy();
    expect(demoRound(SHEIKHS_FORTUNE, BET, rng, demoCriterion(SHEIKHS_FORTUNE, BET, 'freeplay', on, 0)!).chests).toBeTruthy();
  });
});
