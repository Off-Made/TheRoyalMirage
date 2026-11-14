/**
 * THE ROYAL MIRAGE — Modale impostazioni
 *
 * Ogni controllo scrive SUBITO nello store (niente pulsante "Salva"):
 * l'utente sente il volume cambiare mentre trascina, vede la lingua cambiare
 * al click. Una conferma esplicita serve solo per l'unica azione
 * irreversibile, la cancellazione dei dati.
 */

import { div, el, fieldRow, toggle, slider, segmented, button } from './el';
import { showModal, confirmModal, closeModal } from './Modal';
import { settings, actions, store } from '@/state/store';
import type { Language, Quality } from '@/state/settings';
import { setLanguage, applyTranslations, getLanguage } from '@/i18n';
import {
  backupFileName,
  backupPlayerName,
  createBackup,
  listSnapshots,
  parseBackup,
  writeExtra,
  type SaveEnvelope,
} from '@/state/backup';
import { game } from '@/core/App';
import { toast } from './Toasts';
import { t } from '@/i18n';

function group(titleKey: string, ...rows: Node[]): HTMLElement {
  return div('go-group', el('h3', { class: 'go-group__title', i18n: titleKey }), ...rows);
}

function when(at: number): string {
  return new Date(at).toLocaleString(getLanguage(), { dateStyle: 'medium', timeStyle: 'short' });
}

