/**
 * THE ROYAL MIRAGE — Video poker: lo stato della macchina
 *
 * Le regole (`rules.ts`) sanno valutare una mano; qui c'e' cio' che la
 * scena deve ricordare FRA un click e l'altro, tenuto puro per i test:
 *
 *   idle ──deal──▶ hold ──finish──▶ done ──deal──▶ hold ...
 *
 *   · le monete (1..5) si cambiano solo a macchina ferma
 *   · le carte si tengono/rilasciano solo in 'hold'
 *   · `finish` pesca e valuta UNA volta: una seconda chiamata restituisce
 *     null, cosi' ne' un doppio click su "Pesca" ne' l'uscita a meta'
 *     animazione possono pescare (o pagare) due volte
 *
 * Monete e valore della moneta sono FISSATI alla distribuzione: cambiare
 * la denominazione nell'HUD a mano aperta non deve cambiare il premio.
 */

import { type Evaluation, type PokerHand, MAX_COINS, evaluate, payout } from './rules';

export type MachinePhase = 'idle' | 'hold' | 'done';

export interface DrawResult {
  /** Indici delle carte sostituite (da animare). */
  replaced: number[];
  evaluation: Evaluation;
  /** Vincita lorda in fiche. */
  win: number;
  /** Fiche giocate nella mano. */
  stake: number;
}

export class VideoPokerMachine {
  coins = MAX_COINS;
  phase: MachinePhase = 'idle';
  hand: PokerHand | null = null;
  held: boolean[] = [false, false, false, false, false];
  /** Monete e valore con cui e' stata distribuita la mano in corso. */
  private dealt = { coins: MAX_COINS, denom: 1 };

  /** Puntata totale in fiche per un dato valore della moneta. */
  stake(denom: number): number {
    return this.coins * Math.max(0, Math.round(denom));
  }

  get canChangeCoins(): boolean {
    return this.phase !== 'hold';
  }

  /** "Punta 1": una moneta in piu', da 5 si torna a 1 (come sulle macchine vere). */
  betOne(): void {
    if (!this.canChangeCoins) return;
    this.coins = this.coins >= MAX_COINS ? 1 : this.coins + 1;
  }

  betMax(): void {
    if (!this.canChangeCoins) return;
    this.coins = MAX_COINS;
  }

  /** Nuova mano servita (la puntata e' gia' stata scalata dalla scena). */
  start(hand: PokerHand, denom: number): void {
    this.hand = hand;
    this.held = [false, false, false, false, false];
    this.dealt = { coins: this.coins, denom: Math.round(denom) };
    this.phase = 'hold';
  }

  /** Tiene/rilascia una carta. Falso se ora non si puo'. */
  toggle(i: number): boolean {
    if (this.phase !== 'hold' || i < 0 || i > 4) return false;
    this.held[i] = !this.held[i];
    return true;
  }

  /** Valutazione della mano COSI' COM'E' (anteprima durante la scelta). */
  preview(): Evaluation | null {
    return this.hand ? evaluate(this.hand.cards) : null;
  }

  /** Pesca le carte non tenute, valuta e calcola il premio. Una volta sola. */
  finish(): DrawResult | null {
    if (this.phase !== 'hold' || !this.hand) return null;
    const replaced = this.hand.draw(this.held);
    const evaluation = evaluate(this.hand.cards);
    this.phase = 'done';
    const { coins, denom } = this.dealt;
    return { replaced, evaluation, win: payout(evaluation.rank, coins, denom), stake: coins * denom };
  }
}
