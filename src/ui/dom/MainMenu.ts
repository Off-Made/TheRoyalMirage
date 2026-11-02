/**
 * THE ROYAL MIRAGE — Home
 *
 * Primo schermo dopo il boot. Overlay HTML a tutta finestra, con il proprio
 * fondo fotografico (la Strip di notte, le fontane del Bellagio): e'
 * responsive anche in verticale, a differenza del canvas dei giochi.
 *
 * ── Gerarchia ──
 *   1. L'insegna. E' l'unico elemento "rumoroso" della pagina: lampadine,
 *      oro, un filo di neon. Si accende una volta all'apertura, poi resta.
 *   2. Due azioni: entrare in sala (primaria) o scegliere la modalita'.
 *   3. Lo stato del giocatore (rango, XP, bonus) in una card di vetro.
 *   4. La vetrina: quattro tavoli raggiungibili con un click.
 */

import { div, el, button, progressBar } from './el';
import { applyTranslations, t, num } from '@/i18n';
import type { TranslationKey } from '@/i18n';
import { wallet, progression, modeDef } from '@/state/store';
import { tierFor, tierProgress, nextTier, canClaimDaily } from '@/state/progression';
import { css } from '@/art/palette';
import { iconUrl } from '@/art/images';
import { gameById, type GameId } from '@/games/registry';
import { TopBar } from './TopBar';
import { gameCover } from './GameCover';

export interface MainMenuHandlers {
  onPlay: () => void;
  onEnter: (id: GameId) => void;
  onLobby: () => void;
  onModes: () => void;
  onSettings: () => void;
  onProfile: () => void;
  onDaily: () => void;
}

/** I tavoli in vetrina: una slot per tipo, un tavolo di carte, la ruota, la fiche d'oro. */
const SHOWCASE: readonly GameId[] = ['goldenOasis', 'blackjack', 'roulette', 'crash'];

export class MainMenu {
  readonly root: HTMLElement;
  private top: TopBar;
  private rankValue!: HTMLElement;
  private modeValue!: HTMLElement;
  private xpBar!: HTMLElement;
  private xpLabel!: HTMLElement;
  private dailyBtn!: HTMLButtonElement;
  private playBtn!: HTMLButtonElement;

  constructor(private handlers: MainMenuHandlers) {
    this.top = new TopBar(
      {
        onHome: () => undefined,
        onLobby: handlers.onLobby,
        onProfile: handlers.onProfile,
        onSettings: handlers.onSettings,
      },
      'home'
    );
    this.root = div('go-screen go-menu');
    this.root.append(
      this.top.root,
      div('go-menu__main', this.buildHero(), this.buildStatus()),
      this.buildShowcase(),
      el('p', { class: 'go-legal', i18n: 'app.legal' })
    );
    applyTranslations(this.root);
    this.refresh();
  }

  // ── L'insegna e le azioni
  private buildHero(): HTMLElement {
    const sign = div(
      'go-sign',
      el('span', { class: 'go-sign__neon', text: 'Las Vegas', attrs: { 'aria-hidden': true } }),
      el(
        'h1',
        { class: 'go-sign__title' },
        el('span', { class: 'go-sign__the', text: 'The' }),
        el('span', { class: 'go-sign__name', text: 'Royal Mirage' })
      )
    );

    this.playBtn = button({ i18n: 'menu.play' }, {
      variant: 'secondary',
      size: 'lg',
      onClick: this.handlers.onPlay,
    });

    return div(
      'go-hero',
      sign,
      el('p', { class: 'go-hero__tagline', i18n: 'home.tagline' }),
      div(
        'go-hero__actions',
        button({ i18n: 'home.enter' }, { variant: 'primary', size: 'lg', class: 'go-hero__cta', onClick: this.handlers.onLobby }),
        this.playBtn,
        button({ i18n: 'menu.modes' }, { variant: 'ghost', size: 'lg', onClick: this.handlers.onModes })
      )
    );
  }

  // ── Card di stato
  private buildStatus(): HTMLElement {
    this.rankValue = el('span', { class: 'go-status__rank' });
    this.modeValue = el('span', { class: 'go-status__mode' });
    this.xpLabel = el('span', { class: 'go-status__xp-label numeric' });
    const bar = progressBar(0, 'go-status__xp');
    this.xpBar = bar.querySelector<HTMLElement>('.go-progress__fill')!;

    this.dailyBtn = button({ i18n: 'daily.title' }, {
      variant: 'primary',
      class: 'go-status__daily',
      onClick: () => {
        this.handlers.onDaily();
        this.refresh();
      },
    });
    this.dailyBtn.prepend(
      el('img', { class: 'go-status__gift', attrs: { src: iconUrl('wrapped-gift'), alt: '', 'aria-hidden': true, width: 30, height: 30 } })
    );

    return el(
      'aside',
      { class: 'go-status glass' },
      div(
        'go-status__row',
        div('go-status__cell', el('span', { class: 'go-label', i18n: 'vip.title' }), this.rankValue),
        div('go-status__cell', el('span', { class: 'go-label', i18n: 'mode.label' }), this.modeValue)
      ),
      div('go-status__progress', bar, this.xpLabel),
      this.dailyBtn
    );
  }

  // ── Vetrina
  private buildShowcase(): HTMLElement {
    const tiles = SHOWCASE.map((id) => {
      const info = gameById(id);
      const tile = el(
        'button',
        { class: 'go-tile', attrs: { type: 'button' }, on: { click: () => this.handlers.onEnter(id) } },
        gameCover(id, 'sm'),
        div('go-tile__text', el('span', { class: 'go-tile__name', i18n: info.nameKey }), el('span', { class: 'go-tile__tag', i18n: info.tagKey }))
      );
      return tile;
    });
    return el(
      'section',
      { class: 'go-showcase', attrs: { 'aria-labelledby': 'go-showcase-title' } },
      div(
        'go-showcase__head',
        el('h2', { class: 'go-showcase__title', id: 'go-showcase-title', i18n: 'home.tonight' }),
        el('button', { class: 'go-link', attrs: { type: 'button' }, i18n: 'home.allGames', on: { click: this.handlers.onLobby } })
      ),
      div('go-showcase__grid', ...tiles)
    );
  }

  /** Riallinea i valori allo stato. Al rientro e dopo ogni azione sul portafoglio. */
  refresh(): void {
    const p = progression();
    const tier = tierFor(p.xp);
    const next = nextTier(tier.level);
    this.top.refresh();

    this.rankValue.textContent = t(tier.key as TranslationKey);
    this.rankValue.style.color = css(tier.color);
    this.modeValue.textContent = t(modeDef().nameKey as TranslationKey);

    this.xpBar.style.width = `${tierProgress(p.xp) * 100}%`;
    this.xpLabel.textContent = next ? t('vip.nextAt', { xp: num(Math.max(0, next.xp - p.xp)) }) : t('vip.maxed');

    const claimable = canClaimDaily(p);
    this.dailyBtn.disabled = !claimable;
    this.dailyBtn.classList.toggle('is-ready', claimable);

    // "Continua" invece di "Gioca" se esiste gia' una partita: dire al
    // giocatore che il suo progresso c'e' conta piu' dell'uniformita'.
    const hasProgress = wallet().spins > 0 || p.xp > 0;
    const label = this.playBtn.querySelector<HTMLElement>('.go-btn__label');
    if (label) {
      label.dataset.i18n = hasProgress ? 'home.continue' : 'home.quickPlay';
      label.textContent = t(hasProgress ? 'home.continue' : 'home.quickPlay');
    }
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
