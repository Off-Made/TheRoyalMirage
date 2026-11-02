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
  /** Linee fisse, da sinistra a destra, a partire dal rullo 1. */
  | 'lines'
  /**
   * "Ways": conta le combinazioni come prodotto delle occorrenze per rullo
   * (una 5x4 da' 4^5 = 1024 modi). Paga una volta per simbolo, non per linea.
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
