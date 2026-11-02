/** Il tracker sblocca i riconoscimenti giusti, una volta sola, con la ricompensa. */
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, installAchievementTracker } from '@/state/achievements';
import { bus } from '@/state/events';
import { initialWallet } from '@/state/wallet';
import { initialProgression } from '@/state/progression';

function setup(enabled = true) {
  const wallet = initialWallet();
  const progression = initialProgression();
  const unlocked: string[] = [];
  let rewarded = 0;
  const off = installAchievementTracker({
    ctx: () => ({ wallet, progression }),
    unlock: (id) => (unlocked.includes(id) ? false : (unlocked.push(id), true)),
    reward: (n) => (rewarded += n),
    enabled: () => enabled,
  });
  return { wallet, progression, unlocked, get rewarded() { return rewarded; }, off };
}

describe('riconoscimenti', () => {
  it('hanno id unici e una condizione o un evento', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ACHIEVEMENTS) expect(Boolean(a.check) !== Boolean(a.event)).toBe(true);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(30);
  });

  it('una vincita da 120x sblocca prima vincita, big, mega ed epica — non leggendaria', () => {
    const t = setup();
    t.wallet.spins = 1;
    bus.emit('wallet:settle', { game: 'goldenOasis', bet: 10, payout: 1200 });
    expect(t.unlocked).toEqual(expect.arrayContaining(['first_bet', 'first_win', 'big_win', 'mega_win', 'epic_win']));
    expect(t.unlocked).not.toContain('legendary_win');
    const before = t.rewarded;
    bus.emit('wallet:settle', { game: 'goldenOasis', bet: 10, payout: 1200 });
    expect(t.rewarded).toBe(before); // nessun doppio premio
    t.off();
  });

  it('gli eventi di gioco sbloccano i riconoscimenti dedicati', () => {
    const t = setup();
    bus.emit('game:event', { game: 'videopoker', kind: 'vp:royal' });
    expect(t.unlocked).toContain('vp_royal');
    expect(t.rewarded).toBe(25_000);
    t.off();
  });

  it('nelle modalita senza progressione non si sblocca nulla', () => {
    const t = setup(false);
    bus.emit('game:event', { game: 'videopoker', kind: 'vp:royal' });
    expect(t.unlocked).toEqual([]);
    t.off();
  });
});
