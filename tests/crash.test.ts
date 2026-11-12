/**
 * Crash: equita' dimostrabile e distribuzione del punto di crash.
 * Se la formula sbaglia di un centesimo, l'RTP dichiarato (99%) e' falso.
 */
import { describe, expect, it } from 'vitest';
import {
  FairDealer,
  applyCap,
  crashCentsFor,
  crashCentsFromHex,
  crashCentsFromUniform,
  hmacSha256Hex,
  randomHex,
  sha256Hex,
  uniformFromHex,
  verify,
} from '@/games/crash/fair';

describe('primitive crittografiche', () => {
  it('SHA-256 e HMAC coincidono con i vettori noti', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    // RFC 4231, caso 2
    expect(await hmacSha256Hex('Jefe', 'what do ya want for nothing?')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'
    );
  });

  it('randomHex produce 64 cifre esadecimali diverse ogni volta', () => {
    const a = randomHex(32);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(randomHex(32)).not.toBe(a);
  });
});

describe('formula del crash', () => {
  it('esempi a mano', () => {
    expect(crashCentsFromHex('0000000000000')).toBe(100); // X=0 → 0.99 → ×1.00
    expect(crashCentsFromHex('8000000000000')).toBe(198); // X=0.5 → 99/0.5 = 198
    expect(crashCentsFromHex('c000000000000')).toBe(396); // X=0.75
    expect(crashCentsFromHex('e000000000000ffff')).toBe(792); // X=0.875, solo 13 cifre contano
  });

  it('floor e soglia ×1.00', () => {
    // Appena sotto la soglia di ×1.01: 99/(1−X) < 101 ⇔ X < 2/101.
    expect(crashCentsFromUniform(2 / 101 - 1e-9)).toBe(100);
    expect(crashCentsFromUniform(2 / 101 + 1e-9)).toBe(101);
    // Mai sotto ×1.00, anche quando 99/(1−X) vale 99.
    expect(crashCentsFromUniform(0)).toBe(100);
    // floor, non round: 99/(1−0.5049) = 199.96 → 199
    expect(crashCentsFromUniform(0.5049)).toBe(199);
    // Estremo superiore: finito e intero.
    const top = crashCentsFromHex('fffffffffffff');
    expect(Number.isInteger(top)).toBe(true);
    expect(top).toBeGreaterThan(1e13);
  });

  it('uniforme sui primi 52 bit, input non valido rifiutato', () => {
    expect(uniformFromHex('fffffffffffff')).toBeLessThan(1);
    expect(uniformFromHex('0000000000001')).toBe(2 ** -52);
    expect(() => uniformFromHex('xyz')).toThrow();
    expect(() => crashCentsFromUniform(1)).toThrow();
  });
});

