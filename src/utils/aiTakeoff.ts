import { TakeoffItem, TradeCategory } from "../types";

/**
 * Optional "read the drawing like an engineer" mode. The page image is sent to Claude with the user's OWN
 * API key (kept only in this browser). Nothing is sent unless the user presses the button.
 */
export const AI_MODEL = "claude-sonnet-5-5";
const KEY_STORE = "qto-ai-key";

export const loadAiKey = (): string => {
  try { return localStorage.getItem(KEY_STORE) || ""; } catch { return ""; }
};
export const saveAiKey = (k: string) => {
  try { k ? localStorage.setItem(KEY_STORE, k.trim()) : localStorage.removeItem(KEY_STORE); } catch { /* private mode */ }
};

export interface AiItem {
  category: string;
  description: string;
  quantity: number;
  unit: string;
  basis: string;
  confidence: "high" | "medium" | "low";
  location?: string;
}

const CATEGORIES: TradeCategory[] = [
  "أعمال الحفر والردم والأساسات", "أعمال خرسانية مسلحة وعادية", "أعمال حديد التسليح", "أعمال الهياكل المعدنية والهناجر",
  "أعمال الساندوتش بانل والكلادينج", "أعمال المباني والبلوك", "أعمال العزل المائي والحراري", "أعمال البياض والتشطيبات الداخلية",
  "أعمال الأرضيات والرخام والبورسلين", "أعمال الدهانات والديكورات", "أعمال الأبواب والشبابيك والألمنيوم",
  "أعمال التغذية والصرف الصحي", "أعمال التمديدات الكهربائية والإنارة", "أعمال التكييف والتهوية", "أعمال متنوعة أخرى",
];

export const buildPrompt = (info: { title: string; scale: string; notes?: string }) => `أنت مهندس كميات خبير. أمامك لوحة هندسية (الصورة الأولى كاملة، والباقي أجزاء مكبّرة منها).
اللوحة: ${info.title} — المقياس المدوّن: ${info.scale || "غير معروف"}.${info.notes ? `\nملاحظات المستخدم: ${info.notes}` : ""}

المطلوب: جدول حصر كميات (BOQ) لما يمكن حسابه من اللوحة.
قواعد صارمة:
- استخدم فقط الأرقام المكتوبة على اللوحة (أبعاد، مساحات مدوّنة، أعداد، جداول) أو ما تحسبه منها حسابياً. لا تقدّر من شكل الرسم ولا تفترض مقياساً.
- اذكر في "basis" الأرقام والنص الذي اعتمدت عليه بالضبط (مثال: "8 × 25.00 م من الأبعاد على المحور 1–9").
- إن كان البند ممكناً لكن بيانه ناقص (ارتفاع، سماكة) فاذكره بكمية 0 وضع النقص في basis بدل اختلاق رقم.
- الوحدات: م² أو م³ أو م.ط أو عدد أو طن.
- "confidence": high إذا كان الرقم مدوّناً صراحةً، medium إذا حُسب من أبعاد مدوّنة، low إذا كان غير مؤكد.
- التصنيف من هذه القائمة فقط: ${CATEGORIES.join(" | ")}.
أخرج JSON فقط بالشكل: {"items":[{"category":"","description":"","quantity":0,"unit":"","basis":"","confidence":"high","location":""}],"warnings":["..."]}`;

export function parseAiResponse(text: string): { items: AiItem[]; warnings: string[] } {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("لم يرجع النموذج جدولاً مفهوماً. أعد المحاولة.");
  let obj: any;
  try { obj = JSON.parse(m[0]); } catch { throw new Error("تعذر قراءة رد النموذج (JSON غير صالح). أعد المحاولة."); }
  const items: AiItem[] = (Array.isArray(obj.items) ? obj.items : [])
    .map((i: any) => ({
      category: CATEGORIES.includes(i.category) ? i.category : "أعمال متنوعة أخرى",
      description: String(i.description || "").trim(),
      quantity: Number(i.quantity),
      unit: String(i.unit || "").trim() || "عدد",
      basis: String(i.basis || "").trim(),
      confidence: ["high", "medium", "low"].includes(i.confidence) ? i.confidence : "low",
      location: i.location ? String(i.location) : undefined,
    }))
    .filter((i: AiItem) => i.description && Number.isFinite(i.quantity));
  return { items, warnings: Array.isArray(obj.warnings) ? obj.warnings.map(String) : [] };
}

/** Full page + 2x2 overlapping tiles, as base64 JPEG (long edge <= 2000 px), so small dimension text stays readable. */
export async function prepareImages(imageUrl: string): Promise<string[]> {
  const img = new Image();
  img.src = imageUrl;
  await img.decode();
  const out: string[] = [];
  const draw = (sx: number, sy: number, sw: number, sh: number) => {
    const k = Math.min(1, 2000 / Math.max(sw, sh));
    const c = document.createElement("canvas");
    c.width = Math.round(sw * k); c.height = Math.round(sh * k);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    out.push(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
  };
  const W = img.naturalWidth, H = img.naturalHeight;
  draw(0, 0, W, H);
  const tw = W * 0.56, th = H * 0.56;
  for (const fy of [0, 1]) for (const fx of [0, 1]) draw(fx * (W - tw), fy * (H - th), tw, th);
  return out;
}

export async function runAiTakeoff(args: { apiKey: string; images: string[]; prompt: string; signal?: AbortSignal }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: args.signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": args.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 8000,
      messages: [{
        role: "user",
        content: [
          ...args.images.map((data) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } })),
          { type: "text", text: args.prompt },
        ],
      }],
    }),
  });
  if (!res.ok) {
    let msg = "";
    try { msg = (await res.json())?.error?.message || ""; } catch { /* ignore */ }
    if (res.status === 401) throw new Error("مفتاح API غير صحيح.");
    if (res.status === 429) throw new Error("تجاوزت حد الطلبات. انتظر قليلاً ثم أعد المحاولة.");
    throw new Error(`فشل الطلب (${res.status}). ${msg}`.trim());
  }
  const data = await res.json();
  const text = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  return parseAiResponse(text);
}

export function aiItemsToTakeoff(items: AiItem[], sheet: { id: string; code: string; title: string }, startIndex: number): TakeoffItem[] {
  const dim = (u: string) => (/م³|م3/.test(u) ? "volume" : /م²|م2/.test(u) ? "area" : /م\.?ط/.test(u) ? "linear" : "count");
  return items.map((i, idx) => ({
    id: `item-ai-${Date.now()}-${idx}`,
    sheetId: sheet.id,
    sheetCode: sheet.code,
    sheetTitle: sheet.title,
    itemCode: `AI-${String(startIndex + idx + 1).padStart(2, "0")}`,
    description: i.description,
    category: i.category,
    dimensionType: dim(i.unit) as any,
    location: i.location || "قراءة اللوحة بالذكاء الاصطناعي",
    count: 1,
    deduction: 0,
    quantity: i.quantity,
    unit: i.unit,
    unitPrice: 0,
    totalPrice: 0,
    notes: `مستخرج بالذكاء الاصطناعي من اللوحة (${sheet.code}) — الثقة: ${i.confidence === "high" ? "عالية" : i.confidence === "medium" ? "متوسطة" : "منخفضة"}`,
    isVerified: false,
    sourceEvidence: i.basis,
    reviewFlags: ["مستخرج بالذكاء الاصطناعي: راجع الأساس المذكور قبل الاعتماد", "لم يتم إدخال سعر وحدة"],
    extractionSource: "ai_vision",
  }));
}
