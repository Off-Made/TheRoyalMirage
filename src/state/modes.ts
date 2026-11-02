/**
 * THE ROYAL MIRAGE — Modalita' di gioco
 *
 * Ogni modalita' ha un PORTAFOGLIO SEPARATO. Altrimenti la modalita' libera
 * (fiche infinite) svuoterebbe di senso la carriera: basterebbe passarci,
 * gonfiare il saldo e tornare indietro.
 */

export type ModeId = 'career' | 'freeplay' | 'highroller';

export interface ModeDef {
  id: ModeId;
  /** Chiavi i18n. */
  nameKey: string;
  descKey: string;
  startingBalance: number;
  /** In freeplay tutto e' sbloccato e non si guadagna XP. */
  progression: boolean;
  /** Ignora i limiti di puntata del rango VIP. */
  unlockAll: boolean;
  /** Obiettivo per la sfida high roller. null = nessun obiettivo. */
  goal: number | null;
  /** Ricarica automatica quando si va a zero (freeplay). */
  autoRefill: boolean;
}

export const MODES: Record<ModeId, ModeDef> = {
  career: {
    id: 'career',
    nameKey: 'mode.career.name',
    descKey: 'mode.career.desc',
    startingBalance: 10_000,
    progression: true,
    unlockAll: false,
    goal: null,
    autoRefill: false,
  },
  freeplay: {
    id: 'freeplay',
    nameKey: 'mode.freeplay.name',
    descKey: 'mode.freeplay.desc',
    startingBalance: 1_000_000,
    progression: false,
    unlockAll: true,
    goal: null,
    autoRefill: true,
  },
  // Partenza ricca e un traguardo: decuplicare il capitale. Se si scende
  // sotto la puntata minima la sfida e' persa e si ricomincia.
  highroller: {
    id: 'highroller',
    nameKey: 'mode.highroller.name',
    descKey: 'mode.highroller.desc',
    startingBalance: 250_000,
    progression: false,
    unlockAll: true,
    goal: 2_500_000,
    autoRefill: false,
  },
};

export const MODE_ORDER: readonly ModeId[] = ['career', 'freeplay', 'highroller'];
