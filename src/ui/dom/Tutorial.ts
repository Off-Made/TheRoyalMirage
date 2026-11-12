/**
 * THE ROYAL MIRAGE — Tutorial guidato
 *
 * Al primo ingresso in un gioco (e a richiesta col pulsante "Guida"), una
 * sequenza di passi: un velo scuro copre lo schermo e lascia "accesa" solo la
 * parte di cui si parla, con un fumetto che la spiega. Avanti / Indietro /
 * Chiudi tutorial, Esc per uscire, frecce per scorrere.
 *
 * ── Perche' un livello DOM e non Pixi ──
 * Il tutorial deve poter evidenziare SIA i comandi dell'HUD (DOM) SIA le zone
 * del tavolo (Pixi). Un livello DOM sopra entrambi misura gli uni con
 * `getBoundingClientRect()` e le altre con un rettangolo gia' convertito in
 * pixel CSS dalla scena (vedi `GameScene.designTarget`).
 *
 * ── Perche' non passa da `showModal` ──
 * `showModal` chiude la modale aperta: il tutorial deve poter convivere con
 * l'HUD senza toccare il sistema delle modali. Sta a z-index 600: sopra
 * l'HUD e le modali (500), sotto i toast (800). Con il tutorial aperto non
 * si apre nessuna modale, perche' i click fuori dal fumetto sono bloccati.
 *
 * Il ritaglio e' una maschera SVG: un rettangolo pieno meno un rettangolo
 * arrotondato. Il bersaglio viene rimisurato a ogni frame finche' il
 * tutorial e' aperto, cosi' segue ridimensionamenti, rotazioni del telefono
 * e animazioni d'ingresso dell'HUD senza ascoltare nulla in particolare.
 */

import { t } from '@/i18n';
import { button, div, el } from './el';

