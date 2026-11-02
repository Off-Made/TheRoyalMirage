/**
 * THE ROYAL MIRAGE — Motore musicale
 *
 * ── Perche' il motore precedente non poteva suonare bene ──
 * Programmava ogni nota con `setTimeout`. Un timer JS ha un'incertezza di
 * 5-50 ms e viene strozzato quando la scheda perde priorita'. Su una nota
 * lunga non si sente; su una percussione che arriva trenta millisecondi in
 * ritardo *a caso* si sente come "musica sbagliata" senza che l'ascoltatore
 * sappia dire perche'. Nessuna scelta di note puo' rimediare a una griglia
 * metrica che non esiste.
 *
 * ── La cura: scheduler con look-ahead ──
 * Un timer grossolano (ogni 45 ms) che non suona NULLA, ma prenota gli
 * eventi dei prossimi ~500 ms su `ctx.currentTime` — il clock del thread
 * audio, con precisione al campione. Il timer puo' arrivare in ritardo
 * quanto vuole: le note sono gia' in coda nell'hardware. E' il modello
 * standard di ogni sequencer WebAudio.
 *
 * ── La catena condivisa ──
 *   voci → [dry] ──────────────────┐
 *        → [eco sincronizzata] ────┤→ compressore → bus musica
 *        → [riverbero] ────────────┘
 *
 * Il riverbero e' la differenza piu' grande fra "sintetizzatore" e "sala":
 * senza coda riverberante ogni nota finisce nel vuoto, ed e' quel vuoto che
 * l'orecchio legge come economico. L'impulso e' generato da rumore
 * decadente — nessun file da scaricare, e per una coda smorzata e' pressoche'
 * indistinguibile da una risposta campionata.
 *
 * ── Due strati per il crossfade ──
 * Cambiare atmosfera tagliando la musica e' brutale. Ci sono due strati
 * identici: il nuovo mood entra su quello libero mentre il vecchio sfuma,
 * per 2,6 s. Durante la sovrapposizione suonano due partiture: e' il motivo
 * per cui ogni strato ha il proprio gain e il proprio orologio di battuta.
 */

import { audioCtx, musicBusNode } from '../synth';
import {
  crystalBell,
  deepBass,
  frameDrum,
  neyBreath,
  oudPluck,
  stringPad,
  type VoiceOpts,
} from './instruments';

export type VoiceName = 'pad' | 'oud' | 'ney' | 'drum' | 'bell' | 'bass';

/** Una nota in coordinate musicali: il tempo e' in movimenti dall'inizio della battuta. */
export interface NoteEvent {
  voice: VoiceName;
  /** Movimento d'attacco dentro la battuta (0 = primo movimento). Frazioni ammesse. */
  beat: number;
  /** Semitoni dalla fondamentale del mood. Ignorato da `drum`. */
  semi?: number;
  /** Durata in movimenti. */
  beats: number;
  gain?: number;
  /** Solo per `drum`: colpo al centro o sul bordo. */
  kind?: 'dum' | 'tek';
}

/** Il materiale musicale di un'atmosfera. */
export interface Score {
  /** Movimenti al minuto. */
  bpm: number;
  /** Movimenti per battuta. */
  beatsPerBar: number;
  /** Fondamentale in Hz. */
  root: number;
  /** Lunghezza della frase in battute: dopo tante battute si ricomincia. */
  bars: number;
  /** Volume generale dell'atmosfera, 0..1. */
  level: number;
  /**
   * Gli eventi della battuta `bar` (0-based, gia' ridotto modulo `bars`).
   * `rnd` e' un PRNG dello strato: le variazioni restano riproducibili e
   * due strati sovrapposti non si muovono all'unisono.
   */
  bar(bar: number, rnd: () => number): NoteEvent[];
}

const LOOKAHEAD = 0.5;
const TICK_MS = 45;

interface Layer {
  gain: GainNode;
  score: Score | null;
  /** Prossima battuta da prenotare. */
  nextBar: number;
  /** Tempo assoluto d'inizio della prossima battuta. */
  nextTime: number;
  seed: number;
}

