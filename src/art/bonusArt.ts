/**
 * THE ROYAL MIRAGE — Disegni dei bonus delle slot
 *
 *   · Ruota della fortuna: faccia a spicchi, cerchione con lampadine,
 *     lancetta, perno
 *   · Forziere: chiuso e aperto, in prospettiva (fronte, fianco, coperchio)
 *   · Le versioni piccole come simboli dei rulli
 *
 * Come la fiche della casa (`houseChip.ts`) sono COMPOSIZIONI di materiali
 * (oro, velluto, legno) cotte una volta in texture: niente illustrazioni
 * tracciate, solo gradienti di materiale, filetti e tipografia. Il "3D"
 * viene da luce e spessore: un bordo piu' scuro sotto il cerchione, il
 * fianco del forziere in ombra, riflessi sulle superfici curve.
 */

import { PALETTE, css, rgba } from './palette';
import { goldFill, setGlow, clearGlow, roundRectPath, starPath } from './materials';
import { FONT_STACK } from '@/core/fonts';

type Ctx = CanvasRenderingContext2D;
type Tone = { light: number; core: number; deep: number };

export interface WheelFaceSegment {
  /** Scritta grande (×10, +1, STOP). */
  label: string;
  /** Scritta piccola sotto (GIRO), facoltativa. */
  sub?: string;
  /**
   * Scritta lunga (NULLA, STOP): corre lungo il raggio, in verticale quando
   * lo spicchio e' sotto la lancetta, cosi' resta dentro lo spicchio.
   */
  vertical?: boolean;
  /** Due parole su due righe della stessa grandezza (ALTRO / GIRO). */
  twoLine?: boolean;
  tone: Tone;
  /** Colore della scritta. */
  ink: number;
}

const TAU = Math.PI * 2;

// ═══════════════════════════════════════════════ RUOTA

