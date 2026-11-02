/**
 * THE ROYAL MIRAGE — Baccarat: il tappeto delle puntate e il copione del colpo
 *
 * La parte della scena che non e' grafica, pura per poterla provare:
 *
 *   · `BetBoard` — le fiche posate su Punto, Banco e Pareggio PRIMA della
 *     distribuzione. Non toccano il portafoglio: si scala tutto insieme,
 *     una volta sola, quando si preme "Distribuisci". Per questo la tavola
 *     deve impedire di posare piu' fiche di quante se ne hanno: altrimenti
 *     il giocatore costruirebbe una puntata che poi viene rifiutata in blocco.
 *   · `recital` — l'ordine in cui la scena "recita" un colpo gia' deciso
 *     da `playCoup`: carta per carta, nell'ordine reale del tavolo.
 *   · `roadWindow` — quale porzione di un segnapunti piu' lungo del pannello
 *     mostrare (le ultime colonne, come i tabelloni veri che scorrono).
 */

import type { Card } from '@/games/cards/card';
import { type BetArea, type Bets, type Coup, type Side, emptyBets, totalBet } from './rules';

export type AddResult = 'ok' | 'insufficient' | 'invalid';

export class BetBoard {
  bets: Bets = emptyBets();
  /** Puntate dell'ultimo colpo giocato, per "Ripeti". */
  last: Bets | null = null;

  get total(): number {
    return totalBet(this.bets);
  }

  get empty(): boolean {
    return this.total === 0;
  }

  /**
   * Posa `amount` fiche su un'area. `available` = saldo attuale: il totale
   * sul tappeto non puo' superarlo.
   */
  add(area: BetArea, amount: number, available: number): AddResult {
    const n = Math.round(amount);
    if (!Number.isFinite(n) || n <= 0) return 'invalid';
    if (this.total + n > available) return 'insufficient';
    this.bets = { ...this.bets, [area]: this.bets[area] + n };
    return 'ok';
  }

  /** Ritira tutte le fiche. Restituisce quante erano. */
  clear(): number {
    const t = this.total;
    this.bets = emptyBets();
    return t;
  }

  /** Ripropone le puntate del colpo precedente, se il saldo le copre. */
  rebet(available: number): 'ok' | 'none' | 'insufficient' {
    if (!this.last || totalBet(this.last) === 0) return 'none';
    if (totalBet(this.last) > available) return 'insufficient';
    this.bets = { ...this.last };
    return 'ok';
  }

  /**
   * Le fiche passano dal tappeto al colpo: la tavola si svuota e ricorda
   * cosa c'era per "Ripeti". Restituisce le puntate del colpo.
   */
  commit(): Bets {
    const b = { ...this.bets };
    this.last = b;
    this.bets = emptyBets();
    return b;
  }
}

export interface RecitalStep {
  side: Side;
  /** Posizione della carta nella sua mano (0, 1 o 2 = terza carta). */
  slot: number;
  card: Card;
}

/**
 * Il copione di un colpo: a chi va ogni carta, in ordine. Segue
 * `coup.order`, che `playCoup` registra mentre estrae dal sabot — e' la
 * sola garanzia che la carta mostrata al Punto sia quella che il sabot gli
 * ha dato davvero.
 */
export function recital(coup: Coup): RecitalStep[] {
  const next: Record<Side, number> = { P: 0, B: 0 };
  return coup.order.map((side) => {
    const slot = next[side]++;
    const card = (side === 'P' ? coup.player : coup.banker)[slot]!;
    return { side, slot, card };
  });
}

/**
 * Prima colonna da mostrare di un segnapunti con `usedCols` colonne in un
 * pannello che ne contiene `visibleCols`: si tengono in vista le ultime,
 * lasciando sempre una colonna libera a destra per la prossima serie.
 */
export function roadWindow(usedCols: number, visibleCols: number): number {
  return Math.max(0, usedCols + 1 - visibleCols);
}