describe('determinismo e verifica', () => {
  const server = 'a'.repeat(64);

  it('stessi semi e nonce → stesso crash; nonce diverso → firma diversa', async () => {
    const a = await crashCentsFor(server, 'player', 1);
    expect(await crashCentsFor(server, 'player', 1)).toBe(a);
    const h1 = await hmacSha256Hex(server, 'player:1');
    const h2 = await hmacSha256Hex(server, 'player:2');
    expect(h1).not.toBe(h2);
    expect(crashCentsFromHex(h1)).toBe(a);
  });

  it('verify conferma impronta e crash, e smaschera le manomissioni', async () => {
    const hash = await sha256Hex(server);
    const crash = await crashCentsFor(server, 'player', 7);
    const ok = await verify(server, 'player', 7, { hash, crashCents: crash });
    expect(ok.hashOk && ok.crashOk).toBe(true);
    const bad = await verify(server, 'player', 7, { hash: 'b'.repeat(64), crashCents: crash + 1 });
    expect(bad.hashOk).toBe(false);
    expect(bad.crashOk).toBe(false);
  });

  it('FairDealer: impronta prima, seme dopo, rotazione e nonce', async () => {
    const d = new FairDealer('seed-client', 41);
    await d.init();
    const committed = d.serverHash;
    const crash = await d.roll();
    expect(d.locked).toBe(true);
    expect(d.setClientSeed('troppo-tardi')).toBe(false);
    const r = await d.reveal();
    expect(r.serverHash).toBe(committed);
    expect(r.nonce).toBe(41);
    expect(r.crashCents).toBe(crash);
    expect(await sha256Hex(r.serverSeed)).toBe(committed);
    expect((await verify(r.serverSeed, r.clientSeed, r.nonce, r)).crashOk).toBe(true);
    // Seme nuovo, impronta nuova, nonce avanzato, seme client di nuovo modificabile.
    expect(d.serverHash).not.toBe(committed);
    expect(d.nonce).toBe(42);
    expect(d.setClientSeed('nuovo')).toBe(true);
    expect(d.clientSeed).toBe('nuovo');
  });

  it('freno di serie: il tetto limita il crash e la verifica lo ricalcola', async () => {
    // Serve un volo che senza tetto sarebbe salito oltre ×1,50 (~66% dei voli).
    let r: Awaited<ReturnType<FairDealer['reveal']>> | null = null;
    for (let i = 0; i < 40 && !r; i++) {
      const d = new FairDealer('freno', 1);
      await d.init();
      const crash = await d.roll(150);
      expect(crash).toBeLessThanOrEqual(150);
      expect(await d.roll(null)).toBe(crash); // a volo deciso il tetto non si sposta
      const rev = await d.reveal();
      if (rev.rawCents > 150) r = rev;
    }
    expect(r).not.toBeNull();
    expect(r!.crashCents).toBe(150);
    expect(r!.capCents).toBe(150);
    expect((await verify(r!.serverSeed, r!.clientSeed, r!.nonce, r!)).crashOk).toBe(true);
    // Senza dichiarare il tetto, il crash ×1,50 non torna: il freno non e' nascosto.
    const noCap = await verify(r!.serverSeed, r!.clientSeed, r!.nonce, { crashCents: r!.crashCents });
    expect(noCap.crashOk).toBe(false);
    expect(noCap.crashCents).toBe(r!.rawCents);
  });

  it('applyCap: senza tetto non cambia nulla, con tetto prende il minimo', () => {
    expect(applyCap(1234, null)).toBe(1234);
    expect(applyCap(1234, 150)).toBe(150);
    expect(applyCap(120, 150)).toBe(120);
    expect(applyCap(100, 150)).toBe(100);
  });
});

describe('distribuzione (Monte Carlo)', () => {
  // Sulla formula pura con un'uniforme veloce: la catena HMAC e' gia'
  // coperta sopra, qui si misura la FORMA della coda.
  const N = 400_000;
  let s = 0x9e3779b9;
  const rnd = () => {
    // xorshift32: deterministico, il test non deve essere instabile.
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 2 ** 32;
  };
  const crashes = Array.from({ length: N }, () => crashCentsFromUniform(rnd()));
  const p = (m: number) => crashes.filter((c) => c >= m * 100).length / N;

  it('P(crash ≥ m) ≈ 0.99/m', () => {
    expect(p(2)).toBeCloseTo(0.495, 2);
    expect(p(10)).toBeCloseTo(0.099, 2);
    expect(Math.abs(p(1.5) - 0.66)).toBeLessThan(0.005);
    // Crash istantanei a ×1.00: 2/101 ≈ 1.98%.
    expect(Math.abs(crashes.filter((c) => c === 100).length / N - 2 / 101)).toBeLessThan(0.002);
  });

  it('RTP ≈ 99% per diversi obiettivi di incasso', () => {
    for (const target of [1.2, 2, 5]) {
      const rtp = p(target) * target;
      expect(Math.abs(rtp - 0.99)).toBeLessThan(0.01);
    }
  });

  it('crash reali via HMAC: campione piccolo, nessun valore anomalo', async () => {
    const seed = randomHex(32);
    for (let n = 0; n < 200; n++) {
      const c = await crashCentsFor(seed, 'mc', n);
      expect(Number.isInteger(c)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(100);
    }
  });
});

import { flightTone } from '@/games/crash/history';

describe('tabellone dei voli: il colore e\' l\'esito del giocatore', () => {
  it('incasso basso (×1,20) su volo caduto a ×1,50 → verde', () => {
    expect(flightTone({ crash: 150, cashedAt: 120 })).toBe('win');
  });
  it('volo alto (×12,23) senza incasso → rosso', () => {
    expect(flightTone({ crash: 1223, cashedAt: null })).toBe('loss');
  });
  it('crash istantaneo ×1,00 → rosso', () => {
    expect(flightTone({ crash: 100, cashedAt: null })).toBe('loss');
  });
});
