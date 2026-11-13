/**
 * THE ROYAL MIRAGE — Tempo di gioco
 *
 * Conta il tempo passato sul sito con la pagina VISIBILE: una scheda
 * dimenticata in background non e' tempo di gioco. Il totale vive nel
 * profilo (`profile.playSeconds`) e si vede nella finestra del profilo.
 *
 * Il tempo si accumula in memoria e si registra ogni 15 secondi: scrivere
 * nello stato a ogni secondo farebbe salvare il gioco di continuo. Alla
 * chiusura si perdono al massimo quei pochi secondi.
 */
import { actions } from './store';

const COMMIT_EVERY_MS = 15_000;

let installed = false;

export function installPlayTimeTracker(): void {
  if (installed) return;
  installed = true;
  let last = performance.now();
  let pending = 0;

  const tick = () => {
    const now = performance.now();
    // Un salto enorme (PC in sospensione) non e' gioco: si conta al massimo un minuto.
    if (document.visibilityState === 'visible') pending += Math.min(60_000, now - last);
    last = now;
  };
  const commit = () => {
    tick();
    if (pending >= 1000) {
      actions.addPlayTime(pending / 1000);
      pending = 0;
    }
  };
  window.setInterval(commit, COMMIT_EVERY_MS);
  document.addEventListener('visibilitychange', () => {
    // Si chiude il conto del tratto visibile prima di nascondersi.
    if (document.visibilityState === 'hidden') commit();
    else last = performance.now();
  });
}

/** "3 h 05 min", "12 min", "meno di 1 min". */
export function formatPlayTime(seconds: number, lang: 'it' | 'en'): string {
  const min = Math.floor(seconds / 60);
  if (min < 1) return lang === 'it' ? 'meno di 1 min' : 'under 1 min';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}
