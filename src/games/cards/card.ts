/**
 * THE ROYAL MIRAGE — Carte e sabot
 *
 * Il modello puro delle carte da gioco, condiviso da blackjack, baccarat e
 * video poker. Nessuna dipendenza da Pixi: i test lo usano direttamente.
 *
 * ── Rappresentazione ──
 * Una carta e' una coppia { rank, suit } con rank 1..13 (Asso = 1, Fante =
 * 11, Donna = 12, Re = 13). Il VALORE della carta dipende dal gioco (nel
 * blackjack la figura vale 10, nel baccarat 0, nel poker conta l'ordine) e
 * quindi NON sta qui: ogni gioco ha la propria funzione di valore nelle sue
 * regole. Qui c'e' solo l'identita' della carta.
 *
 * ── Il sabot (shoe) ──
 * Ai tavoli veri si gioca da un sabot di N mazzi mescolati insieme, con una
 * CARTA DI TAGLIO inserita a una certa profondita' ("penetrazione"). Quando
 * il mazziere la incontra, la mano in corso si completa normalmente e il
 * sabot viene rimescolato PRIMA della mano successiva. E' esattamente cio'
 * che fa `Shoe`: `draw()` non rimescola mai a meta' mano, segnala soltanto
 * `cutReached`; e' la scena a chiamare `shuffleIfNeeded()` fra una mano e
 * l'altra. Rimescolare a meta' mano altererebbe le probabilita' della mano
 * stessa (e nessun casino lo fa).
 */

import type { Rng } from '@/games/slots/engine/rng';

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

/** Ordine canonico dei semi: picche, cuori, quadri, fiori. */
export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

/** Cuori e quadri sono rossi (rubino), picche e fiori neri (ossidiana). */
export function isRed(suit: Suit): boolean {
  return suit === 'H' || suit === 'D';
}

/** Etichetta d'angolo: A, 2..10, J, Q, K. */
export function rankLabel(rank: Rank): string {
  switch (rank) {
    case 1:
      return 'A';
    case 11:
      return 'J';
    case 12:
      return 'Q';
    case 13:
      return 'K';
    default:
      return String(rank);
  }
}

/** Identificativo stabile ('AS', '10H', 'QD'): chiave delle texture e dei test. */
export function cardId(c: Card): string {
  return `${rankLabel(c.rank)}${c.suit}`;
}

export function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

/**
 * Carta da notazione compatta: 'AS', 'TD' o '10D', 'QH', '7C'.
 * Comodissima nei test: `cards('AS KH')` si legge come una mano scritta.
 */
export function parseCard(s: string): Card {
  const t = s.trim().toUpperCase();
  const suit = t.slice(-1) as Suit;
  const r = t.slice(0, -1);
  if (!SUITS.includes(suit)) throw new Error(`Seme non valido: ${s}`);
  const map: Record<string, Rank> = { A: 1, T: 10, J: 11, Q: 12, K: 13 };
  const rank = (map[r] ?? Number(r)) as Rank;
  if (!RANKS.includes(rank)) throw new Error(`Valore non valido: ${s}`);
  return { rank, suit };
}

/** Elenco di carte separate da spazi: `cards('AS KH 5D')`. */
export function cards(s: string): Card[] {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map(parseCard);
}

/** Un mazzo francese da 52 carte, in ordine canonico. */
export function makeDeck(): Card[] {
  const out: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) out.push({ rank, suit });
  return out;
}

/**
 * Fisher-Yates in place con RNG iniettabile.
 * E' l'UNICO mescolamento uniforme semplice: le varianti "ingenue" (scambiare
 * ogni carta con una qualunque, o ordinare per chiave casuale) producono
 * permutazioni con probabilita' diverse fra loro.
 */
export function shuffleInPlace<T>(xs: T[], rng: Rng): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = xs[i]!;
    xs[i] = xs[j]!;
    xs[j] = tmp;
  }
  return xs;
}

export interface ShoeOptions {
  /** Numero di mazzi (6 al blackjack, 8 al baccarat). */
  decks: number;
  /**
   * Penetrazione: frazione del sabot giocata prima della carta di taglio.
   * 0.75 = si rimescola dopo tre quarti delle carte (tipico del blackjack).
   */
  penetration: number;
}

export class Shoe {
  readonly decks: number;
  readonly penetration: number;
  private cardsLeft: Card[] = [];
  /** Indice (in carte distribuite) dove sta la carta di taglio. */
  private cutAt = 0;
  private dealt = 0;
  /** Contatore dei rimescolamenti, utile alla UI (azzerare la Big Road). */
  shuffles = 0;
  /** Carte pre-impilate (solo test/sviluppo): escono prima del sabot. */
  private stack: Card[] = [];

  constructor(
    private rng: Rng,
    opts: ShoeOptions
  ) {
    this.decks = Math.max(1, Math.floor(opts.decks));
    this.penetration = Math.min(0.98, Math.max(0.2, opts.penetration));
    this.shuffle();
  }

  /** Carte totali di un sabot pieno. */
  get size(): number {
    return this.decks * 52;
  }

  /** Carte ancora nel sabot. */
  get remaining(): number {
    return this.cardsLeft.length;
  }

  /** Vero quando la carta di taglio e' uscita: rimescolare prima della prossima mano. */
  get cutReached(): boolean {
    return this.dealt >= this.cutAt;
  }

  /** Posizione della carta di taglio (carte distribuite prima del taglio). */
  get cutIndex(): number {
    return this.cutAt;
  }

  /** Ricompone N mazzi, mescola e reinserisce la carta di taglio. */
  shuffle(): void {
    const all: Card[] = [];
    for (let d = 0; d < this.decks; d++) all.push(...makeDeck());
    shuffleInPlace(all, this.rng);
    this.cardsLeft = all;
    this.dealt = 0;
    this.cutAt = Math.round(this.size * this.penetration);
    this.shuffles++;
  }

  /** Da chiamare FRA una mano e l'altra. True se ha rimescolato. */
  shuffleIfNeeded(): boolean {
    if (!this.cutReached) return false;
    this.shuffle();
    return true;
  }

  /**
   * Estrae una carta dalla cima. Non rimescola mai da sola a meta' mano:
   * se il sabot fosse davvero vuoto (impossibile con la penetrazione
   * limitata a 0.98 e mani di poche carte) ricompone un sabot nuovo per
   * non bloccare il gioco.
   */
  draw(): Card {
    const pre = this.stack.shift();
    if (pre) return pre;
    if (this.cardsLeft.length === 0) this.shuffle();
    this.dealt++;
    return this.cardsLeft.pop()!;
  }

  /**
   * Solo test/sviluppo: le prossime carte estratte saranno queste, in ordine.
   * Non tocca il sabot vero (le carte impilate si aggiungono "in piu'").
   */
  rig(next: Card[]): void {
    this.stack.push(...next);
  }

  /** Conteggio per valore e seme delle carte rimaste (test di composizione). */
  composition(): Map<string, number> {
    const m = new Map<string, number>();
    for (const c of this.cardsLeft) m.set(cardId(c), (m.get(cardId(c)) ?? 0) + 1);
    return m;
  }
}
