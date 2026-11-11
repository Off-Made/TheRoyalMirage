# THE ROYAL MIRAGE — Stato dei lavori

## Punto di ripresa — 11/11/2026 (pomeriggio): ULTIME RIFINITURE, secondo giro di appunti

Piano: `~/.claude/plans/voglio-andare-ad-attuare-wise-ladybug.md`. Verifica: `tsc` pulito · **466/466 test**
(slot RTP compreso) · collaudo a schermo `node tools/qa-polish.mjs <porta>` tutto OK, nessun errore in console.

| Area | Cosa | File |
|---|---|---|
| Slot: regola | si vince con 3+ simboli uguali su rulli ADIACENTI da qualunque rullo (1-2-3, 2-3-4, 3-4-5…), linee e ways; `WinLine.startReel`; la linea piena parte dal rullo giusto, tratteggio prima e dopo | `engine/evaluate.ts` (`MIN_RUN`), `SlotScene.drawWins`, `view/strings.ts` |
| Slot: ritaratura | premi da 3/4 ridotti (5 di fila quasi intatti), Diamond Royale con pile da 3 su K/Q/J/T (hit rate 62%→56%); RTP col seme del test: 96,33 / 95,94 / 95,86. Strumento: `tools/tune-adjacent.ts` | `machines/*.ts` |
| Slot: tempi | giro normale ~+60%; il vecchio normale è ora il Turbo | `SlotScene.ts` `SPIN_T` |
| Presentazione | 3 interruttori (vincite grandi ≥25×, giri gratis, Hold & Win) in fondo alle Impostazioni SOLO in modalità Libera; ~1 giro su 3 ri-estratto finché soddisfa il criterio (max 2000 tentativi). Motore e RTP intatti | `games/slots/demo.ts`, `SettingsModal.ts`, `settings.ts` |
| Golden Chip | dopo l'incasso il volo PROSEGUE fino al crash (il committente ci ha ripensato): saldo accreditato subito, pallino verde "×N" sulla curva, schianto finale con messaggio "Incassato a ×N — schianto a ×M" | `CrashScene.cashOut/boom/endFlight` |
| Baccarat | targhetta con l'importo per area (la pila si ricompone nei tagli e sembrava sostituire); "Annulla" = ultima fiche, il vecchio "Annulla" ora è "Ritira tutto"; tutorial "Il tabellone" inquadra i pannelli (prima: Graphics vuota → angolo in alto) | `BaccaratScene.ts`, `board.ts` |
| Tasti | S/P non aprono Impostazioni/Profilo dentro un gioco (erano Stai/Split del blackjack) | `ui/Shell.ts` |
| Video poker | pulsante "Tocco: Tieni/Scarta" al tavolo, attivo solo a mano ferma | `VideoPokerScene.ts` |
| XP | `max(1, round(1,25 + log2(1 + €)))` ≈ 1/8 di prima: massimo in ~3-4 settimane; soglie invariate, nessuna migrazione | `progression.ts` |
| Profilo | storico a 6 righe | `ProfileModal.ts` |

Tutorial: il pulsante "Avanti" NON è stato toccato (un sito non può spostare il mouse; il committente ha scelto di lasciarlo così).

## Punto di ripresa — 11/11/2026: RIFINITURA dagli appunti di collaudo del committente

