# The Royal Mirage

Un casinò in stile Las Vegas che si gioca nel browser, **solo con euro virtuali**.
Nessun pagamento, nessun conto, nessuna vincita reale: è un gioco di simulazione.

Il sito ricrea l'atmosfera di una sala sulla Strip di notte (velluto prugna, oro,
insegne luminose) e offre otto giochi da casinò con regole e probabilità vere,
dichiarate in sala.

---

## Cosa si può fare

### I giochi

| Gioco | Tipo | Ritorno teorico (RTP) |
|---|---|---|
| **Lucky Sevens** | Slot · 5 rulli, 20 linee, Wild espansivo, Ruota della fortuna | 96,2 % |
| **Hollywood Nights** | Slot · 1024 modi, giri gratis con moltiplicatore, Cascata | 96,0 % |
| **Diamond Royale** | Slot · Hold & Win con 4 jackpot, I Forzieri | 95,8 % |
| **Blackjack** | Carte · scarpa da 6 mazzi, il banco sta su 17 | 99,5 % |
| **Roulette** | Ruota · europea, zero singolo | 97,3 % |
| **Baccarat** | Carte · Punto Banco con tabellone Big Road | 98,9 % |
| **Video Poker** | Carte · Jacks or Better | 99,5 % |
| **Golden Chip** | Istantaneo · moltiplicatore dal vivo, esito verificabile | 99,0 % |

Ogni gioco ha un **tutorial** al primo ingresso (riapribile con «Guida») e un
**regolamento** con la tabella dei premi.

### I giochi bonus delle slot

Oltre ai giri gratis e all'Hold & Win, ogni slot ha un giochino interno. Escono
più o meno spesso quanto i giri gratis e la loro vincita media è già compresa
nell'RTP dichiarato: la tabella dei premi è rimasta identica, è cambiata solo la
composizione dei rulli. Ogni bonus è spiegato passo per passo nella scheda
«Vincite» della slot, con un esempio di calcolo.

