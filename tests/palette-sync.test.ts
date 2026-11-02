/**
 * La palette TS e' l'unica fonte dei colori. Questo test impedisce che il CSS
 * torni a divergere:
 *
 *  1. ogni colore della schermata di avvio (index.html, prima di ogni JS)
 *     deve essere un colore della palette;
 *  2. nessun CSS puo' DEFINIRE una variabile che la palette gia' genera
 *     (sarebbe una seconda copia, destinata a divergere);
 *  3. ogni `var(--x)` usata deve esistere: un token, la sua tripla `-rgb`,
 *     oppure una variabile non cromatica della lista qui sotto.
 *
 * La regola 3 e' quella che cattura i refusi: `var(--gold-hi)` dopo la
 * rinomina sarebbe stato un colore mancante, silenzioso, a runtime.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { paletteTokens } from '@/art/cssVars';
import { PALETTE, contrast } from '@/art/palette';

const tokens = paletteTokens();
const tokenHex = new Set([...tokens.values()].map((h) => h.toString(16).padStart(6, '0')));

/**
 * Variabili non cromatiche, locali a un componente (impostate inline da TS),
 * o SEMANTICHE.
 *
 * Le semantiche (`--surface-*`, `--text-*`, `--border-*`, `--action-*`,
 * `--danger-*`) sono definite in `tokens.css` e il loro valore e' sempre
 * costruito da un token della palette, mai da un letterale: sono un alias di
 * INTENZIONE, non una seconda copia dei colori. E' per questo che la regola
 * "nessuna copia manuale" resta soddisfatta — e il test successivo lo verifica.
 */
const NON_COLOR = [
  /^--font-/, /^--vp-/, /^--shadow-/, /^--glow-/, /^--t-/, /^--ease-/, /^--r-/, /^--sp-/, /^--fs-/, /^--lh-/,
  /^--surface-/, /^--text-/, /^--border-/, /^--action-/, /^--danger-/, /^--play-/, /^--grad-/, /^--sheen-/,
  /^--bg$/, /^--content-max$/, /^--gutter$/, /^--tone-(a|b|glow)$/,
  /^--card-accent(-rgb)?$/, /^--mode-accent(-rgb)?$/, /^--tier-color$/, /^--chip(-ink)?$/,
];

const STYLES = 'src/ui/styles';
const cssFiles = readdirSync(STYLES).filter((f) => f.endsWith('.css'));
const read = (p: string) => readFileSync(p, 'utf-8');

const isKnown = (v: string) =>
  tokens.has(v) ||
  (v.endsWith('-rgb') && tokens.has(v.slice(0, -4))) ||
  NON_COLOR.some((re) => re.test(v));

