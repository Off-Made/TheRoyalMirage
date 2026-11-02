/**
 * THE ROYAL MIRAGE — Regole del baccarat (Punto Banco)
 *
 * Modulo puro, senza Pixi: lo usano la scena e i test.
 *
 * ── Il gioco in una riga ──
 * Due mani, PUNTO e BANCO, ricevono due carte ciascuna; vince la mano il
 * cui totale (somma dei valori MODULO 10) e' piu' vicino a 9. Il giocatore
 * non decide nulla oltre alla puntata: le terze carte seguono una tabella
 * fissa ("tableau"), identica in ogni casino del mondo. E' proprio questa
 * rigidita' a rendere il baccarat il gioco dei grandi tavoli: nessun
 * errore del giocatore puo' peggiorare il vantaggio della casa.
 *
 * ── Valori ──
 *   Asso = 1 · 2..9 = valore facciale · 10, J, Q, K = 0
 *   totale = somma mod 10   (7 + 8 = 15 → 5)
 *
 * ── Ordine di distribuzione ──
 *   Punto, Banco, Punto, Banco; poi l'eventuale terza del Punto e infine
 *   l'eventuale terza del Banco. Lo rispettiamo alla lettera perche' con
 *   un sabot reale l'ordine decide QUALI carte riceve ciascuna mano.
 *
 * ── Naturale ──
 *   Se una delle due mani fa 8 o 9 con le prime due carte ("naturale"),
 *   nessuno pesca e si confrontano i totali.
 *
 * ── Terza carta del Punto ──
 *   0–5 pesca · 6–7 sta.
 *
 * ── Terza carta del Banco ──
 *   Se il Punto e' stato (nessuna terza carta): il Banco pesca su 0–5 e
 *   sta su 6–7, come il Punto. Altrimenti decide il valore della TERZA
 *   CARTA del Punto (p):
 *     Banco 0–2  pesca sempre
 *     Banco 3    pesca, salvo p = 8
 *     Banco 4    pesca se p = 2..7
 *     Banco 5    pesca se p = 4..7
 *     Banco 6    pesca se p = 6..7
 *     Banco 7    sta
 *
 * ── Pagamenti (vincita LORDA, posta inclusa) ──
 *   Punto     1:1                     → 2 × posta
 *   Banco     1:1 meno 5% commissione → posta + posta − commissione
 *   Pareggio  8:1                     → 9 × posta
 *   Col pareggio le puntate su Punto e Banco sono restituite (push).
 *
 * ── La commissione in fiche intere ──
 * Il portafoglio conta solo fiche intere. La commissione del 5% viene
 * arrotondata ALLA FICHE PIU' VICINA (`Math.round(posta × 0,05)`): su 20
 * fiche e' esattamente 1, su 10 fiche (0,5) diventa 1, su 1–9 fiche (meno
 * di mezza fiche) e' 0. E' la scelta piu' onesta possibile: l'errore medio
 * di arrotondamento e' nullo, e una vincita sul Banco paga sempre qualcosa
 * (con `floor(0,95 × posta)` una posta da 1 vincerebbe... zero). Il
 * vantaggio della casa nominale (1,06% sul Banco) e' esatto per poste
 * multiple di 20; le poste minime sono lievemente a favore del giocatore.
 */

import type { Card } from '@/games/cards/card';

export type Side = 'P' | 'B';
export type Outcome = 'P' | 'B' | 'T';
export type BetArea = 'player' | 'banker' | 'tie';

export const AREAS: readonly BetArea[] = ['player', 'tie', 'banker'];

/** Valore di una carta nel baccarat: figure e 10 valgono zero. */
export function cardValue(c: Card): number {
  return c.rank >= 10 ? 0 : c.rank;
}

/** Totale di una mano: somma dei valori modulo 10. */
export function handTotal(cs: readonly Card[]): number {
  let t = 0;
  for (const c of cs) t += cardValue(c);
  return t % 10;
}

/** Naturale: 8 o 9 con le prime due carte. */
export function isNatural(cs: readonly Card[]): boolean {
  return cs.length === 2 && handTotal(cs) >= 8;
}

/** Il Punto pesca su 0–5, sta su 6–7 (8–9 sono naturali, gestiti prima). */
export function playerDraws(playerTotal: number): boolean {
  return playerTotal <= 5;
}

/**
 * Il tableau del Banco.
 * `playerThird` = VALORE (0–9) della terza carta del Punto, o null se il
 * Punto e' stato con due carte.
 */
export function bankerDraws(bankerTotal: number, playerThird: number | null): boolean {
  if (playerThird === null) return bankerTotal <= 5;
  const p = playerThird;
  switch (bankerTotal) {
    case 0:
    case 1:
    case 2:
      return true;
    case 3:
      return p !== 8;
    case 4:
      return p >= 2 && p <= 7;
    case 5:
      return p >= 4 && p <= 7;
    case 6:
      return p === 6 || p === 7;
    default:
      return false;
  }
}

export interface Coup {
  player: Card[];
  banker: Card[];
  playerTotal: number;
  bankerTotal: number;
  winner: Outcome;
  /** Vero se almeno una mano ha fatto un naturale (8/9 con due carte). */
  natural: boolean;
  /** Sequenza di distribuzione: a chi va ogni carta, in ordine. */
  order: Side[];
}

