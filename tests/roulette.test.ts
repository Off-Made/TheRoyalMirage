/**
 * Roulette europea: pagamenti, tappeto, annunci, limiti e traiettoria.
 *
 * E' l'unico gioco del casino in cui la matematica e la geometria sono
 * separate dalla scena ma decidono i soldi: un refuso nella tabella dei
 * pagamenti cambia l'RTP, un pixel sbagliato nel hit-test fa pagare un
 * cavallo come un pieno, e una pallina che si ferma su una casella diversa
 * da quella annunciata rende la roulette incredibile.
 */
import { describe, expect, it } from 'vitest';
import {
  BASKET,
  CALL_BETS,
  PAYOUT,
  POCKETS,
  SPOTS,
  TRIO_012,
  TRIO_023,
  WHEEL_INDEX,
  WHEEL_ORDER,
  columnId,
  cornerId,
  coveredNumbers,
  dozenId,
  expandCall,
  grossPayout,
  lineId,
  neighbours,
  neighboursBet,
  splitId,
  spot,
  spotLimit,
  stats,
  straightId,
  streetId,
  totalStake,
  winningIds,
  type BetKind,
} from '@/games/roulette/rules';
import {
  CH,
  CW,
  DH,
  EDGE,
  EH,
  OUTSIDE_RECTS,
  PAD,
  RT_CELL,
  RT_SECTIONS,
  TABLE_H,
  TABLE_W,
  X0,
  Y0,
  ZW,
  anchorOf,
  cellRect,
  hitRacetrack,
  hitTable,
  rtPoint,
  rtSectionCenter,
} from '@/games/roulette/layout';
import {
  POCKET_R,
  TRACK_R,
  ballAt,
  numberAtAngle,
  pocketAngle,
  planSpin,
  relAt,
  rotorAt,
  totalTime,
} from '@/games/roulette/spin';
import { seededRng } from '@/games/slots/engine/rng';

const one = (id: string, amount = 1) => new Map([[id, amount]]);

describe('pagamenti', () => {
  it('ogni tipo paga 36/k − 1 a uno', () => {
    for (const s of SPOTS.values()) {
      expect(s.payout).toBe(PAYOUT[s.kind]);
      expect(36 % s.numbers.length).toBe(0);
      expect(s.payout).toBe(36 / s.numbers.length - 1);
    }
  });

  it('il tappeto ha esattamente le puntate attese per tipo', () => {
    const count = new Map<BetKind, number>();
    for (const s of SPOTS.values()) count.set(s.kind, (count.get(s.kind) ?? 0) + 1);
    expect(Object.fromEntries(count)).toEqual({
      straight: 37,
      split: 33 + 24 + 3,
      street: 12,
      trio: 2,
      corner: 22,
      basket: 1,
      line: 11,
      column: 3,
      dozen: 3,
      red: 1,
      black: 1,
      even: 1,
      odd: 1,
      low: 1,
      high: 1,
    });
  });

  it('RTP esatto 36/37 per OGNI puntata (aritmetica intera)', () => {
    for (const id of SPOTS.keys()) {
      let ret = 0;
      for (let n = 0; n < POCKETS; n++) ret += grossPayout(one(id), n);
      // Ritorno lordo su tutti i 37 numeri con 1 fiche = 36 esatti.
      expect(ret, id).toBe(36);
    }
  });

  it('grossPayout su casi noti', () => {
    expect(grossPayout(one(straightId(17), 10), 17)).toBe(360);
    expect(grossPayout(one(straightId(17), 10), 18)).toBe(0);
    expect(grossPayout(one(splitId(17, 20), 10), 20)).toBe(180);
    expect(grossPayout(one(streetId(5), 10), 16)).toBe(120);
    expect(grossPayout(one(cornerId([17, 18, 20, 21]), 10), 21)).toBe(90);
    expect(grossPayout(one(lineId(0), 10), 6)).toBe(60);
    expect(grossPayout(one(BASKET, 10), 0)).toBe(90);
    expect(grossPayout(one(TRIO_023, 10), 3)).toBe(120);
    expect(grossPayout(one(columnId(1), 10), 34)).toBe(30);
    expect(grossPayout(one(columnId(3), 10), 36)).toBe(30);
    expect(grossPayout(one(dozenId(3), 10), 25)).toBe(30);
    expect(grossPayout(one('red', 10), 1)).toBe(20);
    expect(grossPayout(one('black', 10), 2)).toBe(20);
    // Lo zero fa perdere tutte le chance semplici, per intero.
    for (const id of ['red', 'black', 'even', 'odd', 'low', 'high']) expect(grossPayout(one(id, 10), 0)).toBe(0);
  });

  it('piu puntate: somma delle vincenti, perdenti a zero', () => {
    const bets = new Map([
      [straightId(17), 5],
      ['black', 20],
      ['odd', 10],
      [dozenId(1), 10],
      [splitId(17, 20), 4],
    ]);
    expect(totalStake(bets)).toBe(49);
    // 17 e' nero, dispari, seconda dozzina.
    expect(grossPayout(bets, 17)).toBe(5 * 36 + 20 * 2 + 10 * 2 + 4 * 18);
    expect(winningIds(bets, 17).sort()).toEqual([straightId(17), 'black', 'odd', splitId(17, 20)].sort());
    expect(grossPayout(bets, 0)).toBe(0);
    expect(winningIds(bets, 0)).toEqual([]);
  });

  it('id sconosciuto: errore esplicito, non pagamento silenzioso', () => {
    expect(() => spot('straight:37')).toThrow();
    expect(() => grossPayout(one('split:1-5'), 1)).toThrow();
  });
});

