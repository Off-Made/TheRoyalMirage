/**
 * THE ROYAL MIRAGE — Regole del video poker (Jacks or Better 9/6)
 *
 * Modulo puro, senza Pixi: i test lo importano direttamente.
 *
 * ── La macchina ──
 * Un mazzo da 52 carte, mescolato DA CAPO a ogni mano (come le macchine
 * vere: nessuna memoria fra una mano e l'altra, quindi nessun conteggio
 * possibile). Si ricevono 5 carte, si scelgono quelle da tenere, le altre
 * vengono sostituite dalle carte successive dello STESSO mazzo — quelle
 * scartate non possono rientrare.
 *
 * ── "9/6" ──
 * Il nome della paytable viene dai pagamenti di Full (9) e Colore (6) per
 * moneta: e' la versione "full pay", la piu' generosa in circolazione.
 * Con strategia ottimale e 5 monete l'RTP e' 99,54%.
 *
 * ── La Scala Reale e le 5 monete ──
 * Unica eccezione alla linearita': con 1-4 monete la Scala Reale paga 250
 * per moneta, con 5 monete paga 4000 (cioe' 800 per moneta). E' il motivo
 * per cui ogni manuale dice "gioca sempre il massimo": a meno di 5 monete
 * l'RTP scende a ~98,4%. Il registry dichiara 99,5 — vero SOLO a 5 monete,
 * e le regole a schermo lo dicono esplicitamente.
 */

import type { Rng } from '@/games/slots/engine/rng';
import { type Card, makeDeck, shuffleInPlace } from '@/games/cards/card';

export type HandRank =
  | 'royalFlush'
  | 'straightFlush'
  | 'fourKind'
  | 'fullHouse'
  | 'flush'
  | 'straight'
  | 'threeKind'
  | 'twoPair'
  | 'jacksOrBetter'
  | 'nothing';

/** Ordine della paytable a schermo, dalla mano piu' alta alla piu' bassa. */
export const PAY_ORDER: readonly Exclude<HandRank, 'nothing'>[] = [
  'royalFlush',
  'straightFlush',
  'fourKind',
  'fullHouse',
  'flush',
  'straight',
  'threeKind',
  'twoPair',
  'jacksOrBetter',
];

/** Pagamento per moneta (Scala Reale: valore sotto le 5 monete). */
export const PAY_PER_COIN: Record<HandRank, number> = {
  royalFlush: 250,
  straightFlush: 50,
  fourKind: 25,
  fullHouse: 9,
  flush: 6,
  straight: 4,
  threeKind: 3,
  twoPair: 2,
  jacksOrBetter: 1,
  nothing: 0,
};

export const MAX_COINS = 5;
/** Scala Reale a 5 monete: 4000 in totale (800 per moneta). */
export const ROYAL_MAX_BET = 4000;
/** RTP teorico con strategia ottimale a 5 monete. */
export const RTP_MAX_BET = 99.54;

/**
 * Valore in MONETE di una mano: quante monete paga la combinazione
 * giocando `coins` monete (1..5). E' il numero stampato nella paytable.
 */
export function coinsWon(rank: HandRank, coins: number): number {
  const c = Math.max(1, Math.min(MAX_COINS, Math.floor(coins)));
  if (rank === 'royalFlush' && c === MAX_COINS) return ROYAL_MAX_BET;
  return PAY_PER_COIN[rank] * c;
}

/**
 * Vincita lorda in fiche: monete vinte x valore della moneta.
 * Gia' intera per costruzione (interi per interi): nessun arrotondamento.
 * "Lorda" come vuole `settle`: Jacks or Better paga 1 per 1, cioe' la
 * puntata torna indietro e basta.
 */
export function payout(rank: HandRank, coins: number, denom: number): number {
  return coinsWon(rank, coins) * Math.max(0, Math.round(denom));
}

/** Valore per l'ordinamento: Asso alto (14). */
function high(rank: number): number {
  return rank === 1 ? 14 : rank;
}

export interface Evaluation {
  rank: HandRank;
  /**
   * Indici (0..4) delle carte che formano la combinazione: la scena le
   * illumina. Per scale, colori e full sono tutte e cinque.
   */
  cards: number[];
}

/** Classifica una mano di 5 carte. */
export function evaluate(hand: readonly Card[]): Evaluation {
  if (hand.length !== 5) throw new Error('Una mano di video poker ha 5 carte');
  const all = [0, 1, 2, 3, 4];

  const byRank = new Map<number, number[]>();
  hand.forEach((c, i) => {
    const r = high(c.rank);
    byRank.set(r, [...(byRank.get(r) ?? []), i]);
  });
  // Gruppi ordinati per numerosita', poi per valore: [[3 carte], [2 carte]] = full.
  const groups = [...byRank.entries()].sort((a, b) => b[1].length - a[1].length || b[0] - a[0]);

  const flush = hand.every((c) => c.suit === hand[0]!.suit);
  const values = [...byRank.keys()].sort((a, b) => a - b);
  let straight = false;
  let royal = false;
  if (values.length === 5) {
    if (values[4]! - values[0]! === 4) straight = true;
    // Scala bassa A-2-3-4-5 ("ruota"): l'Asso conta 1. NON esiste invece
    // la scala che "gira" (Q-K-A-2-3): l'Asso sta solo in cima o in fondo.
    else if (values.join(',') === '2,3,4,5,14') straight = true;
    royal = straight && values[0] === 10;
  }

  if (straight && flush) return { rank: royal ? 'royalFlush' : 'straightFlush', cards: all };
  const [g1, g2] = groups;
  if (g1![1].length === 4) return { rank: 'fourKind', cards: g1![1] };
  if (g1![1].length === 3 && g2![1].length === 2) return { rank: 'fullHouse', cards: all };
  if (flush) return { rank: 'flush', cards: all };
  if (straight) return { rank: 'straight', cards: all };
  if (g1![1].length === 3) return { rank: 'threeKind', cards: g1![1] };
  if (g1![1].length === 2 && g2![1].length === 2) return { rank: 'twoPair', cards: [...g1![1], ...g2![1]].sort() };
  // Coppia: paga solo se di Fanti o superiore (J, Q, K, A → 11..14).
  if (g1![1].length === 2 && g1![0] >= 11) return { rank: 'jacksOrBetter', cards: g1![1] };
  return { rank: 'nothing', cards: [] };
}

/**
 * Una mano in corso: il mazzo mescolato e le 5 carte servite.
 * `draw(held)` sostituisce le carte NON tenute con le successive del mazzo.
 */
export class PokerHand {
  private deck: Card[];
  cards: Card[];

  constructor(rng: Rng) {
    this.deck = shuffleInPlace(makeDeck(), rng);
    this.cards = this.deck.splice(0, 5);
  }

  /** Solo test/sviluppo: mano e prossime carte decise a mano. */
  static rigged(hand: Card[], next: Card[] = []): PokerHand {
    const h = Object.create(PokerHand.prototype) as PokerHand;
    h.cards = [...hand];
    h.deck = [...next];
    return h;
  }

  /** Sostituisce le carte non tenute. Restituisce gli indici sostituiti. */
  draw(held: readonly boolean[]): number[] {
    const replaced: number[] = [];
    for (let i = 0; i < 5; i++) {
      if (held[i]) continue;
      const c = this.deck.shift();
      if (!c) throw new Error('Mazzo esaurito');
      this.cards[i] = c;
      replaced.push(i);
    }
    return replaced;
  }
}
