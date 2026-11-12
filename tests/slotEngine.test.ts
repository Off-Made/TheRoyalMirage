/**
 * Regole del motore slot, su griglie scritte a mano.
 * Se uno di questi fallisce, l'RTP misurato non significa piu' niente.
 */
import { describe, expect, it } from 'vitest';
import { evaluateGrid } from '@/games/slots/engine/spin';
import { buildStrip } from '@/games/slots/engine/strips';
import { GOLDEN_OASIS as M } from '@/games/slots/machines/goldenOasis';
import { DESERT_FALCON } from '@/games/slots/machines/desertFalcon';
import type { Grid } from '@/games/slots/engine/types';

/** Griglia 5x3 da righe leggibili: ['AAAAA', 'KKKKK', ...] (riga 0 in alto). */
function rows(...r: string[]): Grid {
  return Array.from({ length: 5 }, (_, reel) => r.map((line) => line[reel]!));
}
const BET = 20; // puntata di linea 1
const stops = [0, 0, 0, 0, 0];
/** Premi letti dalla paytable: i test verificano le regole, non la taratura. */
const SEVEN = M.symbols.find((s) => s.id === 'F')!.pays!;
const STAR = M.symbols.find((s) => s.id === 'S')!.scatterPays!;

describe('linee', () => {
  it('paga 5 Sette sulla linea centrale con la paytable', () => {
    const o = evaluateGrid(M, rows('AKQJT', 'FFFFF', 'TJQKA'), stops, BET, 'base');
    const w = o.wins.find((x) => x.lineIndex === 0)!;
    expect(w.symbol).toBe('F');
    expect(w.count).toBe(5);
    expect(w.payout).toBe(SEVEN[5]);
    expect(w.startReel).toBe(0);
  });

  it('non paga meno di tre simboli consecutivi', () => {
    const o = evaluateGrid(M, rows('AKQJT', 'FFKFF', 'TJQKA'), stops, BET, 'base');
    expect(o.wins.find((x) => x.lineIndex === 0)).toBeUndefined();
  });

  it('paga anche un tris sui rulli 3-4-5, non solo dal rullo 1', () => {
    const o = evaluateGrid(M, rows('AKQJT', 'KTFFF', 'TJQKA'), stops, BET, 'base');
    const w = o.wins.find((x) => x.lineIndex === 0)!;
    expect(w.symbol).toBe('F');
    expect(w.count).toBe(3);
    expect(w.startReel).toBe(2);
    expect(w.cells).toEqual([[2, 1], [3, 1], [4, 1]]);
    expect(w.payout).toBeCloseTo(SEVEN[3]!);
  });

  it('paga un tris centrale (rulli 2-3-4) e tiene la combinazione migliore della linea', () => {
    const mid = evaluateGrid(M, rows('AKQJT', 'KFFFT', 'TJQKA'), stops, BET, 'base');
    expect(mid.wins.find((x) => x.lineIndex === 0)).toMatchObject({ symbol: 'F', count: 3, startReel: 1 });
    // Quattro Sette dal rullo 2 battono qualunque tris contenuto nella stessa corsa.
    const four = evaluateGrid(M, rows('AKQJT', 'KFFFF', 'TJQKA'), stops, BET, 'base');
    expect(four.wins.filter((x) => x.lineIndex === 0)).toHaveLength(1);
    expect(four.wins.find((x) => x.lineIndex === 0)).toMatchObject({ count: 4, startReel: 1, payout: SEVEN[4] });
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
    expect(sc.payout).toBeCloseTo(STAR[3]! * BET);
    expect(o.freeSpinsAwarded).toBe(11);
  });

  it('il moltiplicatore dei giri gratis si applica a tutte le vincite', () => {
    const o = evaluateGrid(M, rows('AKQJT', 'FFFFF', 'TJQKA'), stops, BET, 'free', 3);
    expect(o.wins.find((x) => x.lineIndex === 0)!.payout).toBeCloseTo(SEVEN[5]! * 3);
  });
});

describe('ways', () => {
  it('paga un simbolo presente su 3 rulli adiacenti anche se manca dai primi due', () => {
    // Colonne (rullo per rullo, riga 0 in alto). Solo H compare su 3 rulli di fila.
    const grid: Grid = [
      ['A', 'K', 'Q', 'J'],
      ['T', 'P', 'F', 'R'],
      ['H', 'A', 'K', 'Q'],
      ['H', 'T', 'P', 'J'],
      ['H', 'F', 'R', 'A'],
    ];
    const o = evaluateGrid(DESERT_FALCON, grid, stops, DESERT_FALCON.betDivisor, 'base');
    expect(o.wins).toHaveLength(1);
    expect(o.wins[0]).toMatchObject({ kind: 'ways', symbol: 'H', count: 3, startReel: 2 });
    expect(o.wins[0]!.payout).toBeCloseTo(DESERT_FALCON.symbols.find((s) => s.id === 'H')!.pays![3]!);
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
