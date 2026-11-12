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
 * unita' di puntata: e' la versione "full pay", la piu' generosa in circolazione.
 * Con strategia ottimale l'RTP e' 99,54%.
 *
 * ── Niente monete: la puntata e' la giocata ──
 * Le macchine vere fanno puntare da 1 a 5 "monete" e il campo puntata vale
 * UNA moneta: chi scrive 1 € ne gioca 5 senza accorgersene. Qui no: la
 * puntata scelta e' esattamente cio' che si gioca, e la tabella paga in
 * multipli della puntata. La Scala Reale paga 800×, cioe' il valore "a
 * 5 monete" (4000 / 5): cosi' l'RTP resta 99,54% a qualunque puntata,
 * senza la trappola del "gioca sempre il massimo".
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

/** Pagamento in multipli della puntata (vincita lorda). */
export const PAYS: Record<HandRank, number> = {
  royalFlush: 800,
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

/** RTP teorico con strategia ottimale. */
export const RTP = 99.54;

/**
 * Vincita lorda in fiche: moltiplicatore x puntata.
 * Gia' intera per costruzione (interi per interi): nessun arrotondamento.
 * "Lorda" come vuole `settle`: Jacks or Better paga 1 per 1, cioe' la
 * puntata torna indietro e basta.
 */
export function payout(rank: HandRank, stake: number): number {
  return PAYS[rank] * Math.max(0, Math.round(stake));
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
