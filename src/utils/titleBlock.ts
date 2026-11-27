import { BlueprintSheet } from "../types";

const LABEL_CLIENT = /^(?:(?:اسم\s*)?(?:العميل|المالك|الملاك|صاحب\s*المشروع|السادة)|(?:client|owner|customer|employer)(?:\s*name)?)\s*[:：\-–]?\s*(.*)$/i;
const LABEL_PROJECT = /^(?:(?:اسم\s*)?(?:المشروع)|project(?:\s*(?:name|title))?)\s*[:：\-–]?\s*(.*)$/i;
const ANY_LABEL = /^(?:client|owner|customer|employer|project|drawing|title|scale|sheet|date|designed|drawn|checked|revision|rev|consultant|contractor|المشروع|العميل|المالك|الاستشاري|المقاول|المخطط|اللوحة|التاريخ|المقياس)\b/i;

const clean = (s: string) => s.replace(/\s+/g, " ").replace(/^[:：\-–\s]+|[:：\s]+$/g, "").trim();
const plausible = (s: string) =>
  s.length >= 3 && s.length <= 60 && /[A-Za-z؀-ۿ]{3}/.test(s) && !/^\d+([.,:/\-]\d+)*$/.test(s) && !ANY_LABEL.test(s) &&
  !/\b(scale|dwg|sheet|plan|section|elevation|layout|detail)\b/i.test(s);

function pick(tokens: string[], label: RegExp): string | undefined {
  for (let i = 0; i < tokens.length; i++) {
    const m = label.exec(tokens[i]);
    if (!m) continue;
    const inline = clean(m[1] || "");
    if (plausible(inline)) return inline;
    if (!inline) {
      for (let j = i + 1; j <= Math.min(i + 2, tokens.length - 1); j++) {
        const v = clean(tokens[j]);
        if (plausible(v)) return v;
        if (ANY_LABEL.test(v)) break;
      }
    }
  }
  return undefined;
}

/** Client and project names written in a drawing's title block (label then value, same token or the next). */
export function readTitleBlockNames(sheets: BlueprintSheet[]): { client?: string; project?: string } {
  const out: { client?: string; project?: string } = {};
  for (const s of sheets) {
    const tokens = (s.visualTokens || []).map((t) => (t.text || "").trim()).filter(Boolean);
    if (!tokens.length) continue;
    out.client = out.client || pick(tokens, LABEL_CLIENT);
    out.project = out.project || pick(tokens, LABEL_PROJECT);
    if (out.client && out.project) break;
  }
  return out;
}

export const isUnsetName = (v: string | undefined) => !v || !v.trim() || v.trim() === "عميل" || v.trim() === "العميل (مثال)";
