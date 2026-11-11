/**
 * THE ROYAL MIRAGE — HUD dei giochi
 *
 * La plancia comune a tutti i tavoli: in alto uscita, nome del gioco e
 * regole; in basso saldo, puntata, vincita e il pulsante d'azione.
 *
 * ── Perche' in DOM e non in canvas ──
 * I numeri del saldo devono essere nitidi a qualunque scala, i pulsanti
 * raggiungibili da tastiera e lettori di schermo. Il contenitore e' un
 * `.design-space`: le misure sono in pixel di design 1920x1080, le stesse
 * coordinate del canvas, quindi l'HUD si allinea al gioco su ogni schermo.
 *
 * Fascia riservata: le scene di gioco disegnano fra y=96 e y=930.
 */

import { button, div, el } from '@/ui/dom/el';
import { t } from '@/i18n';
import { store, wallet, actions, betCeiling } from '@/state/store';
import { formatMoney, parseMoney, clampBet, MIN_BET, QUICK_CHIPS } from '@/state/wallet';
import { sfxChip } from '@/audio/synth';

export const HUD_TOP = 96;
export const HUD_BOTTOM = 930;

export interface HudOptions {
  title: string;
  /** Etichetta iniziale del pulsante principale. */
  primaryLabel: string;
  onPrimary: () => void;
  onExit: () => void;
  onInfo?: () => void;
  /** Riapre il tutorial guidato del gioco (pulsante "Guida"). */
  onHelp?: () => void;
  /**
   * 'stepper' = campo libero con −/+ (slot, crash, video poker);
   * 'chips'   = campo libero + fiche rapide (tavoli: l'importo e' la fiche
   *             che si posa su ogni casella); 'none' = nascosto.
   */
  betMode?: 'stepper' | 'chips' | 'none';
  /** Etichetta del contatore puntata (default "Puntata"). */
  betLabel?: string;
  /**
   * Moltiplicatore della giocata: la giocata vale `puntata × factor`.
   * Il video poker passa le monete in gioco (1-5), perche' la sua "puntata"
   * e' il valore di UNA moneta. Senza, ALL-IN imposterebbe la moneta al saldo
   * intero e con 5 monete servirebbe il quintuplo. Default 1.
   */
  stakeFactor?: () => number;
  /**
   * Riga sotto il campo puntata, ricalcolata a ogni aggiornamento. Il video
   * poker la usa per dire in chiaro "× 5 monete = 20,00 €": il campo e' il
   * valore di UNA moneta e da solo trae in inganno.
   */
  betNote?: () => string;
}

export class GameHud {
  readonly root: HTMLDivElement;
  private balanceEl: HTMLElement;
  /** Il campo della puntata libera. Mostra l'importo formattato a riposo. */
  private betEl: HTMLInputElement;
  /** Vero mentre il giocatore scrive: `refresh()` non deve sovrascrivere. */
  private editing = false;
  private winEl: HTMLElement;
  private msgEl: HTMLElement;
  private primary: HTMLButtonElement;
  private betGroup: HTMLElement;
  private betNoteEl: HTMLElement | null = null;
  private chipRow: HTMLElement | null = null;
  /** Area libera a sinistra del pulsante principale per i controlli del gioco. */
  readonly extra: HTMLElement;
  /** Area libera in alto a destra, accanto alle regole. */
  readonly topExtra: HTMLElement;
  /**
   * Fila di mosse grandi, centrata nella barra (blackjack: Carta, Stai...).
   * Visibile solo con `setActing(true)`: in quel momento la puntata e la
   * vincita si nascondono e la fila ne prende il posto.
   */
  readonly actions: HTMLElement;
  private unsub: () => void;
  private betLocked = false;
  private shownBalance = -1;
  private onKey: (e: KeyboardEvent) => void;

