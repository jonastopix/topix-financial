import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { X, ChevronRight, PartyPopper, Sparkles } from "lucide-react";
import confetti from "canvas-confetti";

interface TourStep {
  selector: string | null; // null = no spotlight (welcome/finish)
  title: string;
  description: string;
  position?: "bottom" | "right" | "top";
}

const STEPS: TourStep[] = [
  {
    selector: null,
    title: "Dit dashboard",
    description:
      "Her er dit kontrolcenter. Du ser seneste nøgletal, hvad der kræver opmærksomhed, og din performance score — alt opdateres automatisk fra dine rapporter.",
  },
  {
    selector: '[data-tour="kpi-cards"]',
    title: "Dine nøgletal",
    description:
      "Omsætning, udgifter, resultat og bank — med trend-pile der viser om du går frem eller tilbage siden sidst. Tallene opdateres automatisk når du uploader en ny rapport.",
    position: "bottom",
  },
  {
    selector: '[data-tour="upload-zone"]',
    title: "Upload din første rapport",
    description:
      "Upload en PDF eller Excel direkte fra e-conomic, Dinero, Billy eller et andet system. Vi trækker tallene ud automatisk — du verificerer inden de gemmes.",
    position: "right",
  },
  {
    selector: '[data-tour="chat-link"]',
    title: "Direkte linje til Morten og Jonas",
    description:
      "Stil spørgsmål, del en opdatering eller bed om sparring — direkte i chatten. De læser dine tal og kender din situation.",
    position: "right",
  },
  {
    selector: null,
    title: "Du er klar til at komme i gang",
    description:
      "Start med at uploade din seneste rapport. Det tager 2 minutter, og du får øjeblikkelig AI-analyse af dine tal.",
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export default function GuidedTour({ onComplete }: { onComplete: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  // Measure target element
  const measure = useCallback(() => {
    if (!current.selector) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(current.selector);
    if (el) {
      const r = el.getBoundingClientRect();
      const pad = 8;
      setTargetRect({
        top: r.top - pad + window.scrollY,
        left: r.left - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      });
    } else {
      setTargetRect(null);
    }
  }, [current.selector]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  // Fire confetti on last step
  useEffect(() => {
    if (isLast) {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6"],
      });
    }
  }, [isLast]);

  const finish = async () => {
    if (user) {
      await supabase
        .from("profiles")
        .update({ tour_completed_at: new Date().toISOString() } as any)
        .eq("user_id", user.id);
    }
    onComplete();
    navigate("/reports");
  };

  const next = () => {
    if (isLast) {
      finish();
    } else {
      setStep((s) => s + 1);
    }
  };

  const skip = () => finish();

  // Compute tooltip position
  const getTooltipStyle = (): React.CSSProperties => {
    if (!targetRect) {
      // Center on screen
      return {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };
    }
    const pos = current.position || "bottom";
    if (pos === "right") {
      return {
        position: "absolute",
        top: targetRect.top,
        left: targetRect.left + targetRect.width + 16,
      };
    }
    // bottom
    return {
      position: "absolute",
      top: targetRect.top + targetRect.height + 16,
      left: targetRect.left,
    };
  };

  // Build clip-path polygon to create spotlight hole
  const overlayStyle: React.CSSProperties = targetRect
    ? {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: document.documentElement.scrollHeight,
        background: "rgba(0,0,0,0.6)",
        clipPath: `polygon(
          0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
          ${targetRect.left}px ${targetRect.top}px,
          ${targetRect.left}px ${targetRect.top + targetRect.height}px,
          ${targetRect.left + targetRect.width}px ${targetRect.top + targetRect.height}px,
          ${targetRect.left + targetRect.width}px ${targetRect.top}px,
          ${targetRect.left}px ${targetRect.top}px
        )`,
        zIndex: 9998,
        pointerEvents: "auto",
      }
    : {
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 9998,
      };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9998 }}
      onClick={(e) => {
        // clicking overlay = do nothing (prevent interaction behind)
        e.stopPropagation();
      }}
    >
      {/* Overlay with spotlight hole */}
      <div style={overlayStyle} />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        style={{ ...getTooltipStyle(), zIndex: 9999 }}
        className="w-[320px] max-w-[90vw] rounded-xl border border-border bg-card p-5 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Step indicator */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step
                    ? "w-6 bg-primary"
                    : i < step
                    ? "w-1.5 bg-primary/40"
                    : "w-1.5 bg-muted-foreground/20"
                }`}
              />
            ))}
          </div>
          <button
            onClick={skip}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 -m-1"
            aria-label="Luk tour"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex items-start gap-3 mb-4">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            {isLast ? (
              <PartyPopper className="h-4 w-4 text-primary" />
            ) : (
              <Sparkles className="h-4 w-4 text-primary" />
            )}
          </div>
          <div>
            <h3 className="font-display font-semibold text-foreground text-sm mb-1">
              {current.title}
            </h3>
            <p className="text-muted-foreground text-xs leading-relaxed">
              {current.description}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          {!isFirst && !isLast ? (
            <button
              onClick={skip}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Spring over
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={next}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            {isLast ? "Kom i gang" : isFirst ? "Start tour" : "Næste"}
            {!isLast && <ChevronRight className="h-3 w-3" />}
          </button>
        </div>
      </div>
    </div>
  );
}
