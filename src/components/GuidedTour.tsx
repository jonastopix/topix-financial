import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { X, ChevronRight, ChevronLeft, PartyPopper, Sparkles } from "lucide-react";
import confetti from "canvas-confetti";

interface TourStep {
  title: string;
  description: string;
}

const STEPS: TourStep[] = [
  {
    title: "Velkommen til dit dashboard",
    description:
      "Her ser du dine seneste nøgletal, hvad der kræver opmærksomhed, og din performance — alt opdateres automatisk fra dine rapporter.",
  },
  {
    title: "Upload din rapport",
    description:
      "Gå til Rapportering i menuen og upload en PDF eller Excel fra e-conomic, Dinero eller Billy. Vi trækker tallene ud automatisk.",
  },
  {
    title: "Sæt dine mål",
    description:
      "Under Milestones og KPI'er definerer du hvad du vil opnå. Jo mere konkret du er, des bedre sparring kan vi give dig.",
  },
  {
    title: "Din direkte linje til rådgiverne",
    description:
      "Brug chatten til at stille spørgsmål, dele opdateringer eller bede om sparring. Morten og Jonas læser dine tal og kender din situation.",
  },
  {
    title: "Du er klar til at komme i gang",
    description:
      "Start med at uploade din seneste rapport. Det tager 2 minutter, og du får øjeblikkelig AI-analyse af dine tal.",
  },
];

export default function GuidedTour({ onComplete }: { onComplete: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

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

  const back = () => {
    if (!isFirst) setStep((s) => s - 1);
  };

  const skip = () => finish();

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9998 }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/60" />

      {/* Centered modal */}
      <div
        className="fixed inset-0 flex items-center justify-center p-4"
        style={{ zIndex: 9999 }}
      >
        <div
          className="w-[360px] max-w-[90vw] rounded-xl border border-border bg-card p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-300"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Step indicator */}
          <div className="flex items-center justify-between mb-4">
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
          <div className="flex items-start gap-3 mb-5">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              {isLast ? (
                <PartyPopper className="h-4.5 w-4.5 text-primary" />
              ) : (
                <Sparkles className="h-4.5 w-4.5 text-primary" />
              )}
            </div>
            <div>
              <h3 className="font-display font-semibold text-foreground text-sm mb-1.5">
                {current.title}
              </h3>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {current.description}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            {!isFirst ? (
              <button
                onClick={back}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-3 w-3" />
                Tilbage
              </button>
            ) : (
              <button
                onClick={skip}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Spring over
              </button>
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
    </div>
  );
}
