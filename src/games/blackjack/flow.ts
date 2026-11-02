/**
 * THE ROYAL MIRAGE — Blackjack: contabilita' e disposizione del tavolo
 *
 * La parte della scena che NON e' grafica, tenuta pura per poterla
 * provare nei test senza Pixi:
 *
 *   · quanto costa una mossa (raddoppio, divisione, assicurazione) — la
 *     scena deve scalare le fiche PRIMA di chiedere la mossa al motore,
 *     e il costo va letto dalla mano attiva, non da una copia
 *   · cosa si salda a fine mano — un'unica coppia (giocato, vincita lorda)
 *   · dove stanno le mani sul feltro quando una divisione le moltiplica
 */

import { type BlackjackRound, insuranceCost } from './rules';

export type PaidMove = 'double' | 'split' | 'insurance';

/**
 * Fiche da scalare per una mossa a pagamento, o 0 se la mossa ora non e'
 * legale. Raddoppio e divisione costano la puntata CORRENTE della mano
 * attiva (dopo una divisione e' quella della mano divisa, non la puntata
 * iniziale); l'assicurazione meta' della puntata iniziale.
 */
export function moveCost(round: BlackjackRound, move: PaidMove): number {
  const legal = round.legal();
  switch (move) {
    case 'double':
      return legal.double ? round.hand.bet : 0;
    case 'split':
      return legal.split ? round.hand.bet : 0;
    case 'insurance':
      return legal.insurance ? insuranceCost(round.baseBet) : 0;
  }
}

/**
 * Il saldo di fine mano: tutto cio' che e' uscito (mani, raddoppi,
 * divisioni, assicurazione) contro tutto cio' che torna (mani vinte o
 * pareggiate, assicurazione pagata). Valido solo a fase 'done': chi lo
 * chiama a mano aperta deve prima chiudere la mano con `forceFinish`.
 */
export function settlement(round: BlackjackRound): { stake: number; payout: number } {
  return { stake: round.totalWager, payout: round.totalPayout() };
}

/** Distanza fra le mani divise sul feltro, in px di design. */
export const HAND_SPACING = 320;

/**
 * Ascisse delle mani del giocatore: centrate sul tavolo, in ordine da
 * sinistra a destra come l'array delle mani (la divisione inserisce la
 * mano nuova subito a DESTRA di quella divisa, ed e' cosi' che la si vede).
 */
export function handXs(n: number, center = 960, spacing = HAND_SPACING): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(center + (i - (n - 1) / 2) * spacing);
  return out;
}

/**
 * Posizione di ogni carta dentro una mano, relativa al centro della mano.
 * Ventaglio verso destra e leggermente in salita: si leggono gli indici
 * di tutte le carte anche quando si sovrappongono.
 */
export function fanOffsets(n: number, step = 46, rise = 6): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) out.push({ x: (i - (n - 1) / 2) * step, y: -i * rise });
  return out;
}

/** Le tre postazioni disegnate sul feltro, da sinistra a destra. */
export const SEATS = handXs(3);

/**
 * Su quali postazioni stanno `n` mani. La mano unica sta al centro; la
 * divisione la fa "allargare" verso destra, come fa il mazziere, e solo
 * alla terza mano si occupa anche la postazione di sinistra. Cosi' le
 * fiche di ogni mano cadono sempre su un cerchio disegnato nel feltro.
 */
export function seatXs(n: number): number[] {
  if (n <= 1) return [SEATS[1]!];
  if (n === 2) return [SEATS[1]!, SEATS[2]!];
  return SEATS.slice(0, 3);
}

/**
 * Etichetta del totale. Durante la mano una mano soft mostra entrambe le
 * letture ("7/17": il giocatore deve sapere che puo' ancora pescare); a
 * mano chiusa conta solo il totale effettivo.
 */
export function badgeLabel(total: { total: number; soft: boolean }, blackjack: boolean, final: boolean): string {
  if (blackjack) return 'BJ';
  if (!final && total.soft && total.total < 21) return `${total.total - 10}/${total.total}`;
  return String(total.total);
}
