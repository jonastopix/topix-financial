import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";

// 301-style redirect: old domains → app.theboardroom.dk
const OLD_HOSTS = ["topix.lovable.app"];
if (OLD_HOSTS.includes(window.location.hostname)) {
  window.location.replace(
    "https://app.theboardroom.dk" + window.location.pathname + window.location.search + window.location.hash
  );
}

// Normalize www.app.theboardroom.dk → app.theboardroom.dk for host consistency
if (window.location.hostname === "www.app.theboardroom.dk") {
  window.location.replace(
    "https://app.theboardroom.dk" + window.location.pathname + window.location.search + window.location.hash
  );
}

// Pre-React early redirect: if a known-onboarded user lands on /onboarding
// (e.g. iOS standalone restoring last route), bounce immediately to "/"
// before React even mounts. This avoids the brief flash of the onboarding
// shell on resume from background.
try {
  if (window.location.pathname === "/onboarding") {
    const flag = localStorage.getItem("tbr.onboarded");
    if (flag === "1") {
      window.history.replaceState({}, "", "/");
    }
  }
} catch {
  // ignore (private mode etc.)
}

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  enabled: import.meta.env.PROD,
  tracesSampleRate: 0.1,
  integrations: [Sentry.browserTracingIntegration()],
});

createRoot(document.getElementById("root")!).render(<App />);
