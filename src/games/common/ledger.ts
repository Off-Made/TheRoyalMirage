/**
 * THE ROYAL MIRAGE — Registro della giocata aperta
 *
 * La garanzia «una vincita non viene accreditata due volte» non puo'
 * dipendere dalla disciplina di ogni singola scena: con otto giochi, ognuno
 * con i suoi timer e le sue animazioni che continuano a girare durante la
 * transizione d'uscita, prima o poi una scena se ne dimentica (e la slot lo
 * aveva gia' fatto). Questo registro rende il doppio accredito impossibile
 * per costruzione:
 *
 *   open(stake)  → apre la giocata, o aggiunge un costo a quella aperta
 *   close()      → la chiude UNA volta; le chiamate successive restituiscono
 *                  null e chi le riceve non deve accreditare nulla
 *
 * Puro (niente Pixi, niente store) proprio per poterlo testare.
 */

export interface ClosedRound {
  /** Fiche effettivamente uscite nella giocata (puntata + raddoppi + ...). */
  stake: number;
}

export class RoundLedger {
  private openStake = 0;
  private isOpen = false;

  /** Vero fra la prima puntata e la chiusura. */
  get open(): boolean {
    return this.isOpen;
  }

  /** Fiche gia' uscite nella giocata aperta (0 se chiusa). */
  get stake(): number {
    return this.openStake;
  }

  /** Registra fiche uscite. La prima chiamata apre la giocata. */
  add(amount: number): void {
    this.isOpen = true;
    this.openStake += amount;
  }

  /**
   * Chiude la giocata. Restituisce null se era gia' chiusa: e' il segnale
   * che QUESTO accredito e' un doppione e va scartato.
   */
  close(): ClosedRound | null {
    if (!this.isOpen) return null;
    const closed = { stake: this.openStake };
    this.isOpen = false;
    this.openStake = 0;
    return closed;
  }
}
