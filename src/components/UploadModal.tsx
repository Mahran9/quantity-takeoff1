import { importWithRecovery } from "../utils/lazyImport";
import React, { useState } from "react";
import {
  X,
  Upload,
  FileCode2,
  FileText,
  Image as ImageIcon,
  AlertCircle,
  Layers,
} from "lucide-react";
import { BlueprintSheet, DisciplineType } from "../types";
import { parseDxfContent } from "../utils/dxfParser";
import { renderPdfPage, getPdfPageCount } from "../utils/pdfProcessor";
import { decodeDxfBuffer, explainUnreadableDxf } from "../utils/dxfDecode";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSheetCreated: (sheet: BlueprintSheet) => void;
  onMultipleSheetsCreated?: (sheets: BlueprintSheet[]) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onSheetCreated,
  onMultipleSheetsCreated,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<"pdf" | "dxf" | "image">("pdf");
  const [sheetCode, setSheetCode] = useState("S-01");
  const [sheetTitle, setSheetTitle] = useState("");
  const [discipline, setDiscipline] = useState<DisciplineType>("إنشائي");
  const [scale, setScale] = useState("1:100");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pdfTotalPages, setPdfTotalPages] = useState<number>(1);
  const [selectedPage, setSelectedPage] = useState<number>(1);
  const [importAllPages, setImportAllPages] = useState<boolean>(false);
  const [pageRangeEnd, setPageRangeEnd] = useState<number>(1);
  const [pdfArrayBuffer, setPdfArrayBuffer] = useState<ArrayBuffer | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setError(null);
    setFile(selected);

    const ext = selected.name.split(".").pop()?.toLowerCase() || "";
    const cleanName = selected.name.replace(/\.[^/.]+$/, "");
    if (!sheetTitle) setSheetTitle(cleanName);

    if (ext === "dxf" || ext === "dwg") {
      setFileType("dxf");
      setSheetCode("CAD-01");
    } else if (ext === "pdf") {
      setFileType("pdf");
      try {
        const buffer = await selected.arrayBuffer();
        setPdfArrayBuffer(buffer);
        const count = await getPdfPageCount(buffer);
        setPdfTotalPages(count);
        setSelectedPage(1);
        setPageRangeEnd(Math.min(count, 10));
        setImportAllPages(count > 1);
      } catch (err) {
        console.error("PDF preview error:", err);
      }
    } else {
      setFileType("image");
    }
  };

  const handleUploadSubmit = async () => {
    if (!file) {
      setError("يرجى اختيار ملف المخطط (PDF أو DXF أو صورة)");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (fileType === "pdf" && pdfArrayBuffer && importAllPages && pdfTotalPages > 1) {
        const start = Math.max(1, Math.min(selectedPage, pdfTotalPages));
        const end = Math.max(start, Math.min(pageRangeEnd, pdfTotalPages));
        const createdSheets: BlueprintSheet[] = [];

        for (let p = start; p <= end; p++) {
          const rendered = await renderPdfPage(pdfArrayBuffer, p, 1.8);
          createdSheets.push({
            id: `sheet-${Date.now()}-p${p}`,
            code: `${sheetCode || "PLN"}-P${p}`,
            title: `${sheetTitle || file.name} (صفحة ${p})`,
            discipline,
            fileType: "pdf",
            fileName: file.name,
            fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
            scale: scale || "1:100",
            imageUrl: rendered.dataUrl,
            pdfPageNumber: p,
            pdfTotalPages,
            pdfTextContent: rendered.extractedText,
            visualTokens: rendered.visualTokens,
            pdfVector: rendered.vector || undefined,
            status: "new",
            measurementPins: [],
            createdAt: new Date().toISOString(),
          });
        }

        if (onMultipleSheetsCreated) {
          onMultipleSheetsCreated(createdSheets);
        } else {
          createdSheets.forEach((s) => onSheetCreated(s));
        }
        onClose();
        return;
      }

      let imageUrl: string | undefined = undefined;
      let dxfRawSummary: any = undefined;
      let dxfLayers: any = undefined;
      let pdfTextContent: string | undefined = undefined;
      let visualTokens: any = undefined;
      let pdfVector: any = undefined;

      const isDwg = /\.dwg$/i.test(file.name);
      if (fileType === "dxf" && isDwg) {
        if (file.size > 150 * 1024 * 1024) {
          throw new Error("ملف DWG كبير جداً (أكثر من 150 م.ب). احفظه DXF بطبقات أقل ثم أعد المحاولة.");
        }
        const { readDwgFile } = await importWithRecovery(() => import("../utils/dwgReader"));
        const { result: parsedDwg } = await readDwgFile(await file.arrayBuffer());
        if (!parsedDwg.layers || parsedDwg.layers.length === 0) {
          throw new Error("لم يُعثر على طبقات في ملف DWG. احفظه DXF أو صدّره PDF.");
        }
        dxfRawSummary = parsedDwg;
        dxfLayers = parsedDwg.layers;
      } else if (fileType === "dxf") {
        if (file.size > 150 * 1024 * 1024) {
          throw new Error("ملف DXF كبير جداً (أكثر من 150 م.ب). صدّره بطبقات أقل أو قسّمه ثم أعد المحاولة.");
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        const unreadable = explainUnreadableDxf(bytes);
        if (unreadable) throw new Error(unreadable);
        const decoded = decodeDxfBuffer(bytes);
        const parsed = parseDxfContent(decoded.text);
        if (!parsed || !parsed.layers || parsed.layers.length === 0) {
          throw new Error("لم يُعثر على طبقات أو عناصر في ملف DXF. تأكد أنه ملف DXF نصي سليم (وليس DWG أو DXF ثنائي).");
        }
        dxfRawSummary = parsed;
        dxfLayers = parsed.layers;
      } else if (fileType === "pdf" && pdfArrayBuffer) {
        const rendered = await renderPdfPage(pdfArrayBuffer, selectedPage, 2.0);
        imageUrl = rendered.dataUrl;
        pdfTextContent = rendered.extractedText;
        visualTokens = rendered.visualTokens;
        pdfVector = rendered.vector || undefined;
      } else if (fileType === "image") {
        const reader = new FileReader();
        imageUrl = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      }

      const newSheet: BlueprintSheet = {
        id: `sheet-${Date.now()}`,
        code: sheetCode || "PLN-01",
        title: sheetTitle || file.name,
        discipline,
        fileType,
        fileName: file.name,
        fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        scale: scale || "1:100",
        imageUrl,
        pdfPageNumber: fileType === "pdf" ? selectedPage : undefined,
        pdfTotalPages: fileType === "pdf" ? pdfTotalPages : undefined,
        pdfTextContent,
        visualTokens,
        pdfVector,
        dxfLayers,
        dxfRawSummary,
        dxfData: fileType === "dxf" ? dxfRawSummary : undefined,
        status: "new",
        measurementPins: [],
        createdAt: new Date().toISOString(),
      };

      onSheetCreated(newSheet);
      onClose();
    } catch (err: any) {
      console.error("Error creating sheet from file:", err);
      setError(err?.message || "حدث خطأ أثناء معالجة ملف المخطط.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full overflow-hidden text-right">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center">
              <Upload className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold">إضافة مخطط هندسي جديد</h2>
              <p className="text-xs text-slate-400">
                يدعم PDF (صفحة أو عدة صفحات دفعة واحدة)، أوتوكاد DXF، والصور
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <label className="block border-2 border-dashed border-slate-300 hover:border-amber-400 rounded-2xl p-6 text-center cursor-pointer bg-slate-50 transition-all">
            <input type="file" accept=".pdf,.dxf,.dwg,.png,.jpg,.jpeg,.webp" onChange={handleFileChange} className="hidden" />
            <div className="flex justify-center gap-3 mb-2 text-slate-400">
              <FileText className="w-6 h-6 text-rose-500" />
              <FileCode2 className="w-6 h-6 text-cyan-600" />
              <ImageIcon className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="text-sm font-bold text-slate-800">
              {file ? file.name : "اختر ملف المخطط"}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              PDF · DXF · DWG · صورة — تتم القراءة على جهازك بدون إنترنت
            </div>
          </label>

          {file && /\.dwg$/i.test(file.name) && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-6">
              قراءة DWG مباشرة <b>تجريبية</b>. راجع الطبقات والكميات قبل الاعتماد، وإن بدت الأرقام غريبة فاحفظ الملف DXF من AutoCAD وأعد رفعه.
            </div>
          )}

          {fileType === "pdf" && pdfTotalPages > 1 && (
            <div className="p-4 rounded-2xl bg-cyan-50 border border-cyan-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-900 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-cyan-600" />
                  ملف PDF متعدد الصفحات ({pdfTotalPages} صفحة)
                </span>
                <label className="flex items-center gap-2 text-xs font-bold text-cyan-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={importAllPages}
                    onChange={(e) => setImportAllPages(e.target.checked)}
                    className="rounded"
                  />
                  <span>استيراد نطاق صفحات دفعة واحدة</span>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    {importAllPages ? "من صفحة:" : "رقم الصفحة:"}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={pdfTotalPages}
                    value={selectedPage}
                    onChange={(e) => setSelectedPage(Math.max(1, Math.min(pdfTotalPages, Number(e.target.value))))}
                    className="w-full px-3 py-1.5 rounded-lg border border-cyan-300 bg-white font-mono text-sm"
                  />
                </div>
                {importAllPages && (
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">إلى صفحة:</label>
                    <input
                      type="number"
                      min={selectedPage}
                      max={pdfTotalPages}
                      value={pageRangeEnd}
                      onChange={(e) => setPageRangeEnd(Math.max(selectedPage, Math.min(pdfTotalPages, Number(e.target.value))))}
                      className="w-full px-3 py-1.5 rounded-lg border border-cyan-300 bg-white font-mono text-sm"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">كود اللوحة</label>
              <input type="text" value={sheetCode} onChange={(e) => setSheetCode(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">مقياس الرسم</label>
              <input type="text" value={scale} onChange={(e) => setScale(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">عنوان اللوحة</label>
              <input type="text" value={sheetTitle} onChange={(e) => setSheetTitle(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">التخصص</label>
              <select value={discipline} onChange={(e) => setDiscipline(e.target.value as DisciplineType)} className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm">
                <option value="إنشائي">إنشائي</option>
                <option value="معماري">معماري</option>
                <option value="صحي وتغذية">صحي وتغذية</option>
                <option value="كهرباء وإنارة">كهرباء وإنارة</option>
                <option value="ميكانيك وتكييف">ميكانيك وتكييف</option>
                <option value="تشطيبات وديكور">تشطيبات وديكور</option>
                <option value="أعمال الموقع العام">أعمال الموقع العام</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">
              إلغاء
            </button>
            <button
              onClick={handleUploadSubmit}
              disabled={isLoading || !file}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs sm:text-sm font-bold"
            >
              {isLoading ? "جاري المعالجة والفهرسة..." : "إضافة اللوحة وبدء الحصر"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
