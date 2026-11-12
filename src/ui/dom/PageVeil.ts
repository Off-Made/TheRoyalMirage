/**
 * THE ROYAL MIRAGE — Velo dei cambi di pagina
 *
 * Copre la finestra mentre si passa fra home e sala, e la scopre a scambio
 * avvenuto. Entrare in un tavolo e uscirne resta invece compito della fiche
 * (`fx/transitions/chip.ts`), voluta dal committente.
 *
 * ── Perche' un velo DOM e non quello Pixi ──
 * Home e sala sono `div` opachi SOPRA il canvas: un velo disegnato nel canvas
 * resta sotto di loro e non si vede. Prima le due schermate si incrociavano
 * in dissolvenza; ma far cambiare opacita' a due livelli a tutta pagina
 * costringe il browser a ricomporre (e spesso a ridisegnare) l'intera sala a
 * ogni fotogramma: su una GPU integrata erano anche 1,2 s di blocco.
 *
 * Il velo e' un solo livello a tinta unita: animarne l'opacita' non costa
 * quasi nulla. Lo scambio di schermata e il suo primo disegno avvengono a
 * velo chiuso, dove uno scatto non si vede.
 *
 * Le due fasi restano sotto i 350 ms come le transizioni di
 * `fx/transitions` (vincolo 4 di CONSTRAINTS.md).
 *
 * Se lo scambio si fa attendere, dopo un attimo compare al centro una moneta
 * che gira. Negli scambi normali non fa in tempo a comparire, cosi' non
 * lampeggia.
 */
import { div, el } from './el';
import { iconUrl } from '@/art/images';
import { settings } from '@/state/store';

/** Durate delle due fasi: devono combaciare con `.go-veil` in menu.css. */
const COVER_MS = 180;
const REVEAL_MS = 220;

let node: HTMLDivElement | null = null;

function veil(): HTMLDivElement {
  if (node) return node;
  node = div(
    'go-veil',
    el('img', {
      class: 'go-veil__coin',
      attrs: { src: iconUrl('coin'), alt: '', 'aria-hidden': true, width: 96, height: 96 },
    })
  );
  node.setAttribute('aria-hidden', 'true');
  document.body.append(node);
  return node;
}

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** Chiude il velo e si risolve quando la pagina e' interamente coperta. */
export async function coverPage(): Promise<void> {
  const v = veil();
  v.classList.toggle('is-still', settings().reducedMotion);
  // Un frame fra la creazione e l'accensione: senza, il browser vedrebbe
  // nascere il velo gia' opaco e salterebbe la dissolvenza.
  await nextFrame();
  v.classList.add('is-on');
  await wait(COVER_MS);
}

/** Riapre il velo sulla schermata nuova, poi lo toglie dalla pagina. */
export async function revealPage(): Promise<void> {
  const v = veil();
  // Due frame a velo chiuso: il primo disegno della schermata nuova (il piu'
  // costoso) avviene qui, dove non si vede.
  await nextFrame();
  await nextFrame();
  v.classList.remove('is-on');
  await wait(REVEAL_MS);
  // Fuori dalla pagina fra un cambio e l'altro: anche invisibile, un livello
  // a tutta finestra sopra il canvas rallenta il compositing (misurato: piu'
  // scatti entrando nei tavoli finche' restava nel DOM).
  if (node === v && !v.classList.contains('is-on')) {
    v.remove();
    node = null;
  }
}
