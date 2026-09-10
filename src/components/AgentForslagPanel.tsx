import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sparkles,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Pencil,
} from "lucide-react";
import { HbButton, hbButtonVariants } from "@/components/hjemmebane/HbButton";
import { cn } from "@/lib/utils";
import { afgoerForslagsgyldighed } from "@/lib/forslagUdloeb";
import { HbInput, HbTextarea } from "@/components/hjemmebane/admin/HbField";
import { toast } from "sonner";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import {
  FORKAST_KATEGORI_LABELS,
  FORKAST_KATEGORIER_FLADE,
  UNDERSTOETTEDE_SKRIVEVEJE_FLADE,
} from "@/lib/forslagFlade";

// ── Agent-log: læsbar gengivelse af agentens forslag ──
// Nøglerne er run-company-agents skrivetools (SKRIVE_TOOLS i
// _shared/agentToerkoersel.ts); et ukendt tool falder tilbage til rå JSON,
// så nye tools aldrig vises som ingenting.
const AGENT_TOOL_LABELS: Record<string, string> = {
  write_chat_message: "Chat-besked til founder",
  write_session_prep: "Session-forberedelse",
  update_weekly_focus: "Ugens fokus",
  write_company_action: "Opgaveforslag",
  create_milestone: "Milepæl",
  update_milestone_progress: "Milepæls-fremdrift",
  notify_advisor: "Notifikation til rådgiver",
};

const AGENT_TRIGGER_LABELS: Record<string, string> = {
  company_review: "Virksomhedsgennemgang",
  report_committed: "Rapport committet",
  anomaly_detected: "Anomali",
  pulse_submitted: "Refleksion",
  weekly_cron: "Ugentlig gennemgang",
  onboarding: "Onboarding",
};

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  approved: { label: "Godkendt", className: "bg-hb-sage text-hb-evergreen" },
  rejected: { label: "Forkastet", className: "border border-hb-line bg-hb-paper text-hb-rust" },
  expired: { label: "Udløbet", className: "border border-hb-line bg-hb-paper text-hb-ink-soft" },
};

function agentProposalText(tool: string, args: Record<string, unknown> | null | undefined): string {
  const a = (args ?? {}) as Record<string, any>;
  switch (tool) {
    case "write_chat_message":
      return String(a.content ?? "");
    case "write_session_prep":
      return Array.isArray(a.points)
        ? a.points.map((p: unknown, i: number) => `${i + 1}. ${String(p)}`).join("\n")
        : "";
    case "update_weekly_focus":
      return [a.headline, a.summary].filter(Boolean).join(" — ");
    case "write_company_action":
      return [a.title, a.context].filter(Boolean).join(" — ") + (a.priority ? ` (${a.priority})` : "");
    case "create_milestone":
      return [a.title, a.description].filter(Boolean).join(" — ");
    case "update_milestone_progress":
      return `Fremdrift → ${a.progress}%${a.reason ? ` (${a.reason})` : ""}`;
    case "notify_advisor":
      return String(a.message ?? "");
    default:
      return JSON.stringify(a);
  }
}

interface ProposalRow {
  id: string;
  position: number;
  tool: string;
  args: Record<string, unknown> | null;
  status: string;
  proposed_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  decision_category: string | null;
  edited_args: Record<string, unknown> | null;
}

interface AgentForslagPanelProps {
  companyId: string | null;
}