describe('palette ↔ CSS', () => {
  it('i colori della schermata di avvio esistono nella palette', () => {
    const style = read('index.html').match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    const hexes = [...style.matchAll(/#([0-9a-fA-F]{6})\b/g)].map((m) => m[1]!.toLowerCase());
    expect(hexes.length).toBeGreaterThan(0);
    for (const h of hexes) expect(tokenHex.has(h), `#${h} non e' un colore della palette`).toBe(true);
  });

  it.each(cssFiles)('%s non ridefinisce i token della palette', (f) => {
    const defined = [...read(join(STYLES, f)).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!);
    const dup = defined.filter((d) => tokens.has(d) || (d.endsWith('-rgb') && tokens.has(d.slice(0, -4))));
    expect(dup, `copia manuale di colori generati`).toEqual([]);
  });

  it.each(cssFiles)('%s usa solo variabili esistenti', (f) => {
    const used = [...read(join(STYLES, f)).matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]!);
    const unknown = [...new Set(used.filter((u) => !isKnown(u)))];
    expect(unknown, `variabili inesistenti`).toEqual([]);
  });

  // Una dichiarazione con parentesi sbilanciate e' invalida PER INTERO: il
  // browser la scarta in silenzio, e un gradiente d'oro diventa un pulsante
  // bianco senza alcun errore in console. E' successo durante la migrazione
  // della palette, ed e' invisibile a ogni altro controllo di questo file.
  it.each(cssFiles)('%s non ha dichiarazioni con parentesi sbilanciate', (f) => {
    const src = read(join(STYLES, f)).replace(/\/\*[\s\S]*?\*\//g, '');
    const bad = src
      .split(/[;{}]/)
      .map((d) => d.trim())
      .filter((d) => d.split('(').length !== d.split(')').length);
    expect(bad).toEqual([]);
  });

  it('genera nome e tripla per ogni token', () => {
    expect(tokens.get('--gold-hot')).toBe(PALETTE.gold.hot);
    expect(tokens.get('--plum-base')).toBe(PALETTE.plum.base);
    expect(tokens.get('--text-strong')).toBe(PALETTE.text.strong);
    expect(tokens.get('--felt-red-core')).toBe(PALETTE.feltRed.core);
  });

  // Tema "mezzanotte sulla Strip": il testo vive su velluto scuro. Ogni ruolo
  // di testo deve restare leggibile (WCAG AA, 4.5:1) su ogni superficie su
  // cui il design system lo appoggia.
  it.each([
    ['strong', PALETTE.text.strong],
    ['soft', PALETTE.text.soft],
  ])('il testo %s supera 4.5:1 su tutte le superfici', (_, fg) => {
    for (const bg of [PALETTE.plum.base, PALETTE.plum.raised, PALETTE.plum.lifted, PALETTE.plum.high]) {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('il testo attenuato supera 4.5:1 sul fondo e sulle card', () => {
    expect(contrast(PALETTE.text.mute, PALETTE.plum.base)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PALETTE.text.mute, PALETTE.plum.raised)).toBeGreaterThanOrEqual(4.5);
  });

  it("il testo sull'oro e l'oro sul fondo restano leggibili", () => {
    expect(contrast(PALETTE.text.ink, PALETTE.gold.core)).toBeGreaterThanOrEqual(7);
    expect(contrast(PALETTE.gold.core, PALETTE.plum.base)).toBeGreaterThanOrEqual(7);
    expect(contrast(PALETTE.text.strong, PALETTE.red.core)).toBeGreaterThanOrEqual(4.5);
  });
});

// ── Un colore, una fonte ────────────────────────────────────────────────────
// Nessun componente scrive un colore: ne' esadecimali Pixi, ne' stringhe CSS.
// L'unica eccezione e' la palette stessa (e i commenti, che si scartano).
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : d.name.endsWith('.ts') ? [join(dir, d.name)] : []
  );
}
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const TS_FILES = walk('src').filter((f) => !/[\\/]art[\\/]palette\.ts$/.test(f));

describe('nessun colore fuori dai token', () => {
  // Il guardiano non deve poter passare "a vuoto": se il filtro escludesse
  // tutto, ogni controllo qui sotto sarebbe verde senza controllare nulla.
  it('controlla tutto il sorgente tranne la palette', () => {
    expect(TS_FILES.length).toBeGreaterThan(80);
    expect(TS_FILES.some((f) => f.endsWith('palette.ts'))).toBe(false);
  });

  it.each(TS_FILES)('%s non contiene colori letterali', (f) => {
    const src = stripComments(read(f));
    const hex = src.match(/\b0x[0-9a-fA-F]{6}\b/g) ?? [];
    const strings = src.match(/['"`]#[0-9a-fA-F]{3,8}['"`]|rgba?\(\s*\d/g) ?? [];
    expect([...hex, ...strings]).toEqual([]);
  });

  it.each(cssFiles)('%s non contiene colori letterali', (f) => {
    const src = read(join(STYLES, f)).replace(/\/\*[\s\S]*?\*\//g, '');
    const bad = src.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/g) ?? [];
    expect(bad).toEqual([]);
  });
});
