/** Roof and wall sheeting ("الشنكو") of a gable building from its overall dimensions. */
export const r2 = (n: number) => Math.round(n * 100) / 100;

export function claddingAreas(L: number, W: number, eave: number, ridge: number, openings: number, wallPct: number) {
  const rise = Math.max(0, ridge - eave);
  const slopeLen = Math.hypot(W / 2, rise);
  const roof = 2 * L * slopeLen;
  const gross = (2 * L * eave + 2 * (W * eave + 0.5 * W * rise)) * (wallPct / 100);
  const walls = Math.max(0, gross - openings);
  return { roof: r2(roof), walls: r2(walls), gross: r2(gross), slopeLen: r2(slopeLen) };
}