  constructor(private opts: HudOptions) {
    const mode = opts.betMode ?? 'stepper';

    const exit = button(t('hud.exit'), { variant: 'ghost', size: 'sm', icon: '‹', onClick: opts.onExit });
    exit.classList.add('go-hud__exit');

    this.topExtra = div('go-hud__top-extra');
    const info = opts.onInfo
      ? button(t('hud.paytable'), { variant: 'secondary', size: 'sm', icon: 'ℹ', onClick: opts.onInfo })
      : null;

    const help = opts.onHelp
      ? button(t('hud.tutorial'), { variant: 'secondary', size: 'sm', icon: '?', onClick: opts.onHelp })
      : null;
    help?.classList.add('go-hud__help');
    info?.classList.add('go-hud__info');

    const top = div(
      'go-hud__top',
      exit,
      el('h1', { class: 'go-hud__title', text: opts.title }),
      div('go-hud__top-right', this.topExtra, help, info)
    );

    this.balanceEl = el('span', { class: 'go-hud__value numeric' });
    this.betEl = this.buildBetInput();
    this.winEl = el('span', { class: 'go-hud__value go-hud__value--win numeric', text: formatMoney(0) });

    const meter = (label: string, value: HTMLElement, cls = '') =>
      div(`go-hud__meter ${cls}`, el('span', { class: 'go-hud__label', text: label }), value);

    // −/+ dimezzano e raddoppiano: sono gli stessi ½ e ×2 della griglia
    // rapida, messi ai lati del campo dove il pollice li cerca.
    const minus = el('button', {
      class: 'go-hud__step',
      text: '−',
      attrs: { type: 'button', 'aria-label': t('hud.half'), 'data-quick': 'half', 'data-sfx': 'own' },
      on: { click: () => this.quick('half') },
    });
    const plus = el('button', {
      class: 'go-hud__step',
      text: '+',
      attrs: { type: 'button', 'aria-label': t('hud.double'), 'data-quick': 'double', 'data-sfx': 'own' },
      on: { click: () => this.quick('double') },
    });

    const betMeter = meter(opts.betLabel ?? t('hud.bet'), this.betEl, 'go-hud__meter--bet');
    if (opts.betNote) {
      this.betNoteEl = el('span', { class: 'go-hud__betnote' });
      betMeter.append(this.betNoteEl);
    }
    this.betGroup =
      mode === 'chips'
        ? div('go-hud__bet go-hud__bet--chips', this.buildChips(), betMeter, this.buildQuick())
        : div('go-hud__bet', minus, betMeter, plus, this.buildQuick());
    if (mode === 'none') this.betGroup.style.display = 'none';

    this.extra = div('go-hud__extra');
    this.actions = div('go-hud__actions');
    this.msgEl = el('p', { class: 'go-hud__msg', attrs: { 'aria-live': 'polite' } });

    this.primary = button(opts.primaryLabel, { variant: 'primary', size: 'lg', onClick: () => this.firePrimary() });
    this.primary.classList.add('go-hud__primary');

    const bar = div(
      'go-hud__bar',
      meter(t('hud.balance'), this.balanceEl, 'go-hud__meter--balance'),
      this.betGroup,
      meter(t('hud.win'), this.winEl, 'go-hud__meter--win'),
      this.extra,
      this.primary,
      this.actions
    );

    this.root = div('design-space go-hud', top, this.msgEl, bar);

    this.unsub = store.subscribe(() => this.refresh());
    this.refresh();

    // Spazio/Invio = azione principale. Ignorato se il fuoco e' su un campo
    // o su un altro pulsante (Invio su un pulsante deve premere QUEL pulsante).
    this.onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const tgt = e.target as HTMLElement | null;
      if (tgt && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(tgt.tagName)) return;
      if (document.querySelector('.go-modal')) return;
      e.preventDefault();
      this.firePrimary();
    };
    window.addEventListener('keydown', this.onKey);

