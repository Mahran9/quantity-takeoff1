import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

// A stale cached page asking for a chunk that a newer deployment removed: reload once to pick up the new build.
window.addEventListener("vite:preloadError", (e) => {
  try {
    if (sessionStorage.getItem("qto-chunk-recovery") !== "1") {
      sessionStorage.setItem("qto-chunk-recovery", "1");
      e.preventDefault();
      window.location.reload();
    }
  } catch {
    /* ignore */
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
