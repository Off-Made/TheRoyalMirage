/**
 * THE ROYAL MIRAGE — Regia della Cascata (Hollywood Nights)
 *
 *   cartello → la griglia diventa di "tessere" libere → per ogni passo:
 *     giro nuovo: le tessere cadono fuori e ne piovono di nuove dall'alto
 *     caduta:     le tessere rimaste scivolano giu', le nuove entrano in cima
 *   → le combinazioni vincenti si illuminano ed ESPLODONO, il moltiplicatore
 *   sale → ... → totale → si torna ai rulli
 *
 * I rulli veri restano fermi (nascosti) per tutto il bonus: la cascata usa
 * tessere proprie, mascherate dentro la finestra, cosi' quello che entra
 * dall'alto non si vede sopra la cornice.
 */

import { Container, Graphics, Sprite } from 'pixi.js';
import { gsap } from 'gsap';
import { DESIGN_WIDTH } from '@/core/App';
import { HUD_TOP } from '@/games/common/GameHud';
import { PALETTE } from '@/art/palette';
import { makeText } from '@/games/common/text';
import { formatMoney } from '@/state/wallet';
import { sfxReelStop, sfxWin, sfxCoin, sfxTick, sfxConfirm } from '@/audio/synth';
import { payoutCents } from '../engine/spin';
import type { CascadeOutcome, CascadeRule, Grid, WinLine } from '../engine/types';
import { windowSize } from './frame';
import { sidePanel, wait, type BonusStage } from './bonusStage';
import { ss } from './strings';

