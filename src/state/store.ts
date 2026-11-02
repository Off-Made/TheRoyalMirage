/**
 * THE ROYAL MIRAGE — Store globale
 *
 * Unica fonte di verita' dello stato persistente. Zustand "vanilla" (senza
 * React): le scene Pixi e l'overlay DOM si iscrivono con `subscribe`.
 *
 * ── Il protocollo di puntata in due fasi ──
 *   1. `placeBet(game, amount)` → scala SUBITO le fiche, prima dell'esito
 *   2. `settle(game, bet, payout)` → accredita la vincita (anche 0)
 *
 * Perche' due fasi: se l'utente chiude la scheda a rulli ancora in moto, la
 * puntata e' gia' stata pagata e non c'e' modo di "annullarla" ricaricando.
 * E' lo stesso motivo per cui le slot reali scalano il credito al click.
 */

import { createStore } from 'zustand/vanilla';
import {
  type WalletState,
  initialWallet,
  HISTORY_LIMIT,
  clampBet,
  halfBet,
  doubleBet,
  isBroke as balanceIsBroke,
} from './wallet';
import {
  type ProgressionState,
  initialProgression,
  xpForWager,
  tierFor,
  VIP_TIERS,
  canClaimDaily,
  nextStreak,
  dailyBonusAmount,
  todayKey,
} from './progression';
import { type SettingsState, initialSettings } from './settings';
import { type ModeId, MODES } from './modes';
import { load, debouncedSaver, wipe } from './save';
import { bus } from './events';

export interface ProfileState {
  name: string;
  createdAt: number;
  /** Ultima modalita' usata: si riparte da li'. */
  lastMode: ModeId;
}

export interface PersistedState {
  profile: ProfileState;
  settings: SettingsState;
  progression: ProgressionState;
  wallets: Record<ModeId, WalletState>;
}

export interface GameState extends PersistedState {
  /** Modalita' attiva nella sessione corrente (non persistita a parte). */
  mode: ModeId;
}

function walletFor(mode: ModeId): WalletState {
  return { ...initialWallet(), balance: MODES[mode].startingBalance };
}

function defaults(): PersistedState {
  return {
    profile: { name: '', createdAt: Date.now(), lastMode: 'career' },
    settings: initialSettings(),
    progression: initialProgression(),
    wallets: {
      career: walletFor('career'),
      freeplay: walletFor('freeplay'),
      highroller: walletFor('highroller'),
    },
  };
}

const loaded = load(defaults());

export const store = createStore<GameState>(() => ({
  ...loaded,
  mode: loaded.profile.lastMode,
}));

const saver = debouncedSaver<PersistedState>(() => {
  const { profile, settings, progression, wallets } = store.getState();
  return { profile, settings, progression, wallets };
});

store.subscribe(() => saver.schedule());
// Scrittura sincrona alla chiusura: il debounce perderebbe l'ultimo spin.
window.addEventListener('beforeunload', () => saver.flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saver.flush();
});

// ─────────────────────────────────────────────── SELETTORI

export const getState = () => store.getState();
export const wallet = (): WalletState => store.getState().wallets[store.getState().mode];
export const settings = (): SettingsState => store.getState().settings;
export const progression = (): ProgressionState => store.getState().progression;
export const modeDef = () => MODES[store.getState().mode];

/**
 * Puntata massima: il SALDO, e nient'altro.
 *
 * Prima era il minimo fra saldo, massimale del rango VIP e taglio piu' alto.
 * La richiesta e' esplicita — "nessun limite artificiale oltre al saldo" —
 * quindi il rango VIP non limita piu' la puntata (resta un traguardo di
 * progressione, con i suoi altri vantaggi).
 */
export function betCeiling(factor = 1): number {
  return stakeCeiling(wallet().balance, factor);
}

/**
 * Tetto della puntata quando la giocata vale `puntata × factor` (il video
 * poker: valore moneta × monete). Arrotondato PER DIFETTO al centesimo:
 * per eccesso la giocata totale supererebbe il saldo di qualche centesimo e
 * verrebbe rifiutata.
 */
function stakeCeiling(balance: number, factor: number): number {
  const f = Number.isFinite(factor) && factor >= 1 ? Math.floor(factor) : 1;
  return Math.floor(balance / f);
}

/** A secco: il saldo della modalita' corrente non copre la puntata minima. */
export function isBroke(): boolean {
  return balanceIsBroke(wallet().balance);
}

// ─────────────────────────────────────────────── AZIONI INTERNE

function patchWallet(fn: (w: WalletState) => WalletState): void {
  store.setState((s) => ({
    wallets: { ...s.wallets, [s.mode]: fn(s.wallets[s.mode]) },
  }));
}

