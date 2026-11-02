/**
 * THE ROYAL MIRAGE — Bus di eventi tipizzato
 *
 * Lo store dice "cosa e' lo stato", il bus dice "cosa e' appena successo".
 * Servono entrambi: un toast "Sei salito di rango!" non si puo' derivare
 * dallo stato (il livello 3 e' uguale prima e dopo il reload), e' un evento.
 *
 * La mappa `Events` tipizza nome → payload: emettere un evento con il
 * payload sbagliato e' un errore di compilazione, non un bug a runtime.
 */

import type { ModeId } from './modes';
import type { SettingsState } from './settings';

export interface Events {
  'wallet:bet': { game: string; bet: number };
  'wallet:settle': { game: string; bet: number; payout: number };
  'wallet:insufficient': { needed: number; balance: number };
  'wallet:bust': Record<string, never>;
  /** Ripartenza col saldo iniziale dopo essere rimasti a secco. */
  'wallet:restart': { amount: number };
  'wallet:refilled': { amount: number };
  'vip:levelup': { level: number; reward: number };
  'daily:claimed': { amount: number; streak: number };
  'mode:changed': { mode: ModeId };
  'mode:won': { mode: ModeId; balance: number };
  'mode:failed': { mode: ModeId };
  'settings:changed': Partial<SettingsState>;
  'achievement:unlocked': { id: string };
  'ui:toast': { text: string; kind?: 'info' | 'win' | 'warn' | 'vip' };
  /**
   * Momento speciale di un gioco (blackjack naturale, scala reale...).
   * `kind` e' una stringa libera "<gioco>:<evento>": la leggono i
   * riconoscimenti (vedi state/achievements.ts).
   */
  'game:event': { game: string; kind: string };
}

type Handler<T> = (payload: T) => void;

class Bus {
  private handlers = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(event: K, fn: Handler<Events[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const fn of [...set]) {
      // Un listener che lancia non deve impedire agli altri di ricevere
      // l'evento, ne' interrompere l'azione dello store che l'ha emesso.
      try {
        (fn as Handler<Events[K]>)(payload);
      } catch (err) {
        console.error(`[bus] errore nel listener di "${event}"`, err);
      }
    }
  }
}

export const bus = new Bus();
