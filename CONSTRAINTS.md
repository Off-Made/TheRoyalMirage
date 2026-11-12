# The Royal Mirage — Vincoli di qualità

Regole decise col committente. Ognuna ha un **guardiano**: un test che fallisce
se la regola viene violata. Abbassare una soglia o disattivare un guardiano
richiede una decisione esplicita del committente, non di chi scrive il codice.

| # | Vincolo | Guardiano |
|---|---|---|
| 1 | **Mezzanotte sulla Strip** (deciso col committente il 29/10/2026, sostituisce il "tema diurno"): fondo velluto prugna, oro, rosso marquee; il neon solo per segnalare. Ogni ruolo di testo regge 4,5:1 (WCAG AA) su tutte le superfici; testo su oro ≥ 7:1. | `tests/palette-sync.test.ts` → *il testo strong/soft supera 4.5:1…*, *il testo attenuato…*, *il testo sull'oro…* |
| 2 | **Nessun colore fuori dai token**: niente esadecimali `0x…`, `'#…'` o `rgba(` con numeri in nessun `.ts` (tranne `src/art/palette.ts`) e in nessun `.css`. Le ombre scuriscono verso il prugna (`shade()`), mai verso il nero. | `tests/palette-sync.test.ts` → *nessun colore fuori dai token* (un caso per file, piu' un controllo che il guardiano non passi a vuoto) |
| 3 | **Un colore, una fonte**: i colori nascono in `src/art/palette.ts`; il CSS usa token o semantiche di `tokens.css`. | `tests/palette-sync.test.ts` (variabili inesistenti, copie manuali, parentesi sbilanciate) |
| 4 | **Nessun sipario**: transizioni sotto i 350 ms per fase (`fade`, `chip`). | `src/fx/transitions/index.ts` è l'unico catalogo |
| 5 | **Denaro in centesimi interi**, mai float. 100,00 € = `10_000`. | `tests/money.test.ts`, `tests/store.test.ts` |
| 6 | **Puntata libera**: minimo 0,10 €, massimo il saldo. Nessun altro tetto. | `tests/store.test.ts` → *il tetto è il saldo intero, non il massimale del rango* |
| 7 | **Niente scenografie disegnate**: le figure sono foto o icone 3D con licenza (`docs/CREDITS.md`), composte con tipografia e gradienti di materiale. Nessun paesaggio a livelli SVG/CSS, nessuna illustrazione tracciata nel codice. | revisione; gli asset passano da `tools/build-assets.mjs` |
| 8 | **Un selettore, un proprietario**: `.go-btn` e `.go-panel` stanno in `shell.css`; `tokens.css` contiene solo token. | revisione |

## Perché 0,10 € di minimo (e non 0,01 €)

Le slot dividono la puntata fra 20-25 linee e arrotondano il premio al centesimo
una sola volta. Sotto i 10 centesimi l'arrotondamento azzererebbe una parte
significativa delle vincite piccole, e il ritorno teorico mostrato in sala
smetterebbe di essere vero. Il minimo protegge l'RTP dichiarato; non limita il
giocatore verso l'alto.

**Vincita minima 0,01 €.** Lo 0,10 € basta per Lucky Sevens (20 linee), ma non
per le slot a combinazioni (Hollywood Nights, Diamond Royale), che dividono la
puntata per 50: a 0,10 € la puntata base vale 0,2 centesimi e i premi minori
(3 Dieci, 3 J/Q, 3 K/A) valgono frazioni di centesimo. Per questo una giocata
vincente paga sempre almeno 0,01 € (`payoutCents` in `slots/engine/spin.ts`);
oltre il mezzo centesimo l'arrotondamento resta quello di sempre. A puntate
molto basse simboli diversi possono quindi pagare lo stesso centesimo: e' il
limite dei centesimi interi, scelto dal committente al posto di una puntata
minima piu' alta per le due slot. Guardiano: `tests/minWin.test.ts`.