/** Faccia girevole della ruota: spicchi, filetti d'oro, scritte radiali. */
export function drawWheelFace(ctx: Ctx, S: number, segs: readonly WheelFaceSegment[]): void {
  const c = S / 2;
  const R = S / 2 - 2;
  const step = TAU / segs.length;
  ctx.save();
  segs.forEach((s, i) => {
    const a0 = -Math.PI / 2 + i * step;
    const a1 = a0 + step;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, R, a0, a1);
    ctx.closePath();
    // Dal centro al bordo: il colore si accende verso l'esterno, come una
    // superficie laccata che prende la luce sul bordo.
    const g = ctx.createRadialGradient(c, c, R * 0.15, c, c, R);
    g.addColorStop(0, css(s.tone.deep));
    g.addColorStop(0.55, css(s.tone.core));
    g.addColorStop(0.92, css(s.tone.light));
    g.addColorStop(1, css(s.tone.core));
    ctx.fillStyle = g;
    ctx.fill();
  });
  // Filetti d'oro fra gli spicchi.
  ctx.lineWidth = Math.max(2, S * 0.006);
  ctx.strokeStyle = goldFill(ctx, 0, 0, S, S, { polish: 1 });
  for (let i = 0; i < segs.length; i++) {
    const a = -Math.PI / 2 + i * step;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * R * 0.22, c + Math.sin(a) * R * 0.22);
    ctx.lineTo(c + Math.cos(a) * R, c + Math.sin(a) * R);
    ctx.stroke();
  }
  // Scritte: lungo il raggio, leggibili quando lo spicchio e' sotto la lancetta.
  segs.forEach((s, i) => {
    const mid = -Math.PI / 2 + (i + 0.5) * step;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(mid + Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (s.vertical) {
      // Una lettera sotto l'altra, dal bordo verso il centro: la parola
      // resta dentro lo spicchio anche se e' lunga.
      const letters = [...s.label];
      const size = Math.round(S * (letters.length > 4 ? 0.047 : 0.052));
      const stepY = size * 0.98;
      const y0 = -R * 0.93 + size / 2;
      ctx.font = `900 ${size}px ${FONT_STACK.display}`;
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.18;
      letters.forEach((ch, k) => {
        const y = y0 + k * stepY;
        setGlow(ctx, PALETTE.plum.abyss, S * 0.01, 0.85);
        ctx.strokeStyle = css(PALETTE.plum.abyss);
        ctx.strokeText(ch, 0, y);
        clearGlow(ctx);
        ctx.fillStyle = css(s.ink);
        ctx.fillText(ch, 0, y);
      });
      ctx.restore();
      return;
    }
    if (s.twoLine && s.sub) {
      // Due righe uguali, la prima piu' vicina al bordo dove lo spicchio e' piu' largo.
      const size = Math.round(S * 0.043);
      ctx.font = `900 ${size}px ${FONT_STACK.display}`;
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.18;
      for (const [text, r] of [[s.label, 0.79], [s.sub, 0.66]] as const) {
        setGlow(ctx, PALETTE.plum.abyss, S * 0.01, 0.85);
        ctx.strokeStyle = css(PALETTE.plum.abyss);
        ctx.strokeText(text, 0, -R * r, R * 0.3);
        clearGlow(ctx);
        ctx.fillStyle = css(s.ink);
        ctx.fillText(text, 0, -R * r, R * 0.3);
      }
      ctx.restore();
      return;
    }
    const big = Math.round(S * (s.label.length > 3 ? 0.056 : 0.071));
    ctx.font = `900 ${big}px ${FONT_STACK.display}`;
    setGlow(ctx, PALETTE.plum.abyss, S * 0.012, 0.85);
    ctx.lineJoin = 'round';
    ctx.lineWidth = big * 0.16;
    ctx.strokeStyle = css(PALETTE.plum.abyss);
    ctx.strokeText(s.label, 0, -R * 0.74, R * 0.27);
    clearGlow(ctx);
    ctx.fillStyle = css(s.ink);
    ctx.fillText(s.label, 0, -R * 0.74, R * 0.27);
    if (s.sub) {
      const small = Math.round(S * 0.03);
      ctx.font = `800 ${small}px ${FONT_STACK.display}`;
      ctx.lineWidth = small * 0.18;
      ctx.strokeText(s.sub, 0, -R * 0.6);
      ctx.fillText(s.sub, 0, -R * 0.6);
    }
    ctx.restore();
  });
  // Anello interno d'oro: chiude gli spicchi intorno al perno.
  ctx.beginPath();
  ctx.arc(c, c, R * 0.24, 0, TAU);
  ctx.lineWidth = S * 0.018;
  ctx.strokeStyle = goldFill(ctx, c - R * 0.24, c - R * 0.24, R * 0.48, R * 0.48, { polish: 1 });
  ctx.stroke();
  ctx.restore();
}

/**
 * Cerchione fisso: anello d'oro largo con le sedi delle lampadine, e sotto
 * un secondo anello scuro spostato in basso che fa da SPESSORE (la ruota
 * sembra un disco vero, non un adesivo).
 */
