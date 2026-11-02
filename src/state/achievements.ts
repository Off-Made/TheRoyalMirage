/**
 * THE ROYAL MIRAGE — Riconoscimenti
 *
 * Catalogo dichiarativo + tracker che li sblocca ascoltando il bus.
 *
 * ── Due famiglie di condizioni ──
 *   · `check(ctx)`   — deducibili dallo stato (saldo, giocate, rango...):
 *                      si rivalutano dopo ogni evento rilevante
 *   · `event`        — momenti che lo stato NON ricorda (un blackjack
 *                      naturale, una scala reale): li emette il gioco con
 *                      `bus.emit('game:event', { game, kind })`
 *
 * Il tracker non importa nessun gioco: i giochi non importano il tracker.
 * Si parlano solo attraverso il bus, come il resto dell'interfaccia.
 *
 * Nomi e descrizioni sono in i18n: `ach.<id>` e `ach.<id>.desc`.
 */

import { bus } from './events';
import type { WalletState } from './wallet';
import type { ProgressionState } from './progression';

export interface AchievementCtx {
  wallet: WalletState;
  progression: ProgressionState;
  /** Dati dell'ultimo saldo, se l'evento e' una giocata. */
  last?: { game: string; bet: number; payout: number };
}

export interface AchievementDef {
  id: string;
  icon: string;
  /** Fiche regalate allo sblocco (0 = solo onore). */
  reward: number;
  /** Condizione sullo stato. */
  check?: (c: AchievementCtx) => boolean;
  /** Oppure: tipo di `game:event` che lo sblocca. */
  event?: string;
  /** Raggruppamento nella bacheca. */
  group: 'play' | 'wins' | 'wealth' | 'loyalty' | 'games';
}

