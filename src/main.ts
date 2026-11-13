/**
 * THE ROYAL MIRAGE — Punto di ingresso
 *
 * Sequenza di boot, in quest'ordine per una ragione precisa:
 *   1. font      → Pixi rasterizza il testo al momento della creazione:
 *                  se i font non sono pronti, i titoli restano col fallback
 *   2. renderer  → serve il canvas prima di poter cuocere texture
 *   3. scena     → le texture si cuociono dentro `enter()`, a tenda chiusa
 *   4. boot off  → solo quando c'e' davvero qualcosa da mostrare
 */

// L'ordine dei CSS è la cascata: token → componenti → schermate.
// Invertirlo farebbe vincere i token sui componenti che li specializzano.
import './ui/styles/tokens.css';
import './ui/styles/main.css';
import './ui/styles/shell.css';
import './ui/styles/menu.css';
import './ui/styles/panels.css';
import './ui/styles/lobby.css';
import { game } from './core/App';
import { scenes } from './core/SceneManager';
import { loadFonts } from './core/fonts';
import { AtmosphereScene } from './scenes/AtmosphereScene';
import { shell } from './ui/Shell';
import { setFpsMeter } from './ui/dom/FpsMeter';
import { installPlayTimeTracker } from './state/playTime';
import './ui/styles/hud.css';
import { setLanguage } from './i18n';
import { gsap } from 'gsap';
import { settings, actions, wallet, getState } from './state/store';
import { profileFor } from './state/settings';
import { setBakeResolution } from './art/textureCache';
import { installPaletteVars } from './art/cssVars';
import { bus } from './state/events';
import { ACHIEVEMENTS } from './state/achievements';
import { audio } from './audio/AudioManager';
import { audioCtx } from './audio/synth';

const bootEl = document.getElementById('boot');
const statusEl = document.getElementById('boot-status');

function status(text: string): void {
  if (statusEl) statusEl.textContent = text;
}

function fatal(message: string, detail?: unknown): void {
  const panel = document.getElementById('fatal');
  const msg = document.getElementById('fatal-msg');
  const det = document.getElementById('fatal-detail');
  if (msg) msg.textContent = message;
  if (det) det.textContent = detail instanceof Error ? (detail.stack ?? detail.message) : String(detail ?? '');
  panel?.classList.add('show');
  bootEl?.classList.add('done');
  console.error('[fatal]', message, detail);
}

async function boot(): Promise<void> {
  try {
    // Lingua e qualita' salvate vanno applicate PRIMA di costruire qualunque
    // cosa: le etichette e le texture nascono con i valori attivi in quel momento.
    const s = settings();
    setLanguage(s.language);
    document.documentElement.lang = s.language;
    setBakeResolution(profileFor(s).bakeResolution);
    // I colori del DOM derivano dalla palette TS: vanno installati prima che
    // qualunque schermata calcoli i propri stili.
    installPaletteVars();

    status('Caricamento caratteri');
    await loadFonts();

    status('Inizializzazione renderer');
    const stageEl = document.getElementById('stage');
    if (!stageEl) throw new Error('Elemento #stage assente in index.html');
    await game.init(stageEl);
    console.info(`[render] backend attivo: ${game.backend.toUpperCase()}`);
    // Qualita', tetto FPS e contatore possono cambiare dalle impostazioni a
    // partita in corso: si applicano all'avvio e a ogni modifica. Il tetto
    // torna a 0 (illimitato) quando la qualita' lo toglie, non resta appeso.
    const applyRenderSettings = () => {
      const cur = settings();
      const profile = profileFor(cur);
      game.ticker.maxFPS = profile.fpsCap > 0 ? profile.fpsCap : 0;
      game.setColorGrade(profile.colorGrade);
      setFpsMeter(cur.showFps);
    };
    applyRenderSettings();
    bus.on('settings:changed', applyRenderSettings);

    status('Accensione delle luci');
    scenes.install();
    await scenes.goTo(() => new AtmosphereScene(), 'instant');

    // L'overlay si monta DOPO la scena: le sue schermate devono sovrapporsi
    // a un canvas che sta già disegnando, non a un rettangolo nero.
    status('Apertura della sala');
    shell.install();
    installPlayTimeTracker();

    status('Pronto');
    // Un frame di respiro perche' la prima immagine sia gia' sullo schermo
    // quando la schermata di boot sfuma: altrimenti si vede un nero.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    bootEl?.classList.add('done');
  } catch (err) {
    fatal(
      'Il renderer grafico non e’ disponibile. Serve un browser con WebGL2 (Chrome, Edge o Firefox aggiornati).',
      err
    );
  }
}

void boot();

// Diagnostica da console durante lo sviluppo.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).GO = {
    game,
    scenes,
    shell,
    audio,
    actions,
    /** Saldo e stato: il collaudo contabile legge da qui, non dall'HUD. */
    wallet,
    getState,
    bus,
    /** Ricompensa di un riconoscimento: serve al collaudo contabile. */
    achievementReward: (id: string) => ACHIEVEMENTS.find((a) => a.id === id)?.reward ?? 0,
    /** Stato del contesto audio: `running` dopo il primo gesto. */
    audioState: () => audioCtx()?.state ?? 'none',
    /** `GO.play('blackjack')` — entra subito in un gioco (collaudo). */
    play: (id: Parameters<typeof shell.devEnter>[0]) => shell.devEnter(id),

    /**
     * Fa scorrere il tempo delle animazioni in tempo REALE.
     *
     * GSAP, per non far "saltare" le animazioni dopo una pausa, di default
     * finge che un frame piu' lungo di mezzo secondo sia durato 33 ms
     * (`lagSmoothing`). In un browser normale e' una protezione invisibile;
     * in headless, dove il rendering e' software e il bake di una texture
     * blocca il frame per secondi, diventa il motivo per cui una mano di
     * blackjack che dura 3 s ne impiega 25: non e' lentezza del disegno, e'
     * il tempo di gioco che viene rallentato di proposito.
     *
     * Il collaudo chiama questa funzione subito dopo il boot, cosi' le sue
     * attese tornano a corrispondere ai secondi veri.
     */
    realTime: () => {
      gsap.ticker.lagSmoothing(0);
      return 'lagSmoothing disattivato';
    },
  };
}
