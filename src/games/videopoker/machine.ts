/**
 * THE ROYAL MIRAGE — Video poker: lo stato della macchina
 *
 * Le regole (`rules.ts`) sanno valutare una mano; qui c'e' cio' che la
 * scena deve ricordare FRA un click e l'altro, tenuto puro per i test:
 *
 *   idle ──deal──▶ hold ──finish──▶ done ──deal──▶ hold ...
 *
 *   · le carte si tengono/rilasciano solo in 'hold'
 *   · `finish` pesca e valuta UNA volta: una seconda chiamata restituisce
 *     null, cosi' ne' un doppio click su "Pesca" ne' l'uscita a meta'
 *     animazione possono pescare (o pagare) due volte
 *
 * La puntata e' quella scelta nell'HUD, senza moltiplicatori di monete, ed
 * e' FISSATA alla distribuzione: cambiarla a mano aperta non cambia il premio.
 */

import { type Evaluation, type PokerHand, evaluate, payout } from './rules';

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
  phase: MachinePhase = 'idle';
  hand: PokerHand | null = null;
  held: boolean[] = [false, false, false, false, false];
  /** Puntata con cui e' stata distribuita la mano in corso. */
  private dealtStake = 1;

  /** Fiche giocate in una mano con la puntata `bet`: proprio quella. */
  stake(bet: number): number {
    return Math.max(0, Math.round(bet));
  }

  /** Nuova mano servita (la puntata e' gia' stata scalata dalla scena). */
  start(hand: PokerHand, bet: number): void {
    this.hand = hand;
    this.held = [false, false, false, false, false];
    this.dealtStake = this.stake(bet);
    this.phase = 'hold';
  }

  /** Tiene tutte le carte (modalita' "tocca per scartare"). */
  holdAll(): void {
    if (this.phase !== 'hold') return;
    this.held = [true, true, true, true, true];
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
    const stake = this.dealtStake;
    return { replaced, evaluation, win: payout(evaluation.rank, stake), stake };
  }
}
