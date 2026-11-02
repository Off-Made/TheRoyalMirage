/**
 * THE ROYAL MIRAGE — Custom property CSS generate dalla palette
 *
 * Prima i colori erano scritti due volte: in `palette.ts` per Pixi e a mano
 * in `main.css` per il DOM, con nomi diversi (`--gold-hi` contro
 * `gold.highlight`) e meta' delle tinte presenti da una parte sola. Due copie
 * divergono sempre.
 *
 * Ora la tabella CSS e' DERIVATA da `PALETTE` al boot: `gold.whiteHot`
 * diventa `--gold-white-hot`, `ivory` diventa `--ivory`. Per ogni token si
 * emettono due proprieta':
 *
 *   --gold-core: #f5c542;
 *   --gold-core-rgb: 245,197,66;
 *
 * La tripla `-rgb` e' cio' che permette di non scrivere piu' letterali nelle
 * trasparenze: `rgba(var(--gold-core-rgb), .3)` invece di `rgba(245,197,66,.3)`.
 *
 * `tests/palette-sync.test.ts` fa fallire la build se qualcuno ridefinisce
 * un colore in CSS o usa una variabile che non esiste.
 */

import { PALETTE, css, rgbTriple } from './palette';

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** `['gold', 'whiteHot']` → `--gold-white-hot`. */
export function cssVarName(path: readonly string[]): string {
  return `--${path.map(kebab).join('-')}`;
}

/** Tabella appiattita nome → colore, derivata ricorsivamente da PALETTE. */
export function paletteTokens(): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (node: unknown, path: string[]) => {
    if (typeof node === 'number') {
      out.set(cssVarName(path), node);
      return;
    }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, [...path, k]);
    }
  };
  walk(PALETTE, []);
  return out;
}

/** Le stesse dichiarazioni come testo CSS (per i test e per l'iniezione). */
export function paletteCssText(): string {
  const lines: string[] = [];
  for (const [name, hex] of paletteTokens()) {
    lines.push(`  ${name}: ${css(hex)};`, `  ${name}-rgb: ${rgbTriple(hex)};`);
  }
  return `:root {\n${lines.join('\n')}\n}\n`;
}

/**
 * Installa i token su :root. Va chiamata nel boot PRIMA di montare qualunque
 * schermata, cosi' le variabili esistono al primo calcolo degli stili.
 */
export function installPaletteVars(root: HTMLElement = document.documentElement): void {
  for (const [name, hex] of paletteTokens()) {
    root.style.setProperty(name, css(hex));
    root.style.setProperty(`${name}-rgb`, rgbTriple(hex));
  }
}
