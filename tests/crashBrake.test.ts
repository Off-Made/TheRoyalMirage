/**
 * Golden Chip: il freno di serie.
 * Dopo 3 voli a ×10 o piu' negli ultimi 4, i 2 voli successivi hanno il
 * tetto ×1,50; poi il freno si spegne e la serie riparte da zero.
 */
import { describe, expect, it } from 'vitest';
import {
  BRAKED_FLIGHTS,
  CAP_CENTS,
  afterFlight,
  capFor,
  freshBrake,
  parseBrake,
  type BrakeState,
} from '@/games/crash/brake';

const play = (crashes: number[], s: BrakeState = freshBrake()) => crashes.reduce(afterFlight, s);

describe('freno di serie', () => {
  it('3 voli alti su 4 → 2 voli frenati a ×1,50, poi si spegne', () => {
    let s = play([1200, 150, 2500, 1000]);
    expect(capFor(s)).toBe(CAP_CENTS);
    expect(s.left).toBe(BRAKED_FLIGHTS);
    s = afterFlight(s, 140);
    expect(capFor(s)).toBe(CAP_CENTS);
    s = afterFlight(s, 150);
    expect(capFor(s)).toBeNull();
  });

  it('2 voli alti su 4 non bastano', () => {
    expect(capFor(play([1200, 150, 2500, 300]))).toBeNull();
  });

  it('×9,99 non conta come volo alto, ×10,00 si', () => {
    expect(capFor(play([999, 999, 999]))).toBeNull();
    expect(capFor(play([1000, 1000, 1000]))).toBe(CAP_CENTS);
  });

  it('conta solo la finestra degli ultimi 4 voli', () => {
    // I primi due alti escono dalla finestra prima che arrivi il terzo.
    expect(capFor(play([1500, 1500, 120, 130, 140, 1500]))).toBeNull();
  });

  it('dopo i voli frenati la serie riparte da zero', () => {
    let s = play([1500, 1500, 1500]);
    s = play([150, 150], s);
    expect(capFor(s)).toBeNull();
    expect(s.recent).toEqual([]);
    // Altri due voli alti non bastano a riaccenderlo: servono di nuovo tre.
    expect(capFor(play([2000, 2000], s))).toBeNull();
    expect(capFor(play([2000, 2000, 2000], s))).toBe(CAP_CENTS);
  });

  it('lo stato sopravvive al salvataggio; dati strani spengono il freno', () => {
    const s = play([1500, 1500, 1500]);
    expect(parseBrake(JSON.stringify(s))).toEqual(s);
    expect(parseBrake(null)).toEqual(freshBrake());
    expect(parseBrake('non json')).toEqual(freshBrake());
    expect(parseBrake('{"recent":["x",50,1200],"left":99}')).toEqual({ recent: [1200], left: BRAKED_FLIGHTS });
  });
});
