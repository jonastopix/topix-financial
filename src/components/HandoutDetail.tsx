import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, ArrowRight, Save, Check, Loader2, CheckCircle2, RotateCcw, Eye, Target, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import HandoutLeverItem from "@/components/HandoutLeverItem";
import HandoutAIFeedback from "@/components/HandoutAIFeedback";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { HandoutConfig, HandoutModule } from "@/lib/handoutConfig";
import { calcHandoutProgress } from "@/lib/handoutUtils";
import { moduleOrder } from "@/lib/handoutConfig";
import { notifyHandoutCompleted } from "@/lib/handoutNotify";

interface HandoutDetailProps {
  config: HandoutConfig;
  onBack: () => void;
  userId?: string; // for advisor viewing another member
  onModuleSelect?: (module: HandoutModule) => void;
}

interface LeverMilestone {
  milestone_id: string;
  title: string;
  progress: number;
  status: string;
}

type SaveStatus = "idle" | "saving" | "saved";

const HandoutDetail = ({ config, onBack, userId, onModuleSelect }: HandoutDetailProps) => {
  const { user, companyId, companyName } = useAuth();
  const [industry, setIndustry] = useState<string | null>(null);
  const effectiveUserId = userId || user?.id;
  const isOwner = !userId || userId === user?.id;

  const [handoutId, setHandoutId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [levers, setLevers] = useState<string[]>(Array(config.leverCount).fill(""));
  const [aiFeedback, setAiFeedback] = useState<any>(null);
  const [aiFeedbackAt, setAiFeedbackAt] = useState<string | null>(null);
  const [leverMilestones, setLeverMilestones] = useState<Record<number, LeverMilestone>>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [handoutStatus, setHandoutStatus] = useState<string>("not_started");
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load handout data
  const loadData = useCallback(async () => {
    if (!effectiveUserId) return;
    setLoading(true);
    const { data } = await supabase
      .from("handouts")
      .select("*")
      .eq("user_id", effectiveUserId)
      .eq("module", config.module)
      .maybeSingle();

    if (data) {
      setHandoutId(data.id);
      setResponses((data.responses as Record<string, string>) || {});
      setChecklist((data.checklist as Record<string, boolean>) || {});
      const loadedLevers = (data.levers as string[]) || [];
      setLevers([...loadedLevers, ...Array(Math.max(0, config.leverCount - loadedLevers.length)).fill("")]);
      setAiFeedback(data.ai_feedback);
      setAiFeedbackAt(data.ai_feedback_at);
      setHandoutStatus(data.status || "not_started");

      // Load lever milestones
      const { data: links } = await supabase
        .from("handout_lever_milestones" as any)
        .select("lever_index, milestone_id")
        .eq("handout_id", data.id);

      if (links && links.length > 0) {
        const msIds = links.map((l: any) => l.milestone_id);
        const { data: milestones } = await supabase
          .from("milestones")
          .select("id, title, progress, status")
          .in("id", msIds);

        const map: Record<number, LeverMilestone> = {};
        for (const link of links as any[]) {
          const ms = milestones?.find((m) => m.id === link.milestone_id);
          if (ms) {
            map[link.lever_index] = { milestone_id: ms.id, title: ms.title, progress: ms.progress, status: ms.status };
          }
        }
        setLeverMilestones(map);
      }
    }
    setLoading(false);
  }, [effectiveUserId, config.module, config.leverCount]);

  useEffect(() => { loadData(); }, [loadData]);

  // Fetch industry from company
  useEffect(() => {
    if (!companyId) return;
    supabase.from("companies").select("industry_label").eq("id", companyId).maybeSingle().then(({ data }) => {
      setIndustry(data?.industry_label || null);
    });
  }, [companyId]);

  // Auto-save with debounce
  const save = useCallback(async (r: Record<string, string>, c: Record<string, boolean>, l: string[]) => {
    if (!effectiveUserId || !isOwner) return;
    setSaveStatus("saving");

    const hasContent = Object.values(r).some(v => v.trim()) || Object.values(c).some(v => v) || l.some(v => v.trim());
    const status = hasContent ? "in_progress" : "not_started";

    const payload: Record<string, any> = {
      user_id: effectiveUserId,
      module: config.module,
      responses: r,
      checklist: c,
      levers: l,
      status,
    };
    payload.company_id = companyId;

    if (handoutId) {
      const { error } = await supabase.from("handouts").update(payload).eq("id", handoutId);
      if (error) { toast.error("Fejl ved gem", { description: error.message }); }
    } else {
      const { data, error } = await supabase.from("handouts").insert(payload as any).select("id").single();
      if (error) { toast.error("Fejl ved gem", { description: error.message }); }
      else { setHandoutId(data.id); }
    }

    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }, [effectiveUserId, isOwner, config.module, handoutId]);

  const debounceSave = useCallback((r: Record<string, string>, c: Record<string, boolean>, l: string[]) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(r, c, l), 1500);
  }, [save]);

  const updateResponse = (key: string, val: string) => {
    const next = { ...responses, [key]: val };
    setResponses(next);
    debounceSave(next, checklist, levers);
  };

  const updateChecklist = (key: string, val: boolean) => {
    const next = { ...checklist, [key]: val };
    setChecklist(next);
    debounceSave(responses, next, levers);
  };

  const updateLever = (idx: number, val: string) => {
    const next = [...levers];
    next[idx] = val;
    setLevers(next);
    debounceSave(responses, checklist, next);
  };

  // Calculate progress using shared helper
  const progress = calcHandoutProgress(config, responses, checklist, levers);
  const isCompleted = handoutStatus === "completed";

  const toggleCompleted = async () => {
    if (!handoutId || !isOwner) return;
    const newStatus = isCompleted ? "in_progress" : "completed";
    const update: Record<string, any> = { status: newStatus };
    // Always set a fresh completed_at so the UNIQUE(handout_id, completed_at)
    // idempotency key works correctly on uncomplete → re-complete cycles.
    if (newStatus === "completed") update.completed_at = new Date().toISOString();
    else update.completed_at = null;

    const { error } = await supabase.from("handouts").update(update).eq("id", handoutId);
    if (error) {
      toast({ title: "Fejl", description: error.message, variant: "destructive" });
    } else {
      setHandoutStatus(newStatus);
      toast({ title: newStatus === "completed" ? "Handout markeret som udfyldt ✓" : "Handout genåbnet" });

      // Server-side notification (Slack + advisor_notifications) — fire-and-forget
      if (newStatus === "completed") {
        notifyHandoutCompleted(handoutId);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Tilbage
          </Button>
          <div>
            <h2 className="text-xl font-display font-bold text-foreground">{config.title}</h2>
            <p className="text-xs text-muted-foreground">{config.subtitle} · {progress}% udfyldt</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isOwner && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-md">
              <Eye className="h-3 w-3" /> Skrivebeskyttet
            </div>
          )}
          {isOwner && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {saveStatus === "saving" && <><Loader2 className="h-3 w-3 animate-spin" /> Gemmer…</>}
              {saveStatus === "saved" && <><Check className="h-3 w-3 text-emerald-500" /> Gemt</>}
            </div>
          )}
          {isOwner && handoutId && (
            <Button
              size="sm"
              variant={isCompleted ? "outline" : "default"}
              onClick={toggleCompleted}
              className="gap-1.5 text-xs"
            >
              {isCompleted ? (
                <><RotateCcw className="h-3.5 w-3.5" /> Genåbn</>
              ) : (
                <><CheckCircle2 className="h-3.5 w-3.5" /> Markér som udfyldt</>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs for sections */}
      <Tabs defaultValue="0" className="w-full">
        <TabsList className="w-full justify-start">
          {config.sections.map((s, i) => (
            <TabsTrigger key={i} value={String(i)} className="text-xs">{s.title}</TabsTrigger>
          ))}
          {config.leverCount > 0 && (
            <TabsTrigger value="levers" className="text-xs">Løftestænger</TabsTrigger>
          )}
        </TabsList>

        {config.sections.map((section, si) => (
          <TabsContent key={si} value={String(si)} className="space-y-5 mt-4">
            {section.questions.map((q) => (
              <div key={q.key} className="space-y-2">
                <label className="text-sm font-medium text-foreground">{q.label}</label>
                {q.type === "textarea" ? (
                  <Textarea
                    value={responses[q.key] || ""}
                    onChange={(e) => updateResponse(q.key, e.target.value)}
                    placeholder="Skriv dit svar her..."
                    className="min-h-[100px] text-sm"
                    disabled={!isOwner}
                  />
                ) : q.type === "numbered_list" ? (
                  <div className="space-y-2">
                    {Array.from({ length: q.count || 2 }).map((_, ni) => {
                      const listKey = `${q.key}_${ni}`;
                      return (
                        <div key={ni} className="flex items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground w-5">{ni + 1}.</span>
                          <Input
                            value={responses[listKey] || ""}
                            onChange={(e) => updateResponse(listKey, e.target.value)}
                            placeholder={`Punkt ${ni + 1}`}
                            className="text-sm"
                            disabled={!isOwner}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ))}

            {section.checklist && (
              <div className="space-y-3 pt-2">
                <h4 className="text-sm font-semibold text-foreground">Tjekliste</h4>
                {section.checklist.map((item) => (
                  <div key={item.key} className="space-y-1.5">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id={item.key}
                        checked={checklist[item.key] || false}
                        onCheckedChange={(v) => updateChecklist(item.key, v === true)}
                        disabled={!isOwner}
                      />
                      <label htmlFor={item.key} className="text-sm text-foreground cursor-pointer leading-tight">
                        {item.label}
                      </label>
                    </div>
                    {item.hasFollowUp && checklist[item.key] && (
                      <div className="ml-7">
                        <Input
                          value={responses[`followup_${item.key}`] || ""}
                          onChange={(e) => updateResponse(`followup_${item.key}`, e.target.value)}
                          placeholder={item.hasFollowUp}
                          className="text-sm"
                          disabled={!isOwner}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        ))}

        {config.leverCount > 0 && (
          <TabsContent value="levers" className="space-y-4 mt-4">
            <div className="rounded-xl bg-primary/5 border border-primary/10 p-4 flex items-start gap-3">
              <Target className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground mb-1">
                  Gør dine løftestænger til aktive milestones
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Skriv dine vigtigste handlingspunkter nedenfor og klik <strong>→ Milestone</strong> for at tilføje dem til din milestone-liste. Så kan du — og din rådgiver — følge fremgangen løbende.
                </p>
              </div>
            </div>
            {levers.map((val, i) => (
              <HandoutLeverItem
                key={i}
                index={i}
                value={val}
                onChange={(v) => updateLever(i, v)}
                handoutId={handoutId || undefined}
                linkedMilestone={leverMilestones[i] || null}
                onMilestoneCreated={loadData}
                disabled={!isOwner}
              />
            ))}
            {/* Prompt to convert levers to milestones */}
            {isOwner && levers.some(l => l.trim()) && Object.keys(leverMilestones).length === 0 && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-chart-warning/20 bg-chart-warning/5">
                <AlertTriangle className="h-4 w-4 text-chart-warning flex-shrink-0" />
                <p className="text-xs text-muted-foreground flex-1">
                  Du har skrevet løftestænger men ikke oprettet milestones endnu. Klik <strong>→ Milestone</strong> ud for en løftestang for at begynde at tracke.
                </p>
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Completion prompt at 100% */}
      {isOwner && handoutId && progress === 100 && !isCompleted && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30 p-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
          <p className="text-sm text-foreground flex-1">
            Alt er udfyldt — vil du markere handoutet som færdigt?
          </p>
          <Button size="sm" onClick={toggleCompleted} className="gap-1.5 text-xs flex-shrink-0">
            <CheckCircle2 className="h-3.5 w-3.5" /> Markér som færdig
          </Button>
        </div>
      )}

      {/* Next module prompt after completion */}
      {isCompleted && (() => {
        const currentIdx = moduleOrder.indexOf(config.module);
        const nextModule = currentIdx >= 0 && currentIdx < moduleOrder.length - 1
          ? moduleOrder[currentIdx + 1]
          : null;
        if (!nextModule) return null;

        return (
          <button
            onClick={() => onModuleSelect?.(nextModule)}
            className="mt-4 w-full flex items-center justify-between p-4 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors text-left group"
          >
            <div>
              <p className="text-xs text-muted-foreground">Næste modul</p>
              <p className="text-sm font-medium text-foreground">
                {nextModule.charAt(0).toUpperCase() + nextModule.slice(1)}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-primary group-hover:translate-x-0.5 transition-transform" />
          </button>
        );
      })()}

      {/* AI Feedback */}
      {handoutId && (
        <div className="mt-2 pt-4 border-t border-border/50">
          <HandoutAIFeedback
            handoutId={handoutId}
            module={config.module}
            feedback={aiFeedback}
            feedbackAt={aiFeedbackAt}
            onFeedbackReceived={loadData}
            companyName={companyName}
            industry={industry}
          />
        </div>
      )}
    </div>
  );
};

export default HandoutDetail;
