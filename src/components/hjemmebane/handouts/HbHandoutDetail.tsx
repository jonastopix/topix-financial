import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2, CheckCircle2, RotateCcw, Eye, Target, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { HandoutConfig, HandoutModule } from "@/lib/handoutConfig";
import { moduleOrder } from "@/lib/handoutConfig";
import { calcHandoutProgress } from "@/lib/handoutUtils";
import {
  loadHandout,
  loadLeverMilestones,
  saveHandout,
  toggleHandoutCompleted,
  type LeverMilestone,
} from "@/lib/handoutEngine";
import { HbSection } from "../HbSection";
import { HbCard } from "../HbCard";
import { hbControlClasses } from "../admin/HbField";
import { HbHandoutLeverRow } from "./HbHandoutLeverRow";
import { HbHandoutAIFeedback } from "./HbHandoutAIFeedback";

/** Hb-modul-detaljen (spejler HandoutDetail.tsx 1:1 i adfærd — alle
    skriveveje gennem handoutEngine): SEKTIONERET side, ikke Radix-Tabs —
    alle sektioner er ALTID i DOM (fladefamiliens form, jf. #forecast-
    lærdommen). Autosave m. 1500 ms debounce, isOwner-gaten (advisor ser,
    skriver aldrig), løftestang→milestone, markér-udfyldt→notifikation
    (H6 affyres i motoren) og AI-sparring. handoutConfig røres ikke —
    question.key/checklist.key ER jsonb-nøglerne i medlemmernes data. */

type SaveStatus = "idle" | "saving" | "saved";

interface HbHandoutDetailProps {
  config: HandoutConfig;
  onBack: () => void;
  userId?: string; // for advisor viewing another member
  onModuleSelect?: (module: HandoutModule) => void;
}

