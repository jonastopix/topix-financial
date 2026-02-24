import { useState } from "react";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface HandoutAIFeedbackProps {
  handoutId: string;
  module: string;
  feedback: any | null;
  feedbackAt: string | null;
  onFeedbackReceived: () => void;
}

const HandoutAIFeedback = ({ handoutId, module, feedback, feedbackAt, onFeedbackReceived }: HandoutAIFeedbackProps) => {
  const [loading, setLoading] = useState(false);

  const requestFeedback = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("handout-ai-feedback", {
        body: { handout_id: handoutId, module },
      });
      if (error) throw error;
      onFeedbackReceived();
      toast({ title: "AI-sparring modtaget", description: "Din feedback er klar nedenfor." });
    } catch (e: any) {
      toast({ title: "Fejl", description: e.message || "Kunne ikke hente AI-feedback", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <h3 className="font-display font-semibold text-sm text-foreground">AI Sparring</h3>
        </div>
        <Button
          size="sm"
          variant={feedback ? "outline" : "default"}
          onClick={requestFeedback}
          disabled={loading}
          className="text-xs gap-1.5"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : feedback ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {feedback ? "Opdater feedback" : "Få AI-sparring"}
        </Button>
      </div>

      {feedback && (
        <div className="space-y-3">
          {feedbackAt && (
            <p className="text-[10px] text-muted-foreground">
              Sidst opdateret: {new Date(feedbackAt).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
          <div className="prose prose-sm max-w-none text-foreground/90 text-sm leading-relaxed">
            {typeof feedback === "string" ? (
              <p className="whitespace-pre-wrap">{feedback}</p>
            ) : feedback?.text ? (
              <p className="whitespace-pre-wrap">{feedback.text}</p>
            ) : feedback?.sections ? (
              (feedback.sections as Array<{ title: string; content: string }>).map((s, i) => (
                <div key={i} className="mb-3">
                  <h4 className="font-semibold text-foreground text-xs uppercase tracking-wide mb-1">{s.title}</h4>
                  <p className="whitespace-pre-wrap">{s.content}</p>
                </div>
              ))
            ) : (
              <p className="whitespace-pre-wrap">{JSON.stringify(feedback, null, 2)}</p>
            )}
          </div>
        </div>
      )}

      {!feedback && !loading && (
        <p className="text-xs text-muted-foreground">
          Klik "Få AI-sparring" for at modtage personlig feedback og forslag baseret på dine svar.
        </p>
      )}
    </div>
  );
};

export default HandoutAIFeedback;
