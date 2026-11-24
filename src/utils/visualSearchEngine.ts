import { importWithRecovery } from "./lazyImport";
import { BlueprintSheet, VisualSearchToken, TakeoffItem } from "../types";
import { sampleDrawingsSvg } from "../data/sampleBlueprints";

export interface PatternMatchGroup {
  id: string;
  label: string;
  category: "steel" | "rebar" | "dimension" | "element_code" | "arabic_term";
  categoryLabel: string;
  count: number;
  tokens: VisualSearchToken[];
  suggestedUnit: string;
  suggestedTrade: string;
}

export interface AutoTakeoffCandidate {
  id: string;
  itemCode: string;
  description: string;
  category: string;
  dimensionType: "volume" | "area" | "linear" | "count";
  count: number;
  length?: number;
  width?: number;
  height?: number;
  quantity: number;
  unit: string;
  formula: string;
  evidence: string;
  confidenceLabel: "عالية (جدول + عد)" | "متوسطة (نمط مقروء)" | "تحتاج مراجعة أبعاد";
  tokens: VisualSearchToken[];
}

const STEEL_WEIGHT_MAP: Record<string, number> = {
  "IPE 140": 12.9, "IPE 160": 15.8, "IPE 180": 18.8, "IPE 200": 22.4,
  "IPE 220": 26.2, "IPE 240": 30.7, "IPE 270": 36.1, "IPE 300": 42.2,
  "IPE 330": 49.1, "IPE 360": 57.1, "IPE 400": 66.3,
  "HEB 160": 42.6, "HEB 200": 61.3, "HEB 240": 83.2, "HEB 300": 117.0,
  "UPN 100": 10.6, "UPN 120": 13.4, "UPN 160": 18.8, "UPN 200": 25.3,
  "HEA 160": 30.4, "HEA 200": 42.3, "HEA 240": 60.3, "HEA 300": 88.3,
  "C-PURLIN 150": 4.1, "C-PURLIN 200": 5.4, "Z-PURLIN 200": 6.7,
  "SHS 50X50": 2.95, "SHS 80X80": 7.09, "SHS 100X100": 11.73,
  "RHS 100X50": 6.62, "RHS 120X60": 8.03,
};

/**
 * Local Offline OCR for Scanned PDFs & Image Blueprints using Tesseract.js (Arabic + English).
 * Runs 100% locally in the browser without any AI API.
 */
