/**
 * THE ROYAL MIRAGE — Shell dell'interfaccia
 *
 * Il coordinatore dell'overlay HTML. Possiede le schermate persistenti
 * (menu e lobby), apre le modali, e traduce gli eventi dello store in
 * feedback visibile (toast, modali di esito).
 *
 * ── Perche' menu e lobby non vengono distrutti ──
 * Sono due `div` che si limitano a nascondersi a vicenda. Ricostruirli a
 * ogni navigazione costerebbe un reflow e farebbe perdere la posizione di
 * scroll della lobby. Le scene Pixi dei giochi, invece, si smontano
 * davvero: quelle allocano texture GPU e non possono restare appese.
 */

import { MainMenu } from './dom/MainMenu';
import { Lobby } from './dom/Lobby';
import { openSettings } from './dom/SettingsModal';
import { openModes } from './dom/ModesModal';
import { openProfile } from './dom/ProfileModal';
import { showModal, closeModal, isModalOpen } from './dom/Modal';
import { installToasts, toast } from './dom/Toasts';
import { div, el, button } from './dom/el';
import { applyTranslations, t, num, onLanguageChange } from '@/i18n';
import type { TranslationKey } from '@/i18n';
import { bus } from '@/state/events';
import { actions, getState, progression, modeDef, wallet } from '@/state/store';
import { formatMoney } from '@/state/wallet';
import { showBrokeModal } from './dom/BrokeModal';
import { tierFor, VIP_TIERS } from '@/state/progression';
import { MODES } from '@/state/modes';
import { audio } from '@/audio/AudioManager';
import { sfxLevelUp, sfxCoin, sfxDenied } from '@/audio/synth';
import { scenes } from '@/core/SceneManager';
import { AtmosphereScene } from '@/scenes/AtmosphereScene';
import { DEFAULT_GAME, gameById, type GameId } from '@/games/registry';
import { ACHIEVEMENTS, installAchievementTracker } from '@/state/achievements';
import { iconUrl, preloadImages } from '@/art/images';
import { COVER_ICONS } from './dom/GameCover';

type View = 'menu' | 'lobby' | 'game';

/**
 * Raggiungere i ranghi 3 e 7 emette `vip:levelup` E sblocca nello stesso
 * istante il riconoscimento del rango: due fanfare sovrapposte per un solo
 * momento. I toast restano due (dicono cose diverse), il suono uno.
 */
let lastCelebration = 0;
function celebrate(): void {
  const now = performance.now();
  if (now - lastCelebration < 600) return;
  lastCelebration = now;
  sfxLevelUp();
}

class ShellImpl {
  private host!: HTMLElement;
  private menu!: MainMenu;
  private lobby!: Lobby;
  private _view: View = 'menu';
  private get view(): View {
    return this._view;
  }
  /**
   * `html.in-game` mentre si e' a un tavolo: serve al CSS per l'invito a
   * ruotare il telefono, che non deve comparire su home e sala (quelle
   * funzionano anche in verticale).
   */
  private set view(v: View) {
    this._view = v;
    document.documentElement.classList.toggle('in-game', v === 'game');
  }
  /** Gioco attivo, per sapere a cosa tornare uscendo da una modale. */
  private activeGame: GameId | null = null;

  /**
   * Monta l'overlay. Da chiamare UNA volta, dopo che il renderer Pixi
   * esiste: la lobby e il menu si disegnano sopra la scena atmosferica.
   */
  install(hostId = 'overlay'): void {
    const host = document.getElementById(hostId);
    if (!host) throw new Error(`Elemento #${hostId} assente in index.html`);
    this.host = host;

    installToasts();
    // Le icone delle copertine servono a home e sala: in cache prima che
    // l'utente ci arrivi, cosi' nessuna card compare senza la sua figura.
    void preloadImages(COVER_ICONS.map(iconUrl));

    this.menu = new MainMenu({
      onPlay: () => void this.enterGame(DEFAULT_GAME),
      onEnter: (id) => void this.enterGame(id),
      onLobby: () => this.goLobby(),
      onModes: () => openModes(() => this.afterModeChange()),
      onSettings: () => openSettings(() => this.retranslate()),
      onProfile: () => openProfile(),
      onDaily: () => this.claimDaily(),
    });

    this.lobby = new Lobby({
      onEnter: (id) => void this.enterGame(id),
      onBack: () => this.goMenu(),
      onProfile: () => openProfile(),
      onSettings: () => openSettings(() => this.retranslate()),
    });

    this.host.append(this.menu.root, this.lobby.root);
    document.body.append(this.buildRotateHint());

    audio.bindUiSounds();
    audio.setMood('menu');

    this.wireEvents();
    this.wireKeyboard();

    installAchievementTracker({
      ctx: () => ({ wallet: wallet(), progression: progression() }),
      unlock: (id) => actions.unlockAchievement(id),
      reward: (amount) => actions.grant(amount),
      enabled: () => modeDef().progression,
    });

    // Un cambio di lingua deve ricostruire le etichette di schermate che
    // sono state costruite prima del cambio.
    onLanguageChange(() => this.retranslate());
  }

