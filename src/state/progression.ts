/**
 * THE ROYAL MIRAGE — Progressione e ranghi VIP
 *
 * L'XP si guadagna sul VOLUME GIOCATO (quanto hai puntato), non sulle vincite.
 * Scelta deliberata: premiare le vincite creerebbe un ciclo in cui il giocatore
 * fortunato progredisce e quello sfortunato resta bloccato, cioe' punirebbe
 * due volte la sfortuna. Premiare il volume rende la progressione prevedibile
 * e indipendente dalla varianza.
 */

import { PALETTE } from '@/art/palette';

export interface VipTier {
  level: number;
  /** Chiave i18n del nome. */
  key: string;
  /** XP cumulativa necessaria per raggiungere il rango. */
  xp: number;
  /** Colore identificativo (hex Pixi). */
  color: number;
  /** Centesimi regalati al raggiungimento. */
  reward: number;
}

/**
 * Otto ranghi oltre l'ospite. L'XP si guadagna a GIRO (vedi `xpForWager`),
 * circa 15-60 XP l'uno: il primo rango arriva in una cinquantina di giri, il
 * vertice in ~70 ore di gioco. La curva e' ~x2,5 per rango.
 *
 * Prima l'XP valeva 1 per centesimo puntato e i premi superavano la perdita
 * attesa: con puntate alte si arrivava al vertice in tre giorni (30 milioni
 * di XP) e ogni premio finanziava la puntata successiva. Ora i premi sono un
 * riconoscimento, non un motore di ricarica.
 */
export const VIP_TIERS: readonly VipTier[] = [
  { level: 0, key: 'vip.guest',     xp: 0,         color: PALETTE.tier.guest, reward: 0 },
  { level: 1, key: 'vip.merchant',  xp: 1_500,     color: PALETTE.tier.bronze, reward: 1_000 },
  { level: 2, key: 'vip.trader',    xp: 6_000,     color: PALETTE.tier.silver, reward: 2_500 },
  { level: 3, key: 'vip.noble',     xp: 20_000,    color: PALETTE.tier.gold, reward: 5_000 },
  { level: 4, key: 'vip.emir',      xp: 60_000,    color: PALETTE.tier.platinum, reward: 10_000 },
  { level: 5, key: 'vip.vizier',    xp: 150_000,   color: PALETTE.tier.sapphire, reward: 20_000 },
  { level: 6, key: 'vip.prince',    xp: 350_000,   color: PALETTE.tier.diamond, reward: 40_000 },
  { level: 7, key: 'vip.sheikh',    xp: 800_000,   color: PALETTE.tier.blackCard, reward: 80_000 },
  { level: 8, key: 'vip.sultan',    xp: 1_700_000, color: PALETTE.tier.legend, reward: 150_000 },
];

/**
 * Soglie della curva PRECEDENTE (1 XP per centesimo). Servono solo alla
 * migrazione del salvataggio v2 → v3, per capire che rango aveva il giocatore.
 */
export const LEGACY_TIER_XP: readonly number[] = [
  0, 2_500, 10_000, 35_000, 120_000, 400_000, 1_200_000, 4_000_000, 12_000_000,
];

export interface ProgressionState {
  xp: number;
  level: number;
  /** Giorni consecutivi di accesso. */
  streak: number;
  /** Data (YYYY-MM-DD) dell'ultimo bonus riscosso. */
  lastBonusDay: string;
  /** ID degli achievement sbloccati. */
  achievements: string[];
  /** ID dei giochi giocati almeno una volta. */
  gamesPlayed: string[];
  /** ID dei giochi di cui si e' gia' visto (o chiuso) il tutorial. */
  tutorialsSeen: string[];
}

export function initialProgression(): ProgressionState {
  return {
    xp: 0,
    level: 0,
    streak: 0,
    lastBonusDay: '',
    achievements: [],
    gamesPlayed: [],
    tutorialsSeen: [],
  };
}

/**
 * XP di UN giro con puntata `bet` (centesimi). Cresce col logaritmo della
 * puntata: giocare conta piu' di quanto si punta.
 *   1 € → 2 · 10 € → 5 · 100 € → 8 · 1.000 € → 11
 * (circa un ottavo della prima taratura: il rango massimo arrivava in 2-3 giorni)
 * Una puntata mille volte piu' grande vale poco piu' di cinque volte tanto.
 */
export function xpForWager(bet: number): number {
  const b = Math.max(0, Number.isFinite(bet) ? bet : 0);
  return Math.max(1, Math.round(1.25 + Math.log2(1 + b / 100)));
}

/**
 * Rango salvato con la vecchia curva → XP con la curva nuova: si conserva il
 * rango raggiunto, all'inizio della sua fascia. Nessun premio viene ripagato
 * (il livello salvato resta lo stesso, `grantXp` premia solo i salti).
 */
export function migrateLegacyXp(oldXp: number): { xp: number; level: number } {
  let level = 0;
  LEGACY_TIER_XP.forEach((t, i) => {
    if (oldXp >= t) level = i;
  });
  return { xp: VIP_TIERS[level]!.xp, level };
}

export function tierFor(xp: number): VipTier {
  let t = VIP_TIERS[0]!;
  for (const tier of VIP_TIERS) {
    if (xp >= tier.xp) t = tier;
  }
  return t;
}

export function nextTier(level: number): VipTier | null {
  return VIP_TIERS[level + 1] ?? null;
}

/** Progresso 0..1 verso il rango successivo. 1 se si e' al massimo. */
export function tierProgress(xp: number): number {
  const cur = tierFor(xp);
  const next = nextTier(cur.level);
  if (!next) return 1;
  const span = next.xp - cur.xp;
  return span <= 0 ? 1 : Math.min(1, (xp - cur.xp) / span);
}

// ─────────────────────────────────────────── BONUS GIORNALIERO

/** Chiave del giorno locale. Usiamo la data locale, non UTC: un giocatore
 *  non deve vedere il bonus "resettarsi" a mezzogiorno. */
export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Numero di giorni fra due chiavi YYYY-MM-DD. */
export function daysBetween(a: string, b: string): number {
  if (!a || !b) return Infinity;
  const pa = Date.parse(`${a}T00:00:00`);
  const pb = Date.parse(`${b}T00:00:00`);
  if (Number.isNaN(pa) || Number.isNaN(pb)) return Infinity;
  return Math.round((pb - pa) / 86_400_000);
}

export const DAILY_BASE = 1_000;
export const DAILY_STREAK_CAP = 7;

/**
 * Bonus giornaliero: cresce col numero di giorni consecutivi fino al 7°,
 * poi si stabilizza. Scala anche col rango VIP, cosi' resta significativo
 * quando le puntate sono diventate grandi.
 */
export function dailyBonusAmount(streak: number, level: number): number {
  const s = Math.min(Math.max(streak, 1), DAILY_STREAK_CAP);
  const streakMult = 1 + (s - 1) * 0.6; // 1x → 4.6x al settimo giorno
  const tierMult = 1 + level * 1.1;
  return Math.round(DAILY_BASE * streakMult * tierMult);
}

export function canClaimDaily(p: ProgressionState, today = todayKey()): boolean {
  return p.lastBonusDay !== today;
}

/**
 * Calcola il nuovo streak al momento della riscossione.
 * Un giorno di assenza azzera: e' la regola che rende lo streak un impegno.
 */
export function nextStreak(p: ProgressionState, today = todayKey()): number {
  const gap = daysBetween(p.lastBonusDay, today);
  if (gap === 1) return p.streak + 1;
  return 1;
}