export async function runLocalOcrOnImage(
  imageUrl: string,
  onProgress?: (pct: number) => void
): Promise<VisualSearchToken[]> {
  const Tesseract = await importWithRecovery(() => import("tesseract.js"));
  const result = await Tesseract.recognize(imageUrl, "ara+eng", {
    logger: (m: any) => {
      if (m.status === "recognizing text" && typeof m.progress === "number" && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  // Determine image dimensions from result or fallback
  const words = (result.data as any)?.words || [];
  let maxW = 1000;
  let maxH = 700;
  words.forEach((w: any) => {
    if (w.bbox?.x1 > maxW) maxW = w.bbox.x1;
    if (w.bbox?.y1 > maxH) maxH = w.bbox.y1;
  });

  const tokens: VisualSearchToken[] = [];
  words.forEach((w: any, idx: number) => {
    const txt = String(w.text || "").trim();
    if (!txt || txt.length < 1 || (w.confidence ?? 100) < 35) return;
    const b = w.bbox || { x0: 0, y0: 0, x1: 40, y1: 20 };
    tokens.push({
      id: `ocr-tok-${idx}`,
      text: txt,
      x: Math.max(0, Math.min(0.98, b.x0 / maxW)),
      y: Math.max(0, Math.min(0.98, b.y0 / maxH)),
      w: Math.max(0.015, Math.min(0.5, (b.x1 - b.x0) / maxW)),
      h: Math.max(0.015, Math.min(0.2, (b.y1 - b.y0) / maxH)),
      source: "pdf_text",
    });
  });

  return tokens;
}

/**
 * Extract searchable visual tokens from any sheet (PDF, DXF, or SVG sample).
 */
export function getSheetVisualTokens(sheet: BlueprintSheet): VisualSearchToken[] {
  if (sheet.visualTokens && sheet.visualTokens.length > 0) {
    return sheet.visualTokens;
  }

  if (sheet.fileType === "dxf" && (sheet.dxfRawSummary || sheet.dxfData)) {
    const dxf = sheet.dxfRawSummary || sheet.dxfData;
    const tokens: VisualSearchToken[] = [];
    const bounds = dxf.viewBounds || dxf.bounds || { minX: 0, maxX: 100, minY: 0, maxY: 100 };
    const spanX = Math.max(0.001, (bounds.maxX ?? 100) - (bounds.minX ?? 0));
    const spanY = Math.max(0.001, (bounds.maxY ?? 100) - (bounds.minY ?? 0));

    const entities = dxf.parsedData?.entities || dxf.entities || [];
    entities.forEach((ent: any, idx: number) => {
      if (ent.type === "TEXT" || ent.type === "MTEXT") {
        const txt = String(ent.text || ent.string || "").replace(/\\[A-Za-z0-9]+;/g, "").trim();
        if (!txt) return;
        const pos = ent.startPoint || ent.position || { x: bounds.minX, y: bounds.minY };
        const normX = Math.max(0.01, Math.min(0.95, (pos.x - bounds.minX) / spanX));
        const normY = Math.max(0.01, Math.min(0.95, 1 - (pos.y - bounds.minY) / spanY));
        tokens.push({
          id: `dxf-txt-${idx}`,
          text: txt,
          x: normX,
          y: normY,
          w: Math.min(0.18, Math.max(0.03, txt.length * 0.009)),
          h: 0.028,
          source: "dxf_text",
          layer: ent.layer,
        });
      } else if (ent.type === "INSERT" && ent.name) {
        const pos = ent.position || { x: bounds.minX, y: bounds.minY };
        const normX = Math.max(0.01, Math.min(0.95, (pos.x - bounds.minX) / spanX));
        const normY = Math.max(0.01, Math.min(0.95, 1 - (pos.y - bounds.minY) / spanY));
        tokens.push({
          id: `dxf-blk-${idx}`,
          text: String(ent.name),
          x: normX,
          y: normY,
          w: 0.05,
          h: 0.03,
          source: "dxf_block",
          layer: ent.layer,
        });
      }
    });

    if (tokens.length === 0 && Array.isArray(dxf.textNotes)) {
      dxf.textNotes.forEach((note: string, idx: number) => {
        if (!note || !note.trim()) return;
        tokens.push({
          id: `dxf-note-${idx}`,
          text: note.trim(),
          x: 0.08 + ((idx * 17) % 80) / 100,
          y: 0.1 + ((idx * 13) % 75) / 100,
          w: 0.08,
          h: 0.03,
          source: "dxf_text",
        });
      });
    }
    return tokens;
  }

  const svgStr = sampleDrawingsSvg[sheet.id];
  if (svgStr) {
    const tokens: VisualSearchToken[] = [];
    const textRegex = /<text[^>]*x="([^"]+)"[^>]*y="([^"]+)"[^>]*>([^<]+)<\/text>/gi;
    let m;
    let idx = 0;
    while ((m = textRegex.exec(svgStr)) !== null) {
      const x = parseFloat(m[1]) / 1000;
      const y = parseFloat(m[2]) / 700;
      const txt = m[3].trim();
      if (!txt) continue;
      tokens.push({
        id: `svg-tok-${idx++}`,
        text: txt,
        x: Math.max(0, Math.min(0.95, x - 0.025)),
        y: Math.max(0, Math.min(0.95, y - 0.02)),
        w: Math.min(0.22, Math.max(0.035, txt.length * 0.01)),
        h: 0.032,
        source: "svg_text",
      });
    }
    return tokens;
  }

  return [];
}

export function searchSheetTokens(tokens: VisualSearchToken[], query: string): VisualSearchToken[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return tokens.filter((t) => t.text.toLowerCase().includes(q));
}

/**
 * Smart Trade Classifier from Element Code / Keywords (Arabic & English)
 */
export function classifyTradeFromCode(codeOrText: string): {
  category: string;
  labelPrefix: string;
  defaultUnit: string;
  dimensionType: "volume" | "area" | "linear" | "count";
} {
  const s = codeOrText.toUpperCase();
  if (/EXCAV|BACKFILL|حفر|ردم/.test(s)) {
    return { category: "أعمال الحفر والردم والأساسات", labelPrefix: "أعمال حفر وردم للأساسات", defaultUnit: "م³", dimensionType: "volume" };
  }
  if (/BLIND|LEAN|نظافة|نظافه|خرسانة عادية/.test(s)) {
    return { category: "أعمال خرسانية مسلحة وعادية", labelPrefix: "خرسانة نظافة (صبة عادية)", defaultUnit: "م³", dimensionType: "volume" };
  }
  if (/SOG|SLAB_ON_GRADE|GROUND_SLAB|FLOOR_SLAB|خرسانة أرضية|صبة أرضية|خرسانة ارضية|صبة ارضية/.test(s)) {
    return { category: "أعمال خرسانية مسلحة وعادية", labelPrefix: "خرسانة الأرضية (Slab on Grade)", defaultUnit: "م³", dimensionType: "volume" };
  }
  // Steel I-Beam Columns MUST be checked BEFORE concrete columns
  if (/^(SC[0-9]|ST_?COL|STEEL_?COL|H_?COL)/.test(s) || /(عمود.*حديد|عمود.*ايبيم|عمود.*أيبيم)/.test(s)) {
    return { category: "أعمال الهياكل المعدنية والهناجر", labelPrefix: "عمدان هيكل معدني (أيبيم)", defaultUnit: "طن", dimensionType: "linear" };
  }
  if (/^(BP|BASE_?PLATE|ANCHOR|BOLT)/.test(s) || /بيس.*بليت|جاويط/.test(s)) {
    return { category: "أعمال الهياكل المعدنية والهناجر", labelPrefix: "بيس بليت وجاويط تثبيت", defaultUnit: "طن", dimensionType: "count" };
  }
  if (/^(RS|SHUTTER|ROLL)/.test(s) || /رول.*شتر/.test(s)) {
    return { category: "أعمال الأبواب والشبابيك والألمنيوم", labelPrefix: "أبواب رول شتر للمستودع", defaultUnit: "عدد", dimensionType: "count" };
  }
  if (/^(F|FTG|ق)/.test(s) || /قاعدة|قواعد|FOOTING/.test(s)) {
    return { category: "أعمال خرسانية مسلحة وعادية", labelPrefix: "خرسانة مسلحة للقواعد", defaultUnit: "م³", dimensionType: "volume" };
  }
  if (/NECK|PEDESTAL|رقاب|رقبة/.test(s)) {
    return { category: "أعمال خرسانية مسلحة وعادية", labelPrefix: "خرسانة مسلحة لرقاب الأعمدة", defaultUnit: "م³", dimensionType: "volume" };
  }
  if (/^(C|RC_?COL|COL|ع)/.test(s) || /عمود|أعمدة|COLUMN/.test(s)) {
    return { category: "أعمال خرسانية مسلحة وعادية", labelPrefix: "خرسانة مسلحة للأعمدة الخرسانية", defaultUnit: "م³", dimensionType: "volume" };
  }
  if (/^(GB|TB|م)/.test(s) || /ميدة|ميده|ميدات|GRADE|TIE/.test(s)) {
    return { category: "أعمال خرسانية مسلحة وعادية", labelPrefix: "خرسانة مسلحة للميدة الأرضية", defaultUnit: "م³", dimensionType: "volume" };
  }
  if (/^(B|ك)/.test(s) || /كمرة|كمرات|BEAM/.test(s)) {
    return { category: "أعمال خرسانية مسلحة وعادية", labelPrefix: "خرسانة مسلحة للكمرات", defaultUnit: "م³", dimensionType: "volume" };
  }
  if (/WALL|BRICK|BLOCK|طابوق|بلوك|مباني|جدار|جدران/.test(s)) {
    return { category: "أعمال المباني والبلوك", labelPrefix: "أعمال مباني جدران وطابوق/بلوك", defaultUnit: "م²", dimensionType: "area" };
  }
  if (/^(S|SLAB|بلاطة)/.test(s) || /سقف|بلاطة/.test(s)) {
    return { category: "أعمال خرسانية مسلحة وعادية", labelPrefix: "خرسانة مسلحة للأسقف والبلاطات", defaultUnit: "م³", dimensionType: "volume" };
  }
  if (/IPE|HEB|HEA|UPN|PURLIN|H-BEAM|SHS|RHS|TUBE|تيوب|هنجر|هيكل|أبيام|ابيام/.test(s)) {
    return { category: "أعمال الهياكل المعدنية والهناجر", labelPrefix: "توريد وتصنيع وتركيب هيكل معدني", defaultUnit: "طن", dimensionType: "linear" };
  }
  if (/PANEL|SHINKO|SANDWICH|CLAD|بانل|شينكو|شنكو|كلادينج|صاج/.test(s)) {
    return { category: "أعمال الساندوتش بانل والكلادينج", labelPrefix: "توريد وتركيب ساندوتش بانل", defaultUnit: "م²", dimensionType: "area" };
  }
  if (/^(D|DR|ب)/.test(s) || /باب|أبواب|DOOR/.test(s)) {
    return { category: "أعمال الأبواب والشبابيك والألمنيوم", labelPrefix: "توريد وتركيب أبواب", defaultUnit: "عدد", dimensionType: "count" };
  }
  if (/^(W|WIN|ش)/.test(s) || /شباك|نافذة|WINDOW/.test(s)) {
    return { category: "أعمال الأبواب والشبابيك والألمنيوم", labelPrefix: "توريد وتركيب شبابيك ألمنيوم", defaultUnit: "عدد", dimensionType: "count" };
  }
  return { category: "أعمال متنوعة أخرى", labelPrefix: "بند هندسي", defaultUnit: "عدد", dimensionType: "count" };
}

/**
 * Normalize a dimension value (if > 20, assume centimeters and convert to meters, e.g. 200 -> 2.00m)
 */
function normalizeDimToMeters(val: number): number {
  if (val > 50) return Number((val / 100).toFixed(3));
  return Number(val.toFixed(3));
}

/**
 * ROW-BASED SCHEDULE & PLAN CROSS-REFERENCE ENGINE (100% Local, Zero AI).
 * 1. Groups tokens into horizontal rows (by Y coordinate).
 * 2. Detects schedule rows containing an element code + dimensions (e.g. "F1 | 2.00 x 2.00 x 0.60").
 * 3. Counts how many times that code appears on the plan.
 * 4. Computes exact volume / area / weight automatically.
 */
export function extractStructuredTakeoffFromTokens(
  sheet: BlueprintSheet,
  tokens: VisualSearchToken[]
): AutoTakeoffCandidate[] {
  if (tokens.length === 0) return [];

  // Step 1: Count occurrences of every element code across the sheet
  const codeRegex = /^(SC\d{1,2}|RS\d{1,2}|BP\d{1,2}|GB\d{1,2}|TB\d{1,2}|[CFBWDS]\s?-?\d{1,2}|[قعمدبش]\s?-?\d{1,2})$/i;
  const codeTokensMap = new Map<string, VisualSearchToken[]>();

  tokens.forEach((t) => {
    const clean = t.text.trim().toUpperCase().replace(/\s+/g, "");
    if (codeRegex.test(clean)) {
      const list = codeTokensMap.get(clean) || [];
      list.push(t);
      codeTokensMap.set(clean, list);
    }
  });

  // Step 2: Group tokens into horizontal rows (tolerance 1.8% of sheet height)
  const sorted = [...tokens].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: VisualSearchToken[][] = [];
  sorted.forEach((tok) => {
    const lastRow = rows[rows.length - 1];
    if (lastRow && Math.abs(lastRow[0].y - tok.y) < 0.018) {
      lastRow.push(tok);
    } else {
      rows.push([tok]);
    }
  });

  const candidates: AutoTakeoffCandidate[] = [];
  const handledCodes = new Set<string>();

  // Step 3: Parse each row for [Code] + [Dimensions]
  const dim3Regex = /(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)/;
  const dim2Regex = /(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)/;
  const steelRegex = /\b(IPE\s*\d{2,3}|HEB\s*\d{2,3}|HEA\s*\d{2,3}|UPN\s*\d{2,3}|[CZ]-?PURLIN\s*\d{3}|(?:SHS|RHS)\s*\d{2,3}[xX×]\d{2,3})\b/i;
  const rebarRowRegex = /(\d{1,3})\s*[ØΦT]\s*(\d{1,2})(?:\s*mm)?(?:[^0-9]*(?:L|طول)\s*=?\s*(\d+(?:\.\d+)?))?/i;
  const plateRowRegex = /\bPL\s*(\d{1,2})\s*(?:mm)?\s*(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)/i;

  rows.forEach((row, rIdx) => {
    const rowText = row.map((t) => t.text).join(" ");

    // 1. Check for Rebar Schedule Row (e.g. "F1: 8Ø16 L=2.10m QTY=4" or "C1 8T16 L=3.50m")
    const rebarM = rowText.match(rebarRowRegex);
    if (rebarM) {
      const barsPerElement = parseInt(rebarM[1], 10);
      const diaMm = parseInt(rebarM[2], 10);
      const barLenM = rebarM[3] ? parseFloat(rebarM[3]) : 0;
      const codeTokR = row.find((t) => codeRegex.test(t.text.trim().toUpperCase().replace(/\s+/g, "")));
      const elCode = codeTokR ? codeTokR.text.trim().toUpperCase().replace(/\s+/g, "") : `RB-${diaMm}`;
      const qtyM = rowText.match(/(?:NO|QTY|عدد)\s*[:=]?\s*(\d+)/i);
      const occ = codeTokR ? (codeTokensMap.get(elCode)?.length || 1) : 1;
      const elementCount = qtyM ? parseInt(qtyM[1], 10) : (occ > 1 ? occ - 1 : 1);
      const totalBars = barsPerElement * elementCount;
      const kgPerM = (diaMm * diaMm) / 162.2;
      const key = `REBAR-${elCode}-${diaMm}`;

      if (!handledCodes.has(key) && diaMm >= 6 && diaMm <= 40) {
        handledCodes.add(key);
        if (barLenM > 0) {
          const weightTon = Number(((kgPerM * barLenM * totalBars) / 1000).toFixed(3));
          candidates.push({
            id: `auto-rb-${rIdx}-${key}`,
            itemCode: `${elCode}-Ø${diaMm}`,
            description: `حديد تسليح قطر ${diaMm} مم لعنصر (${elCode}) — ${barsPerElement} سيخ × ${elementCount} عنصر × طول ${barLenM} م`,
            category: "أعمال حديد التسليح",
            dimensionType: "count",
            count: totalBars,
            length: barLenM,
            quantity: weightTon,
            unit: "طن",
            formula: `(${diaMm}²/162.2) × ${barLenM}م × ${totalBars} سيخ ÷ 1000`,
            evidence: `جدول تسليح مقروء: "${rowText.slice(0, 75)}"`,
            confidenceLabel: "عالية (جدول + عد)",
            tokens: row,
          });
        } else {
          candidates.push({
            id: `auto-rb-${rIdx}-${key}`,
            itemCode: `${elCode}-Ø${diaMm}`,
            description: `حديد تسليح قطر ${diaMm} مم لعنصر (${elCode}) — ${totalBars} سيخ (طول السيخ غير مذكور في السطر)`,
            category: "أعمال حديد التسليح",
            dimensionType: "count",
            count: totalBars,
            quantity: totalBars,
            unit: "عدد",
            formula: `${barsPerElement} × ${elementCount} (أدخل طول السيخ لحساب الوزن)`,
            evidence: `جدول تسليح مقروء: "${rowText.slice(0, 75)}"`,
            confidenceLabel: "تحتاج مراجعة أبعاد",
            tokens: row,
          });
        }
      }
    }

    // 2. Check for Steel Plate Row (e.g. "PL 16mm 0.50x0.50 QTY=20")
    const plateM = rowText.match(plateRowRegex);
    if (plateM) {
      const thickMm = parseFloat(plateM[1]);
      const pL = normalizeDimToMeters(parseFloat(plateM[2]));
      const pW = normalizeDimToMeters(parseFloat(plateM[3]));
      const qtyM = rowText.match(/(?:NO|QTY|عدد)\s*[:=]?\s*(\d+)/i);
      const count = qtyM ? parseInt(qtyM[1], 10) : 1;
      const weightTon = Number(((pL * pW * thickMm * 7.85 * count) / 1000).toFixed(3));
      const key = `PL-${thickMm}-${pL}x${pW}`;
      if (!handledCodes.has(key)) {
        handledCodes.add(key);
        candidates.push({
          id: `auto-pl-${rIdx}-${key}`,
          itemCode: `PL-${thickMm}mm`,
          description: `ألواح صاج/بيس بليت سماكة ${thickMm} مم (${pL}×${pW} م × عدد ${count})`,
          category: "أعمال الهياكل المعدنية والهناجر",
          dimensionType: "area",
          count,
          length: pL,
          width: pW,
          quantity: weightTon,
          unit: "طن",
          formula: `${pL} × ${pW} × ${thickMm}مم × 7.85 × ${count} ÷ 1000`,
          evidence: `سطر صاج مقروء: "${rowText.slice(0, 75)}"`,
          confidenceLabel: "عالية (جدول + عد)",
          tokens: row,
        });
      }
      return;
    }

    // Check for Steel Section + Length on same row
    const steelM = rowText.match(steelRegex);
    if (steelM) {
      const secName = steelM[1].toUpperCase().replace(/\s+/g, " ");
      const kgPerM = STEEL_WEIGHT_MAP[secName] || 0;
      const lenM = rowText.match(/L\s*=?\s*(\d+(?:\.\d+)?)/i);
      const countM = rowText.match(/(?:NO|QTY|عدد)\s*[:=]?\s*(\d+)/i);
      const length = lenM ? parseFloat(lenM[1]) : 12;
      const count = countM ? parseInt(countM[1], 10) : 1;
      const weightTon = kgPerM > 0 ? Number(((kgPerM * length * count) / 1000).toFixed(3)) : 0;

      if (!handledCodes.has(secName)) {
        handledCodes.add(secName);
        candidates.push({
          id: `auto-st-${rIdx}-${secName}`,
          itemCode: secName,
          description: `توريد وتصنيع وتركيب قطاع حديد ${secName} (طول ${length}م × عدد ${count})`,
          category: "أعمال الهياكل المعدنية والهناجر",
          dimensionType: "linear",
          count,
          length,
          quantity: weightTon > 0 ? weightTon : Number((length * count).toFixed(2)),
          unit: weightTon > 0 ? "طن" : "م.ط",
          formula: weightTon > 0 ? `${kgPerM} كجم/م × ${length}م × ${count} ÷ 1000` : `${length}م × ${count}`,
          evidence: `سطر مقروء: "${rowText.slice(0, 70)}"`,
          confidenceLabel: weightTon > 0 ? "عالية (جدول + عد)" : "متوسطة (نمط مقروء)",
          tokens: row,
        });
      }
      return;
    }

    // Check for Element Code (F1, C1, B1...) + Dimensions (2.0 x 2.0 x 0.6)
    const codeTok = row.find((t) => codeRegex.test(t.text.trim().toUpperCase().replace(/\s+/g, "")));
    if (!codeTok) return;
    const code = codeTok.text.trim().toUpperCase().replace(/\s+/g, "");
    if (handledCodes.has(code)) return;

    const d3 = rowText.match(dim3Regex);
    const d2 = !d3 ? rowText.match(dim2Regex) : null;
    if (!d3 && !d2) return;

    handledCodes.add(code);
    const allOccurrences = codeTokensMap.get(code) || [codeTok];
    // Subtract 1 if the code appeared in the schedule itself and also on the plan
    const planCount = allOccurrences.length > 1 ? allOccurrences.length - 1 : 1;
    const cls = classifyTradeFromCode(code);

    if (d3) {
      const L = normalizeDimToMeters(parseFloat(d3[1]));
      const W = normalizeDimToMeters(parseFloat(d3[2]));
      const H = normalizeDimToMeters(parseFloat(d3[3]));
      const vol = Number((L * W * H * planCount).toFixed(2));
      candidates.push({
        id: `auto-3d-${rIdx}-${code}`,
        itemCode: code,
        description: `${cls.labelPrefix} نموذج (${code}) بأبعاد ${L}×${W}×${H} م — عدد (${planCount})`,
        category: cls.category,
        dimensionType: "volume",
        count: planCount,
        length: L,
        width: W,
        height: H,
        quantity: vol,
        unit: "م³",
        formula: `${planCount} × ${L} × ${W} × ${H}`,
        evidence: `جدول + عد تلقائي: ${code} (${planCount} مرة) | أبعاد: ${d3[0]}`,
        confidenceLabel: "عالية (جدول + عد)",
        tokens: allOccurrences,
      });
    } else if (d2) {
      const L = normalizeDimToMeters(parseFloat(d2[1]));
      const W = normalizeDimToMeters(parseFloat(d2[2]));
      const area = Number((L * W * planCount).toFixed(2));
      candidates.push({
        id: `auto-2d-${rIdx}-${code}`,
        itemCode: code,
        description: `${cls.labelPrefix} نموذج (${code}) قطاع/مسطح ${L}×${W} م — عدد (${planCount})`,
        category: cls.category,
        dimensionType: "area",
        count: planCount,
        length: L,
        width: W,
        quantity: area,
        unit: "م²",
        formula: `${planCount} × ${L} × ${W}`,
        evidence: `جدول + عد تلقائي: ${code} (${planCount} مرة) | أبعاد: ${d2[0]}`,
        confidenceLabel: "متوسطة (نمط مقروء)",
        tokens: allOccurrences,
      });
    }
  });

  // Step 4: Add remaining repeated element codes that had no dimension on their row (count only)
  codeTokensMap.forEach((toks, code) => {
    if (handledCodes.has(code)) return;
    const cls = classifyTradeFromCode(code);
    candidates.push({
      id: `auto-cnt-${code}`,
      itemCode: code,
      description: `${cls.labelPrefix} نموذج (${code}) — مرصود في المخطط ${sheet.code}`,
      category: cls.category,
      dimensionType: "count",
      count: toks.length,
      quantity: toks.length,
      unit: "عدد",
      formula: `عد بصري مباشر (${toks.length})`,
      evidence: `تم رصد الرمز ${code} عدد ${toks.length} مرة`,
      confidenceLabel: "تحتاج مراجعة أبعاد",
      tokens: toks,
    });
  });

  return candidates;
}

export function scanEngineeringPatterns(tokens: VisualSearchToken[]): PatternMatchGroup[] {
  const groups = new Map<string, PatternMatchGroup>();
  const addMatch = (
    key: string,
    label: string,
    category: PatternMatchGroup["category"],
    categoryLabel: string,
    token: VisualSearchToken,
    suggestedUnit: string,
    suggestedTrade: string
  ) => {
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.tokens.push(token);
    } else {
      groups.set(key, {
        id: key, label, category, categoryLabel, count: 1,
        tokens: [token], suggestedUnit, suggestedTrade,
      });
    }
  };

  const steelRegex = /\b(IPE\s*\d{2,3}|HEB\s*\d{2,3}|HEA\s*\d{2,3}|UPN\s*\d{2,3}|H-?BEAM|C-?PURLIN|Z-?PURLIN|PL\s*\d{1,2})\b/i;
  const rebarRegex = /([ØΦT]\s*\d{1,2}(\s*@\s*\d{2,3})?|\d{1,2}\s*mm)/i;
  const codeRegex = /^([CFBWDS]\s?-?\d{1,2}|[قعمدبش]\s?-?\d{1,2})$/i;
  const dimRegex = /\b(\d+(\.\d+)?\s*[xX×*]\s*\d+(\.\d+)?)\b/;
  const arabicTermRegex = /(قاعدة|قواعد|عمود|أعمدة|ميدة|ميدات|كمرة|بلاطة|سقف|بلوك|باب|شباك|هنجر|ساندوتش|صاج|خرسانة|حديد)/;

  tokens.forEach((tok) => {
    const txt = tok.text.trim();
    if (!txt) return;
    const steelM = txt.match(steelRegex);
    if (steelM) {
      const norm = steelM[1].toUpperCase().replace(/\s+/g, " ");
      addMatch(`steel:${norm}`, norm, "steel", "قطاعات حديد وهياكل", tok, "طن", "أعمال الهياكل المعدنية والهناجر");
      return;
    }
    const rebarM = txt.match(rebarRegex);
    if (rebarM) {
      const norm = rebarM[1].toUpperCase().replace(/\s+/g, "");
      addMatch(`rebar:${norm}`, norm, "rebar", "حديد تسليح", tok, "طن", "أعمال حديد التسليح");
      return;
    }
    const codeM = txt.match(codeRegex);
    if (codeM) {
      const norm = codeM[1].toUpperCase().replace(/\s+/g, "");
      addMatch(`code:${norm}`, norm, "element_code", "رموز عناصر المخطط", tok, "عدد", "أعمال خرسانية مسلحة وعادية");
      return;
    }
    const dimM = txt.match(dimRegex);
    if (dimM) {
      const norm = dimM[1].replace(/\s+/g, "");
      addMatch(`dim:${norm}`, norm, "dimension", "أبعاد مقروءة", tok, "م²", "أعمال خرسانية مسلحة وعادية");
      return;
    }
    const arM = txt.match(arabicTermRegex);
    if (arM) {
      addMatch(`ar:${arM[1]}`, arM[1], "arabic_term", "مسميات هندسية", tok, "عدد", "أعمال متنوعة أخرى");
    }
  });

  return Array.from(groups.values()).sort((a, b) => b.count - a.count);
}

export function buildTakeoffFromCandidate(
  sheet: BlueprintSheet,
  c: AutoTakeoffCandidate
): TakeoffItem {
  return {
    id: `item-auto-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    sheetId: sheet.id,
    sheetCode: sheet.code,
    sheetTitle: sheet.title,
    itemCode: c.itemCode,
    description: c.description,
    category: c.category,
    dimensionType: c.dimensionType,
    location: sheet.title,
    count: c.count,
    length: c.length,
    width: c.width,
    height: c.height,
    formula: c.formula,
    quantity: c.quantity,
    unit: c.unit,
    unitPrice: 0,
    totalPrice: 0,
    extractionSource: "visual_search",
    sourceEvidence: c.evidence,
    notes: `${c.confidenceLabel} — يرجى مراجعة الكمية وإدخال سعر الوحدة.`,
  };
}

export function buildTakeoffFromPattern(sheet: BlueprintSheet, group: PatternMatchGroup): TakeoffItem {
  return {
    id: `item-vs-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    sheetId: sheet.id,
    sheetCode: sheet.code,
    sheetTitle: sheet.title,
    itemCode: group.label.slice(0, 12),
    description: `${group.categoryLabel}: ${group.label} (تم رصده بصرياً ${group.count} مرة في اللوحة ${sheet.code})`,
    category: group.suggestedTrade,
    dimensionType: group.suggestedUnit === "عدد" ? "count" : "area",
    location: sheet.title,
    count: group.count,
    quantity: group.count,
    unit: group.suggestedUnit,
    unitPrice: 0,
    totalPrice: 0,
    extractionSource: "visual_search",
    sourceEvidence: `بحث بصري محلي: ${group.label} (${group.count} تطابق)`,
    notes: "تم استخراجه عبر محرك البحث البصري المحلي — يرجى مراجعة الأبعاد وإدخال سعر الوحدة.",
  };
}
