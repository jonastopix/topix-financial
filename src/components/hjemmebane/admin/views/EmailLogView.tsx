import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, FlaskConical, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { HbButton } from "../../HbButton";
import { HbCard } from "../../HbCard";
import { HbTag } from "../../HbTag";
import { hbControlClasses, HbSelect } from "../HbField";

/**
 * E-mail-loggen i Hjemmebane (4/9) — konvertering af
 * src/pages/AdminEmailLog.tsx (målt 4/9: 311 linjer, to Select, én tabel
 * med seks kolonner, ét inputfelt). ALT er med: stat-kortene, søgningen,
 * begge filtre, listen med udfoldet detalje pr. række, pagineringen og
 * tom tilstand. Query, dedup pr. message_id, filtrering og tekster står
 * som i den gamle fil — kun udtrykket er nyt.
 *
 * SKALLEN er HbMemberShell (side-flow), som LegatView: siden hører til
 * admin-blokkens «Platform» i HbMemberShell, ikke til HbAdminShells otte
 * indholdssektioner. Menuen røres ikke (se AdminEmailLog.tsx).
 *
 * TABELLEN er grid-listen fra VirksomhedslisteView (:303-335): header-
 * række som CSS-grid, ul.divide-y divide-hb-line, én række pr. log-linje,
 * skelet-rækker, tom tilstand som stille tekst. Seks kolonner som den
 * gamle tabel (Tidspunkt, Modtager, Type, Emne, Status, fold-pil).
 * Rækken folder ud INLINE som før (:268-284) — detaljen er fire-fem
 * linjer, ikke en flade der fortjener HbAdminSplit.
 *
 * DE TO SELECT er HbSelect (native, ingen portal): statusfilteret har ni
 * valg (alle + otte statusser) og typefilteret et dynamisk antal fra
 * data — begge for mange til HbSegmented, som er «ét stort roligt
 * element» for to-tre valg (HbSegmented.tsx:12-14).
 *
 * STATUS pr. mail bygges inline som HbTag (StatusTag nedenfor):
 * HbStatusPill kender kun draft/published/archived/cancelled/completed
 * (HbStatusPill.tsx:4) — samme grund som LegatViews StatusTag. Farverne
 * er Hb-paletten: evergreen bærer «sendt», rust bærer fejl-familien
 * (fejlet, DLQ, bounce, klage — de fire den gamle side talte som «Fejlet /
 * DLQ»), papir med hairline bærer det der venter (afventer, rate-limited),
 * dæmpet bærer det undertrykte. Ikonerne i den gamle badge er droppet;
 * testmarkøren (kolbe-ikonet ved modtageren) er beholdt, for den er
 * information, ikke pynt.
 */

