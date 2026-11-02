/**
 * THE ROYAL MIRAGE — La partitura
 *
 * ── Composta, non generata ──
 * Il motore precedente sceglieva ogni nota con un passo casuale sulla scala.
 * Il risultato non si ripeteva mai, ed era proprio quello il difetto: una
 * musica senza frasi non si puo' riconoscere, e cio' che non si riconosce
 * non diventa mai "atmosfera" — resta rumore intonato. L'eleganza viene da
 * una forma che l'orecchio impara (otto battute, una progressione che
 * torna a casa) e dallo SPAZIO fra le note, non dalla loro densita'.
 *
 * Qui ogni atmosfera e' una frase di otto battute scritta a mano. Il caso
 * interviene solo negli ornamenti — un'acciaccatura, una campana in piu',
 * un colpo di tamburo saltato — cosi' la seconda volta la frase e' la
 * stessa ma non e' identica, come quando la suona un musicista.
 *
 * ── Armonia ──
 * Fondamentale Re. Maqam Nahawand (il minore naturale arabo) per i
 * movimenti tranquilli; sulla dominante (La) la melodia passa in Hijaz —
 * seconda abbassata e terza maggiore, Si♭-Do♯ — ed e' quell'intervallo
 * aumentato a portare il colore mediorientale. Usato SOLO li', in cadenza:
 * un Hijaz continuo stanca in un minuto e scivola nel cliche' da bazar.
 *
 * Semitoni dalla fondamentale (Re = 0):
 *   Re 0 · Mi♭ 1 · Mi 2 · Fa 3 · Fa♯ 4 · Sol 5 · La 7 · Si♭ 8 · Do 10 · Do♯ 11 · Re 12
 */

import type { NoteEvent, Score } from './engine';

/** Re2: abbastanza basso per il basso, un'ottava sotto per il pad. */
const D = 73.42;

/** Accordi della progressione, in semitoni (posizione stretta, centro sul Re3). */
const I = [12, 15, 19]; //    Re minore
const VI = [8, 12, 15]; //    Si♭ maggiore
const IV = [5, 8, 12]; //     Sol minore
const V = [7, 11, 14]; //     La maggiore (il Do♯ e' la sensibile Hijaz)
const PROGRESSION = [I, I, VI, VI, IV, IV, V, V];
/** Fondamentale del basso per battuta. */
const BASS = [0, 0, -4, -4, 5, 5, 7, 7];

function pad(chord: number[], beats: number, gain: number, octave = 12): NoteEvent[] {
  return chord.map((semi) => ({ voice: 'pad' as const, beat: 0, semi: semi + octave, beats, gain }));
}

/** Una frase melodica scritta come [semitono, durata] in sequenza. `null` = pausa. */
function phrase(
  voice: NoteEvent['voice'],
  notes: Array<[number | null, number]>,
  gain: number,
  offset = 0,
  start = 0
): NoteEvent[] {
  const out: NoteEvent[] = [];
  let b = start;
  for (const [semi, len] of notes) {
    if (semi !== null) out.push({ voice, beat: b, semi: semi + offset, beats: len, gain });
    b += len;
  }
  return out;
}

/**
 * Maqsum — il ritmo base della musica araba, su croma:
 *   DUM tek · tek DUM · tek ·
 * Lo scriviamo una volta e lo sfoltiamo per atmosfera: tutto il
 * carattere sta in quali colpi si TOLGONO.
 */
function maqsum(gain: number, rnd: () => number, density = 1): NoteEvent[] {
  const hits: Array<[number, 'dum' | 'tek', number]> = [
    [0, 'dum', 1],
    [0.5, 'tek', 0.55],
    [1.5, 'tek', 0.7],
    [2, 'dum', 0.85],
    [3, 'tek', 0.7],
    [3.5, 'tek', 0.4],
  ];
  const out: NoteEvent[] = [];
  for (const [beat, kind, w] of hits) {
    // I `dum` sono la struttura e non si saltano mai; i `tek` sono
    // ornamento e si diradano con la densita'.
    if (kind === 'tek' && rnd() > density) continue;
    out.push({ voice: 'drum', beat, beats: 0.25, gain: gain * w * (0.85 + rnd() * 0.3), kind });
  }
  return out;
}

// ─────────────────────────────────────────────── MENU
// Notte sul palazzo. Lento, sospeso, quasi nessun ritmo: il giocatore non ha
// ancora scelto niente e la musica non deve spingerlo da nessuna parte.