describe('tappeto: hit-test', () => {
  const center = (n: number) => {
    const r = cellRect(n);
    return [r.x + r.w / 2, r.y + r.h / 2] as const;
  };

  it('il tappeto contiene tutte le caselle', () => {
    expect(TABLE_W).toBe(PAD + ZW + 13 * CW + PAD);
    expect(TABLE_H).toBe(Y0 + 3 * CH + DH + EH + PAD);
  });

  it('pieni al centro di ogni casella', () => {
    for (let n = 0; n <= 36; n++) expect(hitTable(...center(n))).toBe(straightId(n));
  });

  it('cavallo orizzontale sul bordo verticale fra due colonne', () => {
    // 17 (colonna 5) e 20 (colonna 6) sono nella stessa riga.
    const [, y] = center(17);
    const xb = X0 + 6 * CW;
    expect(hitTable(xb, y)).toBe(splitId(17, 20));
    expect(hitTable(xb - EDGE + 1, y)).toBe(splitId(17, 20));
    expect(hitTable(xb + EDGE - 1, y)).toBe(splitId(17, 20));
    // Appena fuori dalla fascia: torna il pieno.
    expect(hitTable(xb - EDGE - 2, y)).toBe(straightId(17));
    expect(hitTable(xb + EDGE + 2, y)).toBe(straightId(20));
  });

  it('cavallo verticale sul bordo orizzontale fra due righe', () => {
    const [x] = center(17);
    expect(hitTable(x, Y0 + CH)).toBe(splitId(17, 18));
    expect(hitTable(x, Y0 + 2 * CH)).toBe(splitId(16, 17));
  });

  it('carré sugli incroci interni', () => {
    expect(hitTable(X0 + 6 * CW, Y0 + CH)).toBe(cornerId([17, 18, 20, 21]));
    expect(hitTable(X0 + 6 * CW + 5, Y0 + 2 * CH - 5)).toBe(cornerId([16, 17, 19, 20]));
    expect(hitTable(X0 + CW, Y0 + CH)).toBe(cornerId([2, 3, 5, 6]));
  });

  it('terzina e sestina sul bordo inferiore', () => {
    const [x] = center(17);
    expect(hitTable(x, Y0 + 3 * CH)).toBe(streetId(5));
    expect(hitTable(x, Y0 + 3 * CH + EDGE - 1)).toBe(streetId(5));
    expect(hitTable(X0 + 6 * CW, Y0 + 3 * CH)).toBe(lineId(5));
    expect(spot(lineId(5)).numbers).toEqual([16, 17, 18, 19, 20, 21]);
    // Ultima colonna: terzina 34-35-36 si', sestina oltre il bordo no.
    expect(hitTable(X0 + 11 * CW + CW / 2, Y0 + 3 * CH)).toBe(streetId(11));
  });

  it('puntate con lo zero', () => {
    expect(hitTable(X0, Y0 + CH / 2)).toBe(splitId(0, 3));
    expect(hitTable(X0, Y0 + CH * 1.5)).toBe(splitId(0, 2));
    expect(hitTable(X0, Y0 + CH * 2.5)).toBe(splitId(0, 1));
    expect(hitTable(X0, Y0 + CH)).toBe(TRIO_023);
    expect(hitTable(X0, Y0 + 2 * CH)).toBe(TRIO_012);
    expect(hitTable(X0, Y0 + 3 * CH)).toBe(BASKET);
    expect(hitTable(X0 - EDGE + 1, Y0 + CH / 2)).toBe(splitId(0, 3));
    expect(hitTable(X0 - EDGE - 2, Y0 + CH / 2)).toBe(straightId(0));
  });

  it('puntate esterne e zone vuote', () => {
    for (const [id, r] of OUTSIDE_RECTS) expect(hitTable(r.x + r.w / 2, r.y + r.h / 2)).toBe(id);
    expect(hitTable(X0 + 12 * CW + CW / 2, Y0 + CH / 2)).toBe(columnId(3));
    expect(hitTable(X0 + 12 * CW + CW / 2, Y0 + 2.5 * CH)).toBe(columnId(1));
    expect(hitTable(2, 2)).toBeNull();
    expect(hitTable(PAD + 4, Y0 + 3 * CH + DH / 2)).toBeNull(); // sotto lo zero non c'e' nulla
    expect(hitTable(TABLE_W - 2, TABLE_H - 2)).toBeNull();
  });

  it('ogni puntata del tappeto: il punto di appoggio della fiche ricade nella stessa puntata', () => {
    // E' la garanzia che conta per il giocatore: la fiche si posa dove il
    // click l'ha messa, e cliccarci sopra di nuovo aggiunge alla stessa pila.
    for (const id of SPOTS.keys()) {
      const p = anchorOf(id);
      expect(hitTable(p.x, p.y), id).toBe(id);
    }
  });

  it('cavallo cliccato dai due lati = stessa pila', () => {
    expect(splitId(20, 17)).toBe(splitId(17, 20));
    expect(cornerId([21, 17, 20, 18])).toBe(cornerId([17, 18, 20, 21]));
  });
});

