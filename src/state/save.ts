/**
 * THE ROYAL MIRAGE — Salvataggio
 *
 * Il salvataggio ha un numero di VERSIONE e una catena di MIGRAZIONI.
 * Senza, il giorno in cui aggiungiamo un campo allo stato, chi ha gia'
 * giocato carica un oggetto senza quel campo → `undefined` → NaN nel saldo.
 *
 * Strategia difensiva in 3 livelli:
 *   1. migrazioni esplicite fra versioni note
 *   2. merge profondo con i valori di default (campi mancanti → default)
 *   3. se il JSON e' corrotto, si riparte da zero MA si conserva una copia
 *      del dato rotto in una chiave di backup, per non perderlo del tutto
 */

export const SAVE_KEY = 'golden-oasis:save';
const BACKUP_KEY = 'golden-oasis:save:corrupt-backup';
export const SAVE_VERSION = 2;

interface Envelope<T> {
  version: number;
  savedAt: number;
  data: T;
}

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * migrations[n] porta un salvataggio dalla versione n alla n+1.
 */
const migrations: Record<number, Migration> = {
  /**
   * 1 → 2: il denaro passa dalle fiche agli EURO contati in centesimi.
   *
   * Un saldo in fiche non si puo' reinterpretare in centesimi: 47.320 fiche
   * diventerebbero 473,20 € senza che nessuno l'abbia deciso, e lo storico
   * delle giocate mescolerebbe due unita' diverse. Quindi si scartano i
   * portafogli interi (saldo, puntata, storico, statistiche di vincita): il
   * merge con i default li fa ripartire dal saldo iniziale della modalita'.
   * Tutto cio' che NON e' denaro — rango, riconoscimenti, impostazioni,
   * profilo — si conserva.
   */
  1: (data) => {
    const { wallets: _wallets, ...rest } = data;
    return rest;
  },
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Merge profondo: i valori salvati vincono, ma i campi assenti prendono il
 * default. Gli array NON si fondono (si prende quello salvato per intero),
 * altrimenti uno storico salvato verrebbe mescolato col default vuoto.
 * Un tipo diverso dal default (es. stringa al posto di numero) viene scartato.
 */
export function deepMerge<T>(defaults: T, saved: unknown): T {
  if (!isObject(defaults) || !isObject(saved)) {
    if (saved === undefined || saved === null) return defaults;
    if (typeof saved !== typeof defaults) return defaults;
    if (typeof saved === 'number' && !Number.isFinite(saved)) return defaults;
    return saved as T;
  }
  const out: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const d = (defaults as Record<string, unknown>)[key];
    const s = saved[key];
    if (s === undefined) continue;
    if (Array.isArray(d)) {
      out[key] = Array.isArray(s) ? s : d;
    } else if (isObject(d)) {
      out[key] = deepMerge(d, s);
    } else {
      out[key] = deepMerge(d, s);
    }
  }
  return out as T;
}

export function load<T>(defaults: T): T {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    // localStorage puo' lanciare in navigazione privata o se disabilitato.
    return defaults;
  }
  if (!raw) return defaults;

  try {
    const env = JSON.parse(raw) as Envelope<Record<string, unknown>>;
    if (!isObject(env) || typeof env.version !== 'number' || !isObject(env.data)) {
      throw new Error('Formato di salvataggio non riconosciuto');
    }
    let data = env.data;
    for (let v = env.version; v < SAVE_VERSION; v++) {
      const m = migrations[v];
      if (m) data = m(data);
    }
    return deepMerge(defaults, data);
  } catch (err) {
    console.warn('[save] Salvataggio corrotto, ripartenza pulita. Backup conservato.', err);
    try {
      localStorage.setItem(BACKUP_KEY, raw);
    } catch {
      /* spazio esaurito: pazienza */
    }
    return defaults;
  }
}

export function save<T>(data: T): boolean {
  const env: Envelope<T> = { version: SAVE_VERSION, savedAt: Date.now(), data };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(env));
    return true;
  } catch (err) {
    console.warn('[save] Impossibile salvare', err);
    return false;
  }
}

export function wipe(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignora */
  }
}

/**
 * Salvataggio "debounced": raggruppa le scritture ravvicinate.
 * Durante un auto-spin lo stato cambia piu' volte al secondo; scrivere su
 * localStorage (sincrono, blocca il thread) a ogni cambio farebbe scattare
 * l'animazione dei rulli.
 */
export function debouncedSaver<T>(getData: () => T, delayMs = 800): {
  schedule: () => void;
  flush: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    save(getData());
  };
  return {
    schedule: () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    flush,
  };
}
