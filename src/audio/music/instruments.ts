/**
 * THE ROYAL MIRAGE — Le voci dell'orchestra
 *
 * Il motore musicale precedente suonava ogni nota con un oscillatore nudo e
 * un inviluppo di guadagno. E' per questo che suonava a buon mercato, non per
 * le note scelte: una sinusoide con attacco e decadimento non e' uno
 * strumento, e' un test del tono. Un pianoforte, un oud e un flauto che
 * suonano la stessa nota differiscono in TIMBRO, e il timbro vive in tre
 * cose che gli oscillatori nudi non hanno:
 *
 *   1. piu' sorgenti leggermente scordate (nessun corpo risonante vibra a
 *      una sola frequenza esatta)
 *   2. un filtro che si MUOVE durante la nota (l'attacco di ogni strumento
 *      reale e' piu' brillante del suo sostegno)
 *   3. una componente di rumore (l'arco sulla corda, il fiato sul labium,
 *      il dito sul plettro)
 *
 * Ogni voce qui dentro ha la stessa firma: riceve il contesto, il nodo di
 * uscita e il tempo ASSOLUTO di attacco, e programma tutto in una volta
 * senza mai piu' bisogno di essere richiamata. E' cio' che permette allo
 * scheduler di prenotare mezzo secondo di musica in anticipo e poi dormire.
 *
 * Tutte le voci si auto-smontano: `osc.stop()` libera il nodo, e WebAudio
 * raccoglie il grafo scollegato. Nessun `disconnect()` manuale da ricordare.
 */

export interface VoiceOpts {
  ctx: BaseAudioContext;
  out: AudioNode;
  /** Tempo assoluto di attacco, in secondi sul clock di `ctx`. */
  t: number;
  /** Frequenza fondamentale in Hz. */
  freq: number;
  /** Durata in secondi (per le voci sostenute). */
  dur: number;
  /** Ampiezza di picco, 0..1. */
  gain: number;
}

/** Inviluppo ADSR su un `GainNode`, in tempo assoluto. */
function adsr(
  g: GainNode,
  t: number,
  dur: number,
  peak: number,
  a: number,
  d: number,
  s: number,
  r: number
): void {
  const p = g.gain;
  // `setValueAtTime` a un valore minuscolo e non a zero: le rampe
  // esponenziali non possono partire da zero (ne' arrivarci).
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.linearRampToValueAtTime(peak * s, t + a + d);
  p.setValueAtTime(peak * s, t + Math.max(a + d, dur - r));
  p.exponentialRampToValueAtTime(0.0001, t + dur);
}

/**
 * Pad d'archi — il letto armonico su cui sta tutto il resto.
 *
 * Tre onde a dente di sega scordate di ±7 cent. La scordatura non e' un
 * effetto: e' cio' che trasforma tre oscillatori in una SEZIONE. Battimenti
 * lentissimi fra le tre fanno "respirare" l'accordo, ed e' quel respiro che
 * l'orecchio sente come "archi" invece che "sintetizzatore".
 *
 * Il filtro passa-basso si apre durante l'attacco e si richiude sul
 * sostegno: un arco preme di piu' all'inizio della nota.
 */
export function stringPad(o: VoiceOpts & { bright?: number }): void {
  const { ctx, out, t, freq, dur, gain } = o;
  const bright = o.bright ?? 1;

  const vca = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.9;
  // Il cutoff segue la fondamentale invece di essere assoluto: altrimenti
  // le note gravi escono scure e quelle acute stridule.
  const base = Math.min(5200, freq * 4 * bright);
  lp.frequency.setValueAtTime(base * 0.55, t);
  lp.frequency.linearRampToValueAtTime(base * 1.5, t + Math.min(0.9, dur * 0.3));
  lp.frequency.linearRampToValueAtTime(base * 0.75, t + dur);

  for (const cents of [-7, 0, 7]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value = cents;
    const g = ctx.createGain();
    g.gain.value = cents === 0 ? 0.42 : 0.3;
    osc.connect(g).connect(lp);
    osc.start(t);
    osc.stop(t + dur + 0.1);
  }

  // Un'ottava sotto in sinusoide: da' fondo all'accordo senza aggiungere
  // armoniche da filtrare.
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = freq / 2;
  const subG = ctx.createGain();
  subG.gain.value = 0.3;
  sub.connect(subG).connect(lp);
  sub.start(t);
  sub.stop(t + dur + 0.1);

  // Attacco e rilascio lunghi: un pad che entra in fretta sembra un organo.
  adsr(vca, t, dur, gain, Math.min(1.1, dur * 0.35), 0.4, 0.78, Math.min(1.6, dur * 0.4));
  lp.connect(vca).connect(out);
}