function patchProgression(fn: (p: ProgressionState) => ProgressionState): void {
  store.setState((s) => ({ progression: fn(s.progression) }));
}

/** Aggiunge XP e gestisce l'eventuale salto di rango (anche multiplo). */
function grantXp(amount: number): void {
  if (!modeDef().progression) return;
  const before = progression();
  const xp = before.xp + amount;
  const tier = tierFor(xp);
  patchProgression((p) => ({ ...p, xp, level: tier.level }));

  // Un'unica puntata enorme puo' far saltare piu' ranghi: premiamoli tutti.
  for (let lv = before.level + 1; lv <= tier.level; lv++) {
    const t = VIP_TIERS[lv]!;
    patchWallet((w) => ({ ...w, balance: w.balance + t.reward }));
    bus.emit('vip:levelup', { level: lv, reward: t.reward });
  }
}

// ─────────────────────────────────────────────── AZIONI PUBBLICHE

export const actions = {
  /**
   * Scala la puntata. Restituisce false (e non tocca nulla) se il saldo non
   * basta: chi chiama NON deve avviare lo spin in quel caso.
   *
   * `countRound: false` serve ai costi AGGIUNTIVI di una stessa giocata
   * (raddoppio, divisione, assicurazione del blackjack): scalano le fiche e
   * contano nel totale giocato, ma non sono una giocata in piu' — altrimenti
   * una mano divisa conterebbe come tre e le statistiche mentirebbero.
   */
  placeBet(game: string, amount: number, opts: { countRound?: boolean } = {}): boolean {
    const bet = Math.round(amount);
    // Number.isFinite PRIMA di qualunque confronto: `Math.round(NaN)` e' NaN,
    // e NaN sopravvive sia a `<= 0` sia a `balance < bet` perche' ogni
    // confronto con NaN e' falso. Senza questa riga una puntata NaN passa e
    // il saldo diventa NaN per il resto della sessione (e nel salvataggio).
    if (!Number.isFinite(bet) || bet <= 0) return false;
    const w = wallet();
    if (w.balance < bet) {
      bus.emit('wallet:insufficient', { needed: bet, balance: w.balance });
      return false;
    }
    const countRound = opts.countRound ?? true;
    patchWallet((x) => ({
      ...x,
      balance: x.balance - bet,
      totalWagered: x.totalWagered + bet,
      spins: x.spins + (countRound ? 1 : 0),
    }));
    patchProgression((p) =>
      p.gamesPlayed.includes(game) ? p : { ...p, gamesPlayed: [...p.gamesPlayed, game] }
    );
    grantXp(xpForWager(bet));
    bus.emit('wallet:bet', { game, bet });
    return true;
  },

  /** Accredita l'esito. `payout` e' la vincita LORDA (puntata inclusa se restituita). */
  settle(game: string, bet: number, payout: number): void {
    // `Math.max(0, NaN)` e' NaN: il clamp da solo non protegge nulla.
    const raw = Math.round(payout);
    const win = Number.isFinite(raw) ? Math.max(0, raw) : 0;
    patchWallet((x) => {
      const balance = x.balance + win;
      const history = [{ at: Date.now(), game, bet, payout: win, balance }, ...x.history];
      return {
        ...x,
        balance,
        // Dopo una perdita la puntata non puo' restare sopra il saldo: il
        // pulsante di gioco si accenderebbe su una giocata impossibile.
        // A secco la si lascia com'e': non c'e' niente da adattare.
        bet: balanceIsBroke(balance) ? x.bet : Math.min(x.bet, balance),
        totalWon: x.totalWon + win,
        biggestWin: Math.max(x.biggestWin, win),
        history: history.slice(0, HISTORY_LIMIT),
      };
    });
    bus.emit('wallet:settle', { game, bet, payout: win });
    actions.checkBust();
    actions.checkGoal();
  },

  /** Regalo in fiche (ricompense dei riconoscimenti). */
  grant(amount: number): void {
    const n = Math.round(amount);
    const safe = Number.isFinite(n) ? Math.max(0, n) : 0;
    patchWallet((x) => ({ ...x, balance: x.balance + safe }));
  },

  /** Rimborso di una puntata annullata (es. errore di gioco). Mai negativo. */
  refund(amount: number): void {
    const n = Math.round(amount);
    const safe = Number.isFinite(n) ? Math.max(0, n) : 0;
    if (safe === 0) return;
    patchWallet((x) => ({ ...x, balance: x.balance + safe }));
  },

  /** Puntata libera, al centesimo: qualunque importo fra il minimo e il saldo. */
  setBet(amount: number): void {
    const bet = clampBet(amount, betCeiling());
    patchWallet((x) => ({ ...x, bet }));
  },

  /** −/+ della plancia: dimezza o raddoppia (scala geometrica, come le slot). */
  stepBet(dir: 1 | -1): void {
    if (dir > 0) actions.doubleBet();
    else actions.halfBet();
  },

  halfBet(): void {
    patchWallet((x) => ({ ...x, bet: halfBet(x.bet, x.balance) }));
  },

  /** `factor`: moltiplicatore della giocata (monete del video poker), default 1. */
  doubleBet(factor = 1): void {
    patchWallet((x) => ({ ...x, bet: doubleBet(x.bet, stakeCeiling(x.balance, factor)) }));
  },

  minBet(): void {
    actions.setBet(0);
  },

  /**
   * ALL-IN: la giocata diventa l'intero saldo. Non gioca: il giro lo decide
   * il giocatore. Con un moltiplicatore (`factor`) la PUNTATA e' il saldo
   * diviso per le monete, cosi' e' la GIOCATA a valere tutto il saldo.
   */
  allIn(factor = 1): void {
    patchWallet((x) => ({ ...x, bet: clampBet(stakeCeiling(x.balance, factor), x.balance) }));
  },

  /** A secco: freeplay si ricarica, high roller fallisce, la carriera mostra la ripartenza. */
  checkBust(): void {
    if (!isBroke()) return;
    const m = modeDef();
    if (m.autoRefill) {
      patchWallet((x) => ({ ...x, balance: m.startingBalance }));
      bus.emit('wallet:refilled', { amount: m.startingBalance });
    } else if (m.goal !== null) {
      bus.emit('mode:failed', { mode: m.id });
    } else {
      bus.emit('wallet:bust', {});
    }
  },

  checkGoal(): void {
    const m = modeDef();
    if (m.goal !== null && wallet().balance >= m.goal) {
      bus.emit('mode:won', { mode: m.id, balance: wallet().balance });
    }
  },

  /**
   * Ricomincia col saldo iniziale della modalita' (100 € in carriera).
   *
   * Sostituisce il vecchio rebuy da 2.500 fiche con 3 minuti d'attesa: la
   * richiesta e' una schermata chiara con un solo pulsante, e un'attesa
   * imposta li' sarebbe solo un ostacolo. Si puo' solo se si e' davvero a
   * secco, altrimenti diventerebbe una ricarica gratuita a comando.
   * Rango, riconoscimenti e statistiche restano: si riparte col denaro, non
   * con la carriera.
   */
  restart(): boolean {
    if (!isBroke()) return false;
    const amount = modeDef().startingBalance;
    patchWallet((x) => ({ ...x, balance: amount, bet: clampBet(initialWallet().bet, amount) }));
    bus.emit('wallet:restart', { amount });
    return true;
  },

  /** Riscuote il bonus del giorno. Restituisce l'importo, 0 se gia' riscosso. */
  claimDaily(): number {
    const p = progression();
    const today = todayKey();
    if (!canClaimDaily(p, today)) return 0;
    const streak = nextStreak(p, today);
    const amount = dailyBonusAmount(streak, p.level);
    patchProgression((x) => ({ ...x, streak, lastBonusDay: today }));
    patchWallet((x) => ({ ...x, balance: x.balance + amount }));
    bus.emit('daily:claimed', { amount, streak });
    return amount;
  },

  switchMode(mode: ModeId): void {
    store.setState((s) => ({ mode, profile: { ...s.profile, lastMode: mode } }));
    bus.emit('mode:changed', { mode });
  },

  /** Ricomincia una modalita' da capo (usato dopo vittoria/sconfitta high roller). */
  resetMode(mode: ModeId): void {
    store.setState((s) => ({ wallets: { ...s.wallets, [mode]: walletFor(mode) } }));
  },

  updateSettings(patch: Partial<SettingsState>): void {
    store.setState((s) => ({ settings: { ...s.settings, ...patch } }));
    bus.emit('settings:changed', patch);
  },

  setName(name: string): void {
    const clean = name.trim().slice(0, 18);
    store.setState((s) => ({ profile: { ...s.profile, name: clean } }));
  },

  unlockAchievement(id: string): boolean {
    if (progression().achievements.includes(id)) return false;
    patchProgression((p) => ({ ...p, achievements: [...p.achievements, id] }));
    bus.emit('achievement:unlocked', { id });
    return true;
  },

  /** Cancella TUTTO. Chiamato solo dalle impostazioni, dopo conferma. */
  wipeAll(): void {
    wipe();
    const fresh = defaults();
    store.setState({ ...fresh, mode: 'career' }, true);
  },

  flushSave(): void {
    saver.flush();
  },
};
