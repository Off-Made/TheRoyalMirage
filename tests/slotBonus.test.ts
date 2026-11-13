/**
 * Bonus interni delle slot: Ruota della fortuna (Lucky Sevens), Cascata
 * (Hollywood Nights), Forzieri (Diamond Royale). Il loro peso sull'RTP lo
 * controlla `slotRtp.test.ts`; qui si verificano le REGOLE.
 */
import { describe, expect, it } from 'vitest';
import { runWheel, runCascade, runChests, wheelWeights, countSymbol, chestTable } from '@/games/slots/engine/bonus';
import { playRound, rawPayout } from '@/games/slots/engine/spin';
import { seededRng, type Rng } from '@/games/slots/engine/rng';
import { GOLDEN_OASIS, GO_WHEEL } from '@/games/slots/machines/goldenOasis';
import { DESERT_FALCON, DF_CASCADE } from '@/games/slots/machines/desertFalcon';
import { SHEIKHS_FORTUNE, SF_CHESTS } from '@/games/slots/machines/sheikhsFortune';
import type { WheelRule } from '@/games/slots/engine/types';

/** Rng che restituisce in sequenza i valori dati (poi ricomincia). */
function scripted(values: number[]): Rng {
  let i = 0;
  const next = () => values[i++ % values.length]!;
  return { next, int: (n: number) => Math.min(n - 1, Math.floor(next() * n)), pick: <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)]!, chance: (p: number) => next() < p } as unknown as Rng;
}

