import { kgPerMetre } from "../utils/steelWeights";

/**
 * Rule-based steel quantities: items the drawing never prints (bracing, sag rods, base plates, anchor bolts, pedestals,
 * rebar, block-wall openings) are computed by the estimator's usual method from the geometry already read
 * (columns, frames, bay length, slope, levels). Every figure is an estimate; the numbers below are the method's
 * parameters, shown in each line's formula so the person can change them.
 */
export const RULES = {
  sagRodKgPerM: 0.888,        // Ø12 round bar
  sagRodRowsMinBay: 6,        // bay ≥ this (m): two rows of sag rods per bay, else one
  braceEveryBays: 5,          // X-bracing in each end bay and every Nth bay between
  braceKgPerM: 2.47,          // Ø20 round bar when no SHS tube is written on the drawing
  basePlateThkMm: 20, basePlateMarginMm: 100,
  anchorBoltsPerCol: 4, anchorBoltDiaMm: 24, anchorBoltLenM: 0.7,
  pedestalHeightM: 0.6, pedestalMarginM: 0.15, pedestalMinM: 0.5,
  rebarKgPerM3: 120,
  openingsPct: 15,            // doors, windows and gates deducted from gross block wall
  steelDensity: 7850,
};

/** Section depth and flange width in mm from a name like IPE600 / HEA240 (flange ≈ 0.45 d for IPE, = d for HE). */
export function sectionBox(sec: string): { d: number; b: number } | null {
  const m = /^(IPE|HEA|HEB|HEM)(\d{2,3})$/i.exec(sec);
  if (!m) return null;
  const d = +m[2];
  return { d, b: /^IPE/i.test(m[1]) ? Math.round(d * 0.45) : d };
}

export const r2 = (n: number) => Math.round(n * 100) / 100;

export function basePlateKg(sec: string, R = RULES): number | null {
  const bx = sectionBox(sec); if (!bx) return null;
  const w = (bx.d + 2 * R.basePlateMarginMm) / 1000, h = (bx.b + 2 * R.basePlateMarginMm) / 1000;
  return w * h * (R.basePlateThkMm / 1000) * R.steelDensity;
}

export function anchorBoltKg(R = RULES): number {
  return R.anchorBoltsPerCol * R.anchorBoltLenM * 0.00617 * R.anchorBoltDiaMm * R.anchorBoltDiaMm;
}

export function pedestalM3(sec: string, R = RULES): number | null {
  const bx = sectionBox(sec); if (!bx) return null;
  const a = Math.max(R.pedestalMinM, bx.d / 1000 + 2 * R.pedestalMarginM);
  const b = Math.max(R.pedestalMinM, bx.b / 1000 + 2 * R.pedestalMarginM);
  return a * b * R.pedestalHeightM;
}

/** Bracing + sag rod metres for one gable building. */
export function bracingMetres(p: { L: number; W: number; eave: number; slope: number; bays: number; purlinLines: number }, R = RULES) {
  const bay = p.L / p.bays;
  const braced = new Set<number>([0, p.bays - 1]);
  for (let i = R.braceEveryBays; i < p.bays - 1; i += R.braceEveryBays) braced.add(i);
  const nb = braced.size;
  const roofDiag = 2 * 2 * Math.hypot(bay, p.slope) * nb;       // 2 slopes × 2 diagonals
  const wallDiag = 2 * 2 * Math.hypot(bay, p.eave) * nb;        // 2 long sides × 2 diagonals
  const rows = bay >= R.sagRodRowsMinBay ? 2 : 1;
  const sag = p.bays * rows * 2 * p.slope * 1.05;               // along both slopes, 5% for ends
  return { nb, bay, roofDiag, wallDiag, sag, rows };
}
export { kgPerMetre };