describe('racetrack e annunci', () => {
  it('ordine del cilindro: permutazione di 0..36 con indice inverso', () => {
    expect([...WHEEL_ORDER].sort((a, b) => a - b)).toEqual([...Array(37).keys()]);
    WHEEL_ORDER.forEach((n, i) => expect(WHEEL_INDEX[n]).toBe(i));
  });

  it('ogni casella del racetrack restituisce il suo numero', () => {
    for (let i = 0; i < POCKETS; i++) {
      const p = rtPoint(i * RT_CELL);
      expect(hitRacetrack(p.x, p.y)).toEqual({ type: 'number', n: WHEEL_ORDER[i] });
    }
  });

  it('le zone interne restituiscono il loro annuncio', () => {
    for (const id of RT_SECTIONS) {
      const p = rtSectionCenter(id);
      expect(hitRacetrack(p.x, p.y)).toEqual({ type: 'call', id });
    }
  });

  it('vicini: due per lato, nell ordine del cilindro', () => {
    expect(neighbours(0)).toEqual([3, 26, 0, 32, 15]);
    expect(neighbours(26, 1)).toEqual([3, 26, 0]);
    expect(neighbours(17)).toEqual([2, 25, 17, 34, 6]);
    expect(neighboursBet(17)).toEqual([2, 25, 17, 34, 6].map((n) => ({ id: straightId(n), units: 1 })));
  });

  it('annunci: fiche e numeri coperti', () => {
    const units = (id: keyof typeof CALL_BETS) => CALL_BETS[id].reduce((a, c) => a + c.units, 0);
    expect(units('voisins')).toBe(9);
    expect(units('tiers')).toBe(6);
    expect(units('orphelins')).toBe(5);
    expect(units('zero')).toBe(4);
    expect(coveredNumbers(CALL_BETS.voisins)).toHaveLength(17);
    expect(coveredNumbers(CALL_BETS.tiers)).toHaveLength(12);
    expect(coveredNumbers(CALL_BETS.orphelins)).toHaveLength(8);
    expect(coveredNumbers(CALL_BETS.zero)).toHaveLength(7);
    // Vicini + Terzo + Orfanelli coprono il cilindro, una volta sola.
    const all = [...CALL_BETS.voisins, ...CALL_BETS.tiers, ...CALL_BETS.orphelins];
    expect(coveredNumbers(all)).toEqual([...Array(37).keys()]);
  });

  it('gli annunci coprono archi CONTIGUI del cilindro', () => {
    for (const id of ['voisins', 'tiers', 'orphelins', 'zero'] as const) {
      const nums = new Set(coveredNumbers(CALL_BETS[id]));
      const idx = [...nums].map((n) => WHEEL_INDEX[n]!).sort((a, b) => a - b);
      // Gli Orfanelli sono due archi per definizione (i "rimasti").
      let gaps = 0;
      for (let k = 0; k < idx.length; k++) {
        const next = idx[(k + 1) % idx.length]!;
        if ((next - idx[k]! + POCKETS) % POCKETS !== 1) gaps++;
      }
      expect(gaps, id).toBe(id === 'orphelins' ? 2 : 1);
    }
  });

  it('expandCall: unita per taglio, fiche ripetute sommate', () => {
    const m = expandCall(CALL_BETS.voisins, 5);
    expect(m.get(TRIO_023)).toBe(10);
    expect(m.get(cornerId([25, 26, 28, 29]))).toBe(10);
    expect(m.get(splitId(4, 7))).toBe(5);
    expect(totalStake(m)).toBe(45);
    const dup = expandCall([...CALL_BETS.voisins, ...CALL_BETS.zero], 1);
    expect(dup.get(splitId(12, 15))).toBe(2);
    expect(dup.get(splitId(32, 35))).toBe(2);
    expect(totalStake(dup)).toBe(13);
  });

  it('vicini dello zero pagano come la somma delle loro fiche', () => {
    const m = expandCall(CALL_BETS.voisins, 1);
    expect(grossPayout(m, 0)).toBe(2 * 12); // terzina 0-2-3 con 2 fiche
    expect(grossPayout(m, 26)).toBe(2 * 9); // carre' 25-26-28-29 con 2 fiche
    expect(grossPayout(m, 4)).toBe(18);
    expect(grossPayout(m, 1)).toBe(0); // fuori dai Vicini
  });
});

