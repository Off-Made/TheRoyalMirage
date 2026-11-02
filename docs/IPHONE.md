# The Royal Mirage su iPhone

Il casinò è pronto per il telefono:
- **Home e Sala Giochi** funzionano sia in verticale sia in orizzontale.
- **I tavoli** si giocano in **orizzontale**: l'HUD ha pulsanti a misura di dito, rispetta la tacca e l'indicatore Home e il tavolo si adatta allo spazio fra le barre. Se tieni il telefono in verticale compare l'invito a ruotarlo.
- Si può **aggiungere alla schermata Home** come un'app, con icona RM e apertura a tutto schermo.

Ci sono due modi per aprirlo sull'iPhone.

---

## A. Dalla Wi-Fi di casa (PC acceso)

1. Il PC e l'iPhone devono essere sulla **stessa rete Wi-Fi**.
2. Sul PC, nella cartella del progetto:
   ```
   npm run dev:lan
   ```
   Vite stampa due indirizzi. Ti serve quello **Network**, per esempio
   `http://192.168.1.23:5273/`.
3. Apri quell'indirizzo in **Safari** sull'iPhone.

Se l'iPhone non si collega:
- La prima volta Windows chiede se consentire Node.js sulle reti private: rispondi **Consenti**.
- Su un **PC aziendale** il firewall o la rete dell'ufficio possono bloccare il collegamento. In quel caso prova da casa, oppure usa la strada B.
- Per provare la versione definitiva al posto di quella di sviluppo: `npm run preview:lan`, che usa la porta 4173.

## B. Online (raggiungibile ovunque, anche col PC spento)

Il modo più semplice, senza strumenti da installare:
1. `npm run build`: crea la cartella `dist/`.
2. Apri <https://app.netlify.com/drop> e trascina la cartella **`dist`** nella pagina. Serve un account Netlify gratuito.
3. Netlify ti dà un indirizzo `https://…netlify.app`: aprilo in Safari sull'iPhone.

Il sito pubblicato è raggiungibile da chiunque abbia il link. Per aggiornarlo, rifai `npm run build` e trascina di nuovo `dist`.
Se lo pubblichi in una sottocartella (per esempio GitHub Pages `utente.github.io/progetto/`), prima va impostato `base` in `vite.config.ts`. Con Netlify non serve.

---

## Aggiungerlo alla schermata Home

1. Apri il casinò in **Safari**.
2. Tocca **Condividi** (il quadrato con la freccia) e poi **Aggiungi alla schermata Home**.
3. Conferma il nome "Royal Mirage".

Dall'icona si apre a tutto schermo, senza barre del browser: in orizzontale guadagni lo spazio che altrimenti occuperebbero.

## Da sapere

- **Salvataggi**: saldo e progressi vivono nel browser e sono legati all'indirizzo. Il gioco aperto da `192.168.…`, quello su Netlify e quello sul PC hanno salvataggi separati.
- **Audio**: su iPhone parte al primo tocco, come vuole Safari. Se il telefono è in modalità silenziosa (interruttore laterale) Safari non riproduce i suoni.
- **Collaudo da PC**: `node tools/qa-iphone.mjs` (col server acceso) emula un iPhone 15 Pro e salva gli screenshot in `shots/iphone/`.
- **Icone dell'app**: le genera `node tools/build-app-icons.mjs` dalla fiche RM (`src/art/houseChip.ts`) e finiscono in `public/assets/app/`.
