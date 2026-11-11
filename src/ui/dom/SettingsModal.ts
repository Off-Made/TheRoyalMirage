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
import { settings, actions } from '@/state/store';
import type { Language, Quality } from '@/state/settings';
import { setLanguage, applyTranslations } from '@/i18n';
import { game } from '@/core/App';
import { toast } from './Toasts';
import { t } from '@/i18n';

function group(titleKey: string, ...rows: Node[]): HTMLElement {
  return div('go-group', el('h3', { class: 'go-group__title', i18n: titleKey }), ...rows);
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

  showModal({ titleKey: 'settings.title', body, width: 760 });
}

export { closeModal };
