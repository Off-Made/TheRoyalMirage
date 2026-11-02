/**
 * Sabot e mazzo: composizione, mescolamento, carta di taglio.
 * Se il sabot non contiene esattamente N mazzi, ogni probabilita' dei
 * tavoli (e quindi ogni RTP dichiarato) e' falsa.
 */
import { describe, expect, it } from 'vitest';
import { Shoe, makeDeck, cardId, parseCard, cards, shuffleInPlace, rankLabel } from '@/games/cards/card';
import { seededRng } from '@/games/slots/engine/rng';

describe('mazzo', () => {
  it('52 carte tutte diverse', () => {
    const d = makeDeck();
    expect(d).toHaveLength(52);
    expect(new Set(d.map(cardId)).size).toBe(52);
  });

  it('notazione compatta', () => {
    expect(parseCard('AS')).toEqual({ rank: 1, suit: 'S' });
    expect(parseCard('TD')).toEqual({ rank: 10, suit: 'D' });
    expect(parseCard('10h')).toEqual({ rank: 10, suit: 'H' });
    expect(cards('KC QD JH').map((c) => c.rank)).toEqual([13, 12, 11]);
    expect(rankLabel(1)).toBe('A');
    expect(() => parseCard('1X')).toThrow();
  });

  it('il mescolamento e una permutazione e dipende dal seme', () => {
    const a = shuffleInPlace(makeDeck(), seededRng(1)).map(cardId);
    const b = shuffleInPlace(makeDeck(), seededRng(2)).map(cardId);
    expect([...a].sort()).toEqual(makeDeck().map(cardId).sort());
    expect(a).not.toEqual(b);
    expect(shuffleInPlace(makeDeck(), seededRng(1)).map(cardId)).toEqual(a);
  });

  it('Fisher-Yates uniforme: la prima posizione vede ogni carta circa 1/52', () => {
    const rng = seededRng(99);
    const counts = new Map<string, number>();
    const N = 26_000;
    for (let i = 0; i < N; i++) {
      const id = cardId(shuffleInPlace(makeDeck(), rng)[0]!);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(counts.size).toBe(52);
    for (const v of counts.values()) expect(Math.abs(v - N / 52)).toBeLessThan((N / 52) * 0.25);
  });
});

describe('sabot', () => {
  it('6 mazzi: 312 carte, 6 copie di ogni carta', () => {
    const s = new Shoe(seededRng(5), { decks: 6, penetration: 0.75 });
    expect(s.size).toBe(312);
    expect(s.remaining).toBe(312);
    const comp = s.composition();
    expect(comp.size).toBe(52);
    for (const v of comp.values()) expect(v).toBe(6);
  });

  it('8 mazzi per il baccarat', () => {
    const s = new Shoe(seededRng(5), { decks: 8, penetration: 0.95 });
    expect(s.size).toBe(416);
    for (const v of s.composition().values()) expect(v).toBe(8);
  });

  it('la carta di taglio segnala ma non rimescola a meta mano', () => {
    const s = new Shoe(seededRng(7), { decks: 1, penetration: 0.5 });
    expect(s.cutIndex).toBe(26);
    for (let i = 0; i < 25; i++) s.draw();
    expect(s.cutReached).toBe(false);
    s.draw();
    expect(s.cutReached).toBe(true);
    // Si continua a pescare senza rimescolare finche' la scena non lo chiede.
    s.draw();
    expect(s.remaining).toBe(52 - 27);
    expect(s.shuffleIfNeeded()).toBe(true);
    expect(s.remaining).toBe(52);
    expect(s.cutReached).toBe(false);
    expect(s.shuffleIfNeeded()).toBe(false);
  });

  it('prima del taglio nessuna carta compare piu di N volte', () => {
    const s = new Shoe(seededRng(11), { decks: 2, penetration: 0.9 });
    const seen = new Map<string, number>();
    while (!s.cutReached) {
      const id = cardId(s.draw());
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    for (const v of seen.values()) expect(v).toBeLessThanOrEqual(2);
  });

  it('sabot esaurito: si ricompone invece di bloccarsi', () => {
    const s = new Shoe(seededRng(3), { decks: 1, penetration: 0.98 });
    for (let i = 0; i < 60; i++) s.draw();
    expect(s.remaining).toBeGreaterThan(0);
  });

  it('rig: le carte impilate escono per prime', () => {
    const s = new Shoe(seededRng(3), { decks: 1, penetration: 0.75 });
    s.rig(cards('AS KH'));
    expect(cardId(s.draw())).toBe('AS');
    expect(cardId(s.draw())).toBe('KH');
    expect(s.remaining).toBe(52);
  });
});