export default function AgentForslagPanel({ companyId }: AgentForslagPanelProps) {
  const [agentRunning, setAgentRunning] = useState<string | null>(null);
  const [showAgentLog, setShowAgentLog] = useState(false);
  // Inline fold-ud pr. forslag (ingen portal/dialog): højst ét åbent ad gangen.
  const [aaben, setAaben] = useState<{ proposalId: string; tilstand: "forkast" | "rediger" } | null>(null);
  const [valgtKategori, setValgtKategori] = useState<string | null>(null);
  const [fritekst, setFritekst] = useState("");
  const [redigering, setRedigering] = useState<Record<string, string>>({});

  // Agent-log læser agent_runs (kørselstabellen) — IKKE det gamle
  // messages-spor (context_type='agent'), som ingen nuværende trigger
  // skriver til (POOL_BLOCKLIST blokerer chat for alle rutine-triggers).
  // Forslagene kommer fra agent_proposals joinet på kørslen — rækkerne
  // bærer afgørelses-kolonnerne, og proposal.id er nøglen (jsonb-arrayets
  // index-nøgle havde ingen stabil identitet, design §7.1).
  // RLS: advisor-SELECT på agent_runs + agent_proposals bærer adgangen.
  const { data: logData, refetch: refetchAgentRuns } = useQuery({
    queryKey: ["agent-runs", companyId],
    queryFn: async () => {
      if (!companyId) return { runs: [] as any[], beslutterNavne: {} as Record<string, string> };
      const { data } = await supabase
        .from("agent_runs")
        .select(
          "id, started_at, trigger, mode, iterations, stop_reason, produced_output, period_key, period_label, error, " +
          "agent_proposals(id, position, tool, args, status, proposed_at, decided_by, decided_at, decision_reason, decision_category, edited_args)",
        )
        .eq("company_id", companyId)
        .order("started_at", { ascending: false })
        .limit(10);
      const runs = (data as any[]) || [];
      // decided_by → navn: ingen FK til profiles, så navne slås op separat
      // (samme mønster som AdvisorAlertsPanel).
      const beslutterIds = [
        ...new Set(
          runs.flatMap((r) => (r.agent_proposals || []).map((p: any) => p.decided_by).filter(Boolean)),
        ),
      ] as string[];
      const beslutterNavne: Record<string, string> = {};
      if (beslutterIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", beslutterIds);
        for (const p of profiles || []) beslutterNavne[p.user_id] = p.full_name;
      }
      return { runs, beslutterNavne };
    },
    enabled: !!companyId,
  });
  const agentRuns = logData?.runs ?? [];
  const beslutterNavne = logData?.beslutterNavne ?? {};

  // Alle tre afgørelser går gennem agent-forslag-afgoer — fladen skriver
  // ALDRIG direkte i agent_proposals (RLS er læse-only for klienter,
  // design §7.4: tilstandsovergange dømmes ét sted, server-side).
  const afgoerMutation = useMutation({
    mutationFn: async (input: {
      proposalId: string;
      decision: "approve" | "approve_edited" | "reject";
      reason?: string;
      editedArgs?: Record<string, unknown>;
      decisionCategory?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("agent-forslag-afgoer", {
        body: {
          proposal_id: input.proposalId,
          decision: input.decision,
          ...(input.reason !== undefined ? { reason: input.reason } : {}),
          ...(input.editedArgs !== undefined ? { edited_args: input.editedArgs } : {}),
          ...(input.decisionCategory !== undefined ? { decision_category: input.decisionCategory } : {}),
        },
      });
      if (error) {
        // FunctionsHttpError bærer serverens JSON-body (fx 409-konflikt,
        // 422 unsupported_tool) i context-Response — vis den ærlige grund.
        let besked = error.message;
        try {
          const body = await (error as any).context?.json?.();
          if (body?.error) besked = body.error;
        } catch { /* behold error.message */ }
        throw new Error(besked);
      }
      return data;
    },
    onSuccess: (_data, vars) => {
      toast.success(
        vars.decision === "reject" ? "Forslaget er forkastet" : "Forslaget er godkendt og udført",
      );
      setAaben(null);
      setValgtKategori(null);
      setFritekst("");
      void refetchAgentRuns();
    },
    onError: (error: any) => {
      console.error("afgoerMutation error:", error);
      toast.error("Afgørelsen fejlede", { description: error?.message || String(error) });
      // Afgørelsen kan være taget af en anden imens — hent den faktiske tilstand.
      void refetchAgentRuns();
    },
  });

  const aabnForkast = (p: ProposalRow) => {
    setAaben((cur) =>
      cur?.proposalId === p.id && cur.tilstand === "forkast" ? null : { proposalId: p.id, tilstand: "forkast" },
    );
    setValgtKategori(null);
    setFritekst("");
  };

  const aabnRediger = (p: ProposalRow) => {
    const a = (p.args ?? {}) as Record<string, any>;
    setAaben((cur) =>
      cur?.proposalId === p.id && cur.tilstand === "rediger" ? null : { proposalId: p.id, tilstand: "rediger" },
    );
    setRedigering(
      p.tool === "update_weekly_focus"
        ? { headline: String(a.headline ?? ""), summary: String(a.summary ?? "") }
        : { points: Array.isArray(a.points) ? a.points.map(String).join("\n") : "" },
    );
  };

  const godkendRedigeret = (p: ProposalRow) => {
    const editedArgs =
      p.tool === "update_weekly_focus"
        ? { headline: (redigering.headline ?? "").trim(), summary: (redigering.summary ?? "").trim() }
        : {
            points: (redigering.points ?? "")
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 3),
          };
    afgoerMutation.mutate({ proposalId: p.id, decision: "approve_edited", editedArgs });
  };

  const redigeretErTom =
    aaben?.tilstand === "rediger" &&
    !(redigering.headline ?? "").trim() &&
    !(redigering.points ?? "").split("\n").some((s) => s.trim());

  const forkast = (p: ProposalRow) => {
    if (!valgtKategori) return;
    // Ingen fritekst → kategoriens danske label som reason (design §4.4:
    // feltet er aldrig tomt, men kategorien er dommen). Slug'en sendes
    // ALTID som decision_category — aldrig visningstekst.
    afgoerMutation.mutate({
      proposalId: p.id,
      decision: "reject",
      reason: fritekst.trim() || FORKAST_KATEGORI_LABELS[valgtKategori],
      decisionCategory: valgtKategori,
    });
  };

  // ÉT «nu» for hele renderen (samme greb som PushView:329 og
  // RedaktioneltView:249): udløbsdommen skal svare det samme for alle
  // forslag i samme tegning — ikke new Date() pr. række.
  const now = new Date();

  return (
    /* Virksomhedsniveau: knappen bor HER (ikke på rapportrækken —
       beslutningen 2026-08-25: agenten er et blik på virksomheden,
       ikke på et dokument). company_review finder selv nyeste
       periode; tør-kørslens forslag lander i agent_runs nedenfor. */
    /* HJEMMEBANE (10/9, #142/#143): panelet tegner nu i husets tokens — papir,
       hairlines, sage/evergreen, rust kun til forkastelse. Den .dark-wrapper
       der stod her fra 7/9 («text-hb-ink», markeret til fjernelse) er
       væk. Logikken er urørt: de tre afgørelser gennem agent-forslag-afgoer og
       tørkørslen gennem run-company-agent står som før. */
    <div className="mt-6 mb-6 text-hb-ink">
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setShowAgentLog(v => !v)}
          className="flex items-center gap-2 text-sm font-medium text-hb-ink"
        >
          <Sparkles className="h-4 w-4 text-hb-evergreen" />
          Agent-log
          <span className="text-xs font-normal text-hb-ink-soft ml-1">({agentRuns.length})</span>
          {showAgentLog ? <ChevronDown className="h-4 w-4 text-hb-ink-soft" /> : <ChevronRight className="h-4 w-4 text-hb-ink-soft" />}
        </button>
        <button
          onClick={async () => {
            setAgentRunning("company");
            try {
              const { data: agentData, error: agentError } = await supabase.functions.invoke("run-company-agent", {
                body: {
                  company_id: companyId,
                  trigger: "company_review",
                  dry_run: true,
                },
              });
              if (agentError) throw agentError;
              if (!agentData?.ok) {
                throw new Error(agentData?.error || "Agenten producerede intet output");
              }
              if (agentData?.dry_run !== true) {
                // Gammel funktions-version uden dry_run: kørslen var LIVE.
                throw new Error("Kørslen var IKKE tør — funktionen i prod kender ikke dry_run endnu. Skrivninger kan være udført; verificér deploy.");
              }
              toast.success("Tør-kørsel gennemført ✓", {
                description: `${agentData?.proposals ?? 0} forslag registreret — se dem i Agent-loggen herunder.`,
              });
              setShowAgentLog(true);
              void refetchAgentRuns();
            } catch (err) {
              console.error("Agent error:", err);
              toast.error("Agent fejlede", { description: err instanceof Error ? err.message : String(err) });
            } finally {
              setAgentRunning(null);
            }
          }}
          disabled={agentRunning === "company"}
          className={cn(hbButtonVariants({ variant: "secondary" }), "h-8 gap-1.5 px-3 text-xs")}
        >
          <Sparkles className="h-3 w-3" />
          {agentRunning === "company" ? "Kører..." : "Kør agent (tørt)"}
        </button>
      </div>
      {showAgentLog && (
        <div className="space-y-2">
          {agentRuns.length === 0 ? (
            <p className="text-xs text-hb-ink-soft">Agenten har ikke kørt endnu for denne virksomhed.</p>
          ) : agentRuns.map((run: any) => {
            const runProposals = ([...(run.agent_proposals || [])] as ProposalRow[])
              .sort((a, b) => a.position - b.position);
            return (
              <div key={run.id} className="rounded-hb border border-hb-line bg-hb-paper p-3">
                <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium text-hb-evergreen uppercase tracking-wider">
                      {AGENT_TRIGGER_LABELS[run.trigger] ?? run.trigger}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${run.mode === "dry_run" ? "border border-hb-line bg-hb-surface text-hb-ink-soft" : "bg-hb-sage text-hb-evergreen"}`}>
                      {run.mode === "dry_run" ? "Tør" : "Live"}
                    </span>
                    <span className="text-[10px] text-hb-ink-soft">
                      {run.period_label || run.period_key} · {runProposals.length} forslag
                    </span>
                  </div>
                  <span className="text-[10px] text-hb-ink-soft">
                    {format(new Date(run.started_at), "d. MMM yyyy HH:mm", { locale: da })}
                  </span>
                </div>
                {runProposals.length === 0 ? (
                  <p className="text-xs text-hb-ink-soft">
                    {run.error ? `Fejl: ${run.error}` : "Ingen forslag i denne kørsel."}
                  </p>
                ) : (
                  <div className="space-y-1.5 mt-1.5">
                    {runProposals.map((p) => {
                      // Udløbsdommen (besluttet 7/9, @/lib/forslagUdloeb): SAMME dom
                      // som agent-forslag-afgoer — et forslag fra en passeret ISO-uge
                      // kan ikke godkendes (det ville lande i en anden uges fokus),
                      // men kan stadig forkastes. Rækken står som 'proposed' i
                      // databasen; dommen er fladens, ikke statusens.
                      const gyldighed = p.status === "proposed" ? afgoerForslagsgyldighed(p.proposed_at, now) : null;
                      const udloebet = gyldighed !== null && !gyldighed.gyldigt;
                      const kanGodkendes = p.status === "proposed" && !udloebet && UNDERSTOETTEDE_SKRIVEVEJE_FLADE.has(p.tool);
                      // «Udløbet»-badget kommer her fra DOMMEN, ikke fra status i
                      // databasen (rækken er stadig 'proposed' — ingen cron skriver
                      // 'expired' endnu). Samme form som de afgjorte statussers badge.
                      const badge = udloebet ? STATUS_BADGES.expired : STATUS_BADGES[p.status];
                      const foldUd = aaben?.proposalId === p.id ? aaben.tilstand : null;
                      return (
                        <div key={p.id} className="rounded-hb border border-hb-line bg-hb-surface px-2.5 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-medium text-hb-ink-soft uppercase tracking-wider">
                              {AGENT_TOOL_LABELS[p.tool] ?? p.tool}
                            </span>
                            {badge && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${badge.className}`}>
                                {badge.label}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-hb-ink whitespace-pre-line">
                            {agentProposalText(p.tool, p.args)}
                          </p>

                          {p.status === "proposed" && (
                            <>
                              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                                {kanGodkendes && (
                                  <>
                                    <HbButton
                                      type="button"
                                      className="h-7 gap-1 px-3 text-[11px]"
                                      onClick={() => afgoerMutation.mutate({ proposalId: p.id, decision: "approve" })}
                                      disabled={afgoerMutation.isPending}
                                    >
                                      <CheckCircle2 className="h-3 w-3" />
                                      Godkend
                                    </HbButton>
                                    <HbButton
                                      type="button"
                                      variant="secondary"
                                      className="h-7 gap-1 px-3 text-[11px]"
                                      onClick={() => aabnRediger(p)}
                                      disabled={afgoerMutation.isPending}
                                    >
                                      <Pencil className="h-3 w-3" />
                                      Redigér og godkend
                                    </HbButton>
                                  </>
                                )}
                                <button
                                  type="button"
                                  className="inline-flex h-7 items-center gap-1 px-2 text-[11px] text-hb-ink-soft underline-offset-4 transition-colors hover:text-hb-rust hover:underline disabled:opacity-50"
                                  onClick={() => aabnForkast(p)}
                                  disabled={afgoerMutation.isPending}
                                >
                                  <XCircle className="h-3 w-3" />
                                  Forkast
                                </button>
                                {!kanGodkendes && (
                                  <span className="text-[10px] text-hb-ink-soft">
                                    {udloebet && gyldighed
                                      ? gyldighed.grund
                                      : "Kan endnu ikke godkendes herfra — kun forkastes"}
                                  </span>
                                )}
                              </div>
                              {p.tool === "update_weekly_focus" && kanGodkendes && (
                                <p className="text-[10px] text-hb-ink-soft mt-1">
                                  Godkend erstatter medlemmets fokuskort for indeværende uge med det samme.
                                </p>
                              )}

                              {foldUd === "forkast" && (
                                <div className="mt-2 space-y-2">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {FORKAST_KATEGORIER_FLADE.map((slug) => (
                                      <button
                                        key={slug}
                                        onClick={() => setValgtKategori(slug)}
                                        className={`text-xs px-2.5 py-0.5 rounded-full border transition-colors ${valgtKategori === slug ? "border-hb-evergreen bg-hb-sage text-hb-evergreen" : "border-hb-line bg-hb-surface text-hb-ink-soft hover:border-hb-ink/30 hover:text-hb-ink"}`}
                                      >
                                        {FORKAST_KATEGORI_LABELS[slug]}
                                      </button>
                                    ))}
                                  </div>
                                  <HbTextarea
                                    placeholder="Uddyb grunden (valgfrit)..."
                                    value={fritekst}
                                    onChange={(e) => setFritekst(e.target.value)}
                                    className="min-h-[60px] resize-none text-xs"
                                  />
                                  <div className="flex items-center gap-2">
                                    <p className="text-[10px] text-hb-ink-soft">
                                      Kategorien er dommen — fritekst er tilvalg
                                    </p>
                                    <HbButton
                                      type="button"
                                      variant="secondary"
                                      className="ml-auto h-8 px-3 text-xs text-hb-rust hover:bg-hb-rust/10"
                                      onClick={() => forkast(p)}
                                      disabled={!valgtKategori || afgoerMutation.isPending}
                                    >
                                      {afgoerMutation.isPending ? "Gemmer..." : "Forkast forslag"}
                                    </HbButton>
                                  </div>
                                </div>
                              )}

                              {foldUd === "rediger" && (
                                <div className="mt-2 space-y-2">
                                  {p.tool === "update_weekly_focus" ? (
                                    <>
                                      <HbInput
                                        placeholder="Overskrift"
                                        value={redigering.headline ?? ""}
                                        onChange={(e) => setRedigering((r) => ({ ...r, headline: e.target.value }))}
                                        className="py-1.5 text-xs"
                                      />
                                      <HbTextarea
                                        placeholder="Opsummering"
                                        value={redigering.summary ?? ""}
                                        onChange={(e) => setRedigering((r) => ({ ...r, summary: e.target.value }))}
                                        className="min-h-[60px] resize-none text-xs"
                                      />
                                    </>
                                  ) : (
                                    <HbTextarea
                                      placeholder="Ét punkt pr. linje (højst 3)"
                                      value={redigering.points ?? ""}
                                      onChange={(e) => setRedigering((r) => ({ ...r, points: e.target.value }))}
                                      className="min-h-[60px] resize-none text-xs"
                                    />
                                  )}
                                  <div className="flex items-center gap-2">
                                    {p.tool === "update_weekly_focus" && (
                                      <p className="text-[10px] text-hb-ink-soft">
                                        Erstatter medlemmets fokuskort for indeværende uge med det samme
                                      </p>
                                    )}
                                    <HbButton
                                      type="button"
                                      className="ml-auto h-8 px-3 text-xs"
                                      onClick={() => godkendRedigeret(p)}
                                      disabled={redigeretErTom || afgoerMutation.isPending}
                                    >
                                      {afgoerMutation.isPending ? "Gemmer..." : "Godkend redigeret"}
                                    </HbButton>
                                  </div>
                                </div>
                              )}
                            </>
                          )}

                          {p.status !== "proposed" && p.decided_at && (
                            <div className="mt-1.5 pt-1.5 border-t border-hb-line text-[10px] text-hb-ink-soft">
                              <span className="font-medium text-hb-ink">
                                {(p.decided_by && beslutterNavne[p.decided_by]) || "En rådgiver"}
                              </span>
                              {p.status === "approved"
                                ? (p.edited_args ? " godkendte (redigeret)" : " godkendte")
                                : " forkastede"}
                              {" · "}
                              {format(new Date(p.decided_at), "d. MMM yyyy HH:mm", { locale: da })}
                              {p.decision_category && (
                                <> · {FORKAST_KATEGORI_LABELS[p.decision_category] ?? p.decision_category}</>
                              )}
                              {p.decision_reason && (
                                <span className="block mt-0.5 italic">"{p.decision_reason}"</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
