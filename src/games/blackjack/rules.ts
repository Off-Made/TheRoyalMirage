/**
 * THE ROYAL MIRAGE — Regole del blackjack
 *
 * Il motore puro della mano, senza grafica: la scena lo interroga
 * ("che mosse sono legali?") e gli comunica le scelte ("carta", "stai"),
 * poi anima le carte che il motore ha estratto. I test lo usano tale e
 * quale, con un sabot truccato.
 *
 * ── Le regole del tavolo (le piu' favorevoli che si trovano a Las Vegas) ──
 *   · 6 mazzi, carta di taglio al 75%
 *   · il banco STA su tutti i 17, anche soft (S17): A+6 non pesca
 *   · il banco "sbircia" (peek) la carta coperta con Asso o 10 scoperti:
 *     se ha blackjack la mano finisce subito e si perde SOLO la puntata
 *     iniziale (niente raddoppi o divisioni buttati via)
 *   · blackjack paga 3:2
 *   · assicurazione 2:1 quando il banco mostra un Asso, fino a meta' puntata
 *   · raddoppio su qualunque prima coppia di carte, anche dopo una divisione
 *   · divisione delle coppie (stesso valore: K+Q si divide) fino a 3 mani
 *   · gli Assi divisi ricevono una sola carta ciascuno e non si ridividono
 *   · 21 dopo una divisione e' un 21, NON un blackjack (paga 1:1)
 *
 * Con queste regole e strategia di base il vantaggio del banco e' circa
 * 0,4-0,5%: l'RTP dichiarato in lobby (99,5%) e' quello.
 *
 * ── Arrotondamenti (fiche intere) ──
 *   · blackjack: vincita netta = Math.round(puntata x 1,5). Con puntate
 *     dispari il mezzo gettone va al giocatore (5 → paga 8, non 7,5)
 *   · assicurazione: costa floor(puntata / 2); con puntata 1 non e' offerta
 */

import type { Card, Shoe } from '@/games/cards/card';

// ═══════════════════════════════════════════════ VALORI

/** Valore di blackjack di una carta: figure 10, Asso 1 (il +10 lo decide il totale). */
export function cardValue(c: Card): number {
  return c.rank >= 10 ? 10 : c.rank;
}

export interface Total {
  /** Il totale migliore (con un Asso a 11 se non sballa). */
  total: number;
  /** Vero se un Asso conta 11: la mano non puo' sballare con una carta. */
  soft: boolean;
}

/**
 * Totale di una mano. Basta contare UN Asso a 11: due Assi a 11 farebbero
 * 22, quindi al massimo uno puo' valere 11.
 */
export function handTotal(cards: readonly Card[]): Total {
  let sum = 0;
  let aces = 0;
  for (const c of cards) {
    sum += cardValue(c);
    if (c.rank === 1) aces++;
  }
  if (aces > 0 && sum + 10 <= 21) return { total: sum + 10, soft: true };
  return { total: sum, soft: false };
}

/** Etichetta del totale per il badge: "7/17" per le mani soft, "BJ" per il blackjack. */
export function totalLabel(cards: readonly Card[], blackjack = false): string {
  if (blackjack) return 'BJ';
  const t = handTotal(cards);
  if (t.soft && t.total < 21) return `${t.total - 10}/${t.total}`;
  return String(t.total);
}

/** Blackjack = Asso + carta da 10 come PRIME due carte, e non dopo una divisione. */
export function isBlackjack(cards: readonly Card[], fromSplit = false): boolean {
  return !fromSplit && cards.length === 2 && handTotal(cards).total === 21;
}

export function isBust(cards: readonly Card[]): boolean {
  return handTotal(cards).total > 21;
}

/** S17: il banco pesca sotto 17 e sta su ogni 17, soft compreso. */
export function dealerShouldHit(cards: readonly Card[]): boolean {
  return handTotal(cards).total < 17;
}

/** Il banco sbircia la coperta con Asso o carta da 10 scoperti. */
export function dealerPeeks(up: Card): boolean {
  return up.rank === 1 || cardValue(up) === 10;
}

export const MAX_HANDS = 3;

export function insuranceCost(bet: number): number {
  return Math.floor(bet / 2);
}

// ═══════════════════════════════════════════════ PAGAMENTI

export type HandResult = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

/**
 * Esito e vincita LORDA (puntata compresa) di una mano del giocatore
 * contro la mano finale del banco.
 */
