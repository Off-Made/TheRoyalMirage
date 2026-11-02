/**
 * THE ROYAL MIRAGE — Caricamento font
 *
 * Due famiglie, ruoli netti:
 *   · Big Shoulders Display — insegne, titoli, logo. Lettere condensate da
 *     marquee americana: hanno il carattere dell'insegna senza esserne la
 *     caricatura. La variante Inline (stessa famiglia, filo inciso al centro
 *     come un tubo al neon) e' riservata al marchio.
 *   · Manrope — interfaccia e NUMERI. Cifre tabellari (`tnum`): saldo e
 *     puntate non ballano quando cambiano.
 *
 * Pixi rasterizza il testo con l'API Canvas al momento della creazione: se
 * il font non e' pronto, la texture resta col fallback per sempre. Quindi si
 * attende PRIMA di costruire qualunque scena, con un timeout perche' su reti
 * aziendali Google Fonts puo' essere bloccato.
 */

export const FONTS = {
  display: 'Big Shoulders Display',
  marquee: 'Big Shoulders Inline Display',
  ui: 'Manrope',
} as const;

/** Stack CSS completi con fallback di sistema, usati nei TextStyle di Pixi. */
export const FONT_STACK = {
  display: `'Big Shoulders Display', 'Arial Narrow', 'Roboto Condensed', sans-serif`,
  marquee: `'Big Shoulders Inline Display', 'Big Shoulders Display', 'Arial Narrow', sans-serif`,
  ui: `'Manrope', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`,
  /** Numeri: stessa famiglia dell'interfaccia, peso pieno, cifre tabellari. */
  num: `'Manrope', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`,
} as const;

let loaded = false;

/** Vero se i webfont sono effettivamente disponibili (falso = siamo sui fallback). */
export function fontsAvailable(): boolean {
  return loaded;
}

/**
 * Attende che i font siano pronti, al massimo `timeoutMs`.
 * Non lancia mai: un casino' col font di sistema e' brutto, uno che non parte e' peggio.
 */
export async function loadFonts(timeoutMs = 4000): Promise<boolean> {
  if (!('fonts' in document)) return false;

  const specs = [
    `600 1rem '${FONTS.display}'`,
    `800 1rem '${FONTS.display}'`,
    `900 1rem '${FONTS.display}'`,
    `800 1rem '${FONTS.marquee}'`,
    `400 1rem '${FONTS.ui}'`,
    `600 1rem '${FONTS.ui}'`,
    `800 1rem '${FONTS.ui}'`,
  ];

  const work = Promise.all(specs.map((s) => document.fonts.load(s).catch(() => [])));
  const timeout = new Promise<'timeout'>((res) => setTimeout(() => res('timeout'), timeoutMs));

  const result = await Promise.race([work.then(() => 'ok' as const), timeout]);
  loaded = result === 'ok' && document.fonts.check(`800 1rem '${FONTS.display}'`);

  if (!loaded) {
    console.warn('[fonts] Webfont non disponibili (rete bloccata o lenta). Uso i fallback di sistema.');
    document.documentElement.classList.add('no-webfonts');
  }
  return loaded;
}
