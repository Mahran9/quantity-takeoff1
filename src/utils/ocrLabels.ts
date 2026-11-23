import { TakeoffItem } from "../types";

/**
 * Offline reading of the numbers PRINTED on a drawing (area labels like "AREA = 330.38 SQ.M" and summary tables
 * like "PARAPET PERIMETER 351.62 L.M"). Works on OCR text, so it also covers PDFs whose text was outlined to curves.
 * Pure functions: the OCR itself runs in the browser (tesseract.js) and is passed in as text.
 */
export interface LabelledQty {
  label: string;
  value: number;
  unit: "م²" | "م.ط" | "عدد";
  kind: "area-label" | "table";
  raw: string;
}

const num = (s: string) => parseFloat(s.replace(/,/g, ""));

/** Orientation score: pages scanned sideways produce almost no real words. */
export function ocrTextScore(text: string): number {
  const words = (text.match(/[A-Za-z]{4,}/g) || []).length;
  const dims = (text.match(/\b\d{1,3}\.\d{2}\b/g) || []).length;
  return words + dims;
}

export function extractLabelledQuantities(text: string): LabelledQty[] {
  const out: LabelledQty[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const hasStore = /\bSTORE\b/i.test(text);
  for (const line of lines) {
    // 1) "AREA = 330.38 SQ.M"  (OCR noise tolerated: "AREA} 508.91SO.M_")
    const a = line.match(/AREA\W{0,4}(\d[\d,]*\.\d{1,3})\s*(?:SQ|SO|S0|M2|M²|m)/i);
    if (a && !/^(GROUND|TOTAL|FLOOR)/i.test(line)) {
      out.push({ label: hasStore ? "مخزن (STORE)" : "مساحة مدوّنة", value: num(a[1]), unit: "م²", kind: "area-label", raw: line });
      continue;
    }
    // 2) summary rows: "<WORDS> <number> <unit>"
    const t = line.match(/^([A-Za-z][A-Za-z &\/\-]{3,40}?)\s+(\d[\d,]*(?:\.\d+)?)\s*(m[²2?7]+|sq\.?\s?m|l\.?\s?m|m\.?\s?l|cars?|nos?\.?|pcs)\b/i);
    if (t) {
      const u = t[3].toLowerCase();
      const unit: LabelledQty["unit"] = /^m[²2?7]|^sq/.test(u) ? "م²" : /^l\.?\s?m|^m\.?\s?l/.test(u) ? "م.ط" : "عدد";
      out.push({ label: t[1].trim(), value: num(t[2]), unit, kind: "table", raw: line });
    }
  }
  return out;
}

export function labelledToTakeoff(items: LabelledQty[], sheet: { id: string; code: string; title: string }, startIndex: number): TakeoffItem[] {
  let areaSeq = 0;
  return items.map((q, idx) => {
    const desc = q.kind === "area-label" ? `${q.label} — مساحة مدوّنة رقم ${++areaSeq}` : `${q.label} (من جدول اللوحة)`;
    return {
      id: `item-ocr-${Date.now()}-${idx}`,
      sheetId: sheet.id,
      sheetCode: sheet.code,
      sheetTitle: sheet.title,
      itemCode: `TXT-${String(startIndex + idx + 1).padStart(2, "0")}`,
      description: desc,
      category: "أعمال متنوعة أخرى",
      dimensionType: q.unit === "م²" ? "area" : q.unit === "م.ط" ? "linear" : "count",
      location: "مقروء من النصوص المدوّنة على اللوحة",
      count: 1,
      deduction: 0,
      quantity: q.value,
      unit: q.unit,
      unitPrice: 0,
      totalPrice: 0,
      notes: "رقم مقروء بالتعرف الضوئي على النص المدوّن في اللوحة (بدون إنترنت)",
      isVerified: false,
      sourceEvidence: `السطر المقروء: «${q.raw}»`,
      reviewFlags: ["رقم مقروء بالتعرف الضوئي: قد يخطئ في خانة أو أكثر، طابقه مع اللوحة", "لم يتم إدخال سعر وحدة"],
      extractionSource: "visual_search",
    } as TakeoffItem;
  });
}

const rotated = (img: HTMLImageElement, deg: 0 | 90 | 270, maxEdge: number): HTMLCanvasElement => {
  const k = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
  const c = document.createElement("canvas");
  const swap = deg !== 0;
  c.width = swap ? h : w; c.height = swap ? w : h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  return c;
};

/** OCR the page image in the browser: finds the readable orientation first (plans are often rotated), then reads it at full size. */
export async function readPrintedLabels(
  imageUrl: string,
  loadTesseract: () => Promise<any>,
  onProgress?: (msg: string, pct: number) => void
): Promise<{ quantities: LabelledQty[]; text: string; rotation: number }> {
  const img = new Image();
  img.src = imageUrl;
  await img.decode();
  const T = await loadTesseract();
  const worker = await T.createWorker("eng");
  try {
    await worker.setParameters({ tessedit_pageseg_mode: "11" });
    let best: { deg: 0 | 90 | 270; score: number } = { deg: 0, score: -1 };
    let step = 0;
    for (const deg of [0, 90, 270] as const) {
      onProgress?.("تحديد اتجاه اللوحة…", 5 + step++ * 10);
      const r = await worker.recognize(rotated(img, deg, 1400));
      const score = ocrTextScore(r.data.text || "");
      if (score > best.score) best = { deg, score };
    }
    onProgress?.("قراءة الأرقام المدوّنة…", 40);
    const r = await worker.recognize(rotated(img, best.deg, 3200));
    const text: string = r.data.text || "";
    onProgress?.("تم", 100);
    return { quantities: extractLabelledQuantities(text), text, rotation: best.deg };
  } finally {
    await worker.terminate();
  }
}