export function settleHand(
  player: readonly Card[],
  bet: number,
  dealer: readonly Card[],
  fromSplit = false
): { result: HandResult; payout: number } {
  const pBJ = isBlackjack(player, fromSplit);
  const dBJ = isBlackjack(dealer);
  if (isBust(player)) return { result: 'bust', payout: 0 };
  if (pBJ && dBJ) return { result: 'push', payout: bet };
  if (pBJ) return { result: 'blackjack', payout: bet + Math.round(bet * 1.5) };
  if (dBJ) return { result: 'lose', payout: 0 };
  const p = handTotal(player).total;
  const d = handTotal(dealer).total;
  if (d > 21 || p > d) return { result: 'win', payout: bet * 2 };
  if (p === d) return { result: 'push', payout: bet };
  return { result: 'lose', payout: 0 };
}

/** L'assicurazione paga 2:1 se il banco ha blackjack: lordo = 3 x posta. */
export function insurancePayout(stake: number, dealerBlackjack: boolean): number {
  return dealerBlackjack ? stake * 3 : 0;
}

// ═══════════════════════════════════════════════ LA MANO

export interface PlayerHand {
  cards: Card[];
  /** Puntata corrente della mano (raddoppiata se `doubled`). */
  bet: number;
  doubled: boolean;
  /** Nata da una divisione: un 21 a due carte non e' blackjack. */
  fromSplit: boolean;
  /** Assi divisi: una sola carta, poi la mano e' chiusa. */
  splitAces: boolean;
  done: boolean;
}

export type Phase = 'insurance' | 'player' | 'dealer' | 'done';

export interface Legal {
  hit: boolean;
  stand: boolean;
  double: boolean;
  split: boolean;
  insurance: boolean;
}

export interface HandOutcome {
  result: HandResult;
  payout: number;
  bet: number;
}

/**
 * Una mano di blackjack dall'inizio al saldo.
 *
 * Il motore NON tocca il portafoglio: dice quanto costa ogni mossa
 * (`hand.bet` per raddoppio e divisione, `insuranceCost` per
 * l'assicurazione) e la scena chiama `placeBet` PRIMA di invocarla. Se il
 * saldo non basta la mossa semplicemente non si fa.
 */
export class BlackjackRound {
  readonly hands: PlayerHand[];
  readonly dealer: Card[] = [];
  active = 0;
  phase: Phase = 'player';
  /** Posta dell'assicurazione (0 = rifiutata o non offerta). */
  insurance = 0;
  /** Vero se il banco ha sbirciato e ha blackjack. */
  dealerBlackjack = false;

  constructor(
    private shoe: Shoe,
    readonly baseBet: number
  ) {
    const p1 = shoe.draw();
    const d1 = shoe.draw();
    const p2 = shoe.draw();
    const d2 = shoe.draw();
    this.hands = [{ cards: [p1, p2], bet: baseBet, doubled: false, fromSplit: false, splitAces: false, done: false }];
    this.dealer.push(d1, d2);
    if (this.dealerUp.rank === 1 && insuranceCost(baseBet) > 0) this.phase = 'insurance';
    else this.afterInsurance();
  }

  /** Carta scoperta del banco (la prima). */
  get dealerUp(): Card {
    return this.dealer[0]!;
  }

  get hand(): PlayerHand {
    return this.hands[this.active]!;
  }

  /** Totale puntato sul tavolo (mani + assicurazione). */
  get totalWager(): number {
    return this.hands.reduce((a, h) => a + h.bet, 0) + this.insurance;
  }

  /** Assicurazione presa (la scena ha gia' scalato `insuranceCost`). */
  takeInsurance(): void {
    if (this.phase !== 'insurance') return;
    this.insurance = insuranceCost(this.baseBet);
    this.afterInsurance();
  }

  declineInsurance(): void {
    if (this.phase !== 'insurance') return;
    this.afterInsurance();
  }

  /** Sbirciata del banco, poi blackjack naturale del giocatore, poi si gioca. */
  private afterInsurance(): void {
    if (dealerPeeks(this.dealerUp) && isBlackjack(this.dealer)) {
      this.dealerBlackjack = true;
      this.hands[0]!.done = true;
      this.phase = 'done';
      return;
    }
    if (isBlackjack(this.hands[0]!.cards)) {
      this.hands[0]!.done = true;
      this.phase = 'done';
      return;
    }
    this.phase = 'player';
    this.autoClose();
  }

