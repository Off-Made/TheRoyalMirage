/**
 * Il registro della giocata e' la garanzia strutturale contro il doppio
 * accredito. Se questi test passano, nessuna scena puo' pagare due volte
 * la stessa giocata, qualunque cosa facciano i suoi timer.
 */
import { describe, expect, it } from 'vitest';
import { RoundLedger } from '@/games/common/ledger';

describe('RoundLedger', () => {
  it('nasce chiuso', () => {
    const l = new RoundLedger();
    expect(l.open).toBe(false);
    expect(l.stake).toBe(0);
    expect(l.close()).toBeNull();
  });

  it('la prima puntata apre la giocata', () => {
    const l = new RoundLedger();
    l.add(50);
    expect(l.open).toBe(true);
    expect(l.stake).toBe(50);
  });

  it('somma i costi aggiuntivi della stessa giocata (raddoppio, divisione)', () => {
    const l = new RoundLedger();
    l.add(100); // puntata
    l.add(100); // raddoppio
    l.add(50); // assicurazione
    expect(l.stake).toBe(250);
    expect(l.close()).toEqual({ stake: 250 });
  });

  it(`chiude una volta sola: il secondo accredito è un doppione`, () => {
    const l = new RoundLedger();
    l.add(10);
    expect(l.close()).toEqual({ stake: 10 });
    // Questo e' il caso reale: l'animazione finisce DOPO che l'uscita a meta'
    // ha gia' pagato. Deve restituire null, non ripagare.
    expect(l.close()).toBeNull();
    expect(l.close()).toBeNull();
    expect(l.open).toBe(false);
  });

  it(`dopo la chiusura si può giocare di nuovo da zero`, () => {
    const l = new RoundLedger();
    l.add(10);
    l.close();
    l.add(25);
    expect(l.stake).toBe(25);
    expect(l.close()).toEqual({ stake: 25 });
  });

  it('non riapre una giocata chiusa senza una nuova puntata', () => {
    const l = new RoundLedger();
    l.add(10);
    l.close();
    expect(l.open).toBe(false);
    expect(l.close()).toBeNull();
  });
});