describe('limiti del tavolo', () => {
  it('proporzionali ai numeri coperti', () => {
    expect(spotLimit(straightId(7), 500)).toBe(500);
    expect(spotLimit(splitId(7, 8), 500)).toBe(1000);
    expect(spotLimit(streetId(2), 500)).toBe(1500);
    expect(spotLimit(TRIO_012, 500)).toBe(1500);
    expect(spotLimit(cornerId([1, 2, 4, 5]), 500)).toBe(2000);
    expect(spotLimit(BASKET, 500)).toBe(2000);
    expect(spotLimit(lineId(3), 500)).toBe(3000);
    expect(spotLimit(columnId(2), 500)).toBe(6000);
    expect(spotLimit(dozenId(2), 500)).toBe(6000);
    expect(spotLimit('red', 500)).toBe(9000);
  });

  it('vincita massima uguale su ogni casella: 36 volte il tetto', () => {
    for (const s of SPOTS.values()) {
      const max = spotLimit(s.id, 100);
      expect(grossPayout(one(s.id, max), s.numbers[0]!), s.id).toBe(3600);
    }
  });

  it('il limite e per casella: il totale puo superare il tetto', () => {
    const ceiling = 100;
    const bets = new Map<string, number>();
    for (let n = 0; n <= 36; n++) bets.set(straightId(n), ceiling);
    expect(totalStake(bets)).toBe(3700);
    for (const [id, v] of bets) expect(v).toBeLessThanOrEqual(spotLimit(id, ceiling));
  });
});