export function drawWheelRim(ctx: Ctx, S: number, faceR: number, bulbs: number): void {
  const c = S / 2;
  const outer = S / 2 - S * 0.03;
  ctx.save();
  // Spessore: il fianco del disco, in ombra.
  ctx.beginPath();
  ctx.arc(c, c + S * 0.022, outer, 0, TAU);
  ctx.arc(c, c + S * 0.022, faceR * 0.98, 0, TAU, true);
  const side = ctx.createLinearGradient(0, c, 0, c + outer);
  side.addColorStop(0, css(PALETTE.gold.shadow));
  side.addColorStop(1, css(PALETTE.plum.abyss));
  ctx.fillStyle = side;
  ctx.fill('evenodd');
  // Ombra morbida sotto la ruota.
  setGlow(ctx, PALETTE.plum.abyss, S * 0.04, 0.85);
  ctx.beginPath();
  ctx.arc(c, c, outer, 0, TAU);
  ctx.arc(c, c, faceR, 0, TAU, true);
  ctx.fillStyle = goldFill(ctx, c - outer, c - outer, outer * 2, outer * 2, { polish: 1 });
  ctx.fill('evenodd');
  clearGlow(ctx);
  // Filetti interno ed esterno.
  ctx.lineWidth = S * 0.005;
  ctx.strokeStyle = css(PALETTE.gold.shadow);
  for (const r of [outer, faceR]) {
    ctx.beginPath();
    ctx.arc(c, c, r, 0, TAU);
    ctx.stroke();
  }
  // Fascia di velluto al centro del cerchione, dove stanno le lampadine.
  const mid = (outer + faceR) / 2;
  ctx.beginPath();
  ctx.arc(c, c, mid, 0, TAU);
  ctx.lineWidth = (outer - faceR) * 0.5;
  ctx.strokeStyle = css(PALETTE.red.shadow);
  ctx.stroke();
  // Sedi delle lampadine.
  for (let i = 0; i < bulbs; i++) {
    const a = -Math.PI / 2 + (i / bulbs) * TAU;
    const x = c + Math.cos(a) * mid;
    const y = c + Math.sin(a) * mid;
    ctx.beginPath();
    ctx.arc(x, y, (outer - faceR) * 0.2, 0, TAU);
    ctx.fillStyle = css(PALETTE.gold.shadow);
    ctx.fill();
  }
  ctx.restore();
}