/**
 * Oud pizzicato — Karplus-Strong.
 *
 * Il modello e' una corda vera: un impulso di rumore entra in una linea di
 * ritardo lunga quanto il periodo della nota, e ogni giro passa per una
 * media di due campioni adiacenti. Quella media e' un passa-basso: le
 * armoniche alte perdono energia piu' in fretta della fondamentale, ed e'
 * esattamente cio' che fa una corda vera. Nessuna somma di sinusoidi
 * riproduce questo decadimento disomogeneo in modo convincente.
 *
 * Lo sintetizziamo in un buffer in JS invece che nel grafo WebAudio: una
 * linea di ritardo con feedback costruita con `DelayNode` non puo' scendere
 * sotto il quanto di 128 campioni, quindi non suonerebbe nulla sopra ~350 Hz.
 */
export function oudPluck(o: VoiceOpts & { bright?: number }): void {
  const { ctx, out, t, freq, gain } = o;
  const dur = Math.min(o.dur, 3.2);
  const sr = ctx.sampleRate;
  const n = Math.max(2, Math.round(sr / freq));
  const len = Math.ceil(sr * dur);

  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);

  // Eccitazione: rumore filtrato alla meta' alta: un plettro colpisce la
  // corda in un punto, non la mette in moto uniformemente.
  const line = new Float32Array(n);
  for (let i = 0; i < n; i++) line[i] = (Math.random() * 2 - 1) * (i < n / 2 ? 1 : 0.4);

  // Piu' il decadimento e' vicino a 1, piu' la corda suona a lungo. 0,996
  // e' un oud: corde corte e molto smorzate rispetto a una chitarra.
  const damp = o.bright ? 0.9955 : 0.996;
  let p = 0;
  for (let i = 0; i < len; i++) {
    const cur = line[p]!;
    const next = line[(p + 1) % n]!;
    const avg = (cur + next) * 0.5 * damp;
    line[p] = avg;
    data[i] = cur;
    p = (p + 1) % n;
  }
  // Dissolvenza finale: tagliare un buffer ancora in oscillazione produce
  // un click.
  const fade = Math.min(len, Math.floor(sr * 0.08));
  for (let i = 0; i < fade; i++) data[len - 1 - i]! *= i / fade;

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const body = ctx.createBiquadFilter();
  // Risonanza della cassa, non del timbro: un picco largo intorno ai 240 Hz
  // e' cio' che distingue un liuto da una corda tesa su un telaio.
  body.type = 'peaking';
  body.frequency.value = 240;
  body.Q.value = 0.8;
  body.gain.value = 5;

  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  src.connect(body).connect(g).connect(out);
  src.start(t);
  src.stop(t + dur + 0.05);
}

/**
 * Ney soffiato — la voce solista.
 *
 * Un flauto di canna e' meta' tono e meta' fiato. La sinusoide da' la nota,
 * il rumore passa-banda centrato sulla stessa frequenza da' il soffio, e il
 * rapporto fra i due e' tutta la credibilita': troppo rumore e sembra vento,
 * troppo poco e torna a essere un oscillatore.
 *
 * Il vibrato parte DOPO l'attacco. Un fiatista stabilizza la nota e poi la
 * fa vibrare; un vibrato presente dall'inizio e' la firma inconfondibile di
 * un sintetizzatore.
 */
export function neyBreath(o: VoiceOpts, noiseBuf: AudioBuffer): void {
  const { ctx, out, t, freq, dur, gain } = o;

  const vca = ctx.createGain();
  adsr(vca, t, dur, gain, 0.14, 0.18, 0.85, 0.3);
  vca.connect(out);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq * 0.985, t);
  // Piccola salita all'attacco: l'intonazione di un fiato arriva da sotto.
  osc.frequency.linearRampToValueAtTime(freq, t + 0.12);

  const lfo = ctx.createOscillator();
  lfo.frequency.value = 4.8;
  const lfoG = ctx.createGain();
  lfoG.gain.setValueAtTime(0, t);
  lfoG.gain.linearRampToValueAtTime(freq * 0.008, t + Math.min(0.6, dur * 0.4));
  lfo.connect(lfoG).connect(osc.frequency);
  lfo.start(t);
  lfo.stop(t + dur + 0.05);

  const oscG = ctx.createGain();
  oscG.gain.value = 0.72;
  osc.connect(oscG).connect(vca);
  osc.start(t);
  osc.stop(t + dur + 0.05);

  // Terza armonica debole: un tubo aperto non e' una sinusoide pura.
  const h3 = ctx.createOscillator();
  h3.type = 'sine';
  h3.frequency.value = freq * 3;
  const h3g = ctx.createGain();
  h3g.gain.value = 0.06;
  h3.connect(h3g).connect(vca);
  h3.start(t);
  h3.stop(t + dur + 0.05);

  const air = ctx.createBufferSource();
  air.buffer = noiseBuf;
  air.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq * 2;
  bp.Q.value = 1.6;
  const airG = ctx.createGain();
  // Il soffio e' piu' forte all'attacco (lo sbuffo iniziale) e poi si ritira.
  airG.gain.setValueAtTime(0.0001, t);
  airG.gain.linearRampToValueAtTime(0.3, t + 0.06);
  airG.gain.linearRampToValueAtTime(0.1, t + Math.min(0.5, dur * 0.5));
  air.connect(bp).connect(airG).connect(vca);
  air.start(t, Math.random() * 0.9);
  air.stop(t + dur + 0.05);
}