  // ═══════════════════════════════════════════════ NAVIGAZIONE

  /**
   * Passaggio fra menu e lobby, con la stessa fiche dei giochi.
   *
   * Menu e lobby sono due overlay DOM sopra la STESSA scena Pixi: non c'e'
   * nessuno scambio di scena da fare, cambia solo l'AMBIENTE dello sfondo.
   * Per questo il tempismo sta qui e non nel SceneManager: lo schermo si
   * copre, e SOLO da coperto si cambiano ambiente e overlay — i ~20 ms di
   * cottura delle texture nuove restano invisibili.
   */
  private async navigate(to: 'menu' | 'lobby'): Promise<void> {
    if (this.navigating || this.view === to) return;
    this.navigating = true;
    const veil = scenes.mountTransition('chip');
    try {
      await veil.cover();
      // Mentre lo schermo si copriva si e' entrati in un gioco: la vista di
      // destinazione non esiste piu'. Applicarla ora rimetterebbe la lobby
      // (e la sua musica) sopra la partita.
      if (this.view === 'game') return;
      this.applyView(to);
      await veil.reveal();
    } finally {
      scenes.unmountTransition(veil);
      this.navigating = false;
    }
  }

  /**
   * Invito a ruotare il telefono: i tavoli sono composti in orizzontale.
   * Sempre nel DOM, lo mostra il CSS (`.is-compact.is-portrait.in-game`),
   * cosi' segue la rotazione senza codice.
   */
  private buildRotateHint(): HTMLElement {
    return div(
      'go-rotate',
      div('go-rotate__phone', div('go-rotate__screen')),
      el('p', { class: 'go-rotate__title', i18n: 'rotate.title', text: t('rotate.title') }),
      el('p', { class: 'go-rotate__body', i18n: 'rotate.body', text: t('rotate.body') })
    );
  }

  /** Lo scambio degli overlay DOM e del mood: niente animazioni. */
  private applyView(to: 'menu' | 'lobby'): void {
    this.view = to;
    if (to === 'menu') {
      this.activeGame = null;
      this.lobby.hide();
      this.menu.show();
    } else {
      this.menu.hide();
      this.lobby.show();
    }
    audio.setMood(to);
  }

  private navigating = false;

  private goMenu(): void {
    void this.navigate('menu');
  }

  private goLobby(): void {
    void this.navigate('lobby');
  }

  /**
   * Entra in un gioco. Il caricatore della scena vive nel registry, quindi
   * la Shell non conosce nessun gioco in particolare.
   */
  private async enterGame(id: GameId): Promise<void> {
    const info = gameById(id);
    const tier = tierFor(progression().xp);

    if (tier.level < info.minTier && !modeDef().unlockAll) {
      sfxDenied();
      // Il nome del rango richiesto viene da VIP_TIERS: una lista di
      // stringhe parallela si sfaserebbe al primo rango aggiunto.
      const required = VIP_TIERS[info.minTier];
      toast(
        t('game.unlockAt', { tier: required ? t(required.key as TranslationKey) : '—' }),
        'warn'
      );
      return;
    }

    // Fase 2: nessuna scena di gioco esiste ancora. Dichiararlo è meglio
    // che portare l'utente su uno schermo nero.
    if (!info.scene) {
      sfxDenied();
      toast(`${t(info.nameKey)} — ${t('lobby.soonBody')}`, 'info');
      return;
    }

    this.view = 'game';
    this.activeGame = id;
    this.menu.hide();
    this.lobby.hide();
    audio.setMood(info.mood);

    const factory = info.scene;
    await scenes.goTo(() => factory(), 'chip');
  }