Piano approvato: `~/.claude/plans/questo-il-mio-kind-walrus.md`. Verifica: `tsc` pulito ·
**457/457 test** (`npx vitest run --exclude "GoldenOasis-backup-pre-royal-mirage/**"`: senza
l'esclusione vitest raccoglie anche i test del backup, che falliscono da sempre).

| Area | Cosa | File |
|---|---|---|
| Golden Chip | storico verde/rosso dall'ESITO del giocatore (prima: soglia ×2 sul crash); sotto la pillola il moltiplicatore incassato; indicatore col solo numero del crash accanto al moltiplicatore, resta fino al decollo successivo. Volo e probabilità invariati (scelta del committente) | `crash/history.ts`, `CrashScene.ts` |
| FPS | "Mostra FPS" ora mostra un badge (prima il setting non era letto da nessuno); tetto FPS riapplicato a ogni cambio di qualità | `ui/dom/FpsMeter.ts`, `main.ts` |
| Slot: velocità | arresto con `stopPlan` (nastro riposizionato a 3 celle dallo stop: prima fino a un giro intero) e arresti in cascata; tempi in `SPIN_T`; tocco sui rulli = stop; Turbo = setting `fastPlay`; vincite ~40% più brevi | `ReelView.ts`, `SlotScene.ts`, `WinPresenter.ts` |
| Slot: chiarezza | linea piena solo sul tratto pagato + tratteggio + "3 DI FILA"; testo HUD sempre presente; regolamento con "Come si vince" (schema) e premi in € alla puntata attuale | `SlotScene.ts`, `slots/view/strings.ts` |
| Hold & Win | respin con mini-rulli veri per cella, scritta "RESPIN n", riepilogo monete + jackpot | `SlotScene.playHoldAndWin` |
| Blackjack | mosse grandi al centro della barra (`hud.actions`, `setActing`), scorciatoie C/S/R/D | `GameHud.ts`, `BlackjackScene.ts`, `hud.css` |
| Video poker | impostazione Tieni/Scarta (`vpTapMode`), riga "× 5 monete = 20,00 € a mano" (`betNote`), avviso una tantum | `VideoPokerScene.ts`, `machine.holdAll()`, `settings.ts` |
| XP | 10 + 8·log2(1 + puntata/1 €) a GIRO (niente XP per raddoppi/split); soglie fino a 1,7 M, premi ridotti; salvataggio v3 con migrazione (rango conservato) | `progression.ts`, `save.ts`, `store.ts` |
| Statistiche | per gioco (giri, puntato, vinto, netto, max, ritorno effettivo vs teorico) nel profilo; ARRAY e non mappa perché `deepMerge` tiene solo le chiavi dei default | `wallet.ts` `bumpStats`, `ProfileModal.ts` |
| Tutorial | velo SVG con ritaglio + fumetto, parte al primo ingresso (`tutorialsSeen`), pulsante "Guida", reset dalle Impostazioni; passi per gioco in `tutorialGame()` | `ui/dom/Tutorial.ts`, `GameScene.ts` |

### Da fare (fase successiva, chiesta dal committente ma rimandata)
- Giochi bonus interni alle slot (pick-me, ruota): nuovo `XxxRule` in `slots/engine/types.ts` + ritaratura RTP.
- Texas Hold'em contro bot. Virtuali (cavalli, levrieri, calcio) con esito indipendente dalle puntate.

### Trappole
- Il tutorial NON parte da solo sotto puppeteer (`navigator.webdriver`), altrimenti blocca i collaudi;
  per collaudarlo: `localStorage['rm:force-tutorial'] = '1'`.
- In `page.evaluate` non restituire la promessa di `GO.slot.spin()`: puppeteer la attende fino a fine giro.

## Punto di ripresa — 02/11/2026: TELEFONO (iPhone) + ritocchi

- **Telefono** (vedi `docs/IPHONE.md`): `html.is-compact` quando il lato corto è <= 500 px (`core/App.ts`).
  L'HUD passa a misure in px reali (`hud.css` § TELEFONO, `--vp-u` = 1 px CSS in px di design) e
  `GameScene.fitWorld()` adatta il mondo alla fascia fra le barre: nessun gioco conosce l'HUD.
  I tavoli si giocano in orizzontale; in verticale c'è `.go-rotate`, ma solo `html.in-game`.
  App sulla Home: `public/manifest.webmanifest`, meta Apple, icone `tools/build-app-icons.mjs`.
  Audio iOS: sblocco al rilascio del dito (`touchend`/`pointerup`).
- **Bug corretto**: `App.layout()` divideva `renderer.width` per la risoluzione. In Pixi 8 è già in
  px CSS, quindi su ogni schermo con dpr > 1 il gioco veniva a metà (o a un terzo su iPhone).
- Sfondo e veli a tutta finestra (`game.screenRect`), crash rinominato **Golden Chip**, transizione `chip`,
  click Pixi riparati (`#overlay > .design-space`). Collaudi: `tools/qa-click.mjs`, `qa-iphone.mjs`.

## Punto di ripresa — 29/10/2026 sera: RIDISEGNO "THE ROYAL MIRAGE" (Las Vegas)

Richiesta: abbandonare il tema deserto/Emirati, nuovo marchio **The Royal Mirage**,
casino' americano moderno (Strip + Hollywood). Gameplay, saldo, regole e test di
logica NON toccati. Direzione approvata dal committente: velluto prugna, oro,
rosso marquee, neon solo come segnale; Big Shoulders Display (+ Inline per il
marchio) e Manrope. Vincoli aggiornati in `CONSTRAINTS.md` (1, 2, 7).

Verifica a fine sessione: `tsc` pulito · **439/439 test** (15 file; +111 guardiani
di colore/contrasto) · `npm run build` OK. Screenshot: `shots/rm-*.png`.
Copia di sicurezza pre-ridisegno: `Desktop/GoldenOasis-backup-pre-royal-mirage/`.

| Area | Cosa | File |
|---|---|---|
| Token | palette nuova (`plum`, `gold`, `red`, `neon`, `text`, `felt`, `chip`, `tier`, `accent`), `contrast()` WCAG | `art/palette.ts` |
| Design system | superfici, bordi, gradienti di materiale, glow, scala tipografica, spazi | `ui/styles/tokens.css` |
| Asset | foto Commons + Fluent Emoji 3D → WebP (~0,9 MB) | `tools/build-assets.mjs`, `public/assets/`, `docs/CREDITS.md` |
| Caricatore | `iconUrl/photoUrl`, `preloadImages`, `imageTexture` | `art/images.ts` |
| Sfondi Pixi | una foto per ambiente + velo + alone (`salon`, `strip`, `skyline`) | `fx/environment/casinoEnv.ts` |
| Home | insegna a lampadine, CTA, card di stato, vetrina 4 tavoli; responsive | `ui/dom/MainMenu.ts`, `TopBar.ts`, `menu.css` |
| Sala | banner Bellagio, filtri, copertine composte (icone 3D + segno) | `ui/dom/Lobby.ts`, `GameCover.ts`, `lobby.css` |
| Slot | cabinet in lacca con lampadine e insegna; simboli = icone 3D / tipografia metallica | `games/slots/view/frame.ts`, `art/slotSymbols.ts` |
| Nomi | Lucky Sevens, Hollywood Nights, Diamond Royale, Golden Chip (ex Neon Rocket, rinominato 02/11 con la fiche d'oro al posto del razzo; id interni invariati) | `i18n/*`, `machines/*` (solo label/glyph) |
| Carte | semi a inchiostro, figure tipografiche, dorso cremisi RM | `games/cards/art.ts` |
| HUD | console in vetro scuro, pulsante di gioco rosso con anello d'oro | `ui/styles/hud.css` |
| Crash | razzo 3D al posto del falco, curva al neon | `games/crash/*` |

### Trappole incontrate
- `img` con attributi `width/height` + `width:%` in CSS si deforma: serve `height:auto; aspect-ratio:1`.
- Le scene ora attendono le foto in `enter()`: `update()` puo' arrivare prima → guardie su `backdrop`/`presenter`.
- Python in heredoc Git Bash: `` diventa backspace. Script con regex vanno scritti su file.
- La chiave di salvataggio resta `golden-oasis:save` di proposito (non perdere i salvataggi).

### Da fare
- Video poker: la cornice esterna del cabinet legge ancora molto chiara (filo d'oro spesso).
- Il tavolo Pixi dei giochi resta 16:9 in letterbox: in verticale su telefono i giochi sono piccoli
  (home, sala, modali invece sono responsive).
- Commenti interni con riferimenti al vecchio tema in alcuni file di gioco (non visibili).

## Sessione precedente — 29/10/2026 pomeriggio: RIDISEGNO DIURNO (superato)


## Punto di ripresa — 29/10/2026 pomeriggio: RIDISEGNO DIURNO + EUROPEO

Richiesta: tema "mezzogiorno negli Emirati" (luminoso, niente fondi scuri, niente
sipario), saldo 100 €, puntata libera, ALL-IN. Vincoli e guardiani: `CONSTRAINTS.md`.

Verifica a fine sessione: `tsc` pulito · **328/328 test** (15 file) · `npm run build` OK.
Screenshot di controllo: `shots/day-*.png` (grafica), `shots/eco-*.png` (economia).

| Area | Cosa | File principali |
|---|---|---|
| Palette | `night` rimossa → `sky`, `sunset`, `ink`; gemme e oro piu' luminosi; `shade()` scurisce verso l'inchiostro | `art/palette.ts` |
| Design system | livello semantico `--surface/--text/--border/--action/--danger`, `.go-label/.go-num/.go-slot` | `ui/styles/tokens.css` |
| Fondali | deserto, palazzo e terrazza del Crash convertiti a giorno (sole, nuvole, mare turchese, marmo) | `art/scenery/*`, `fx/environment/*` |
| Velo `Backdrop.dim` | ora AVORIO: schiarisce invece di scurire | `fx/Backdrop.ts` |
| Transizioni | `curtain`, `doors`, `palaceDoor` cancellati; `iris` sostituita (02/11) da `chip`, fiche RM che ruota su velo rosso, usata per ogni cambio pagina; `fade` 160/220 ms | `fx/transitions/*` |
| Lobby | banner promo, sezione "piu' giocati" dallo storico reale ("In evidenza" se vuoto), card grandi | `ui/dom/Lobby.ts`, `lobby.css` |
| Giochi | rulli in pergamena, smalti dei medaglioni luminosi, panni verde/cobalto/turchese, video poker in lacca avorio | `games/**`, `art/symbols/*` |
| Testo Pixi | preset `label/value/small` in inchiostro; `numeric` in Archivo Black | `games/common/text.ts` |
| Economia | centesimi interi, `MIN_BET` 10, `parseMoney/formatMoney`, `clampBet`, ALL-IN con moltiplicatore (video poker) | `state/wallet.ts`, `state/store.ts` |
| Plancia | campo libero + MIN · ½ · ×2 · ALL-IN; tetto VIP rimosso | `games/common/GameHud.ts`, `hud.css` |
| Saldo esaurito | schermata dedicata "Ricomincia con 100,00 €" (sostituisce rebuy con cooldown) | `ui/dom/BrokeModal.ts` |
| Salvataggio | `SAVE_VERSION` 2: i portafogli in fiche ripartono, progressione conservata | `state/save.ts` |

### Trappole incontrate (per non ripeterle)
- `blendMode = 'screen'` sbianca su fondo chiaro (alone del palazzo, alone della citta').
- In un `flex column` i figli si comprimono: la lobby ora ha `.go-lobby > * { flex: 0 0 auto }`.
- `z-index` negativo dentro un contesto di impilamento dipinge SOPRA lo sfondo della radice.
- Heredoc bash lunghi con apici si rompono in Git Bash: scrivere gli script su file.

### Da fare
- `--mode-accent` in `panels.css` usa `gold-core` come colore di testo: contrasto basso, va
  corretto nel TS che lo imposta (`ModesModal.ts`).
- Toast multipli sopra la schermata del saldo esaurito possono coprirne il titolo per qualche
  secondo (si verifica solo con molti eventi simultanei).
- Le sedute di velluto del palazzo si intravedono come fasce rosate in basso nella lobby.


Piano originale: `~/.claude/plans/devi-realizzare-un-gioco-wise-cat.md`.
Piano di ripresa (Fase 3 in poi): `~/.claude/plans/ricomincia-hashed-spark.md`.

Avvio: `npm run dev` (porta 5273) · Test: `npm test` · Tipi: `npx tsc --noEmit`

## Sessione precedente — 29/10/2026 (mattina)

Piano di riferimento: `~/.claude/plans/master-prompt-per-hazy-avalanche.md`
(blocchi 1-15). Fotografia verificata a fine sessione:

- `npx tsc --noEmit` **pulito** · `npm test` **262/262 verdi** (13 file) · `npm run build` **OK** (6,0 s)
- **Nessuna scena stub**, nessun avviso di deprecazione Pixi a runtime nel Crash

### Fatto in questa sessione
| Area | File | Verifica |
|---|---|---|
| **Nuovo ambiente: terrazza sullo skyline** (cielo con smog acceso, stelle solo allo zenit, alone urbano, 3 bande di torri a basi crescenti, balaustra in controluce) | `art/scenery/terrace.ts`, `fx/environment/terraceEnv.ts` | `shots/t-crash-*.png` |
| Il Crash ora sta sulla terrazza (`backdropEnv = 'terrace'`, dim 0,52 → 0,40) | `games/crash/CrashScene.ts` | `shots/t-crash-mid.png`: falco in volo sopra le torri |
| Sanate 6 chiamate a `marbleFill`/`brassFill`/`starPath` scritte contro un'API inesistente (ritornano un gradiente, non dipingono: senza `fill()` la balaustra era invisibile) | `art/scenery/terrace.ts` | tsc |
| Passo dei balaustri 58 → 34 px: la texture viene stirata oltre i 1920 di design e a passo largo leggeva come un tavolato | `art/scenery/terrace.ts` | `shots/t-rail.png` |
| Pastiglie del tabellone «ultimi voli» in un `Container` invece che figlie di un `Graphics` (deprecato in Pixi 8) | `games/crash/CrashScene.ts` | console pulita |
| `tools/shot.mjs --tap x,y`: click a coordinate nello spazio di design, per i comandi che sono testo Pixi dentro il canvas e nessun selettore DOM raggiunge | `tools/shot.mjs` | usato per far volare il falco |

### Due voci del vecchio stato erano sbagliate — chiarite
- **`coversEnabled = false` in `Lobby.ts` NON e' una copertina spenta**: e' lazy-loading,
  si accende in `show()` perche' le texture si cuociano solo quando la lobby si apre.
  Le 8 copertine sono accese e verificate a schermo (`shots/t-lobby3.png`).
- **Il blocco 2i era gia' fatto**: Blackjack, Baccarat, Roulette, Video Poker e
  Sheikh's Fortune hanno `backdropEnv = 'palaceInterior'` (dim 0,40-0,46).

### Collaudo degli 8 giochi — secondo blocco della sessione
`node tools/qa-games.mjs [gioco...]` (gia' esistente, reso affidabile oggi).

| Gioco | Contabilita' | Uscita e rientro |
|---|---|---|
| Golden Oasis, Desert Falcon, Sheikh's Fortune | ok | ok |
| Blackjack | ok | ok |
| Roulette | ok (giocato 20, vinto 20) | ok |
| Baccarat | ok | ok |
| Video Poker | ok (giocato 50, vinto 100) | ok |
| Crash | ok (volo + incasso) | ok |

**Il verdetto su tutti e 8 in un colpo solo non e' stato rifatto**: il
processo e' stato interrotto dal sistema per memoria scarsa. I risultati
sopra vengono da tre lanci parziali, tutti verdi.

#### Nessuno dei tre "difetti" del primo giro era reale
Blackjack «mano bloccata», Roulette «nessuna giocata», Video Poker «appeso»
erano la STESSA causa: in headless il bake software delle texture dilata una
giocata da 3 s a 30 s, e il collaudo dormiva a tempo fisso. Correzioni al
tool, che ora non dipende dalla velocita' della macchina:

| Correzione | Perche' |
|---|---|
| `waitSettle()` attende l'evento `wallet:settle` | un `sleep` tarato a mano fallisce sulla giocata piu' lenta |
| `waitPhase('hold')` attende la fase della scena | la prima mano del video poker cuoce 52 facce di carta |
| `call()` solleva un errore su «metodo assente» | un refuso nel tool si leggeva come un bug del gioco |
| `GO.realTime()` disattiva il `lagSmoothing` di GSAP | GSAP finge che un frame > 500 ms sia durato 33 ms: in headless rallenta di proposito il tempo di gioco |
| `shot.mjs --dom <regex>`, `--tap x,y`, `--probe <js>`, cattura di `unhandledrejection` | i comandi sono DOM con `text-transform: uppercase` (il selettore `text/` cerca il testo vero e non li trova); `pageerror` non vede le promise rifiutate |

#### Un difetto vero, trovato leggendo il codice
`warmCardTextures()` in `games/cards/art.ts` esisteva con lo scopo scritto nel
commento — «da invocare nel tick della scena a riposo» — e **nessuno la
chiamava**: ogni faccia si cuoceva nel frame in cui la carta partiva dal
sabot. Ora Blackjack, Baccarat e Video Poker la chiamano nel `tick` a tavolo
fermo (2 carte per frame). Misurato in headless: le prime carte arrivano in
meta' tempo.

### Da fare, in ordine
1. `node tools/qa-games.mjs` su tutti e 8 in un colpo solo (serve memoria libera)
2. Grading cromatico: screenshot prima/dopo in qualita' alta (flag `colorGrade`)
3. `node tools/audio-live.mjs` a codice fermo (mood per gioco, `silence`, mute)
4. Modale «provably fair» del Crash: impaginazione mai chiusa dall'agente D
5. Relazione finale all'utente

## Fasi

| # | Fase | Stato |
|---|---|---|
| 0 | Scaffold (Vite, Pixi, SceneManager, font) | ✅ |
| 1 | Fondazione visiva (palette, materiali, scenografia deserto, particellari) | ✅ |
| 2 | Shell: stato, i18n, audio, menu, lobby, modali | ✅ |
| 3 | Framework giochi + motore slot + Golden Oasis | ✅ |
| 4 | Desert Falcon + Sheikh's Fortune | ✅ collaudati (contabilita', uscita, rientro) |
| 5 | Carte: Blackjack, Baccarat, Video Poker | ✅ collaudati |
| 6 | Roulette | ✅ collaudata |
| 7 | Crash | 🟡 scritto e collaudato sulla terrazza, modale fair da chiudere |
| 8 | Polish: riconoscimenti ✅, integrazione, audio, prestazioni | ⏳ |

## Come si aggiunge un gioco

1. Scena in `src/games/<id>/<X>Scene.ts`, estende `games/common/GameScene`
   (sfondo, HUD, presentazione vincite, uscita sicura gia' inclusi)
2. In `src/games/registry.ts`: `scene: () => import(...).then(m => new m.XScene())`
3. Puntate SOLO via `this.placeBet(n)` → `this.settle(bet, payout)`;
   `roundActive = true` fra le due, e `resolvePending()` per l'uscita a meta'
4. Stringhe in un dizionario locale `defineStrings({ it, en })` (games/common/strings.ts)
5. Momenti speciali: `bus.emit('game:event', { game, kind })` → riconoscimenti

Una slot nuova e' solo un `MachineDef` (`games/slots/machines/`) + un `SlotTheme`
passato a `SlotScene` (vedi `games/goldenOasis/GoldenOasisScene.ts`). Il test
RTP copre in automatico ogni macchina registrata in `machines/index.ts`.

## Strumenti di sviluppo

- `node tools/shot.mjs --size 1280x720 --wait 3500 --eval "GO.play('goldenOasis')" --sleep 4000 --snap shots/a.png`
  — passi in ordine (`--click`, `--tap`, `--eval`, `--sleep`, `--snap`); stampa gli errori di console.
  `--tap 1716,998` clicca a coordinate nello spazio di DESIGN (1920x1080): serve per i
  comandi dei giochi, che sono testo Pixi dentro il canvas e non hanno selettore DOM.
  In headless il rendering e' software (~5 fps) e il tempo di gioco scorre ~6x piu' lento.
- `GO.play('<id>')` entra in un gioco; `GO.slot.want = (o) => o.free.length > 0` forza l'esito della prossima giocata (solo DEV).
- `npx vite-node tools/sim-slot.ts 20000000 goldenOasis` — misura l'RTP di una slot.
- `dev/symbols.html?ids=W,S,F` — foglio di anteprima dei simboli.
- `node tools/qa-games.mjs [gioco...]` — collaudo contabile degli 8 giochi nel browser vero:
  saldo = iniziale - giocato + vincita + premi, poi uscita e RIENTRO (le fughe di stato si
  vedono alla seconda partita, non alla prima). Attende eventi e fasi, non secondi.
- `node tools/music-check.mjs` — renderizza offline ogni atmosfera e misura picco/RMS (esce 1 se clippa).
- `node tools/audio-live.mjs` — audio nel gioco vero: sblocco, mood per scena, silenzio.

## Numeri verificati

| Gioco | RTP dichiarato | Misurato |
|---|---|---|
| Golden Oasis | 96,2% | 96,238% ± 0,156 (20M giri) · giri gratis 1/194 · hit 33% |
