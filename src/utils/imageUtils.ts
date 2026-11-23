/** Reads an image file and returns a resized data URL (keeps transparency for PNG when asked). */
export async function fileToResizedDataUrl(
  file: File,
  maxSide: number,
  opts: { mime?: "image/png" | "image/jpeg" | "image/webp"; quality?: number } = {}
): Promise<string> {
  if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
    throw new Error("نوع الملف غير مدعوم. استخدم صورة PNG أو JPG أو WebP.");
  }
  if (file.size > 12 * 1024 * 1024) throw new Error("حجم الصورة كبير جداً (الحد الأقصى 12 ميجابايت).");

  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("تعذر قراءة الصورة."));
      el.src = bitmapUrl;
    });
    const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * ratio));
    const h = Math.max(1, Math.round(img.naturalHeight * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("تعذر معالجة الصورة.");
    const mime = opts.mime || "image/png";
    if (mime === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL(mime, opts.quality ?? 0.9);
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}