const MENU_NEY: Record<number, Array<[number | null, number]>> = {
  1: [[7, 1.5], [8, 0.5], [7, 1], [5, 1]],
  3: [[3, 1], [5, 0.5], [7, 0.5], [8, 2]],
  5: [[12, 2], [10, 1], [8, 1]],
  7: [[14, 1], [12, 0.5], [11, 0.5], [8, 1], [7, 1]],
};

const menu: Score = {
  bpm: 62,
  beatsPerBar: 4,
  root: D,
  bars: 8,
  level: 0.62,
  bar(bar, rnd) {
    const ev: NoteEvent[] = [];
    if (bar % 2 === 0) ev.push(...pad(PROGRESSION[bar]!, 8, 0.05));
    ev.push({ voice: 'bass', beat: 0, semi: BASS[bar]!, beats: 3.5, gain: 0.12 });

    const line = MENU_NEY[bar];
    if (line) ev.push(...phrase('ney', line, 0.085, 12));

    // Campane solo sulle battute pari, e non sempre: una goccia di
    // cristallo che cade ogni tanto, come il lampadario che tintinna.
    if (bar % 2 === 0 && rnd() > 0.35) {
      const top = PROGRESSION[bar]!;
      ev.push({ voice: 'bell', beat: 2 + (rnd() > 0.5 ? 0.5 : 0), semi: top[2]! + 24, beats: 4, gain: 0.03 });
    }
    // Un solo battito di cornice in apertura di frase: segna il tempo senza
    // diventare un ritmo.
    if (bar === 0 || bar === 4) ev.push({ voice: 'drum', beat: 0, beats: 0.5, gain: 0.16, kind: 'dum' });
    return ev;
  },
};

// ─────────────────────────────────────────────── LOBBY
// Dentro il palazzo. Entra l'oud con un ostinato e il tamburo in maqsum
// sfoltito: la sala e' viva ma e' ancora un lounge, non una festa.

/** Arpeggio dell'oud: fondamentale, quinta, ottava, terza — la figura classica del liuto. */
function oudArp(chord: number[], gain: number, rnd: () => number): NoteEvent[] {
  const [r, t, f] = chord as [number, number, number];
  const pattern: Array<[number, number]> = [
    [0, r - 12],
    [1, f - 12],
    [1.5, r],
    [2.5, t],
    [3, f - 12],
  ];
  return pattern
    .filter(() => rnd() > 0.12)
    .map(([beat, semi]) => ({ voice: 'oud' as const, beat, semi: semi + 12, beats: 1.6, gain: gain * (0.8 + rnd() * 0.3) }));
}

const LOBBY_NEY: Record<number, Array<[number | null, number]>> = {
  2: [[null, 1], [15, 1], [14, 0.5], [12, 0.5], [10, 1]],
  3: [[12, 3], [null, 1]],
  6: [[null, 0.5], [19, 0.5], [20, 1], [19, 0.5], [16, 0.5], [13, 1]],
  7: [[12, 3], [null, 1]],
};

const lobby: Score = {
  bpm: 74,
  beatsPerBar: 4,
  root: D,
  bars: 8,
  level: 0.6,
  bar(bar, rnd) {
    const chord = PROGRESSION[bar]!;
    const ev: NoteEvent[] = [];
    if (bar % 2 === 0) ev.push(...pad(chord, 8, 0.04));
    ev.push({ voice: 'bass', beat: 0, semi: BASS[bar]!, beats: 1.5, gain: 0.13 });
    ev.push({ voice: 'bass', beat: 2.5, semi: BASS[bar]! + 7, beats: 1, gain: 0.08 });
    ev.push(...oudArp(chord, 0.11, rnd));
    ev.push(...maqsum(0.15, rnd, 0.55));

    const line = LOBBY_NEY[bar];
    if (line) ev.push(...phrase('ney', line, 0.07, 0));
    if (bar === 7 && rnd() > 0.4) ev.push({ voice: 'bell', beat: 3.5, semi: 36, beats: 3, gain: 0.03 });
    return ev;
  },
};

// ─────────────────────────────────────────────── SLOT
// Piu' brillante e piu' propulsiva, ma mai "arcade": niente melodia in
// primo piano (competerebbe con i suoni delle vincite), un riff d'oud e le
// campane che danno lo scintillio. Il giocatore deve sentirsi in un luogo
// di lusso in movimento, non in una sala giochi.

const SLOT_RIFF: Array<[number | null, number]> = [
  [12, 0.5], [13, 0.5], [16, 0.5], [17, 0.5], [19, 1], [17, 0.5], [16, 0.5],
];