export async function playCascade(st: BonusStage, rule: CascadeRule, o: CascadeOutcome, bet: number, baseGrid: Grid): Promise<void> {
  const reduced = st.reducedMotion();
  const T = (sec: number) => (st.quick() ? 0 : sec * (st.turbo() ? 0.5 : 1));
  const { cellW, cellH, gap } = st.geo;
  const { w, h } = windowSize(st.geo);
  const rows = st.m.rows;
  const cx = (r: number) => st.ox + r * (cellW + gap) + cellW / 2;
  const cy = (row: number) => st.oy + row * cellH + cellH / 2;

  st.resetQuick();
  st.hud.message('');
  await st.titleCard(ss('cascadeTitle'), ss('cascadeSub', { n: o.spins }), PALETTE.neon.pink, 1.4);
  if (st.disposed()) return;
  st.resetQuick();

  // ── Pannello laterale.
  const panel = sidePanel([ss('cascadeSpins'), ss('cascadeMult'), ss('cascadeWin')]);
  const px = st.ox + w + st.geo.pad + 40;
  if (px + 300 > DESIGN_WIDTH - 20) {
    panel.view.position.set(DESIGN_WIDTH - 300 * 0.8 - 24, HUD_TOP + 10);
    panel.view.scale.set(0.8);
  } else panel.view.position.set(px, st.oy + 20);
  panel.set(0, String(o.spins));
  panel.set(1, `×${o.steps[0]?.multiplier ?? rule.ladder[0]}`);
  panel.set(2, formatMoney(0));
  panel.view.alpha = 0;
  st.world.addChild(panel.view);
  gsap.to(panel.view, { alpha: 1, duration: 0.4 });

  // ── Tessere: stesso aspetto dei rulli, dentro la finestra della macchina.
  const layer = new Container();
  const mask = new Graphics().rect(st.ox, st.oy, w, h).fill(PALETTE.white);
  layer.mask = mask;
  const frames = new Graphics();
  frames.blendMode = 'add';
  layer.addChild(mask);
  const tiles = new Container();
  layer.addChild(tiles, frames);
  st.machine.addChildAt(layer, st.machine.getChildIndex(st.reelLayer) + 1);
  st.reelLayer.visible = false;

  const makeTile = (id: string, r: number, row: number): Sprite => {
    const s = new Sprite(st.texture(id));
    s.anchor.set(0.5);
    s.scale.set(st.symbolScale);
    s.position.set(cx(r), cy(row));
    tiles.addChild(s);
    return s;
  };
  let cells: Sprite[][] = baseGrid.map((col, r) => col.map((id, row) => makeTile(id, r, row)));

  /** Anima una serie di tween e attende la fine (o l'arresto rapido). */
  const run = async (jobs: gsap.core.Tween[]): Promise<void> => {
    if (jobs.length === 0) return;
    // L'arresto rapido porta tutte le animazioni in fondo subito.
    const check = () => {
      if (st.disposed()) return;
      if (st.quick()) {
        for (const j of jobs) j.progress(1);
        return;
      }
      if (jobs.some((j) => j.progress() < 1)) requestAnimationFrame(check);
    };
    check();
    await Promise.all(jobs.map((j) => j.then()));
  };

  let total = 0;
  for (let i = 0; i < o.steps.length; i++) {
    const step = o.steps[i]!;
    const prev = i > 0 ? o.steps[i - 1]! : null;
    if (st.disposed()) return;

    if (step.kind === 'fresh') {
      // Tutte fuori dal basso, poi una pioggia di tessere nuove.
      const out = cells.flat().map((s, k) =>
        gsap.to(s, { y: s.y + h + cellH, duration: T(0.32), delay: T((k % st.m.reels) * 0.03), ease: 'power2.in' })
      );
      await run(out);
      for (const s of cells.flat()) s.destroy();
      cells = step.grid.map((col, r) =>
        col.map((id, row) => {
          const s = makeTile(id, r, row);
          s.y = cy(row) - h - cellH;
          return s;
        })
      );
      const fall: gsap.core.Tween[] = [];
      cells.forEach((col, r) =>
        col.forEach((s, row) =>
          fall.push(
            gsap.to(s, {
              y: cy(row),
              duration: T(0.42),
              delay: T(r * 0.07 + (rows - row) * 0.03),
              ease: reduced ? 'power2.out' : 'bounce.out',
              onComplete: () => row === rows - 1 && sfxReelStop(r),
            })
          )
        )
      );
      await run(fall);
    } else if (prev) {
      // Caduta: le rimaste scivolano giu', le nuove entrano dall'alto.
      const gone = new Set(prev.explode.map(([r, row]) => `${r},${row}`));
      const fall: gsap.core.Tween[] = [];
      cells = cells.map((col, r) => {
        const keep = col.filter((_, row) => !gone.has(`${r},${row}`));
        col.forEach((s, row) => gone.has(`${r},${row}`) && s.destroy());
        const k = rows - keep.length;
        const fresh = Array.from({ length: k }, (_, j) => {
          const s = makeTile(step.grid[r]![j]!, r, j);
          s.y = cy(j - k) - cellH * 0.3;
          return s;
        });
        const next = [...fresh, ...keep];
        next.forEach((s, row) => {
          const ty = cy(row);
          if (Math.abs(s.y - ty) > 0.5) {
            fall.push(
              gsap.to(s, {
                y: ty,
                duration: T(0.36),
                delay: T(r * 0.04),
                ease: reduced ? 'power2.out' : 'bounce.out',
              })
            );
          }
        });
        return next;
      });
      sfxTick(0.4);
      await run(fall);
      // Le tessere ora mostrano esattamente la griglia del passo.
      cells.forEach((col, r) => col.forEach((s, row) => (s.texture = st.texture(step.grid[r]![row]!))));
    }
    if (st.disposed()) return;

    panel.set(0, String(step.left - step.added));
    panel.set(1, `×${step.multiplier}`);
    if (step.multiplier > (prev?.multiplier ?? 1)) panel.bump(1);

    if (step.explode.length === 0) {
      const next = o.steps[i + 1];
      st.hud.message(
        next && next.multiplier < step.multiplier
          ? ss('cascadeDown', { m: next.multiplier, n: step.left })
          : ss('cascadeLeft', { n: step.left })
      );
      await wait(T(0.35), () => st.quick());
      continue;
    }

    const box = (r: number, row: number, color: number) =>
      frames
        .roundRect(st.ox + r * (cellW + gap) + 4, st.oy + row * cellH + 4, cellW - 8, cellH - 8, 16)
        .stroke({ color, width: 5, alpha: 0.95 })
        .roundRect(st.ox + r * (cellW + gap) + 4, st.oy + row * cellH + 4, cellW - 8, cellH - 8, 16)
        .fill({ color, alpha: 0.12 });
    const pulse = (list: readonly (readonly [number, number])[]) => {
      for (const [r, row] of list) {
        const s = cells[r]![row]!;
        gsap.fromTo(s.scale, { x: st.symbolScale, y: st.symbolScale }, { x: st.symbolScale * 1.12, y: st.symbolScale * 1.12, duration: T(0.2), yoyo: true, repeat: 1 });
      }
    };

    // ── Vincita: cornici sulle celle vincenti.
    if (step.wins.length > 0) {
      total += step.payout;
      panel.set(2, formatMoney(payoutCents(total)));
      panel.bump(2);
      frames.clear();
      const ticket = new Set(step.bonusCells.map(([r, row]) => `${r},${row}`));
      for (const [r, row] of step.explode) if (!ticket.has(`${r},${row}`)) box(r, row, PALETTE.neon.pink);
      frames.alpha = 1;
      st.hud.message(winSummary(st, step.wins, step.payout, step.multiplier), 'win');
      sfxWin(step.multiplier >= 3 ? 3 : step.multiplier >= 2 ? 2 : 1);
      if (step.multiplier > 1 && !st.quick()) chainBanner(st, ss('cascadeChain', { m: step.multiplier }), T(0.9));
      pulse(step.explode.filter(([r, row]) => !ticket.has(`${r},${row}`)));
      await wait(T(0.75), () => st.quick());
      if (st.disposed()) return;
    }

    // ── Biglietto: aggiunge giri, poi esplode con il resto.
    if (step.bonusCells.length > 0) {
      frames.clear();
      for (const [r, row] of step.bonusCells) box(r, row, PALETTE.gold.core);
      frames.alpha = 1;
      pulse(step.bonusCells);
      if (step.added > 0) {
        panel.set(0, String(step.left));
        panel.bump(0);
        st.hud.message(ss('cascadeExtraMsg', { n: step.added }), 'win');
        sfxConfirm();
        if (!st.quick()) chainBanner(st, ss('cascadeExtra', { n: step.added }), T(1.1), PALETTE.gold.light);
      }
      await wait(T(step.added > 0 ? 1.0 : 0.5), () => st.quick());
      if (st.disposed()) return;
    }
    frames.clear();
    const boom = step.explode.map(([r, row]) => {
      const s = cells[r]![row]!;
      if (!reduced && !st.quick()) st.presenter.sparks(s.x, s.y, 14, PALETTE.neon.halo);
      return gsap.to(s, { alpha: 0, duration: T(0.28), ease: 'power2.in' });
    });
    for (const [r, row] of step.explode) {
      const s = cells[r]![row]!;
      gsap.to(s.scale, { x: st.symbolScale * 1.5, y: st.symbolScale * 1.5, duration: T(0.28) });
    }
    sfxCoin();
    st.shake(4, 0.2);
    await run(boom);
    for (const [r, row] of step.explode) cells[r]![row]!.visible = false;
    await wait(T(0.12), () => st.quick());
  }

  // ── Totale e ritorno ai rulli. Il pannello mostra il totale finale (che
  // comprende in silenzio l'eventuale integrazione fino alla puntata).
  panel.set(2, formatMoney(payoutCents(o.payout)));
  st.hud.message(ss('cascadeEnd', { coins: formatMoney(payoutCents(o.payout)) }), o.payout > 0 ? 'win' : 'info');
  st.resetQuick();
  if (o.payout > 0) await st.presenter.present(payoutCents(o.payout), bet, { forceBig: true, title: ss('cascadeTotalTitle').toUpperCase() });
  if (st.disposed()) return;
  sfxConfirm();
  await new Promise<void>((res) => gsap.to([layer, panel.view], { alpha: 0, duration: T(0.35) || 0.01, onComplete: () => res() }));
  st.reelLayer.visible = true;
  layer.destroy({ children: true });
  panel.view.destroy({ children: true });
  st.resetQuick();
}