class MusicEngine {
  private ctx: AudioContext | null = null;
  private wet: GainNode | null = null;
  private dry: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private layers: Layer[] = [];
  private active = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Costruisce la catena una volta sola. Falso se WebAudio non e' disponibile. */
  init(): boolean {
    if (this.ctx) return true;
    const ctx = audioCtx();
    const bus = musicBusNode();
    if (!ctx || !bus) return false;
    this.ctx = ctx;

    // Compressore gentile sul master musicale: tiene insieme il pad e le
    // percussioni senza che nessuna delle due debba essere mixata al
    // ribasso. Soglia alta e rapporto basso = livella, non schiaccia.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 14;
    comp.ratio.value = 2.4;
    comp.attack.value = 0.02;
    comp.release.value = 0.3;
    comp.connect(bus);

    this.dry = ctx.createGain();
    this.dry.gain.value = 0.82;
    this.dry.connect(comp);

    const conv = ctx.createConvolver();
    conv.buffer = buildImpulse(ctx, 2.9);
    const wetG = ctx.createGain();
    wetG.gain.value = 0.34;
    conv.connect(wetG).connect(comp);

    // Eco a un movimento e mezzo (punto di croma): un ritardo "dritto"
    // raddoppia i colpi e impasta, uno puntato cade negli spazi vuoti fra
    // le note e si sente come spazio invece che come ripetizione.
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.26;
    const damp = ctx.createBiquadFilter();
    // Ogni ripetizione piu' scura della precedente: in una sala vera l'aria
    // e le superfici assorbono gli acuti prima dei gravi. Un'eco che torna
    // identica suona come un effetto digitale.
    damp.type = 'lowpass';
    damp.frequency.value = 2400;
    delay.connect(damp).connect(fb).connect(delay);
    const delayG = ctx.createGain();
    delayG.gain.value = 0.2;
    damp.connect(delayG).connect(comp);

    this.wet = ctx.createGain();
    this.wet.gain.value = 1;
    this.wet.connect(conv);
    this.wet.connect(delay);

    for (let i = 0; i < 2; i++) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.dry);
      g.connect(this.wet);
      this.layers.push({ gain: g, score: null, nextBar: 0, nextTime: 0, seed: 0x9e3779b9 + i * 0x6d2b79f5 });
    }

    this.noiseBuf = makeNoise(ctx);
    return true;
  }

  /**
   * Fa entrare una partitura e sfumare quella in corso.
   * `null` = silenzio (sfuma tutto e ferma lo scheduler quando ha finito).
   */
  play(score: Score | null, fade = 2.6): void {
    if (!this.init() || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    for (const l of this.layers) {
      l.gain.gain.cancelScheduledValues(now);
      l.gain.gain.setValueAtTime(l.gain.gain.value, now);
    }

    const old = this.layers[this.active]!;
    old.gain.gain.linearRampToValueAtTime(0, now + fade);
    // Lo strato uscente smette di PRENOTARE subito, ma cio' che e' gia' in
    // coda continua a suonare e a sfumare. Fermarlo del tutto taglierebbe
    // le note a meta' proprio durante la dissolvenza.
    old.score = null;

    if (!score) {
      // Lascia finire la dissolvenza, poi spegni il timer: senza questo
      // ritardo il silenzio arriva brusco.
      setTimeout(() => {
        if (this.layers.every((l) => !l.score)) this.stopClock();
      }, fade * 1000 + 200);
      return;
    }

    this.active = (this.active + 1) % 2;
    const next = this.layers[this.active]!;
    next.score = score;
    next.nextBar = 0;
    // Mezzo secondo di margine: la prima battuta deve essere prenotabile
    // interamente, altrimenti il primo movimento salta.
    next.nextTime = now + 0.08;
    next.gain.gain.setValueAtTime(0.0001, now);
    next.gain.gain.linearRampToValueAtTime(score.level, now + fade * 0.8);

    this.startClock();
  }

  private startClock(): void {
    if (this.timer) return;
    this.pump();
    this.timer = setInterval(() => this.pump(), TICK_MS);
  }

  private stopClock(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Prenota tutte le battute che cadono dentro la finestra di look-ahead. */
  private pump(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const horizon = ctx.currentTime + LOOKAHEAD;

    for (const l of this.layers) {
      let guard = 0;
      // La guardia protegge da un bpm assurdo o da un orologio che e'
      // rimasto indietro (scheda in sottofondo per minuti): meglio perdere
      // qualche battuta che prenotarne mille in un giro.
      while (l.score && l.nextTime < horizon && guard++ < 8) {
        const s = l.score;
        const beat = 60 / s.bpm;
        const t0 = l.nextTime;
        const rnd = () => {
          l.seed = (l.seed * 1664525 + 1013904223) >>> 0;
          return l.seed / 4294967296;
        };

        for (const ev of s.bar(l.nextBar % s.bars, rnd)) {
          this.fire(ev, s, t0 + ev.beat * beat, ev.beats * beat, l.gain);
        }

        l.nextBar++;
        l.nextTime = t0 + s.beatsPerBar * beat;
      }
      if (l.score && l.nextTime < ctx.currentTime) {
        // Troppo indietro per recuperare: riallinea invece di rincorrere.
        l.nextTime = ctx.currentTime + 0.05;
      }
    }

    if (this.layers.every((l) => !l.score)) this.stopClock();
  }

  private fire(ev: NoteEvent, s: Score, t: number, dur: number, out: GainNode): void {
    if (this.ctx && this.noiseBuf) playEvent(this.ctx, out, this.noiseBuf, ev, s, t, dur);
  }
}

/**
 * Suona un evento della partitura. Esportata per la pagina di collaudo
 * `dev/music.html`, che renderizza le partiture in un `OfflineAudioContext`
 * e ne misura picco e livello: e' l'unico modo di verificare un mix senza
 * fidarsi delle proprie orecchie (o delle casse del portatile).
 */
export function playEvent(
  ctx: BaseAudioContext,
  out: AudioNode,
  noiseBuf: AudioBuffer,
  ev: NoteEvent,
  s: Score,
  t: number,
  dur: number
): void {
  const freq = s.root * Math.pow(2, (ev.semi ?? 0) / 12);
  const o: VoiceOpts = { ctx, out, t, freq, dur, gain: ev.gain ?? 0.2 };
  switch (ev.voice) {
    case 'pad':
      return stringPad(o);
    case 'oud':
      return oudPluck(o);
    case 'ney':
      return neyBreath(o, noiseBuf);
    case 'bell':
      return crystalBell(o);
    case 'bass':
      return deepBass(o);
    case 'drum':
      return frameDrum({ ctx, out, t, gain: o.gain, kind: ev.kind ?? 'dum' }, noiseBuf);
  }
}

/**
 * Risposta all'impulso sintetica: rumore con decadimento esponenziale.
 *
 * Due dettagli che la rendono credibile:
 *  - i due canali sono rumore INDIPENDENTE, non copie. E' la decorrelazione
 *    fra orecchio destro e sinistro a produrre la sensazione di larghezza;
 *    un impulso mono riverbera "dentro la testa".
 *  - l'esponente 2,6 invece di una retta: in una sala la densita' delle
 *    prime riflessioni e' alta e cala in fretta. Un decadimento lineare
 *    suona come una camera a eco.
 */
export function buildImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const k = 1 - i / len;
      // Piccolo pre-ritardo silenzioso: la riflessione di una sala grande
      // arriva dopo il suono diretto, e quel ritardo E' la grandezza.
      const gate = i < sr * 0.012 ? i / (sr * 0.012) : 1;
      d[i] = (Math.random() * 2 - 1) * Math.pow(k, 2.6) * gate;
    }
  }
  return buf;
}

export function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 1.5);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export const music = new MusicEngine();
