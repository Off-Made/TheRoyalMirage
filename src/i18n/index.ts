/**
 * THE ROYAL MIRAGE — Internazionalizzazione
 *
 * ── Perche' l'italiano e' il dizionario "sorgente" ──
 * Il tipo `TranslationKey` e' derivato dalle chiavi del dizionario italiano.
 * Conseguenza utile: se aggiungo una chiave a `it.ts` e dimentico `en.ts`,
 * TypeScript segnala l'errore in `en.ts`. Le traduzioni mancanti diventano
 * errori di compilazione invece di "???" scoperti a runtime dall'utente.
 */

import { it } from './it';
import { en } from './en';
import type { Language } from '@/state/settings';

/**
 * `it` e' dichiarato `as const`, quindi i suoi valori sono tipi LETTERALI
 * ("The Royal Mirage", non string). Un dizionario tradotto non puo' avere quegli
 * stessi letterali, percio' il tipo condiviso allarga i valori a `string`
 * conservando l'insieme esatto delle chiavi — che e' la parte che ci interessa
 * tipizzare.
 */
export type TranslationKey = keyof typeof it;
export type Dictionary = Record<TranslationKey, string>;

const DICTS: Record<Language, Dictionary> = { it, en };

let current: Language = 'it';
const listeners = new Set<(lang: Language) => void>();

export function setLanguage(lang: Language): void {
  if (current === lang) return;
  current = lang;
  document.documentElement.lang = lang;
  for (const fn of listeners) fn(lang);
}

export function getLanguage(): Language {
  return current;
}

export function onLanguageChange(fn: (lang: Language) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Traduce una chiave, con interpolazione di `{segnaposto}`.
 *
 *   t('hud.balance')                      → "Saldo"
 *   t('win.amount', { coins: '1.200' })   → "Hai vinto 1.200 fiche!"
 *
 * Se la chiave manca nella lingua attiva ricade sull'italiano, e solo in
 * ultima istanza restituisce la chiave stessa: un'etichetta sbagliata e'
 * un difetto, un'etichetta vuota e' un'interfaccia rotta.
 */
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  const dict = DICTS[current];
  let s: string = dict[key] ?? it[key] ?? String(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

/**
 * Applica le traduzioni a un albero DOM già costruito.
 * Marcando gli elementi con `data-i18n` evitiamo di ricostruire l'interfaccia
 * al cambio di lingua: la si ri-etichetta sul posto.
 *
 *   <h2 data-i18n="menu.settings"></h2>
 *   <input data-i18n-attr="placeholder:profile.namePlaceholder">
 */
export function applyTranslations(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n as TranslationKey | undefined;
    if (key) el.textContent = t(key);
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-attr]')) {
    // Formato: "attributo:chiave" separati da virgola per piu' attributi.
    for (const pair of (el.dataset.i18nAttr ?? '').split(',')) {
      const [attr, key] = pair.split(':').map((x) => x.trim());
      if (attr && key) el.setAttribute(attr, t(key as TranslationKey));
    }
  }
}

/** Numeri nel formato locale corretto (separatore migliaia diverso fra IT ed EN). */
export function num(n: number): string {
  return Math.round(n).toLocaleString(current === 'it' ? 'it-IT' : 'en-US');
}

/** Durata in mm:ss, per i cooldown. */
export function duration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
