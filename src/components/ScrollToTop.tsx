import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    // Scroll window (desktop)
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    // Also scroll the main content area (mobile often scrolls within main, not window)
    document.querySelector("main")?.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
};

export default ScrollToTop;
