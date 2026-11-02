/**
 * THE ROYAL MIRAGE — Dizionari locali dei giochi
 *
 * Il dizionario globale (`i18n/it.ts`) contiene le stringhe della shell.
 * Ogni gioco ha invece il PROPRIO dizionario, accanto al suo codice:
 *
 *   const s = defineStrings({
 *     it: { hit: 'Carta', stand: 'Stai' },
 *     en: { hit: 'Hit',   stand: 'Stand' },
 *   });
 *   s('hit')  // → "Carta" o "Hit" secondo la lingua attiva
 *
 * ── Perche' locali ──
 * Le regole di un gioco (trenta stringhe di blackjack) non interessano a
 * nessun altro modulo, e un file unico con duecento chiavi di otto giochi
 * diventa il punto di conflitto di ogni modifica. La garanzia di tipo resta:
 * `en` deve avere esattamente le chiavi di `it`, o TypeScript protesta.
 */

import { getLanguage } from '@/i18n';

export type StringFn<K extends string> = (key: K, vars?: Record<string, string | number>) => string;

export function defineStrings<T extends Record<string, string>>(dicts: {
  it: T;
  en: Record<keyof T, string>;
}): StringFn<Extract<keyof T, string>> {
  return (key, vars) => {
    const dict = getLanguage() === 'en' ? dicts.en : dicts.it;
    let s: string = dict[key] ?? dicts.it[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    }
    return s;
  };
}