/** Scarica il backup del salvataggio come file .json. */
function exportBackup(): void {
  actions.flushSave();
  const b = createBackup();
  if (!b) {
    toast(t('settings.backupEmpty'), 'warn');
    return;
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' }));
  const a = el('a', { attrs: { href: url, download: backupFileName(b.exportedAt) } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast(t('settings.backupExported'), 'info');
}

/** Chiede conferma e sostituisce i dati attuali con quelli di un backup. */
async function restore(save: SaveEnvelope, extra: Record<string, string>, at: number): Promise<void> {
  const name = backupPlayerName(save);
  const ok = await confirmModal({
    titleKey: 'settings.backupConfirmTitle',
    messageKey: 'settings.backupConfirm',
    message: t('settings.backupConfirm', { date: when(at), name: name ? ` · ${name}` : '' }),
    confirmKey: 'settings.backupRestore',
    danger: true,
  });
  if (!ok) return;
  if (!actions.restoreSave(save)) {
    toast(t('settings.backupFailed'), 'warn');
    return;
  }
  writeExtra(extra);
  toast(t('settings.backupDone'), 'win');
  // Come dopo la cancellazione: ricaricare riporta ogni parte del gioco allo stato nuovo.
  setTimeout(() => location.reload(), 650);
}

/** Sceglie un file .json e lo ripristina. */
function importBackup(): void {
  const input = el('input', { attrs: { type: 'file', accept: '.json,application/json' } });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const res = parseBackup(await file.text());
    if (!res.ok) {
      toast(t(res.reason === 'newer' ? 'settings.backupNewer' : 'settings.backupBad'), 'warn');
      return;
    }
    await restore(res.backup.save, res.backup.extra, res.backup.exportedAt);
  });
  input.click();
}

/** Elenco delle copie automatiche, ognuna con il suo "Ripristina". */
function snapshotList(): HTMLElement {
  const snaps = listSnapshots();
  if (snaps.length === 0) return el('p', { class: 'go-field__hint go-backup__empty', i18n: 'settings.backupNone' });
  return el(
    'ul',
    { class: 'go-backup__list' },
    ...snaps.map((s) =>
      el(
        'li',
        { class: 'go-backup__item' },
        el('span', { class: 'go-backup__date numeric', text: when(s.at) }),
        button(t('settings.backupRestore'), {
          variant: 'secondary',
          size: 'sm',
          onClick: () => void restore(s.save, s.extra, s.at),
        })
      )
    )
  );
}

export function openSettings(onLanguageChanged?: () => void): void {
  const s = settings();

  const body = div(
    'go-settings',

    group(
      'settings.language',
      fieldRow(
        'settings.language',
        segmented<Language>(
          [
            { value: 'it', label: 'Italiano' },
            { value: 'en', label: 'English' },
          ],
          s.language,
          (lang) => {
            actions.updateSettings({ language: lang });
            setLanguage(lang);
            // Ri-etichetta sia la modale aperta sia il resto dell'interfaccia.
            applyTranslations(document);
            onLanguageChanged?.();
          }
        )
      )
    ),

    group(
      'settings.audio',
      fieldRow(
        'settings.volumeMaster',
        slider(s.volumeMaster, (v) => actions.updateSettings({ volumeMaster: v }))
      ),
      fieldRow(
        'settings.volumeMusic',
        slider(s.volumeMusic, (v) => actions.updateSettings({ volumeMusic: v }))
      ),
      fieldRow(
        'settings.volumeSfx',
        slider(s.volumeSfx, (v) => actions.updateSettings({ volumeSfx: v }))
      ),
      fieldRow('settings.mute', toggle(s.muted, (v) => actions.updateSettings({ muted: v })))
    ),

    group(
      'settings.graphics',
      fieldRow(
        'settings.quality',
        segmented<Quality>(
          [
            { value: 'low', labelKey: 'settings.quality.low' },
            { value: 'medium', labelKey: 'settings.quality.medium' },
            { value: 'high', labelKey: 'settings.quality.high' },
            { value: 'ultra', labelKey: 'settings.quality.ultra' },
          ],
          s.quality,
          (q) => actions.updateSettings({ quality: q })
        ),
        'settings.qualityHint'
      ),
      fieldRow(
        'settings.reducedMotion',
        toggle(s.reducedMotion, (v) => actions.updateSettings({ reducedMotion: v })),
        'settings.reducedMotionHint'
      ),
      fieldRow('settings.showFps', toggle(s.showFps, (v) => actions.updateSettings({ showFps: v }))),
      fieldRow(
        'settings.renderer',
        el('span', {
          class: 'go-settings__renderer numeric',
          text: `${game.backend?.toUpperCase?.() ?? '—'} · ${Math.round(window.devicePixelRatio * 100) / 100}x`,
        })
      )
    ),

    group(
      'settings.gameplay',
      fieldRow(
        'settings.fastPlay',
        toggle(s.fastPlay, (v) => actions.updateSettings({ fastPlay: v })),
        'settings.fastPlayHint'
      ),
      fieldRow(
        'settings.vpTapMode',
        segmented<'hold' | 'discard'>(
          [
            { value: 'hold', label: t('settings.vpTapHold') },
            { value: 'discard', label: t('settings.vpTapDiscard') },
          ],
          s.vpTapMode,
          (v) => actions.updateSettings({ vpTapMode: v })
        ),
        'settings.vpTapModeHint'
      ),
      fieldRow(
        'settings.tutorials',
        button(t('settings.tutorialsBtn'), {
          variant: 'secondary',
          size: 'sm',
          onClick: () => {
            actions.resetTutorials();
            toast(t('settings.tutorialsDone'), 'info');
          },
        }),
        'settings.tutorialsHint'
      )
    ),

    group(
      'settings.backup',
      fieldRow(
        'settings.backupExport',
        button(t('settings.backupExportBtn'), { variant: 'secondary', size: 'sm', icon: '⬇', onClick: exportBackup }),
        'settings.backupExportHint'
      ),
      fieldRow(
        'settings.backupImport',
        button(t('settings.backupImportBtn'), { variant: 'secondary', size: 'sm', icon: '⬆', onClick: importBackup }),
        'settings.backupImportHint'
      ),
      div(
        'go-field go-field--stack',
        div(
          'go-field__text',
          el('span', { class: 'go-field__label', i18n: 'settings.backupAuto' }),
          el('span', { class: 'go-field__hint', i18n: 'settings.backupAutoHint' })
        ),
        snapshotList()
      )
    ),

    group(
      'settings.data',
      fieldRow(
        'settings.wipe',
        button({ i18n: 'settings.wipe' }, {
          variant: 'danger',
          size: 'sm',
          onClick: async () => {
            const ok = await confirmModal({
              titleKey: 'settings.wipe',
              messageKey: 'settings.wipeConfirm',
              confirmKey: 'settings.wipe',
              danger: true,
            });
            if (!ok) return;
            actions.wipeAll();
            toast(t('settings.wipeDone'), 'warn');
            // Ricaricare è il modo più affidabile di riportare OGNI parte
            // del gioco (scene, cache, listener) allo stato iniziale.
            setTimeout(() => location.reload(), 650);
          },
        })
      )
    )
  );

  // In fondo, e SOLO in modalita' Libera: serve per le presentazioni dal
  // vivo e non deve comparire a chi gioca in Carriera.
  if (store.getState().mode === 'freeplay') {
    body.append(
      group(
        'settings.demo',
        fieldRow('settings.demoBigWins', toggle(s.demoBigWins, (v) => actions.updateSettings({ demoBigWins: v }))),
        fieldRow('settings.demoFreeSpins', toggle(s.demoFreeSpins, (v) => actions.updateSettings({ demoFreeSpins: v }))),
        fieldRow('settings.demoHoldWin', toggle(s.demoHoldWin, (v) => actions.updateSettings({ demoHoldWin: v }))),
        fieldRow('settings.demoBonus', toggle(s.demoBonus, (v) => actions.updateSettings({ demoBonus: v })), 'settings.demoBonusHint'),
        // La spiegazione vale per tutti gli interruttori del gruppo: sta
        // sotto l'ultima riga, non dentro una di esse.
        el('p', { class: 'go-field__hint go-field__note', i18n: 'settings.demoHint' })
      ),
      group(
        'settings.freeplay',
        fieldRow(
          'settings.showSlotRtp',
          toggle(s.showSlotRtp, (v) => actions.updateSettings({ showSlotRtp: v })),
          'settings.showSlotRtpHint'
        )
      )
    );
  }

  showModal({ titleKey: 'settings.title', body, width: 760 });
}

export { closeModal };
