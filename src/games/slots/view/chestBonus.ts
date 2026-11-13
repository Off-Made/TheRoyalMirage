/**
 * THE ROYAL MIRAGE — Regia dei Forzieri (Diamond Royale)
 *
 *   cartello → la slot sale e si rimpicciolisce, sotto compaiono 5 forzieri
 *   → il giocatore ne tocca uno (gli altri si spengono) → APRI → il
 *   coperchio salta, esce la luce e il moltiplicatore → si aprono anche gli
 *   altri, spenti, per mostrare cosa contenevano → totale → la slot torna
 *
 * Il contenuto del forziere scelto e' deciso al click su Gira (`prize`):
 * tutti i forzieri sono equivalenti, quindi assegnarlo a quello toccato non
 * cambia nessuna probabilita'. Gli altri ricevono `others`, nell'ordine.
 */

import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { gsap } from 'gsap';
import { DESIGN_WIDTH } from '@/core/App';
import { HUD_BOTTOM, HUD_TOP } from '@/games/common/GameHud';
import { bake } from '@/art/textureCache';
import { PALETTE, rgba } from '@/art/palette';
import { drawChest } from '@/art/bonusArt';
import { makeText } from '@/games/common/text';
import { formatMoney } from '@/state/wallet';
import { sfxWin, sfxJackpot, sfxConfirm, sfxTick, sfxCoin } from '@/audio/synth';
import { payoutCents } from '../engine/spin';
import type { ChestOutcome } from '../engine/types';
import { windowSize, FRAME_CREST } from './frame';
import { bonusButton, wait, type BonusStage } from './bonusStage';
import { ss } from './strings';

const GEMS = [PALETTE.red, PALETTE.accent.sapphire, PALETTE.accent.emerald, PALETTE.accent.violet, PALETTE.accent.amber];
const CW = 250;
const CH = 230;

function chestTex(i: number, open: boolean): Texture {
  return bake(`bonus/chest-${i}-${open ? 'open' : 'closed'}`, CW, CH, (ctx, w, h) => drawChest(ctx, w, h, open, GEMS[i % GEMS.length]!), { res: 2 });
}

