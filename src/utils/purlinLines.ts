import { PdfPath } from "./pdfVector";

/**
 * Parallel long lines on a roof/framing plan (purlins, girts). A purlin is drawn as a pair of edge lines that run the
 * whole length of the building, repeated at an even pitch from eave to eave. This finds that regular family and counts
 * it, so the quantity comes from the drawing's own geometry and not from the number of times its tag is written.
 */
export interface PurlinLines {
  orientation: "v" | "h";
  /** Lines in the longest evenly spaced family (edge pairs merged). */
  count: number;
  /** Typical spacing between neighbouring lines, in page points. */
  pitchPt: number;
  /** Length one line covers, in page points. */
  coveragePt: number;
}

interface Run { a: number; b: number }

export function findPurlinLines(paths: PdfPath[]): PurlinLines | null {
  let best: PurlinLines | null = null;
  for (const ori of ["v", "h"] as const) {
    const byPos = new Map<number, Run[]>();
    const seen = new Set<string>();
    for (const p of paths) {
      if (p.lineWidth < 0.4 || p.lineWidth > 1.2) continue;
      for (let i = 0; i + 1 < p.points.length; i++) {
        const [ax, ay] = p.points[i], [bx, by] = p.points[i + 1];
        const along = ori === "v" ? [ay, by] : [ax, bx];
        const across = ori === "v" ? [ax, bx] : [ay, by];
        if (Math.abs(across[0] - across[1]) > 0.3 || Math.abs(along[0] - along[1]) < 20) continue;
        const a = Math.min(along[0], along[1]), b = Math.max(along[0], along[1]);
        const pos = Math.round(across[0]);
        const key = `${across[0].toFixed(1)}|${a.toFixed(0)}|${b.toFixed(0)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        (byPos.get(pos) || byPos.set(pos, []).get(pos)!).push({ a, b });
      }
    }
    // Coverage of each position after joining its pieces (one piece per bay is typical).
    const cov = new Map<number, number>();
    for (const [pos, runs] of byPos) {
      runs.sort((x, y) => x.a - y.a);
      let total = 0, cur: Run | null = null;
      for (const r of runs) {
        if (cur && r.a <= cur.b + 1) cur.b = Math.max(cur.b, r.b);
        else { if (cur) total += cur.b - cur.a; cur = { a: r.a, b: r.b }; }
      }
      if (cur) total += cur.b - cur.a;
      cov.set(pos, total);
    }
    const maxCov = Math.max(0, ...cov.values());
    if (maxCov < 200) continue;
    const longPos = [...cov.entries()].filter(([, c]) => c >= 0.85 * maxCov).map(([p]) => p).sort((x, y) => x - y);
    // Edge pairs and doubled strokes (within 8 pt) are one line.
    const centres: number[] = [];
    let group: number[] = [];
    for (const p of longPos) {
      if (group.length && p - group[group.length - 1] > 8) { centres.push(group.reduce((a, v) => a + v, 0) / group.length); group = []; }
      group.push(p);
    }
    if (group.length) centres.push(group.reduce((a, v) => a + v, 0) / group.length);
    if (centres.length < 6) continue;
    const pitches = centres.slice(1).map((c, i) => c - centres[i]);
    const sorted = [...pitches].sort((x, y) => x - y);
    const med = sorted[Math.floor(sorted.length / 2)];
    // Longest run of neighbours whose spacing stays within 20 % of the typical pitch.
    let bestRun = 0, run = 1;
    for (const p of pitches) {
      if (Math.abs(p - med) <= 0.2 * med) run++;
      else { bestRun = Math.max(bestRun, run); run = 1; }
    }
    bestRun = Math.max(bestRun, run);
    if (bestRun >= 6 && (!best || bestRun > best.count)) best = { orientation: ori, count: bestRun, pitchPt: Math.round(med * 10) / 10, coveragePt: Math.round(maxCov) };
  }
  return best;
}

/** kg/m of a cold-formed Z/C purlin from its tag «ZZ200-2-20-60» = depth, thickness, lip, flange (mm). */
export function purlinKgPerMetre(tag: string): number | null {
  const m = /^ZZ?\s?(\d{2,3})-(\d(?:\.\d+)?)-(\d{1,3})-(\d{2,3})$/i.exec(tag.trim());
  if (!m) return null;
  const [d, t, lip, flange] = [+m[1], +m[2], +m[3], +m[4]];
  return Math.round(((d + 2 * flange + 2 * lip) * t * 7.85) / 1000 * 100) / 100;
}
