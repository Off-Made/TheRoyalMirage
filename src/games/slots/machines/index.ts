/**
 * THE ROYAL MIRAGE — Catalogo delle macchine
 *
 * Unico punto d'accesso ai modelli matematici: test, simulatore e scene
 * importano da qui. Ogni voce e' automaticamente coperta dal test RTP.
 */

import type { MachineDef } from '../engine/types';
import { GOLDEN_OASIS } from './goldenOasis';
import { DESERT_FALCON } from './desertFalcon';
import { SHEIKHS_FORTUNE } from './sheikhsFortune';

export const MACHINES: Record<string, MachineDef> = {
  goldenOasis: GOLDEN_OASIS,
  desertFalcon: DESERT_FALCON,
  sheikhsFortune: SHEIKHS_FORTUNE,
};