/**
 * Tamburo a cornice (riq / bendir) — percussione sofisticata.
 *
 * Due colpi distinti, come sullo strumento vero: `dum` al centro della
 * pelle (grave, intonato, lungo) e `tek` sul bordo (acuto, secco). Usare un
 * solo suono per entrambi e' cio' che fa suonare una percussione araba come
 * un metronomo.
 */
export function frameDrum(
  o: Omit<VoiceOpts, 'freq' | 'dur'> & { kind: 'dum' | 'tek' },
  noiseBuf: AudioBuffer
): void {
  const { ctx, out, t, gain, kind } = o;
  const dum = kind === 'dum';
  const dur = dum ? 0.42 : 0.14;

  // La pelle: una sinusoide che SCENDE di intonazione. Una membrana percossa
  // cala di frequenza mentre la tensione si rilassa; una nota a intonazione
  // fissa suona come un blocco di legno.
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(dum ? 128 : 420, t);
  osc.frequency.exponentialRampToValueAtTime(dum ? 62 : 280, t + dur * 0.8);
  const og = ctx.createGain();
  og.gain.setValueAtTime(gain * (dum ? 1 : 0.42), t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(og).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);

  // Lo schiocco del dito sulla pelle: brevissimo, ed e' lui che fa
  // percepire "mano" invece di "altoparlante".
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = dum ? 'lowpass' : 'highpass';
  bp.frequency.value = dum ? 900 : 2600;
  const g = ctx.createGain();
  const click = dum ? 0.05 : 0.11;
  g.gain.setValueAtTime(gain * click, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (dum ? 0.05 : 0.1));
  src.connect(bp).connect(g).connect(out);
  src.start(t, Math.random() * 0.9, 0.16);
  src.stop(t + 0.18);
}

/**
 * Campane di cristallo — modulazione di frequenza, due operatori.
 *
 * Il timbro di una campana ha parziali NON armoniche (rapporti irrazionali
 * con la fondamentale): e' questo che la distingue da una corda, e la
 * modulazione di frequenza e' il modo piu' economico di ottenerle. Il
 * rapporto 3,5:1 produce la spaziatura metallica; l'indice di modulazione
 * decade piu' in fretta dell'ampiezza, cosi' l'attacco e' brillante e la
 * coda diventa una sinusoide quasi pura. E' il profilo di ogni suono
 * metallico percosso.
 */
export function crystalBell(o: VoiceOpts): void {
  const { ctx, out, t, freq, gain } = o;
  const dur = Math.min(o.dur, 5);

  const carrier = ctx.createOscillator();
  carrier.type = 'sine';
  carrier.frequency.value = freq;

  const mod = ctx.createOscillator();
  mod.type = 'sine';
  mod.frequency.value = freq * 3.5;
  const modG = ctx.createGain();
  modG.gain.setValueAtTime(freq * 2.4, t);
  modG.gain.exponentialRampToValueAtTime(freq * 0.05, t + dur * 0.35);
  mod.connect(modG).connect(carrier.frequency);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  carrier.connect(g).connect(out);
  mod.start(t);
  mod.stop(t + dur + 0.05);
  carrier.start(t);
  carrier.stop(t + dur + 0.05);
}

/**
 * Basso profondo ma controllato.
 *
 * "Controllato" e' il requisito vero: un basso che invade i 40-60 Hz rende
 * fangoso tutto il mix su un portatile, e il giocatore alza il volume per
 * sentire la melodia e si becca il basso in faccia. Fondamentale in
 * sinusoide per il peso, una dente di sega filtrata molto bassa per
 * l'articolazione (senza di essa su casse piccole il basso e' INAUDIBILE,
 * perche' quelle casse non riproducono la fondamentale: si sentono solo le
 * armoniche), passa-alto a 35 Hz per buttare via cio' che nessuno sentira'
 * mai ma che consuma headroom.
 */
export function deepBass(o: VoiceOpts): void {
  const { ctx, out, t, freq, dur, gain } = o;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 35;
  const vca = ctx.createGain();
  adsr(vca, t, dur, gain, 0.04, 0.12, 0.7, 0.2);
  hp.connect(vca).connect(out);

  const sine = ctx.createOscillator();
  sine.type = 'sine';
  sine.frequency.value = freq;
  const sg = ctx.createGain();
  sg.gain.value = 0.8;
  sine.connect(sg).connect(hp);
  sine.start(t);
  sine.stop(t + dur + 0.08);

  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.value = freq;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(freq * 6, t);
  lp.frequency.exponentialRampToValueAtTime(freq * 2.2, t + Math.min(0.5, dur));
  lp.Q.value = 1.4;
  const swg = ctx.createGain();
  swg.gain.value = 0.22;
  saw.connect(lp).connect(swg).connect(hp);
  saw.start(t);
  saw.stop(t + dur + 0.08);
}
