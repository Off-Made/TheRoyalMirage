/**
 * Il denaro del gioco: euro, contati in CENTESIMI INTERI.
 *
 * Il portafoglio ha sempre contato in interi per non accumulare l'errore dei
 * float (0.1 + 0.2 !== 0.3). Passando agli euro con i centesimi non si
 * introducono decimali: si cambia solo l'unita' — 100,00 € sono 10_000.
 *
 * Questi test coprono le funzioni pure: lettura di cio' che il giocatore
 * scrive, formattazione, e i comandi rapidi della puntata.
 */
import { describe, expect, it } from 'vitest';
import {
  MIN_BET,
  STARTING_BALANCE,
  clampBet,
  doubleBet,
  formatMoney,
  formatMoneyShort,
  halfBet,
  isBroke,
  parseMoney,
} from '@/state/wallet';

describe('unita di misura', () => {
  it('il saldo iniziale e 100 euro, cioe 10.000 centesimi', () => {
    expect(STARTING_BALANCE).toBe(10_000);
    expect(formatMoney(STARTING_BALANCE).replace(/\s/g, ' ')).toBe('100,00 €');
  });

  it('la puntata minima e 10 centesimi', () => {
    expect(MIN_BET).toBe(10);
  });
});

describe('formatMoney', () => {
  it.each([
    [0, '0,00 €'],
    [1, '0,01 €'],
    [10, '0,10 €'],
    [150, '1,50 €'],
    [10_000, '100,00 €'],
    [123_456_789, '1.234.567,89 €'],
  ])('%i centesimi → %s', (cents, out) => {
    // Lo spazio fra cifra ed euro puo' essere uno spazio non separabile:
    // lo si normalizza per confrontare il testo, non il carattere.
    expect(formatMoney(cents).replace(/\s/g, ' ')).toBe(out);
  });

  it('arrotonda un importo non intero invece di stampare decimali spuri', () => {
    expect(formatMoney(150.4).replace(/\s/g, ' ')).toBe('1,50 €');
  });
});

describe('formatMoneyShort', () => {
  it('sotto i mille euro mostra i centesimi', () => {
    expect(formatMoneyShort(99_999).replace(/\s/g, ' ')).toBe('999,99 €');
  });
  it('oltre i diecimila euro abbrevia', () => {
    expect(formatMoneyShort(1_234_500).replace(/\s/g, ' ')).toBe('12,3 K €');
    expect(formatMoneyShort(250_000_000).replace(/\s/g, ' ')).toBe('2,50 M €');
  });
});

describe('parseMoney — cio che il giocatore scrive', () => {
  it.each([
    ['5', 500],
    ['5,5', 550],
    ['5,50', 550],
    ['5.50', 550],
    ['0,10', 10],
    ['  12 ', 1200],
    ['12 €', 1200],
    ['€12', 1200],
    ['1.234,56', 123_456],
    ['1234.56', 123_456],
    ['1 234,56', 123_456],
  ])('"%s" → %i centesimi', (input, cents) => {
    expect(parseMoney(input)).toBe(cents);
  });

  it('arrotonda al centesimo oltre la seconda cifra decimale', () => {
    expect(parseMoney('1,005')).toBe(101);
    expect(parseMoney('1,004')).toBe(100);
  });

  it.each(['', '   ', 'abc', '-5', '−5', '5-', '1,2,3', '..', 'NaN', 'Infinity', '1e3'])(
    'rifiuta "%s"',
    (input) => {
      expect(parseMoney(input)).toBeNull();
    }
  );
});

describe('clampBet — la puntata resta fra il minimo e il saldo', () => {
  it('non supera il saldo', () => {
    expect(clampBet(50_000, 10_000)).toBe(10_000);
  });
  it('non scende sotto la puntata minima', () => {
    expect(clampBet(3, 10_000)).toBe(MIN_BET);
    expect(clampBet(-500, 10_000)).toBe(MIN_BET);
  });
  it('NaN e Infinity ripiegano sul minimo, mai su NaN', () => {
    expect(clampBet(Number.NaN, 10_000)).toBe(MIN_BET);
    expect(clampBet(Number.POSITIVE_INFINITY, 10_000)).toBe(10_000);
  });
  it('arrotonda al centesimo intero', () => {
    expect(clampBet(123.6, 10_000)).toBe(124);
  });
  it('nessun tetto oltre al saldo: un saldo enorme si puo puntare tutto', () => {
    expect(clampBet(9_999_999_999, 9_999_999_999)).toBe(9_999_999_999);
  });
});

describe('comandi rapidi', () => {
  it('½ dimezza arrotondando, senza scendere sotto il minimo', () => {
    expect(halfBet(1_000, 10_000)).toBe(500);
    expect(halfBet(15, 10_000)).toBe(MIN_BET);
    expect(halfBet(333, 10_000)).toBe(167);
  });
  it('×2 raddoppia senza superare il saldo', () => {
    expect(doubleBet(1_000, 10_000)).toBe(2_000);
    expect(doubleBet(6_000, 10_000)).toBe(10_000);
  });
});

describe('isBroke — quando mostrare la schermata del saldo esaurito', () => {
  it('a zero si e a secco', () => {
    expect(isBroke(0)).toBe(true);
  });
  it('sotto la puntata minima non si puo piu giocare', () => {
    expect(isBroke(MIN_BET - 1)).toBe(true);
  });
  it('con la puntata minima si gioca ancora', () => {
    expect(isBroke(MIN_BET)).toBe(false);
  });
});
