import { useState, useEffect } from "react";
import { X, Share, Plus } from "lucide-react";
import { useStandalone } from "@/hooks/useStandalone";
import { useIsMobile } from "@/hooks/use-mobile";

function isIOSSafari() {
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  // Chrome on iOS includes "CriOS", Firefox includes "FxiOS"
  const isNativeSafari = isIos && !/CriOS|FxiOS|OPiOS|mercury/i.test(ua);
  return { isIos, isNativeSafari };
}

function isIOS() {
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
  const [browserInfo] = useState(() => isIOSSafari());

  useEffect(() => {
    if (!isMobile) return;
    const { isIos, isNativeSafari } = isIOSSafari();
    if (!isIos) return; // Only show on iOS at all
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
            {browserInfo.isNativeSafari ? (
              <>
                <div className="flex items-center gap-3 bg-secondary/50 rounded-xl px-3 py-2.5">
                  <div className="h-7 w-7 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Share className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">Trin 1</p>
                    <p className="text-xs text-muted-foreground">Tryk på <span className="font-semibold text-foreground">Del-ikonet</span> nederst i Safari</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-secondary/50 rounded-xl px-3 py-2.5">
                  <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Plus className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">Trin 2</p>
                    <p className="text-xs text-muted-foreground">Vælg <span className="font-semibold text-foreground">"Føj til hjemskærm"</span> i menuen</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 bg-secondary/50 rounded-xl px-3 py-2.5">
                  <div className="h-7 w-7 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Share className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">Trin 1</p>
                    <p className="text-xs text-muted-foreground">Tryk på <span className="font-semibold text-foreground">de tre prikker</span> øverst til højre i Chrome</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-secondary/50 rounded-xl px-3 py-2.5">
                  <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Plus className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">Trin 2</p>
                    <p className="text-xs text-muted-foreground">Vælg <span className="font-semibold text-foreground">"Føj til hjemskærm"</span> i menuen</p>
                  </div>
                </div>
              </>
            )}
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
