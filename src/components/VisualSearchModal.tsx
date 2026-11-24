import React, { useState, useMemo } from "react";
import {
  X,
  Search,
  ScanSearch,
  Plus,
  Eye,
  CheckCircle2,
  AlertCircle,
  FileText,
  Layers,
  ScanText,
  TableProperties,
  CheckCheck,
} from "lucide-react";
import { BlueprintSheet, TakeoffItem, VisualSearchToken } from "../types";
import {
  getSheetVisualTokens,
  searchSheetTokens,
  extractStructuredTakeoffFromTokens,
  buildTakeoffFromCandidate,
  runLocalOcrOnImage,
  AutoTakeoffCandidate,
} from "../utils/visualSearchEngine";

interface VisualSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSheet: BlueprintSheet;
  onAddTakeoffItem: (item: TakeoffItem) => void;
  onHighlightTokens: (tokens: VisualSearchToken[], queryLabel: string) => void;
}

export const VisualSearchModal: React.FC<VisualSearchModalProps> = ({
  isOpen,
  onClose,
  activeSheet,
  onAddTakeoffItem,
  onHighlightTokens,
}) => {
  const [query, setQuery] = useState("");
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});
  const [ocrTokens, setOcrTokens] = useState<VisualSearchToken[]>([]);
  const [isRunningOcr, setIsRunningOcr] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrError, setOcrError] = useState<string | null>(null);

  const baseTokens = useMemo(() => getSheetVisualTokens(activeSheet), [activeSheet]);
  const allTokens = useMemo(
    () => (ocrTokens.length > 0 ? [...baseTokens, ...ocrTokens] : baseTokens),
    [baseTokens, ocrTokens]
  );

  const autoCandidates = useMemo(
    () => extractStructuredTakeoffFromTokens(activeSheet, allTokens),
    [activeSheet, allTokens]
  );
  const searchResults = useMemo(() => searchSheetTokens(allTokens, query), [allTokens, query]);

  if (!isOpen) return null;

  const handleRunLocalOcr = async () => {
    if (!activeSheet.imageUrl) {
      setOcrError("لا توجد صورة للوحة لتشغيل المسح الضوئي OCR.");
      return;
    }
    setIsRunningOcr(true);
    setOcrProgress(5);
    setOcrError(null);
    try {
      const tokens = await runLocalOcrOnImage(activeSheet.imageUrl, (pct) => setOcrProgress(pct));
      setOcrTokens(tokens);
      if (tokens.length === 0) {
        setOcrError("لم يتم العثور على نصوص واضحة في الصورة. تأكد من دقة المخطط.");
      }
    } catch (err: any) {
      setOcrError(err?.message || "تعذر تشغيل المسح الضوئي المحلي OCR.");
    } finally {
      setIsRunningOcr(false);
    }
  };

  const handleLocateOnBlueprint = (tokens: VisualSearchToken[], label: string) => {
    onHighlightTokens(tokens, label);
    onClose();
  };

  const handleAddCandidate = (c: AutoTakeoffCandidate) => {
    const item = buildTakeoffFromCandidate(activeSheet, c);
    onAddTakeoffItem(item);
    setAddedIds((prev) => ({ ...prev, [c.id]: true }));
  };

  const handleAddAllCandidates = () => {
    autoCandidates.forEach((c) => {
      if (!addedIds[c.id]) {
        onAddTakeoffItem(buildTakeoffFromCandidate(activeSheet, c));
      }
    });
    const next: Record<string, boolean> = { ...addedIds };
    autoCandidates.forEach((c) => {
      next[c.id] = true;
    });
    setAddedIds(next);
  };

  const handleAddCustomSearchCount = () => {
    if (!query.trim() || searchResults.length === 0) return;
    onAddTakeoffItem({
      id: `item-vsearch-${Date.now()}`,
      sheetId: activeSheet.id,
      sheetCode: activeSheet.code,
      sheetTitle: activeSheet.title,
      itemCode: query.trim().slice(0, 12),
      description: `بند مرصود بالبحث البصري: "${query.trim()}" (${searchResults.length} تطابق في اللوحة ${activeSheet.code})`,
      category: "أعمال متنوعة أخرى",
      dimensionType: "count",
      location: activeSheet.title,
      count: searchResults.length,
      quantity: searchResults.length,
      unit: "عدد",
      unitPrice: 0,
      totalPrice: 0,
      extractionSource: "visual_search",
      sourceEvidence: `بحث بصري محلي عن "${query.trim()}"`,
      notes: "تم العد تلقائياً عبر محرك البحث البصري المحلي — يرجى المراجعة وإدخال السعر.",
    });
    onHighlightTokens(searchResults, query.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90dvh] flex flex-col overflow-hidden text-right">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center">
              <ScanSearch className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-base font-bold">محرك قراءة المخططات وتحديد الكميات المحلي (v4.1)</h2>
              <p className="text-xs text-slate-400">
                يقرأ الجداول والرموز والأبعاد من PDF و DXF والصور (OCR محلي) ويصنف الأصناف ويحسب الكميات بدون AI
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Local OCR Bar */}
        <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث داخل المخطط (F1، C1، IPE 300، Ø16، قاعدة، عمود)..."
                className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm"
              />
            </div>

            {activeSheet.imageUrl && (
              <button
                onClick={handleRunLocalOcr}
                disabled={isRunningOcr}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-amber-300 text-xs font-bold"
                title="قراءة النصوص من الصور وملفات PDF المصوّرة (Scan) محلياً"
              >
                <ScanText className="w-4 h-4" />
                <span>
                  {isRunningOcr ? `جاري المسح الضوئي (${ocrProgress}%)...` : "مسح ضوئي للنصوص (OCR محلي)"}
                </span>
              </button>
            )}

            {query.trim() && searchResults.length > 0 && (
              <>
                <button
                  onClick={() => handleLocateOnBlueprint(searchResults, query.trim())}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold"
                >
                  <Eye className="w-4 h-4" />
                  <span>تحديد ({searchResults.length})</span>
                </button>
                <button
                  onClick={handleAddCustomSearchCount}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة للحصر</span>
                </button>
              </>
            )}
          </div>

          {ocrError && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{ocrError}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-cyan-600" />
              العناصر المقروءة: <strong className="font-mono text-slate-800">{allTokens.length}</strong>
              {activeSheet.dxfRawSummary?.unitInfo && (
                <span className="mr-2 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold">
                  وحدة CAD: {activeSheet.dxfRawSummary.unitInfo.name}
                </span>
              )}
            </span>

            {autoCandidates.length > 0 && (
              <button
                onClick={handleAddAllCandidates}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>إضافة جميع البنود المستخرجة ({autoCandidates.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {allTokens.length === 0 ? (
            <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <span>هذا الملف صورة أو PDF ممسوح ضوئياً (Scan) بدون طبقة نصوص رقمية</span>
              </div>
              <p className="text-xs leading-relaxed text-amber-800">
                اضغط على زر <strong>«مسح ضوئي للنصوص (OCR محلي)»</strong> بالأعلى لقراءة النصوص والأبعاد من الصورة محلياً داخل المتصفح،
                أو استخدم أداة <strong>معايرة المقياس</strong> والقياس المباشر على المخطط.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <TableProperties className="w-4 h-4 text-amber-600" />
                <span>البنود والأصناف والكميات المستخرجة تلقائياً من المخطط ({autoCandidates.length})</span>
              </h3>

              {autoCandidates.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
                  تمت قراءة {allTokens.length} نص من اللوحة، لكن لم يتم العثور على رموز جداول قياسية (مثل F1, C1, B1, IPE). استخدم مربع البحث بالأعلى للبحث عن أي بند محدد وتحديد مواقعه.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {autoCandidates.map((c) => (
                    <div
                      key={c.id}
                      className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-cyan-300 transition-all flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="space-y-1 flex-1 min-w-[240px]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-slate-900 text-amber-400 font-mono text-xs font-bold">
                            {c.itemCode}
                          </span>
                          <span className="text-sm font-bold text-slate-900">{c.description}</span>
                        </div>
                        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                            {c.category}
                          </span>
                          <span className="font-mono text-cyan-700">{c.formula}</span>
                          <span>•</span>
                          <span className="text-[11px]">{c.confidenceLabel}</span>
                        </div>
                        <div className="text-[11px] text-slate-400">{c.evidence}</div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                          <div className="text-base font-black font-mono text-emerald-900">
                            {c.quantity} <span className="text-xs font-bold">{c.unit}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleLocateOnBlueprint(c.tokens, c.itemCode)}
                          className="p-2 rounded-xl bg-cyan-50 hover:bg-cyan-100 text-cyan-700"
                          title="تحديد المواقع على المخطط"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleAddCandidate(c)}
                          disabled={addedIds[c.id]}
                          className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 ${
                            addedIds[c.id]
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-500 hover:bg-amber-400 text-slate-950"
                          }`}
                        >
                          {addedIds[c.id] ? (
                            <>
                              <CheckCircle2 className="w-4 h-4" />
                              <span>أُضيف</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-4 h-4" />
                              <span>للحصر</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
