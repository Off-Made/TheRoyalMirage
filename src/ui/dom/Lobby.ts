/**
 * THE ROYAL MIRAGE — Sala giochi
 *
 * Overlay a tutta finestra, come la home: barra superiore condivisa, banner
 * d'apertura su foto, filtri per famiglia, una fascia "piu' giocati" e la
 * griglia completa. La griglia e' fluida (`auto-fill`): da quattro colonne
 * su desktop a una su telefono, senza media query per ogni misura.
 *
 * ── Tre stati per carta, e perche' sono tre ──
 *   disponibile → si entra
 *   bloccato    → esiste ma serve un rango; mostriamo QUANTO manca, perche'
 *                 "bloccato" senza condizione e' solo frustrazione
 *   in arrivo   → il gioco non e' ancora implementato; dirlo e' piu' onesto
 *                 che nasconderlo
 */

import { div, el, button, clear } from './el';
import { applyTranslations, t, num } from '@/i18n';
import type { TranslationKey } from '@/i18n';
import { modeDef, progression, wallet } from '@/state/store';
import { tierFor, VIP_TIERS } from '@/state/progression';
import { GAMES, type GameFamily, type GameId, type GameInfo, isPlayable, isUnlocked } from '@/games/registry';
import { toast } from './Toasts';
import { css, rgbTriple } from '@/art/palette';
import { iconUrl } from '@/art/images';
import { TopBar } from './TopBar';
import { gameCover } from './GameCover';

type Filter = 'all' | GameFamily;

const FILTERS: { value: Filter; labelKey: TranslationKey }[] = [
  { value: 'all', labelKey: 'lobby.filter.all' },
  { value: 'slots', labelKey: 'lobby.filter.slots' },
  { value: 'cards', labelKey: 'lobby.filter.cards' },
  { value: 'wheel', labelKey: 'lobby.filter.wheel' },
  { value: 'instant', labelKey: 'lobby.filter.instant' },
];

export interface LobbyHandlers {
  onEnter: (id: GameId) => void;
  onBack: () => void;
  onProfile: () => void;
  onSettings: () => void;
}

export class Lobby {
  readonly root: HTMLElement;
  private top: TopBar;
  private grid!: HTMLElement;
  private rail!: HTMLElement;
  private railSection!: HTMLElement;
  private railTitle!: HTMLElement;
  private filter: Filter = 'all';

  constructor(private handlers: LobbyHandlers) {
    this.top = new TopBar(
      { onHome: handlers.onBack, onLobby: () => undefined, onProfile: handlers.onProfile, onSettings: handlers.onSettings },
      'lobby'
    );
    this.root = div('go-screen go-lobby is-hidden');
    this.root.append(
      this.top.root,
      div(
        'go-lobby__scroll',
        div(
          'go-lobby__inner',
          this.buildPromo(),
          this.buildFilters(),
          this.buildRail(),
          this.buildAllSection(),
          el('p', { class: 'go-legal', i18n: 'app.legal' })
        )
      )
    );
    applyTranslations(this.root);
    this.refresh();
  }

  /** Banner d'apertura: la facciata del Bellagio, un titolo, tre oggetti 3D. */
  private buildPromo(): HTMLElement {
    const art = (name: Parameters<typeof iconUrl>[0], cls: string) =>
      el('img', { class: `go-promo__icon ${cls}`, attrs: { src: iconUrl(name), alt: '', 'aria-hidden': true, width: 256, height: 256 } });
    return el(
      'section',
      { class: 'go-promo' },
      div(
        'go-promo__text',
        el('p', { class: 'go-promo__kicker', i18n: 'lobby.promo.kicker' }),
        el('h2', { class: 'go-promo__title', i18n: 'lobby.promo.title' }),
        el('p', { class: 'go-promo__sub', i18n: 'lobby.promo.sub' })
      ),
      div('go-promo__art', art('coin', 'go-promo__icon--a'), art('crown', 'go-promo__icon--b'), art('gem-stone', 'go-promo__icon--c'))
    );
  }

  /**
   * La fascia in testa. Il titolo NON e' fisso: con uno storico vero diventa
   * "i piu' giocati", altrimenti "in evidenza". Chiamare "piu' giocati" una
   * lista scelta da noi al primo avvio sarebbe una bugia che il giocatore
   * smaschera subito.
   */
  private buildRail(): HTMLElement {
    this.railTitle = el('h3', { class: 'go-section__title', i18n: 'lobby.section.featured' });
    this.rail = div('go-grid go-grid--rail');
    this.railSection = el('section', { class: 'go-section' }, this.railTitle, this.rail);
    return this.railSection;
  }

  private buildAllSection(): HTMLElement {
    this.grid = div('go-grid');
    return el('section', { class: 'go-section' }, el('h3', { class: 'go-section__title', i18n: 'lobby.section.all' }), this.grid);
  }

  private buildFilters(): HTMLElement {
    const wrap = div('go-filters');
    wrap.setAttribute('role', 'tablist');
    for (const f of FILTERS) {
      const b = el('button', {
        class: `go-tab${f.value === this.filter ? ' is-active' : ''}`,
        attrs: { type: 'button', role: 'tab', 'data-filter': f.value, 'aria-selected': f.value === this.filter },
        i18n: f.labelKey,
        on: {
          click: () => {
            this.filter = f.value;
            for (const child of wrap.children) {
              const active = child.getAttribute('data-filter') === f.value;
              child.classList.toggle('is-active', active);
              child.setAttribute('aria-selected', String(active));
            }
            this.renderRail();
            this.renderGrid();
          },
        },
      });
      wrap.append(b);
    }
    return wrap;
  }

