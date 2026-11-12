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
import { showModal, closeModal, isModalOpen, dismissModal } from './dom/Modal';
import { installToasts, toast } from './dom/Toasts';
import { isTutorialOpen, closeTutorial } from './dom/Tutorial';
import { coverPage, revealPage } from './dom/PageVeil';
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

/** Voce della cronologia del browser: la schermata e la sua posizione. */
interface HistoryEntry {
  rm: View;
  i: number;
  g: GameId | null;
}

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
    const changed = v !== this._view;
    this._view = v;
    document.documentElement.classList.toggle('in-game', v === 'game');
    if (changed && !this.fromHistory) this.recordView(v);
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
    this.wireHistory();

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
   * Passaggio fra menu e lobby.
   *
   * Menu e lobby sono due overlay DOM sopra la STESSA scena Pixi: non c'e'
   * nessuno scambio di scena da fare. Il velo DOM (PageVeil) copre, le
   * schermate si scambiano di colpo sotto di lui, e il velo si riapre: cosi'
   * il primo disegno della schermata nuova non si vede mai a meta'.
   */
  private async navigate(to: 'menu' | 'lobby'): Promise<void> {
    if (this.navigating || this.view === to) return;
    this.navigating = true;
    try {
      await coverPage();
      // Mentre lo schermo si copriva si e' entrati in un gioco: la vista di
      // destinazione non esiste piu'. Applicarla ora rimetterebbe la lobby
      // (e la sua musica) sopra la partita; il velo lo riapre l'ingresso.
      if (this.view === 'game') return;
      try {
        this.applyView(to);
      } finally {
        await revealPage();
      }
    } finally {
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

  /**
   * Lo scambio degli overlay DOM e del mood. Di norma istantaneo (avviene
   * sotto un velo); con `fade` la schermata compare in dissolvenza, per
   * l'uscita da un tavolo mentre si apre il velo della fiche.
   */
  private applyView(to: 'menu' | 'lobby', fade = false): void {
    if (fade) this.fadeScreens();
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

    if (this.entering) return;
    this.entering = true;
    try {
      this.activeGame = id;
      this.view = 'game';
      // L'ingresso resta quello della fiche: home o sala svaniscono (una sola
      // schermata in dissolvenza, non due incrociate) mentre sotto sale il
      // velluto rosso con la fiche che gira.
      this.fadeScreens();
      this.menu.hide();
      this.lobby.hide();
      audio.setMood(info.mood);

      const factory = info.scene;
      await scenes.goTo(() => factory(), 'chip');
    } finally {
      this.entering = false;
    }
  }

  /** Vero durante l'ingresso in un gioco: evita due ingressi sovrapposti. */
  private entering = false;

  /**
   * Il prossimo nascondi/mostra di home e sala avviene con una breve
   * dissolvenza (`.is-fading`): serve solo entrando in un tavolo e uscendone,
   * insieme al velo della fiche. Gli scambi fra home e sala restano
   * istantanei sotto il velo DOM.
   */
  private fadeScreens(): void {
    const roots = [this.menu.root, this.lobby.root];
    for (const r of roots) r.classList.add('is-fading');
    window.setTimeout(() => {
      for (const r of roots) r.classList.remove('is-fading');
    }, 400);
  }

  /** Solo sviluppo: entra in un gioco saltando i controlli di rango. */
  async devEnter(id: GameId): Promise<void> {
    const info = gameById(id);
    if (!info.scene) return;
    this.activeGame = id;
    this.view = 'game';
    this.menu.hide();
    this.lobby.hide();
    audio.setMood(info.mood);
    const factory = info.scene;
    await scenes.goTo(() => factory(), 'instant');
  }

  /** Uscita da un gioco verso la sala. Ripristina la scena atmosferica. */
  async exitGame(to: 'menu' | 'lobby' = 'lobby'): Promise<void> {
    if (this.view !== 'game' || this.leaving) return;
    this.leaving = true;
    try {
      if (!(await scenes.canLeave())) return;
      // Uscita con la fiche, come l'ingresso. La sala torna A VELO CHIUSO e
      // svanisce dentro mentre il velluto rosso si apre: prima compariva
      // dopo, in dissolvenza sopra una scena appena ricostruita, ed era li'
      // lo scatto che si vedeva appena usciti.
      this.activeGame = null;
      await scenes.goTo(() => new AtmosphereScene(), 'chip', () => this.applyView(to, true));
      // Scambio rifiutato (un'altra transizione in corso): la vista va
      // comunque rimessa, come prima.
      if (this.view === 'game') this.applyView(to);
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

  // ═══════════════════════════════════════════════ CRONOLOGIA DEL BROWSER

  /**
   * Il tasto Indietro del browser riporta alla schermata precedente invece
   * di chiudere il sito.
   *
   * Ogni schermata (menu, sala, gioco) e' una voce della cronologia. Le voci
   * rispecchiano il percorso: tornare indietro dentro il sito (pulsante,
   * Esc) arretra anche nella cronologia invece di aggiungere voci, e un
   * gioco da cui si e' usciti viene sostituito dalla schermata di arrivo.
   * Cosi' Indietro non ripercorre all'infinito menu → sala → menu.
   */
  private histViews: View[] = [];
  private histIndex = 0;
  /** Vero mentre si applica una voce della cronologia: non va registrata. */
  private fromHistory = false;
  /** `popstate` provocati da noi con `history.back()`, da non rieseguire. */
  private skipPops = 0;

  private wireHistory(): void {
    this.histViews = [this.view];
    this.histIndex = 0;
    history.replaceState(this.entry(this.view), '');
    window.addEventListener('popstate', (e) => void this.onPopState(e.state));
  }

  private entry(v: View): HistoryEntry {
    return { rm: v, i: this.histIndex, g: v === 'game' ? this.activeGame : null };
  }

  private pushEntry(v: View): void {
    this.histIndex++;
    this.histViews.length = this.histIndex;
    this.histViews.push(v);
    history.pushState(this.entry(v), '');
  }

  /** Il sito ha cambiato schermata da solo: la cronologia lo segue. */
  private recordView(v: View): void {
    if (this.histIndex > 0 && this.histViews[this.histIndex - 1] === v) {
      this.histIndex--;
      this.skipPops++;
      history.back();
      return;
    }
    if (this.histViews[this.histIndex] === 'game') {
      this.histViews[this.histIndex] = v;
      history.replaceState(this.entry(v), '');
      return;
    }
    this.pushEntry(v);
  }

  /** Indietro/Avanti del browser: si va alla schermata della voce raggiunta. */
  private async onPopState(state: unknown): Promise<void> {
    if (this.skipPops > 0) {
      this.skipPops--;
      return;
    }
    const s = state as HistoryEntry | null;
    if (!s || typeof s.rm !== 'string') return;
    const from = this.histIndex;
    this.histIndex = s.i;
    this.histViews[s.i] = s.rm;

    // Si resta sulla schermata: si torna alla voce da cui si veniva, che
    // esiste ancora. Aggiungerne una nuova senza un click la farebbe
    // ignorare da Chrome al prossimo Indietro.
    const stay = () => {
      if (from === s.i) return;
      this.histIndex = from;
      this.skipPops++;
      history.go(from - s.i);
    };

    // Con una modale aperta, Indietro la chiude (come Esc) e la schermata
    // resta.
    if (isModalOpen()) {
      dismissModal();
      stay();
      return;
    }
    // Il tutorial invece non trattiene: si chiude e si lascia il gioco.
    if (isTutorialOpen()) closeTutorial();

    this.fromHistory = true;
    try {
      if (s.rm === 'game') {
        if (this.view !== 'game' && s.g) await this.enterGame(s.g);
      } else if (this.view === 'game') {
        await this.exitGame(s.rm);
      } else {
        await this.navigate(s.rm);
      }
    } finally {
      this.fromHistory = false;
    }
    // Uscita rifiutata (mano in corso) o schermata bloccata: si resta dove
    // si e', e la cronologia torna a dirlo.
    if (this.view !== s.rm) stay();
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
