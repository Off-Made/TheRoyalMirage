/**
 * THE ROYAL MIRAGE — Notifiche temporanee
 *
 * Si iscrive agli eventi dello store e mostra una striscia in alto.
 * Nessuna logica di gioco qui: i toast reagiscono, non decidono.
 */

import { div, el } from './el';
import { bus } from '@/state/events';
import { t } from '@/i18n';
import { formatMoney } from '@/state/wallet';

type Kind = 'info' | 'win' | 'warn' | 'vip';

let host: HTMLElement | null = null;
/** Coda massima: oltre, i toast piu' vecchi vengono rimossi subito.
 *  Senza tetto, un auto-spin con vincite frequenti riempirebbe lo schermo. */
const MAX_VISIBLE = 4;

function ensureHost(): HTMLElement {
  if (host) return host;
  host = div('');
  host.id = 'go-toasts';
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  document.body.append(host);
  return host;
}

export function toast(text: string, kind: Kind = 'info', ms = 3200): void {
  const h = ensureHost();
  while (h.children.length >= MAX_VISIBLE) h.firstElementChild?.remove();

  const node = el('div', { class: `go-toast go-toast--${kind}`, text });
  h.append(node);

  setTimeout(() => {
    node.classList.add('is-leaving');
    // 360ms = durata dell'animazione di uscita in shell.css. Rimuovere il
    // nodo prima lascerebbe un salto visivo.
    setTimeout(() => node.remove(), 360);
  }, ms);
}

/** Collega i toast agli eventi di gioco. Chiamata una volta al boot. */
export function installToasts(): void {
  bus.on('ui:toast', ({ text, kind }) => toast(text, kind ?? 'info'));

  bus.on('daily:claimed', ({ amount, streak }) => {
    toast(`${t('daily.claimed', { coins: formatMoney(amount) })} · ${t('daily.streak', { n: streak })}`, 'win', 4600);
  });

  bus.on('wallet:insufficient', () => toast(t('wallet.insufficient'), 'warn', 2400));

  // Cambio di rango, ricarica e riconoscimenti li annuncia la Shell, che
  // conosce nomi e ricompense. Qui c'era un secondo ascoltatore per i primi
  // due: ogni salita di rango produceva DUE toast, uno con l'importo crudo
  // ("7500") stampato con `num()` invece che come denaro.
}
