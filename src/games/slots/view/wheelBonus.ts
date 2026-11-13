/**
 * THE ROYAL MIRAGE — Regia della Ruota della fortuna (Lucky Sevens)
 *
 *   cartello → la slot si GIRA come una carta e dietro compare la ruota →
 *   per ogni giro: GIRA! → la ruota corre e rallenta, la lancetta scatta
 *   sui pioli → lo spicchio uscito si accende → totale → la ruota si gira
 *   e torna la slot
 *
 * Tutto e' gia' deciso in `WheelOutcome`: qui si recita. Il pulsante GIRA!
 * serve al giocatore per "lanciare" lui la ruota, ma non cambia l'esito.
 */

import { Container, Graphics, Sprite } from 'pixi.js';
import { gsap } from 'gsap';
import { DESIGN_WIDTH } from '@/core/App';
import { HUD_BOTTOM, HUD_TOP } from '@/games/common/GameHud';
import { bake } from '@/art/textureCache';
import { PALETTE } from '@/art/palette';
import {
  drawBulb,
  drawWheelFace,
  drawWheelGloss,
  drawWheelHub,
  drawWheelPointer,
  drawWheelRim,
  type WheelFaceSegment,
} from '@/art/bonusArt';
import { makeText } from '@/games/common/text';
import { formatMoney } from '@/state/wallet';
import { getLanguage } from '@/i18n';
import { sfxTick, sfxWin, sfxLose, sfxSpinStart, sfxConfirm, sfxJackpot } from '@/audio/synth';
import { payoutCents } from '../engine/spin';
import type { WheelOutcome, WheelRule, WheelSegment } from '../engine/types';
import { bonusButton, sidePanel, wait, type BonusStage } from './bonusStage';
import { ss } from './strings';

const TAU = Math.PI * 2;
const FACE = 524;
const RIM = 640;
const BULBS = 18;

function segTone(s: WheelSegment): { tone: WheelFaceSegment['tone']; ink: number } {
  if (s.kind === 'spin') return { tone: PALETTE.win, ink: PALETTE.text.strong };
  if (s.kind === 'stop') return { tone: { light: PALETTE.plum.high, core: PALETTE.plum.raised, deep: PALETTE.plum.abyss }, ink: PALETTE.red.light };
  if (s.kind === 'blank') return { tone: { light: PALETTE.plum.line, core: PALETTE.plum.lifted, deep: PALETTE.plum.base }, ink: PALETTE.text.soft };
  switch (s.value) {
    case 1:
      return { tone: { light: PALETTE.plum.mist, core: PALETTE.plum.high, deep: PALETTE.plum.raised }, ink: PALETTE.text.strong };
    case 2:
      return { tone: PALETTE.red, ink: PALETTE.gold.light };
    case 5:
      return { tone: PALETTE.accent.sapphire, ink: PALETTE.text.strong };
    case 10:
      return { tone: PALETTE.accent.violet, ink: PALETTE.gold.light };
    case 15:
      return { tone: PALETTE.accent.emerald, ink: PALETTE.text.strong };
    case 20:
      return { tone: PALETTE.accent.amber, ink: PALETTE.text.strong };
    default:
      return { tone: { light: PALETTE.gold.hot, core: PALETTE.gold.core, deep: PALETTE.gold.deep }, ink: PALETTE.red.bright };
  }
}

function faceSegments(rule: WheelRule): WheelFaceSegment[] {
  return rule.segments.map((s) => {
    const { tone, ink } = segTone(s);
    if (s.kind === 'spin') return { label: ss('wheelExtraTop'), sub: ss('wheelExtraSub'), tone, ink, twoLine: true };
    if (s.kind === 'stop') return { label: 'STOP', tone, ink, vertical: true };
    if (s.kind === 'blank') return { label: ss('wheelBlankLabel'), tone, ink, vertical: true };
    return { label: `×${s.value}`, tone, ink };
  });
}

