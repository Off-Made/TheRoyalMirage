/**
 * THE ROYAL MIRAGE — Modale profilo
 *
 * Nome, rango, statistiche, storico delle ultime giocate.
 *
 * Il dato più onesto che mostriamo è il RISULTATO NETTO (vinto - puntato).
 * Un casinò vero non te lo dice mai; qui sì, perché il gioco è una
 * simulazione e capire la matematica fa parte dell'esperienza.
 */

import { div, el, progressBar } from './el';
import { showModal } from './Modal';
import { getState, wallet, progression, actions } from '@/state/store';
import { tierFor, tierProgress, nextTier, VIP_TIERS } from '@/state/progression';
import { formatMoney } from '@/state/wallet';
import { t, num } from '@/i18n';
import type { TranslationKey } from '@/i18n';
import { PALETTE, css } from '@/art/palette';
import { ACHIEVEMENTS, ACHIEVEMENT_COUNT } from '@/state/achievements';
import { GAMES } from '@/games/registry';

/** Nome leggibile del gioco di una transazione (lo storico salva l'id). */
function gameName(id: string): string {
  const g = GAMES.find((x) => x.id === id);
  return g ? t(g.nameKey) : id;
}

function statCell(labelKey: TranslationKey, value: string, accent?: string): HTMLElement {
  const v = el('span', { class: 'go-pstat__value numeric', text: value });
  if (accent) v.style.color = accent;
  return div('go-pstat', el('span', { class: 'go-pstat__label', i18n: labelKey }), v);
}

export function openProfile(): void {
  const state = getState();
  const w = wallet();
  const p = progression();
  const tier = tierFor(p.xp);
  const next = nextTier(tier.level);

  // ── Intestazione: nome modificabile + rango
  const nameInput = el('input', {
    class: 'go-input go-profile__name',
    attrs: {
      type: 'text',
      maxlength: 18,
      value: state.profile.name,
      spellcheck: 'false',
      autocomplete: 'off',
    },
    i18nAttr: { placeholder: 'profile.namePlaceholder' },
    on: {
      // `input` e non `change`: salviamo mentre si scrive, così chiudere la
      // modale senza premere Invio non perde il nome.
      input: (e) => actions.setName((e.target as HTMLInputElement).value),
    },
  });

  const rankBadge = el('span', { class: 'go-profile__rank', text: t(tier.key as TranslationKey) });
  rankBadge.style.color = css(tier.color);
  rankBadge.style.borderColor = css(tier.color);

  const xpBar = progressBar(tierProgress(p.xp));
  const xpText = el('span', {
    class: 'go-profile__xp numeric',
    text: next
      ? `${num(p.xp)} / ${num(next.xp)} ${t('common.xp')}`
      : `${num(p.xp)} ${t('common.xp')} · ${t('vip.maxed')}`,
  });

  const header = div(
    'go-profile__head',
    div(
      'go-profile__identity',
      div('go-profile__name-row', el('label', { class: 'go-pstat__label', i18n: 'profile.name' }), nameInput),
      rankBadge
    ),
    div('go-profile__xp-row', xpBar, xpText)
    // Niente piu' "puntata massima" del rango: la puntata e' libera fino al saldo.
  );

  // ── Statistiche
  const net = w.totalWon - w.totalWagered;
  const stats = div(
    'go-profile__stats',
    statCell('hud.balance', formatMoney(w.balance)),
    statCell('profile.totalWagered', formatMoney(w.totalWagered)),
    statCell('profile.totalWon', formatMoney(w.totalWon)),
    statCell('profile.biggestWin', formatMoney(w.biggestWin)),
    statCell('profile.spins', num(w.spins)),
    statCell(
      'profile.netResult',
      `${net >= 0 ? '+' : '−'}${formatMoney(Math.abs(net))}`,
      net >= 0 ? css(PALETTE.win.core) : css(PALETTE.loss.core)
    )
  );

  // ── Riconoscimenti e giochi provati
  const meta = div(
    'go-profile__meta',
    el('span', {
      class: 'go-pstat__label',
      text: t('profile.achievementsCount', { n: p.achievements.length, total: ACHIEVEMENT_COUNT }),
    }),
    el('span', {
      class: 'go-pstat__label',
      text: `${t('profile.gamesPlayed')}: ${p.gamesPlayed.length} / 8`,
    }),
    el('span', { class: 'go-pstat__label', text: t('daily.streak', { n: p.streak }) })
  );

  // ── Storico
  const rows = w.history.slice(0, 14).map((h) => {
    const profit = h.payout - h.bet;
    const amount = el('span', {
      class: 'go-hrow__amount numeric',
      text: `${profit >= 0 ? '+' : '−'}${formatMoney(Math.abs(profit))}`,
    });
    amount.style.color = profit > 0 ? css(PALETTE.win.core) : profit < 0 ? css(PALETTE.loss.core) : css(PALETTE.text.mute);
    return div(
      'go-hrow',
      el('span', { class: 'go-hrow__game', text: gameName(h.game) }),
      el('span', { class: 'go-hrow__bet numeric', text: formatMoney(h.bet) }),
      amount,
      el('span', { class: 'go-hrow__balance numeric', text: formatMoney(h.balance) })
    );
  });

  const history = div(
    'go-group',
    el('h3', { class: 'go-group__title', i18n: 'profile.history' }),
    rows.length
      ? div('go-history', ...rows)
      : el('p', { class: 'go-pstat__label', i18n: 'profile.noHistory' })
  );

  // ── Bacheca dei riconoscimenti, per gruppo
  const got = new Set(p.achievements);
  const groups = ['play', 'wins', 'wealth', 'loyalty', 'games'] as const;
  const trophies = div(
    'go-group',
    el('h3', { class: 'go-group__title', i18n: 'achievement.title' }),
    ...groups.map((g) =>
      div(
        'go-trophies',
        el('span', { class: 'go-trophies__group', i18n: `achievement.group.${g}` }),
        div(
          'go-trophies__row',
          ...ACHIEVEMENTS.filter((a) => a.group === g).map((a) => {
            const on = got.has(a.id);
            const name = t(`ach.${a.id}` as TranslationKey);
            const desc = t(`ach.${a.id}.desc` as TranslationKey);
            return div(
              `go-trophy${on ? ' is-on' : ''}`,
              el('span', { class: 'go-trophy__icon', text: a.icon, attrs: { 'aria-hidden': true } }),
              el('span', { class: 'go-trophy__name', text: name }),
              el('span', { class: 'go-trophy__desc', text: on ? desc : `${t('achievement.locked')} · ${desc}` })
            );
          })
        )
      )
    )
  );

  // ── Scala dei ranghi
  const ladder = div(
    'go-group',
    el('h3', { class: 'go-group__title', i18n: 'vip.title' }),
    div(
      'go-ladder',
      ...VIP_TIERS.map((vt) => {
        const reached = p.xp >= vt.xp;
        const node = div(
          `go-ladder__item${reached ? ' is-reached' : ''}${vt.level === tier.level ? ' is-current' : ''}`,
          el('span', { class: 'go-ladder__name', text: t(vt.key as TranslationKey) }),
          el('span', { class: 'go-ladder__xp numeric', text: num(vt.xp) })
        );
        node.style.setProperty('--tier-color', css(vt.color));
        return node;
      })
    )
  );

  showModal({
    titleKey: 'profile.title',
    width: 880,
    body: div('go-profile', header, stats, meta, ladder, trophies, history),
  });
}
