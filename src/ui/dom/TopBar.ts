/**
 * THE ROYAL MIRAGE — Barra superiore
 *
 * La stessa barra in home e in sala giochi: marchio, navigazione, saldo,
 * profilo, impostazioni. Il saldo sta SEMPRE qui in alto a destra, dove ogni
 * casino' online lo mette: scegliere un tavolo senza sapere quanto si ha in
 * tasca e' la decisione piu' facile da sbagliare.
 */

import { div, el } from './el';
import { t } from '@/i18n';
import type { TranslationKey } from '@/i18n';
import { getState, progression, wallet } from '@/state/store';
import { tierFor } from '@/state/progression';
import { formatMoney } from '@/state/wallet';
import { css } from '@/art/palette';
import { iconUrl } from '@/art/images';

export interface TopBarHandlers {
  onHome: () => void;
  onLobby: () => void;
  onProfile: () => void;
  onSettings: () => void;
}

export class TopBar {
  readonly root: HTMLElement;
  private balance!: HTMLElement;
  private avatar!: HTMLElement;
  private rank!: HTMLElement;
  private links: HTMLButtonElement[] = [];

  constructor(handlers: TopBarHandlers, active: 'home' | 'lobby') {
    const brand = el(
      'button',
      {
        class: 'go-brand',
        attrs: { type: 'button', 'aria-label': 'The Royal Mirage' },
        on: { click: handlers.onHome },
      },
      el('span', { class: 'go-brand__the', text: 'The' }),
      el('span', { class: 'go-brand__name', text: 'Royal Mirage' })
    );

    const link = (key: TranslationKey, view: 'home' | 'lobby', onClick: () => void) => {
      const b = el('button', {
        class: `go-navlink${view === active ? ' is-active' : ''}`,
        attrs: { type: 'button', 'aria-current': view === active ? 'page' : undefined },
        i18n: key,
        on: { click: onClick },
      });
      this.links.push(b);
      return b;
    };

    this.balance = el('span', { class: 'go-balance__value numeric' });
    const balance = div(
      'go-balance',
      el('img', { class: 'go-balance__coin', attrs: { src: iconUrl('coin'), alt: '', 'aria-hidden': true, width: 28, height: 28 } }),
      div('go-balance__text', el('span', { class: 'go-balance__label', i18n: 'hud.balance' }), this.balance)
    );

    this.avatar = el('span', { class: 'go-profile-btn__avatar', attrs: { 'aria-hidden': true } });
    this.rank = el('span', { class: 'go-profile-btn__rank' });
    const profile = el(
      'button',
      { class: 'go-profile-btn', attrs: { type: 'button' }, on: { click: handlers.onProfile } },
      this.avatar,
      div('go-profile-btn__text', el('span', { class: 'go-profile-btn__label', i18n: 'menu.profile' }), this.rank)
    );

    const settings = el(
      'button',
      {
        class: 'go-icon-btn',
        attrs: { type: 'button', 'aria-label': t('menu.settings') },
        i18nAttr: { 'aria-label': 'menu.settings' },
        on: { click: handlers.onSettings },
      },
      el('img', { attrs: { src: iconUrl('gear'), alt: '', 'aria-hidden': true, width: 26, height: 26 } })
    );

    this.root = el(
      'header',
      { class: 'go-topbar' },
      brand,
      el('nav', { class: 'go-topbar__nav' }, link('menu.home', 'home', handlers.onHome), link('menu.lobby', 'lobby', handlers.onLobby)),
      div('go-topbar__right', balance, profile, settings)
    );
    this.refresh();
  }

  refresh(): void {
    const tier = tierFor(progression().xp);
    this.balance.textContent = formatMoney(wallet().balance);
    const name = getState().profile.name.trim();
    this.avatar.textContent = (name[0] ?? 'M').toUpperCase();
    this.rank.textContent = t(tier.key as TranslationKey);
    this.rank.style.color = css(tier.color);
  }
}