const slots: Score = {
  bpm: 92,
  beatsPerBar: 4,
  root: D,
  bars: 8,
  level: 0.48,
  bar(bar, rnd) {
    const chord = PROGRESSION[bar]!;
    const ev: NoteEvent[] = [];
    if (bar % 2 === 0) ev.push(...pad(chord, 8, 0.032, 12));
    ev.push({ voice: 'bass', beat: 0, semi: BASS[bar]!, beats: 0.9, gain: 0.13 });
    ev.push({ voice: 'bass', beat: 1.5, semi: BASS[bar]!, beats: 0.5, gain: 0.08 });
    ev.push({ voice: 'bass', beat: 2, semi: BASS[bar]! + 12, beats: 0.9, gain: 0.08 });
    ev.push(...maqsum(0.14, rnd, 0.85));

    // Il riff Hijaz solo sulle battute dispari: domanda e risposta col pad.
    if (bar % 2 === 1) ev.push(...phrase('oud', SLOT_RIFF, 0.1, 0).filter(() => rnd() > 0.08));
    // Campane in terzine sull'accordo: il "luccichio" della slot.
    if (rnd() > 0.45) {
      chord.forEach((semi, i) =>
        ev.push({ voice: 'bell', beat: 2 + i * (2 / 3), semi: semi + 24, beats: 2, gain: 0.02 })
      );
    }
    return ev;
  },
};

// ─────────────────────────────────────────────── TAVOLI
// Sala privata. Lento, scuro, notturno: il tempo di pensare a una carta.
// Niente tamburo con il ritmo pieno — solo il dum — e l'oud che risponde
// alla melodia invece di accompagnarla. Il registro si abbassa di una quarta
// per lasciare libere le frequenze delle carte e delle fiche.

const TABLE_OUD: Record<number, Array<[number | null, number]>> = {
  1: [[null, 2], [7, 0.5], [8, 0.5], [7, 1]],
  3: [[null, 2], [3, 0.5], [5, 0.5], [3, 1]],
  5: [[null, 1.5], [10, 0.5], [8, 0.5], [7, 0.5], [5, 1]],
  7: [[null, 1], [8, 0.5], [7, 0.5], [4, 1], [1, 0.5], [0, 0.5]],
};

const tables: Score = {
  bpm: 66,
  beatsPerBar: 4,
  root: D * 0.75,
  bars: 8,
  level: 0.56,
  bar(bar, rnd) {
    const ev: NoteEvent[] = [];
    if (bar % 2 === 0) ev.push(...pad(PROGRESSION[bar]!, 8, 0.042, 12));
    ev.push({ voice: 'bass', beat: 0, semi: BASS[bar]!, beats: 2.5, gain: 0.13 });
    ev.push({ voice: 'drum', beat: 0, beats: 0.5, gain: 0.12, kind: 'dum' });
    if (rnd() > 0.5) ev.push({ voice: 'drum', beat: 2.5, beats: 0.25, gain: 0.05, kind: 'tek' });

    const line = TABLE_OUD[bar];
    if (line) ev.push(...phrase('oud', line, 0.11, 12));
    if (bar === 4 && rnd() > 0.3) ev.push({ voice: 'bell', beat: 1, semi: 31, beats: 4, gain: 0.025 });
    return ev;
  },
};

// ─────────────────────────────────────────────── TENSIONE
// Crash e anticipazioni. Un pedale sulla tonica (niente progressione:
// l'armonia non va da nessuna parte, ed e' questo l'attesa), basso pulsante
// in croma, tek fitti, e una figura di campane che sale e non risolve mai.

const tension: Score = {
  bpm: 112,
  beatsPerBar: 4,
  root: D,
  bars: 4,
  level: 0.46,
  bar(bar, rnd) {
    const ev: NoteEvent[] = [];
    if (bar === 0) ev.push(...pad([12, 13, 19], 16, 0.035, 0));
    for (let i = 0; i < 8; i++) {
      ev.push({ voice: 'bass', beat: i * 0.5, semi: 0, beats: 0.35, gain: i % 2 === 0 ? 0.12 : 0.07 });
    }
    ev.push({ voice: 'drum', beat: 0, beats: 0.25, gain: 0.1, kind: 'dum' });
    for (let i = 1; i < 8; i++) {
      if (rnd() > 0.3) ev.push({ voice: 'drum', beat: i * 0.5, beats: 0.25, gain: 0.06 + rnd() * 0.04, kind: 'tek' });
    }
    const climb = [24, 25, 28, 29][bar % 4]!;
    ev.push({ voice: 'bell', beat: 3, semi: climb, beats: 1.5, gain: 0.025 });
    return ev;
  },
};

export const SCORES = { menu, lobby, slots, tables, tension } as const;
export type ScoredMood = keyof typeof SCORES;
