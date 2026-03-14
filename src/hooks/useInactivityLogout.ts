import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "lastActivityAt";
const THROTTLE_MS = 30_000; // update localStorage at most every 30s
const CHECK_INTERVAL_MS = 60_000; // check every 60s
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function getTimeoutMs(configMinutes?: number): number {
  if (configMinutes && configMinutes > 0) return configMinutes * 60 * 1000;
  return DEFAULT_TIMEOUT_MS;
}

function stampActivity() {
  localStorage.setItem(STORAGE_KEY, Date.now().toString());
}

function getLastActivity(): number {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? parseInt(raw, 10) : Date.now();
}

/**
 * Tracks user activity and signs out after a configurable period of inactivity.
 * @param enabled - only run when a user is authenticated
 * @param timeoutMinutes - override from app_config (optional)
 */
export function useInactivityLogout(enabled: boolean, timeoutMinutes?: number) {
  const lastStampRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    // Stamp on mount so fresh login gets full window
    stampActivity();

    const timeoutMs = getTimeoutMs(timeoutMinutes);

    const throttledStamp = () => {
      const now = Date.now();
      if (now - lastStampRef.current > THROTTLE_MS) {
        lastStampRef.current = now;
        stampActivity();
      }
    };

    const events = ["mousemove", "keydown", "touchstart", "scroll", "click"] as const;
    events.forEach((e) => window.addEventListener(e, throttledStamp, { passive: true }));

    const interval = setInterval(() => {
      const elapsed = Date.now() - getLastActivity();
      if (elapsed > timeoutMs) {
        console.info("[inactivity] Session timed out after", Math.round(elapsed / 60000), "min — signing out");
        supabase.auth.signOut();
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      events.forEach((e) => window.removeEventListener(e, throttledStamp));
      clearInterval(interval);
    };
  }, [enabled, timeoutMinutes]);
}
