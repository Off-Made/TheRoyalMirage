/**
 * THE ROYAL MIRAGE — Sintesi audio procedurale
 *
 * Stessa filosofia della grafica: nessun file audio esterno. Tutti gli effetti
 * sono generati con WebAudio al momento del bisogno.
 *
 * ── Perche' non file .mp3 ──
 * 1. Zero download, zero licenze, zero latenza di caricamento
 * 2. Ogni suono e' PARAMETRICO: lo stesso `pluck()` fa il click del rullo e
 *    la nota della scala vincente, cambiando frequenza. Con i file servirebbero
 *    dodici campioni distinti.
 * 3. La variazione casuale (±2% di pitch) elimina l'effetto "mitragliatrice"
 *    che si sente quando lo stesso campione parte 20 volte di fila.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let sfxBus: GainNode | null = null;

/**
 * Il contesto audio va creato DOPO un gesto dell'utente: i browser bloccano
 * l'audio non richiesto. Chiamiamo questa funzione al primo click/tasto.
 */
export function initAudio(): boolean {
  if (ctx) return true;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.75;
    master.connect(ctx.destination);

    musicBus = ctx.createGain();
    musicBus.gain.value = 0.45;
    musicBus.connect(master);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.8;
    sfxBus.connect(master);
    return true;
  } catch (err) {
    console.warn('[audio] WebAudio non disponibile', err);
    return false;
  }
}

export function audioReady(): boolean {
  return ctx !== null && ctx.state === 'running';
}

/** Il contesto puo' finire "suspended" dopo che la scheda perde il fuoco. */
export async function resumeAudio(): Promise<void> {
  if (ctx && ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      /* ignora */
    }
  }
}

/**
 * Il contesto e il bus musicale, per il motore musicale di `audio/music/`.
 *
 * Gli effetti sonori sono "spara e dimentica" e `tone()`/`noise()` bastano;
 * la musica invece ha bisogno di costruire la PROPRIA catena persistente
 * (riverbero, eco, compressore, un gain per atmosfera) e di programmare note
 * su `ctx.currentTime` con precisione al campione. Nessun altro modulo deve
 * usare questi due accessori: chi vuole un suono chiama `tone()`.
 */
export function audioCtx(): AudioContext | null {
  return ctx;
}

export function musicBusNode(): GainNode | null {
  return musicBus;
}

export function setBusVolume(bus: 'master' | 'music' | 'sfx', v: number): void {
  const node = bus === 'master' ? master : bus === 'music' ? musicBus : sfxBus;
  if (node && ctx) {
    // Rampa breve invece di assegnazione diretta: un salto istantaneo di
    // guadagno produce un "click" udibile nello stream audio.
    node.gain.cancelScheduledValues(ctx.currentTime);
    node.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), ctx.currentTime, 0.02);
  }
}

// ──────────────────────────────────────────── PRIMITIVE

