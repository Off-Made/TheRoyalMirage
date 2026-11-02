/**
 * Baccarat (Punto Banco): tableau della terza carta, pagamenti, segnapunti.
 * Il tableau e' verificato in modo ESAUSTIVO contro la tabella stampata
 * (scritta qui a mano, indipendente dal codice): un solo caso sbagliato e
 * il vantaggio della casa dichiarato non e' piu' vero.
 */
import { describe, expect, it } from 'vitest';
import { cards, parseCard, type Card } from '@/games/cards/card';
import {
  areaPayout,
  bankerCommission,
  bankerDraws,
  beadPlate,
  bigRoad,
  cardValue,
  handTotal,
  isNatural,
  payout,
  playCoup,
  playerDraws,
  type Outcome,
} from '@/games/baccarat/rules';

/** Carta di valore baccarat v (0 = Re). */
const v = (n: number, suit = 'S'): Card => parseCard(`${n === 0 ? 'K' : n === 1 ? 'A' : n}${suit}`);

/** Funzione di pesca da una lista fissa. */
function stack(cs: Card[]): () => Card {
  let i = 0;
  return () => {
    const c = cs[i++];
    if (!c) throw new Error('pila esaurita');
    return c;
  };
}

/**
 * Tableau stampato del Banco. Riga = totale del Banco (0..7), colonna =
 * valore della terza carta del Punto (0..9). D = pesca, S = sta.
 */
const TABLEAU: Record<number, string> = {
  0: 'DDDDDDDDDD',
  1: 'DDDDDDDDDD',
  2: 'DDDDDDDDDD',
  3: 'DDDDDDDDSD',
  4: 'SSDDDDDDSS',
  5: 'SSSSDDDDSS',
  6: 'SSSSSSDDSS',
  7: 'SSSSSSSSSS',
};

describe('valori e totali', () => {
  it('figure e 10 valgono zero, asso 1, totale modulo 10', () => {
    expect(cards('10S JH QD KC').map(cardValue)).toEqual([0, 0, 0, 0]);
    expect(cardValue(parseCard('AS'))).toBe(1);
    expect(handTotal(cards('7S 8H'))).toBe(5);
    expect(handTotal(cards('9S 9H 9D'))).toBe(7);
    expect(handTotal(cards('KS QH'))).toBe(0);
  });
  it('naturale = 8 o 9 con DUE carte', () => {
    expect(isNatural(cards('4S 4H'))).toBe(true);
    expect(isNatural(cards('KS 9H'))).toBe(true);
    expect(isNatural(cards('7S AH'))).toBe(true);
    expect(isNatural(cards('7S KH'))).toBe(false);
    expect(isNatural(cards('2S 3H 3D'))).toBe(false);
  });
});

describe('terza carta del Punto', () => {
  it('pesca su 0-5, sta su 6-7', () => {
    for (let t = 0; t <= 7; t++) expect(playerDraws(t)).toBe(t <= 5);
  });
  it('nel colpo reale: Punto 5 pesca, Punto 6 sta', () => {
    // P: 2+3=5 · B: K+K=0 → Punto pesca (4), Banco 0 pesca sempre.
    const c1 = playCoup(stack([v(2), v(0), v(3), v(0), v(4), v(1)]));
    expect(c1.player.length).toBe(3);
    // P: 3+3=6 sta · B: K+K=0 → con Punto fermo il Banco pesca su 0-5.
    const c2 = playCoup(stack([v(3), v(0), v(3), v(0), v(1)]));
    expect(c2.player.length).toBe(2);
    expect(c2.banker.length).toBe(3);
  });
});

describe('tableau del Banco (esaustivo)', () => {
  for (let b = 0; b <= 7; b++) {
    for (let p = 0; p <= 9; p++) {
      const expected = TABLEAU[b]![p] === 'D';
      it(`Banco ${b}, terza del Punto ${p} → ${expected ? 'pesca' : 'sta'}`, () => {
        expect(bankerDraws(b, p)).toBe(expected);
        // Lo stesso caso giocato davvero: Punto K+K (0, pesca la terza p),
        // Banco con due carte di totale b (mai naturale perche' b <= 7).
        const coup = playCoup(stack([v(0), v(b), v(0), v(0, 'H'), v(p, 'D'), v(5, 'C')]));
        expect(coup.player.length).toBe(3);
        expect(coup.banker.length).toBe(expected ? 3 : 2);
      });
    }
  }
  it('Punto fermo (nessuna terza): Banco pesca su 0-5, sta su 6-7', () => {
    for (let b = 0; b <= 7; b++) {
      expect(bankerDraws(b, null)).toBe(b <= 5);
      const coup = playCoup(stack([v(6), v(b), v(0), v(0, 'H'), v(2, 'C')]));
      expect(coup.player.length).toBe(2);
      expect(coup.banker.length).toBe(b <= 5 ? 3 : 2);
    }
  });
  it('rispetta l’ordine P, B, P, B, P3, B3', () => {
    const coup = playCoup(stack([v(1), v(2), v(1, 'H'), v(0), v(3), v(4)]));
    expect(coup.order).toEqual(['P', 'B', 'P', 'B', 'P', 'B']);
    expect(coup.player.map(cardValue)).toEqual([1, 1, 3]);
    expect(coup.banker.map(cardValue)).toEqual([2, 0, 4]);
  });
});

