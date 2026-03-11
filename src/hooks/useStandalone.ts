import { useEffect, useState } from "react";

/**
 * Detects iOS / PWA standalone mode.
 * Sets data-standalone="true" on <html> for CSS targeting.
 */
export function useStandalone() {
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const iosStandalone = (navigator as any).standalone === true;
    const mediaStandalone = window.matchMedia("(display-mode: standalone)").matches;
    const standalone = iosStandalone || mediaStandalone;

    setIsStandalone(standalone);

    if (standalone) {
      document.documentElement.dataset.standalone = "true";
    }

    // Listen for changes (e.g. if added to homescreen while running)
    const mql = window.matchMedia("(display-mode: standalone)");
    const onChange = (e: MediaQueryListEvent) => {
      const val = e.matches || (navigator as any).standalone === true;
      setIsStandalone(val);
      if (val) {
        document.documentElement.dataset.standalone = "true";
      } else {
        delete document.documentElement.dataset.standalone;
      }
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isStandalone;
}
