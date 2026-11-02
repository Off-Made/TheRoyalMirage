/**
 * THE ROYAL MIRAGE — Dizionario del Crash
 * Italiano e inglese, chiavi identiche (il tipo lo impone).
 */
import { defineStrings } from '@/games/common/strings';

export const cs = defineStrings({
  it: {
    // ── Pulsante principale e stati
    fly: 'Vola',
    cashOut: 'Incassa ×{m}',
    launching: 'Decollo…',
    waiting: 'Prossimo volo…',
    placeBet: 'Punta e fai salire la fiche d’oro: incassa prima che vada in pezzi',
    insufficient: 'Saldo insufficiente per questa puntata',
    cashedOut: 'Incassato a ×{m} — {win} fiche',
    cashedShort: 'Incassato a ×{m}',
    crashed: 'Schianto a ×{m}',
    crashedLost: 'Schianto a ×{m}: puntata persa',
    cryptoFail: 'Equità non verificabile su questa pagina: puntata restituita',

    // ── Auto-incasso
    autoLabel: 'Auto',
    autoHint: 'Incassa automaticamente a questo moltiplicatore',
    autoOn: 'Auto-incasso a ×{m}',
    autoOff: 'Auto-incasso disattivato',

    // ── Grafico e tabellone
    multiplier: 'Moltiplicatore',
    history: 'Ultimi voli',
    noHistory: 'Nessun volo ancora',

    // ── Modale regole
    rulesHow: 'Come si gioca',
    rulesHow1:
      'Punta, poi la fiche d’oro si alza e il moltiplicatore sale. Premi «Incassa» quando vuoi: ricevi la puntata moltiplicata per il valore mostrato in quell’istante. Se la fiche va in pezzi prima, la puntata è persa.',
    rulesHow2:
      'Il punto di schianto è deciso PRIMA del decollo, dal seme del volo: non dipende da quando premi. Per questo uscire dal tavolo a volo in corso incassa al moltiplicatore corrente invece di perdere la puntata — l’esito era già fissato e non c’è nulla da sfruttare.',
    rulesHow3:
      'L’auto-incasso chiude il volo da solo al moltiplicatore che scrivi. Utile perché nessuna strategia batte un’altra: cambia solo quanto spesso vinci e quanto vinci.',
    rulesPays: 'Pagamenti e probabilità',
    rulesPays1:
      'Incassare a ×m paga m volte la puntata. La probabilità di arrivare a ×m è 0,99 / m: a ×2 è il 49,5%, a ×10 il 9,9%, a ×100 lo 0,99%.',
    rulesPays2:
      'Il ritorno teorico è {rtp}% per QUALUNQUE obiettivo di incasso: m × 0,99 / m = 0,99. Il margine del banco sta nel 99 al posto di 100, e nei voli che si schiantano subito a ×1,00 (circa 1,98%).',

    // ── Modale equità
    fairTitle: 'Equità dimostrabile',
    fairIntro:
      'Prima di ogni volo il banco genera un seme segreto di 32 byte e ne pubblica solo l’impronta SHA-256. Il punto di schianto è HMAC-SHA256(seme server, «seme client : nonce»): cambiare il seme dopo aver mostrato l’impronta è impossibile senza farsi scoprire. A volo concluso il seme viene rivelato e tu puoi ricalcolare tutto.',
    fairCommit: 'Impronta del volo corrente (SHA-256 del seme segreto)',
    fairClientSeed: 'Il tuo seme',
    fairClientApply: 'Applica',
    fairClientOk: 'Seme aggiornato: vale dal prossimo volo.',
    fairClientLocked: 'Il volo corrente è già deciso: il seme si cambia a volo finito.',
    fairNonce: 'Nonce',
    fairLast: 'Ultimo volo rivelato',
    fairNone: 'Nessun volo concluso in questa sessione: gioca una volta e il seme verrà rivelato qui.',
    fairSeed: 'Seme server rivelato',
    fairCrash: 'Schianto',
    fairVerify: 'Verifica questo volo',
    fairOk: 'Verificato: l’impronta corrisponde al seme e il moltiplicatore ricalcolato è ×{m}.',
    fairBad: 'ATTENZIONE: la verifica non torna. Impronta {hash}, schianto {crash}.',
    fairFormula: 'Formula: crash = max(1,00 ; floor(99 / (1 − X)) / 100), con X = primi 52 bit dell’HMAC / 2^52.',
  },
  en: {
    fly: 'Fly',
    cashOut: 'Cash out ×{m}',
    launching: 'Taking off…',
    waiting: 'Next flight…',
    placeBet: 'Bet and send the golden chip up: cash out before it shatters',
    insufficient: 'Not enough chips for this bet',
    cashedOut: 'Cashed out at ×{m} — {win} chips',
    cashedShort: 'Cashed out at ×{m}',
    crashed: 'Crashed at ×{m}',
    crashedLost: 'Crashed at ×{m}: bet lost',
    cryptoFail: 'Fairness cannot be verified on this page: bet refunded',

    autoLabel: 'Auto',
    autoHint: 'Cash out automatically at this multiplier',
    autoOn: 'Auto cash out at ×{m}',
    autoOff: 'Auto cash out off',

    multiplier: 'Multiplier',
    history: 'Recent flights',
    noHistory: 'No flights yet',

    rulesHow: 'How to play',
    rulesHow1:
      'Place a bet, the golden chip rises and the multiplier climbs. Hit "Cash out" whenever you like: you get your bet times the value shown at that instant. If the chip shatters first, the bet is lost.',
    rulesHow2:
      'The crash point is decided BEFORE take-off by the flight seed: it does not depend on when you press. That is why leaving the table mid-flight cashes out at the current multiplier instead of losing the bet — the outcome was already fixed, so there is nothing to exploit.',
    rulesHow3:
      'Auto cash out closes the flight for you at the multiplier you type. Useful because no strategy beats another: it only changes how often you win and how much.',
    rulesPays: 'Pays and odds',
    rulesPays1:
      'Cashing out at ×m pays m times the bet. The chance of reaching ×m is 0.99 / m: 49.5% at ×2, 9.9% at ×10, 0.99% at ×100.',
    rulesPays2:
      'Theoretical return is {rtp}% for ANY cash-out target: m × 0.99 / m = 0.99. The house edge lives in the 99 instead of 100, and in the flights that crash instantly at ×1.00 (about 1.98%).',

    fairTitle: 'Provably fair',
    fairIntro:
      'Before each flight the house generates a secret 32-byte seed and publishes only its SHA-256 hash. The crash point is HMAC-SHA256(server seed, "client seed : nonce"): changing the seed after showing the hash is impossible without being caught. Once the flight ends the seed is revealed and you can recompute everything.',
    fairCommit: 'Current flight commitment (SHA-256 of the secret seed)',
    fairClientSeed: 'Your seed',
    fairClientApply: 'Apply',
    fairClientOk: 'Seed updated: it applies from the next flight.',
    fairClientLocked: 'The current flight is already decided: change the seed once it ends.',
    fairNonce: 'Nonce',
    fairLast: 'Last revealed flight',
    fairNone: 'No flight completed in this session yet: play once and the seed will be revealed here.',
    fairSeed: 'Revealed server seed',
    fairCrash: 'Crash',
    fairVerify: 'Verify this flight',
    fairOk: 'Verified: the hash matches the seed and the recomputed multiplier is ×{m}.',
    fairBad: 'WARNING: verification failed. Hash {hash}, crash {crash}.',
    fairFormula: 'Formula: crash = max(1.00, floor(99 / (1 − X)) / 100), with X = first 52 bits of the HMAC / 2^52.',
  },
});