  /** Solo sviluppo: entra in un gioco saltando i controlli di rango. */
  async devEnter(id: GameId): Promise<void> {
    const info = gameById(id);
    if (!info.scene) return;
    this.view = 'game';
    this.activeGame = id;
    this.menu.hide();
    this.lobby.hide();
    audio.setMood(info.mood);
    const factory = info.scene;
    await scenes.goTo(() => factory(), 'instant');
  }

  /** Uscita da un gioco verso la sala. Ripristina la scena atmosferica. */
  async exitGame(): Promise<void> {
    if (this.view !== 'game' || this.leaving) return;
    this.leaving = true;
    try {
      if (!(await scenes.canLeave())) return;
      this.activeGame = null;
      await scenes.goTo(() => new AtmosphereScene(), 'chip');
      this.applyView('lobby');
    } finally {
      this.leaving = false;
    }
  }

  /** Vero mentre si sta chiedendo/eseguendo l'uscita: evita doppie uscite con Esc. */
  private leaving = false;

  private afterModeChange(): void {
    // Cambiare modalità cambia il portafoglio: ogni schermata che mostra
    // un saldo va riallineata, non solo quella visibile.
    this.menu.refresh();
    this.lobby.refresh();
    toast(t('mode.changed', { mode: t(modeDef().nameKey as TranslationKey) }), 'info');
  }

  private retranslate(): void {
    document.documentElement.lang = getState().settings.language;
    this.menu.retranslate();
    this.lobby.retranslate();
    applyTranslations(document);
  }

  // ═══════════════════════════════════════════════ AZIONI

  private claimDaily(): void {
    const amount = actions.claimDaily();
    if (amount <= 0) {
      toast(t('daily.already'), 'info');
      return;
    }
    const streak = progression().streak;
    sfxCoin();
    sfxCoin(0.08);
    sfxCoin(0.17);
    showModal({
      titleKey: 'daily.title',
      width: 520,
      body: div(
        'go-reward',
        el('img', { class: 'go-reward__icon', attrs: { src: iconUrl('wrapped-gift'), alt: '', 'aria-hidden': true, width: 128, height: 128 } }),
        el('p', { class: 'go-reward__amount numeric gold-text', text: `+${formatMoney(amount)}` }),
        el('p', { class: 'go-reward__note', text: t('daily.streak', { n: streak }) })
      ),
    });
    this.menu.refresh();
  }

  // ═══════════════════════════════════════════════ EVENTI DELLO STORE

  /**
   * Un solo punto in cui gli eventi di dominio diventano interfaccia.
   * Le azioni dello store restano così ignare del DOM: `placeBet` non sa
   * cosa sia un toast, emette solo `wallet:insufficient`.
   */
  private wireEvents(): void {
    bus.on('wallet:insufficient', ({ needed, balance }) => {
      sfxDenied();
      toast(
        `${t('wallet.insufficient')} — ${t('wallet.insufficientDetail', {
          needed: formatMoney(needed),
          balance: formatMoney(balance),
        })}`,
        'warn'
      );
    });

    bus.on('vip:levelup', ({ level, reward }) => {
      const tier = tierFor(progression().xp);
      celebrate();
      toast(
        t('vip.levelup', { tier: t(tier.key as TranslationKey) }) +
          (reward > 0 ? ` · ${t('vip.reward', { coins: formatMoney(reward) })}` : ''),
        'vip',
        5000
      );
      void level;
      this.menu.refresh();
      this.lobby.refresh();
    });

    bus.on('daily:claimed', () => this.menu.refresh());

    bus.on('wallet:refilled', ({ amount }) => {
      toast(t('wallet.refilled', { coins: formatMoney(amount) }), 'info');
    });

    // Saldo esaurito in carriera: una schermata chiara con un solo pulsante,
    // "Ricomincia con 100 €". Nessuna attesa: non c'e' niente da aspettare.
    //
    // Il bus emette `wallet:bust` DENTRO `settle()`, cioe' mentre la scena sta
    // ancora presentando l'esito della giocata (la vincita o la perdita che
    // ha azzerato il saldo). Aprire la modale nello stesso istante coprirebbe
    // quel momento: il giocatore non vedrebbe COME ha perso. Mezzo secondo
    // di respiro lascia leggere l'esito prima della schermata.
    bus.on('wallet:bust', () => {
      window.setTimeout(() => {
        if (isModalOpen()) closeModal();
        showBrokeModal(() => {
          sfxCoin();
          this.menu.refresh();
          this.lobby.refresh();
        });
      }, 900);
    });

    bus.on('wallet:restart', ({ amount }) => {
      toast(t('wallet.restartDone', { amount: formatMoney(amount) }), 'win');
    });

    bus.on('mode:won', ({ mode, balance }) => {
      this.showModeOutcome(true, mode, balance);
    });

    bus.on('mode:failed', ({ mode }) => {
      this.showModeOutcome(false, mode, 0);
    });

    bus.on('achievement:unlocked', ({ id }) => {
      const a = ACHIEVEMENTS.find((x) => x.id === id);
      const name = t(`ach.${id}` as TranslationKey);
      const reward = a && a.reward > 0 ? ` · ${t('achievement.reward', { coins: formatMoney(a.reward) })}` : '';
      celebrate();
      toast(`${a?.icon ?? '✦'} ${t('achievement.unlocked')}: ${name}${reward}`, 'vip', 5200);
    });

    bus.on('ui:toast', ({ text, kind }) => toast(text, kind ?? 'info'));
  }

