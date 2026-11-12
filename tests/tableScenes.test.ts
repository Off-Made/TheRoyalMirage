/**
 * Logica NUOVA delle scene dei tavoli (blackjack, baccarat, video poker):
 * contabilita' delle mosse a pagamento, tappeto delle puntate, copione del
 * colpo, stato della macchina. Le regole dei giochi hanno i loro test.
 *
 * Il "portafoglio" qui e' un RoundLedger con un saldo accanto: e' lo stesso
 * protocollo della scena (placeBet → ... → un solo settle).
 */
import { describe, expect, it } from 'vitest';
import { Shoe, cards } from '@/games/cards/card';
import { seededRng } from '@/games/slots/engine/rng';
import { RoundLedger } from '@/games/common/ledger';
import { BlackjackRound } from '@/games/blackjack/rules';
import { badgeLabel, fanOffsets, handXs, moveCost, seatXs, settlement, SEATS } from '@/games/blackjack/flow';
import { BetBoard, recital, roadWindow } from '@/games/baccarat/board';
import { playCoup, payout as bacPayout } from '@/games/baccarat/rules';
import { VideoPokerMachine } from '@/games/videopoker/machine';
import { PokerHand } from '@/games/videopoker/rules';

/** Portafoglio finto con lo stesso protocollo di GameScene. */
class Wallet {
  balance = 1000;
  ledger = new RoundLedger();
  settled = 0;
  placeBet(n: number): boolean {
    if (n <= 0 || n > this.balance) return false;
    this.balance -= n;
    this.ledger.add(n);
    return true;
  }
  settle(_stake: number, payout: number): void {
    if (!this.ledger.close()) return;
    this.settled++;
    this.balance += payout;
  }
}

function bjRound(seq: string, bet = 10): BlackjackRound {
  const s = new Shoe(seededRng(7), { decks: 6, penetration: 0.75 });
  s.rig(cards(seq));
  return new BlackjackRound(s, bet);
}

describe('blackjack — costi delle mosse', () => {
  it('raddoppio e divisione costano la puntata della mano attiva, solo se legali', () => {
    const r = bjRound('8S 5H 8D 9C');
    expect(moveCost(r, 'double')).toBe(10);
    expect(moveCost(r, 'split')).toBe(10);
    expect(moveCost(r, 'insurance')).toBe(0);
    const r2 = bjRound('8S 5H 9D 9C');
    expect(moveCost(r2, 'split')).toBe(0);
  });

  it("l'assicurazione costa meta' puntata e solo nella sua fase", () => {
    const r = bjRound('8S AH 8D 9C', 25);
    expect(r.phase).toBe('insurance');
    expect(moveCost(r, 'insurance')).toBe(12);
    expect(moveCost(r, 'double')).toBe(0);
  });

  it('una mano completa con assicurazione, divisione e raddoppio salda una volta e torna in pari col motore', () => {
    // P 8 8 contro A (coperta 9): assicurazione, divisione, raddoppio sulla prima (8+3+10).
    const w = new Wallet();
    const r = bjRound('8S AH 8D 9C 3S 10H 10D');
    expect(w.placeBet(10)).toBe(true);
    expect(w.placeBet(moveCost(r, 'insurance'))).toBe(true);
    r.takeInsurance();
    expect(w.placeBet(moveCost(r, 'split'))).toBe(true);
    r.split();
    expect(w.placeBet(moveCost(r, 'double'))).toBe(true);
    r.double();
    r.stand();
    r.playDealer();
    const { stake, payout } = settlement(r);
    expect(stake).toBe(35);
    expect(w.ledger.stake).toBe(stake);
    expect(payout).toBe(40); // 21 contro 20 raddoppiato vince, 18 perde, assicurazione persa
    w.settle(stake, payout);
    w.settle(stake, payout); // un secondo saldo (animazione in ritardo) e' scartato
    expect(w.balance).toBe(1000 - 35 + 40);
    expect(w.settled).toBe(1);
  });

  it("uscita a meta' mano: forceFinish + lo stesso saldo", () => {
    const w = new Wallet();
    const r = bjRound('10S 10H 9D 7C'); // P 10+9, B 10+7
    w.placeBet(10);
    r.forceFinish();
    const { stake, payout } = settlement(r);
    w.settle(stake, payout);
    expect(r.phase).toBe('done');
    expect(w.balance).toBe(1000 + 10); // 19 contro 17
  });
});

describe('blackjack — disposizione', () => {
  it('le mani stanno sulle postazioni disegnate, la divisione si allarga a destra', () => {
    expect(SEATS).toEqual(handXs(3));
    expect(seatXs(1)).toEqual([960]);
    expect(seatXs(2)).toEqual([960, 1280]);
    expect(seatXs(3)).toEqual([640, 960, 1280]);
  });

  it('il ventaglio e centrato e sale verso destra', () => {
    const f = fanOffsets(3, 40, 5);
    expect(f.map((p) => p.x)).toEqual([-40, 0, 40]);
    expect(f.map((p) => p.y)).toEqual([-0, -5, -10]);
  });

  it('il totale soft mostra entrambe le letture solo a mano aperta', () => {
    expect(badgeLabel({ total: 17, soft: true }, false, false)).toBe('7/17');
    expect(badgeLabel({ total: 17, soft: true }, false, true)).toBe('17');
    expect(badgeLabel({ total: 21, soft: true }, false, false)).toBe('21');
    expect(badgeLabel({ total: 21, soft: true }, true, false)).toBe('BJ');
  });
});

