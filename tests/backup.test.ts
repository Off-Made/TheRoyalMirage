/**
 * Backup del salvataggio: file esportato, controlli in lettura e copie
 * automatiche (al massimo una ogni 20 ore, le ultime 3).
 */
import { beforeEach, describe, expect, it } from 'vitest';

const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
};

const { SAVE_KEY, SAVE_VERSION } = await import('@/state/save');
const { BRAKE_KEY } = await import('@/games/crash/brake');
const {
  BACKUP_FORMAT,
  SNAPSHOT_GAP_MS,
  SNAPSHOT_LIMIT,
  backupFileName,
  backupPlayerName,
  createBackup,
  listSnapshots,
  parseBackup,
  takeSnapshot,
  writeExtra,
} = await import('@/state/backup');

const env = (name: string, balance = 1000) => ({
  version: SAVE_VERSION,
  savedAt: 1,
  data: { profile: { name }, wallets: { career: { balance } } },
});

beforeEach(() => mem.clear());

describe('backup su file', () => {
  it('senza salvataggio non c e niente da esportare', () => {
    expect(createBackup()).toBeNull();
  });

  it('esporta la busta del salvataggio e le chiavi extra, e si rilegge uguale', () => {
    mem.set(SAVE_KEY, JSON.stringify(env('Mattia', 4200)));
    mem.set(BRAKE_KEY, '{"x":1}');
    const b = createBackup(1_700_000_000_000)!;
    expect(b.format).toBe(BACKUP_FORMAT);
    expect(b.extra[BRAKE_KEY]).toBe('{"x":1}');
    const back = parseBackup(JSON.stringify(b));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.backup.save).toEqual(env('Mattia', 4200));
    expect(back.backup.exportedAt).toBe(1_700_000_000_000);
    expect(backupPlayerName(back.backup.save)).toBe('Mattia');
  });

  it('rifiuta file non validi o di una versione piu recente', () => {
    expect(parseBackup('non json')).toEqual({ ok: false, reason: 'json' });
    expect(parseBackup('{"format":"altro"}')).toEqual({ ok: false, reason: 'format' });
    expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, save: { version: 1 } }))).toEqual({ ok: false, reason: 'format' });
    const newer = { format: BACKUP_FORMAT, version: 1, exportedAt: 1, save: { ...env('x'), version: SAVE_VERSION + 1 }, extra: {} };
    expect(parseBackup(JSON.stringify(newer))).toEqual({ ok: false, reason: 'newer' });
  });

  it('dal file accetta solo le chiavi extra conosciute', () => {
    const f = { format: BACKUP_FORMAT, version: 1, exportedAt: 1, save: env('x'), extra: { [BRAKE_KEY]: 'b', 'chiave:estranea': 'z' } };
    const r = parseBackup(JSON.stringify(f));
    expect(r.ok && r.backup.extra).toEqual({ [BRAKE_KEY]: 'b' });
    if (r.ok) writeExtra(r.backup.extra);
    expect(mem.get(BRAKE_KEY)).toBe('b');
    expect(mem.has('chiave:estranea')).toBe(false);
  });

  it('nome del file con data e ora', () => {
    expect(backupFileName(new Date(2026, 10, 14, 9, 5).getTime())).toBe('royal-mirage-backup-2026-11-14-0905.json');
  });
});

describe('copie automatiche', () => {
  it('al massimo una ogni 20 ore, tenendo le ultime 3 dalla piu recente', () => {
    mem.set(SAVE_KEY, JSON.stringify(env('a')));
    const t0 = 1_000_000_000_000;
    expect(takeSnapshot(t0)).toBe(true);
    expect(takeSnapshot(t0 + 1000)).toBe(false);
    for (let i = 1; i <= 4; i++) {
      mem.set(SAVE_KEY, JSON.stringify(env(`v${i}`)));
      expect(takeSnapshot(t0 + i * SNAPSHOT_GAP_MS)).toBe(true);
    }
    const list = listSnapshots();
    expect(list).toHaveLength(SNAPSHOT_LIMIT);
    expect(list.map((s) => backupPlayerName(s.save))).toEqual(['v4', 'v3', 'v2']);
  });

  it('senza salvataggio non crea copie', () => {
    expect(takeSnapshot()).toBe(false);
    expect(listSnapshots()).toEqual([]);
  });
});
