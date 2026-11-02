/**
 * THE ROYAL MIRAGE — Gestore audio
 *
 * Collega la sintesi (`synth.ts`) allo store delle impostazioni, decide
 * quale atmosfera musicale suona e lega i suoni d'interfaccia al DOM.
 *
 * La musica vera e propria vive in `audio/music/`: uno scheduler con
 * look-ahead (`engine.ts`), voci costruite come strumenti (`instruments.ts`)
 * e una partitura composta per atmosfera (`score.ts`). Qui si sceglie solo
 * COSA suona; il come non e' affare di questo modulo.
 */

import { initAudio, resumeAudio, setBusVolume, audioReady, sfxClick, sfxHover } from './synth';
import { music } from './music/engine';
import { SCORES } from './music/score';
import { store, settings } from '@/state/store';
import { bus } from '@/state/events';

export type Mood = 'menu' | 'lobby' | 'slots' | 'tables' | 'tension' | 'silence';

class AudioManagerImpl {
  private started = false;
  private mood: Mood = 'silence';

  /**
   * Da chiamare al PRIMO gesto dell'utente. I browser bloccano l'audio
   * avviato senza interazione: provarci prima produce solo un warning in
   * console e un contesto "suspended" che poi va risvegliato comunque.
   */
  unlock(): void {
    if (this.started) {
      void resumeAudio();
      return;
    }
    if (!initAudio()) return;
    this.started = true;
    this.syncVolumes();

    // `Shell.install` chiama `setMood('menu')` PRIMA di qualunque gesto, e
    // in quel momento `setMood` registra il mood ma non puo' suonare. Senza
    // questa riga la musica partiva solo al primo cambio di mood (l'ingresso
    // in lobby) e il menu principale restava muto.
    const pending = this.mood;
    this.mood = 'silence';
    this.setMood(pending);

    // Le impostazioni possono cambiare dal menu mentre si gioca.
    bus.on('settings:changed', () => this.syncVolumes());
    store.subscribe(() => this.syncVolumes());

    document.addEventListener('visibilitychange', () => {
      // Silenziamo quando la scheda non e' visibile: un casino che continua
      // a suonare in un tab di sottofondo e' il modo piu' rapido di farsi
      // chiudere dall'utente.
      if (document.visibilityState === 'hidden') {
        setBusVolume('master', 0);
        // Il master e' stato toccato fuori da syncVolumes: la cache non e'
        // piu' veritiera, e al ritorno il volume deve essere ripristinato.
        this.lastVolumes = '';
      } else {
        void resumeAudio();
        this.syncVolumes();
      }
    });
  }

  get ready(): boolean {
    return this.started && audioReady();
  }

  private lastVolumes = '';

  private syncVolumes(): void {
    if (!this.started) return;
    const s = settings();
    // Il master si applica UNA volta sola, sul bus master: i bus figli ci
    // passano gia' attraverso. Prima i figli portavano `master × proprio` e
    // il master lo moltiplicava di nuovo, quindi ai valori predefiniti la
    // musica suonava a 0,75 × 0,75 invece che a 0,75.
    const master = s.muted ? 0 : s.volumeMaster;
    const key = `${master}|${s.volumeMusic}|${s.volumeSfx}`;
    // Lo store notifica a ogni puntata: senza questa guardia ogni giocata
    // cancellerebbe le rampe programmate sui bus (e le dissolvenze musicali).
    if (key === this.lastVolumes) return;
    this.lastVolumes = key;
    setBusVolume('master', master);
    setBusVolume('music', s.volumeMusic);
    setBusVolume('sfx', s.volumeSfx);
  }

  /**
   * Cambia atmosfera con una dissolvenza incrociata di 2,6 s.
   *
   * Prima del primo gesto dell'utente registra soltanto il mood: il
   * contesto audio non esiste ancora, e `unlock()` lo fara' partire.
   */
  setMood(mood: Mood): void {
    if (this.mood === mood) return;
    this.mood = mood;
    if (!this.started) return;
    music.play(mood === 'silence' ? null : SCORES[mood]);
  }

  get currentMood(): Mood {
    return this.mood;
  }

  /**
   * Collega automaticamente i suoni di interfaccia a tutto l'overlay DOM.
   * Delegation su document: funziona anche per i pulsanti creati dopo.
   */
  bindUiSounds(): void {
    const INTERACTIVE = 'button, [role="button"], .go-btn, .go-tab, input[type="range"]';

    document.addEventListener(
      'pointerdown',
      (e) => {
        const el = (e.target as HTMLElement | null)?.closest(INTERACTIVE);
        if (!el || (el as HTMLButtonElement).disabled) return;
        this.unlock();
        // Chi ha un suono proprio (fiche, chiusura modale, carta bloccata) lo
        // dichiara con `data-sfx="own"`: suonare anche il click generico
        // produrrebbe due attacchi sovrapposti per un solo gesto.
        if ((el as HTMLElement).dataset.sfx === 'own') return;
        sfxClick();
      },
      { capture: true }
    );

    // `pointerover` in cattura scatta di nuovo ogni volta che il puntatore
    // attraversa un figlio dello stesso pulsante (icona, etichetta, riflesso):
    // senza memoria dell'ultimo elemento, un solo passaggio suonava tre volte.
    let lastHover: Element | null = null;
    document.addEventListener(
      'pointerover',
      (e) => {
        if (!this.ready) return;
        // Al tocco `pointerover` scatta insieme al tap: col click sarebbero
        // due suoni per un dito. Il passaggio esiste solo col mouse.
        if ((e as PointerEvent).pointerType !== 'mouse') return;
        const el = (e.target as HTMLElement | null)?.closest(INTERACTIVE) ?? null;
        if (el === lastHover) return;
        lastHover = el;
        if (!el || (el as HTMLButtonElement).disabled) return;
        sfxHover();
      },
      { capture: true }
    );

    // Anche la tastiera deve sbloccare l'audio: chi naviga con Tab/Invio
    // non genera mai un pointerdown.
    window.addEventListener('keydown', () => this.unlock(), { once: true });

    // iOS Safari considera "gesto dell'utente" il RILASCIO del dito, non la
    // pressione: un AudioContext ripreso in `pointerdown` resta muto. Questi
    // ascoltatori coprono ogni tocco, anche sul canvas (fiche sul tappeto).
    const unlockOnRelease = () => this.unlock();
    window.addEventListener('touchend', unlockOnRelease, { capture: true, passive: true });
    window.addEventListener('pointerup', unlockOnRelease, { capture: true, passive: true });
  }
}

export const audio = new AudioManagerImpl();
