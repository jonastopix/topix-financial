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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  approved: { label: "Godkendt", className: "bg-primary/10 text-primary" },
  rejected: { label: "Forkastet", className: "bg-destructive/10 text-destructive" },
  expired: { label: "Udløbet", className: "bg-secondary text-muted-foreground" },
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

  return (
    /* Virksomhedsniveau: knappen bor HER (ikke på rapportrækken —
       beslutningen 2026-08-25: agenten er et blik på virksomheden,
       ikke på et dokument). company_review finder selv nyeste
       periode; tør-kørslens forslag lander i agent_runs nedenfor. */
    <div className="mt-6 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setShowAgentLog(v => !v)}
          className="flex items-center gap-2 text-sm font-medium text-foreground"
        >
          <Sparkles className="h-4 w-4 text-primary" />
          Agent-log
          <span className="text-xs font-normal text-muted-foreground ml-1">({agentRuns.length})</span>
          {showAgentLog ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
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
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Sparkles className="h-3 w-3" />
          {agentRunning === "company" ? "Kører..." : "Kør agent (tørt)"}
        </button>
      </div>
      {showAgentLog && (
        <div className="space-y-2">
          {agentRuns.length === 0 ? (
            <p className="text-xs text-muted-foreground">Agenten har ikke kørt endnu for denne virksomhed.</p>
          ) : agentRuns.map((run: any) => {
            const runProposals = ([...(run.agent_proposals || [])] as ProposalRow[])
              .sort((a, b) => a.position - b.position);
            return (
              <div key={run.id} className="rounded-lg border border-border/40 bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium text-primary uppercase tracking-wider">
                      {AGENT_TRIGGER_LABELS[run.trigger] ?? run.trigger}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${run.mode === "dry_run" ? "bg-secondary text-muted-foreground" : "bg-primary/10 text-primary"}`}>
                      {run.mode === "dry_run" ? "Tør" : "Live"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {run.period_label || run.period_key} · {runProposals.length} forslag
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(run.started_at), "d. MMM yyyy HH:mm", { locale: da })}
                  </span>
                </div>
                {runProposals.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {run.error ? `Fejl: ${run.error}` : "Ingen forslag i denne kørsel."}
                  </p>
                ) : (
                  <div className="space-y-1.5 mt-1.5">
                    {runProposals.map((p) => {
                      const kanGodkendes = p.status === "proposed" && UNDERSTOETTEDE_SKRIVEVEJE_FLADE.has(p.tool);
                      const badge = STATUS_BADGES[p.status];
                      const foldUd = aaben?.proposalId === p.id ? aaben.tilstand : null;
                      return (
                        <div key={p.id} className="rounded-md bg-background/60 border border-border/30 px-2.5 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                              {AGENT_TOOL_LABELS[p.tool] ?? p.tool}
                            </span>
                            {badge && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${badge.className}`}>
                                {badge.label}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-foreground whitespace-pre-line">
                            {agentProposalText(p.tool, p.args)}
                          </p>

                          {p.status === "proposed" && (
                            <>
                              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                                {kanGodkendes && (
                                  <>
                                    <Button
                                      size="sm"
                                      className="h-6 text-[11px] px-2"
                                      onClick={() => afgoerMutation.mutate({ proposalId: p.id, decision: "approve" })}
                                      disabled={afgoerMutation.isPending}
                                    >
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      Godkend
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 text-[11px] px-2"
                                      onClick={() => aabnRediger(p)}
                                      disabled={afgoerMutation.isPending}
                                    >
                                      <Pencil className="h-3 w-3 mr-1" />
                                      Redigér og godkend
                                    </Button>
                                  </>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[11px] px-2 text-muted-foreground hover:text-destructive"
                                  onClick={() => aabnForkast(p)}
                                  disabled={afgoerMutation.isPending}
                                >
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Forkast
                                </Button>
                                {!kanGodkendes && (
                                  <span className="text-[10px] text-muted-foreground">
                                    Kan endnu ikke godkendes herfra — kun forkastes
                                  </span>
                                )}
                              </div>
                              {p.tool === "update_weekly_focus" && kanGodkendes && (
                                <p className="text-[10px] text-muted-foreground mt-1">
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
                                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${valgtKategori === slug ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                                      >
                                        {FORKAST_KATEGORI_LABELS[slug]}
                                      </button>
                                    ))}
                                  </div>
                                  <Textarea
                                    placeholder="Uddyb grunden (valgfrit)..."
                                    value={fritekst}
                                    onChange={(e) => setFritekst(e.target.value)}
                                    className="text-xs min-h-[60px] resize-none"
                                  />
                                  <div className="flex items-center gap-2">
                                    <p className="text-[10px] text-muted-foreground">
                                      Kategorien er dommen — fritekst er tilvalg
                                    </p>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      className="ml-auto h-7 text-xs"
                                      onClick={() => forkast(p)}
                                      disabled={!valgtKategori || afgoerMutation.isPending}
                                    >
                                      {afgoerMutation.isPending ? "Gemmer..." : "Forkast forslag"}
                                    </Button>
                                  </div>
                                </div>
                              )}

                              {foldUd === "rediger" && (
                                <div className="mt-2 space-y-2">
                                  {p.tool === "update_weekly_focus" ? (
                                    <>
                                      <Input
                                        placeholder="Overskrift"
                                        value={redigering.headline ?? ""}
                                        onChange={(e) => setRedigering((r) => ({ ...r, headline: e.target.value }))}
                                        className="h-7 text-xs"
                                      />
                                      <Textarea
                                        placeholder="Opsummering"
                                        value={redigering.summary ?? ""}
                                        onChange={(e) => setRedigering((r) => ({ ...r, summary: e.target.value }))}
                                        className="text-xs min-h-[60px] resize-none"
                                      />
                                    </>
                                  ) : (
                                    <Textarea
                                      placeholder="Ét punkt pr. linje (højst 3)"
                                      value={redigering.points ?? ""}
                                      onChange={(e) => setRedigering((r) => ({ ...r, points: e.target.value }))}
                                      className="text-xs min-h-[60px] resize-none"
                                    />
                                  )}
                                  <div className="flex items-center gap-2">
                                    {p.tool === "update_weekly_focus" && (
                                      <p className="text-[10px] text-muted-foreground">
                                        Erstatter medlemmets fokuskort for indeværende uge med det samme
                                      </p>
                                    )}
                                    <Button
                                      size="sm"
                                      className="ml-auto h-7 text-xs"
                                      onClick={() => godkendRedigeret(p)}
                                      disabled={redigeretErTom || afgoerMutation.isPending}
                                    >
                                      {afgoerMutation.isPending ? "Gemmer..." : "Godkend redigeret"}
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}

                          {p.status !== "proposed" && p.decided_at && (
                            <div className="mt-1.5 pt-1.5 border-t border-border/30 text-[10px] text-muted-foreground">
                              <span className="font-medium text-foreground">
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
