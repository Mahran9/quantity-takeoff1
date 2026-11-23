import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PdfVectorSummary, VisualSearchToken } from "../types";
import { extractVectorPaths } from "./pdfVector";
import { analyzePdfPaths, calibrateScale, extractTextScale, parseDimensionNumbers, summarizePdfPage } from "./pdfPlan";

// Bundle the matching PDF.js worker locally.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface PdfPageRenderResult {
  pageNumber: number;
  totalPages: number;
  dataUrl: string;
  width: number;
  height: number;
  extractedText: string;
  visualTokens: VisualSearchToken[];
  isScannedPdf: boolean;
  vectorOpCount: number;
  /** Geometry read from the drawing's vector operators (null for scanned PDFs or on failure). */
  vector: PdfVectorSummary | null;
}

/**
 * Render a specific page of a PDF file to a high-resolution data URL
 * and extract positioned text tokens for the local visual search engine.
 */
import { computeSafeRenderScale } from "./pdfText";
export { computeSafeRenderScale };

export async function renderPdfPage(
  fileData: ArrayBuffer,
  pageNumber: number = 1,
  scale: number = 2.0
): Promise<PdfPageRenderResult> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(fileData.slice(0)) });
  const pdfDoc = await loadingTask.promise;
  try {
    return await renderLoadedPage(pdfDoc, pageNumber, scale);
  } finally {
    // Release worker memory; previously every page render leaked the whole document.
    try {
      await loadingTask.destroy();
    } catch {
      /* ignore */
    }
  }
}

async function renderLoadedPage(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  requestedScale: number
): Promise<PdfPageRenderResult> {
  const totalPages = pdfDoc.numPages;
  const validPageNum = Math.max(1, Math.min(pageNumber, totalPages));
  const page = await pdfDoc.getPage(validPageNum);

  const baseViewport = page.getViewport({ scale: 1 });
  const scale = computeSafeRenderScale(baseViewport.width, baseViewport.height, requestedScale);
  const viewport = page.getViewport({ scale });
  const textContent = await page.getTextContent();

  const visualTokens: VisualSearchToken[] = [];
  const textParts: string[] = [];

  textContent.items.forEach((item: any, idx: number) => {
    const rawStr = (item.str || "").trim();
    if (!rawStr) return;
    textParts.push(rawStr);

    // Transform PDF text coordinates into viewport pixel coordinates
    if (Array.isArray(item.transform) && item.transform.length >= 6) {
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const fontHeight = Math.hypot(tx[2], tx[3]) || 12;
      const xPx = tx[4];
      const yPx = tx[5] - fontHeight;
      const wPx = (item.width || rawStr.length * 6) * scale;

      const normX = Math.max(0, Math.min(1, xPx / viewport.width));
      const normY = Math.max(0, Math.min(1, yPx / viewport.height));
      const normW = Math.max(0.015, Math.min(1 - normX, Math.abs(wPx) / viewport.width));
      const normH = Math.max(0.015, Math.min(1 - normY, fontHeight / viewport.height));

      visualTokens.push({
        id: `pdf-tok-${validPageNum}-${idx}`,
        text: rawStr,
        x: normX,
        y: normY,
        w: normW,
        h: normH,
        source: "pdf_text",
      });
    }
  });

  const extractedText = textParts.join(" ");

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  if (!context) {
    throw new Error("فشل في تهيئة سياق الرسم للـ PDF");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: context,
    viewport,
  } as any).promise;

  let vectorOpCount = 0;
  let vector: PdfVectorSummary | null = null;
  try {
    const opList = await page.getOperatorList();
    vectorOpCount = opList.fnArray ? opList.fnArray.length : 0;
    // Very large operator lists would freeze a phone; those are summarised as "too large".
    if (vectorOpCount > 0 && vectorOpCount < 6_000_000) {
      let ocConfig: any = null;
      try {
        ocConfig = await (pdfDoc as any).getOptionalContentConfig?.();
      } catch {
        ocConfig = null;
      }
      const ext = extractVectorPaths(opList as any, (pdfjsLib as any).OPS, {
        resolveLayer: (key) => {
          const g = ocConfig?.getGroup?.(key as string);
          return g?.name ? String(g.name) : undefined;
        },
      });
      const [vx0, vy0, vx1, vy1] = (page as any).view as number[];
      const pg = { width: Math.abs(vx1 - vx0), height: Math.abs(vy1 - vy0) };
      const analysis = analyzePdfPaths(ext.paths, pg);
      const numbers = parseDimensionNumbers(textParts);
      const textScale = extractTextScale(textParts.join(" "));
      const scale = calibrateScale(ext.paths, numbers, pg, textScale);
      vector = summarizePdfPage({ analysis, page: pg, userUnit: (page as any).userUnit || 1, truncated: ext.truncated, scale, numbers });
    }
  } catch (e) {
    console.warn("PDF vector read failed", e);
    vector = null;
  }
  const isScannedPdf = visualTokens.length < 3;
  // WebP keeps line drawings sharp at a fraction of PNG size; browsers without WebP fall back to PNG automatically.
  const dataUrl = canvas.toDataURL("image/webp", 0.92);
  const outWidth = viewport.width;
  const outHeight = viewport.height;
  try {
    page.cleanup();
  } catch {
    /* ignore */
  }
  canvas.width = 0;
  canvas.height = 0;

  return {
    pageNumber: validPageNum,
    totalPages,
    dataUrl,
    width: outWidth,
    height: outHeight,
    extractedText,
    visualTokens,
    isScannedPdf,
    vectorOpCount,
    vector,
  };
}

export { parsePdfEngineeringText } from "./pdfText";

export async function getPdfPageCount(fileData: ArrayBuffer): Promise<number> {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(fileData.slice(0)) });
    const pdfDoc = await loadingTask.promise;
    const n = pdfDoc.numPages;
    await loadingTask.destroy().catch(() => undefined);
    return n;
  } catch (err) {
    console.error("Error reading PDF page count:", err);
    return 1;
  }
}
