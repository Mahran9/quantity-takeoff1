export interface VisualLineCandidate {
  id: string;
  orientation: "horizontal" | "vertical";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  pixelLength: number;
  darkness: number;
}

export interface VisualAnalysisResult {
  width: number;
  height: number;
  darkPixelRatio: number;
  horizontal: VisualLineCandidate[];
  vertical: VisualLineCandidate[];
  notes: string[];
}

/**
 * Local, deterministic raster-plan assistant. It finds long, high-contrast
 * horizontal/vertical strokes; it does NOT classify them as walls, beams,
 * columns or reinforcement. All candidates require engineer confirmation.
 */
export async function analyzePlanImage(imageUrl: string): Promise<VisualAnalysisResult> {
  const image = new Image();
  image.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("تعذر فتح صورة المخطط للتحليل"));
    image.src = imageUrl;
  });

  const maxSide = 1800;
  const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * ratio));
  const height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("تعذر تشغيل محرك تحليل الصورة");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const gray = new Uint8Array(width * height);
  let darkCount = 0;
  for (let i = 0, p = 0; i < pixels.length; i += 4, p++) {
    const value = Math.round(pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114);
    gray[p] = value;
    if (value < 150) darkCount++;
  }

  const threshold = 145;
  const minRun = Math.max(24, Math.round(Math.min(width, height) * 0.035));
  const rowHits: { start: number; end: number; at: number; strength: number }[] = [];
  const colHits: { start: number; end: number; at: number; strength: number }[] = [];

  for (let y = 0; y < height; y += 2) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const dark = x < width && gray[y * width + x] < threshold;
      if (dark && start < 0) start = x;
      if ((!dark || x === width) && start >= 0) {
        const end = x - 1;
        if (end - start + 1 >= minRun) rowHits.push({ start, end, at: y, strength: (end - start + 1) / width });
        start = -1;
      }
    }
  }
  for (let x = 0; x < width; x += 2) {
    let start = -1;
    for (let y = 0; y <= height; y++) {
      const dark = y < height && gray[y * width + x] < threshold;
      if (dark && start < 0) start = y;
      if ((!dark || y === height) && start >= 0) {
        const end = y - 1;
        if (end - start + 1 >= minRun) colHits.push({ start, end, at: x, strength: (end - start + 1) / height });
        start = -1;
      }
    }
  }

  const consolidate = (hits: typeof rowHits, orientation: "horizontal" | "vertical") => {
    hits.sort((a, b) => b.strength - a.strength);
    const kept: VisualLineCandidate[] = [];
    for (const hit of hits) {
      const duplicate = kept.some((line) => {
        const pos = orientation === "horizontal" ? line.y1 : line.x1;
        const a = orientation === "horizontal" ? line.x1 : line.y1;
        const b = orientation === "horizontal" ? line.x2 : line.y2;
        return Math.abs(pos - hit.at) < 5 && Math.max(a, hit.start) < Math.min(b, hit.end);
      });
      if (duplicate) continue;
      kept.push({
        id: `${orientation}-${kept.length + 1}`,
        orientation,
        x1: orientation === "horizontal" ? hit.start : hit.at,
        y1: orientation === "horizontal" ? hit.at : hit.start,
        x2: orientation === "horizontal" ? hit.end : hit.at,
        y2: orientation === "horizontal" ? hit.at : hit.end,
        pixelLength: hit.end - hit.start + 1,
        darkness: Math.round(Math.min(1, hit.strength) * 100),
      });
      if (kept.length >= 40) break;
    }
    return kept;
  };

  return {
    width,
    height,
    darkPixelRatio: darkCount / (width * height),
    horizontal: consolidate(rowHits, "horizontal"),
    vertical: consolidate(colHits, "vertical"),
    notes: [
      "التحليل محلي بالكامل ولا يرسل المخطط إلى أي خادم.",
      "النتائج خطوط مرشحة فقط؛ لا يمكن الجزم بأنها جدران أو كمرات أو أعمدة من الصورة وحدها.",
      "عاير المقياس بنقطتين على بُعد معلوم قبل تحويل البكسل إلى متر.",
    ],
  };
}
