/**
 * THE ROYAL MIRAGE — Modello di una slot machine
 *
 * Una macchina e' un OGGETTO DI CONFIGURAZIONE, non codice. Strisce,
 * tabella pagamenti, linee e feature sono dati; il motore
 * (`evaluate.ts` + `spin.ts`) e' lo stesso per tutte e tre le slot.
 *
 * ── Perche' dichiarativo ──
 * L'RTP di una slot e' una proprieta' emergente di strisce + pagamenti.
 * Non si "decide": si misura simulando. Se la matematica fosse sparsa in
 * mezzo al codice di disegno, ritoccare il 96,2% richiederebbe di
 * ri-leggere la vista; con un oggetto, il test regola i numeri e la vista
 * non viene mai toccata.
 *
 * ── Le due basi di pagamento (fonte di bug classica) ──
 *   · vincite di LINEA  → moltiplicatori della puntata DI LINEA (bet / linee)
 *   · vincite SCATTER   → moltiplicatori della puntata TOTALE
 * Gli scatter pagano "a prescindere dalla posizione", quindi non
 * appartengono a nessuna linea e non possono usarne la base.
 */

/** Identificativo breve di un simbolo. Chiave nelle strisce e nella paytable. */
export type SymId = string;

/** La griglia di esito: `grid[reel][row]`. Colonne prima, come i rulli fisici. */
export type Grid = SymId[][];

export interface SymbolDef {
  id: SymId;
  /** Etichetta leggibile (IT); la vista la mostra nella paytable. */
  label: string;
  /** Glifo di riserva se il disegno vettoriale manca. */
  glyph: string;
  /** Colore d'accento del simbolo. */
  tint: number;
  /**
   * Pagamenti di linea: numero di simboli consecutivi → moltiplicatore
   * della puntata di linea. Le voci assenti valgono 0.
   */
  pays?: Readonly<Record<number, number>>;
  /** Sostituisce qualsiasi simbolo pagante (mai gli scatter). */
  wild?: boolean;
  /** Paga per conteggio totale sulla griglia, ignorando le linee. */
  scatter?: boolean;
  /** Pagamenti scatter: conteggio → moltiplicatore della puntata TOTALE. */
  scatterPays?: Readonly<Record<number, number>>;
  /** Giri gratuiti assegnati: conteggio scatter → numero di giri. */
  freeSpins?: Readonly<Record<number, number>>;
}

/**
 * Una linea di pagamento: per ogni rullo, l'indice di riga attraversato.
 * `[1,1,1,1,1]` e' la linea centrale di una griglia a 3 righe.
 */
export type Payline = readonly number[];

/** Come si contano le combinazioni vincenti. */
export type EvalMode =
  /** Linee fisse: 3+ simboli uguali su rulli adiacenti, da qualunque rullo. */
  | 'lines'
  /**
   * "Ways": conta le combinazioni come prodotto delle occorrenze per rullo
   * (una 5x4 da' 4^5 = 1024 modi) su 3+ rulli adiacenti, da qualunque rullo.
   * Paga una volta per simbolo, non per linea.
   */
  | 'ways';

/** Comportamento del wild durante i giri gratuiti e non. */
export interface WildRule {
  /**
   * Il wild si espande a tutta la colonna quando atterra. Cambia molto
   * l'RTP: va simulato, non stimato.
   */
  expanding?: boolean;
  /** Solo su questi rulli (indici 0-based). Assente = tutti. */
  reels?: readonly number[];
  /** Moltiplicatore applicato a ogni vincita che usa il wild. */
  multiplier?: number;
  /** In quali fasi il wild si espande. Default 'both'. */
  expandIn?: 'base' | 'free' | 'both';
}

export interface FreeSpinRule {
  /** Striscie alternative usate durante i giri gratuiti. Assente = le stesse. */
  strips?: readonly (readonly SymId[])[];
  /**
   * Scala di moltiplicatori progressivi: il giro gratuito n-esimo usa
   * `ladder[min(n, ladder.length-1)]`.
   */
  ladder?: readonly number[];
  /** I nuovi scatter durante i giri gratuiti ne aggiungono altri. */
  retrigger?: boolean;
  /** Giri massimi accumulabili, per impedire sessioni infinite. */
  cap?: number;
}

/** Jackpot a griglia della meccanica Hold & Win. */
export interface JackpotDef {
  id: string;
  label: string;
  /** Moltiplicatore della puntata totale. */
  mult: number;
  tint: number;
}

