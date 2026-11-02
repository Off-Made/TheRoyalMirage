/**
 * Collaudo del mix musicale, fuori dal gioco.
 *
 * Renderizza ogni atmosfera per due giri di frase in un OfflineAudioContext
 * con la stessa catena del motore (secco + riverbero + compressore) e ne
 * misura picco e RMS. Un mix non si giudica dalle casse del portatile: si
 * misura. Il risultato finisce in `window.RESULT` per `tools/shot.mjs`.
 */
import { SCORES } from '@/audio/music/score';
import { playEvent, buildImpulse, makeNoise } from '@/audio/music/engine';

const SR = 44100;
const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

async function render(name: keyof typeof SCORES) {
  const s = SCORES[name];
  const beat = 60 / s.bpm;
  const seconds = s.bars * 2 * s.beatsPerBar * beat + 3;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 2.4;
  comp.connect(ctx.destination);
  const dry = ctx.createGain(); dry.gain.value = 0.82; dry.connect(comp);
  const conv = ctx.createConvolver(); conv.buffer = buildImpulse(ctx, 2.9);
  const wet = ctx.createGain(); wet.gain.value = 0.34; conv.connect(wet).connect(comp);
  const layer = ctx.createGain(); layer.gain.value = s.level;
  layer.connect(dry); layer.connect(conv);

  const noise = makeNoise(ctx);
  let seed = 0x9e3779b9;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 4294967296);
  let events = 0;
  for (let b = 0; b < s.bars * 2; b++) {
    const t0 = 0.05 + b * s.beatsPerBar * beat;
    for (const ev of s.bar(b % s.bars, rnd)) {
      playEvent(ctx, layer, noise, ev, s, t0 + ev.beat * beat, ev.beats * beat);
      events++;
    }
  }
  const buf = await ctx.startRendering();
  let peak = 0, sum = 0, nan = 0, silent = 0;
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const win = SR / 10; let wsum = 0;
  for (let i = 0; i < L.length; i++) {
    const v = Math.max(Math.abs(L[i]!), Math.abs(R[i]!));
    if (Number.isNaN(v)) nan++;
    peak = Math.max(peak, v);
    sum += L[i]! * L[i]!;
    wsum += L[i]! * L[i]!;
    if (i % win === win - 1) { if (wsum / win < 1e-7) silent++; wsum = 0; }
  }
  return {
    name, events, seconds: +seconds.toFixed(1),
    peakDb: +db(peak).toFixed(1),
    rmsDb: +db(Math.sqrt(sum / L.length)).toFixed(1),
    silentPct: +((100 * silent) / (L.length / win)).toFixed(1),
    nan,
  };
}

const out: unknown[] = [];
for (const k of Object.keys(SCORES) as (keyof typeof SCORES)[]) out.push(await render(k));
(window as unknown as { RESULT: unknown }).RESULT = out;
document.getElementById('out')!.textContent = JSON.stringify(out, null, 2);