describe('baccarat — tappeto delle puntate', () => {
  it('non si possono posare piu fiche del saldo', () => {
    const b = new BetBoard();
    expect(b.add('banker', 60, 100)).toBe('ok');
    expect(b.add('tie', 40, 100)).toBe('ok');
    expect(b.add('player', 1, 100)).toBe('insufficient');
    expect(b.add('player', 0, 100)).toBe('invalid');
    expect(b.add('player', Number.NaN, 100)).toBe('invalid');
    expect(b.total).toBe(100);
  });

  it('le fiche sulla stessa area si sommano e Annulla toglie solo l ultima', () => {
    const b = new BetBoard();
    b.add('banker', 500, 10_000);
    b.add('banker', 500, 10_000);
    b.add('banker', 1_000, 10_000);
    b.add('tie', 100, 10_000);
    expect(b.bets.banker).toBe(2_000);
    expect(b.undo()).toBe(true);
    expect(b.bets).toEqual({ player: 0, banker: 2_000, tie: 0 });
    expect(b.undo()).toBe(true);
    expect(b.bets.banker).toBe(1_000);
    b.clear();
    expect(b.canUndo).toBe(false);
    expect(b.undo()).toBe(false);
  });

  it('commit svuota il tappeto e ricorda le puntate per Ripeti', () => {
    const b = new BetBoard();
    b.add('banker', 20, 500);
    b.add('tie', 5, 500);
    const bets = b.commit();
    expect(bets).toEqual({ player: 0, banker: 20, tie: 5 });
    expect(b.empty).toBe(true);
    expect(b.rebet(10)).toBe('insufficient');
    expect(b.empty).toBe(true);
    expect(b.rebet(500)).toBe('ok');
    expect(b.bets).toEqual(bets);
    expect(b.clear()).toBe(25);
    expect(new BetBoard().rebet(500)).toBe('none');
  });

  it("il copione segue l'ordine reale e la carta giusta va alla mano giusta", () => {
    const s = new Shoe(seededRng(3), { decks: 8, penetration: 0.94 });
    // P 2+3 = 5 pesca (4 → 9); B 10+K = 0 pesca sempre (6 → 6).
    s.rig(cards('2S TH 3C KD 4H 6S'));
    const coup = playCoup(() => s.draw());
    const steps = recital(coup);
    expect(steps.map((x) => `${x.side}${x.slot}`)).toEqual(['P0', 'B0', 'P1', 'B1', 'P2', 'B2']);
    expect(steps[4]!.card).toEqual(coup.player[2]);
    expect(steps[5]!.card).toEqual(coup.banker[2]);
    expect(coup.winner).toBe('P');
  });

  it("un solo placeBet e un solo settle per colpo; l'uscita paga il colpo gia' deciso", () => {
    const w = new Wallet();
    const b = new BetBoard();
    b.add('banker', 20, w.balance);
    b.add('tie', 10, w.balance);
    const s = new Shoe(seededRng(9), { decks: 8, penetration: 0.94 });
    s.rig(cards('2S 9H 3C TD')); // naturale del Banco, 9 a 5
    expect(w.placeBet(b.total)).toBe(true);
    const bets = b.commit();
    const coup = playCoup(() => s.draw());
    w.settle(30, bacPayout(bets, coup.winner)); // da resolvePending
    w.settle(30, bacPayout(bets, coup.winner)); // fine animazione in ritardo: scartato
    expect(w.balance).toBe(1000 - 30 + 39);
  });

  it('il segnapunti mostra le ultime colonne lasciandone una libera', () => {
    expect(roadWindow(0, 12)).toBe(0);
    expect(roadWindow(11, 12)).toBe(0);
    expect(roadWindow(12, 12)).toBe(1);
    expect(roadWindow(30, 12)).toBe(19);
  });
});

describe('video poker — la macchina', () => {
  const hand = () => PokerHand.rigged(cards('JS JH 4C 7D 9S'), cards('2C 3D 5H 8C 9D'));

  it("la puntata e' la giocata: nessun moltiplicatore di monete", () => {
    const m = new VideoPokerMachine();
    expect(m.stake(1)).toBe(1);
    expect(m.stake(5)).toBe(5);
    expect(m.stake(10)).toBe(10);
  });

  it('TENUTA solo durante la scelta, e la pesca avviene una volta sola', () => {
    const m = new VideoPokerMachine();
    expect(m.toggle(0)).toBe(false);
    m.start(hand(), 10);
    expect(m.toggle(0)).toBe(true);
    expect(m.toggle(1)).toBe(true);
    expect(m.toggle(5)).toBe(false);
    expect(m.preview()?.rank).toBe('jacksOrBetter');
    const r = m.finish();
    expect(r?.replaced).toEqual([2, 3, 4]);
    expect(r?.evaluation.rank).toBe('jacksOrBetter');
    expect(r?.stake).toBe(10);
    expect(r?.win).toBe(10);
    expect(m.finish()).toBeNull();
    expect(m.toggle(2)).toBe(false);
  });

  it('la puntata resta quella della distribuzione', () => {
    const m = new VideoPokerMachine();
    m.start(PokerHand.rigged(cards('AS AH AD 7C 2S'), cards('AC 9D')), 5);
    m.held = [true, true, true, false, false];
    const r = m.finish()!;
    expect(r.evaluation.rank).toBe('fourKind');
    expect(r.stake).toBe(5);
    expect(r.win).toBe(25 * 5);
  });

  it("senza tenute (uscita a meta') si pesca tutto e si paga la mano finale", () => {
    const m = new VideoPokerMachine();
    m.start(hand(), 1);
    const r = m.finish()!;
    expect(r.replaced).toEqual([0, 1, 2, 3, 4]);
    expect(r.win).toBe(0);
  });
});