function glowTex(): Texture {
  return bake('bonus/chest-glow', 256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, rgba(PALETTE.gold.hot, 0.9));
    g.addColorStop(0.35, rgba(PALETTE.gold.core, 0.45));
    g.addColorStop(1, rgba(PALETTE.gold.core, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Raggi di luce che escono dal forziere aperto. */
function rays(): Graphics {
  const g = new Graphics();
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = a + (Math.PI / n) * 0.55;
    g.moveTo(0, 0)
      .lineTo(Math.cos(a) * 230, Math.sin(a) * 230)
      .lineTo(Math.cos(b) * 230, Math.sin(b) * 230)
      .closePath()
      .fill({ color: PALETTE.gold.light, alpha: 0.22 });
  }
  g.blendMode = 'add';
  return g;
}

export async function playChests(st: BonusStage, o: ChestOutcome, bet: number): Promise<void> {
  const reduced = st.reducedMotion();
  const T = (sec: number) => (st.quick() ? 0 : sec * (st.turbo() ? 0.5 : 1));
  st.resetQuick();
  st.hud.message('');
  await st.titleCard(ss('chestsTitle'), ss('chestsSub', { n: o.count }), PALETTE.gold.light, 1.4);
  if (st.disposed()) return;
  st.resetQuick();

  // ── La slot sale e si rimpicciolisce.
  const { h } = windowSize(st.geo);
  const fullH = h + st.geo.pad * 2 + FRAME_CREST;
  const scaleTo = 0.5;
  const home = { x: st.machine.x, y: st.machine.y };
  const upY = HUD_TOP - 16 + (fullH * scaleTo) / 2 + FRAME_CREST * scaleTo * 0.5;
  await new Promise<void>((res) =>
    gsap.to(st.machine, { y: upY, duration: T(0.55) || 0.01, ease: 'power3.inOut', onComplete: () => res() })
  );
  gsap.to(st.machine.scale, { x: scaleTo, y: scaleTo, duration: T(0.55) || 0.01, ease: 'power3.inOut' });
  await wait(T(0.3), () => st.quick());

  // ── I forzieri. Il resto della scena (colonna dei jackpot, pannelli)
  // si spegne: la fila dei forzieri occupa tutta la larghezza.
  const layer = new Container();
  const hidden = st.world.children.filter((c) => c !== st.machine && c.visible && c.alpha > 0);
  for (const c of hidden) gsap.to(c, { alpha: 0, duration: 0.3 });
  st.world.addChild(layer);
  const gapX = 34;
  const rowW = 5 * CW + 4 * gapX;
  const x0 = (DESIGN_WIDTH - rowW) / 2 + CW / 2;
  // Sopra il pulsante APRI, che a sua volta sta sopra il messaggio dell'HUD.
  const rowY = HUD_BOTTOM - 250 - CH / 2;
  const chests = Array.from({ length: 5 }, (_, i) => {
    const c = new Container();
    c.position.set(x0 + i * (CW + gapX), rowY);
    const glow = new Sprite(glowTex());
    glow.anchor.set(0.5);
    glow.scale.set(1.5);
    glow.alpha = 0;
    glow.blendMode = 'add';
    const sp = new Sprite(chestTex(i, false));
    sp.anchor.set(0.5);
    c.addChild(glow, sp);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    layer.addChild(c);
    // Entrata: dal basso, uno dopo l'altro.
    c.alpha = 0;
    c.y = rowY + 80;
    gsap.to(c, { alpha: 1, y: rowY, duration: T(0.45) || 0.01, delay: T(i * 0.08), ease: 'back.out(1.6)' });
    return { c, glow, sp };
  });
  const button = bonusButton(ss('chestsOpen'), () => st.press(), 340, 108);
  button.view.position.set(DESIGN_WIDTH / 2, rowY + CH / 2 + 82);
  button.setEnabled(false);
  layer.addChild(button.view);
  await wait(T(0.6), () => st.quick());

  // ── Scelta.
  let picked = -1;
  const select = (i: number) => {
    if (picked === i) return;
    picked = i;
    sfxTick(0.6);
    chests.forEach((ch, k) => {
      const on = k === i;
      gsap.killTweensOf(ch.c);
      gsap.killTweensOf(ch.c.scale);
      gsap.to(ch.c.scale, { x: on ? 1.1 : 0.94, y: on ? 1.1 : 0.94, duration: 0.25, ease: 'back.out(2)' });
      gsap.to(ch.c, { alpha: on ? 1 : 0.55, duration: 0.2 });
      ch.sp.tint = on ? PALETTE.white : PALETTE.text.mute;
      gsap.to(ch.glow, { alpha: on ? 0.75 : 0, duration: 0.25 });
      ch.c.y = rowY;
      if (on && !reduced) gsap.to(ch.c, { y: rowY - 10, duration: 0.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    });
    button.setEnabled(true);
    st.setPressEnabled(true);
    st.hud.message(ss('chestsPress', { n: i + 1 }));
  };
  chests.forEach((ch, i) => ch.c.on('pointertap', () => select(i)));
  st.hud.message(ss('chestsPick'));
  // In automatico il forziere si sceglie da solo.
  if (st.auto()) setTimeout(() => picked < 0 && !st.disposed() && select(Math.floor(Math.random() * 5)), 700);
  await st.waitPress(ss('chestsOpen'), () => picked >= 0);
  if (st.disposed()) return;
  button.setEnabled(false);
  gsap.to(button.view, { alpha: 0, duration: 0.25 });
  chests.forEach((ch) => {
    ch.c.eventMode = 'none';
    ch.c.cursor = 'default';
  });

  // ── Apertura del forziere scelto.
  const mine = chests[picked]!;
  gsap.killTweensOf(mine.c);
  mine.c.y = rowY;
  const burst = rays();
  burst.position.set(mine.c.x, mine.c.y - 40);
  burst.alpha = 0;
  layer.addChildAt(burst, 0);
  sfxConfirm();
  await new Promise<void>((res) =>
    gsap
      .timeline({ onComplete: () => res() })
      .to(mine.c.scale, { x: 1.18, y: 0.9, duration: T(0.12) || 0.01, ease: 'power2.in' })
      .add(() => {
        mine.sp.texture = chestTex(picked, true);
      })
      .to(mine.c.scale, { x: 1.06, y: 1.2, duration: T(0.14) || 0.01, ease: 'power2.out' })
      .to(mine.c.scale, { x: 1.1, y: 1.1, duration: T(0.3) || 0.01, ease: 'back.out(3)' })
  );
  gsap.to(burst, { alpha: 1, duration: 0.3 });
  if (!reduced) gsap.to(burst, { rotation: Math.PI * 2, duration: 14, repeat: -1, ease: 'none' });
  st.presenter.sparks(mine.c.x, mine.c.y - 60, o.prize >= 15 ? 110 : 60, PALETTE.gold.light);
  const big = o.prize >= 25;
  if (big) {
    sfxJackpot();
    st.shake(10, 0.6);
  } else sfxWin(o.prize >= 10 ? 3 : o.prize >= 3 ? 2 : 1);
  sfxCoin();
  // Il moltiplicatore ESCE dal forziere: nasce piccolo dentro la bocca
  // aperta, sale e si ingrandisce fino a coprire il forziere.
  const val = makeText(`×${o.prize}`, 'title', 150, { fill: big ? PALETTE.gold.hot : PALETTE.gold.light });
  val.position.set(mine.c.x, mine.c.y - CH * 0.02);
  val.scale.set(0.15);
  val.alpha = 0;
  const eur = makeText(formatMoney(payoutCents(o.payout)), 'numeric', 40);
  eur.position.set(mine.c.x, mine.c.y + CH / 2 + 8);
  eur.alpha = 0;
  layer.addChild(val, eur);
  const rise = T(0.65) || 0.01;
  gsap.to(val, { alpha: 1, duration: rise * 0.3 });
  gsap.to(val, { y: mine.c.y - CH * 0.22, duration: rise, ease: 'power3.out' });
  gsap.to(val.scale, { x: 1, y: 1, duration: rise, ease: 'back.out(2.2)' });
  if (!reduced) gsap.to(val.scale, { x: 1.06, y: 1.06, duration: 0.7, delay: rise, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  gsap.to(eur, { alpha: 1, duration: 0.3, delay: T(0.35) });
  st.hud.message(ss('chestsGot', { m: o.prize, coins: formatMoney(payoutCents(o.payout)) }), 'win');
  await wait(T(1.0), () => st.quick());
  if (st.disposed()) return;

  // ── Gli altri si aprono spenti: ecco cosa contenevano.
  let k = 0;
  for (let i = 0; i < chests.length; i++) {
    if (i === picked) continue;
    const ch = chests[i]!;
    const v = o.others[k++] ?? 0;
    ch.sp.texture = chestTex(i, true);
    ch.sp.tint = PALETTE.text.mute;
    ch.c.alpha = 0.5;
    // Anche dagli altri esce il moltiplicatore, ma spento e piu' piccolo.
    const t = makeText(`×${v}`, 'title', 84, { fill: PALETTE.text.soft });
    t.position.set(ch.c.x, ch.c.y - CH * 0.02);
    t.scale.set(0.2);
    t.alpha = 0;
    layer.addChild(t);
    gsap.to(t, { alpha: 0.75, duration: 0.25 });
    gsap.to(t, { y: ch.c.y - CH * 0.18, duration: T(0.4) || 0.01, ease: 'power3.out' });
    gsap.to(t.scale, { x: 1, y: 1, duration: T(0.4) || 0.01, ease: 'back.out(2)' });
    sfxTick(0.3);
    await wait(T(0.18), () => st.quick());
  }
  await wait(T(0.6), () => st.quick());
  if (st.disposed()) return;

  // ── Totale, poi la slot torna al suo posto.
  st.resetQuick();
  await st.presenter.present(payoutCents(o.payout), bet, { forceBig: true, title: ss('chestsTotalTitle').toUpperCase() });
  if (st.disposed()) return;
  gsap.killTweensOf(burst);
  gsap.killTweensOf(val.scale);
  await new Promise<void>((res) => gsap.to(layer, { alpha: 0, duration: T(0.35) || 0.01, onComplete: () => res() }));
  layer.destroy({ children: true });
  for (const c of hidden) gsap.to(c, { alpha: 1, duration: 0.3 });
  gsap.to(st.machine.scale, { x: 1, y: 1, duration: T(0.5) || 0.01, ease: 'power3.inOut' });
  await new Promise<void>((res) =>
    gsap.to(st.machine, { x: home.x, y: home.y, duration: T(0.5) || 0.01, ease: 'power3.inOut', onComplete: () => res() })
  );
  st.resetQuick();
}
