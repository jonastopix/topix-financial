import { useEffect, useRef } from "react";

interface AdminHotkeyHandlers {
  /** ⌘S / Ctrl+S — gem (virker også mens man skriver i et felt). */
  onSave?: () => void;
  /** ⌘⇧P / Ctrl+Shift+P — publicér (virker også mens man skriver). */
  onPublish?: () => void;
  /** n — nyt indhold i aktuel kontekst (kun uden for tekstfelter). */
  onNew?: () => void;
  /** / — fokusér søgning (kun uden for tekstfelter). */
  onSearch?: () => void;
  /** Esc — luk editor / annullér (kun uden for tekstfelter, så felter
      selv kan bruge Esc til fx at lukke deres egen tilstand). */
  onEscape?: () => void;
}

const isTyping = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return Boolean(el?.closest?.('input, textarea, select, [contenteditable="true"]'));
};

/** Ét hook ejer genvejene med scope-styring — `n`/`/`/Esc stjæles aldrig
    mens der skrives, mens ⌘S/⌘⇧P altid virker. */
export function useAdminHotkeys(handlers: AdminHotkeyHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && !e.shiftKey && key === "s") {
        e.preventDefault();
        ref.current.onSave?.();
        return;
      }
      if (mod && e.shiftKey && key === "p") {
        e.preventDefault();
        ref.current.onPublish?.();
        return;
      }
      if (isTyping(e.target)) return;
      if (e.key === "Escape") {
        ref.current.onEscape?.();
        return;
      }
      if (mod || e.altKey) return;
      if (key === "n") {
        e.preventDefault();
        ref.current.onNew?.();
      } else if (e.key === "/") {
        e.preventDefault();
        ref.current.onSearch?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
