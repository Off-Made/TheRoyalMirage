/**
 * THE ROYAL MIRAGE — Crash: equita' dimostrabile ("provably fair")
 *
 * Modulo PURO: niente Pixi, niente DOM, niente store. Gira identico nel
 * browser e in Node (vitest), perche' usa solo WebCrypto (`crypto.subtle`),
 * presente in entrambi.
 *
 * ── Il patto con il giocatore ──
 *   1. PRIMA del volo il banco sceglie un seme segreto (32 byte casuali) e
 *      ne pubblica solo l'impronta SHA-256. L'impronta "inchioda" il seme:
 *      cambiarlo dopo produrrebbe un'impronta diversa, e chiunque se ne
 *      accorgerebbe.
 *   2. Il giocatore contribuisce con un SUO seme (modificabile). Il banco non
 *      puo' conoscerlo in anticipo, quindi non puo' aver scelto un seme
 *      server "comodo" per quella combinazione.
 *   3. Il punto di crash e' una funzione DETERMINISTICA dei due semi e di un
 *      contatore (nonce):  HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}`).
 *   4. A volo finito il banco RIVELA il seme. Il giocatore verifica che
 *      SHA-256(seme) coincida con l'impronta vista prima, e ricalcola il crash.
 *   5. Il seme rivelato non si riusa mai: se ne genera uno nuovo, se ne mostra
 *      la nuova impronta, e il ciclo riparte.
 *
 * ── Dalla firma al moltiplicatore ──
 * Dei 256 bit dell'HMAC si prendono i primi 52 (13 cifre esadecimali): e'
 * esattamente la mantissa di un double, quindi l'intero e' rappresentato
 * SENZA arrotondamenti e  X = h / 2^52  e' uniforme in [0, 1).
 *
 *     crash = max(1.00, floor(99 / (1 − X)) / 100)
 *
 * Perche' funziona: per ogni m sulla griglia dei centesimi (m ≥ 1.01)
 *     P(crash ≥ m) = P(99/(1−X) ≥ 100·m) = P(1−X ≤ 0.99/m) = 0.99 / m
 * Chi incassa a m vince m volte la puntata con probabilita' 0.99/m:
 * valore atteso = m · 0.99/m = 0.99. RTP 99% per QUALUNQUE obiettivo, ed e'
 * questo il bello del crash: nessuna strategia di incasso e' migliore di
 * un'altra, cambia solo la varianza. Il 1% del banco sta nel "−1" implicito
 * del 99 al posto di 100 (e nei crash istantanei a ×1.00, ~1.98% dei voli).
 *
 * Tutti i calcoli interni sono in CENTESIMI interi (`crashCents`): confrontare
 * 2.0099999 con 2.01 in virgola mobile e' il modo classico di pagare un
 * giocatore che non doveva vincere, o viceversa.
 */

const enc = new TextEncoder();

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('WebCrypto non disponibile: serve un contesto sicuro (https o localhost).');
  return s;
}

/** Byte → esadecimale minuscolo. */
export function toHex(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i]!.toString(16).padStart(2, '0');
  return s;
}

/** `n` byte casuali crittografici in esadecimale (seme server: 32 byte = 64 cifre). */
export function randomHex(bytes = 32): string {
  const b = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(b);
  return toHex(b);
}

/** Seme client predefinito: piu' corto, perche' l'utente lo legge e lo puo' riscrivere. */
export function randomClientSeed(): string {
  return randomHex(8);
}

/** SHA-256 della stringa (UTF-8) in esadecimale. E' l'impronta pubblicata prima del volo. */
export async function sha256Hex(text: string): Promise<string> {
  return toHex(await subtle().digest('SHA-256', enc.encode(text)));
}

/**
 * HMAC-SHA256 in esadecimale. La CHIAVE e' la stringa del seme server cosi'
 * come viene mostrata (64 cifre esadecimali, codificate UTF-8): chi verifica
 * con un tool esterno deve solo copiare e incollare, senza decodificare byte.
 */
export async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const k = await subtle().importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await subtle().sign('HMAC', k, enc.encode(message)));
}

/** 2^52: i bit della mantissa di un double. */
const TWO_52 = 2 ** 52;

/** Uniforme in [0,1) dai primi 52 bit di una firma esadecimale. */
export function uniformFromHex(hex: string): number {
  if (!/^[0-9a-f]{13}/i.test(hex)) throw new Error('Firma non valida: servono almeno 13 cifre esadecimali.');
  return parseInt(hex.slice(0, 13), 16) / TWO_52;
}

/**
 * Punto di crash in CENTESIMI interi (100 = ×1.00) da una uniforme X ∈ [0,1).
 * `floor` e non `round`: arrotondare per eccesso regalerebbe un centesimo
 * al giocatore e sposterebbe l'RTP sopra il 99%.
 */
