/**
 * Double-line walls: many plans draw each wall as two parallel lines (its two faces). Summing every line
 * then gives twice the wall length. This measures how much of a layer's line length has a parallel partner
 * a wall-thickness away, so the extractor can halve it (and say so) instead of silently doubling.
 */
export type Seg = [number, number, number, number];

export function pairedLineFraction(segs: Seg[], minGap: number, maxGap: number, maxSegs = 2500): number {
  const list = segs
    .map(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2, L: Math.hypot(x2 - x1, y2 - y1) }))
    .filter((s) => s.L > 1e-9)
    .slice(0, maxSegs);
  if (list.length < 4) return 0;
  const info = list.map((s) => {
    const ux = (s.x2 - s.x1) / s.L, uy = (s.y2 - s.y1) / s.L;
    let th = Math.atan2(uy, ux);
    if (th < 0) th += Math.PI;
    if (th >= Math.PI - 1e-12) th = 0;
    return { ...s, ux, uy, th };
  });
  let total = 0, paired = 0;
  const TOL = (1.5 * Math.PI) / 180;
  for (let i = 0; i < info.length; i++) {
    const a = info[i];
    total += a.L;
    const nx = -a.uy, ny = a.ux;
    const ta1 = 0, ta2 = a.L;
    let ok = false;
    for (let j = 0; j < info.length && !ok; j++) {
      if (j === i) continue;
      const b = info[j];
      let dth = Math.abs(a.th - b.th);
      dth = Math.min(dth, Math.PI - dth);
      if (dth > TOL) continue;
      const d = Math.abs(nx * (b.x1 - a.x1) + ny * (b.y1 - a.y1));
      const d2 = Math.abs(nx * (b.x2 - a.x1) + ny * (b.y2 - a.y1));
      const gap = (d + d2) / 2;
      if (gap < minGap || gap > maxGap) continue;
      const t1 = a.ux * (b.x1 - a.x1) + a.uy * (b.y1 - a.y1);
      const t2 = a.ux * (b.x2 - a.x1) + a.uy * (b.y2 - a.y1);
      const overlap = Math.min(ta2, Math.max(t1, t2)) - Math.max(ta1, Math.min(t1, t2));
      if (overlap >= 0.5 * Math.min(a.L, b.L)) ok = true;
    }
    if (ok) paired += a.L;
  }
  return total > 0 ? paired / total : 0;
}
