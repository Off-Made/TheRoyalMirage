/**
 * Regole del blackjack su mani scritte a mano (sabot truccato con `rig`).
 * Ordine di distribuzione: giocatore, banco (scoperta), giocatore, banco (coperta).
 */
import { describe, expect, it } from 'vitest';
import { Shoe, cards } from '@/games/cards/card';
import { seededRng } from '@/games/slots/engine/rng';
import {
  BlackjackRound,
  dealerShouldHit,
  handTotal,
  insuranceCost,
  insurancePayout,
  isBlackjack,
  settleHand,
  totalLabel,
} from '@/games/blackjack/rules';

function shoe(seq: string): Shoe {
  const s = new Shoe(seededRng(1), { decks: 6, penetration: 0.75 });
  s.rig(cards(seq));
  return s;
}
/** Mano truccata: p1 d1 p2 d2 poi le carte successive. */
function round(p: string, d: string, next = '', bet = 10): BlackjackRound {
  const [p1, p2] = p.split(' ');
  const [d1, d2] = d.split(' ');
  return new BlackjackRound(shoe(`${p1} ${d1} ${p2} ${d2} ${next}`), bet);
}

describe('totali', () => {
  it('hard e soft', () => {
    expect(handTotal(cards('10S 7H'))).toEqual({ total: 17, soft: false });
    expect(handTotal(cards('AS 6H'))).toEqual({ total: 17, soft: true });
    expect(handTotal(cards('AS 6H 10D'))).toEqual({ total: 17, soft: false });
    expect(handTotal(cards('AS AH'))).toEqual({ total: 12, soft: true });
    expect(handTotal(cards('AS AH AD AC 7S'))).toEqual({ total: 21, soft: true });
    expect(handTotal(cards('KS QH 2D'))).toEqual({ total: 22, soft: false });
  });

  it('etichette dei badge', () => {
    expect(totalLabel(cards('AS 6H'))).toBe('7/17');
    expect(totalLabel(cards('AS 6H 10D'))).toBe('17');
    expect(totalLabel(cards('AS 10H'))).toBe('21');
    expect(totalLabel(cards('AS 10H'), true)).toBe('BJ');
  });

  it('blackjack solo con le prime due e non dopo split', () => {
    expect(isBlackjack(cards('AS KH'))).toBe(true);
    expect(isBlackjack(cards('AS KH'), true)).toBe(false);
    expect(isBlackjack(cards('7S 7H 7D'))).toBe(false);
  });
});

describe('banco S17', () => {
  it('pesca su 16 e soft 16, sta su 17 hard e soft', () => {
    expect(dealerShouldHit(cards('10S 6H'))).toBe(true);
    expect(dealerShouldHit(cards('AS 5H'))).toBe(true);
    expect(dealerShouldHit(cards('AS 6H'))).toBe(false);
    expect(dealerShouldHit(cards('10S 7H'))).toBe(false);
  });

  it('il banco gioca: 6+10 pesca, si ferma a 17 o piu', () => {
    const r = round('10S 8H', '6D 10C', '5S 9H');
    r.stand();
    expect(r.phase).toBe('dealer');
    const drawn = r.playDealer();
    expect(drawn).toHaveLength(1);
    expect(handTotal(r.dealer).total).toBe(21);
    expect(r.outcomes()[0]!.result).toBe('lose');
  });

  it('soft 17 del banco: sta', () => {
    const r = round('10S 8H', 'AD 6C');
    r.declineInsurance();
    r.stand();
    expect(r.playDealer()).toHaveLength(0);
    expect(r.outcomes()[0]).toMatchObject({ result: 'win', payout: 20 });
  });

  it('tutte le mani sballate: il banco non pesca', () => {
    const r = round('10S 6H', '5D 10C', 'KS 9H');
    r.hit();
    expect(r.phase).toBe('dealer');
    expect(r.playDealer()).toHaveLength(0);
    expect(r.totalPayout()).toBe(0);
  });
});

describe('pagamenti', () => {
  it('blackjack 3:2, arrotondato all intero', () => {
    expect(settleHand(cards('AS KH'), 10, cards('10D 7C')).payout).toBe(25);
    expect(settleHand(cards('AS KH'), 5, cards('10D 7C')).payout).toBe(13);
    expect(settleHand(cards('AS KH'), 10, cards('AD KC'))).toMatchObject({ result: 'push', payout: 10 });
  });

  it('vittoria, pareggio, sconfitta, sballo', () => {
    expect(settleHand(cards('10S 9H'), 10, cards('10D 8C'))).toMatchObject({ result: 'win', payout: 20 });
    expect(settleHand(cards('10S 8H'), 10, cards('10D 8C'))).toMatchObject({ result: 'push', payout: 10 });
    expect(settleHand(cards('10S 7H'), 10, cards('10D 8C'))).toMatchObject({ result: 'lose', payout: 0 });
    expect(settleHand(cards('10S 7H 9C'), 10, cards('10D 6C 9H'))).toMatchObject({ result: 'bust', payout: 0 });
    expect(settleHand(cards('10S 2H'), 10, cards('10D 6C 9H'))).toMatchObject({ result: 'win', payout: 20 });
  });

  it('21 a tre carte contro blackjack del banco perde', () => {
    expect(settleHand(cards('7S 7H 7C'), 10, cards('AD KC')).result).toBe('lose');
  });

  it('assicurazione 2:1', () => {
    expect(insuranceCost(10)).toBe(5);
    expect(insuranceCost(25)).toBe(12);
    expect(insuranceCost(1)).toBe(0);
    expect(insurancePayout(5, true)).toBe(15);
    expect(insurancePayout(5, false)).toBe(0);
  });
});

