import { Candidate, Source } from "./candidate";

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * tol;

/**
 * Cross-checks the way an engineer would: a number that two independent sources agree on is trustworthy,
 * a number that breaks a simple rule is flagged. Returns a NEW list (inputs are not mutated).
 */
export function reconcile(input: Candidate[]): Candidate[] {
  const list = input.map((c) => ({ ...c, sources: [...c.sources], checks: [...c.checks] }));

  // 1) Agreement between different sources (same unit, within 1 %).
  const dropped = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (dropped.has(a.id)) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (dropped.has(b.id) || a.unit !== b.unit) continue;
      const diffSource = !b.sources.every((s) => a.sources.includes(s));
      if (diffSource && a.quantity > 0 && near(a.quantity, b.quantity, 0.01)) {
        a.sources = Array.from(new Set<Source>([...a.sources, ...b.sources]));
        a.confidence = "high";
        a.checks.push(`تطابق مصدرين: ${b.description} (${b.quantity})`);
        a.evidence = `${a.evidence} | ${b.evidence}`;
        dropped.add(b.id);
      }
    }
  }
  const merged = list.filter((c) => !dropped.has(c.id));

  // 2) Sanity: zero / missing quantities cannot be priced.
  for (const c of merged) {
    if (!(c.quantity > 0)) {
      c.confidence = "low";
      c.selected = false;
      c.checks.push("الكمية صفر: ينقص بُعد (ارتفاع أو سماكة) لحسابها");
    }
  }

  // 3) Printed total vs printed parts: the room areas written on the sheet cannot exceed the written floor total.
  const printedTotal = merged.find((c) => c.sources.includes("ocr") && c.unit === "م²" && /(GROUND|TOTAL|FLOOR|BUILT|BUA)/i.test(c.description));
  const parts = merged.filter((c) => c !== printedTotal && c.sources.length === 1 && c.sources[0] === "ocr" && c.unit === "م²" && /مساحة مدوّنة|مخزن/.test(c.description));
  if (printedTotal && parts.length >= 2) {
    const sum = parts.reduce((s, c) => s + c.quantity, 0);
    const pct = (sum / printedTotal.quantity) * 100;
    if (sum > printedTotal.quantity * 1.01) {
      for (const p of parts) { p.confidence = "low"; p.checks.push(`مجموع المساحات المدوّنة (${sum.toFixed(2)}) يفوق الإجمالي المدوّن (${printedTotal.quantity}): راجع القراءة`); }
    } else {
      printedTotal.checks.push(`المساحات المدوّنة المقروءة (${parts.length}) = ${sum.toFixed(2)} م² أي ${pct.toFixed(0)}٪ من الإجمالي`);
    }
  }

  // 4) Small counts read by OCR are the commonest digit mistakes (53 read as 03): never trust them blindly.
  for (const c of merged) {
    if (c.sources.length === 1 && c.sources[0] === "ocr" && c.dim === "count" && c.quantity < 10) {
      c.confidence = "low";
      c.checks.push("رقم عدد صغير مقروء بالتعرف الضوئي: تحقق من الخانات");
    }
  }
  return merged;
}

export const rank = (c: Candidate) => ({ high: 0, medium: 1, low: 2 }[c.confidence]);
