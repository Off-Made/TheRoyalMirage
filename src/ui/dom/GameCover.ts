/**
 * THE ROYAL MIRAGE — Copertine dei giochi
 *
 * Una copertina e' una COMPOSIZIONE, non un disegno: un fondo nella tinta
 * del gioco (gradiente dai token), le luci sfocate della Strip in
 * trasparenza, tre icone 3D e un segno tipografico grande in insegna.
 * Lo stesso componente serve la sala giochi e la vetrina della home.
 *
 * Ogni gioco ha un "tono" (la classe `go-cover--<tono>` in `lobby.css`) e un
 * segno: il numero o la parola che un giocatore associa a quel tavolo.
 */

import { el, div } from './el';
import { iconUrl, type IconName } from '@/art/images';
import type { GameId } from '@/games/registry';

type Tone = 'red' | 'violet' | 'sapphire' | 'felt' | 'gold' | 'crimson' | 'emerald' | 'neon';

interface CoverSpec {
  tone: Tone;
  /** Icona principale, poi le due di contorno (sinistra, destra). */
  icons: readonly [IconName, IconName, IconName];
  /** Segno tipografico dietro alle icone. */
  mark: string;
}

const COVERS: Record<GameId, CoverSpec> = {
  goldenOasis: { tone: 'red', icons: ['cherries', 'bell', 'gem-stone'], mark: '777' },
  desertFalcon: { tone: 'violet', icons: ['clapper-board', 'glowing-star', 'popcorn'], mark: 'GALA' },
  sheikhsFortune: { tone: 'sapphire', icons: ['crown', 'gem-stone', 'money-bag'], mark: 'GRAND' },
  blackjack: { tone: 'felt', icons: ['spade-suit', 'heart-suit', 'coin'], mark: '21' },
  roulette: { tone: 'gold', icons: ['coin', 'diamond-suit', 'sparkles'], mark: '17' },
  baccarat: { tone: 'crimson', icons: ['diamond-suit', 'club-suit', 'clinking-glasses'], mark: '9' },
  videopoker: { tone: 'emerald', icons: ['joker', 'crown', 'spade-suit'], mark: 'ROYAL' },
  crash: { tone: 'neon', icons: ['coin', 'chart-increasing', 'sparkles'], mark: '×10' },
};

/** Le icone usate da tutte le copertine, per precaricarle in blocco. */
export const COVER_ICONS: readonly IconName[] = [...new Set(Object.values(COVERS).flatMap((c) => c.icons))];

function icon(name: IconName, cls: string): HTMLImageElement {
  return el('img', {
    class: `go-cover__icon ${cls}`,
    attrs: { src: iconUrl(name), alt: '', 'aria-hidden': true, decoding: 'async', draggable: 'false', width: 256, height: 256 },
  });
}

/** Costruisce la copertina di un gioco. `size` cambia solo la scala tipografica. */
export function gameCover(id: GameId, size: 'md' | 'sm' = 'md'): HTMLDivElement {
  const c = COVERS[id];
  return div(
    `go-cover go-cover--${c.tone} go-cover--${size}`,
    el('span', { class: 'go-cover__mark', text: c.mark, attrs: { 'aria-hidden': true } }),
    icon(c.icons[1], 'go-cover__icon--left'),
    icon(c.icons[2], 'go-cover__icon--right'),
    icon(c.icons[0], 'go-cover__icon--main')
  );
}