describe('naturali', () => {
  it('un naturale del Punto ferma entrambi, anche col Banco a 0', () => {
    const coup = playCoup(stack([v(4), v(0), v(5), v(0, 'H')]));
    expect(coup.natural).toBe(true);
    expect(coup.player.length).toBe(2);
    expect(coup.banker.length).toBe(2);
    expect(coup.winner).toBe('P');
  });
  it('un naturale del Banco ferma il Punto a 0', () => {
    const coup = playCoup(stack([v(0), v(4), v(0, 'H'), v(4, 'H')]));
    expect(coup.natural).toBe(true);
    expect(coup.player.length).toBe(2);
    expect(coup.winner).toBe('B');
  });
  it('9 batte 8, 8 contro 8 e’ pareggio', () => {
    expect(playCoup(stack([v(9), v(8), v(0), v(0)])).winner).toBe('P');
    expect(playCoup(stack([v(8), v(8), v(0), v(0)])).winner).toBe('T');
  });
});

describe('pagamenti', () => {
  it('Punto 1:1, Pareggio 8:1 (vincite lorde)', () => {
    expect(areaPayout('player', 100, 'P')).toBe(200);
    expect(areaPayout('player', 100, 'B')).toBe(0);
    expect(areaPayout('tie', 100, 'T')).toBe(900);
    expect(areaPayout('tie', 100, 'P')).toBe(0);
  });
  it('Banco 1:1 meno 5%, commissione alla fiche piu’ vicina', () => {
    expect(areaPayout('banker', 100, 'B')).toBe(195);
    expect(areaPayout('banker', 20, 'B')).toBe(39);
    expect(bankerCommission(10)).toBe(1); // 0,5 → 1
    expect(bankerCommission(25)).toBe(1); // 1,25 → 1
    expect(bankerCommission(5)).toBe(0); // 0,25 → 0
    expect(areaPayout('banker', 1, 'B')).toBe(2); // una posta minima vince sempre qualcosa
    expect(areaPayout('banker', 1000, 'B')).toBe(1950);
  });
  it('col pareggio Punto e Banco sono restituiti', () => {
    expect(areaPayout('player', 50, 'T')).toBe(50);
    expect(areaPayout('banker', 50, 'T')).toBe(50);
    expect(payout({ player: 50, banker: 30, tie: 10 }, 'T')).toBe(50 + 30 + 90);
  });
  it('totale di puntate miste', () => {
    expect(payout({ player: 100, banker: 100, tie: 0 }, 'B')).toBe(195);
    expect(payout({ player: 100, banker: 0, tie: 25 }, 'P')).toBe(200);
  });
});

describe('Big Road', () => {
  const seq = (s: string) => [...s] as Outcome[];
  it('serie in colonna, cambio di lato in colonna nuova', () => {
    const r = bigRoad(seq('BBPPPB'));
    expect(r.map((c) => [c.col, c.row, c.winner])).toEqual([
      [0, 0, 'B'],
      [0, 1, 'B'],
      [1, 0, 'P'],
      [1, 1, 'P'],
      [1, 2, 'P'],
      [2, 0, 'B'],
    ]);
  });
  it('i pareggi si segnano sull’ultima cella (e i primi sulla prima)', () => {
    const r = bigRoad(seq('TBTTP'));
    expect(r).toHaveLength(2);
    expect(r[0]!.ties).toBe(1 + 2);
    expect(r[1]!.ties).toBe(0);
  });
  it('coda del drago: oltre la sesta riga la serie gira a destra', () => {
    const r = bigRoad(seq('BBBBBBBBP'));
    expect(r.slice(0, 6).every((c) => c.col === 0)).toBe(true);
    expect(r[6]).toMatchObject({ col: 1, row: 5 });
    expect(r[7]).toMatchObject({ col: 2, row: 5 });
    // Il Punto apre la colonna accanto all'inizio della serie, non dopo la coda.
    expect(r[8]).toMatchObject({ col: 1, row: 0, winner: 'P' });
  });
  it('coda del drago anche se la cella sotto e’ occupata da una coda precedente', () => {
    // 7 B (coda in riga 5 sulla colonna 1), poi 6 P in colonna 1: alla
    // riga 5 la cella e' occupata dalla coda → la serie gira a destra in riga 4.
    const r = bigRoad(seq('BBBBBBBPPPPPP'));
    const p = r.filter((c) => c.winner === 'P');
    expect(p.map((c) => [c.col, c.row])).toEqual([
      [1, 0],
      [1, 1],
      [1, 2],
      [1, 3],
      [1, 4],
      [2, 4],
    ]);
  });
  it('bead plate: un pallino per colpo, pareggi compresi, a colonne di 6', () => {
    const b = beadPlate(seq('BPTBBPP'));
    expect(b).toHaveLength(7);
    expect(b[6]).toEqual({ col: 1, row: 0, outcome: 'P' });
  });
});