export const HbHandoutDetail = ({ config, onBack, userId, onModuleSelect }: HbHandoutDetailProps) => {
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

  // Load handout data (H1a + H1b i motoren)
  const loadData = useCallback(async () => {
    if (!effectiveUserId) return;
    setLoading(true);
    try {
      const data = await loadHandout(effectiveUserId, config.module);

      if (data) {
        setHandoutId(data.id);
        setResponses((data.responses as Record<string, string>) || {});
        setChecklist((data.checklist as Record<string, boolean>) || {});
        const loadedLevers = (data.levers as string[]) || [];
        setLevers([...loadedLevers, ...Array(Math.max(0, config.leverCount - loadedLevers.length)).fill("")]);
        setAiFeedback(data.ai_feedback);
        setAiFeedbackAt(data.ai_feedback_at);
        setHandoutStatus(data.status || "not_started");

        const map = await loadLeverMilestones(data.id);
        if (Object.keys(map).length > 0) {
          setLeverMilestones(map);
        }
      }
    } catch (e) {
      console.error("[HbHandoutDetail] loadData failed:", e);
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId, config.module, config.leverCount]);

  useEffect(() => { loadData(); }, [loadData]);

  // Fetch industry from company (læsning — bruges i AI-sparringens body)
  useEffect(() => {
    if (!companyId) return;
    supabase.from("companies").select("industry_label").eq("id", companyId).maybeSingle().then(({ data }) => {
      setIndustry(data?.industry_label || null);
    });
  }, [companyId]);

  // Auto-save with debounce (skrivevejen H2 bor i handoutEngine)
  const save = useCallback(async (r: Record<string, string>, c: Record<string, boolean>, l: string[]) => {
    if (!effectiveUserId || !isOwner) return;
    setSaveStatus("saving");

    const result = await saveHandout({
      effectiveUserId,
      isOwner,
      module: config.module,
      companyId,
      handoutId,
      responses: r,
      checklist: c,
      levers: l,
    });
    if (!result.skipped) {
      if (result.error) { toast.error("Fejl ved gem", { description: result.error.message }); }
      else if (!handoutId && result.handoutId) { setHandoutId(result.handoutId); }
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

  const progress = calcHandoutProgress(config, responses, checklist, levers);
  const isCompleted = handoutStatus === "completed";

  const toggleCompleted = async () => {
    if (!handoutId || !isOwner) return;
    // H3 i motoren — inkl. completed_at-friskningen og H6-notifikationen
    const result = await toggleHandoutCompleted({ handoutId, isOwner, isCompleted });
    if (result.skipped) return;
    if (result.error) {
      toast.error("Fejl", { description: result.error.message });
    } else {
      setHandoutStatus(result.newStatus);
      toast.success(result.newStatus === "completed" ? "Handout markeret som udfyldt ✓" : "Handout genåbnet");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-hb-evergreen" />
      </div>
    );
  }

  const completeButtonClasses = isCompleted
    ? "inline-flex items-center gap-1.5 rounded-full border border-hb-line px-4 py-2 text-xs text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink"
    : "inline-flex items-center gap-1.5 rounded-full bg-hb-evergreen px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-hb-evergreen/90";

  return (
    <div className="space-y-10">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
          >
            <ArrowLeft className="h-4 w-4" /> Tilbage
          </button>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Handout</p>
          <h1 className="mt-2 font-editorial text-3xl font-medium leading-tight text-hb-ink md:text-4xl">{config.title}</h1>
          <p className="mt-2 text-sm text-hb-ink-soft">{config.subtitle} · {progress}% udfyldt</p>
        </div>
        <div className="flex items-center gap-3 pt-1">
          {!isOwner && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-hb-sage/40 px-3 py-1.5 text-xs text-hb-ink-soft">
              <Eye className="h-3 w-3" /> Skrivebeskyttet
            </span>
          )}
          {isOwner && (
            <span className="flex items-center gap-1.5 text-xs text-hb-ink-soft">
              {saveStatus === "saving" && <><Loader2 className="h-3 w-3 animate-spin" /> Gemmer…</>}
              {saveStatus === "saved" && <><Check className="h-3 w-3 text-hb-evergreen" /> Gemt</>}
            </span>
          )}
          {isOwner && handoutId && (
            <button type="button" onClick={toggleCompleted} className={completeButtonClasses}>
              {isCompleted ? (
                <><RotateCcw className="h-3.5 w-3.5" /> Genåbn</>
              ) : (
                <><CheckCircle2 className="h-3.5 w-3.5" /> Markér som udfyldt</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Sektioner (alle i DOM — ingen faner) ── */}
      {config.sections.map((section, si) => (
        <HbSection key={si} eyebrow={`Del ${si + 1} af ${config.sections.length}`} title={section.title}>
          <HbCard className="space-y-5 p-6">
            {section.questions.map((q) => (
              <div key={q.key} className="space-y-2">
                <label className="text-sm font-medium text-hb-ink">{q.label}</label>
                {q.type === "textarea" ? (
                  <textarea
                    value={responses[q.key] || ""}
                    onChange={(e) => updateResponse(q.key, e.target.value)}
                    placeholder="Skriv dit svar her..."
                    rows={4}
                    className={`${hbControlClasses} min-h-[100px] resize-y text-sm`}
                    disabled={!isOwner}
                  />
                ) : q.type === "numbered_list" ? (
                  <div className="space-y-2">
                    {Array.from({ length: q.count || 2 }).map((_, ni) => {
                      const listKey = `${q.key}_${ni}`;
                      return (
                        <div key={ni} className="flex items-center gap-2.5">
                          <span className="w-5 text-xs font-semibold text-hb-ink-soft">{ni + 1}.</span>
                          <input
                            value={responses[listKey] || ""}
                            onChange={(e) => updateResponse(listKey, e.target.value)}
                            placeholder={`Punkt ${ni + 1}`}
                            className={`${hbControlClasses} text-sm`}
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
              <div className="space-y-3 border-t border-hb-line pt-5">
                <h4 className="text-sm font-semibold text-hb-ink">Tjekliste</h4>
                {section.checklist.map((item) => (
                  <div key={item.key} className="space-y-1.5">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id={item.key}
                        checked={checklist[item.key] || false}
                        onChange={(e) => updateChecklist(item.key, e.target.checked)}
                        disabled={!isOwner}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-hb-evergreen"
                      />
                      <label htmlFor={item.key} className="cursor-pointer text-sm leading-tight text-hb-ink">
                        {item.label}
                      </label>
                    </div>
                    {item.hasFollowUp && checklist[item.key] && (
                      <div className="ml-7">
                        <input
                          value={responses[`followup_${item.key}`] || ""}
                          onChange={(e) => updateResponse(`followup_${item.key}`, e.target.value)}
                          placeholder={item.hasFollowUp}
                          className={`${hbControlClasses} text-sm`}
                          disabled={!isOwner}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </HbCard>
        </HbSection>
      ))}

      {/* ── Løftestænger ── */}
      {config.leverCount > 0 && (
        <HbSection eyebrow="Handling" title="Løftestænger">
          <HbCard className="space-y-4 p-6">
            <div className="flex items-start gap-3 rounded-lg bg-hb-sage/20 p-4">
              <Target className="h-4 w-4 shrink-0 text-hb-evergreen mt-0.5" />
              <div>
                <p className="mb-1 text-sm font-medium text-hb-ink">
                  Gør dine løftestænger til aktive milestones
                </p>
                <p className="text-xs leading-relaxed text-hb-ink-soft">
                  Skriv dine vigtigste handlingspunkter nedenfor og klik <strong>→ Milestone</strong> for at tilføje dem til din milestone-liste. Så kan du — og din rådgiver — følge fremgangen løbende.
                </p>
              </div>
            </div>
            {levers.map((val, i) => (
              <HbHandoutLeverRow
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
              <div className="flex items-center gap-3 rounded-lg border border-hb-rust/30 bg-hb-rust/5 p-3">
                <AlertTriangle className="h-4 w-4 shrink-0 text-hb-rust" />
                <p className="flex-1 text-xs text-hb-ink-soft">
                  Du har skrevet løftestænger men ikke oprettet milestones endnu. Klik <strong>→ Milestone</strong> ud for en løftestang for at begynde at tracke.
                </p>
              </div>
            )}
          </HbCard>
        </HbSection>
      )}

      {/* Completion prompt at 100% */}
      {isOwner && handoutId && progress === 100 && !isCompleted && (
        <div className="flex flex-wrap items-center gap-3 rounded-hb border border-hb-evergreen/30 bg-hb-sage/30 p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-hb-evergreen" />
          <p className="flex-1 text-sm text-hb-ink">
            Alt er udfyldt — vil du markere handoutet som færdigt?
          </p>
          <button
            type="button"
            onClick={toggleCompleted}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-hb-evergreen px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-hb-evergreen/90"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Markér som færdig
          </button>
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
            type="button"
            onClick={() => onModuleSelect?.(nextModule)}
            className="group flex w-full items-center justify-between rounded-hb border border-hb-line bg-hb-surface p-5 text-left transition-colors hover:bg-hb-sage/20"
          >
            <div>
              <p className="text-xs text-hb-ink-soft">Næste modul</p>
              <p className="mt-0.5 text-sm font-medium text-hb-ink">
                {nextModule.charAt(0).toUpperCase() + nextModule.slice(1)}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-hb-evergreen transition-transform group-hover:translate-x-0.5" />
          </button>
        );
      })()}

      {/* AI Feedback (kortet bærer sin egen overskrift, som i kilden) */}
      {handoutId && (
        <div className="border-t border-hb-line pt-8">
          <HbHandoutAIFeedback
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