/** Rumore bianco riutilizzabile, generato una volta e tenuto in memoria. */
let noiseBuffer: AudioBuffer | null = null;
function getNoise(): AudioBuffer | null {
  if (!ctx) return null;
  if (noiseBuffer) return noiseBuffer;
  const len = Math.floor(ctx.sampleRate * 1.2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

interface ToneOpts {
  freq: number;
  /** Durata totale in secondi. */
  dur?: number;
  type?: OscillatorType;
  gain?: number;
  /** Frequenza finale per il glide (sweep). */
  toFreq?: number;
  /** Attacco in secondi. 0.001 = percussivo, 0.1 = morbido. */
  attack?: number;
  /** Curva di decadimento: 'exp' percussiva, 'lin' sostenuta. */
  decay?: 'exp' | 'lin';
  /** Ritardo di partenza in secondi. */
  delay?: number;
  bus?: 'music' | 'sfx';
  /** Variazione casuale di pitch in frazione (0.02 = ±2%). */
  detune?: number;
}

/** Oscillatore singolo con inviluppo. Il mattone di quasi tutti gli effetti. */
export function tone(o: ToneOpts): void {
  if (!ctx) return;
  const bus = o.bus === 'music' ? musicBus : sfxBus;
  if (!bus) return;

  const t0 = ctx.currentTime + (o.delay ?? 0);
  const dur = o.dur ?? 0.18;
  const peak = o.gain ?? 0.3;
  const attack = o.attack ?? 0.004;
  const jitter = o.detune ? 1 + (Math.random() * 2 - 1) * o.detune : 1;

  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq * jitter, t0);
  if (o.toFreq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.toFreq * jitter), t0 + dur);
  }

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  if ((o.decay ?? 'exp') === 'exp') {
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  } else {
    g.gain.setValueAtTime(peak, t0 + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  }

  osc.connect(g).connect(bus);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Rumore filtrato: la base di impatti, fruscii e "whoosh". */
export function noise(opts: {
  dur?: number;
  gain?: number;
  /** Centro del filtro passa-banda. */
  freq?: number;
  q?: number;
  /** Frequenza finale, per lo sweep (whoosh). */
  toFreq?: number;
  delay?: number;
  type?: BiquadFilterType;
}): void {
  if (!ctx || !sfxBus) return;
  const buf = getNoise();
  if (!buf) return;

  const t0 = ctx.currentTime + (opts.delay ?? 0);
  const dur = opts.dur ?? 0.12;

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  // Punto di lettura casuale: senza questo, due impatti ravvicinati leggono
  // lo stesso tratto di rumore e suonano identici.
  const offset = Math.random() * (buf.duration - dur - 0.01);

  const filt = ctx.createBiquadFilter();
  filt.type = opts.type ?? 'bandpass';
  filt.frequency.setValueAtTime(opts.freq ?? 1200, t0);
  if (opts.toFreq) filt.frequency.exponentialRampToValueAtTime(Math.max(20, opts.toFreq), t0 + dur);
  filt.Q.value = opts.q ?? 1.2;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.22, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  src.connect(filt).connect(g).connect(sfxBus);
  src.start(t0, Math.max(0, offset), dur + 0.05);
  src.stop(t0 + dur + 0.05);
}

// ──────────────────────────────────────────── EFFETTI DEL GIOCO

/** Click secco dell'interfaccia. */
export function sfxClick(): void {
  tone({ freq: 1800, dur: 0.045, type: 'triangle', gain: 0.1, detune: 0.03 });
  noise({ dur: 0.03, freq: 3200, gain: 0.06, q: 2 });
}

/** Passaggio del cursore sui pulsanti: tenue, non deve stancare. */
export function sfxHover(): void {
  tone({ freq: 2400, dur: 0.035, type: 'sine', gain: 0.045, detune: 0.05 });
}

/** Conferma / entrata in un gioco: due note ascendenti. */
export function sfxConfirm(): void {
  tone({ freq: 660, dur: 0.1, type: 'triangle', gain: 0.16 });
  tone({ freq: 990, dur: 0.22, type: 'triangle', gain: 0.14, delay: 0.07 });
}

/** Annulla / indietro: due note discendenti. */
export function sfxBack(): void {
  tone({ freq: 620, dur: 0.08, type: 'triangle', gain: 0.12 });
  tone({ freq: 420, dur: 0.16, type: 'triangle', gain: 0.1, delay: 0.055 });
}

/** Avvio dei rulli: whoosh con sweep discendente. */
export function sfxSpinStart(): void {
  noise({ dur: 0.42, freq: 2600, toFreq: 420, gain: 0.17, q: 0.7 });
  tone({ freq: 220, toFreq: 90, dur: 0.38, type: 'sawtooth', gain: 0.08 });
}

/**
 * Arresto di un rullo. `index` alza leggermente il pitch a ogni rullo
 * successivo: la scala ascendente e' cio' che crea la sensazione di
 * "sta arrivando qualcosa" senza bisogno di musica.
 */
export function sfxReelStop(index = 0): void {
  const base = 150 * Math.pow(1.09, index);
  tone({ freq: base, toFreq: base * 0.6, dur: 0.11, type: 'square', gain: 0.17, detune: 0.02 });
  noise({ dur: 0.07, freq: 900 + index * 180, gain: 0.14, q: 1.6 });
}

/** Moneta che cade. Pitch casuale: cento monete non devono suonare uguali. */
export function sfxCoin(delay = 0): void {
  const f = 1500 + Math.random() * 900;
  tone({ freq: f, dur: 0.075, type: 'sine', gain: 0.09, delay, detune: 0.04 });
  tone({ freq: f * 1.5, dur: 0.05, type: 'sine', gain: 0.055, delay: delay + 0.012 });
}

/**
 * Conteggio della vincita: una nota per step, pitch crescente.
 * `progress` 0..1 lungo il conteggio.
 */
export function sfxTick(progress: number): void {
  tone({
    freq: 700 + progress * 1500,
    dur: 0.04,
    type: 'triangle',
    gain: 0.07,
    detune: 0.02,
  });
}

/** Fanfara di vincita. `tier` 0..4 scala durata e ricchezza armonica. */
export function sfxWin(tier = 0): void {
  // Arpeggio su scala maggiore; ai livelli alti aggiungiamo la settima e
  // l'ottava, che e' quello che rende una fanfara "grande" invece che lunga.
  const root = 523.25; // Do5
  const steps = [0, 4, 7, 12, 16, 19, 24];
  const count = Math.min(steps.length, 3 + tier);
  for (let i = 0; i < count; i++) {
    const semi = steps[i]!;
    tone({
      freq: root * Math.pow(2, semi / 12),
      dur: 0.3 + tier * 0.08,
      type: 'triangle',
      gain: 0.15,
      delay: i * (0.075 - tier * 0.006),
      decay: 'lin',
    });
  }
  if (tier >= 2) {
    noise({ dur: 0.5, freq: 5200, toFreq: 1200, gain: 0.1, q: 0.6, delay: 0.05 });
  }
}

/** Jackpot: campane sovrapposte + riverbero finto per sostegno. */
export function sfxJackpot(): void {
  const root = 523.25;
  for (const [i, semi] of [0, 7, 12, 16, 19, 24, 28].entries()) {
    tone({
      freq: root * Math.pow(2, semi / 12),
      dur: 1.6,
      type: 'sine',
      gain: 0.13,
      delay: i * 0.05,
      decay: 'lin',
    });
    // Seconda voce leggermente stonata e ritardata: e' il trucco che fa
    // percepire una campana invece di un seno puro.
    tone({
      freq: root * Math.pow(2, semi / 12) * 1.004,
      dur: 1.8,
      type: 'sine',
      gain: 0.08,
      delay: i * 0.05 + 0.03,
      decay: 'lin',
    });
  }
  noise({ dur: 1.4, freq: 6000, toFreq: 800, gain: 0.08, q: 0.5 });
}

/** Perdita: una sola nota discendente, breve. Non va punito l'utente col suono. */
export function sfxLose(): void {
  tone({ freq: 300, toFreq: 190, dur: 0.22, type: 'sine', gain: 0.1, decay: 'lin' });
}

/** Carta distribuita. */
export function sfxCardDeal(delay = 0): void {
  noise({ dur: 0.1, freq: 2600, toFreq: 1100, gain: 0.13, q: 0.9, delay });
}

/** Fiche appoggiate sul tavolo. */
export function sfxChip(delay = 0): void {
  tone({ freq: 900 + Math.random() * 300, dur: 0.055, type: 'square', gain: 0.07, delay, detune: 0.05 });
  noise({ dur: 0.045, freq: 4200, gain: 0.08, q: 2.4, delay });
}

/** Pallina della roulette sulla pista: usato a ripetizione con pitch variabile. */
export function sfxBallTick(speed = 1): void {
  tone({ freq: 2200 * speed, dur: 0.022, type: 'square', gain: 0.05, detune: 0.08 });
}

/** Crash: esplosione del moltiplicatore. */
export function sfxCrash(): void {
  noise({ dur: 0.55, freq: 320, toFreq: 60, gain: 0.26, q: 0.5, type: 'lowpass' });
  tone({ freq: 160, toFreq: 40, dur: 0.5, type: 'sawtooth', gain: 0.16 });
}

/** Salita del moltiplicatore nel crash: tono continuo che sale. */
export function sfxCrashTick(mult: number): void {
  tone({ freq: 400 + Math.min(mult, 25) * 95, dur: 0.05, type: 'triangle', gain: 0.05 });
}

/** Salita di rango VIP. */
export function sfxLevelUp(): void {
  const root = 392; // Sol4
  for (const [i, semi] of [0, 4, 7, 12].entries()) {
    tone({
      freq: root * Math.pow(2, semi / 12),
      dur: 0.5,
      type: 'triangle',
      gain: 0.15,
      delay: i * 0.1,
      decay: 'lin',
    });
  }
  noise({ dur: 0.7, freq: 4800, toFreq: 1400, gain: 0.09, q: 0.6, delay: 0.1 });
}

/** Avviso / errore (puntata non consentita). */
export function sfxDenied(): void {
  tone({ freq: 220, dur: 0.1, type: 'square', gain: 0.1 });
  tone({ freq: 185, dur: 0.14, type: 'square', gain: 0.1, delay: 0.09 });
}

// ──────────────────────────────────────────── PALAZZO E TAVOLI

/**
 * Le porte del palazzo che si chiudono: il tonfo cade sull'URTO dei battenti
 * (0,5 s dopo l'avvio della chiusura), non sulla partenza. Un suono che
 * anticipa l'immagine si legge come un errore di sincronia.
 *
 * Il tonfo e' quasi tutto sotto i 200 Hz: e' il peso del legno massello.
 * Il ticchettio acuto finale e' la serratura in ottone.
 */
export function sfxDoorClose(impactDelay = 0.5): void {
  noise({ dur: 0.5, freq: 900, toFreq: 300, gain: 0.05, q: 0.4, type: 'lowpass' });
  tone({ freq: 82, toFreq: 46, dur: 0.42, type: 'sine', gain: 0.24, delay: impactDelay });
  noise({ dur: 0.18, freq: 260, toFreq: 90, gain: 0.2, q: 0.6, type: 'lowpass', delay: impactDelay });
  tone({ freq: 2400, dur: 0.05, type: 'triangle', gain: 0.04, delay: impactDelay + 0.09, detune: 0.03 });
}

/**
 * Le porte che si aprono: un soffio d'aria calda che entra dalla sala,
 * lento quanto l'apertura (0,8 s). Nessun cigolio: un palazzo a sette
 * stelle non ha cardini che cigolano.
 */
export function sfxDoorOpen(): void {
  noise({ dur: 1.1, freq: 380, toFreq: 2400, gain: 0.07, q: 0.5, type: 'bandpass', delay: 0.12 });
  tone({ freq: 196, dur: 1.2, type: 'sine', gain: 0.035, delay: 0.2, decay: 'lin', attack: 0.4 });
}

/** Carta girata: piu' secca e breve della distribuzione. */
export function sfxCardFlip(delay = 0): void {
  noise({ dur: 0.06, freq: 3800, toFreq: 1800, gain: 0.11, q: 1.2, delay });
}

/**
 * Conferma della puntata ("puntate chiuse"): due fiche che si posano e una
 * nota piena. Deve suonare come un impegno preso, non come un click.
 */
export function sfxBetConfirm(): void {
  sfxChip(0);
  sfxChip(0.06);
  tone({ freq: 587, dur: 0.32, type: 'triangle', gain: 0.09, delay: 0.08, decay: 'lin' });
  tone({ freq: 880, dur: 0.28, type: 'sine', gain: 0.05, delay: 0.1, decay: 'lin' });
}

/** Incasso (crash, cash-out): una cascata di monete breve e luminosa. */
export function sfxCashout(): void {
  for (let i = 0; i < 6; i++) sfxCoin(i * 0.045);
  tone({ freq: 1175, dur: 0.4, type: 'triangle', gain: 0.08, delay: 0.05, decay: 'lin' });
}
