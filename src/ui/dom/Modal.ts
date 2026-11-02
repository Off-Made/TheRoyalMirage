/**
 * THE ROYAL MIRAGE — Modali
 *
 * Un solo gestore per Impostazioni, Profilo, Vincite, conferme.
 *
 * ── Accessibilita' non opzionale ──
 * Una modale senza trappola del focus e' una trappola PER l'utente da
 * tastiera: Tab porta il cursore sui pulsanti dietro, invisibili, e si perde
 * l'orientamento. Qui ciclo il focus dentro il pannello e lo restituisco
 * all'elemento di partenza alla chiusura.
 */

import { div, el, button, clear } from './el';
import { applyTranslations, t } from '@/i18n';
import type { TranslationKey } from '@/i18n';
import { sfxBack } from '@/audio/synth';

export interface ModalOptions {
  titleKey: TranslationKey;
  /** Contenuto del corpo. */
  body: Node;
  /** Pulsanti in fondo. Se assente, solo "Chiudi". */
  footer?: Node;
  /** Larghezza massima in px. */
  width?: number;
  /** Chiusura con click sullo sfondo. Disattivata per le conferme. */
  dismissable?: boolean;
  onClose?: () => void;
}

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])';

let openModal: { destroy: () => void } | null = null;

export function isModalOpen(): boolean {
  return openModal !== null;
}

export function closeModal(): void {
  openModal?.destroy();
}

export function showModal(opts: ModalOptions): { close: () => void } {
  // Una modale per volta: sovrapporle confonde la gerarchia e rompe la
  // trappola del focus (due trappole che si contendono il cursore).
  closeModal();

  const previouslyFocused = document.activeElement as HTMLElement | null;

  const panel = div('go-panel go-modal');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  if (opts.width) panel.style.width = `min(${opts.width}px, 94vw)`;

  const titleEl = el('h2', { class: 'go-panel__title', i18n: opts.titleKey });
  const titleId = `go-modal-title-${Math.random().toString(36).slice(2, 8)}`;
  titleEl.id = titleId;
  panel.setAttribute('aria-labelledby', titleId);

  const closeBtn = button('✕', {
    variant: 'ghost',
    size: 'sm',
    class: 'go-modal__x',
    attrs: { 'aria-label': t('menu.close'), 'data-sfx': 'own' },
    onClick: () => destroy(),
  });

  const head = div('go-panel__head', titleEl, closeBtn);
  const body = div('go-panel__body', opts.body);
  const foot = div(
    'go-modal__foot',
    opts.footer ??
      button({ i18n: 'menu.close' }, {
        variant: 'secondary',
        // `destroy()` suona gia' sfxBack: il click generico sarebbe un doppione.
        attrs: { 'data-sfx': 'own' },
        onClick: () => destroy(),
      })
  );

  panel.append(head, body, foot);

  const backdrop = div('go-modal-backdrop', panel);
  backdrop.addEventListener('pointerdown', (e) => {
    if (e.target === backdrop && (opts.dismissable ?? true)) destroy();
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && (opts.dismissable ?? true)) {
      e.preventDefault();
      destroy();
      return;
    }
    if (e.key !== 'Tab') return;

    // Trappola del focus: all'ultimo elemento, Tab torna al primo.
    const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (n) => n.offsetParent !== null
    );
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  let destroyed = false;
  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    window.removeEventListener('keydown', onKey, true);
    backdrop.remove();
    openModal = null;
    sfxBack();
    opts.onClose?.();
    // Restituire il focus e' cio' che permette di riprendere la navigazione
    // da dove si era interrotta invece che dall'inizio della pagina.
    previouslyFocused?.focus?.();
  }

  window.addEventListener('keydown', onKey, true);
  document.body.append(backdrop);
  applyTranslations(backdrop);

  // Focus sul primo elemento utile, non sul pannello: altrimenti il primo
  // Tab non fa nulla di visibile e sembra che la tastiera sia ignorata.
  const firstFocusable = panel.querySelector<HTMLElement>(FOCUSABLE);
  (firstFocusable ?? panel).focus?.();

  openModal = { destroy };
  return { close: destroy };
}

/** Modale di conferma sì/no. Restituisce una Promise con la scelta. */
export function confirmModal(opts: {
  titleKey: TranslationKey;
  messageKey: TranslationKey;
  confirmKey?: TranslationKey;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (v: boolean) => {
      if (answered) return;
      answered = true;
      resolve(v);
      closeModal();
    };

    const footer = div(
      'go-modal__actions',
      button({ i18n: 'menu.cancel' }, { variant: 'ghost', onClick: () => answer(false) }),
      button(
        { i18n: opts.confirmKey ?? 'menu.confirm' },
        { variant: opts.danger ? 'danger' : 'primary', onClick: () => answer(true) }
      )
    );

    showModal({
      titleKey: opts.titleKey,
      width: 540,
      body: el('p', { class: 'go-confirm__msg', i18n: opts.messageKey }),
      footer,
      // Chiudere cliccando fuori su una conferma distruttiva equivarrebbe a
      // un "annulla" silenzioso: meglio obbligare a una scelta esplicita.
      dismissable: false,
      onClose: () => answer(false),
    });
  });
}

/** Sostituisce il corpo di una modale aperta (usato dai tab delle impostazioni). */
export function replaceModalBody(content: Node): void {
  const body = document.querySelector<HTMLElement>('.go-modal .go-panel__body');
  if (!body) return;
  clear(body);
  body.append(content);
  applyTranslations(body);
}
