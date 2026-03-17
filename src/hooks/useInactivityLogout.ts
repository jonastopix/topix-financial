import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "lastActivityAt";
const THROTTLE_MS = 30_000;
const CHECK_INTERVAL_MS = 10_000; // check every 10s for smoother warning
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const WARNING_BEFORE_MS = 2 * 60 * 1000; // show warning 2 min before logout

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
 * Returns warning state so a dialog can be shown before logout.
 */
export function useInactivityLogout(enabled: boolean, timeoutMinutes?: number) {
  const lastStampRef = useRef(0);
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const extendSession = useCallback(() => {
    stampActivity();
    setShowWarning(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const timeoutMs = getTimeoutMs(timeoutMinutes);
    const warningAtMs = timeoutMs - WARNING_BEFORE_MS;

    // Always stamp on enable (fresh login = fresh timer).
    // Only enforce stale-session logout if there WAS a prior stamp.
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const elapsed = Date.now() - parseInt(raw, 10);
      if (elapsed > timeoutMs) {
        console.info("[inactivity] Session already expired on load — signing out");
        // Stamp first so a rapid re-login won't loop
        stampActivity();
        supabase.auth.signOut();
        return;
      }
    }
    // Session still valid (or first-ever login) — stamp and start timer
    stampActivity();

    const throttledStamp = () => {
      const now = Date.now();
      if (now - lastStampRef.current > THROTTLE_MS) {
        lastStampRef.current = now;
        stampActivity();
        // If user interacts, dismiss warning
        setShowWarning(false);
      }
    };

    const events = ["mousemove", "keydown", "touchstart", "scroll", "click"] as const;
    events.forEach((e) => window.addEventListener(e, throttledStamp, { passive: true }));

    const interval = setInterval(() => {
      const elapsed = Date.now() - getLastActivity();

      if (elapsed > timeoutMs) {
        console.info("[inactivity] Session timed out — signing out");
        setShowWarning(false);
        supabase.auth.signOut();
      } else if (elapsed > warningAtMs) {
        const remaining = Math.max(0, Math.ceil((timeoutMs - elapsed) / 1000));
        setSecondsLeft(remaining);
        setShowWarning(true);
      } else {
        setShowWarning(false);
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      events.forEach((e) => window.removeEventListener(e, throttledStamp));
      clearInterval(interval);
    };
  }, [enabled, timeoutMinutes]);

  return { showWarning, secondsLeft, extendSession };
}
