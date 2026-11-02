/**
 * THE ROYAL MIRAGE — Catalogo delle transizioni
 *
 * Ogni transizione e' un modulo a se': `SceneManager` sceglie per nome e non
 * conosce il disegno di nessuna. Aggiungerne una = un file + una riga qui.
 *
 * Entrambe stanno sotto i 350 ms per fase: un'animazione che il giocatore attende a
 * ogni ingresso al tavolo smette presto di essere un piacere.
 */
import type { Transition } from './types';
import { fadeTransition } from './fade';
import { chipTransition } from './chip';

export type { Transition } from './types';

export type AnimatedTransition = 'fade' | 'chip';

export const TRANSITIONS: Record<AnimatedTransition, () => Transition> = {
  fade: fadeTransition,
  chip: chipTransition,
};
