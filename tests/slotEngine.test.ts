/**
 * Regole del motore slot, su griglie scritte a mano.
 * Se uno di questi fallisce, l'RTP misurato non significa piu' niente.
 */
import { describe, expect, it } from 'vitest';
import { evaluateGrid } from '@/games/slots/engine/spin';
import { buildStrip } from '@/games/slots/engine/strips';
import { GOLDEN_OASIS as M } from '@/games/slots/machines/goldenOasis';
import type { Grid } from '@/games/slots/engine/types';

/** Griglia 5x3 da righe leggibili: ['AAAAA', 'KKKKK', ...] (riga 0 in alto). */
function rows(...r: string[]): Grid {
  return Array.from({ length: 5 }, (_, reel) => r.map((line) => line[reel]!));
}
const BET = 20; // puntata di linea 1
const stops = [0, 0, 0, 0, 0];

describe('linee', () => {
  it('paga 5 Falchi sulla linea centrale con la paytable', () => {
    const o = evaluateGrid(M, rows('AKQJT', 'FFFFF', 'TJQKA'), stops, BET, 'base');
    const w = o.wins.find((x) => x.lineIndex === 0)!;
    expect(w.symbol).toBe('F');
    expect(w.count).toBe(5);
    expect(w.payout).toBe(700);
  });

  it('non paga meno di tre simboli consecutivi da sinistra', () => {
    const o = evaluateGrid(M, rows('AKQJT', 'FFKFF', 'TJQKA'), stops, BET, 'base');
    expect(o.wins.find((x) => x.lineIndex === 0)).toBeUndefined();
  });

  it('il wild espanso completa le linee che attraversano il suo rullo', () => {
    const o = evaluateGrid(M, rows('AKQJT', 'FWFKT', 'TJQKA'), stops, BET, 'base');
    expect(o.expandedReels).toEqual([1]);
    const mid = o.wins.find((x) => x.lineIndex === 0)!;
    expect(mid.count).toBe(3);
    // Il rullo 2 e' tutto wild: anche la linea alta (A,W,Q) non paga, ma
    // la riga bassa T,W,Q nemmeno — solo combinazioni vere.
    expect(o.wins.every((w) => w.count >= 3)).toBe(true);
  });

  it('il wild non sostituisce lo scatter', () => {
    const o = evaluateGrid(M, rows('AKQJT', 'SWSKT', 'TJQKA'), stops, BET, 'base');
    expect(o.wins.find((w) => w.kind === 'line' && w.symbol === 'S')).toBeUndefined();
  });
});

describe('scatter', () => {
  it('3 Lampade ovunque pagano sulla puntata TOTALE e danno giri gratis', () => {
    const o = evaluateGrid(M, rows('SKQJT', 'AJSQK', 'TJQKS'), stops, BET, 'base');
    const sc = o.wins.find((w) => w.kind === 'scatter')!;
    expect(sc.count).toBe(3);
    expect(sc.payout).toBe(3 * BET);
    expect(o.freeSpinsAwarded).toBe(11);
  });

  it('il moltiplicatore dei giri gratis si applica a tutte le vincite', () => {
    const o = evaluateGrid(M, rows('AKQJT', 'FFFFF', 'TJQKA'), stops, BET, 'free', 3);
    expect(o.wins.find((x) => x.lineIndex === 0)!.payout).toBe(2100);
  });
});

describe('strisce', () => {
  it('buildStrip rispetta esattamente le frequenze ed e deterministica', () => {
    const counts = { A: 5, K: 3, W: 2 };
    const a = buildStrip(counts, 42);
    expect(a.length).toBe(10);
    expect(a.filter((x) => x === 'A').length).toBe(5);
    expect(buildStrip(counts, 42)).toEqual(a);
  });
});
