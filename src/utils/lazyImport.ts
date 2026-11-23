/**
 * Loads a lazily-built chunk. After a new deployment, an old cached page may still point to a chunk that no longer
 * exists ("Failed to fetch dynamically imported module"). In that case we clear the offline cache once and reload
 * so the user gets the new version instead of a raw browser error.
 */
export async function importWithRecovery<T>(loader: () => Promise<T>): Promise<T> {
  try {
    return await loader();
  } catch (err) {
    const key = "qto-chunk-recovery";
    let already = false;
    try {
      already = sessionStorage.getItem(key) === "1";
      sessionStorage.setItem(key, "1");
    } catch {
      /* storage unavailable */
    }
    if (!already && typeof window !== "undefined") {
      try {
        const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
        await Promise.all(regs.map((r) => r.unregister()));
        const keys = (await caches?.keys?.()) || [];
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        /* ignore */
      }
      window.location.reload();
      return new Promise<T>(() => undefined); // page is reloading
    }
    throw new Error("تعذر تحميل جزء من التطبيق. أغلق التطبيق وافتحه من جديد (أو امسح بيانات الموقع) ثم أعد المحاولة.");
  }
}
