/**
 * THE ROYAL MIRAGE — Golden Chip: il freno di serie
 *
 * Modulo PURO (niente Pixi, niente DOM): la scena lo interroga prima del
 * decollo e lo aggiorna allo schianto; i test lo pilotano a mano.
 *
 * ── La regola ──
 * Se fra gli ultimi WINDOW voli almeno HITS si sono schiantati a ×10 o piu',
 * i BRAKED_FLIGHTS voli successivi hanno un TETTO: si schiantano al massimo a
 * ×1,50 (prima, se il seme lo decide). E' una scelta del committente: dopo
 * una serie di voli altissimi il banco "tira il fiato".
 *
 * ── Perche' non rompe l'equita' dimostrabile ──
 * Il tetto dipende SOLO da voli gia' conclusi e rivelati: e' noto prima del
 * decollo e pubblico. Il crash del volo resta  min(crash del seme, tetto),
 * e chiunque puo' ricalcolarlo dal seme rivelato e dal tetto dichiarato
 * (`verify` in fair.ts accetta `capCents`).
 *
 * Effetto sull'RTP: trascurabile. P(crash ≥ ×10) = 0,099, quindi tre voli
 * alti su quattro capitano in ~0,4% delle finestre.
 */

/** Da qui un volo e' "molto in alto": ×10,00, in centesimi. */
export const HIGH_CENTS = 1000;
/** Quanti voli recenti si guardano. */
export const WINDOW = 4;
/** Quanti di quelli devono essere alti per far scattare il freno. */
export const HITS = 3;
/** Quanti voli restano frenati. */
export const BRAKED_FLIGHTS = 2;
/** Tetto dei voli frenati: ×1,50. */
export const CAP_CENTS = 150;

export interface BrakeState {
  /** Crash effettivi degli ultimi voli (il piu' recente in fondo), in centesimi. */
  recent: number[];
  /** Voli frenati ancora da giocare. */
  left: number;
}

export function freshBrake(): BrakeState {
  return { recent: [], left: 0 };
}

/** Tetto del prossimo volo in centesimi, o null se il freno e' spento. */
export function capFor(s: BrakeState): number | null {
  return s.left > 0 ? CAP_CENTS : null;
}

/** Stato dopo un volo concluso a `crashCents` (crash effettivo, tetto compreso). */
export function afterFlight(s: BrakeState, crashCents: number): BrakeState {
  if (s.left > 0) {
    // I voli frenati non entrano nel conto: la serie che ha fatto scattare il
    // freno e' gia' stata "pagata", e si riparte da zero dopo.
    return { recent: [], left: s.left - 1 };
  }
  const recent = [...s.recent, crashCents].slice(-WINDOW);
  const high = recent.filter((c) => c >= HIGH_CENTS).length;
  if (high >= HITS) return { recent: [], left: BRAKED_FLIGHTS };
  return { recent, left: 0 };
}

/** Lettura difensiva di uno stato salvato: qualunque cosa strana → freno spento. */
export function parseBrake(raw: string | null): BrakeState {
  if (!raw) return freshBrake();
  try {
    const v = JSON.parse(raw) as Partial<BrakeState>;
    const recent = Array.isArray(v.recent)
      ? v.recent.filter((c): c is number => Number.isInteger(c) && c >= 100).slice(-WINDOW)
      : [];
    const left = Number.isInteger(v.left) ? Math.max(0, Math.min(BRAKED_FLIGHTS, v.left!)) : 0;
    return { recent, left };
  } catch {
    return freshBrake();
  }
}

/** Chiave di salvataggio: uscire e rientrare dal gioco non deve azzerare il freno. */
export const BRAKE_KEY = 'golden-oasis:crash-brake';

export function loadBrake(): BrakeState {
  try {
    return parseBrake(localStorage.getItem(BRAKE_KEY));
  } catch {
    return freshBrake();
  }
}

export function saveBrake(s: BrakeState): void {
  try {
    localStorage.setItem(BRAKE_KEY, JSON.stringify(s));
  } catch {
    /* archiviazione non disponibile: il freno vale per la sessione */
  }
}
