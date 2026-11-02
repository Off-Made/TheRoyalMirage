/**
 * THE ROYAL MIRAGE — Catalogo degli ambienti
 *
 * Le specifiche sono costanti di modulo: le closure di disegno hanno
 * un'identita' stabile, quindi chiavi di cache e risultati coincidono fra
 * tutti i Backdrop che usano lo stesso ambiente.
 */
import type { EnvironmentSpec } from './types';
import { NONE, SALON, SKYLINE, STRIP } from './casinoEnv';

const ENVIRONMENTS = {
  salon: SALON,
  strip: STRIP,
  skyline: SKYLINE,
  none: NONE,
} satisfies Record<string, EnvironmentSpec>;

export type EnvironmentId = keyof typeof ENVIRONMENTS;

export function getEnvironment(id: EnvironmentId): EnvironmentSpec {
  return ENVIRONMENTS[id];
}