  /** Esito di una modalità a obiettivo (high roller). */
  private showModeOutcome(won: boolean, mode: keyof typeof MODES, balance: number): void {
    const m = MODES[mode];
    if (isModalOpen()) closeModal();

    const body = div(
      'go-outcome',
      el('img', {
        class: `go-outcome__icon ${won ? 'is-win' : 'is-loss'}`,
        attrs: { src: iconUrl(won ? 'trophy' : 'game-die'), alt: '', 'aria-hidden': true, width: 128, height: 128 },
      }),
      el('p', {
        class: 'go-outcome__msg',
        text: won
          ? t('mode.won.body', { goal: formatMoney(m.goal ?? balance) })
          : t('mode.failed.body'),
      }),
      div(
        'go-outcome__actions',
        button({ i18n: 'mode.restart' }, {
          variant: 'primary',
          onClick: () => {
            actions.resetMode(mode);
            closeModal();
            this.menu.refresh();
            this.lobby.refresh();
          },
        }),
        button({ i18n: 'menu.modes' }, {
          variant: 'secondary',
          onClick: () => {
            closeModal();
            openModes(() => this.afterModeChange());
          },
        })
      )
    );

    showModal({ titleKey: won ? 'mode.won.title' : 'mode.failed.title', width: 560, body });
  }

  // ═══════════════════════════════════════════════ TASTIERA

  /**
   * Scorciatoie globali. Esc è l'unica davvero necessaria: senza, una
   * modale aperta su un dispositivo senza mouse diventa una trappola.
   * (La chiusura con Esc della modale è già in Modal.ts; qui gestiamo la
   * navigazione fra schermate.)
   */
  private wireKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      if (isModalOpen()) return; // la modale ha la precedenza

      switch (e.key) {
        case 'Escape':
          if (this.view === 'lobby') this.goMenu();
          else if (this.view === 'game') void this.exitGame();
          break;
        case 'l':
        case 'L':
          if (this.view === 'menu') this.goLobby();
          break;
        case 's':
        case 'S':
          // Dentro un gioco S e P sono mosse (Stai, Split in inglese): le
          // Impostazioni e il Profilo restano raggiungibili dai pulsanti.
          if (this.view !== 'game') openSettings(() => this.retranslate());
          break;
        case 'p':
        case 'P':
          if (this.view !== 'game') openProfile();
          break;
      }
    });
  }

  // ═══════════════════════════════════════════════ DIAGNOSTICA

  /** Stato corrente, per la console di sviluppo. */
  get debug(): Record<string, unknown> {
    return {
      view: this.view,
      activeGame: this.activeGame,
      mode: getState().mode,
      xp: num(progression().xp),
      tier: tierFor(progression().xp).key,
    };
  }
}

export const shell = new ShellImpl();
