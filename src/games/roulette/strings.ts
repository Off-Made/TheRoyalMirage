/**
 * THE ROYAL MIRAGE — Stringhe della roulette
 *
 * Il tappeto cotto in texture usa solo diciture neutre (numeri, "2:1",
 * PAIR/IMPAIR della tradizione francese): una texture non si ritraduce al
 * cambio di lingua. Tutto cio' che deve cambiare lingua vive qui, in DOM o
 * in testo Pixi rigenerato.
 */

import { defineStrings } from '@/games/common/strings';

export const rs = defineStrings({
  it: {
    spin: 'Gira',
    newRound: 'Nuova giocata',
    undo: 'Annulla',
    clear: 'Cancella',
    repeat: 'Ripeti',
    place: 'Scegli una fiche e clicca sul tappeto per puntare',
    noBets: 'Nessuna puntata sul tappeto',
    noMoney: 'Saldo insufficiente per questa fiche',
    overLimit: 'Limite della casella raggiunto ({max})',
    noMoreBets: 'Rien ne va plus',
    result: 'Esce il {n} {color}',
    win: '{n} {color} — vinci {amount}',
    lose: '{n} {color} — nessuna puntata vincente',
    red: 'rosso',
    black: 'nero',
    green: 'verde',
    history: 'Ultime uscite',
    hot: 'Caldi',
    cold: 'Freddi',
    statsColor: 'Giri: {n}  ·  Rosso {r}  ·  Nero {b}  ·  Zero {z}',
    statsSplit: 'Pari {e}  ·  Dispari {o}  ·  1–18: {l}  ·  19–36: {h}',
    stake: 'Sul tappeto: {amount}',
    rulesTitle: 'Roulette europea — zero singolo',
    rulesIntro:
      'Scegli il taglio della fiche nella barra in basso e clicca sul tappeto: sul numero per un pieno, sui bordi fra due numeri per un cavallo, sugli incroci per un carré, sul bordo inferiore di una colonna per una terzina e sull’incrocio inferiore per una sestina. Il racetrack accetta i numeri con i loro vicini (2 per lato) e gli annunci francesi.',
    rulesPays: 'Pagamenti',
    rulesLimit:
      'Il limite vale per casella ed è proporzionale ai numeri coperti: un cavallo ammette il doppio di un pieno, una chance semplice diciotto volte tanto.',
    rulesZero:
      'Sullo zero le chance semplici perdono per intero (nessuna regola La Partage). Il ritorno teorico è 97,3% per ogni puntata.',
    rulesFair:
      'Il numero viene estratto quando premi «Gira»: la pallina è poi guidata fino a quella casella, che puoi verificare sul cilindro.',
    kStraight: 'Pieno (1 numero)',
    kSplit: 'Cavallo (2 numeri)',
    kStreet: 'Terzina (3 numeri)',
    kTrio: 'Terzina con lo zero (0-1-2, 0-2-3)',
    kCorner: 'Carré (4 numeri)',
    kBasket: 'Primi quattro (0-1-2-3)',
    kLine: 'Sestina (6 numeri)',
    kColumn: 'Colonna (12 numeri)',
    kDozen: 'Dozzina (12 numeri)',
    kEven: 'Rosso/Nero, Pari/Dispari, 1-18/19-36',
    tutTableT: 'Il tappeto',
    tutTableX: 'Tocca un numero per un pieno (paga 35 a 1), i bordi fra due numeri per un cavallo, oppure le caselle esterne: rosso/nero, pari/dispari, 1-18/19-36 pagano 1 a 1, dozzine e colonne 2 a 1. Ogni tocco aggiunge una fiche.',
    tutWheelT: 'Il cilindro',
    tutWheelX: 'Premi Gira: il numero viene estratto subito e la pallina lo raggiunge sul cilindro. Lo zero è verde e fa perdere le chance semplici.',
    tutToolsT: 'Annulla, Cancella, Ripeti',
    tutToolsX: 'Annulla toglie l’ultima fiche, Cancella svuota il tappeto, Ripeti rimette le puntate del giro precedente.',
  },
  en: {
    spin: 'Spin',
    newRound: 'New round',
    undo: 'Undo',
    clear: 'Clear',
    repeat: 'Repeat',
    place: 'Pick a chip and click the layout to bet',
    noBets: 'No bets on the layout',
    noMoney: 'Not enough balance for this chip',
    overLimit: 'Spot limit reached ({max})',
    noMoreBets: 'No more bets',
    result: '{n} {color}',
    win: '{n} {color} — you win {amount}',
    lose: '{n} {color} — no winning bets',
    red: 'red',
    black: 'black',
    green: 'green',
    history: 'Last numbers',
    hot: 'Hot',
    cold: 'Cold',
    statsColor: 'Spins: {n}  ·  Red {r}  ·  Black {b}  ·  Zero {z}',
    statsSplit: 'Even {e}  ·  Odd {o}  ·  1–18: {l}  ·  19–36: {h}',
    stake: 'On the layout: {amount}',
    rulesTitle: 'European roulette — single zero',
    rulesIntro:
      'Pick a chip value in the bottom bar and click the layout: on a number for a straight up, on the line between two numbers for a split, on a crossing for a corner, on the bottom edge of a column for a street and on its bottom crossing for a six line. The racetrack takes a number with its neighbours (2 each side) and the French call bets.',
    rulesPays: 'Payouts',
    rulesLimit:
      'The limit applies per spot and grows with the numbers covered: a split allows twice a straight up, an even-money bet eighteen times as much.',
    rulesZero:
      'Even-money bets lose in full on zero (no La Partage). Theoretical return is 97.3% on every bet.',
    rulesFair:
      'The number is drawn when you press “Spin”: the ball is then guided into that pocket, which you can check on the wheel.',
    kStraight: 'Straight up (1 number)',
    kSplit: 'Split (2 numbers)',
    kStreet: 'Street (3 numbers)',
    kTrio: 'Trio with zero (0-1-2, 0-2-3)',
    kCorner: 'Corner (4 numbers)',
    kBasket: 'First four (0-1-2-3)',
    kLine: 'Six line (6 numbers)',
    kColumn: 'Column (12 numbers)',
    kDozen: 'Dozen (12 numbers)',
    kEven: 'Red/Black, Even/Odd, 1-18/19-36',
    tutTableT: 'The layout',
    tutTableX: 'Tap a number for a straight bet (pays 35 to 1), the edge between two numbers for a split, or the outside boxes: red/black, even/odd, 1-18/19-36 pay 1 to 1, dozens and columns 2 to 1. Every tap adds a chip.',
    tutWheelT: 'The wheel',
    tutWheelX: 'Press Spin: the number is drawn at once and the ball travels to it on the wheel. Zero is green and makes even-money bets lose.',
    tutToolsT: 'Undo, Clear, Repeat',
    tutToolsX: 'Undo removes the last chip, Clear empties the layout, Repeat places the previous round’s bets again.',
  },
});
