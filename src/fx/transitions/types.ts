import type { Container } from 'pixi.js';

/**
 * Una transizione: un oggetto grafico che COPRE lo schermo e poi lo SCOPRE.
 * Fra le due fasi lo schermo e' interamente nascosto: e' li' che si fa il
 * lavoro che produrrebbe uno scatto visibile (scambio di scena, cottura di
 * texture, cambio di ambiente).
 */
export interface Transition {
  view: Container;
  cover: () => Promise<void>;
  reveal: () => Promise<void>;
}
