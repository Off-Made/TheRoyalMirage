/**
 * THE ROYAL MIRAGE — Sorgente di casualita'
 *
 * Due implementazioni dietro la stessa interfaccia:
 *
 *   · `cryptoRng()`  — `crypto.getRandomValues`, per il gioco vero
 *   · `seededRng(n)` — mulberry32, deterministico, per i test di RTP
 *
 * ── Perche' l'RNG e' iniettabile ──
 * Verificare che una macchina paghi il 96,2% richiede milioni di spin. Con
 * un generatore globale non riproducibile, un test che fallisce non si puo'
 * indagare: non si sa quale sequenza l'ha fatto fallire. Col seme, la
 * simulazione e' ripetibile bit per bit.
 *
 * Mulberry32 non e' crittograficamente sicuro, e non deve esserlo: serve
 * uniformita' e periodo lungo (2^32), non imprevedibilita'. Per il gioco
 * reale usiamo comunque il CSPRNG del browser, perche' costa nulla e
 * elimina ogni dubbio sulla correlazione fra spin consecutivi.
 */

export interface Rng {
  /** Float uniforme in [0, 1). */
  next(): number;
  /** Intero uniforme in [0, n). `n` deve essere > 0. */
  int(n: number): number;
  /** Elemento casuale di un array non vuoto. */
  pick<T>(xs: readonly T[]): T;
  /** Vero con probabilita' `p`. */
  chance(p: number): boolean;
}

function fromFloat(next: () => number): Rng {
  return {
    next,
    int(n: number): number {
      // Math.floor di un float in [0,1) non raggiunge mai n: nessun clamp
      // necessario, ma il min protegge dagli arrotondamenti a 0.9999999999.
      return Math.min(n - 1, Math.floor(next() * n));
    },
    pick<T>(xs: readonly T[]): T {
      const x = xs[this.int(xs.length)];
      if (x === undefined) throw new Error('pick() su array vuoto');
      return x;
    },
    chance(p: number): boolean {
      return next() < p;
    },
  };
}

/**
 * Generatore deterministico (mulberry32). Stesso seme = stessa sequenza,
 * su qualsiasi piattaforma: e' pura aritmetica a 32 bit senza float.
 */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return fromFloat(() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
}

/**
 * Generatore del gioco vero. Attinge a `crypto` in blocchi di 256 valori:
 * una chiamata per spin sarebbe uno spreco di syscall.
 */
export function cryptoRng(): Rng {
  const BLOCK = 256;
  let buf = new Uint32Array(BLOCK);
  let i = BLOCK; // forza il primo riempimento

  return fromFloat(() => {
    if (i >= BLOCK) {
      crypto.getRandomValues(buf);
      i = 0;
    }
    return buf[i++]! / 4294967296;
  });
}

/**
 * L'RNG predefinito: crypto se disponibile, altrimenti un seme dall'orologio.
 * Il fallback serve solo ad ambienti esotici (vecchi WebView): in un browser
 * moderno `crypto` c'e' sempre.
 */
export function defaultRng(): Rng {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return cryptoRng();
  }
  return seededRng(Date.now() >>> 0);
}