/** La ruota completa, centrata in (0,0). Restituisce i pezzi da animare. */
function buildWheel(rule: WheelRule) {
  const group = new Container();
  const n = rule.segments.length;
  const step = TAU / n;
  const lang = getLanguage();

  const shadow = new Graphics().ellipse(0, RIM / 2 + 6, RIM * 0.42, 34).fill({ color: PALETTE.plum.abyss, alpha: 0.55 });
  const rim = new Sprite(bake(`bonus/wheel-rim-${n}`, RIM, RIM, (ctx, S) => drawWheelRim(ctx, S, FACE / 2, BULBS)));
  rim.anchor.set(0.5);
  const face = new Container();
  const faceSprite = new Sprite(
    bake(`bonus/wheel-face-${n}-${lang}`, FACE, FACE, (ctx, S) => drawWheelFace(ctx, S, faceSegments(rule)), { res: 2 })
  );
  faceSprite.anchor.set(0.5);
  const hl = new Graphics();
  hl.blendMode = 'add';
  face.addChild(faceSprite, hl);
  const gloss = new Sprite(bake('bonus/wheel-gloss', FACE, FACE, (ctx, S) => drawWheelGloss(ctx, S)));
  gloss.anchor.set(0.5);
  const hub = new Sprite(bake('bonus/wheel-hub', 128, 128, (ctx, S) => drawWheelHub(ctx, S)));
  hub.anchor.set(0.5);
  hub.scale.set(0.95);
  const pointer = new Sprite(bake('bonus/wheel-pointer', 84, 112, (ctx, w, h) => drawWheelPointer(ctx, w, h)));
  pointer.anchor.set(0.5, 0.18);
  pointer.position.set(0, -FACE / 2 - 34);

  const bulbs: Sprite[] = [];
  const bulbTex = bake('bonus/wheel-bulb', 48, 48, (ctx, S) => drawBulb(ctx, S));
  const outer = RIM / 2 - RIM * 0.03;
  const mid = (outer + FACE / 2) / 2;
  for (let i = 0; i < BULBS; i++) {
    const a = -Math.PI / 2 + (i / BULBS) * TAU;
    const b = new Sprite(bulbTex);
    b.anchor.set(0.5);
    b.position.set(Math.cos(a) * mid, Math.sin(a) * mid);
    b.blendMode = 'add';
    bulbs.push(b);
  }
  group.addChild(shadow, rim, face, gloss, ...bulbs, hub, pointer);

  const highlight = (i: number, on: boolean) => {
    gsap.killTweensOf(hl);
    hl.clear();
    if (!on) return;
    const a0 = -Math.PI / 2 + i * step;
    hl.moveTo(0, 0).arc(0, 0, FACE / 2 - 4, a0, a0 + step).closePath().fill({ color: PALETTE.gold.hot, alpha: 0.5 });
    hl.alpha = 1;
    gsap.to(hl, { alpha: 0.25, duration: 0.3, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  };
  return { group, face, pointer, bulbs, highlight, step };
}

export async function playWheel(st: BonusStage, rule: WheelRule, o: WheelOutcome, bet: number): Promise<void> {
  const reduced = st.reducedMotion();
  const pace = () => (st.turbo() ? 0.55 : 1);
  st.resetQuick();
  st.hud.message('');
  await st.titleCard(ss('wheelTitle'), ss('wheelSub', { n: rule.spins }), PALETTE.gold.light, 1.4);
  if (st.disposed()) return;
  st.resetQuick();

  // ── Costruzione, fuori scena (scala orizzontale 0: e' "di taglio").
  const { group, face, pointer, bulbs, highlight, step } = buildWheel(rule);
  const btnH = 88;
  // La ruota e' un po' piu' piccola della finestra della slot: sotto deve
  // restare posto per il pulsante GIRA! e per il messaggio dell'HUD.
  const WS = 0.97;
  const cy = HUD_TOP + 6 + (RIM * WS) / 2;
  const cx = DESIGN_WIDTH / 2;
  group.position.set(cx, cy);
  group.scale.set(0, 0.97 * WS);
  const button = bonusButton(ss('wheelSpin'), () => st.press(), 340, btnH + 8);
  button.view.position.set(cx, Math.min(HUD_BOTTOM - btnH / 2 - 64, cy + (RIM * WS) / 2 + 12 + btnH / 2));
  button.view.alpha = 0;
  const panel = sidePanel([ss('wheelSpinsLeft'), ss('wheelTotal'), ss('wheelWin')]);
  panel.view.position.set(cx + (RIM * WS) / 2 + 60, HUD_TOP + 70);
  panel.view.alpha = 0;
  panel.set(0, String(rule.spins));
  // Finche' non esce un moltiplicatore la vincita e' zero.
  panel.set(1, '—');
  panel.set(2, formatMoney(0));
  const layer = new Container();
  layer.addChild(group, button.view, panel.view);
  st.world.addChild(layer);

  // Lampadine: inseguimento lento a riposo, veloce mentre la ruota corre.
  let chase = 0;
  let chaseSpeed = 4;
  const chaseTick = { t: 0 };
  const chaseTween = gsap.to(chaseTick, {
    t: 1,
    duration: 1,
    repeat: -1,
    ease: 'none',
    onRepeat: () => undefined,
    onUpdate: () => {
      chase += (chaseSpeed / 60) * (reduced ? 0 : 1);
      bulbs.forEach((b, i) => (b.alpha = (Math.floor(chase) + i) % 3 === 0 ? 1 : 0.35));
    },
  });

  // ── La slot si gira e dietro compare la ruota.
  const flip = (reduced ? 0.01 : 0.32) * pace();
  await new Promise<void>((res) => gsap.to(st.machine.scale, { x: 0, duration: flip, ease: 'power2.in', onComplete: res }));
  st.machine.visible = false;
  sfxConfirm();
  await new Promise<void>((res) =>
    gsap.to(group.scale, { x: WS, duration: flip * 1.3, ease: 'back.out(1.6)', onComplete: res })
  );
  gsap.to([button.view, panel.view], { alpha: 1, duration: 0.3 });
  if (st.disposed()) return;

  // ── I giri.
  let total = 0;
  for (let k = 0; k < o.spins.length; k++) {
    const s = o.spins[k]!;
    const seg = rule.segments[s.segment]!;
    const leftBefore = k === 0 ? rule.spins : o.spins[k - 1]!.left;
    st.hud.message(ss('wheelPress', { n: leftBefore }));
    button.setEnabled(true);
    st.resetQuick();
    await st.waitPress(ss('wheelSpin'));
    if (st.disposed()) return;
    button.setEnabled(false);
    highlight(s.segment, false);
    st.hud.message('');
    sfxSpinStart();

    // Angolo d'arrivo: il centro dello spicchio sotto la lancetta, con un
    // piccolo scarto casuale perche' la ruota non si fermi sempre a meta'.
    const jitter = (Math.random() - 0.5) * step * 0.6;
    const target = -((s.segment + 0.5) * step + jitter);
    const r0 = face.rotation;
    let delta = (((target - r0) % TAU) + TAU) % TAU;
    const turns = st.turbo() ? 3 : 6;
    delta += turns * TAU;
    const dur = st.quick() ? 0.4 : (st.turbo() ? 3.4 : 6.4) * (reduced ? 0.6 : 1);
    chaseSpeed = 22;
    let lastPeg = Math.floor(r0 / step);
    await new Promise<void>((res) => {
      const tw: gsap.core.Tween = gsap.to(face, {
        rotation: r0 + delta,
        duration: dur,
        // Frenata lunga: gli ultimi spicchi passano piano, uno alla volta.
        ease: 'expo.out',
        onUpdate: () => {
          // Ogni piolo che passa fa scattare la lancetta.
          const peg = Math.floor(face.rotation / step);
          if (peg !== lastPeg) {
            lastPeg = peg;
            sfxTick(0.25);
            if (!reduced) {
              gsap.killTweensOf(pointer);
              pointer.rotation = -0.32;
              gsap.to(pointer, { rotation: 0, duration: 0.14, ease: 'power2.out' });
            }
          }
          if (st.quick() && tw.progress() < 0.92) tw.progress(0.92);
          if (st.disposed()) tw.kill();
        },
        onComplete: res,
      });
    });
    if (st.disposed()) return;
    chaseSpeed = 4;
    highlight(s.segment, true);

    // ── Esito dello spicchio.
    const popText =
      seg.kind === 'spin' ? '+1' : seg.kind === 'stop' ? 'STOP' : seg.kind === 'blank' ? ss('wheelBlankLabel') : `×${seg.value}`;
    const popFill =
      seg.kind === 'stop'
        ? PALETTE.red.light
        : seg.kind === 'spin'
          ? PALETTE.win.light
          : seg.kind === 'blank'
            ? PALETTE.text.soft
            : PALETTE.gold.light;
    const pop = makeText(popText, 'title', 150, { fill: popFill });
    pop.position.set(cx, cy);
    st.fx.addChild(pop);
    pop.scale.set(0.3);
    gsap
      .timeline({ onComplete: () => pop.destroy() })
      .to(pop.scale, { x: 1, y: 1, duration: 0.45, ease: 'back.out(2.5)' })
      .to(pop, { alpha: 0, duration: 0.4 }, '+=0.55');

    if (seg.kind === 'mult') {
      total = s.total;
      panel.set(1, `×${total}`);
      panel.set(2, formatMoney(payoutCents(total * bet)));
      panel.bump(1);
      panel.bump(2);
      // "×2 · la vincita sale a 2,00 €"
      st.hud.message(ss('wheelGot', { m: seg.value, coins: formatMoney(payoutCents(total * bet)) }), 'win');
      if (seg.value >= 20) {
        sfxJackpot();
        st.shake(10, 0.5);
      } else if (seg.value === 1) sfxTick(0.5);
      else sfxWin(seg.value >= 10 ? 3 : seg.value >= 5 ? 2 : 1);
      if (seg.value > 1) st.presenter.sparks(cx, cy - FACE / 2, seg.value >= 10 ? 90 : 40, PALETTE.gold.light);
    } else if (seg.kind === 'blank') {
      st.hud.message(ss('wheelBlank'));
      sfxLose();
    } else if (seg.kind === 'spin') {
      st.hud.message(ss('wheelExtra'), 'win');
      sfxConfirm();
      st.presenter.sparks(cx, cy - FACE / 2, 50, PALETTE.win.light);
    } else {
      st.hud.message(ss('wheelStop'), 'warn');
      sfxLose();
      st.shake(6, 0.3);
    }
    panel.set(0, String(s.left));
    panel.bump(0);
    await wait(1.25 * pace(), () => st.quick());
    if (st.disposed()) return;
  }

  // ── Totale, poi la ruota si rigira e torna la slot.
  button.setEnabled(false);
  gsap.to(button.view, { alpha: 0, duration: 0.25 });
  st.hud.message(ss('wheelEnd', { m: o.total, coins: formatMoney(payoutCents(o.payout)) }), o.total > 0 ? 'win' : 'info');
  st.resetQuick();
  if (o.payout > 0) await st.presenter.present(payoutCents(o.payout), bet, { forceBig: true, title: ss('wheelTotalTitle').toUpperCase() });
  if (st.disposed()) return;
  highlight(0, false);
  chaseTween.kill();
  gsap.to(panel.view, { alpha: 0, duration: 0.25 });
  await new Promise<void>((res) => gsap.to(group.scale, { x: 0, duration: flip, ease: 'power2.in', onComplete: res }));
  st.machine.visible = true;
  await new Promise<void>((res) => gsap.to(st.machine.scale, { x: 1, duration: flip * 1.3, ease: 'back.out(1.6)', onComplete: res }));
  layer.destroy({ children: true });
  st.resetQuick();
}

/** Probabilita' di ogni spicchio al PRIMO giro, per il regolamento. */
export function wheelOdds(rule: WheelRule): { label: string; pct: number }[] {
  const w = (s: WheelSegment) => s.first ?? s.weight;
  const tot = rule.segments.reduce((s, x) => s + w(x), 0);
  const groups = new Map<string, number>();
  for (const s of rule.segments) {
    const key = s.kind === 'spin' ? `${ss('wheelExtraTop')} ${ss('wheelExtraSub')}` : s.kind === 'stop' ? 'STOP' : s.kind === 'blank' ? ss('wheelBlankLabel') : `×${s.value}`;
    groups.set(key, (groups.get(key) ?? 0) + w(s));
  }
  return [...groups.entries()].map(([label, w]) => ({ label, pct: (w / tot) * 100 }));
}
