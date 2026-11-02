/**
 * THE ROYAL MIRAGE — Costruzione delle strisce
 *
 * Una striscia scritta a mano ("A,K,F,Q,...") e' illeggibile e impossibile
 * da tarare: per cambiare l'RTP di mezzo punto si finisce a contare simboli.
 * Qui una macchina dichiara solo QUANTE copie di ogni simbolo ha ogni rullo;
 * `buildStrip` le dispone in un ordine deterministico (stesso input, stessa
 * striscia) che evita grappoli dello stesso simbolo.
 *
 * Le frequenze sono la matematica; l'ordine e' solo estetica — tranne per i
 * simboli "impilati" (`stack`), che vanno tenuti adiacenti di proposito.
 */

import { seededRng } from './rng';
import type { SymId } from './types';

export type StripCounts = Readonly<Record<SymId, number>>;

export function buildStrip(counts: StripCounts, seed: number, stack: Readonly<Record<SymId, number>> = {}): SymId[] {
  const rng = seededRng(seed);
  // Blocchi: un simbolo impilato di altezza h entra come blocco unico.
  const blocks: SymId[][] = [];
  for (const [id, n] of Object.entries(counts)) {
    const h = Math.max(1, stack[id] ?? 1);
    let left = n;
    while (left > 0) {
      const size = Math.min(h, left);
      blocks.push(Array.from({ length: size }, () => id));
      left -= size;
    }
  }
  // Fisher-Yates deterministico.
  for (let i = blocks.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [blocks[i], blocks[j]] = [blocks[j]!, blocks[i]!];
  }
  // Riparazione: separa blocchi uguali adiacenti scambiandoli col successivo diverso.
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 1; i < blocks.length; i++) {
      if (blocks[i]![0] !== blocks[i - 1]![0]) continue;
      const k = blocks.findIndex((b, j) => j > i && b[0] !== blocks[i]![0] && b[0] !== blocks[i - 1]![0]);
      if (k > 0) [blocks[i], blocks[k]] = [blocks[k]!, blocks[i]!];
    }
  }
  return blocks.flat();
}
