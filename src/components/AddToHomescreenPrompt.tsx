import { useState, useEffect } from "react";
import { X, Share, Plus } from "lucide-react";
import { useStandalone } from "@/hooks/useStandalone";
import { useIsMobile } from "@/hooks/use-mobile";

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  return (navigator as any).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
}

const DISMISSED_KEY = "a2hs-dismissed-v1";

export default function AddToHomescreenPrompt() {
  const isMobile = useIsMobile();
  const isStandalone = useStandalone();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isMobile) return;
    if (!isIOS()) return;
    if (isInStandaloneMode()) return;
    if (isStandalone) return;
    try {
      if (localStorage.getItem(DISMISSED_KEY)) return;
    } catch {}
    // Delay so it doesn't pop up immediately on first load
    const timer = setTimeout(() => setVisible(true), 4000);
    return () => clearTimeout(timer);
  }, [isMobile, isStandalone]);

  const dismiss = () => {
    try { localStorage.setItem(DISMISSED_KEY, "1"); } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-4 bottom-20 z-50 animate-in slide-in-from-bottom-4 fade-in duration-500">
      <div className="rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
        <div className="relative p-5">
          <button
            onClick={dismiss}
            className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-secondary transition-colors"
            aria-label="Luk"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>

          <div className="flex items-start gap-4 pr-6">
            <div className="shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Plus className="h-6 w-6 text-primary" />
            </div>

            <div className="min-w-0">
              <h3 className="font-semibold text-foreground text-sm leading-tight mb-1">
                Tilføj til hjemskærm
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Få hurtig adgang til The Boardroom direkte fra din hjemskærm — ingen browser nødvendig.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                1
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">Trin 1</p>
                <p className="text-xs text-muted-foreground">Tryk på Del-ikonet nederst i Safari</p>
              </div>
              <div className="shrink-0 ml-auto">
                <Share className="h-4 w-4 text-primary" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                2
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">Trin 2</p>
                <p className="text-xs text-muted-foreground">Vælg "Føj til hjemskærm" i menuen</p>
              </div>
              <div className="shrink-0 ml-auto">
                <Plus className="h-4 w-4 text-primary" />
              </div>
            </div>
          </div>

          <button
            onClick={dismiss}
            className="mt-4 w-full py-2.5 rounded-xl text-xs font-medium bg-secondary hover:bg-secondary/80 transition-colors text-foreground"
          >
            Ikke nu
          </button>
        </div>

        {/* Arrow pointing down to bottom bar */}
        <div className="h-2 bg-gradient-to-t from-primary/5 to-transparent" />
      </div>
    </div>
  );
}