/** Rettangolo in pixel CSS della finestra. */
export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TutorialStep {
  title: string;
  text: string;
  /**
   * Cosa evidenziare: un selettore CSS (primo elemento visibile che
   * corrisponde), una funzione che restituisce un rettangolo, oppure niente
   * (fumetto al centro, velo pieno).
   */
  target?: string | (() => ScreenRect | null);
  /** Margine attorno al bersaglio, px. Default 10. */
  pad?: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

let active: { close: () => void } | null = null;

export function isTutorialOpen(): boolean {
  return active !== null;
}

/** Chiude il tutorial aperto, come Esc o "Chiudi tutorial". */
export function closeTutorial(): void {
  active?.close();
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

function measure(step: TutorialStep): ScreenRect | null {
  const tg = step.target;
  if (!tg) return null;
  if (typeof tg === 'function') return tg();
  for (const n of document.querySelectorAll<HTMLElement>(tg)) {
    const r = n.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return { x: r.left, y: r.top, w: r.width, h: r.height };
  }
  return null;
}

/**
 * Avvia il tutorial. Se ne e' gia' aperto uno lo chiude prima.
 * `onClose` viene chiamato una volta sola, comunque lo si chiuda.
 */
export function runTutorial(steps: readonly TutorialStep[], onClose?: () => void): { close: () => void } {
  active?.close();
  let index = 0;
  let raf = 0;
  let closed = false;

  // ── Velo con ritaglio
  const maskId = `go-tut-mask-${Math.random().toString(36).slice(2, 8)}`;
  const root = svg('svg', { class: 'go-tut__veil', width: '100%', height: '100%', 'aria-hidden': 'true' });
  const mask = svg('mask', { id: maskId });
  const maskBg = svg('rect', { x: 0, y: 0, width: '100%', height: '100%', fill: 'white' });
  const hole = svg('rect', { x: 0, y: 0, width: 0, height: 0, rx: 16, fill: 'black' });
  mask.append(maskBg, hole);
  const defs = svg('defs', {});
  defs.append(mask);
  const shade = svg('rect', { class: 'go-tut__shade', x: 0, y: 0, width: '100%', height: '100%', mask: `url(#${maskId})` });
  root.append(defs, shade);

  const ring = div('go-tut__ring');

  // ── Fumetto
  const counter = el('span', { class: 'go-tut__count' });
  const title = el('h3', { class: 'go-tut__title' });
  const text = el('p', { class: 'go-tut__text' });
  const back = button(t('tut.back'), { variant: 'ghost', size: 'sm', onClick: () => go(index - 1) });
  const next = button(t('tut.next'), { variant: 'primary', size: 'sm', onClick: () => go(index + 1) });
  const skip = button(t('tut.close'), { variant: 'ghost', size: 'sm', onClick: () => close() });
  skip.classList.add('go-tut__skip');
  const bubble = div(
    'go-tut__bubble',
    div('go-tut__head', counter, skip),
    title,
    text,
    div('go-tut__nav', back, next)
  );
  bubble.setAttribute('role', 'dialog');
  bubble.setAttribute('aria-modal', 'true');

  const layer = div('go-tut');
  layer.append(root, ring, bubble);
  // I click sul velo non devono arrivare al gioco sotto: niente giocate
  // accidentali mentre si legge.
  layer.addEventListener('pointerdown', (e) => {
    if (!bubble.contains(e.target as Node)) e.preventDefault();
  });
  document.body.append(layer);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(index - 1);
    } else if (e.code === 'Space') {
      // Lo Spazio, sotto, e' "Gira"/"Distribuisci": non deve passare.
      e.preventDefault();
    }
    e.stopImmediatePropagation();
  };
  window.addEventListener('keydown', onKey, true);

  function place(): void {
    const step = steps[index]!;
    const r = measure(step);
    const pad = step.pad ?? 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (r) {
      const x = Math.max(4, r.x - pad);
      const y = Math.max(4, r.y - pad);
      const w = Math.min(vw - 8, r.w + pad * 2);
      const h = Math.min(vh - 8, r.h + pad * 2);
      hole.setAttribute('x', String(x));
      hole.setAttribute('y', String(y));
      hole.setAttribute('width', String(w));
      hole.setAttribute('height', String(h));
      ring.style.display = '';
      ring.style.transform = `translate(${x}px, ${y}px)`;
      ring.style.width = `${w}px`;
      ring.style.height = `${h}px`;
      // Fumetto sotto il bersaglio se c'e' posto, altrimenti sopra; in
      // orizzontale centrato sul bersaglio ma sempre dentro la finestra.
      const bw = bubble.offsetWidth;
      const bh = bubble.offsetHeight;
      const gap = 18;
      let by = y + h + gap;
      if (by + bh > vh - 8) by = y - bh - gap;
      if (by < 8) by = Math.max(8, Math.min(vh - bh - 8, y + h / 2 - bh / 2));
      let bx = x + w / 2 - bw / 2;
      bx = Math.max(8, Math.min(vw - bw - 8, bx));
      bubble.style.transform = `translate(${bx}px, ${by}px)`;
    } else {
      hole.setAttribute('width', '0');
      hole.setAttribute('height', '0');
      ring.style.display = 'none';
      bubble.style.transform = `translate(${(vw - bubble.offsetWidth) / 2}px, ${(vh - bubble.offsetHeight) / 2}px)`;
    }
  }

  function loop(): void {
    if (closed) return;
    place();
    raf = requestAnimationFrame(loop);
  }

  function go(i: number): void {
    if (i < 0) return;
    if (i >= steps.length) {
      close();
      return;
    }
    index = i;
    const step = steps[i]!;
    counter.textContent = t('tut.step', { i: i + 1, n: steps.length });
    title.textContent = step.title;
    text.textContent = step.text;
    back.style.visibility = i === 0 ? 'hidden' : '';
    next.querySelector('.go-btn__label')!.textContent = i === steps.length - 1 ? t('tut.done') : t('tut.next');
    place();
    next.focus({ preventScroll: true });
  }

  function close(): void {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey, true);
    layer.classList.add('is-out');
    setTimeout(() => layer.remove(), 220);
    if (active === handle) active = null;
    onClose?.();
  }

  const handle = { close };
  active = handle;
  go(0);
  requestAnimationFrame(() => layer.classList.add('is-in'));
  loop();
  return handle;
}