interface LogEntry {
  id: string;
  message_id: string | null;
  template_name: string;
  recipient_email: string;
  subject: string | null;
  status: string;
  error_message: string | null;
  is_test: boolean;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

const STATUS_LABELS: Record<string, string> = {
  sent: "Sendt",
  pending: "Afventer",
  failed: "Fejlet",
  dlq: "DLQ",
  rate_limited: "Rate-limited",
  suppressed: "Undertrykket",
  bounced: "Bounce",
  complained: "Klage",
};

const TEMPLATE_LABELS: Record<string, string> = {
  "report-reminder":  "Rapport-påmindelse",
  "pulse-reminder":   "Pulse-påmindelse",
  "monthly-digest":   "Månedlig digest",
  "invitation":       "Invitation",
  "signup":           "Signup-bekræftelse",
  "recovery":         "Password reset",
  "magiclink":        "Magic link",
  "invite":           "Auth invitation",
  "email_change":     "Email-ændring",
  "reauthentication": "Re-auth kode",
  "template-test":    "Skabelon-test",
};

function templateLabel(name: string) {
  if (TEMPLATE_LABELS[name]) return TEMPLATE_LABELS[name];
  if (name.startsWith("notification-")) {
    const type = name.replace("notification-", "");
    const map: Record<string, string> = {
      advisor_replied:        "Notif: Ny besked",
      report_review_ready:    "Notif: Rapport klar",
      report_error:           "Notif: Rapport fejl",
      report_committed:       "Notif: Rapport godkendt",
      milestone_completed:    "Notif: Milestone fuldført",
      weekly_focus_ready:     "Notif: Ugens fokus",
      pulse_checkin_received: "Notif: Pulse modtaget",
    };
    return map[type] || `Notifikation: ${type}`;
  }
  return name;
}

const PAGE_SIZE = 100;
const ALL_STATUSES = ["sent", "pending", "failed", "dlq", "rate_limited", "suppressed", "bounced", "complained"];
const FEJL_FAMILIEN = ["failed", "dlq", "bounced", "complained"];

const StatusTag = ({ status }: { status: string }) => {
  const label = STATUS_LABELS[status] || status;
  const klasse =
    status === "sent"
      ? "bg-hb-evergreen/10 text-hb-evergreen"
      : FEJL_FAMILIEN.includes(status)
        ? "bg-hb-rust/10 text-hb-rust"
        : status === "suppressed"
          ? "bg-hb-line/60 text-hb-ink-soft"
          : "border border-hb-line bg-hb-paper text-hb-ink";
  return <HbTag className={cn("px-2 py-0.5 text-[11px]", klasse)}>{label}</HbTag>;
};

/** Seks kolonner: tidspunkt, modtager, type, emne, status, fold-pil. */
const GRID = "sm:grid-cols-[6.5rem_1.6fr_1.1fr_1.6fr_7rem_1.5rem]";

const RaekkeSkelet = () => (
  <li aria-hidden className="px-4 py-3">
    <div className="h-4 w-2/5 animate-pulse rounded bg-hb-line/60" />
    <div className="mt-2 h-3 w-1/4 animate-pulse rounded bg-hb-line/40" />
  </li>
);

export const EmailLogView = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-email-log", statusFilter, typeFilter, page],
    queryFn: async () => {
      let query = (supabase as any)
        .from("email_send_log")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (typeFilter !== "all") query = query.eq("template_name", typeFilter);

      const { data, error, count } = await query;
      if (error) throw error;
      const raw = (data || []) as LogEntry[];

      // Deduplicate: keep only the latest row per message_id
      const byMessageId = new Map<string, LogEntry>();
      const noMessageId: LogEntry[] = [];
      for (const row of raw) {
        if (!row.message_id) {
          noMessageId.push(row);
          continue;
        }
        const existing = byMessageId.get(row.message_id);
        if (!existing || new Date(row.created_at) > new Date(existing.created_at)) {
          byMessageId.set(row.message_id, row);
        }
      }
      const deduped = [...byMessageId.values(), ...noMessageId]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return { rows: deduped, total: count || 0 };
    },
    staleTime: 30_000,
  });

  const rows = data?.rows || [];
  const dedupedTotal = rows.length;

  const filtered = search.trim()
    ? rows.filter(r =>
        r.recipient_email.toLowerCase().includes(search.toLowerCase()) ||
        (r.subject || "").toLowerCase().includes(search.toLowerCase()) ||
        (r.message_id || "").toLowerCase().includes(search.toLowerCase())
      )
    : rows;

  const uniqueTypes = [...new Set(rows.map(r => r.template_name))].sort();

  const countByStatus = (s: string) => rows.filter(r => r.status === s).length;
  const failedCount = rows.filter(r => FEJL_FAMILIEN.includes(r.status)).length;

  return (
    <div>
      {/* Header (Virksomheder-mønstret): fladens navn som eyebrow, tallet
          som rubrik-linje, «Opdater» til højre. */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Platform</p>
          <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
            Email-log
          </h1>
          <p className="mt-2 text-sm text-hb-ink-soft">
            {dedupedTotal.toLocaleString("da-DK")} afsendelser registreret
          </p>
        </div>
        <HbButton variant="secondary" className="h-9 px-4 text-sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          Opdater
        </HbButton>
      </section>

      {/* Stats — tre stille kort. Tallene er farvet i Hb-paletten: evergreen
          for det sendte, blæk for det ventende, rust for fejl-familien. */}
      <div className="mt-8 grid grid-cols-3 gap-4">
        <HbCard className="p-4 text-center">
          <p className="font-editorial text-2xl font-medium text-hb-evergreen">{countByStatus("sent")}</p>
          <p className="mt-1 text-xs text-hb-ink-soft">Sendt</p>
        </HbCard>
        <HbCard className="p-4 text-center">
          <p className="font-editorial text-2xl font-medium text-hb-ink">{countByStatus("pending")}</p>
          <p className="mt-1 text-xs text-hb-ink-soft">Afventer</p>
        </HbCard>
        <HbCard className="p-4 text-center">
          <p className="font-editorial text-2xl font-medium text-hb-rust">{failedCount}</p>
          <p className="mt-1 text-xs text-hb-ink-soft">Fejlet / DLQ</p>
        </HbCard>
      </div>

      {/* Filtre: søgefelt (klientside over den hentede side, som før) og
          to native selects. */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          placeholder="Søg modtager, emne eller message-id…"
          aria-label="Søg i loggen"
          className={cn(hbControlClasses, "min-w-[200px] flex-1 rounded-full px-5")}
        />
        <HbSelect
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
          aria-label="Status"
          className="w-auto min-w-[160px] rounded-full"
        >
          <option value="all">Alle statuser</option>
          {ALL_STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
          ))}
        </HbSelect>
        <HbSelect
          value={typeFilter}
          onChange={e => { setTypeFilter(e.target.value); setPage(0); }}
          aria-label="Mail-type"
          className="w-auto min-w-[180px] rounded-full"
        >
          <option value="all">Alle mail-typer</option>
          {uniqueTypes.map(t => (
            <option key={t} value={t}>{templateLabel(t)}</option>
          ))}
        </HbSelect>
      </div>

      {/* Listen */}
      <div className="mt-6 overflow-hidden rounded-hb border border-hb-line bg-hb-surface">
        <div className={cn("hidden border-b border-hb-line px-4 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft sm:grid sm:gap-x-4", GRID)}>
          <span>Tidspunkt</span>
          <span>Modtager</span>
          <span>Type</span>
          <span>Emne</span>
          <span>Status</span>
          <span />
        </div>
        {isLoading ? (
          <ul className="divide-y divide-hb-line">
            <RaekkeSkelet />
            <RaekkeSkelet />
            <RaekkeSkelet />
          </ul>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-hb-ink-soft">Ingen afsendelser fundet</p>
        ) : (
          <ul className="divide-y divide-hb-line">
            {filtered.map(row => {
              const isExpanded = expandedId === row.id;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : row.id)}
                    aria-expanded={isExpanded}
                    className={cn(
                      "grid w-full grid-cols-1 gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors sm:items-center",
                      GRID,
                      isExpanded ? "bg-hb-sage/20" : "hover:bg-hb-sage/20",
                    )}
                  >
                    <p className="whitespace-nowrap text-xs text-hb-ink-soft">
                      {format(new Date(row.created_at), "d. MMM HH:mm:ss", { locale: da })}
                    </p>
                    <p className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-hb-ink">
                      {row.is_test && (
                        <FlaskConical className="h-3.5 w-3.5 shrink-0 text-hb-ink-soft" aria-label="Testmail" />
                      )}
                      <span className="truncate">{row.recipient_email}</span>
                    </p>
                    <p className="truncate text-xs text-hb-ink">{templateLabel(row.template_name)}</p>
                    <p className="truncate text-xs text-hb-ink-soft">{row.subject || "—"}</p>
                    <div>
                      <StatusTag status={row.status} />
                    </div>
                    <span className="hidden justify-self-end text-hb-ink-soft sm:block">
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="space-y-1.5 border-t border-hb-line/60 bg-hb-sage/10 px-4 py-3 text-xs text-hb-ink">
                      <p><span className="font-medium text-hb-ink-soft">Message-ID:</span> {row.message_id || "—"}</p>
                      <p><span className="font-medium text-hb-ink-soft">Tidspunkt:</span> {format(new Date(row.created_at), "d. MMMM yyyy HH:mm:ss", { locale: da })}</p>
                      <p><span className="font-medium text-hb-ink-soft">Emne:</span> {row.subject || "—"}</p>
                      {row.error_message && (
                        <p><span className="font-medium text-hb-rust">Fejl:</span> {row.error_message}</p>
                      )}
                      {row.metadata && Object.keys(row.metadata).length > 0 && (
                        <p className="break-all"><span className="font-medium text-hb-ink-soft">Metadata:</span> {JSON.stringify(row.metadata)}</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* PAGINERING — NY form (målt 4/9: intet Hb-mønster for paginering
          fandtes). Enklest muligt: sidetal som stille tekst, to sekundære
          knapper. Kan løftes til en fælles komponent hvis en anden flade
          får brug for den. Betingelsen og knappernes disabled-dom står
          ORDRET som i den gamle side (:294-306) — bemærk, målt ved
          konverteringen: dedupedTotal er rows.length, dvs. den hentede
          side EFTER dedup, som aldrig overstiger PAGE_SIZE; den samlede
          count fra querien (data.total) bruges ikke. Adfærden er bevaret
          uændret; det er en observation, ikke en rettelse. */}
      {dedupedTotal > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm text-hb-ink-soft">
          <span>Side {page + 1} af {Math.ceil(dedupedTotal / PAGE_SIZE)}</span>
          <div className="flex gap-2">
            <HbButton
              variant="secondary"
              className="h-9 px-4 text-sm"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              Forrige
            </HbButton>
            <HbButton
              variant="secondary"
              className="h-9 px-4 text-sm"
              onClick={() => setPage(p => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= dedupedTotal}
            >
              Næste
            </HbButton>
          </div>
        </div>
      )}
    </div>
  );
};