  // ── Una carta per gioco
  private buildCard(info: GameInfo): HTMLElement {
    const p = progression();
    const tier = tierFor(p.xp);
    // In Gioco Libero e High Roller tutto e' aperto: niente lucchetti finti.
    const unlocked = modeDef().unlockAll || isUnlocked(info, tier.level);
    const playable = isPlayable(info);
    const played = p.gamesPlayed.includes(info.id);
    const state = !unlocked ? 'locked' : !playable ? 'soon' : 'open';
    const requiredTier = VIP_TIERS[info.minTier];

    const cover = div('go-card__cover', gameCover(info.id));
    if (state === 'locked') {
      cover.append(
        div(
          'go-card__lock',
          el('span', { class: 'go-card__lock-glyph', text: '🔒', attrs: { 'aria-hidden': true } }),
          requiredTier ? el('span', { text: t(requiredTier.key as TranslationKey) }) : null
        )
      );
    }
    if (played) cover.append(el('span', { class: 'go-card__badge', i18n: 'lobby.played' }));

    // RTP e volatilita' in chiaro: un casino' vero li nasconde, qui il
    // giocatore impara cosa sta scegliendo.
    const specs = el(
      'dl',
      { class: 'go-card__specs' },
      div('go-card__spec', el('dt', { i18n: 'game.rtp' }), el('dd', { class: 'numeric', text: `${info.rtp.toFixed(1)}%` })),
      div('go-card__spec', el('dt', { i18n: 'game.volatility' }), el('dd', { i18n: `game.volatility.${info.volatility}` }))
    );

    const footerLabel: TranslationKey = state === 'open' ? 'game.play' : state === 'soon' ? 'common.soon' : 'game.locked';
    const action = button({ i18n: footerLabel }, {
      variant: state === 'open' ? 'primary' : 'ghost',
      size: 'sm',
      class: 'go-card__action',
      attrs: state === 'open' ? undefined : { disabled: true },
      onClick: () => this.handlers.onEnter(info.id),
    });

    const hint =
      state === 'locked' && requiredTier
        ? el('p', {
            class: 'go-card__hint',
            text: t('lobby.lockedBody', {
              tier: t(requiredTier.key as TranslationKey),
              xp: num(Math.max(0, requiredTier.xp - p.xp)),
            }),
          })
        : state === 'soon'
          ? el('p', { class: 'go-card__hint', i18n: 'lobby.soonBody' })
          : null;

    const card = el(
      'article',
      { class: `go-card is-${state}` },
      cover,
      div(
        'go-card__body',
        el('h4', { class: 'go-card__name', i18n: info.nameKey }),
        el('p', { class: 'go-card__tag', i18n: info.tagKey }),
        hint ?? specs,
        action
      )
    );
    card.style.setProperty('--card-accent', css(info.accent));
    card.style.setProperty('--card-accent-rgb', rgbTriple(info.accent));

    // Tutta la carta e' cliccabile quando il gioco e' aperto: su touch il
    // bersaglio grande vince. Il pulsante resta come indicazione.
    if (state === 'open') {
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', t(info.nameKey));
      card.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.go-card__action')) return;
        this.handlers.onEnter(info.id);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.handlers.onEnter(info.id);
        }
      });
    } else {
      // Un click su una carta non disponibile non deve restare muto.
      card.addEventListener('click', () => {
        if (state === 'soon') toast(t('lobby.soonBody'), 'info');
        else if (requiredTier) toast(t('game.unlockAt', { tier: t(requiredTier.key as TranslationKey) }), 'warn');
      });
    }
    return card;
  }

  private renderGrid(): void {
    clear(this.grid);
    const list = GAMES.filter((g) => this.filter === 'all' || g.family === this.filter);
    if (!list.length) this.grid.append(el('p', { class: 'go-label', i18n: 'lobby.empty' }));
    else for (const info of list) this.grid.append(this.buildCard(info));
    applyTranslations(this.grid);
  }

  /**
   * I quattro giochi della fascia, contati sullo STORICO REALE delle
   * transazioni (`wallet().history`), non su una lista scritta a mano.
   */
  private renderRail(): void {
    clear(this.rail);
    // Con un filtro attivo la fascia mostrerebbe giochi fuori categoria.
    if (this.filter !== 'all') {
      this.railSection.classList.add('is-hidden');
      return;
    }
    this.railSection.classList.remove('is-hidden');

    const counts = new Map<GameId, number>();
    for (const tx of wallet().history) counts.set(tx.game as GameId, (counts.get(tx.game as GameId) ?? 0) + 1);

    const playable = GAMES.filter(isPlayable);
    const played = playable
      .filter((g) => (counts.get(g.id) ?? 0) > 0)
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));

    const hasHistory = played.length > 0;
    this.railTitle.dataset.i18n = hasHistory ? 'lobby.section.top' : 'lobby.section.featured';
    const list = (hasHistory ? played : playable).slice(0, 4);
    for (const info of list) this.rail.append(this.buildCard(info));
    applyTranslations(this.railSection);
  }

  /** Riallinea saldo e stato di sblocco. Da chiamare a ogni rientro. */
  refresh(): void {
    this.top.refresh();
    this.renderRail();
    this.renderGrid();
  }

  retranslate(): void {
    applyTranslations(this.root);
    this.refresh();
  }

  show(): void {
    this.root.classList.remove('is-hidden');
    this.refresh();
  }

  hide(): void {
    this.root.classList.add('is-hidden');
  }

  destroy(): void {
    this.root.remove();
  }
}
