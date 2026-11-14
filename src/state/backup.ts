/**
 * THE ROYAL MIRAGE — Backup del salvataggio
 *
 * Due strade, entrambe dalle impostazioni:
 *   · FILE: "Esporta" scarica un .json con tutto il salvataggio; "Ripristina"
 *     lo rilegge (anche su un altro dispositivo o un altro browser).
 *   · COPIE AUTOMATICHE: all'avvio, al massimo una volta ogni 20 ore, si
 *     conserva una copia del salvataggio in una chiave a parte (le ultime 3).
 *     "Cancella tutti i dati" non le tocca: dopo un errore si puo' tornare
 *     indietro.
 *
 * Il file contiene la stessa busta versionata di `save.ts`: al ripristino
 * passa dalle stesse migrazioni, quindi un backup vecchio resta leggibile.
 * Qui solo funzioni pure e accessi a localStorage: la UI sta in
 * `ui/dom/SettingsModal.ts`, il ripristino nello store (`actions.restoreSave`).
 */

import { SAVE_KEY, SAVE_VERSION } from './save';
import { BRAKE_KEY } from '@/games/crash/brake';

export const BACKUP_FORMAT = 'the-royal-mirage/backup';
const BACKUP_VERSION = 1;
const SNAP_KEY = 'golden-oasis:snapshots';
/** Copie automatiche conservate. */
export const SNAPSHOT_LIMIT = 3;
/** Distanza minima fra due copie automatiche. */
export const SNAPSHOT_GAP_MS = 20 * 60 * 60 * 1000;
/** Altre chiavi del sito che fanno parte dei dati del giocatore. */
const EXTRA_KEYS = [BRAKE_KEY];

export interface SaveEnvelope {
  version: number;
  savedAt: number;
  data: Record<string, unknown>;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  save: SaveEnvelope;
  extra: Record<string, string>;
}

export interface Snapshot {
  at: number;
  save: SaveEnvelope;
  extra: Record<string, string>;
}

export type ParseResult = { ok: true; backup: BackupFile } | { ok: false; reason: 'json' | 'format' | 'newer' };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isEnvelope(v: unknown): v is SaveEnvelope {
  return isObject(v) && typeof v.version === 'number' && isObject(v.data);
}

function getItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function readEnvelope(): SaveEnvelope | null {
  const raw = getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const env: unknown = JSON.parse(raw);
    return isEnvelope(env) ? env : null;
  } catch {
    return null;
  }
}

function readExtra(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of EXTRA_KEYS) {
    const v = getItem(k);
    if (v !== null) out[k] = v;
  }
  return out;
}

/** Il backup del salvataggio attuale, o null se non c'e' niente da salvare. */
export function createBackup(now = Date.now()): BackupFile | null {
  const save = readEnvelope();
  if (!save) return null;
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now, save, extra: readExtra() };
}

/** Nome del file: royal-mirage-backup-2026-11-14-1530.json (ora locale). */
export function backupFileName(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `royal-mirage-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

/** Controlla un file di backup. Non scrive niente. */
export function parseBackup(text: string): ParseResult {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'json' };
  }
  if (!isObject(v) || v.format !== BACKUP_FORMAT || typeof v.version !== 'number' || !isEnvelope(v.save)) {
    return { ok: false, reason: 'format' };
  }
  if (v.version > BACKUP_VERSION || v.save.version > SAVE_VERSION) return { ok: false, reason: 'newer' };
  const extra: Record<string, string> = {};
  if (isObject(v.extra)) {
    for (const k of EXTRA_KEYS) if (typeof v.extra[k] === 'string') extra[k] = v.extra[k] as string;
  }
  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version: v.version,
      exportedAt: typeof v.exportedAt === 'number' ? v.exportedAt : v.save.savedAt,
      save: v.save,
      extra,
    },
  };
}

/** Nome del giocatore salvato nel backup (per la conferma), se c'e'. */
export function backupPlayerName(save: SaveEnvelope): string {
  const p = save.data.profile;
  return isObject(p) && typeof p.name === 'string' ? p.name : '';
}

/** Riscrive le chiavi extra (freno del Golden Chip...) da un backup. */
export function writeExtra(extra: Record<string, string>): void {
  for (const k of EXTRA_KEYS) if (k in extra) setItem(k, extra[k]!);
}

// ─────────────────────────────────────────────── COPIE AUTOMATICHE

export function listSnapshots(): Snapshot[] {
  const raw = getItem(SNAP_KEY);
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter((s): s is Snapshot => isObject(s) && typeof s.at === 'number' && isEnvelope(s.save))
      .map((s) => ({ at: s.at, save: s.save, extra: isObject(s.extra) ? (s.extra as Record<string, string>) : {} }))
      .sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

/**
 * Conserva una copia del salvataggio attuale, se l'ultima e' piu' vecchia di
 * `SNAPSHOT_GAP_MS` (o `force`). Tiene solo le ultime `SNAPSHOT_LIMIT`.
 */
export function takeSnapshot(now = Date.now(), force = false): boolean {
  const save = readEnvelope();
  if (!save) return false;
  const list = listSnapshots();
  if (!force && list[0] && now - list[0].at < SNAPSHOT_GAP_MS) return false;
  const next = [{ at: now, save, extra: readExtra() }, ...list].slice(0, SNAPSHOT_LIMIT);
  // Se lo spazio non basta, meglio una copia sola che nessuna.
  return setItem(SNAP_KEY, JSON.stringify(next)) || setItem(SNAP_KEY, JSON.stringify(next.slice(0, 1)));
}
