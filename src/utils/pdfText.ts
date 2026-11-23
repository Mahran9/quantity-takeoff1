/** Pure text heuristics (no PDF.js import) so they can be unit-tested under plain Node. */
export function parsePdfEngineeringText(text: string): {
  detectedCode?: string;
  detectedScale?: string;
  detectedDimensions: string[];
  detectedSchedules: string[];
} {
  const detectedDimensions: string[] = [];
  const detectedSchedules: string[] = [];

  const scaleMatch = text.match(/1\s*[:/]\s*(\d{2,3})/);
  const detectedScale = scaleMatch ? `1:${scaleMatch[1]}` : undefined;

  const codeMatch = text.match(/\b([SAEMC]-[0-9]{1,3}|[SAEMC][0-9]{2})\b/i);
  const detectedCode = codeMatch ? codeMatch[1].toUpperCase() : undefined;

  const dimRegex = /\b(\d+(\.\d+)?)\s*[xX*×]\s*(\d+(\.\d+)?)(\s*[xX*×]\s*(\d+(\.\d+)?))?\b/g;
  let match;
  while ((match = dimRegex.exec(text)) !== null && detectedDimensions.length < 30) {
    detectedDimensions.push(match[0]);
  }

  const scheduleRegex = /\b([CFBWD]\d{1,2})\b/g;
  while ((match = scheduleRegex.exec(text)) !== null && detectedSchedules.length < 30) {
    if (!detectedSchedules.includes(match[1])) {
      detectedSchedules.push(match[1]);
    }
  }

  return {
    detectedCode,
    detectedScale,
    detectedDimensions,
    detectedSchedules,
  };
}

// Mobile WebViews (Android/iOS) fail to allocate canvases beyond ~16M pixels or ~4096px on a side,
// which A1/A0 sheets at 2x easily exceed. The render scale is therefore capped adaptively.
const MAX_CANVAS_SIDE = 4096;
const MAX_CANVAS_PIXELS = 14_000_000;

export function computeSafeRenderScale(pageWidth: number, pageHeight: number, requested: number): number {
  const bySide = MAX_CANVAS_SIDE / Math.max(pageWidth, pageHeight, 1);
  const byPixels = Math.sqrt(MAX_CANVAS_PIXELS / Math.max(pageWidth * pageHeight, 1));
  return Math.max(0.4, Math.min(requested, bySide, byPixels));
}
