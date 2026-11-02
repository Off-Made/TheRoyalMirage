/**
 * Migrazione del salvataggio dalla versione 1 (fiche) alla 2 (euro in centesimi).
 *
 * Un saldo salvato in fiche NON si puo' reinterpretare in centesimi: 47.320
 * fiche diventerebbero 473,20 € senza che nessuno l'abbia deciso. Quindi i
 * portafogli ripartono dal saldo iniziale della modalita', mentre tutto cio'
 * che non e' denaro (rango, riconoscimenti, impostazioni) si conserva.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { SAVE_KEY, SAVE_VERSION, load } from '@/state/save';

const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
};

const defaults = {
  progression: { xp: 0, gamesPlayed: [] as string[] },
  settings: { volume: 0.8 },
  wallets: { career: { balance: 10_000, bet: 100 } },
};

beforeEach(() => mem.clear());

describe('migrazione 1 → 2', () => {
  it('la versione corrente e almeno la 2', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(2);
  });

  it('i portafogli in fiche ripartono dal saldo iniziale', () => {
    mem.set(
      SAVE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: 0,
        data: {
          progression: { xp: 4_200, gamesPlayed: ['roulette'] },
          settings: { volume: 0.3 },
          wallets: { career: { balance: 47_320, bet: 500 } },
        },
      })
    );
    const out = load(defaults);
    expect(out.wallets.career.balance).toBe(10_000);
    expect(out.wallets.career.bet).toBe(100);
  });

  it('progressione e impostazioni si conservano', () => {
    mem.set(
      SAVE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: 0,
        data: {
          progression: { xp: 4_200, gamesPlayed: ['roulette'] },
          settings: { volume: 0.3 },
          wallets: { career: { balance: 47_320, bet: 500 } },
        },
      })
    );
    const out = load(defaults);
    expect(out.progression.xp).toBe(4_200);
    expect(out.progression.gamesPlayed).toEqual(['roulette']);
    expect(out.settings.volume).toBe(0.3);
  });

  it('un salvataggio gia in euro non viene toccato', () => {
    mem.set(
      SAVE_KEY,
      JSON.stringify({
        version: SAVE_VERSION,
        savedAt: 0,
        data: { ...defaults, wallets: { career: { balance: 31_415, bet: 250 } } },
      })
    );
    expect(load(defaults).wallets.career.balance).toBe(31_415);
  });
});
