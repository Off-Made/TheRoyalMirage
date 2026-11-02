/**
 * THE ROYAL MIRAGE — Saldo esaurito
 *
 * La schermata che compare quando il saldo non copre piu' la puntata minima.
 * Un solo pulsante, grande, smeraldo: "Ricomincia con 100,00 €".
 *
 * ── Perche' non si puo' chiudere ──
 * A secco non esiste nessuna azione utile oltre a ripartire: chiudere la
 * modale lascerebbe il giocatore in una sala dove ogni tavolo rifiuta la
 * puntata, e la stessa schermata tornerebbe alla prima giocata. Il vecchio
 * rebuy aveva anche un'attesa di 3 minuti; qui non c'e' niente da aspettare.
 *
 * Il residuo (es. 0,07 €) e' MOSTRATO, non nascosto: se il saldo non e'
 * esattamente zero, il giocatore deve capire perche' non puo' piu' puntare.
 */

import { button, div, el } from './el';
import { showModal } from './Modal';
import { t } from '@/i18n';
import { actions, modeDef, wallet } from '@/state/store';
import { MIN_BET, formatMoney } from '@/state/wallet';

export function showBrokeModal(onRestart: () => void): void {
  const start = formatMoney(modeDef().startingBalance);
  const residual = wallet().balance;

  const body = div(
    'go-broke',
    // Il medaglione: una clessidra di sabbia esaurita, nel motivo del tema.
    el('div', { class: 'go-broke__seal', text: '⌛', attrs: { 'aria-hidden': true } }),
    el('p', { class: 'go-broke__msg', i18n: 'wallet.broke.body' }),
    residual > 0
      ? el('p', {
          class: 'go-broke__residual',
          text: t('wallet.broke.residual', { amount: formatMoney(residual), min: formatMoney(MIN_BET) }),
        })
      : null
  );

  let modal: { close: () => void } | null = null;
  const cta = button(t('wallet.broke.cta', { amount: start }), {
    variant: 'primary',
    size: 'lg',
    class: 'go-broke__cta',
    onClick: () => {
      if (!actions.restart()) return;
      modal?.close();
      onRestart();
    },
  });

  modal = showModal({
    titleKey: 'wallet.broke.title',
    width: 560,
    body,
    footer: div('go-broke__foot', cta),
    dismissable: false,
  });
}
