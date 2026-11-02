/**
 * THE ROYAL MIRAGE — Scelta della modalità
 *
 * Tre carte affiancate. Ognuna mostra il saldo del SUO portafoglio, perché
 * le modalità hanno portafogli separati: l'utente deve capire che passando
 * a Gioco Libero non sta spendendo le fiche della Carriera.
 */

import { div, el, button } from './el';
import { showModal, closeModal } from './Modal';
import { getState, actions } from '@/state/store';
import { MODES, MODE_ORDER, type ModeId } from '@/state/modes';
import { formatMoney } from '@/state/wallet';
import { t } from '@/i18n';
import type { TranslationKey } from '@/i18n';
import { PALETTE, css, rgbTriple } from '@/art/palette';
import { iconUrl, type IconName } from '@/art/images';

/** Glifo e accento cromatico per modalità. */
const MODE_STYLE: Record<ModeId, { icon: IconName; accent: number }> = {
  career: { icon: 'crown', accent: PALETTE.gold.core },
  freeplay: { icon: 'party-popper', accent: PALETTE.win.core },
  highroller: { icon: 'gem-stone', accent: PALETTE.neon.pink },
};

export function openModes(onChosen: () => void): void {
  const state = getState();

  const cards = MODE_ORDER.map((id) => {
    const m = MODES[id];
    const w = state.wallets[id];
    const active = state.mode === id;
    const style = MODE_STYLE[id];

    const goalRow = m.goal
      ? div(
          'go-mode__goal',
          el('span', { class: 'go-mode__goal-label', i18n: 'mode.goal' }),
          el('span', { class: 'go-mode__goal-value numeric', text: formatMoney(m.goal) })
        )
      : null;

    const card = div(
      `go-mode${active ? ' is-active' : ''}`,
      el('img', { class: 'go-mode__glyph', attrs: { src: iconUrl(style.icon), alt: '', 'aria-hidden': true, width: 64, height: 64 } }),
      el('h3', { class: 'go-mode__name', i18n: m.nameKey }),
      el('p', { class: 'go-mode__desc', i18n: m.descKey }),
      div(
        'go-mode__wallet',
        el('span', { class: 'go-mode__wallet-label', i18n: 'hud.balance' }),
        el('span', { class: 'go-mode__wallet-value numeric', text: formatMoney(w.balance) })
      ),
      goalRow,
      button(active ? { i18n: 'mode.current' } : { i18n: 'menu.play' }, {
        variant: active ? 'ghost' : 'primary',
        size: 'sm',
        class: 'go-mode__btn',
        attrs: active ? { disabled: true } : undefined,
        onClick: () => {
          actions.switchMode(id);
          closeModal();
          onChosen();
        },
      })
    );
    card.style.setProperty('--mode-accent', css(style.accent));
    card.style.setProperty('--mode-accent-rgb', rgbTriple(style.accent));
    card.setAttribute('aria-label', t(m.nameKey as TranslationKey));
    return card;
  });

  showModal({
    titleKey: 'menu.modes',
    width: 1100,
    body: div('go-modes', ...cards),
  });
}