describe('statistiche', () => {
  it('conteggi, caldi e freddi', () => {
    const s = stats([17, 0, 17, 32, 4]);
    expect(s.count).toBe(5);
    expect(s.zero).toBe(1);
    expect(s.red).toBe(1); // 32
    expect(s.black).toBe(3); // 17, 17, 4
    expect(s.hot[0]).toBe(17);
    expect(s.freq[17]).toBe(2);
    expect(s.dozens).toEqual([1, 2, 1]);
    expect(stats([]).hot).toEqual([]);
    expect(stats([]).cold).toHaveLength(5);
  });
});

describe('traiettoria: la pallina si ferma nella casella estratta', () => {
  const opts = { duration: 7, settle: 1.8, rotorTurns: 1.4, ballTurns: 4 };

  it('per ogni numero e da partenze casuali', () => {
    const rng = seededRng(7);
    for (let n = 0; n < POCKETS; n++) {
      for (let k = 0; k < 20; k++) {
        const rotor0 = (rng.next() - 0.5) * 40;
        const ball0 = (rng.next() - 0.5) * 40;
        const p = planSpin(n, rotor0, ball0, opts);
        const land = ballAt(p, p.duration);
        expect(numberAtAngle(land.rel), `n=${n}`).toBe(n);
        expect(land.radius).toBeCloseTo(POCKET_R, 9);
        expect(land.landed).toBe(true);
        // Dentro la casella, non sul diaframma: scarto dal centro trascurabile.
        const d = Math.atan2(Math.sin(land.rel - pocketAngle(WHEEL_INDEX[n]!)), Math.cos(land.rel - pocketAngle(WHEEL_INDEX[n]!)));
        expect(Math.abs(d)).toBeLessThan(1e-9);
        // A ruota ferma la pallina e' ancora li'.
        const end = ballAt(p, totalTime(p));
        expect(numberAtAngle(end.rel)).toBe(n);
        expect(numberAtAngle(end.angle - rotorAt(p, totalTime(p)))).toBe(n);
      }
    }
  });

  it('parte dal punto in cui si trova (nessuno scatto) e in gola', () => {
    const p = planSpin(17, 1.2, -0.4, opts);
    expect(ballAt(p, 0).angle).toBeCloseTo(-0.4, 9);
    expect(rotorAt(p, 0)).toBeCloseTo(1.2, 9);
    expect(ballAt(p, 0).radius).toBe(TRACK_R);
  });

  it('ruota e pallina in senso opposto all inizio', () => {
    const p = planSpin(5, 0, 0, opts);
    const dt = 0.01;
    const rotorV = rotorAt(p, dt) - rotorAt(p, 0);
    const ballV = ballAt(p, dt).angle - ballAt(p, 0).angle;
    expect(rotorV).toBeGreaterThan(0);
    expect(ballV).toBeLessThan(0);
  });

  it('dopo l ingresso la pallina e solidale con la ruota', () => {
    const p = planSpin(23, 0.3, 2, opts);
    expect(relAt(p, p.duration)).toBeCloseTo(relAt(p, p.duration + 0.7), 12);
  });

  it('il raggio non esce mai dal catino e non entra nel cono', () => {
    const p = planSpin(11, 0, 0, opts);
    for (let t = 0; t <= totalTime(p); t += 0.01) {
      const r = ballAt(p, t).radius;
      expect(r).toBeLessThanOrEqual(TRACK_R);
      expect(r).toBeGreaterThanOrEqual(POCKET_R - 1e-9);
    }
  });
});
