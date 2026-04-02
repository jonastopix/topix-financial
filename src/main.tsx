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

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  enabled: import.meta.env.PROD,
  tracesSampleRate: 0.1,
  integrations: [Sentry.browserTracingIntegration()],
});

createRoot(document.getElementById("root")!).render(<App />);