describe('Ruota della fortuna', () => {
  it('ha i 18 spicchi chiesti: NULLA, 1×x2, 2×x3, 5×x3, 10×x2, 15×x2, 20×x2, 50×, +1 giro, STOP', () => {
    const mult = (v: number) => GO_WHEEL.segments.filter((s) => s.kind === 'mult' && s.value === v).length;
    expect(GO_WHEEL.segments).toHaveLength(18);
    expect([mult(1), mult(2), mult(5), mult(10), mult(15), mult(20), mult(50)]).toEqual([2, 3, 3, 2, 2, 2, 1]);
    expect(GO_WHEEL.segments.filter((s) => s.kind === 'blank')).toHaveLength(1);
    expect(GO_WHEEL.segments.filter((s) => s.kind === 'spin')).toHaveLength(1);
    expect(GO_WHEEL.segments.filter((s) => s.kind === 'stop')).toHaveLength(1);
  });

  it('dal secondo giro lo STOP e molto meno probabile dei moltiplicatori piccoli', () => {
    const w = (pred: (i: number) => boolean) => GO_WHEEL.segments.reduce((s, x, i) => s + (pred(i) ? x.weight : 0), 0);
    const stop = w((i) => GO_WHEEL.segments[i]!.kind === 'stop');
    const small = w((i) => GO_WHEEL.segments[i]!.kind === 'mult' && GO_WHEEL.segments[i]!.value <= 2);
    expect(stop * 5).toBeLessThan(small);
  });

  const rule: WheelRule = {
    symbol: 'R',
    trigger: 3,
    spins: 3,
    maxSpins: 5,
    highFrom: 15,
    highDamp: 0.5,
    maxTotal: 100,
    // Rimonta neutra: i test qui sotto contano su pesi uguali.
    lowUpTo: 2,
    boostFrom: 5,
    boostHigh: 1,
    boostLow: 1,
    segments: [
      { kind: 'mult', value: 2, weight: 1 },
      { kind: 'spin', value: 0, weight: 1 },
      { kind: 'stop', value: 0, weight: 1 },
      { kind: 'mult', value: 20, weight: 1 },
    ],
  };
  // Con 4 spicchi di peso 1, next()=0.1 → spicchio 0, 0.3 → 1, 0.6 → 2, 0.9 → 3.

  it('i moltiplicatori MOLTIPLICANO la vincita: il primo si applica alla puntata', () => {
    const o = runWheel(rule, 100, scripted([0.1, 0.1, 0.1]));
    expect(o.spins.map((s) => s.segment)).toEqual([0, 0, 0]);
    expect(o.spins.map((s) => s.total)).toEqual([2, 4, 8]);
    expect(o.total).toBe(8);
    expect(o.payout).toBe(800);
    expect(o.spins.map((s) => s.left)).toEqual([2, 1, 0]);
  });

  it('ALTRO GIRO: quel giro non si conta e se ne aggiunge uno (con 2 rimasti se ne hanno 3)', () => {
    const o = runWheel(rule, 1, scripted([0.3, 0.1, 0.1, 0.1, 0.1]));
    expect(o.spins.map((s) => s.segment)).toEqual([1, 0, 0, 0, 0]);
    expect(o.spins.map((s) => s.left)).toEqual([4, 3, 2, 1, 0]);
    expect(o.total).toBe(16);
  });

  it('il primo giro usa i pesi quasi uniformi, i successivi quelli normali', () => {
    const first = wheelWeights(GO_WHEEL, false, false, true);
    GO_WHEEL.segments.forEach((s, i) => expect(first[i]).toBe(s.first ?? s.weight));
    // Al primo giro un ×20 e quasi probabile quanto un ×2, ma resta un po' piu raro.
    const i2 = GO_WHEEL.segments.findIndex((s) => s.kind === 'mult' && s.value === 2);
    const i20 = GO_WHEEL.segments.findIndex((s) => s.kind === 'mult' && s.value === 20);
    const i50 = GO_WHEEL.segments.findIndex((s) => s.kind === 'mult' && s.value === 50);
    expect(first[i20]!).toBeLessThan(first[i2]!);
    expect(first[i20]! * 3).toBeGreaterThan(first[i2]!);
    expect(first[i50]!).toBeLessThan(first[i20]!);
    // Dai giri dopo, i premi grandi tornano rari.
    const later = wheelWeights(GO_WHEEL, false, false, false);
    expect(later[i20]! / later[i2]!).toBeLessThan(first[i20]! / first[i2]!);
  });

  it('STOP chiude la ruota ma tiene quanto gia vinto', () => {
    const o = runWheel(rule, 1, scripted([0.1, 0.6, 0.1]));
    expect(o.spins.map((s) => s.segment)).toEqual([0, 2]);
    expect(o.total).toBe(2);
    expect(o.spins.at(-1)!.left).toBe(0);
  });

  it('NULLA non vince niente in quel giro: se esce per primo la vincita resta 0', () => {
    const r2: WheelRule = { ...rule, segments: [{ kind: 'blank', value: 0, weight: 1 }, { kind: 'mult', value: 3, weight: 1 }] };
    // 0.1 → NULLA, 0.9 → ×3
    const o = runWheel(r2, 1, scripted([0.1, 0.9, 0.9]));
    expect(o.spins.map((s) => s.total)).toEqual([0, 3, 9]);
    const tutto = runWheel(r2, 1, scripted([0.1]));
    expect(tutto.total).toBe(0);
    expect(tutto.payout).toBe(0);
  });

  it('la vincita della ruota ha un tetto', () => {
    const o = runWheel(rule, 1, scripted([0.9, 0.9, 0.9]));
    expect(o.total).toBe(rule.maxTotal);
  });

  it('il tetto ferma una catena di +1 giro', () => {
    const o = runWheel(rule, 1, scripted([0.3]));
    expect(o.spins).toHaveLength(rule.maxSpins);
    expect(o.spins.at(-1)!.left).toBe(0);
  });

  it('rimonta: dopo un giro scarso i moltiplicatori grandi pesano di piu e gli scarsi di meno', () => {
    const base = wheelWeights(GO_WHEEL, false, false);
    const boost = wheelWeights(GO_WHEEL, false, true);
    GO_WHEEL.segments.forEach((s, i) => {
      if (s.kind === 'mult' && s.value >= GO_WHEEL.boostFrom) expect(boost[i]).toBeCloseTo(base[i]! * GO_WHEEL.boostHigh);
      else if (s.kind === 'blank' || s.kind === 'stop' || (s.kind === 'mult' && s.value <= GO_WHEEL.lowUpTo)) expect(boost[i]).toBeCloseTo(base[i]! * GO_WHEEL.boostLow);
      else expect(boost[i]).toBeCloseTo(base[i]!);
    });
    // In pratica: dopo un ×1 un ×5 o piu esce molto piu spesso.
    const share = (w: number[]) => {
      const tot = w.reduce((a, b) => a + b, 0);
      return GO_WHEEL.segments.reduce((a, s, i) => a + (s.kind === 'mult' && s.value >= 5 ? w[i]! : 0), 0) / tot;
    };
    expect(share(boost)).toBeGreaterThan(share(base) * 2);
    // ...e lo STOP diventa meno probabile, non di piu'.
    const stopShare = (w: number[]) => w[GO_WHEEL.segments.findIndex((s) => s.kind === 'stop')]! / w.reduce((a, b) => a + b, 0);
    expect(stopShare(boost)).toBeLessThan(stopShare(base));
  });

  it('dopo un premio alto, i premi alti pesano meno', () => {
    expect(wheelWeights(rule, false)[3]).toBe(1);
    expect(wheelWeights(rule, true)[3]).toBe(0.5);
    expect(wheelWeights(rule, true)[0]).toBe(1);
  });

  it('in gioco: si apre solo con 3 Ruote e la vincita entra nel totale', () => {
    const rng = seededRng(5);
    let seen = 0;
    for (let i = 0; i < 40000 && seen < 30; i++) {
      const r = playRound(GOLDEN_OASIS, 100, rng);
      const n = countSymbol(r.base.grid, 'R');
      expect(!!r.wheel).toBe(n >= 3);
      if (r.wheel) {
        seen++;
        expect(r.wheel.payout).toBe(r.wheel.total * 100);
        expect(rawPayout(r)).toBeGreaterThanOrEqual(r.wheel.payout);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('le Ruote stanno solo sui rulli 1, 3 e 5', () => {
    GOLDEN_OASIS.strips.forEach((st, r) => expect(st.includes('R')).toBe([0, 2, 4].includes(r)));
  });

  it('due Ruote dello stesso rullo non stanno mai nella stessa finestra', () => {
    for (const st of GOLDEN_OASIS.strips) {
      const at = st.map((x, i) => (x === 'R' ? i : -1)).filter((i) => i >= 0);
      for (const i of at) for (const j of at) {
        if (i === j) continue;
        const d = Math.min((i - j + st.length) % st.length, (j - i + st.length) % st.length);
        expect(d).toBeGreaterThanOrEqual(GOLDEN_OASIS.rows);
      }
    }
  });
});

describe('Cascata', () => {
  it('ogni giro nuovo e ogni caduta consumano un giro; un Biglietto ne aggiunge 5', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const o = runCascade(DESERT_FALCON, DF_CASCADE, 10, 50, seededRng(seed));
      const added = o.steps.reduce((s, x) => s + x.added, 0);
      expect(o.steps).toHaveLength(10 + added);
      let left = 10;
      for (const s of o.steps) {
        left = left - 1 + s.added;
        expect(s.left).toBe(left);
        expect([0, DF_CASCADE.retriggerSpins]).toContain(s.added);
        if (s.added > 0) expect(s.bonusCells.length).toBeGreaterThan(0);
      }
      expect(o.steps.filter((s) => s.added > 0).length).toBeLessThanOrEqual(DF_CASCADE.retriggerCap);
      expect(o.payout).toBeCloseTo(o.steps.reduce((s, x) => s + x.payout, 0), 9);
    }
  });

  it('il Biglietto nella cascata e raro', () => {
    let hit = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const o = runCascade(DESERT_FALCON, DF_CASCADE, 15, 50, seededRng(seed));
      if (o.steps.some((s) => s.added > 0)) hit++;
    }
    expect(hit).toBeGreaterThan(0);
    expect(hit / 400).toBeLessThan(0.4);
  });

  it('senza vincite si rigira da capo e il moltiplicatore scende di un gradino; con vincite si cade e sale', () => {
    const o = runCascade(DESERT_FALCON, DF_CASCADE, 200, 50, seededRng(9));
    for (let i = 1; i < o.steps.length; i++) {
      const prev = o.steps[i - 1]!;
      const s = o.steps[i]!;
      if (prev.explode.length === 0) {
        expect(s.kind).toBe('fresh');
        const idx = DF_CASCADE.ladder.indexOf(prev.multiplier);
        expect(s.multiplier).toBe(DF_CASCADE.ladder[Math.max(0, idx - 1)]);
      } else {
        expect(s.kind).toBe('drop');
        const idx = DF_CASCADE.ladder.indexOf(prev.multiplier);
        // Sale solo dopo una vincita (un Biglietto esploso da solo non conta).
        const next = prev.wins.length > 0 ? Math.min(idx + 1, DF_CASCADE.ladder.length - 1) : idx;
        expect(s.multiplier).toBe(DF_CASCADE.ladder[next]);
      }
    }
  });

  it('nella caduta i simboli rimasti scendono in ordine e ne entrano di nuovi in cima', () => {
    const o = runCascade(DESERT_FALCON, DF_CASCADE, 300, 50, seededRng(21));
    let checked = 0;
    for (let i = 1; i < o.steps.length; i++) {
      const prev = o.steps[i - 1]!;
      const s = o.steps[i]!;
      if (s.kind !== 'drop') continue;
      prev.grid.forEach((col, r) => {
        const gone = new Set(prev.explode.filter(([rr]) => rr === r).map(([, row]) => row));
        const keep = col.filter((_, row) => !gone.has(row));
        expect(s.grid[r]!.slice(gone.size)).toEqual(keep);
        expect(s.grid[r]).toHaveLength(col.length);
      });
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('le celle che esplodono sono quelle delle combinazioni vincenti', () => {
    const o = runCascade(DESERT_FALCON, DF_CASCADE, 100, 50, seededRng(4));
    for (const s of o.steps) {
      const cells = new Set(s.wins.flatMap((w) => w.cells.map((c) => `${c[0]},${c[1]}`)));
      for (const c of s.bonusCells) cells.add(`${c[0]},${c[1]}`);
      expect(new Set(s.explode.map((c) => `${c[0]},${c[1]}`))).toEqual(cells);
    }
  });

  it('nella cascata non compaiono Ciak; i Biglietti solo sul rullo centrale', () => {
    const o = runCascade(DESERT_FALCON, DF_CASCADE, 300, 50, seededRng(8));
    for (const s of o.steps)
      s.grid.forEach((col, r) => {
        for (const id of col) {
          expect(id).not.toBe('S');
          if (r !== 2) expect(id).not.toBe('B');
        }
      });
  });

  it('in gioco: 3, 4 o 5 Biglietti danno 8, 12 o 16 giri', () => {
    const rng = seededRng(12);
    let seen = 0;
    for (let i = 0; i < 60000 && seen < 20; i++) {
      const r = playRound(DESERT_FALCON, 50, rng);
      const n = countSymbol(r.base.grid, 'B');
      if (n >= 3) {
        seen++;
        expect(r.cascade?.spins).toBe(DF_CASCADE.spins[Math.min(n, 5)]);
      } else expect(r.cascade).toBeUndefined();
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('Forzieri', () => {
  it('cinque forzieri con moltiplicatori tutti diversi; il premio e uno di loro', () => {
    const rng = seededRng(2);
    for (let i = 0; i < 2000; i++) {
      const o = runChests(SF_CHESTS, 4 + (i % 4), 100, rng);
      const all = [o.prize, ...o.others];
      expect(all).toHaveLength(5);
      expect(new Set(all).size).toBe(5);
      for (const v of all) expect(SF_CHESTS.tables[0]!.values).toContain(v);
      expect(o.payout).toBe(o.prize * 100);
    }
  });

  it('piu Forzieri sui rulli = tabella piu ricca', () => {
    expect(chestTable(SF_CHESTS, 4).min).toBe(4);
    expect(chestTable(SF_CHESTS, 5).min).toBe(5);
    expect(chestTable(SF_CHESTS, 9).min).toBe(6);
    const avg = (count: number) => {
      const rng = seededRng(17);
      let s = 0;
      for (let i = 0; i < 20000; i++) s += runChests(SF_CHESTS, count, 1, rng).prize;
      return s / 20000;
    };
    const a4 = avg(4);
    const a5 = avg(5);
    const a6 = avg(6);
    expect(a5).toBeGreaterThan(a4);
    expect(a6).toBeGreaterThan(a5);
    // Un 50× e' raro con 4 Forzieri e piu' frequente con 6.
    const has50 = (count: number) => {
      const rng = seededRng(23);
      let n = 0;
      for (let i = 0; i < 20000; i++) {
        const o = runChests(SF_CHESTS, count, 1, rng);
        if ([o.prize, ...o.others].includes(50)) n++;
      }
      return n;
    };
    expect(has50(6)).toBeGreaterThan(has50(4) * 2);
  });

  it('in gioco: si aprono con 4 o piu Forzieri', () => {
    const rng = seededRng(31);
    let seen = 0;
    for (let i = 0; i < 40000 && seen < 20; i++) {
      const r = playRound(SHEIKHS_FORTUNE, 50, rng);
      const n = countSymbol(r.base.grid, 'F');
      expect(!!r.chests).toBe(n >= 4);
      if (r.chests) {
        seen++;
        expect(r.chests.count).toBe(n);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});