/** Meccanica Hold & Win: monete che si bloccano e fanno respin. */
export interface HoldAndWinRule {
  /** Simbolo-moneta che si blocca. */
  coin: SymId;
  /** Monete minime per innescare la feature. */
  trigger: number;
  /** Respin disponibili, che si ricaricano a ogni nuova moneta. */
  respins: number;
  /** Valori possibili di una moneta (moltiplicatori della puntata totale). */
  values: readonly number[];
  /** Pesi paralleli a `values`. */
  weights: readonly number[];
  /** Probabilita' che una cella vuota riceva una moneta a ogni respin. */
  landChance: number;
  /** Riempire tutta la griglia paga il jackpot maggiore. */
  jackpots: readonly JackpotDef[];
}

// ─────────────────────────────────────────────── BONUS INTERNI

/**
 * Uno spicchio della ruota della fortuna. `mult` moltiplica per `value` la
 * vincita accumulata; `blank` ("NULLA") non vince niente in quel giro, ma
 * la vincita resta; `spin` regala un giro di ruota in piu'; `stop` chiude
 * la ruota e fa perdere i giri rimasti (si tiene quanto gia' vinto).
 */
export interface WheelSegment {
  kind: 'mult' | 'blank' | 'spin' | 'stop';
  value: number;
  /** Peso nell'estrazione: gli spicchi NON sono equiprobabili. */
  weight: number;
  /**
   * Peso nel PRIMO giro, quasi uniforme (i premi grandi restano un po' piu'
   * rari). Assente = `weight`. Dal secondo giro contano `weight`, il freno e
   * la rimonta, cioe' quello che e' uscito prima.
   */
  first?: number;
}

/** Ruota della fortuna: 3 simboli ruota innescano `spins` giri di ruota. */
export interface WheelRule {
  symbol: SymId;
  trigger: number;
  spins: number;
  /** Tetto ai giri totali, "+1" compresi: nessuna sessione infinita. */
  maxSpins: number;
  /** Spicchi in ordine di disegno, in senso orario dalla lancetta. */
  segments: readonly WheelSegment[];
  /**
   * Freno ai premi alti: dopo uno spicchio da `highFrom`× in su, i pesi di
   * tutti gli spicchi da `highFrom`× in su si moltiplicano per `highDamp`.
   */
  highFrom: number;
  highDamp: number;
  /** Tetto al moltiplicatore accumulato (vincita massima della ruota, in puntate). */
  maxTotal: number;
  /**
   * Rimonta: dopo un giro scarso (NULLA o moltiplicatore fino a `lowUpTo`),
   * nel giro successivo i moltiplicatori da `boostFrom` in su pesano
   * `boostHigh` volte, e NULLA e i moltiplicatori bassi `boostLow` volte.
   */
  lowUpTo: number;
  boostFrom: number;
  boostHigh: number;
  boostLow: number;
}

export interface WheelOutcome {
  /** Un elemento per giro di ruota: spicchio uscito, totale e giri rimasti dopo. */
  spins: readonly { segment: number; total: number; left: number }[];
  /** Moltiplicatore accumulato (prodotto degli spicchi, parte da 1). */
  total: number;
  payout: number;
}

/**
 * Bonus a cascata: 3+ simboli bonus danno N giri speciali. Le combinazioni
 * vincenti esplodono, i simboli sopra cadono e dall'alto ne arrivano di
 * nuovi. Ogni caduta e ogni giro nuovo consumano un giro; il moltiplicatore
 * sale a ogni cascata e, a griglia nuova, torna al primo gradino (o scende di
 * uno solo con `stepBack`).
 */
export interface CascadeRule {
  symbol: SymId;
  /** Conteggio simboli bonus → giri assegnati. */
  spins: Readonly<Record<number, number>>;
  /** Moltiplicatore per cascata consecutiva: il giro nuovo usa ladder[0]. */
  ladder: readonly number[];
  /** Strisce proprie della cascata (es. piu' wild). Assenti = quelle del gioco base. */
  strips?: readonly (readonly SymId[])[];
  /**
   * Un giro senza vincite non riporta il moltiplicatore a ×1: lo fa scendere
   * di un solo gradino (da ×10 a ×5, da ×5 a ×3...).
   */
  stepBack?: boolean;
  /** Il simbolo bonus dentro la cascata aggiunge giri (raro). 0 = mai. */
  retriggerSpins: number;
  /** Quante volte al massimo puo' aggiungere giri in una cascata. */
  retriggerCap: number;
}

export interface CascadeStep {
  /** `fresh` = griglia nuova dai rulli; `drop` = caduta dopo un'esplosione. */
  kind: 'fresh' | 'drop';
  grid: Grid;
  /** Solo `fresh`: posizione dei rulli. */
  stops?: readonly number[];
  wins: readonly WinLine[];
  multiplier: number;
  payout: number;
  /** Giri rimasti DOPO questo passo. */
  left: number;
  /** Celle che esplodono alla fine di questo passo (unione delle vincite). */
  explode: readonly (readonly [number, number])[];
  /** Giri aggiunti in questo passo da un simbolo bonus (0 = nessuno). */
  added: number;
  /** Celle dei simboli bonus che hanno aggiunto giri (per la vista). */
  bonusCells: readonly (readonly [number, number])[];
}

