export type ThemePref = "auto" | "light" | "dark";
const KEY = "qto-theme";

export function getPref(): ThemePref {
  try { const v = localStorage.getItem(KEY); if (v === "light" || v === "dark") return v; } catch { /* private mode */ }
  return "auto";
}
export function effectiveTheme(pref: ThemePref = getPref()): "light" | "dark" {
  if (pref !== "auto") return pref;
  try { return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch { return "light"; }
}
export function applyTheme(animate = false) {
  const t = effectiveTheme();
  const root = document.documentElement;
  if (animate) { root.classList.add("theme-fade"); window.setTimeout(() => root.classList.remove("theme-fade"), 450); }
  root.setAttribute("data-theme", t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#0a1418" : "#eef3f2");
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", t);
  window.dispatchEvent(new Event("qto-theme"));
}
export function toggleTheme() {
  const next = effectiveTheme() === "dark" ? "light" : "dark";
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  applyTheme(true);
}
export function initTheme() {
  applyTheme(false);
  try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (getPref() === "auto") applyTheme(true); }); } catch { /* old browsers */ }
  // Printing and PDF export are always on white paper.
  let before = "";
  window.addEventListener("beforeprint", () => { before = document.documentElement.getAttribute("data-theme") || ""; document.documentElement.setAttribute("data-theme", "light"); });
  window.addEventListener("afterprint", () => { if (before) document.documentElement.setAttribute("data-theme", before); });
}
