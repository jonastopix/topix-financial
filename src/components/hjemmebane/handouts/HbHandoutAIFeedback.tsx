import { useState } from "react";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { requestHandoutAiFeedback } from "@/lib/handoutEngine";
import { HbCard } from "../HbCard";

/** Hb-AI-sparringsblok (spejler HandoutAIFeedback.tsx 1:1 i adfærd):
    kald via motoren (H5, inkl. industry) og ORDRET samme tre-form-
    rendering af svaret (string | {text} | {sections[]}). Toasts og
    loading-state ejes her som i kilden. Ingen portal-komponenter. */

interface HbHandoutAIFeedbackProps {
  handoutId: string;
  module: string;
  feedback: any | null;
  feedbackAt: string | null;
  onFeedbackReceived: () => void;
  companyName?: string | null;
  industry?: string | null;
}

export const HbHandoutAIFeedback = ({
  handoutId,
  module,
  feedback,
  feedbackAt,
  onFeedbackReceived,
  companyName,
  industry,
}: HbHandoutAIFeedbackProps) => {
  const [loading, setLoading] = useState(false);

  const requestFeedback = async () => {
    setLoading(true);
    try {
      // H5 i motoren — invoke-body inkl. industry, ordret
      await requestHandoutAiFeedback({ handoutId, module, companyName, industry });
      onFeedbackReceived();
      toast.success("AI-sparring modtaget", { description: "Din feedback er klar nedenfor." });
    } catch (e: any) {
      toast.error("Fejl", { description: e.message || "Kunne ikke hente AI-feedback" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <HbCard className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-hb-sage/60">
            <Sparkles className="h-4 w-4 text-hb-evergreen" />
          </div>
          <h3 className="font-editorial text-lg font-medium text-hb-ink">AI Sparring</h3>
        </div>
        <button
          type="button"
          onClick={requestFeedback}
          disabled={loading}
          className={
            feedback
              ? "inline-flex items-center gap-1.5 rounded-full border border-hb-line px-4 py-2 text-xs text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink disabled:opacity-50"
              : "inline-flex items-center gap-1.5 rounded-full bg-hb-evergreen px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-hb-evergreen/90 disabled:opacity-50"
          }
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : feedback ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {feedback ? "Opdater feedback" : "Få AI-sparring"}
        </button>
      </div>

      {feedback && (
        <div className="space-y-3">
          {feedbackAt && (
            <p className="text-[10px] text-hb-ink-soft">
              Sidst opdateret: {new Date(feedbackAt).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
          <div className="max-w-none text-sm leading-relaxed text-hb-ink">
            {typeof feedback === "string" ? (
              <p className="whitespace-pre-wrap">{feedback}</p>
            ) : feedback?.text ? (
              <p className="whitespace-pre-wrap">{feedback.text}</p>
            ) : feedback?.sections ? (
              (feedback.sections as Array<{ title: string; content: string }>).map((s, i) => (
                <div key={i} className="mb-3">
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-hb-ink">{s.title}</h4>
                  <p className="whitespace-pre-wrap">{s.content}</p>
                </div>
              ))
            ) : (
              <p className="text-xs italic text-hb-ink-soft">Feedback-format ikke genkendt.</p>
            )}
          </div>
        </div>
      )}

      {!feedback && !loading && (
        <div className="rounded-lg bg-hb-sage/20 p-4">
          <p className="text-xs leading-relaxed text-hb-ink-soft">
            Få personlig AI-sparring baseret på dine svar i dette modul. AI-chefen læser dine besvarelser og giver konkrete anbefalinger til din situation.
          </p>
        </div>
      )}
    </HbCard>
  );
};