    document.getElementById('overlay')?.append(this.root);
    requestAnimationFrame(() => this.root.classList.add('is-in'));
  }

  /** Mostra la fila delle mosse al posto di puntata e vincita. */
  setActing(on: boolean): void {
    this.root.classList.toggle('is-acting', on);
  }

  private firePrimary(): void {
    if (this.primary.disabled) return;
    this.opts.onPrimary();
  }

  /**
   * Il campo della puntata libera.
   *
   * A riposo mostra l'importo formattato ("1,00 €"); al fuoco passa al
   * numero nudo ("1,00") gia' selezionato, cosi' si sovrascrive scrivendo.
   * Invio o uscita dal campo confermano, Esc annulla.
   *
   * Un importo non leggibile NON diventa una puntata a caso: si torna al
   * valore precedente e si dice perche'. Un importo fuori dai limiti si
   * corregge al limite piu' vicino, e anche questo si dice — una puntata
   * cambiata in silenzio e' il modo piu' rapido di perdere la fiducia.
   */
  private buildBetInput(): HTMLInputElement {
    const input = el('input', {
      class: 'go-hud__value go-hud__input numeric',
      attrs: {
        type: 'text',
        inputmode: 'decimal',
        autocomplete: 'off',
        spellcheck: 'false',
        'aria-label': t('hud.betEdit'),
        title: t('hud.betEdit'),
      },
    }) as HTMLInputElement;

    const commit = () => {
      if (!this.editing) return;
      this.editing = false;
      this.applyTyped(input.value);
    };
    input.addEventListener('focus', () => {
      if (this.betLocked) {
        input.blur();
        return;
      }
      this.editing = true;
      // Il numero senza simbolo e senza spazi: si scrive sopra senza cancellare.
      input.value = (wallet().bet / 100).toFixed(2).replace('.', ',');
      // Solo se si sta ANCORA scrivendo: chi incolla e preme Invio entro un
      // fotogramma ha gia' confermato, e `select()` su quel campo lo
      // rimetterebbe a fuoco riaprendo la modifica appena chiusa.
      requestAnimationFrame(() => {
        if (this.editing && document.activeElement === input) input.select();
      });
    });
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
        input.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        // L'Esc della plancia esce dal tavolo: dentro il campo deve solo annullare.
        e.stopPropagation();
        this.editing = false;
        input.blur();
        this.refresh();
      }
    });
    return input;
  }

  private get factor(): number {
    return this.opts.stakeFactor?.() ?? 1;
  }

  /** Tetto della puntata: il saldo, diviso per il moltiplicatore della giocata. */
  private ceil(): number {
    return betCeiling(this.factor);
  }

  /** Converte cio' che e' stato scritto in una puntata, spiegando ogni correzione. */
  private applyTyped(text: string): void {
    const cents = parseMoney(text);
    if (cents === null) {
      this.flashInput();
      this.message(t('hud.betInvalid'), 'warn');
      this.refresh();
      return;
    }
    const ceil = this.ceil();
    const bet = clampBet(cents, ceil);
    if (cents > ceil) this.message(t('hud.betCapped', { amount: formatMoney(bet) }), 'warn');
    else if (cents < MIN_BET) this.message(t('hud.betRaised', { amount: formatMoney(MIN_BET) }), 'warn');
    else this.message('');
    sfxChip();
    actions.setBet(bet);
    this.refresh();
  }

  private flashInput(): void {
    this.betEl.classList.remove('is-invalid');
    void this.betEl.offsetWidth;
    this.betEl.classList.add('is-invalid');
  }

  /** MIN · ½ · ×2 · ALL-IN. Niente MAX: senza tetto coinciderebbe con ALL-IN. */
  private buildQuick(): HTMLElement {
    const q = (kind: QuickKind, cls = '') =>
      el('button', {
        class: `go-hud__quick ${cls}`.trim(),
        text: t(`hud.${kind}`),
        attrs: { type: 'button', 'data-quick': kind, 'data-sfx': 'own' },
        on: { click: () => this.quick(kind) },
      });
    return div('go-hud__quickgrid', q('min'), q('half'), q('double'), q('allIn', 'go-hud__quick--allin'));
  }

  private quick(kind: QuickKind): void {
    if (this.betLocked) return;
    sfxChip();
    if (kind === 'min') actions.minBet();
    else if (kind === 'half') actions.halfBet();
    else if (kind === 'double') actions.doubleBet(this.factor);
    else {
      // ALL-IN imposta la puntata, NON gioca: il giro lo decide il giocatore.
      // Il messaggio dice la GIOCATA totale, che e' cio' che si rischia.
      actions.allIn(this.factor);
      this.message(t('hud.allInSet', { amount: formatMoney(wallet().bet * this.factor) }), 'warn');
      return;
    }
    this.message('');
  }

  /** Fiche rapide dei tavoli: scorciatoie verso importi tondi. */
  private buildChips(): HTMLElement {
    const row = div('go-hud__chips');
    this.chipRow = row;
    for (const v of QUICK_CHIPS) {
      const chip = el('button', {
        class: `go-chip go-chip--${chipTone(v)}`,
        text: chipLabel(v),
        attrs: { type: 'button', 'data-value': v, 'aria-label': formatMoney(v), 'data-sfx': 'own' },
        on: {
          click: () => {
            if (this.betLocked) return;
            sfxChip();
            actions.setBet(v);
            this.message('');
          },
        },
      });
      row.append(chip);
    }
    return row;
  }

  /** Ridisegna i contatori dallo store. */
  refresh(): void {
    const w = wallet();
    if (w.balance !== this.shownBalance) {
      // Lampo sul saldo quando cresce: il feedback che "i soldi sono arrivati".
      if (this.shownBalance >= 0 && w.balance > this.shownBalance) {
        this.balanceEl.classList.remove('is-up');
        void this.balanceEl.offsetWidth;
        this.balanceEl.classList.add('is-up');
      }
      this.shownBalance = w.balance;
      this.balanceEl.textContent = formatMoney(w.balance);
    }
    if (!this.editing) this.betEl.value = formatMoney(w.bet);
    if (this.betNoteEl && this.opts.betNote) this.betNoteEl.textContent = this.opts.betNote();
    this.betEl.disabled = this.betLocked;
    const ceil = this.ceil();
    if (this.chipRow) {
      for (const c of this.chipRow.querySelectorAll<HTMLButtonElement>('.go-chip')) {
        const v = Number(c.dataset.value);
        c.classList.toggle('is-active', v === w.bet);
        c.disabled = this.betLocked || v > ceil;
      }
    }
    // I comandi rapidi si spengono quando non cambierebbero nulla: un ×2 col
    // saldo gia' tutto in puntata che "non fa niente" sembra un pulsante rotto.
    for (const b of this.betGroup.querySelectorAll<HTMLButtonElement>('[data-quick]')) {
      const k = b.dataset.quick as QuickKind;
      const noop =
        (k === 'min' && w.bet === MIN_BET) ||
        (k === 'half' && clampBet(w.bet / 2, w.balance) === w.bet) ||
        (k === 'double' && clampBet(w.bet * 2, ceil) === w.bet) ||
        (k === 'allIn' && w.bet === clampBet(ceil, w.balance));
      b.disabled = this.betLocked || noop;
    }
    // ALL-IN acceso quando la puntata e' tutto il saldo: lo stato a rischio
    // deve restare visibile finche' dura, non solo nel messaggio di un attimo.
    this.betGroup.querySelector('.go-hud__quick--allin')?.classList.toggle('is-on', w.bet === clampBet(ceil, w.balance));
  }

  setPrimary(label: string, opts: { enabled?: boolean; variant?: 'primary' | 'danger' | 'secondary' } = {}): void {
    const lab = this.primary.querySelector('.go-btn__label');
    if (lab) lab.textContent = label;
    this.primary.disabled = opts.enabled === false;
    this.primary.classList.remove('go-btn--primary', 'go-btn--danger', 'go-btn--secondary');
    this.primary.classList.add(`go-btn--${opts.variant ?? 'primary'}`);
  }

  setPrimaryEnabled(on: boolean): void {
    this.primary.disabled = !on;
  }

  /** Blocca la scelta della puntata durante una giocata. */
  lockBet(locked: boolean): void {
    this.betLocked = locked;
    this.betGroup.classList.toggle('is-locked', locked);
    for (const b of this.betGroup.querySelectorAll<HTMLButtonElement>('button')) b.disabled = locked;
    this.refresh();
  }

  setWin(amount: number): void {
    this.winEl.textContent = formatMoney(amount);
    this.winEl.classList.toggle('is-hot', amount > 0);
  }

  /** Messaggio di stato al centro sopra la barra ("Puntate chiuse", "Blackjack!"). */
  message(text: string, kind: 'info' | 'win' | 'warn' = 'info'): void {
    this.msgEl.textContent = text;
    this.msgEl.className = `go-hud__msg is-${kind} ${text ? 'is-shown' : ''}`;
  }

  /**
   * La fascia libera fra barra alta e console, in px di design.
   *
   * Si legge da `offsetTop`/`offsetHeight` e non dal rettangolo a schermo:
   * le barre entrano con una traslazione, e il valore deve essere quello di
   * arrivo, non quello del primo fotogramma.
   */
  band(): { top: number; bottom: number } {
    const top = this.root.querySelector<HTMLElement>('.go-hud__top');
    const bar = this.root.querySelector<HTMLElement>('.go-hud__bar');
    return {
      top: top ? top.offsetTop + top.offsetHeight : HUD_TOP,
      bottom: bar ? bar.offsetTop : HUD_BOTTOM,
    };
  }

  destroy(): void {
    this.unsub();
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }
}

type QuickKind = 'min' | 'half' | 'double' | 'allIn';

/**
 * Colore della fiche per taglio (in centesimi), come nei casino' veri:
 * bianca, azzurra, rossa, blu, verde, nera, viola, oro.
 */
export function chipTone(cents: number): string {
  if (cents >= 50_000) return 'gold';
  if (cents >= 10_000) return 'amethyst';
  if (cents >= 2_500) return 'black';
  if (cents >= 1_000) return 'emerald';
  if (cents >= 500) return 'lapis';
  if (cents >= 100) return 'red';
  if (cents >= 50) return 'sapphire';
  return 'ivory';
}

/** Etichetta corta sulla fiche: "0,10", "1", "25", "500". Senza simbolo: e' una fiche. */
export function chipLabel(cents: number): string {
  const euro = cents / 100;
  return Number.isInteger(euro) ? String(euro) : euro.toFixed(2).replace('.', ',');
}
