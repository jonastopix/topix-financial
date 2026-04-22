import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function useScrollToHash(delay = 400) {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const id = hash.replace("#", "");
    const timer = setTimeout(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [hash]);
}