/**
 * Gioca un colpo completo pescando dalla funzione `draw` (di solito
 * `() => shoe.draw()`). L'esito e' interamente determinato qui, prima di
 * qualunque animazione: la scena si limita a "recitarlo".
 */
export function playCoup(draw: () => Card): Coup {
  const player: Card[] = [];
  const banker: Card[] = [];
  const order: Side[] = [];
  const give = (side: Side) => {
    (side === 'P' ? player : banker).push(draw());
    order.push(side);
  };
  give('P');
  give('B');
  give('P');
  give('B');

  const natural = isNatural(player) || isNatural(banker);
  if (!natural) {
    let playerThird: number | null = null;
    if (playerDraws(handTotal(player))) {
      give('P');
      playerThird = cardValue(player[2]!);
    }
    if (bankerDraws(handTotal(banker), playerThird)) give('B');
  }

  const playerTotal = handTotal(player);
  const bankerTotal = handTotal(banker);
  const winner: Outcome = playerTotal > bankerTotal ? 'P' : bankerTotal > playerTotal ? 'B' : 'T';
  return { player, banker, playerTotal, bankerTotal, winner, natural, order };
}

// ─────────────────────────────────────────────── PAGAMENTI

export type Bets = Record<BetArea, number>;

export const emptyBets = (): Bets => ({ player: 0, banker: 0, tie: 0 });

export function totalBet(b: Bets): number {
  return b.player + b.banker + b.tie;
}

/** Commissione del 5% sulla vincita del Banco, arrotondata alla fiche piu' vicina. */
export function bankerCommission(bet: number): number {
  return Math.round(bet * 0.05);
}

/** Vincita lorda di UNA puntata dato l'esito del colpo. */
export function areaPayout(area: BetArea, bet: number, winner: Outcome): number {
  if (bet <= 0) return 0;
  switch (area) {
    case 'player':
      return winner === 'P' ? bet * 2 : winner === 'T' ? bet : 0;
    case 'banker':
      return winner === 'B' ? bet * 2 - bankerCommission(bet) : winner === 'T' ? bet : 0;
    case 'tie':
      return winner === 'T' ? bet * 9 : 0;
  }
}

/** Vincita lorda totale di tutte le puntate del colpo. */
export function payout(b: Bets, winner: Outcome): number {
  return areaPayout('player', b.player, winner) + areaPayout('banker', b.banker, winner) + areaPayout('tie', b.tie, winner);
}

// ─────────────────────────────────────────────── SEGNAPUNTI

export interface RoadCell {
  col: number;
  row: number;
  winner: Side;
  /** Pareggi avvenuti DOPO questa mano (o prima della prima, sulla prima cella). */
  ties: number;
}

/**
 * BIG ROAD — il segnapunti classico dei tavoli di baccarat.
 *
 * Ogni vincita e' un cerchio vuoto (rosso Banco, blu Punto). Le vincite
 * consecutive dello stesso lato scendono nella stessa colonna; un cambio
 * di lato apre una colonna nuova in alto, a destra dell'INIZIO della serie
 * precedente. I pareggi non occupano celle: si segnano con una barretta
 * verde sull'ultima cella (con il numero se sono piu' d'uno).
 *
 * La "coda del drago": quando una serie arriva in fondo alla colonna (6
 * righe) o trova la cella sotto gia' occupata, prosegue verso DESTRA sulla
 * stessa riga, e da li' continua orizzontalmente finche' la serie dura.
 * La colonna della serie successiva resta comunque quella accanto
 * all'inizio della serie; se la sua prima cella e' gia' presa da una coda,
 * si slitta alla prima colonna libera.
 */
export function bigRoad(results: readonly Outcome[], rows = 6): RoadCell[] {
  const cells: RoadCell[] = [];
  const taken = new Set<string>();
  const key = (c: number, r: number) => `${c},${r}`;
  let leadingTies = 0;
  let streakCol = -1;
  let tailing = false;

  for (const res of results) {
    const last = cells[cells.length - 1];
    if (res === 'T') {
      if (last) last.ties++;
      else leadingTies++;
      continue;
    }
    let col: number;
    let row: number;
    if (!last) {
      col = 0;
      row = 0;
      streakCol = 0;
    } else if (res === last.winner) {
      const below = last.row + 1;
      if (!tailing && below < rows && !taken.has(key(last.col, below))) {
        col = last.col;
        row = below;
      } else {
        col = last.col + 1;
        row = last.row;
        tailing = true;
      }
    } else {
      col = streakCol + 1;
      while (taken.has(key(col, 0))) col++;
      row = 0;
      streakCol = col;
      tailing = false;
    }
    const cell: RoadCell = { col, row, winner: res, ties: 0 };
    if (cells.length === 0) cell.ties = leadingTies;
    cells.push(cell);
    taken.add(key(col, row));
  }
  return cells;
}

/**
 * BEAD PLATE — un pallino pieno per OGNI colpo (pareggi compresi), in
 * ordine, riempiendo le colonne dall'alto verso il basso.
 */
export function beadPlate(results: readonly Outcome[], rows = 6): { col: number; row: number; outcome: Outcome }[] {
  return results.map((outcome, i) => ({ col: Math.floor(i / rows), row: i % rows, outcome }));
}
