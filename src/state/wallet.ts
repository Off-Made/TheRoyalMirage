/**
 * THE ROYAL MIRAGE — Portafoglio
 *
 * ── Regola non negoziabile: TUTTI GLI IMPORTI SONO CENTESIMI INTERI ──
 * Il denaro del gioco sono euro, contati in centesimi interi, mai in float.
 * Con i float una puntata di 0,10 ripetuta accumula errore (0.1 + 0.2 !==
 * 0.3) e dopo mille giocate il saldo mostrato non corrisponde piu' alla
 * somma delle transazioni. I casino' veri contano in centesimi interi per la
 * stessa ragione.
 *
 * Quindi `bet` e `balance` sono centesimi: 100,00 € = 10_000. Un
 * moltiplicatore frazionario (es. x2,5) si arrotonda con Math.round AL
 * MOMENTO del pagamento, una volta sola. Il testo che il giocatore legge e
 * scrive passa SEMPRE da `formatMoney` / `parseMoney`.
 */

/** Saldo iniziale della carriera: 100,00 €. */
export const STARTING_BALANCE = 10_000;

/**
 * Puntata minima: 0,10 €.
 *
 * Non e' un limite commerciale. Le slot dividono la puntata fra 20-25 linee
 * e arrotondano il premio al centesimo: sotto i 10 centesimi l'arrotondamento
 * mangerebbe una parte significativa delle vincite piccole, e il ritorno
 * teorico dichiarato in sala smetterebbe di essere vero. Il MASSIMO, invece,
 * non esiste: e' il saldo.
 */
export const MIN_BET = 10;

/**
 * Tagli rapidi delle fiche sui tavoli (in centesimi). Sono SCORCIATOIE:
 * l'importo libero scritto nel campo vale come fiche personalizzata.
 */
export const QUICK_CHIPS: readonly number[] = [10, 50, 100, 500, 1_000, 2_500, 10_000, 50_000];

/** Soglie di vincita in MULTIPLI DELLA PUNTATA, non in fiche assolute. */
export const WIN_TIERS = [
  { tier: 'normal', min: 0 },
  { tier: 'big', min: 15 },
  { tier: 'mega', min: 40 },
  { tier: 'epic', min: 100 },
  { tier: 'legendary', min: 300 },
] as const;

export type WinTierName = (typeof WIN_TIERS)[number]['tier'];

/**
 * Classifica una vincita. Dipende dal RAPPORTO vincita/puntata, non
 * dall'importo: 500 fiche su una puntata da 1 e' epico, su una da 500 e'
 * un pareggio. Confondere i due e' l'errore piu' comune nei giochi amatoriali.
 */
export function classifyWin(payout: number, bet: number): WinTierName {
  if (payout <= 0 || bet <= 0) return 'normal';
  const ratio = payout / bet;
  let result: WinTierName = 'normal';
  for (const t of WIN_TIERS) {
    if (ratio >= t.min) result = t.tier;
  }
  return result;
}

export interface Transaction {
  /** Timestamp epoch ms. */
  at: number;
  game: string;
  bet: number;
  /** Vincita lorda. 0 = perdita. */
  payout: number;
  /** Saldo dopo l'operazione. */
  balance: number;
}

export interface WalletState {
  balance: number;
  bet: number;
  /** Centesimi vinti in totale, da sempre. Per statistiche e achievement. */
  totalWon: number;
  totalWagered: number;
  biggestWin: number;
  spins: number;
  /** Ultime N transazioni, per lo storico a schermo. */
  history: Transaction[];
}

export const HISTORY_LIMIT = 60;

export function initialWallet(): WalletState {
  return {
    balance: STARTING_BALANCE,
    // 1,00 € di partenza: l'1% del saldo, un primo giro che non spaventa.
    bet: 100,
    totalWon: 0,
    totalWagered: 0,
    biggestWin: 0,
    spins: 0,
    history: [],
  };
}

// ─────────────────────────────────────────────────────────── PUNTATA