/** Riflesso fisso sopra la ruota: la luce della sala sulla vernice. */
export function drawWheelGloss(ctx: Ctx, S: number): void {
  const c = S / 2;
  const g = ctx.createRadialGradient(c * 0.7, c * 0.55, 0, c * 0.7, c * 0.55, S * 0.55);
  g.addColorStop(0, rgba(PALETTE.text.strong, 0.22));
  g.addColorStop(0.45, rgba(PALETTE.text.strong, 0.05));
  g.addColorStop(1, rgba(PALETTE.text.strong, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, S / 2, 0, TAU);
  ctx.fill();
}

/** Lampadina accesa del cerchione. */
export function drawBulb(ctx: Ctx, S: number): void {
  const c = S / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, css(PALETTE.gold.hot));
  g.addColorStop(0.35, css(PALETTE.gold.light));
  g.addColorStop(0.6, rgba(PALETTE.gold.core, 0.55));
  g.addColorStop(1, rgba(PALETTE.gold.core, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
}

/** Lancetta: una goccia d'oro con una gemma rossa, che punta in basso. */
export function drawWheelPointer(ctx: Ctx, w: number, h: number): void {
  ctx.save();
  setGlow(ctx, PALETTE.plum.abyss, w * 0.12, 0.9);
  ctx.beginPath();
  ctx.moveTo(w / 2, h * 0.98);
  ctx.bezierCurveTo(w * 0.1, h * 0.55, w * 0.02, h * 0.3, w * 0.12, h * 0.16);
  ctx.arc(w / 2, h * 0.3, w * 0.4, Math.PI * 1.15, Math.PI * 1.85);
  ctx.bezierCurveTo(w * 0.98, h * 0.3, w * 0.9, h * 0.55, w / 2, h * 0.98);
  ctx.closePath();
  ctx.fillStyle = goldFill(ctx, 0, 0, w, h, { polish: 1 });
  ctx.fill();
  clearGlow(ctx);
  ctx.lineWidth = w * 0.035;
  ctx.strokeStyle = css(PALETTE.gold.shadow);
  ctx.stroke();
  const gy = h * 0.3;
  const gr = w * 0.2;
  const gem = ctx.createRadialGradient(w / 2 - gr * 0.35, gy - gr * 0.35, gr * 0.1, w / 2, gy, gr);
  gem.addColorStop(0, css(PALETTE.red.light));
  gem.addColorStop(0.5, css(PALETTE.red.core));
  gem.addColorStop(1, css(PALETTE.red.shadow));
  ctx.beginPath();
  ctx.arc(w / 2, gy, gr, 0, TAU);
  ctx.fillStyle = gem;
  ctx.fill();
  ctx.lineWidth = w * 0.03;
  ctx.strokeStyle = css(PALETTE.gold.deep);
  ctx.stroke();
  ctx.restore();
}

/** Perno centrale: cupola d'oro con la stella della casa. */
export function drawWheelHub(ctx: Ctx, S: number): void {
  const c = S / 2;
  const r = S * 0.46;
  ctx.save();
  setGlow(ctx, PALETTE.plum.abyss, S * 0.08, 0.9);
  const dome = ctx.createRadialGradient(c - r * 0.35, c - r * 0.4, r * 0.05, c, c, r);
  dome.addColorStop(0, css(PALETTE.gold.hot));
  dome.addColorStop(0.35, css(PALETTE.gold.light));
  dome.addColorStop(0.75, css(PALETTE.gold.mid));
  dome.addColorStop(1, css(PALETTE.gold.shadow));
  ctx.beginPath();
  ctx.arc(c, c, r, 0, TAU);
  ctx.fillStyle = dome;
  ctx.fill();
  clearGlow(ctx);
  ctx.lineWidth = S * 0.03;
  ctx.strokeStyle = css(PALETTE.gold.deep);
  ctx.stroke();
  starPath(ctx, c, c, r * 0.55, r * 0.24, 5, -Math.PI / 2);
  ctx.fillStyle = css(PALETTE.red.core);
  ctx.fill();
  ctx.lineWidth = S * 0.02;
  ctx.strokeStyle = css(PALETTE.gold.shadow);
  ctx.stroke();
  ctx.restore();
}

// ═══════════════════════════════════════════════ PULSANTE

/** Fondo del pulsante dei bonus (GIRA!, APRI): pillola rossa con anello d'oro. */
export function drawBonusButton(ctx: Ctx, w: number, h: number, enabled: boolean): void {
  const pad = h * 0.12;
  ctx.save();
  setGlow(ctx, enabled ? PALETTE.red.core : PALETTE.plum.abyss, h * 0.3, enabled ? 0.7 : 0.5);
  roundRectPath(ctx, pad, pad, w - pad * 2, h - pad * 2, (h - pad * 2) / 2);
  ctx.fillStyle = goldFill(ctx, pad, pad, w - pad * 2, h - pad * 2, { polish: 1 });
  ctx.fill();
  clearGlow(ctx);
  const inset = h * 0.07;
  roundRectPath(ctx, pad + inset, pad + inset, w - (pad + inset) * 2, h - (pad + inset) * 2, (h - (pad + inset) * 2) / 2);
  const g = ctx.createLinearGradient(0, pad, 0, h - pad);
  if (enabled) {
    g.addColorStop(0, css(PALETTE.red.light));
    g.addColorStop(0.45, css(PALETTE.red.core));
    g.addColorStop(1, css(PALETTE.red.deep));
  } else {
    g.addColorStop(0, css(PALETTE.plum.high));
    g.addColorStop(1, css(PALETTE.plum.raised));
  }
  ctx.fillStyle = g;
  ctx.fill();
  // Riflesso in alto: il pulsante sembra lucido e premibile.
  roundRectPath(ctx, pad + inset * 2, pad + inset * 1.4, w - (pad + inset * 2) * 2, (h - pad * 2) * 0.32, (h - pad * 2) * 0.16);
  ctx.fillStyle = rgba(PALETTE.text.strong, enabled ? 0.22 : 0.08);
  ctx.fill();
  ctx.restore();
}

// ═══════════════════════════════════════════════ FORZIERE

/**
 * Forziere in leggera prospettiva: fronte, fianco destro in ombra,
 * coperchio a botte. Chiuso: lucchetto con la gemma `gem`. Aperto: il
 * coperchio e' ribaltato all'indietro e dall'interno esce la luce dell'oro.
 */
export function drawChest(ctx: Ctx, W: number, H: number, open: boolean, gem: Tone): void {
  const s = Math.min(W / 1.2, H);
  const x = (W - s * 0.88) / 2;
  const bodyTop = H * 0.48;
  const bodyH = H * 0.42;
  const fw = s * 0.88; // larghezza del fronte
  const depth = s * 0.17; // profondita' della bocca quando e' aperto
  const wood = PALETTE.leather;
  ctx.save();
  // Niente ombra a terra ne' fianco in ombra: su richiesta il forziere e'
  // solo il fronte, e il volume viene da luce, riflessi e fasce d'oro.

  // Fronte del corpo: assi di legno.
  const fg = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyH);
  fg.addColorStop(0, css(wood.light));
  fg.addColorStop(0.5, css(wood.core));
  fg.addColorStop(1, css(wood.deep));
  ctx.fillStyle = fg;
  ctx.fillRect(x, bodyTop, fw, bodyH);
  ctx.strokeStyle = rgba(PALETTE.plum.abyss, 0.45);
  ctx.lineWidth = s * 0.008;
  for (let i = 1; i < 4; i++) {
    const y = bodyTop + (bodyH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + fw, y);
    ctx.stroke();
  }

  if (open) {
    // Interno: bocca scura e luce dorata che sale (frontale, senza fianco).
    const mouth = depth * 0.45;
    ctx.beginPath();
    ctx.moveTo(x, bodyTop);
    ctx.lineTo(x + fw * 0.06, bodyTop - mouth);
    ctx.lineTo(x + fw * 0.94, bodyTop - mouth);
    ctx.lineTo(x + fw, bodyTop);
    ctx.closePath();
    ctx.fillStyle = css(PALETTE.plum.abyss);
    ctx.fill();
    const glow = ctx.createRadialGradient(x + fw / 2, bodyTop - depth * 0.2, 0, x + fw / 2, bodyTop, s * 0.75);
    glow.addColorStop(0, rgba(PALETTE.gold.hot, 0.95));
    glow.addColorStop(0.25, rgba(PALETTE.gold.light, 0.6));
    glow.addColorStop(1, rgba(PALETTE.gold.core, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, bodyTop + bodyH * 0.3);
    // Monete che affiorano.
    for (let i = 0; i < 7; i++) {
      const cx = x + fw * (0.14 + 0.12 * i);
      const cy = bodyTop - depth * 0.18 - Math.sin((i / 6) * Math.PI) * s * 0.05;
      const r = s * 0.05;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.55, 0, 0, TAU);
      ctx.fillStyle = goldFill(ctx, cx - r, cy - r, r * 2, r * 2, { polish: 1 });
      ctx.fill();
      ctx.lineWidth = s * 0.006;
      ctx.strokeStyle = css(PALETTE.gold.shadow);
      ctx.stroke();
    }
    // Coperchio ribaltato: l'interno del coperchio visto da davanti.
    const lidTop = bodyTop - s * 0.5;
    ctx.beginPath();
    ctx.moveTo(x + fw * 0.06, bodyTop - mouth);
    ctx.lineTo(x + fw * 0.1, lidTop);
    ctx.lineTo(x + fw * 0.9, lidTop);
    ctx.lineTo(x + fw * 0.94, bodyTop - mouth);
    ctx.closePath();
    const lg = ctx.createLinearGradient(0, lidTop, 0, bodyTop);
    lg.addColorStop(0, css(wood.core));
    lg.addColorStop(1, css(wood.light));
    ctx.fillStyle = lg;
    ctx.fill();
    ctx.lineWidth = s * 0.03;
    ctx.strokeStyle = goldFill(ctx, x, lidTop, fw, s * 0.5, { polish: 1 });
    ctx.stroke();
  } else {
    // Coperchio a botte: fronte arcuato + tetto in prospettiva.
    const lidH = s * 0.26;
    ctx.beginPath();
    ctx.moveTo(x, bodyTop);
    ctx.bezierCurveTo(x, bodyTop - lidH * 1.25, x + fw, bodyTop - lidH * 1.25, x + fw, bodyTop);
    ctx.closePath();
    const lidG = ctx.createLinearGradient(0, bodyTop - lidH, 0, bodyTop);
    lidG.addColorStop(0, css(wood.light));
    lidG.addColorStop(1, css(wood.core));
    ctx.fillStyle = lidG;
    ctx.fill();
    // Riflesso sulla botte.
    ctx.beginPath();
    ctx.ellipse(x + fw * 0.4, bodyTop - lidH * 0.62, fw * 0.3, lidH * 0.16, 0, 0, TAU);
    ctx.fillStyle = rgba(PALETTE.text.strong, 0.16);
    ctx.fill();
    // Fascia d'oro sulla giuntura.
    ctx.fillStyle = goldFill(ctx, x, bodyTop - s * 0.03, fw, s * 0.06, { polish: 1 });
    ctx.fillRect(x - s * 0.01, bodyTop - s * 0.03, fw + s * 0.02, s * 0.06);
    // Fasce sul coperchio.
    for (const fx of [0.1, 0.9]) {
      ctx.beginPath();
      const bx = x + fw * fx;
      ctx.moveTo(bx - s * 0.035, bodyTop);
      ctx.quadraticCurveTo(bx - s * 0.035, bodyTop - lidH * 0.95, bx, bodyTop - lidH * (fx < 0.5 ? 0.9 : 0.9));
      ctx.lineTo(bx + s * 0.035, bodyTop - lidH * 0.9);
      ctx.quadraticCurveTo(bx + s * 0.035, bodyTop - lidH * 0.95, bx + s * 0.035, bodyTop);
      ctx.closePath();
      ctx.fillStyle = goldFill(ctx, bx - s * 0.04, bodyTop - lidH, s * 0.08, lidH, { polish: 1 });
      ctx.fill();
    }
  }

  // Fasce verticali d'oro sul fronte e borchie.
  for (const fx of [0.1, 0.9]) {
    const bx = x + fw * fx - s * 0.035;
    ctx.fillStyle = goldFill(ctx, bx, bodyTop, s * 0.07, bodyH, { polish: 1 });
    ctx.fillRect(bx, bodyTop, s * 0.07, bodyH);
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(bx + s * 0.035, bodyTop + bodyH * (0.2 + 0.3 * k), s * 0.014, 0, TAU);
      ctx.fillStyle = css(PALETTE.gold.shadow);
      ctx.fill();
    }
  }
  // Base d'oro.
  ctx.fillStyle = goldFill(ctx, x, bodyTop + bodyH - s * 0.05, fw, s * 0.05, { polish: 1 });
  ctx.fillRect(x - s * 0.01, bodyTop + bodyH - s * 0.05, fw + s * 0.02, s * 0.05);

  // Lucchetto con gemma (solo chiuso; aperto resta la placca).
  const lw = s * 0.2;
  const lh = s * 0.22;
  const lx = x + fw / 2 - lw / 2;
  const ly = bodyTop - lh * 0.25;
  setGlow(ctx, PALETTE.plum.abyss, s * 0.03, 0.8);
  roundRectPath(ctx, lx, ly, lw, lh, lw * 0.2);
  ctx.fillStyle = goldFill(ctx, lx, ly, lw, lh, { polish: 1 });
  ctx.fill();
  clearGlow(ctx);
  ctx.lineWidth = s * 0.01;
  ctx.strokeStyle = css(PALETTE.gold.shadow);
  ctx.stroke();
  if (!open) {
    const gr = lw * 0.28;
    const gcx = lx + lw / 2;
    const gcy = ly + lh * 0.42;
    const gg = ctx.createRadialGradient(gcx - gr * 0.3, gcy - gr * 0.3, gr * 0.1, gcx, gcy, gr);
    gg.addColorStop(0, css(gem.light));
    gg.addColorStop(0.55, css(gem.core));
    gg.addColorStop(1, css(gem.deep));
    ctx.beginPath();
    ctx.arc(gcx, gcy, gr, 0, TAU);
    ctx.fillStyle = gg;
    ctx.fill();
    // Buco della serratura.
    ctx.fillStyle = css(PALETTE.plum.abyss);
    ctx.beginPath();
    ctx.arc(gcx, ly + lh * 0.76, lw * 0.06, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// ═══════════════════════════════════════════════ SIMBOLI DEI RULLI

/** Ruota in miniatura (simbolo dei rulli di Lucky Sevens). */
export function drawWheelSymbol(ctx: Ctx, S: number): void {
  const c = S / 2;
  const R = S * 0.36;
  const cy = S * 0.43;
  const tones = [PALETTE.red.core, PALETTE.gold.core, PALETTE.plum.high, PALETTE.red.deep, PALETTE.gold.mid, PALETTE.plum.lifted];
  ctx.save();
  setGlow(ctx, PALETTE.gold.core, S * 0.08, 0.55);
  ctx.beginPath();
  ctx.arc(c, cy, R * 1.12, 0, TAU);
  ctx.fillStyle = goldFill(ctx, c - R, cy - R, R * 2, R * 2, { polish: 1 });
  ctx.fill();
  clearGlow(ctx);
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + (i * TAU) / n;
    ctx.beginPath();
    ctx.moveTo(c, cy);
    ctx.arc(c, cy, R, a0, a0 + TAU / n);
    ctx.closePath();
    ctx.fillStyle = css(tones[i % tones.length]!);
    ctx.fill();
  }
  ctx.lineWidth = S * 0.008;
  ctx.strokeStyle = css(PALETTE.gold.light);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * TAU) / n;
    ctx.beginPath();
    ctx.moveTo(c, cy);
    ctx.lineTo(c + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.stroke();
  }
  // Lampadine sul cerchio.
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + ((i + 0.5) * TAU) / n;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * R * 1.06, cy + Math.sin(a) * R * 1.06, S * 0.012, 0, TAU);
    ctx.fillStyle = css(PALETTE.gold.hot);
    ctx.fill();
  }
  // Perno e lancetta.
  ctx.beginPath();
  ctx.arc(c, cy, R * 0.2, 0, TAU);
  ctx.fillStyle = goldFill(ctx, c - R * 0.2, cy - R * 0.2, R * 0.4, R * 0.4, { polish: 1 });
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(c, cy - R * 0.86);
  ctx.lineTo(c - R * 0.15, cy - R * 1.22);
  ctx.lineTo(c + R * 0.15, cy - R * 1.22);
  ctx.closePath();
  ctx.fillStyle = css(PALETTE.red.core);
  ctx.fill();
  ctx.lineWidth = S * 0.01;
  ctx.strokeStyle = css(PALETTE.gold.light);
  ctx.stroke();
  ctx.restore();
}

/** Forziere come simbolo dei rulli di Diamond Royale. */
export function drawChestSymbol(ctx: Ctx, S: number): void {
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.5);
  g.addColorStop(0, rgba(PALETTE.gold.core, 0.45));
  g.addColorStop(0.6, rgba(PALETTE.gold.core, 0.1));
  g.addColorStop(1, rgba(PALETTE.gold.core, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.save();
  ctx.translate(S * 0.06, S * 0.02);
  drawChest(ctx, S * 0.88, S * 0.86, false, PALETTE.red);
  ctx.restore();
}
