/**
 * THE ROYAL MIRAGE — Mattoni DOM
 *
 * Micro-helper per costruire l'interfaccia in TypeScript senza template
 * engine e senza `innerHTML`.
 *
 * ── Perche' non innerHTML ──
 * Il nome profilo e' inserito dall'utente. Con `innerHTML` basterebbe
 * chiamarsi `<img onerror=...>` per eseguire codice. Costruendo i nodi e
 * assegnando `textContent`, l'iniezione e' impossibile per costruzione,
 * non per sanificazione.
 */

type Child = Node | string | number | null | undefined | false;

export interface ElProps {
  class?: string;
  id?: string;
  text?: string | number;
  html?: never; // volutamente vietato
  /** Attributi arbitrari (aria-*, data-*, type, min, max...). */
  attrs?: Record<string, string | number | boolean | undefined>;
  style?: Partial<CSSStyleDeclaration>;
  /** Chiave i18n: diventa `data-i18n`, risolta da applyTranslations(). */
  i18n?: string;
  /** Traduzione in attributo: { placeholder: 'profile.namePlaceholder' }. */
  i18nAttr?: Record<string, string>;
  on?: Partial<{
    [K in keyof HTMLElementEventMap]: (e: HTMLElementEventMap[K]) => void;
  }>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  if (props.class) node.className = props.class;
  if (props.id) node.id = props.id;
  if (props.text !== undefined) node.textContent = String(props.text);
  if (props.i18n) node.dataset.i18n = props.i18n;
  if (props.i18nAttr) {
    node.dataset.i18nAttr = Object.entries(props.i18nAttr)
      .map(([a, k]) => `${a}:${k}`)
      .join(',');
  }
  if (props.attrs) {
    for (const [k, v] of Object.entries(props.attrs)) {
      if (v === undefined || v === false) continue;
      node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  if (props.style) Object.assign(node.style, props.style);
  if (props.on) {
    for (const [evt, fn] of Object.entries(props.on)) {
      node.addEventListener(evt, fn as EventListener);
    }
  }

  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** Scorciatoia per `<div>`. */
export const div = (cls?: string, ...children: Child[]): HTMLDivElement =>
  el('div', cls ? { class: cls } : {}, ...children);

export const span = (cls?: string, text?: string | number): HTMLSpanElement =>
  el('span', { class: cls, text });

export interface ButtonOptions extends ElProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  /** Glifo decorativo a sinistra dell'etichetta. */
  icon?: string;
  onClick?: (e: MouseEvent) => void;
}

export function button(label: string | { i18n: string }, opts: ButtonOptions = {}): HTMLButtonElement {
  const classes = [
    'go-btn',
    `go-btn--${opts.variant ?? 'secondary'}`,
    `go-btn--${opts.size ?? 'md'}`,
    opts.class ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const children: Child[] = [];
  if (opts.icon) {
    // aria-hidden: il glifo e' decorativo, uno screen reader non deve leggerlo.
    children.push(el('span', { class: 'go-btn__icon', text: opts.icon, attrs: { 'aria-hidden': true } }));
  }
  children.push(
    typeof label === 'string'
      ? el('span', { class: 'go-btn__label', text: label })
      : el('span', { class: 'go-btn__label', i18n: label.i18n })
  );

  const btn = el(
    'button',
    {
      class: classes,
      attrs: { type: 'button', ...opts.attrs },
      on: opts.onClick ? { click: opts.onClick } : undefined,
    },
    ...children
  );
  // Riflesso che attraversa il pulsante all'hover (puro CSS, vedi shell.css).
  btn.append(el('span', { class: 'go-btn__sheen', attrs: { 'aria-hidden': true } }));
  return btn;
}

/** Riga etichetta + controllo, il pattern di tutte le impostazioni. */
export function fieldRow(labelKey: string, control: Node, hintKey?: string): HTMLDivElement {
  return div(
    'go-field',
    div(
      'go-field__text',
      el('span', { class: 'go-field__label', i18n: labelKey }),
      hintKey ? el('span', { class: 'go-field__hint', i18n: hintKey }) : null
    ),
    div('go-field__control', control)
  );
}

/** Interruttore acceso/spento accessibile (usa un vero checkbox sotto). */
export function toggle(checked: boolean, onChange: (v: boolean) => void): HTMLLabelElement {
  const input = el('input', {
    class: 'go-toggle__input',
    attrs: { type: 'checkbox', ...(checked ? { checked: true } : {}) },
    on: { change: (e) => onChange((e.target as HTMLInputElement).checked) },
  });
  return el('label', { class: 'go-toggle' }, input, el('span', { class: 'go-toggle__track' }));
}

/** Slider 0..1 con valore mostrato in percentuale. */
export function slider(
  value: number,
  onInput: (v: number) => void,
  opts: { min?: number; max?: number; step?: number; format?: (v: number) => string } = {}
): HTMLDivElement {
  const { min = 0, max = 1, step = 0.01 } = opts;
  const fmt = opts.format ?? ((v: number) => `${Math.round(v * 100)}%`);
  const out = el('span', { class: 'go-slider__value numeric', text: fmt(value) });
  const input = el('input', {
    class: 'go-slider__input',
    attrs: { type: 'range', min, max, step, value },
    on: {
      input: (e) => {
        const v = Number((e.target as HTMLInputElement).value);
        out.textContent = fmt(v);
        onInput(v);
      },
    },
  });
  return div('go-slider', input, out);
}

/** Gruppo di pulsanti a selezione singola (lingua, qualita', modalita'). */
export function segmented<T extends string>(
  options: { value: T; labelKey?: string; label?: string }[],
  current: T,
  onChange: (v: T) => void
): HTMLDivElement {
  const wrap = div('go-segmented');
  wrap.setAttribute('role', 'radiogroup');
  for (const o of options) {
    const b = el('button', {
      class: `go-seg${o.value === current ? ' is-active' : ''}`,
      attrs: { type: 'button', role: 'radio', 'aria-checked': o.value === current, 'data-value': o.value },
      text: o.label,
      i18n: o.labelKey,
      on: {
        click: () => {
          for (const child of wrap.children) {
            const active = child.getAttribute('data-value') === o.value;
            child.classList.toggle('is-active', active);
            child.setAttribute('aria-checked', String(active));
          }
          onChange(o.value);
        },
      },
    });
    wrap.append(b);
  }
  return wrap;
}

/** Barra di progresso (XP verso il rango successivo). */
export function progressBar(ratio: number, cls = ''): HTMLDivElement {
  const fill = div('go-progress__fill');
  fill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  const bar = div(`go-progress ${cls}`.trim(), fill);
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', '100');
  bar.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  return bar;
}

/** Svuota un nodo senza innerHTML (che lascerebbe i listener appesi). */
export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}
