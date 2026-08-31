import React, { useState, useRef, useCallback } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "🙏"];
const LONG_PRESS_MS = 500;

interface Props {
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReaction?: (emoji: string) => void;
  /** variant="hb" (C4): Hjemmebane-udtrykket. Drawer- og alert-
      indholdet er PORTALER uden for .theme-hjemmebane-wrapperen —
      klassen sættes derfor på Content-elementerne selv. Slet er rust.
      Uden variant er alt tegn-for-tegn som før. */
  variant?: "hb";
  children: React.ReactNode;
}

/**
 * Wraps a message bubble on mobile. Long-press opens a bottom-sheet
 * with edit/delete/reaction actions. Shows a visual scale pulse on hold.
 */
const MobileMessageActionDrawer: React.FC<Props> = ({
  canEdit, canDelete, onEdit, onDelete, onReaction, variant, children,
}) => {
  const hb = variant === "hb";
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pressing, setPressing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moved = useRef(false);

  const hasActions = canEdit || canDelete || !!onReaction;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleTouchStart = useCallback(() => {
    if (!hasActions) return;
    moved.current = false;
    setPressing(true);
    timerRef.current = setTimeout(() => {
      setPressing(false);
      if (navigator.vibrate) navigator.vibrate(20);
      setOpen(true);
    }, LONG_PRESS_MS);
  }, [hasActions]);

  const handleTouchMove = useCallback(() => {
    moved.current = true;
    setPressing(false);
    clearTimer();
  }, [clearTimer]);

  const handleTouchEnd = useCallback(() => {
    setPressing(false);
    clearTimer();
  }, [clearTimer]);

  const handleEdit = () => {
    setOpen(false);
    // Small delay so drawer closes before inline-edit opens
    setTimeout(onEdit, 150);
  };

  const handleDeleteRequest = () => {
    setOpen(false);
    setTimeout(() => setConfirmDelete(true), 150);
  };

  const handleReaction = (emoji: string) => {
    setOpen(false);
    onReaction?.(emoji);
  };

  return (
    <>
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={(e) => { if (hasActions) e.preventDefault(); }}
        className={`transition-transform duration-200 ${pressing ? "scale-[0.97] opacity-80" : ""}`}
        style={{ WebkitUserSelect: "none", userSelect: "none" }}
      >
        {children}
      </div>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className={`pb-safe-bottom${hb ? " theme-hjemmebane border-hb-line bg-hb-surface" : ""}`}>
          <DrawerHeader className="pb-2">
            <DrawerTitle className={`text-sm${hb ? " text-hb-ink" : ""}`}>Besked-handlinger</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4 space-y-3">
            {/* Quick reactions */}
            {onReaction && (
              <div className="flex justify-center gap-3 py-2">
                {QUICK_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReaction(emoji)}
                    className="text-2xl active:scale-125 transition-transform"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            {/* Actions */}
            <div className="space-y-1">
              {canEdit && (
                <button
                  onClick={handleEdit}
                  className={
                    hb
                      ? "flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-hb-ink hover:bg-hb-sage/20 active:bg-hb-sage/20 transition-colors"
                      : "flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-foreground hover:bg-secondary active:bg-secondary transition-colors"
                  }
                >
                  <Pencil className={`h-4 w-4 ${hb ? "text-hb-ink-soft" : "text-muted-foreground"}`} />
                  Redigér besked
                </button>
              )}
              {canDelete && (
                <button
                  onClick={handleDeleteRequest}
                  className={
                    hb
                      ? "flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-hb-rust hover:bg-hb-rust/10 active:bg-hb-rust/10 transition-colors"
                      : "flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 active:bg-destructive/10 transition-colors"
                  }
                >
                  <Trash2 className="h-4 w-4" />
                  Slet besked
                </button>
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className={hb ? "theme-hjemmebane border-hb-line bg-hb-surface" : undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle className={hb ? "text-hb-ink" : undefined}>Slet besked?</AlertDialogTitle>
            <AlertDialogDescription className={hb ? "text-hb-ink-soft" : undefined}>
              Beskeden fjernes permanent for alle i samtalen. Denne handling kan ikke fortrydes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={hb ? "rounded-full border-hb-ink/25 text-hb-ink hover:bg-hb-sage/50 hover:text-hb-ink" : undefined}>
              Annuller
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className={
                hb
                  ? "rounded-full bg-hb-rust text-white hover:bg-hb-rust/90"
                  : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              }
            >
              Slet
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default MobileMessageActionDrawer;
