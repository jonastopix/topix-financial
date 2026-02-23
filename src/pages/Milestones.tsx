import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import MilestonesList from "@/components/MilestonesList";
import { Target, Plus, Sparkles, Check, X, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface SuggestedMilestone {
  id: string;
  title: string;
  suggestedDeadline: string;
  sourceReport: string;
  aiReason: string;
}

const initialSuggestions: SuggestedMilestone[] = [
  {
    id: "s1",
    title: "Opdater budget med ny lønprognose (+15%)",
    suggestedDeadline: "1. mar 2026",
    sourceReport: "Januar 2026",
    aiReason: "Lønningerne er ikke reflekteret i budgettet – runway-estimat kan være misvisende.",
  },
  {
    id: "s2",
    title: "Reducer administrative omkostninger med 10%",
    suggestedDeadline: "1. apr 2026",
    sourceReport: "December 2025",
    aiReason: "Admin-omkostninger er steget 18% uden klar årsag. Kræver en handlingsplan.",
  },
  {
    id: "s3",
    title: "Opnå churn rate under 2,5%",
    suggestedDeadline: "1. jun 2026",
    sourceReport: "Januar 2026",
    aiReason: "Churn-trenden er positiv (3,0% → 2,8%). Et konkret mål kan fastholde momentum.",
  },
];

const Milestones = () => {
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [acceptedFromAi, setAcceptedFromAi] = useState<{ title: string; deadline: string }[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("conversations").select("id").eq("member_id", user.id).single()
      .then(({ data }) => setConversationId(data?.id || null));
  }, [user]);

  const handleAccept = (s: SuggestedMilestone) => {
    setAcceptedFromAi((prev) => [...prev, { title: s.title, deadline: s.suggestedDeadline }]);
    setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
    toast.success("Milestone accepteret og tilføjet");
  };

  const handleReject = (id: string) => {
    setSuggestions((prev) => prev.filter((x) => x.id !== id));
    toast("Milestone afvist", { description: "Du kan altid genaktivere den senere." });
  };

  const startEdit = (s: SuggestedMilestone) => {
    setEditingId(s.id);
    setEditTitle(s.title);
    setEditDeadline(s.suggestedDeadline);
  };

  const saveEdit = (id: string) => {
    setAcceptedFromAi((prev) => [...prev, { title: editTitle, deadline: editDeadline }]);
    setSuggestions((prev) => prev.filter((x) => x.id !== id));
    setEditingId(null);
    toast.success("Milestone redigeret og tilføjet");
  };

  // Progress calculation – base milestones progress avg
  const baseProgressValues = [100, 62, 35, 10, 0]; // matches MilestonesList defaults
  const aiProgressValues = acceptedFromAi.map(() => 0);
  const allProgress = [...baseProgressValues, ...aiProgressValues];
  const pct = allProgress.length > 0
    ? Math.round(allProgress.reduce((a, b) => a + b, 0) / allProgress.length)
    : 0;
  const doneMilestones = baseProgressValues.filter(p => p >= 100).length;
  const totalMilestones = allProgress.length;

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
            Milestones
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sæt og følg dine vigtigste mål
          </p>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" />
          Ny milestone
        </button>
      </div>

      {/* Progress overview */}
      <div className="glass-card rounded-xl p-6 mb-6 animate-fade-in">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 rounded-xl bg-primary/10">
            <Target className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-foreground">Samlet fremgang</h3>
            <p className="text-sm text-muted-foreground">{doneMilestones} af {totalMilestones} milestones nået</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-2xl font-display font-bold text-primary">{pct}%</p>
          </div>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* ── AI-suggested milestones ── */}
      {suggestions.length > 0 && (
        <div className="glass-card rounded-xl p-5 mb-6 animate-fade-in border-primary/20 border">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-foreground">AI-foreslåede milestones</h3>
              <p className="text-xs text-muted-foreground">Baseret på dine seneste rapporter og AI-analyser</p>
            </div>
          </div>

          <div className="space-y-3">
            {suggestions.map((s) => (
              <div key={s.id} className="p-4 rounded-xl bg-secondary/50 border border-border/50">
                {editingId === s.id ? (
                  /* Edit mode */
                  <div className="space-y-3">
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <input
                      value={editDeadline}
                      onChange={(e) => setEditDeadline(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="Deadline, f.eks. 1. apr 2026"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(s.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                      >
                        <Check className="h-3 w-3" /> Gem og tilføj
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
                      >
                        Annuller
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Display mode */
                  <>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{s.title}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground">Deadline: {s.suggestedDeadline}</span>
                          <span className="text-[10px] text-muted-foreground">·</span>
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Sparkles className="h-2.5 w-2.5" /> Fra rapport: {s.sourceReport}
                          </span>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{s.aiReason}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAccept(s)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                      >
                        <Check className="h-3 w-3" /> Acceptér
                      </button>
                      <button
                        onClick={() => startEdit(s)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
                      >
                        <Pencil className="h-3 w-3" /> Rediger
                      </button>
                      <button
                        onClick={() => handleReject(s.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors"
                      >
                        <X className="h-3 w-3" /> Afvis
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <MilestonesList acceptedFromAi={acceptedFromAi} conversationId={conversationId} userId={user?.id || null} />
    </AppLayout>
  );
};

export default Milestones;
