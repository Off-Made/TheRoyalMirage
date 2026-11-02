/**
 * THE ROYAL MIRAGE — Catalogo dei giochi
 *
 * Un solo elenco dichiarativo di metadati. La Lobby, il profilo e gli
 * achievement leggono da qui: nessuno di loro importa il codice dei giochi.
 *
 * `scene` e' una funzione ASINCRONA che importa la scena su richiesta.
 * Motivo: il bundle del menu non deve contenere la matematica di otto
 * giochi. Entrando in una slot si scarica solo quella slot.
 *
 * Finche' un gioco non e' implementato, `scene` resta `null`: la Lobby lo
 * mostra come "in arrivo" invece di aprire una schermata vuota.
 */

import type { Scene } from '@/core/Scene';
import type { TranslationKey } from '@/i18n';
import { PALETTE } from '@/art/palette';

export type GameId =
  | 'goldenOasis'
  | 'desertFalcon'
  | 'sheikhsFortune'
  | 'blackjack'
  | 'roulette'
  | 'baccarat'
  | 'videopoker'
  | 'crash';

export type GameFamily = 'slots' | 'cards' | 'wheel' | 'instant';
export type Volatility = 'low' | 'medium' | 'high';

export interface GameInfo {
  id: GameId;
  family: GameFamily;
  nameKey: TranslationKey;
  tagKey: TranslationKey;
  /** Glifo di ripiego se la copertina non si carica. */
  glyph: string;
  /** Accento cromatico della carta in sala. Hex Pixi, dalla palette. */
  accent: number;
  /** Ritorno teorico al giocatore, in percentuale. */
  rtp: number;
  volatility: Volatility;
  /** Rango VIP minimo. 0 = disponibile subito. */
  minTier: number;
  /** Atmosfera musicale da attivare entrando. */
  mood: 'slots' | 'tables' | 'tension';
  /** Caricatore della scena. `null` = non ancora implementato. */
  scene: (() => Promise<Scene>) | null;
}

/**
 * I giochi in ordine di lobby: le tre slot per prime (sono il cuore del
 * gioco), poi i tavoli, poi il crash come curiosita' moderna.
 *
 * Gli RTP qui dichiarati sono gli stessi che i test di simulazione
 * verificano: se un modello matematico devia, il numero mostrato in lobby
 * diventa una bugia e il test fallisce.
 */
export const GAMES: readonly GameInfo[] = [
  {
    id: 'goldenOasis',
    family: 'slots',
    nameKey: 'game.goldenOasis',
    tagKey: 'game.goldenOasis.tag',
    glyph: '7',
    accent: PALETTE.red.core,
    rtp: 96.2,
    volatility: 'medium',
    minTier: 0,
    mood: 'slots',
    scene: () => import('./goldenOasis/GoldenOasisScene').then((m) => new m.GoldenOasisScene()),
  },
  {
    id: 'desertFalcon',
    family: 'slots',
    nameKey: 'game.desertFalcon',
    tagKey: 'game.desertFalcon.tag',
    glyph: '★',
    accent: PALETTE.accent.violet.core,
    rtp: 96.0,
    volatility: 'high',
    minTier: 0,
    mood: 'slots',
    scene: () => import('./desertFalcon/DesertFalconScene').then((m) => new m.DesertFalconScene()),
  },
  {
    id: 'sheikhsFortune',
    family: 'slots',
    nameKey: 'game.sheikhsFortune',
    tagKey: 'game.sheikhsFortune.tag',
    glyph: '♛',
    accent: PALETTE.accent.sapphire.core,
    rtp: 95.8,
    volatility: 'high',
    minTier: 0,
    mood: 'slots',
    scene: () => import('./sheikhsFortune/SheikhsFortuneScene').then((m) => new m.SheikhsFortuneScene()),
  },
  {
    id: 'blackjack',
    family: 'cards',
    nameKey: 'game.blackjack',
    tagKey: 'game.blackjack.tag',
    glyph: '♠',
    accent: PALETTE.felt.light,
    rtp: 99.5,
    volatility: 'low',
    minTier: 0,
    mood: 'tables',
    scene: () => import('./blackjack/BlackjackScene').then((m) => new m.BlackjackScene()),
  },
  {
    id: 'roulette',
    family: 'wheel',
    nameKey: 'game.roulette',
    tagKey: 'game.roulette.tag',
    glyph: '◎',
    accent: PALETTE.gold.core,
    rtp: 97.3,
    volatility: 'medium',
    minTier: 0,
    mood: 'tables',
    scene: () => import('./roulette/RouletteScene').then((m) => new m.RouletteScene()),
  },
  {
    id: 'baccarat',
    family: 'cards',
    nameKey: 'game.baccarat',
    tagKey: 'game.baccarat.tag',
    glyph: '♦',
    accent: PALETTE.feltRed.light,
    rtp: 98.9,
    volatility: 'low',
    minTier: 0,
    mood: 'tables',
    scene: () => import('./baccarat/BaccaratScene').then((m) => new m.BaccaratScene()),
  },
  {
    id: 'videopoker',
    family: 'cards',
    nameKey: 'game.videopoker',
    tagKey: 'game.videopoker.tag',
    glyph: '♣',
    accent: PALETTE.accent.emerald.core,
    rtp: 99.5,
    volatility: 'medium',
    minTier: 0,
    mood: 'tables',
    scene: () => import('./videopoker/VideoPokerScene').then((m) => new m.VideoPokerScene()),
  },
  {
    id: 'crash',
    family: 'instant',
    nameKey: 'game.crash',
    tagKey: 'game.crash.tag',
    glyph: '↗',
    accent: PALETTE.neon.pink,
    rtp: 99.0,
    volatility: 'high',
    minTier: 0,
    mood: 'tension',
    scene: () => import('./crash/CrashScene').then((m) => new m.CrashScene()),
  },
];

const BY_ID = new Map<GameId, GameInfo>(GAMES.map((g) => [g.id, g]));

export function gameById(id: GameId): GameInfo {
  const g = BY_ID.get(id);
  if (!g) throw new Error(`Gioco sconosciuto: ${id}`);
  return g;
}

/** Il gioco di partenza quando l'utente preme "Gioca" senza passare dalla lobby. */
export const DEFAULT_GAME: GameId = 'goldenOasis';

export function isUnlocked(info: GameInfo, tierLevel: number): boolean {
  return tierLevel >= info.minTier;
}

/** Vero finche' la scena non esiste: la lobby lo marca "in arrivo". */
export function isPlayable(info: GameInfo): boolean {
  return info.scene !== null;
}

export const FAMILY_LABEL: Record<GameFamily, TranslationKey> = {
  slots: 'lobby.filter.slots',
  cards: 'lobby.filter.cards',
  wheel: 'lobby.filter.wheel',
  instant: 'lobby.filter.instant',
};
