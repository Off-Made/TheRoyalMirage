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

  let gone = false;
  const leave = () => {
    if (gone) return;
    gone = true;
    node.classList.add('is-leaving');
    // 360ms = durata dell'animazione di uscita in shell.css. Rimuovere il
    // nodo prima lascerebbe un salto visivo.
    setTimeout(() => node.remove(), 360);
  };
  let timer = setTimeout(leave, ms);
  swipeAway(node, {
    hold: () => clearTimeout(timer),
    release: () => (timer = setTimeout(leave, 1600)),
    dismiss: () => {
      gone = true;
      clearTimeout(timer);
    },
  });
}

/**
 * Trascinando il toast a destra o a sinistra col dito lo si manda via: segue
 * il dito sfumando, e oltre una soglia (o con un colpo veloce) esce dal lato
 * del gesto; altrimenti torna al suo posto. Un tocco fermo non fa niente.
 */
function swipeAway(node: HTMLElement, cb: { hold: () => void; release: () => void; dismiss: () => void }): void {
  let id: number | null = null;
  let x0 = 0;
  let dx = 0;
  let t0 = 0;
  node.addEventListener('pointerdown', (e) => {
    if (node.classList.contains('is-leaving')) return;
    id = e.pointerId;
    x0 = e.clientX;
    dx = 0;
    t0 = performance.now();
    node.setPointerCapture(e.pointerId);
    node.classList.add('is-dragging');
    cb.hold();
  });
  node.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    dx = e.clientX - x0;
    node.style.transform = `translateX(${dx}px)`;
    node.style.opacity = String(Math.max(0.15, 1 - Math.abs(dx) / (node.offsetWidth * 0.9)));
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = null;
    node.classList.remove('is-dragging');
    const speed = Math.abs(dx) / Math.max(1, performance.now() - t0);
    if (Math.abs(dx) > node.offsetWidth * 0.3 || (Math.abs(dx) > 24 && speed > 0.6)) {
      cb.dismiss();
      const dir = dx > 0 ? 1 : -1;
      node.classList.add('is-swiped');
      node.style.transform = `translateX(${dir * (window.innerWidth * 0.7 + node.offsetWidth)}px)`;
      node.style.opacity = '0';
      // Poi il posto si richiude piano, senza far saltare gli altri toast.
      setTimeout(() => node.classList.add('is-collapsing'), 220);
      setTimeout(() => node.remove(), 520);
    } else {
      node.style.transform = '';
      node.style.opacity = '';
      cb.release();
    }
  };
  node.addEventListener('pointerup', end);
  node.addEventListener('pointercancel', end);
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