  legal(): Legal {
    const none = { hit: false, stand: false, double: false, split: false, insurance: false };
    if (this.phase === 'insurance') return { ...none, insurance: true };
    if (this.phase !== 'player') return none;
    const h = this.hand;
    const two = h.cards.length === 2;
    const sameValue = two && cardValue(h.cards[0]!) === cardValue(h.cards[1]!);
    return {
      hit: true,
      stand: true,
      double: two && !h.splitAces,
      split: sameValue && !h.splitAces && this.hands.length < MAX_HANDS,
      insurance: false,
    };
  }

  hit(): Card | null {
    if (!this.legal().hit) return null;
    const c = this.shoe.draw();
    this.hand.cards.push(c);
    this.autoClose();
    return c;
  }

  stand(): void {
    if (!this.legal().stand) return;
    this.hand.done = true;
    this.advance();
  }

  /** Raddoppio: puntata x2, UNA sola carta, mano chiusa. */
  double(): Card | null {
    if (!this.legal().double) return null;
    const h = this.hand;
    h.bet *= 2;
    h.doubled = true;
    const c = this.shoe.draw();
    h.cards.push(c);
    h.done = true;
    this.advance();
    return c;
  }

  /**
   * Divisione: la seconda carta diventa una mano nuova subito a destra,
   * con la stessa puntata; ogni mano riceve la sua seconda carta.
   * Restituisce le due carte estratte (prima per la mano corrente).
   */
  split(): [Card, Card] | null {
    if (!this.legal().split) return null;
    const h = this.hand;
    const aces = h.cards[0]!.rank === 1;
    const moved = h.cards.pop()!;
    const fresh: PlayerHand = { cards: [moved], bet: h.bet, doubled: false, fromSplit: true, splitAces: aces, done: false };
    h.fromSplit = true;
    h.splitAces = aces;
    this.hands.splice(this.active + 1, 0, fresh);
    const c1 = this.shoe.draw();
    const c2 = this.shoe.draw();
    h.cards.push(c1);
    fresh.cards.push(c2);
    if (aces) {
      // Assi divisi: una carta ciascuno e basta.
      h.done = true;
      fresh.done = true;
      this.advance();
    } else {
      this.autoClose();
    }
    return [c1, c2];
  }

  /** Chiude da sola la mano a 21 o sballata, e passa alla successiva. */
  private autoClose(): void {
    const h = this.hand;
    if (!h.done && handTotal(h.cards).total >= 21) h.done = true;
    if (h.done) this.advance();
  }

  private advance(): void {
    while (this.active < this.hands.length && this.hands[this.active]!.done) {
      this.active++;
      // La mano successiva potrebbe essere gia' a 21 (es. divisione 10+A).
      const next = this.hands[this.active];
      if (next && !next.done && handTotal(next.cards).total >= 21) next.done = true;
    }
    if (this.active >= this.hands.length) {
      this.active = this.hands.length - 1;
      this.phase = 'dealer';
    }
  }

  /** Il banco deve pescare solo se resta in gioco almeno una mano "normale". */
  get dealerMustPlay(): boolean {
    return this.hands.some((h) => !isBust(h.cards) && !isBlackjack(h.cards, h.fromSplit));
  }

  /**
   * Gioco del banco (S17). Restituisce le carte pescate, in ordine, per
   * l'animazione. Con tutte le mani sballate il banco scopre e basta.
   */
  playDealer(): Card[] {
    if (this.phase !== 'dealer') return [];
    const drawn: Card[] = [];
    if (this.dealerMustPlay) {
      while (dealerShouldHit(this.dealer)) {
        const c = this.shoe.draw();
        this.dealer.push(c);
        drawn.push(c);
      }
    }
    this.phase = 'done';
    return drawn;
  }

  /** Uscita a mano aperta: rifiuta l'assicurazione, sta su ogni mano, gioca il banco. */
  forceFinish(): void {
    if (this.phase === 'insurance') this.declineInsurance();
    while (this.phase === 'player') this.stand();
    if (this.phase === 'dealer') this.playDealer();
  }

  /** Esiti delle mani (valido a fase 'done'). */
  outcomes(): HandOutcome[] {
    return this.hands.map((h) => ({ ...settleHand(h.cards, h.bet, this.dealer, h.fromSplit), bet: h.bet }));
  }

  insuranceReturn(): number {
    return insurancePayout(this.insurance, isBlackjack(this.dealer));
  }

  /** Vincita lorda totale della giocata (mani + assicurazione). */
  totalPayout(): number {
    return this.outcomes().reduce((a, o) => a + o.payout, 0) + this.insuranceReturn();
  }
}