const ratio = (c: AchievementCtx) => (c.last && c.last.bet > 0 ? c.last.payout / c.last.bet : 0);

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  // ── Giocare
  { id: 'first_bet', icon: '✦', reward: 100, group: 'play', check: (c) => c.wallet.spins >= 1 },
  { id: 'spins_100', icon: '❖', reward: 500, group: 'play', check: (c) => c.wallet.spins >= 100 },
  { id: 'spins_1000', icon: '❂', reward: 2_500, group: 'play', check: (c) => c.wallet.spins >= 1_000 },
  { id: 'spins_10000', icon: '✺', reward: 20_000, group: 'play', check: (c) => c.wallet.spins >= 10_000 },
  { id: 'explorer_3', icon: '⌖', reward: 500, group: 'play', check: (c) => c.progression.gamesPlayed.length >= 3 },
  { id: 'explorer_all', icon: '✪', reward: 5_000, group: 'play', check: (c) => c.progression.gamesPlayed.length >= 8 },
  { id: 'high_roller', icon: '♛', reward: 2_000, group: 'play', check: (c) => (c.last?.bet ?? 0) >= 5_000 },

  // ── Vincite
  { id: 'first_win', icon: '✦', reward: 100, group: 'wins', check: (c) => (c.last?.payout ?? 0) > 0 },
  { id: 'big_win', icon: '◈', reward: 500, group: 'wins', check: (c) => ratio(c) >= 15 },
  { id: 'mega_win', icon: '◆', reward: 1_000, group: 'wins', check: (c) => ratio(c) >= 40 },
  { id: 'epic_win', icon: '❋', reward: 2_500, group: 'wins', check: (c) => ratio(c) >= 100 },
  { id: 'legendary_win', icon: '✵', reward: 10_000, group: 'wins', check: (c) => ratio(c) >= 300 },

  // ── Ricchezza
  { id: 'wager_100k', icon: '⛁', reward: 1_000, group: 'wealth', check: (c) => c.wallet.totalWagered >= 100_000 },
  { id: 'wager_1m', icon: '⛃', reward: 10_000, group: 'wealth', check: (c) => c.wallet.totalWagered >= 1_000_000 },
  { id: 'wager_10m', icon: '♜', reward: 50_000, group: 'wealth', check: (c) => c.wallet.totalWagered >= 10_000_000 },
  { id: 'balance_50k', icon: '◉', reward: 1_000, group: 'wealth', check: (c) => c.wallet.balance >= 50_000 },
  { id: 'balance_250k', icon: '◎', reward: 5_000, group: 'wealth', check: (c) => c.wallet.balance >= 250_000 },
  { id: 'balance_1m', icon: '♔', reward: 25_000, group: 'wealth', check: (c) => c.wallet.balance >= 1_000_000 },

  // ── Fedelta'
  { id: 'comeback', icon: '↻', reward: 0, group: 'loyalty', event: 'wallet:restart' },
  { id: 'daily_3', icon: '☼', reward: 1_000, group: 'loyalty', check: (c) => c.progression.streak >= 3 },
  { id: 'daily_7', icon: '✹', reward: 5_000, group: 'loyalty', check: (c) => c.progression.streak >= 7 },
  { id: 'vip_noble', icon: '⚜', reward: 0, group: 'loyalty', check: (c) => c.progression.level >= 3 },
  { id: 'vip_sheikh', icon: '♚', reward: 0, group: 'loyalty', check: (c) => c.progression.level >= 7 },

  // ── Giochi
  { id: 'go_free', icon: '7', reward: 1_000, group: 'games', event: 'go:free' },
  { id: 'go_palace3', icon: '✶', reward: 5_000, group: 'games', event: 'go:palace3' },
  { id: 'df_x10', icon: '★', reward: 5_000, group: 'games', event: 'df:x10' },
  { id: 'sf_jackpot', icon: '♕', reward: 10_000, group: 'games', event: 'sf:jackpot' },
  { id: 'bj_natural', icon: '♠', reward: 500, group: 'games', event: 'bj:natural' },
  { id: 'bj_split', icon: '⚔', reward: 1_000, group: 'games', event: 'bj:splitwin' },
  { id: 'rl_straight', icon: '⊛', reward: 1_000, group: 'games', event: 'rl:straight' },
  { id: 'rl_zero', icon: '◯', reward: 2_000, group: 'games', event: 'rl:zero' },
  { id: 'bac_tie', icon: '♦', reward: 1_500, group: 'games', event: 'bac:tie' },
  { id: 'vp_quads', icon: '♣', reward: 1_000, group: 'games', event: 'vp:quads' },
  { id: 'vp_royal', icon: '♛', reward: 25_000, group: 'games', event: 'vp:royal' },
  { id: 'cr_x10', icon: '↗', reward: 2_500, group: 'games', event: 'cr:x10' },
];

export const ACHIEVEMENT_COUNT = ACHIEVEMENTS.length;

export interface TrackerDeps {
  ctx: () => AchievementCtx;
  unlock: (id: string) => boolean;
  reward: (amount: number) => void;
  /** I riconoscimenti valgono solo nelle modalita' con progressione. */
  enabled: () => boolean;
}

/**
 * Installa il tracker. Restituisce la funzione di disinstallazione (test).
 * Lo sblocco paga la ricompensa e lascia che sia la Shell (in ascolto di
 * `achievement:unlocked`) a mostrare la notifica.
 */
export function installAchievementTracker(d: TrackerDeps): () => void {
  const unlock = (a: AchievementDef) => {
    if (!d.enabled()) return;
    if (d.unlock(a.id) && a.reward > 0) d.reward(a.reward);
  };
  const evaluate = (last?: AchievementCtx['last']) => {
    const c = { ...d.ctx(), last };
    for (const a of ACHIEVEMENTS) if (a.check && a.check(c)) unlock(a);
  };
  const byEvent = (kind: string) => {
    for (const a of ACHIEVEMENTS) if (a.event === kind) unlock(a);
  };

  const offs = [
    bus.on('wallet:settle', (p) => evaluate(p)),
    bus.on('daily:claimed', () => evaluate()),
    bus.on('vip:levelup', () => evaluate()),
    bus.on('wallet:restart', () => byEvent('wallet:restart')),
    bus.on('game:event', ({ kind }) => byEvent(kind)),
  ];
  // Prima valutazione: un salvataggio vecchio puo' gia' meritare qualcosa.
  queueMicrotask(() => evaluate());
  return () => offs.forEach((off) => off());
}
