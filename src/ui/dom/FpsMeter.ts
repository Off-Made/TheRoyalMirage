/**
 * Contatore FPS (Impostazioni → "Mostra FPS").
 *
 * Un badge DOM fisso in basso a sinistra, fuori dall'HUD dei giochi, cosi' si
 * vede in sala, nei menu e ai tavoli. Si aggiorna ogni mezzo secondo: piu'
 * spesso il numero balla e non si legge.
 */
import { game } from '@/core/App';
import { el } from './el';

let node: HTMLDivElement | null = null;
let timer: number | null = null;

export function setFpsMeter(visible: boolean): void {
  if (!visible) {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    node?.remove();
    node = null;
    return;
  }
  if (node) return;
  node = el('div', { class: 'go-fps', attrs: { 'aria-hidden': 'true' } });
  document.body.append(node);
  const paint = () => {
    if (node) node.textContent = `${Math.round(game.fps)} FPS`;
  };
  paint();
  timer = window.setInterval(paint, 500);
}