export function crashCentsFromUniform(x: number): number {
  if (!(x >= 0 && x < 1)) throw new Error(`Uniforme fuori intervallo: ${x}`);
  return Math.max(100, Math.floor(99 / (1 - x)));
}

/** Punto di crash in centesimi direttamente dalla firma HMAC. */
export function crashCentsFromHex(hex: string): number {
  return crashCentsFromUniform(uniformFromHex(hex));
}

/** Messaggio firmato: il formato e' parte del patto, non va mai cambiato. */
export function roundMessage(clientSeed: string, nonce: number): string {
  return `${clientSeed}:${nonce}`;
}

/** Calcola il crash di un volo dai suoi ingredienti. In centesimi. */
export async function crashCentsFor(serverSeed: string, clientSeed: string, nonce: number): Promise<number> {
  return crashCentsFromHex(await hmacSha256Hex(serverSeed, roundMessage(clientSeed, nonce)));
}

export interface Verification {
  /** SHA-256 del seme rivelato. */
  hash: string;
  /** Vero se coincide con l'impronta pubblicata (se fornita). */
  hashOk: boolean;
  /** Punto di crash ricalcolato, centesimi. */
  crashCents: number;
  /** Vero se coincide con il crash dichiarato (se fornito). */
  crashOk: boolean;
}

/**
 * Verifica indipendente di un volo concluso. Senza `expected*` si limita a
 * ricalcolare (utile per il verificatore manuale della modale).
 */
export async function verify(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  expected: { hash?: string; crashCents?: number } = {}
): Promise<Verification> {
  const hash = await sha256Hex(serverSeed);
  const crashCents = await crashCentsFor(serverSeed, clientSeed, nonce);
  return {
    hash,
    hashOk: expected.hash === undefined || expected.hash.toLowerCase() === hash,
    crashCents,
    crashOk: expected.crashCents === undefined || expected.crashCents === crashCents,
  };
}

/** Volo concluso, con il seme ormai pubblico. */
export interface RevealedRound {
  serverSeed: string;
  serverHash: string;
  clientSeed: string;
  nonce: number;
  crashCents: number;
}

/**
 * Il "banco" della partita: custodisce il seme segreto del volo corrente.
 *
 *   await dealer.init()           primo seme + impronta
 *   dealer.serverHash             da mostrare PRIMA del volo
 *   await dealer.roll()           crash del volo (seme ancora segreto)
 *   await dealer.reveal()         rivela, ruota il seme, avanza il nonce
 *
 * `roll` e `reveal` sono separati di proposito: fra i due c'e' il volo, e in
 * quel tempo il seme resta privato (campo `#seed`, non enumerabile). Il
 * banco qui gira nel browser stesso del giocatore: con fiche virtuali il
 * valore del meccanismo e' la VERIFICABILITA' — l'esito non dipende da
 * nulla che il banco possa ritoccare dopo aver mostrato l'impronta.
 */
export class FairDealer {
  #seed = '';
  serverHash = '';
  clientSeed: string;
  nonce: number;
  /** Ultimo volo rivelato, per la modale "Equita'". */
  last: RevealedRound | null = null;
  private rolled: number | null = null;

  constructor(clientSeed = randomClientSeed(), nonce = 1) {
    this.clientSeed = clientSeed;
    this.nonce = nonce;
  }

  /** Genera il primo seme. Va attesa prima del primo `roll`. */
  async init(): Promise<void> {
    await this.rotate();
  }

  private async rotate(): Promise<void> {
    this.#seed = randomHex(32);
    this.serverHash = await sha256Hex(this.#seed);
    this.rolled = null;
  }

  /**
   * Cambia il seme client. Rifiutato a volo deciso: il crash e' gia' stato
   * calcolato con il seme vecchio, e accettarne uno nuovo a meta' romperebbe
   * la verifica del volo in corso.
   */
  setClientSeed(seed: string): boolean {
    const s = seed.trim();
    if (!s || s.length > 64 || this.rolled !== null) return false;
    this.clientSeed = s;
    return true;
  }

  get locked(): boolean {
    return this.rolled !== null;
  }

  /** Decide il crash del volo corrente (idempotente finche' non si rivela). */
  async roll(): Promise<number> {
    if (this.rolled === null) this.rolled = await crashCentsFor(this.#seed, this.clientSeed, this.nonce);
    return this.rolled;
  }

  /** Chiude il volo: pubblica il seme, ne genera uno nuovo, avanza il nonce. */
  async reveal(): Promise<RevealedRound> {
    const crashCents = await this.roll();
    const r: RevealedRound = {
      serverSeed: this.#seed,
      serverHash: this.serverHash,
      clientSeed: this.clientSeed,
      nonce: this.nonce,
      crashCents,
    };
    this.last = r;
    this.nonce++;
    await this.rotate();
    return r;
  }
}
