/**
 * Standard-bar cutting stock (first-fit-decreasing).
 * Used for I-beams / sections bought as standard bars (e.g. 12 m): all cut lengths of the
 * same section are packed together so leftovers are reused before a new bar is opened.
 * Lengths are handled in integer millimetres to avoid floating-point drift.
 */

export interface CutRequest {
  /** Cut length in metres. */
  length: number;
  /** Number of pieces. */
  qty: number;
}

export interface PackedBar {
  /** Cut lengths (m) placed on this bar, largest first. */
  cuts: number[];
  /** Sum of the cuts (m). */
  used: number;
  /** Remaining length (m). */
  leftover: number;
}

export interface BarPackingResult {
  bars: PackedBar[];
  barCount: number;
  stockLength: number;
  /** Total length of all packed cuts (m). */
  usedLength: number;
  /** Total length of bought bars (m) = barCount × stockLength. */
  stockTotalLength: number;
  /** Leftover length that is counted as consumed (m). */
  wasteLength: number;
  wastePercent: number;
  /** Cuts longer than the stock bar (m) — cannot be cut from one bar and are NOT packed. */
  oversizedCuts: number[];
  totalPieces: number;
}

const MAX_PIECES = 200_000;

export function packBarsFFD(cuts: CutRequest[], stockLength = 12): BarPackingResult {
  const stockMm = Math.round(stockLength * 1000);
  const empty: BarPackingResult = {
    bars: [],
    barCount: 0,
    stockLength,
    usedLength: 0,
    stockTotalLength: 0,
    wasteLength: 0,
    wastePercent: 0,
    oversizedCuts: [],
    totalPieces: 0,
  };
  if (!(stockMm > 0)) return empty;

  const pieces: number[] = [];
  const oversized: number[] = [];
  for (const c of cuts) {
    const mm = Math.round(Number(c.length) * 1000);
    const qty = Math.floor(Number(c.qty));
    if (!(mm > 0) || !(qty > 0)) continue;
    for (let i = 0; i < qty; i++) {
      if (pieces.length + oversized.length >= MAX_PIECES) break;
      if (mm > stockMm) oversized.push(mm / 1000);
      else pieces.push(mm);
    }
  }
  pieces.sort((a, b) => b - a);

  const binsLeft: number[] = [];
  const binCuts: number[][] = [];
  for (const p of pieces) {
    let placed = false;
    for (let i = 0; i < binsLeft.length; i++) {
      if (binsLeft[i] >= p) {
        binsLeft[i] -= p;
        binCuts[i].push(p);
        placed = true;
        break;
      }
    }
    if (!placed) {
      binsLeft.push(stockMm - p);
      binCuts.push([p]);
    }
  }

  const bars: PackedBar[] = binCuts.map((cs, i) => ({
    cuts: cs.map((x) => x / 1000),
    used: (stockMm - binsLeft[i]) / 1000,
    leftover: binsLeft[i] / 1000,
  }));
  const usedLength = pieces.reduce((s, p) => s + p, 0) / 1000;
  const stockTotalLength = (bars.length * stockMm) / 1000;
  const wasteLength = Number((stockTotalLength - usedLength).toFixed(3));
  return {
    bars,
    barCount: bars.length,
    stockLength,
    usedLength: Number(usedLength.toFixed(3)),
    stockTotalLength,
    wasteLength,
    wastePercent: stockTotalLength > 0 ? Number(((wasteLength / stockTotalLength) * 100).toFixed(2)) : 0,
    oversizedCuts: oversized,
    totalPieces: pieces.length,
  };
}
