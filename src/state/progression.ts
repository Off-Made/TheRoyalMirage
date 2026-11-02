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
 * Otto ranghi. La curva di XP e' geometrica (~x2,6 per livello): i primi
 * ranghi arrivano in pochi minuti per dare slancio, gli ultimi richiedono
 * ore di gioco. E' la stessa forma usata dai giochi a progressione lunga.
 */
export const VIP_TIERS: readonly VipTier[] = [
  { level: 0, key: 'vip.guest',     xp: 0,         color: PALETTE.tier.guest, reward: 0 },
  { level: 1, key: 'vip.merchant',  xp: 2_500,     color: PALETTE.tier.bronze, reward: 2_500 },
  { level: 2, key: 'vip.trader',    xp: 10_000,    color: PALETTE.tier.silver, reward: 7_500 },
  { level: 3, key: 'vip.noble',     xp: 35_000,    color: PALETTE.tier.gold, reward: 20_000 },
  { level: 4, key: 'vip.emir',      xp: 120_000,   color: PALETTE.tier.platinum, reward: 60_000 },
  { level: 5, key: 'vip.vizier',    xp: 400_000,   color: PALETTE.tier.sapphire, reward: 180_000 },
  { level: 6, key: 'vip.prince',    xp: 1_200_000, color: PALETTE.tier.diamond, reward: 500_000 },
  { level: 7, key: 'vip.sheikh',    xp: 4_000_000, color: PALETTE.tier.blackCard, reward: 2_000_000 },
  { level: 8, key: 'vip.sultan',    xp: 12_000_000, color: PALETTE.tier.legend, reward: 10_000_000 },
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
}

export function initialProgression(): ProgressionState {
  return {
    xp: 0,
    level: 0,
    streak: 0,
    lastBonusDay: '',
    achievements: [],
    gamesPlayed: [],
  };
}

/** XP guadagnata puntando `bet` fiche. 1 XP ogni fiche puntata. */
export function xpForWager(bet: number): number {
  return Math.max(1, Math.round(bet));
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