export interface CascadeOutcome {
  spins: number;
  steps: readonly CascadeStep[];
  payout: number;
}

/** Tabella dei forzieri per un numero minimo di simboli. */
export interface ChestTable {
  min: number;
  values: readonly number[];
  weights: readonly number[];
}

/** Forzieri: 5+ simboli forziere aprono una scelta fra `chests` forzieri. */
export interface ChestRule {
  symbol: SymId;
  trigger: number;
  chests: number;
  /** Piu' simboli = tabella piu' ricca. Si usa quella col `min` piu' alto <= conteggio. */
  tables: readonly ChestTable[];
}

export interface ChestOutcome {
  /** Simboli forziere sui rulli. */
  count: number;
  /** Moltiplicatore del forziere che il giocatore apre (gia' deciso). */
  prize: number;
  /** Il contenuto degli altri forzieri, mostrato dopo l'apertura. */
  others: readonly number[];
  payout: number;
}

export interface MachineDef {
  id: string;
  /** Nome leggibile, per i log e i test. */
  name: string;
  reels: number;
  rows: number;
  /** Una striscia per rullo. La frequenza di un simbolo E' la sua probabilita'. */
  strips: readonly (readonly SymId[])[];
  symbols: readonly SymbolDef[];
  paylines: readonly Payline[];
  evalMode: EvalMode;
  wild?: WildRule;
  freeSpins?: FreeSpinRule;
  holdAndWin?: HoldAndWinRule;
  wheel?: WheelRule;
  cascade?: CascadeRule;
  chests?: ChestRule;
  /** RTP dichiarato in lobby. Il test di simulazione verifica che sia vero. */
  rtpTarget: number;
  /**
   * Divisore della puntata per ottenere la puntata di linea.
   * Nelle slot "ways" si punta la cifra intera e questo vale 1.
   */
  betDivisor: number;
}

// ─────────────────────────────────────────────── ESITI

/** Una combinazione vincente individuata sulla griglia. */
export interface WinLine {
  kind: 'line' | 'ways' | 'scatter';
  symbol: SymId;
  /** Quanti simboli hanno formato la combinazione. */
  count: number;
  /** Primo rullo della combinazione (0-based; linee e ways). */
  startReel?: number;
  /** Indice della linea (solo `kind: 'line'`). */
  lineIndex?: number;
  /** Celle coinvolte, come coppie [rullo, riga]: la vista le illumina. */
  cells: readonly (readonly [number, number])[];
  /** Vincita in fiche, moltiplicatori di feature inclusi. */
  payout: number;
  /** Moltiplicatore applicato (wild, scala dei giri gratuiti). */
  multiplier: number;
}

/** Esito completo di un singolo giro (base o gratuito). */
export interface SpinOutcome {
  grid: Grid;
  wins: readonly WinLine[];
  /** Somma di `wins[].payout`. */
  payout: number;
  /** Giri gratuiti assegnati da questo giro. */
  freeSpinsAwarded: number;
  /** Celle con wild espanso, per l'animazione dedicata. */
  expandedReels: readonly number[];
  /** Posizione di stop per rullo: la vista ne ha bisogno per fermare i rulli. */
  stops: readonly number[];
  /** Moltiplicatore di fase (scala dei giri gratuiti). 1 nel giro base. */
  multiplier: number;
  /** Valori delle monete Hold & Win visibili, `grid`-shaped; null = non moneta. */
  coinValues?: readonly (number | null)[][];
}

/** Esito di una giocata intera: giro base + eventuale sessione di giri gratuiti. */
export interface RoundOutcome {
  base: SpinOutcome;
  free: readonly SpinOutcome[];
  holdAndWin?: HoldAndWinOutcome;
  wheel?: WheelOutcome;
  cascade?: CascadeOutcome;
  chests?: ChestOutcome;
  /** Vincita totale della giocata, in fiche. */
  totalPayout: number;
  bet: number;
}

export interface HoldAndWinOutcome {
  /** Griglia finale di valori; `null` = cella vuota. */
  cells: readonly (number | null)[][];
  /** Monete che hanno innescato la feature (gia' bloccate al primo respin). */
  initial: readonly (number | null)[][];
  /**
   * Un elemento per respin: le monete atterrate in quel giro (anche nessuna)
   * e i respin rimasti DOPO quel giro. La vista li anima uno per uno.
   */
  respins: readonly { landed: readonly { reel: number; row: number; value: number }[]; left: number }[];
  /** Jackpot vinto, se la griglia si e' riempita. */
  jackpot?: JackpotDef;
  payout: number;
}