/** Riassunto delle vincite di un passo, per l'HUD. */
function winSummary(st: BonusStage, wins: readonly WinLine[], payout: number, mult: number): string {
  const coins = formatMoney(payoutCents(payout));
  if (wins.length > 1) return `${ss('multiWin', { n: wins.length, coins })}${mult > 1 ? ` · ×${mult}` : ''}`;
  const w = wins[0]!;
  const label = st.m.symbols.find((s) => s.id === w.symbol)?.label ?? w.symbol;
  const per = new Map<number, number>();
  for (const [r] of w.cells) per.set(r, (per.get(r) ?? 0) + 1);
  let ways = 1;
  for (const n of per.values()) ways *= n;
  const base = ways > 1 ? ss('waysWinMany', { n: w.count, sym: label, ways, coins }) : ss('waysWin', { n: w.count, sym: label, coins });
  return mult > 1 ? `${base} · ×${mult}` : base;
}

function chainBanner(st: BonusStage, label: string, sec: number, fill: number = PALETTE.neon.halo): void {
  if (sec <= 0) return;
  const { w, h } = windowSize(st.geo);
  const t = makeText(label, 'title', 96, { fill });
  t.position.set(st.ox + w / 2, st.oy + h / 2);
  t.alpha = 0;
  t.scale.set(0.5);
  st.fx.addChild(t);
  gsap
    .timeline({ onComplete: () => t.destroy() })
    .to(t, { alpha: 1, duration: sec * 0.2 }, 0)
    .to(t.scale, { x: 1, y: 1, duration: sec * 0.4, ease: 'back.out(2.2)' }, 0)
    .to(t, { alpha: 0, duration: sec * 0.3 }, sec * 0.7);
}