describe('mano completa', () => {
  it('Asso scoperto: assicurazione offerta, banco con BJ, pareggio netto', () => {
    const r = round('10S 9H', 'AD KC');
    expect(r.phase).toBe('insurance');
    expect(r.legal().insurance).toBe(true);
    r.takeInsurance();
    expect(r.phase).toBe('done');
    expect(r.dealerBlackjack).toBe(true);
    // Persa la puntata (10), l'assicurazione (5) torna triplicata: 15 = 10 + 5.
    expect(r.totalWager).toBe(15);
    expect(r.totalPayout()).toBe(15);
  });

  it('assicurazione rifiutata e banco senza BJ: si gioca', () => {
    const r = round('10S 9H', 'AD 7C');
    r.declineInsurance();
    expect(r.phase).toBe('player');
    expect(r.insurance).toBe(0);
  });

  it('assicurazione persa se il banco non ha BJ', () => {
    const r = round('10S 9H', 'AD 7C');
    r.takeInsurance();
    expect(r.phase).toBe('player');
    r.stand();
    r.playDealer();
    expect(r.insuranceReturn()).toBe(0);
    expect(r.totalPayout()).toBe(20);
  });

  it('peek con 10 scoperto: BJ del banco chiude la mano subito', () => {
    const r = round('10S 9H', 'KD AC');
    expect(r.phase).toBe('done');
    expect(r.totalPayout()).toBe(0);
  });

  it('blackjack del giocatore: mano chiusa e pagata 3:2', () => {
    const r = round('AS KH', '9D 7C');
    expect(r.phase).toBe('done');
    expect(r.totalPayout()).toBe(25);
  });

  it('raddoppio: una carta, puntata doppia', () => {
    const r = round('6S 5H', '9D 7C', '10S 5D');
    expect(r.legal().double).toBe(true);
    r.double();
    expect(r.hand.bet).toBe(20);
    expect(r.hand.cards).toHaveLength(3);
    expect(r.phase).toBe('dealer');
    r.playDealer(); // 6+5+10 = 21; banco 9+7=16, pesca 5: 21
    expect(r.outcomes()[0]).toMatchObject({ result: 'push', bet: 20, payout: 20 });
  });

  it('niente raddoppio dopo la terza carta', () => {
    const r = round('2S 3H', '9D 7C', '4S');
    r.hit();
    expect(r.legal().double).toBe(false);
  });

  it('divisione fino a 3 mani, raddoppio dopo divisione', () => {
    const r = round('8S 8H', '9D 7C', '8D 3C 10S 2H 10D');
    expect(r.legal().split).toBe(true);
    r.split(); // mano 0: 8S 8D, mano 1: 8H 3C
    expect(r.hands).toHaveLength(2);
    expect(r.legal().split).toBe(true);
    r.split(); // mano 0: 8S 10S, mano 1: 8D 2H, mano 2: 8H 3C
    expect(r.hands).toHaveLength(3);
    expect(r.hands.map((h) => h.cards.length)).toEqual([2, 2, 2]);
    expect(r.legal().split).toBe(false);
    r.stand(); // 18
    expect(r.active).toBe(1);
    expect(r.legal().double).toBe(true);
    r.double(); // 8D 2H 10D = 20
    expect(r.active).toBe(2);
    expect(r.hands[1]!.bet).toBe(20);
  });

  it('K e Q si dividono (stesso valore)', () => {
    expect(round('KS QH', '9D 7C').legal().split).toBe(true);
  });

  it('assi divisi: una carta ciascuno, 21 non e blackjack', () => {
    const r = round('AS AH', '9D 8C', 'KD 5C');
    r.split();
    expect(r.hands.every((h) => h.cards.length === 2 && h.done)).toBe(true);
    expect(r.phase).toBe('dealer');
    r.playDealer();
    const o = r.outcomes();
    expect(o[0]).toMatchObject({ result: 'win', payout: 20 }); // A+K = 21, paga 1:1
    expect(o[1]).toMatchObject({ result: 'lose' }); // A+5 = 16 contro 17
  });

  it('assi divisi non si ridividono', () => {
    const r = new BlackjackRound(shoe('AS 9D AH 8C AD 5C'), 10);
    r.split();
    expect(r.hands).toHaveLength(2);
    expect(r.phase).toBe('dealer');
  });

  it('chiusura forzata (uscita): sta su tutto e gioca il banco', () => {
    const r = round('10S 6H', '10D 7C');
    r.forceFinish();
    expect(r.phase).toBe('done');
    expect(r.totalPayout()).toBe(0);
  });

  it('mano a 21 si chiude da sola', () => {
    const r = round('5S 6H', '9D 7C', '10S');
    r.hit();
    expect(r.phase).toBe('dealer');
  });
});
