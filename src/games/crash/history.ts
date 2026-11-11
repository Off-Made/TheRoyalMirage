/**
 * Tabellone dei voli passati del Golden Chip.
 *
 * Ogni voce ricorda DUE cose: dove il volo si e' schiantato (dato pubblico,
 * verificabile col seme rivelato) e se il giocatore aveva incassato. Il colore
 * della pillola dipende solo dall'esito del giocatore: verde se ha incassato
 * (ha vinto), rosso se il volo e' caduto con la puntata ancora in gioco.
 *
 * Prima il colore dipendeva da una soglia fissa sul crash (>= ×2 verde), e un
 * incasso a ×1,20 su un volo caduto a ×1,50 compariva rosso pur essendo vinto.
 */
export interface FlightRecord {
  /** Punto di schianto del volo, in centesimi di moltiplicatore (×1,98 = 198). */
  crash: number;
  /** Moltiplicatore incassato in centesimi, o null se il volo e' caduto prima. */
  cashedAt: number | null;
}

export type FlightTone = 'win' | 'loss';

export function flightTone(r: FlightRecord): FlightTone {
  return r.cashedAt !== null ? 'win' : 'loss';
}
