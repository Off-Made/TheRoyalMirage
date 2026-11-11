/**
 * Video poker Jacks or Better 9/6: classifica delle mani e pagamenti.
 */
import { describe, expect, it } from 'vitest';
import { cards } from '@/games/cards/card';
import { seededRng } from '@/games/slots/engine/rng';
import { PokerHand, coinsWon, evaluate, payout } from '@/games/videopoker/rules';

const rank = (s: string) => evaluate(cards(s)).rank;

describe('classifica', () => {
  it('riconosce ogni categoria', () => {
    expect(rank('AS KS QS JS 10S')).toBe('royalFlush');
    expect(rank('9H KH QH JH 10H')).toBe('straightFlush');
    expect(rank('7C 7D 7H 7S 2C')).toBe('fourKind');
    expect(rank('3C 3D 3H 9S 9C')).toBe('fullHouse');
    expect(rank('2D 9D QD 4D 7D')).toBe('flush');
    expect(rank('5C 6D 7H 8S 9C')).toBe('straight');
    expect(rank('QC QD QH 2S 9C')).toBe('threeKind');
    expect(rank('4C 4D 9H 9S KC')).toBe('twoPair');
    expect(rank('JC JD 2H 5S 9C')).toBe('jacksOrBetter');
    expect(rank('2C 4D 6H 8S 10C')).toBe('nothing');
  });

  it('scala bassa con Asso (A-2-3-4-5) e alta (10-A)', () => {
    expect(rank('AC 2D 3H 4S 5C')).toBe('straight');
    expect(rank('AC KD QH JS 10C')).toBe('straight');
    expect(rank('AH 2H 3H 4H 5H')).toBe('straightFlush');
  });

  it('nessuna scala "che gira" (Q-K-A-2-3)', () => {
    expect(rank('QC KD AH 2S 3C')).toBe('nothing');
    expect(rank('KC AD 2H 3S 4C')).toBe('nothing');
  });

  it('scala reale vs scala colore', () => {
    expect(rank('10D JD QD KD AD')).toBe('royalFlush');
    expect(rank('9D 10D JD QD KD')).toBe('straightFlush');
  });

  it('soglia Jacks or Better', () => {
    expect(rank('10C 10D 2H 5S 9C')).toBe('nothing');
    expect(rank('AC AD 2H 5S 9C')).toBe('jacksOrBetter');
    expect(payout(evaluate(cards('10C 10D 2H 5S 9C')).rank, 1, 1)).toBe(0);
    expect(payout(evaluate(cards('JC JD 2H 5S 9C')).rank, 1, 1)).toBe(1);
  });

  it('indica le carte della combinazione', () => {
    expect(evaluate(cards('JC 2D JH 5S 9C')).cards).toEqual([0, 2]);
    expect(evaluate(cards('7C 2D 7H 7S 9C')).cards).toEqual([0, 2, 3]);
  });
});

describe('pagamenti', () => {
  it('paytable 9/6 per moneta', () => {
    expect(coinsWon('straightFlush', 1)).toBe(50);
    expect(coinsWon('fourKind', 1)).toBe(25);
    expect(coinsWon('fullHouse', 1)).toBe(9);
    expect(coinsWon('flush', 1)).toBe(6);
    expect(coinsWon('straight', 1)).toBe(4);
    expect(coinsWon('threeKind', 1)).toBe(3);
    expect(coinsWon('twoPair', 1)).toBe(2);
    expect(coinsWon('jacksOrBetter', 1)).toBe(1);
    expect(coinsWon('nothing', 5)).toBe(0);
    expect(coinsWon('fullHouse', 5)).toBe(45);
  });

  it('scala reale: 250 per moneta sotto il massimo, 4000 a 5 monete', () => {
    expect(coinsWon('royalFlush', 1)).toBe(250);
    expect(coinsWon('royalFlush', 4)).toBe(1000);
    expect(coinsWon('royalFlush', 5)).toBe(4000);
  });

  it('vincita in fiche = monete x valore moneta', () => {
    expect(payout('flush', 5, 10)).toBe(300);
    expect(payout('royalFlush', 5, 2)).toBe(8000);
  });
});

describe('mano', () => {
  it('distribuisce 5 carte distinte e sostituisce solo le non tenute', () => {
    const h = new PokerHand(seededRng(7));
    const before = [...h.cards];
    const ids = new Set(before.map((c) => `${c.rank}${c.suit}`));
    expect(ids.size).toBe(5);
    const replaced = h.draw([true, false, true, false, false]);
    expect(replaced).toEqual([1, 3, 4]);
    expect(h.cards[0]).toEqual(before[0]);
    expect(h.cards[2]).toEqual(before[2]);
    const after = new Set(h.cards.map((c) => `${c.rank}${c.suit}`));
    expect(after.size).toBe(5);
    // Le carte scartate non rientrano.
    for (const i of [1, 3, 4]) expect(h.cards.some((c) => c === before[i])).toBe(false);
  });
});

import { VideoPokerMachine } from '@/games/videopoker/machine';

describe('modalita\' "tocca per scartare"', () => {
  it('holdAll tiene tutte le carte: un tocco poi le scarta una a una', () => {
    const m = new VideoPokerMachine();
    m.start(new PokerHand(seededRng(7)), 100);
    m.holdAll();
    expect(m.held).toEqual([true, true, true, true, true]);
    m.toggle(2);
    const before = [...m.hand!.cards];
    const r = m.finish()!;
    expect(r.replaced).toEqual([2]);
    expect(m.hand!.cards.filter((_, i) => i !== 2)).toEqual(before.filter((_, i) => i !== 2));
  });
  it('holdAll fuori dalla fase di scelta non fa nulla', () => {
    const m = new VideoPokerMachine();
    m.holdAll();
    expect(m.held.every((h) => !h)).toBe(true);
  });
});