- **Ruota della fortuna** (Lucky Sevens) — 3 simboli Ruota sui rulli 1, 3 e 5.
  La slot si gira e compare una ruota a 18 spicchi: 3 giri, e ogni moltiplicatore
  **moltiplica la vincita accumulata** (il primo si applica alla puntata: con 1 €
  puntato ×2 → 2 €, poi ×5 → 10 €). Ci sono anche gli spicchi NULLA (in quel giro
  non vinci niente), ALTRO GIRO (quel giro non si conta e ne guadagni uno: con 2
  giri rimasti ne hai 3) e STOP. Al primo giro gli spicchi escono quasi tutti con
  la stessa probabilità (i moltiplicatori grandi un po' meno); dal secondo giro
  conta quello che è uscito prima: dopo un giro scarso scatta la rimonta (un ×5 o
  più è più probabile e uno STOP meno), dopo un ×10 o più i premi alti si fanno
  rari. Vincita massima della ruota: 100 volte la puntata, in media circa 18.
- **Cascata** (Hollywood Nights) — 3, 4 o 5 Biglietti danno 8, 12 o 16 giri a
  cascata: le combinazioni vincenti esplodono, i simboli cadono, ne entrano di
  nuovi e il moltiplicatore sale a ogni cascata (×1 → ×2 → ×3 → ×5 → ×10). Quando
  un giro non vince non torna a ×1: scende di un solo gradino (da ×10 a ×5).
  Raramente un Biglietto sul rullo centrale aggiunge 5 giri.
- **I Forzieri** (Diamond Royale) — 4 o più Forzieri ovunque. La slot sale e
  compaiono 5 forzieri: se ne sceglie uno e si apre. Ogni forziere ha un
  moltiplicatore diverso della puntata (da ×1 a ×50); più Forzieri sui rulli,
  più ricchi i forzieri.

Anche l'Hold & Win di Diamond Royale ha la sua spiegazione passo per passo
nella scheda «Vincite», accanto a quella dei Forzieri.

Quando ne manca uno solo per aprire un bonus (o i giri gratis), il rullo
successivo frena in un unico movimento lungo e continuo e si fa attendere: è la
suspense delle slot vere.

### Le modalità

- **Carriera**: si parte con 100 € e si sale di rango (da Ospite a Leggenda della
  Strip) giocando. I ranghi danno premi e il bonus del giorno.
- **Gioco Libero**: 10.000 €, tutti i giochi sbloccati, ricarica automatica.
  Per provare senza conseguenze.
- **Sfida High Roller**: da 2.500 € bisogna arrivare a 25.000 €. Se il saldo scende
  sotto la puntata minima, la sfida è persa.

### Altro

- **Profilo** con statistiche per gioco (giri, puntato, vinto, ritorno effettivo),
  **tempo di gioco** totale (solo con la pagina visibile) e riconoscimenti da sbloccare.
- **Impostazioni**: lingua (italiano / inglese), qualità grafica, volume di musica
  ed effetti, movimento ridotto, contatore FPS. In Gioco Libero c'è anche il gruppo
  **Presentazione**, per le dimostrazioni: rende più frequenti vincite grandi,
  giri gratis, Hold & Win e i bonus speciali (ruota, cascata, forzieri).
- **Vincita minima 0,01 €** nelle slot: una combinazione vincente non paga mai 0,00 €.
- **Telefono**: home e sala funzionano in verticale, i tavoli in orizzontale.
  Si può aggiungere alla schermata Home come un'app (vedi [`docs/IPHONE.md`](docs/IPHONE.md)).
- **Tasto Indietro del browser**: riporta alla schermata precedente
  (tavolo → sala → home) invece di chiudere il sito.

I progressi (saldo, rango, statistiche, impostazioni) sono salvati **nel browser**
di chi gioca (`localStorage`): non c'è un server né un account.

---

## Come funziona

È un sito statico: tutto gira nel browser, senza backend.

- **TypeScript + Vite**: il codice sorgente sta in `src/`, Vite lo prepara per il browser.
- **PixiJS** (WebGPU o WebGL2) disegna i tavoli, i rulli e lo sfondo animato in un `<canvas>`.
- **HTML e CSS** sopra il canvas per home, sala, barre di gioco, finestre e messaggi.
- **GSAP** per le animazioni, **Zustand** per lo stato (saldo, rango, impostazioni).
- **Musica ed effetti** sono sintetizzati in tempo reale con la Web Audio API.

### Organizzazione del codice

```
src/
├── main.ts            avvio: caratteri, renderer, prima scena, interfaccia
├── core/              renderer Pixi (App) e gestione delle scene (SceneManager)
├── scenes/            lo sfondo animato della sala
├── games/             un gioco per cartella (regole + scena), registry.ts li elenca
│   └── slots/engine/  motore delle slot: rulli, linee, bonus (bonus.ts), simulazione dell'RTP
├── state/             saldo, modalità, ranghi, riconoscimenti, salvataggio
├── ui/                home, sala, finestre, tutorial, stili CSS
├── art/               palette dei colori, immagini, texture
├── audio/             musica ed effetti sonori
├── fx/                transizioni, particelle, ambienti dello sfondo
└── i18n/              testi in italiano e inglese
tests/                 test automatici (Vitest)
tools/                 script per asset, collaudi e taratura delle slot
docs/                  stato dei lavori, crediti degli asset, guida iPhone
```

### Regole di qualità

Il file [`CONSTRAINTS.md`](CONSTRAINTS.md) elenca le regole decise con il committente,
ognuna controllata da un test. Le principali:

- **I soldi sono sempre in centesimi interi**, mai numeri con la virgola (100,00 € = `10000`).
- **Puntata minima 0,10 €**, massima il saldo disponibile.
- **I colori nascono tutti da `src/art/palette.ts`**: nessun colore scritto a mano altrove.
- **Le transizioni restano sotto i 350 ms per fase.**
- **L'RTP dichiarato in sala è vero**: un test simula milioni di giri per ogni slot.

---

## Avviarlo in locale

Serve [Node.js](https://nodejs.org) (versione LTS).

```bash
npm install
npm run dev
```

Poi si apre **http://localhost:5273**.

> Aprire `index.html` con un doppio clic **non funziona**: il codice va prima
> preparato da Vite, quindi serve sempre `npm run dev` (o la build).

### Comandi utili

| Comando | A cosa serve |
|---|---|
| `npm run dev` | sito in sviluppo, si aggiorna da solo a ogni modifica |
| `npm run dev:lan` | come sopra, raggiungibile anche dal telefono sulla stessa Wi-Fi |
| `npm run build` | crea la versione finale in `dist/` |
| `npm run preview` | prova in locale la versione finale |
| `npm run typecheck` | controlla gli errori di TypeScript |
| `npm test` | esegue tutti i test (la simulazione RTP delle slot richiede qualche minuto) |

---

## Pubblicazione

Il sito è pubblicato su **Vercel**: a ogni commit sul ramo `main` Vercel esegue
`npm run build` e pubblica la cartella `dist/`. Non serve nessuna configurazione
in più.

---

## Crediti

Icone 3D: Microsoft Fluent Emoji (licenza MIT). Fotografie e caratteri: elenco
completo con le licenze in [`docs/CREDITS.md`](docs/CREDITS.md).