/**
 * La puntata resta fra il minimo e il saldo. Nessun altro tetto.
 * NaN ripiega sul minimo (mai propagato); +Infinity si ferma al saldo.
 */
export function clampBet(cents: number, balance: number): number {
  if (Number.isNaN(cents)) return MIN_BET;
  const ceil = Math.max(MIN_BET, Math.floor(balance));
  return Math.max(MIN_BET, Math.min(Math.round(cents), ceil));
}

/** ½: meta' della puntata, arrotondata al centesimo, mai sotto il minimo. */
export function halfBet(bet: number, balance: number): number {
  return clampBet(bet / 2, balance);
}

/** ×2: doppio della puntata, mai oltre il saldo. */
export function doubleBet(bet: number, balance: number): number {
  return clampBet(bet * 2, balance);
}

/** A secco: con meno della puntata minima non si puo' piu' giocare. */
export function isBroke(balance: number): boolean {
  return balance < MIN_BET;
}

// ──────────────────────────────────────────────────────────── TESTO

const EUR = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 10_000 → "100,00 €". Arrotonda un importo non intero, una volta sola. */
export function formatMoney(cents: number): string {
  return EUR.format(Math.round(cents) / 100);
}

/**
 * Forma compatta per spazi stretti (lobby, menu, jackpot):
 * sotto i 10.000 € resta esatta al centesimo, sopra abbrevia.
 */
export function formatMoneyShort(cents: number): string {
  const v = Math.round(cents);
  const euro = v / 100;
  const n = (x: number, d: number) =>
    x.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
  if (Math.abs(euro) >= 1_000_000) return `${n(euro / 1_000_000, 2)}\u00a0M\u00a0€`;
  if (Math.abs(euro) >= 10_000) return `${n(euro / 1_000, 1)}\u00a0K\u00a0€`;
  return formatMoney(v);
}

/**
 * Legge un importo scritto dal giocatore e lo restituisce in centesimi,
 * oppure `null` se non e' un importo valido e positivo.
 *
 * Accetta le due convenzioni che un utente italiano scrive davvero:
 *   "5"  "5,5"  "5,50"  "5.50"  "1.234,56"  "1234.56"  "1 234,56"  "12 €"
 *
 * Il separatore decimale e' l'ULTIMO fra virgola e punto, se e' seguito da
 * 1-3 cifre; l'altro e' il separatore delle migliaia. Rifiuta segni meno,
 * notazione esponenziale, "NaN"/"Infinity" e qualunque altro carattere: un
 * campo di puntata non deve mai indovinare cosa si intendeva.
 */
export function parseMoney(input: string): number | null {
  // Euro e spazi (anche non separabili) non portano informazione.
  const raw = input.replace(/[€\s\u00a0\u202f]/g, '');
  if (!/^[0-9.,]+$/.test(raw) || !/[0-9]/.test(raw)) return null;

  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  const sepAt = Math.max(lastComma, lastDot);
  let intPart = raw;
  let fracPart = '';
  if (sepAt >= 0) {
    const tail = raw.slice(sepAt + 1);
    const sep = raw[sepAt]!;
    const other = sep === ',' ? '.' : ',';
    const head = raw.slice(0, sepAt);
    // "1,2,3": due virgole non possono essere migliaia e decimali insieme.
    if (head.includes(sep) && sep === ',') return null;
    if (/^[0-9]{1,3}$/.test(tail) && !(sep === '.' && head.includes('.'))) {
      intPart = head.split(other).join('');
      fracPart = tail;
    } else {
      // Nessuna parte decimale: il separatore era delle migliaia.
      intPart = raw.split(sep).join('').split(other).join('');
    }
  }
  if (!/^[0-9]+$/.test(intPart)) return null;
  const cents = Number(intPart) * 100 + Math.round(Number(`0.${fracPart || '0'}`) * 100);
  return Number.isFinite(cents) && cents > 0 ? cents : null;
}
