import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ResponsiveContainer, AreaChart, Area, Line, LineChart, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid } from "recharts";
import DeliveryOverview from "@/components/DeliveryOverview";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useVirksomhed, type VirksomhedsData } from "@/hooks/useVirksomhed";
import AgentForslagPanel from "@/components/AgentForslagPanel";
import AdvisorAIChat from "@/components/AdvisorAIChat";
import CompanyChatPane from "@/components/CompanyChatPane";
import EditCompanyDialog from "@/components/members/EditCompanyDialog";
import HandoutDetail from "@/components/HandoutDetail";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { maaFjerneMedlem } from "@/lib/medlemsfjernelse";
import type { CompanyFact } from "@/hooks/useCompanyFacts";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { afgoerVirksomhedsSignaler, type FactPunkt, type Signal, type VirksomhedsInput } from "@/lib/virksomhedsSignaler";
import { computeMembershipTier, type MembershipTier } from "@/lib/membershipTier";
import { afgoerFornyelsestilstand, type FornyelseStatus, type Fornyelsesbeslutning } from "@/lib/fornyelse";
import { afgoerBetalingsfrist, type Betalingsfriststatus } from "@/lib/betalingsfrist";
import { beloebKr, kortDato, datoOgTid, stripeSagde, traekBadgeTekst } from "@/lib/traek";
import { KPI_DEFS, deriveKpiMetrics, type KpiMetric } from "@/lib/kpiDefs";
import { deriveKpiTone } from "../noegletal/kpiTone";
import { momErGyldig, delSerieTilTegning, basisNoegle, erEstimatNoegle, ESTIMAT_NOEGLE_SUFFIX } from "@/lib/dataGrundlag";
import { handoutConfigs, moduleOrder, type HandoutModule } from "@/lib/handoutConfig";
import { openReportFile, isLegacyPath } from "@/lib/reportFileAccess";
import { notifyChatMessage } from "@/lib/chatNotify";
import { DANISH_MONTHS, formatCompact, formatDKK } from "@/lib/financialUtils";
import { EstimatMaerke, ESTIMAT_FORKLARING } from "../EstimatMaerke";
import { HbButton } from "../HbButton";
import { HbCard } from "../HbCard";
import { HbSection } from "../HbSection";
import { HbTag } from "../HbTag";
import { cn } from "@/lib/utils";

/**
 * Virksomhedssiden (raadgiverfladen-design.md §4). Etape 1: blok 1 «Hvad
 * skal du vide nu» og blok 7 «Aftalen». Etape 2: blok 5 «Tallene» og blok
 * 6 «Aktivitet». Etape 3 (første del): blok 2 «Deres ord og din
 * forberedelse». Blok 3 og 4 kommer i senere etaper. Datalaget er
 * useVirksomhed (company-nøglet, §3.3); facts går gennem useCompanyFacts
 * og bærer data_basis — intet her læser facts-tabellen direkte.
 *
 * Blok 1 er BULLETS der kan skimmes på to sekunder — ikke paneler. Dommen
 * er motoren (afgoerVirksomhedsSignaler, #589), som ikke røres her.
 * Blok 7 er en rolig opsummering — VISNING i denne etape, ingen
 * handlinger (omdøb, inviter, slet osv. kommer senere, §3.6).
 *
 * MONTERET 4/9 (fire af de ni handlinger MemberDetail har og siden
 * manglede — komponenterne findes, er company-nøglede og henter selv;
 * de er IKKE ændret, MemberDetail bruger dem stadig):
 *   - AgentForslagPanel → blok 1 (agent_runs + agent_proposals, ejer
 *     kaldet til agent-forslag-afgoer).
 *   - AdvisorAIChat → blok 5, gated som MemberDetail:1362 (facts > 0,
 *     tier ≠ expired).
 *   - Forecast (generate-ai-forecast) → blok 5, på en knap — aldrig ved
 *     sidevisning.
 *   - EditCompanyDialog → blok 7, kun admin (MemberDetail:953).
 * De tre første tegner i appens gamle tokens (bg-card, text-foreground)
 * inde i Hb-skallen — samme accepterede skift som admin-siderne (#603).
 */

const formatDato = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });
};

const formatKr = (oere: number | null | undefined): string =>
  oere == null ? "—" : `${new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(Math.round(oere / 100))} kr.`;

const BETALINGSMODEL_LABEL: Record<string, string> = {
  fuld: "Fuld betaling",
  rate2: "2 rater",
  rate12: "12 rater",
};

/** Samme tekster som FornyelsesSektion.tsx:45-59 — kun udtrykket er Hb. */
const FORNYELSE_LABEL: Record<FornyelseStatus, string> = {
  ophoert: "Ophørt",
  udloebet_tilbyd: "Udløbet — tilbyd",
  udloebet_tilbyd_ikke: "Udløbet — tilbyd ikke",
  beslutning_mangler: "Beslutning mangler",
  klar_til_tilbud: "Klar til tilbud",
  klar_til_afsked: "Klar til afsked",
  uden_for_ordningen: "Uden for ordningen",
  i_god_tid: "I god tid",
  ingen_slutdato: "Ingen slutdato",
  selvbetjener: "Selvbetjener",
};

/** Samme tekster som IndgangsSektion.tsx:63-70. */
const INDGANG_LABEL: Record<Betalingsfriststatus, string> = {
  afventer_pris: "Mangler pris",
  klar_til_mail: "Mail på vej",
  afventer_betaling: "Afventer betaling",
  frist_overskredet: "Frist passeret",
  betalt: "Betalt",
};

/** Tier-badgen — samme fire tilstande som VirksomhedslisteView. */
const TierBadge = ({ tier, kontraktSlut }: { tier: MembershipTier; kontraktSlut: string | null }) => {
  if (tier === "full") return <HbTag className="px-2 py-0.5 text-[11px]">{kontraktSlut ? `Fuldt til ${formatDato(kontraktSlut)}` : "Fuldt"}</HbTag>;
  if (tier === "subscriber") return <HbTag className="border border-hb-line bg-hb-paper px-2 py-0.5 text-[11px]">Abonnent</HbTag>;
  if (tier === "expired") return <HbTag className="bg-hb-line/60 px-2 py-0.5 text-[11px] text-hb-ink-soft">Udløbet</HbTag>;
  if (tier === "no_date") return <HbTag className="bg-hb-rust/10 px-2 py-0.5 text-[11px] text-hb-rust">Ingen slutdato</HbTag>;
  return null;
};

/** Én rolig label/værdi-linje til «Aftalen». */
const Linje = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid grid-cols-[9rem_1fr] gap-x-4 py-1.5 text-sm">
    <span className="text-hb-ink-soft">{label}</span>
    <span className="min-w-0 text-hb-ink">{children}</span>
  </div>
);

// ── Blok 1: motorens input, bygget af hookens data ──────────────────────

const tilFactPunkt = (f: CompanyFact | null): FactPunkt | null => {
  if (!f) return null;
  const kf = factsToDanishMetrics(f.metrics);
  return {
    period_key: f.period_key,
    period_label: f.period_label,
    omsaetning: kf.omsaetning ?? null,
    resultat_foer_skat: kf.resultat_foer_skat ?? null,
    bank_balance: kf.bank_balance ?? null,
  };
};

function bygSignalInput(d: VirksomhedsData, facts: CompanyFact[]): VirksomhedsInput {
  // useCompanyFacts sorterer på period_key stigende — seneste sidst.
  const seneste = facts[facts.length - 1] ?? null;
  const forrige = facts.length >= 2 ? facts[facts.length - 2] : null;
  // Budgetmål for senestes periode — samme opslag som MemberDetail.tsx:752-757.
  const budgetOmsaetning = (() => {
    if (!seneste) return null;
    const [y, m] = seneste.period_key.split("-");
    const baseKey = `${y}-base-${parseInt(m, 10) - 1}`;
    return d.budgetter.find((b) => b.period === baseKey && b.category === "omsaetning")?.budget_amount ?? null;
  })();
  // Seneste besked på tværs af virksomhedens samtaler (flere er muligt).
  const senesteBeskedAt = d.samtaler.reduce<string | null>(
    (acc, s) => (s.last_message_at && (!acc || s.last_message_at > acc) ? s.last_message_at : acc),
    null,
  );
  // «Ulæste» = samtaler der venter på rådgiverens svar — SAMME definition
  // som forsiden (AdvisorDashboard unreadByCompany: awaiting_reply_from ===
  // "advisor"), så blok 1 og forsidens kø er enige. Ingen messages-query.
  const ulaesteBeskeder = d.samtaler.filter((s) => s.awaiting_reply_from === "advisor").length;
  const nu = Date.now();
  return {
    senesteFact: tilFactPunkt(seneste),
    forrigeFact: tilFactPunkt(forrige),
    senesteCommittedAt: seneste?.committed_at ?? null,
    budgetOmsaetning,
    forfaldneMilestones: d.milestones.filter((m) => m.deadline && new Date(m.deadline).getTime() < nu && m.status !== "completed").length,
    loeftestaenger: d.handouts.reduce((n, h) => n + (Array.isArray(h.levers) ? h.levers.length : 0), 0),
    ulaesteBeskeder,
    // Nu udfyldt RIGTIGT — MemberDetail sendte null (siden hentede ikke
    // last_message_at), så motoren gav «aldrig skrevet» for alle.
    senesteBeskedAt,
    harCommittedeTal: facts.length > 0,
    // Nu udfyldt RIGTIGT — MemberDetail sendte 0.
    agentforslagVenter: d.agentforslagVenter,
  };
}

/** Alvor → tone. Rust kun til det der er galt (>= 70); resten dæmpet. */
const signalTone = (alvor: number) => (alvor >= 70 ? "text-hb-rust" : alvor >= 50 ? "text-hb-ink" : "text-hb-ink-soft");

const Blok1 = ({ d, facts }: { d: VirksomhedsData; facts: CompanyFact[] }) => {
  const signaler: Signal[] = useMemo(() => afgoerVirksomhedsSignaler(bygSignalInput(d, facts)), [d, facts]);
  /* Køer der vises: ALLE fem. §4 blok 1 nævner præcis dem: ny rapportering
     siden sidst (friske_tal), hvad stikker ud i tallene (stikker_ud),
     agentforslag der venter (agentforslag_venter), hvor længe siden I talte
     sammen (ikke_hoert_fra_laenge) og beskeder der venter (venter_paa_svar).
     For ÉN virksomhed er der ingen kø at sortere i — alt er værd at vide.
     MemberDetail viste kun stikker_ud, fordi den ikke kunne fodre resten;
     det kan denne side. Motorens sortering (alvor faldende) bevares; intet
     loft (motorens valg 7: loftet er fladens, og fem køer på én virksomhed
     giver højst en håndfuld). */
  // «Opgaver der venter på svar» (§4 blok 1) laver motoren ikke (valg 6:
  // aktivitet). Den er en data-linje herunder, ikke et signal — bevidst
  // adskilt, så motorens dom og fladens tælling ikke blandes.
  const opgaverVenter = d.opgaver.filter((o) => o.status === "proposed" || o.status === "open").length;
  const tom = signaler.length === 0 && opgaverVenter === 0;
  return (
    <HbSection eyebrow="Hvad skal du vide nu" hairline>
      {tom ? (
        <p className="text-sm text-hb-ink-soft">Intet der stikker ud lige nu.</p>
      ) : (
        <ul className="space-y-2">
          {signaler.map((s) => (
            <li key={s.noegle} className="flex items-baseline gap-3 text-[15px] leading-snug">
              <span aria-hidden className={cn("mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-current", signalTone(s.alvor))} />
              <span className={signalTone(s.alvor)}>
                {s.tekst}
                {s.detalje && <span className="ml-2 text-sm text-hb-ink-soft">{s.detalje}</span>}
              </span>
            </li>
          ))}
          {opgaverVenter > 0 && (
            <li className="flex items-baseline gap-3 text-[15px] leading-snug text-hb-ink">
              <span aria-hidden className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
              <span>{opgaverVenter} {opgaverVenter === 1 ? "opgave venter" : "opgaver venter"} på svar</span>
            </li>
          )}
        </ul>
      )}
      {/* Agentforslagene, afgørbare — bullet'en ovenfor siger kun antallet.
          Panelet henter selv (company-nøglet) og ejer kaldet til
          agent-forslag-afgoer; monteret som på MemberDetail:1465. */}
      <AgentForslagPanel companyId={d.company.id} />
    </HbSection>
  );
};

// ── Blok 2: Deres ord og din forberedelse ───────────────────────────────

/** «September 2026» af en period_key — refleksionens måned, i ord. */
const periodeIOrd = (periodKey: string | null | undefined): string | null => {
  if (!periodKey) return null;
  const [y, m] = periodKey.split("-");
  const navn = DANISH_MONTHS[parseInt(m, 10) - 1];
  return navn ? `${navn} ${y}` : periodKey;
};

/** Ansøgningen er rå jsonb (companies.application_context). Kun de tre
    tekstfelter designet nævner læses; alt andet (annual_revenue,
    revenue_interval …) er tal og hører ikke til i «deres ord». */
const ANSOEGNINGS_FELTER: { noegle: string; label: string }[] = [
  { noegle: "current_situation", label: "Nuværende situation" },
  { noegle: "goals", label: "Mål med virksomheden" },
  { noegle: "help_needed", label: "Hvilken hjælp de søgte" },
];

function laesAnsoegning(raw: unknown): { label: string; tekst: string }[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const obj = raw as Record<string, unknown>;
  return ANSOEGNINGS_FELTER.flatMap(({ noegle, label }) => {
    const v = obj[noegle];
    return typeof v === "string" && v.trim() ? [{ label, tekst: v.trim() }] : [];
  });
}

/** Ét felt af medlemmets egne ord — label dæmpet, teksten i ink. */
const Ord = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{label}</p>
    <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-hb-ink">{children}</p>
  </div>
);

const Blok2 = ({ d }: { d: VirksomhedsData }) => {
  /* Designets §4 blok 2: det der IKKE er udledt af tal — medlemmets egne
     ord og rådgiverens forberedelse. TONEN: det er betroet, ikke data.
     Ingen rust, ingen alarm, ingen «mangler»; er der ingen refleksion,
     siges det roligt. Tre dele:
       1. Refleksionen (pulse_checkins) — vises i fuld længde, sammenfattes
          ikke: fire korte felter, samme indhold som MemberDetail:982-1006.
       2. Ansøgningen (companies.application_context) — designet vil have
          den SAMMENFATTET med AI og gemt i egen kolonne (§4 blok 2, §5).
          Sammenfatningen findes ikke endnu, så feltet vises som det er,
          men FOLDET SAMMEN bag «Vis», så det ikke fylder blokken.
          Sammenfatningen erstatter denne udfoldning, når den bygges.
       3. Sessionsforberedelsen — ai-financial-feedback med request_type
          "session_prep" (samme kald som MemberDetail:307-313; svaret er
          `session_prep: string[]`, tre bullets). Den gemmes ingen steder og
          GENERERES IKKE ved sidevisning — et AI-kald pr. visning er dyrt og
          uventet. Rådgiveren beder om den på en knap. */
  const [visAnsoegning, setVisAnsoegning] = useState(false);
  const [forberedelse, setForberedelse] = useState<string[] | null>(null);
  const [henter, setHenter] = useState(false);
  const [forberedelseFejl, setForberedelseFejl] = useState<string | null>(null);

  const r = d.refleksion;
  const refleksionsFelter = r
    ? [
        { label: "Største udfordring", tekst: r.biggest_challenge },
        { label: "Søger hjælp til", tekst: r.help_needed },
        { label: "Hvad gik godt", tekst: r.went_well },
      ].filter((f): f is { label: string; tekst: string } => !!f.tekst && f.tekst.trim().length > 0)
    : [];
  const ansoegning = laesAnsoegning(d.company.application_context);

  const hentForberedelse = async () => {
    if (henter) return;
    setHenter(true);
    setForberedelseFejl(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-financial-feedback", {
        body: { request_type: "session_prep", companyId: d.company.id, companyContext: { name: d.company.name } },
      });
      if (!error && Array.isArray(data?.session_prep)) {
        setForberedelse(data.session_prep.filter((b: unknown): b is string => typeof b === "string"));
      } else {
        setForberedelseFejl("Forberedelsen kunne ikke laves lige nu. Prøv igen om lidt.");
      }
    } catch {
      setForberedelseFejl("Forberedelsen kunne ikke laves lige nu. Prøv igen om lidt.");
    } finally {
      setHenter(false);
    }
  };

  return (
    <HbSection eyebrow="Deres ord og din forberedelse" hairline className="mt-12">
      <div className="grid gap-4 md:grid-cols-[3fr_2fr]">
        {/* 1. Refleksionen — deres egne ord, i fuld længde */}
        <HbCard className="p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">Refleksionen</p>
            {r && <p className="text-xs text-hb-ink-soft">{periodeIOrd(r.period_key) ?? formatDato(r.created_at)}</p>}
          </div>
          {!r ? (
            <p className="mt-3 text-sm text-hb-ink-soft">Ingen refleksion endnu — den kommer, når medlemmet skriver sin første.</p>
          ) : refleksionsFelter.length === 0 && r.milestone_progress == null ? (
            <p className="mt-3 text-sm text-hb-ink-soft">Refleksionen for {periodeIOrd(r.period_key)} er sendt uden tekst.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {refleksionsFelter.map((f) => (
                <Ord key={f.label} label={f.label}>{f.tekst}</Ord>
              ))}
              {r.milestone_progress != null && (
                <p className="text-sm text-hb-ink-soft">Milestone-fremgang, som de selv vurderer den: {r.milestone_progress} %</p>
              )}
            </div>
          )}
        </HbCard>

        <div className="space-y-4">
          {/* 3. Sessionsforberedelsen — på en knap, aldrig automatisk */}
          {/* id="section-session": MemberDetails deep-link-anker (?section=session,
              l. 1120) — så gamle links rammer forberedelsen her. */}
          <HbCard id="section-session" className="scroll-mt-24 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">Din forberedelse</p>
            {forberedelse ? (
              <ul className="mt-3 space-y-2">
                {forberedelse.map((b, i) => (
                  <li key={i} className="flex items-baseline gap-3 text-[15px] leading-snug text-hb-ink">
                    <span aria-hidden className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-hb-evergreen" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-hb-ink-soft">Tre ting at tage op i næste session, skrevet ud fra de seneste tal. Laves først når du beder om den.</p>
            )}
            {forberedelseFejl && <p className="mt-2 text-sm text-hb-ink-soft">{forberedelseFejl}</p>}
            <div className="mt-4">
              <HbButton type="button" variant="secondary" className="h-9 px-4 text-sm" onClick={hentForberedelse} disabled={henter}>
                {henter ? "Skriver…" : forberedelse ? "Skriv den igen" : "Forbered session"}
              </HbButton>
            </div>
          </HbCard>

          {/* 2. Ansøgningen — foldet sammen; erstattes af den gemte AI-
              sammenfatning (egen kolonne på companies), når den er bygget. */}
          <HbCard className="p-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">Ansøgningen</p>
              {ansoegning.length > 0 && (
                <button
                  type="button"
                  onClick={() => setVisAnsoegning((v) => !v)}
                  aria-expanded={visAnsoegning}
                  className="text-sm text-hb-evergreen underline-offset-4 hover:underline"
                >
                  {visAnsoegning ? "Skjul" : "Vis"}
                </button>
              )}
            </div>
            {ansoegning.length === 0 ? (
              <p className="mt-3 text-sm text-hb-ink-soft">Ingen ansøgningstekst gemt.</p>
            ) : !visAnsoegning ? (
              <p className="mt-3 text-sm text-hb-ink-soft">Det de skrev, da de søgte ind — {ansoegning.length} {ansoegning.length === 1 ? "felt" : "felter"}.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {ansoegning.map((f) => (
                  <Ord key={f.label} label={f.label}>{f.tekst}</Ord>
                ))}
              </div>
            )}
          </HbCard>
        </div>
      </div>
    </HbSection>
  );
};

// ── Blok 5: Tallene — afvigelserne først ────────────────────────────────

/** Sparkline (MemberDetail:1170-1188, seks punkter) — pynt, men ærlig:
    serien deles med delSerieTilTegning som NoegletalViews grafer, så et
    estimeret punkt tegnes prikket, aldrig som en målt linje. Ingen ny
    afhængighed: recharts er allerede i huset. Én farve (ink-soft), ingen
    rød/grøn — retningen er ikke en dom, den står i M/M-linjen. */
const Sparkline = ({ history }: { history: KpiMetric["history"] }) => {
  const punkter = history.slice(-6);
  if (punkter.length < 2) return null;
  const delt = delSerieTilTegning(punkter, ["value"]);
  return (
    <div className="mt-2 -mx-1" aria-hidden>
      <ResponsiveContainer width="100%" height={28}>
        <LineChart data={delt} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <Line type="monotone" dataKey="value" stroke="hsl(var(--hb-ink-soft))" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey={`value${ESTIMAT_NOEGLE_SUFFIX}`} stroke="hsl(var(--hb-ink-soft))" strokeWidth={1.5} strokeDasharray="1 4" strokeLinecap="round" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

/** Ét KPI-kort: de samme domme som NoegletalView (deriveKpiMetrics for
    tal og M/M, deriveKpiTone for mål) — kun udtrykket er nyt. */
const KpiKort = ({ metric, afviger }: { metric: KpiMetric; afviger: boolean }) => (
  <div className={cn("rounded-hb border p-3", afviger ? "border-hb-rust/40 bg-hb-rust/5" : "border-hb-line bg-hb-surface")}>
    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{metric.label}</p>
    <p className={cn("mt-1 font-editorial text-2xl leading-tight", afviger ? "text-hb-rust" : "text-hb-ink")}>
      {metric.value}
      <span className="ml-1 text-sm text-hb-ink-soft">{metric.unit === "%" ? "%" : ""}</span>
    </p>
    <p className="mt-1 text-xs text-hb-ink-soft">
      {metric.changePct != null ? `${metric.change} M/M` : "M/M —"}
      {metric.targetNum > 0 && ` · mål ${metric.target}`}
    </p>
    <Sparkline history={metric.history} />
  </div>
);

/** Tooltip til DELTE serier — samme dedup som NoegletalViews DeltSerieTooltip
    (:92-130, ikke eksporteret): grænsepunktet bærer værdi i både den målte
    og estimat-nøglen; målt vinder, rene estimatpunkter mærkes. */
const DeltTooltip = ({
  active, payload, label, navne,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number | null }[];
  label?: string;
  navne: Record<string, string>;
}) => {
  if (!active || !payload?.length) return null;
  const raekker = new Map<string, { vaerdi: number; estimat: boolean }>();
  for (const item of payload) {
    if (item.value == null) continue;
    const noegle = String(item.dataKey);
    const base = basisNoegle(noegle);
    const erEst = erEstimatNoegle(noegle);
    const eks = raekker.get(base);
    if (eks && (erEst || !eks.estimat)) continue;
    raekker.set(base, { vaerdi: item.value, estimat: erEst });
  }
  if (raekker.size === 0) return null;
  return (
    <div className="rounded-hb border border-hb-line bg-hb-surface px-3 py-2 text-xs text-hb-ink shadow-hb-hover">
      <p className="text-hb-ink-soft">{label}</p>
      {[...raekker.entries()].map(([base, r]) => (
        <p key={base} className="mt-1">{navne[base] ?? base}: {formatDKK(r.vaerdi)}{r.estimat ? " · estimat" : ""}</p>
      ))}
    </div>
  );
};

/** «Finansiel udvikling» (MemberDetail:1203-1308): de seneste otte perioder
    med omsætning og resultat f. skat, plus budget som stiplet overlay.
    data_basis-KONTRAKTEN: estimerede perioder tegnes prikket i samme farve
    uden udfyldning — præcis som NoegletalViews trendgraf (:700-776,
    delSerieTilTegning, ingen connectNulls). Budgettet er en PLAN og deles
    ikke; det er allerede stiplet. */
const GRAF_NAVNE: Record<string, string> = { omsaetning: "Omsætning", resultat: "Resultat f. skat", budget: "Budget" };

const FinansielUdvikling = ({ d, facts }: { d: VirksomhedsData; facts: CompanyFact[] }) => {
  const punkter = useMemo(() => {
    return facts.slice(-8).map((f) => {
      const kf = factsToDanishMetrics(f.metrics);
      // Budget for perioden — samme opslag som MemberDetail:704-715.
      const [y, m] = f.period_key.split("-");
      const baseKey = `${y}-base-${parseInt(m, 10) - 1}`;
      const budget = d.budgetter.find((b) => b.period === baseKey && b.category === "omsaetning")?.budget_amount ?? null;
      return {
        label: f.period_label,
        data_basis: f.data_basis,
        omsaetning: kf.omsaetning ?? null,
        resultat: kf.resultat_foer_skat ?? null,
        budget,
      };
    });
  }, [facts, d.budgetter]);
  const tegning = useMemo(() => delSerieTilTegning(punkter, ["omsaetning", "resultat"]), [punkter]);
  const harEstimater = punkter.some((p) => p.data_basis === "estimated");
  const harBudget = punkter.some((p) => p.budget != null);
  if (punkter.length < 2) return null;

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">Finansiel udvikling</p>
        <p className="flex flex-wrap items-center gap-x-4 text-xs text-hb-ink-soft">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "hsl(var(--hb-evergreen))" }} />Omsætning</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "hsl(var(--hb-ink))" }} />Resultat f. skat</span>
          {harBudget && <span className="inline-flex items-center gap-1.5"><span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: "hsl(var(--hb-rust))" }} />Budget</span>}
        </p>
      </div>
      <div className="mt-3 h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={tegning} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="vgrad-omsaetning" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--hb-evergreen))" stopOpacity={0.2} />
                <stop offset="95%" stopColor="hsl(var(--hb-evergreen))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--hb-line))" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--hb-ink-soft))" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={formatCompact} width={48} tick={{ fontSize: 11, fill: "hsl(var(--hb-ink-soft))" }} axisLine={false} tickLine={false} />
            <RechartsTooltip content={<DeltTooltip navne={GRAF_NAVNE} />} />
            {(["omsaetning", "resultat"] as const).map((k) => {
              const farve = k === "omsaetning" ? "hsl(var(--hb-evergreen))" : "hsl(var(--hb-ink))";
              return (
                <Fragment key={k}>
                  <Area type="monotone" dataKey={k} stroke={farve} strokeWidth={2} fill={k === "omsaetning" ? "url(#vgrad-omsaetning)" : "none"} dot={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey={`${k}${ESTIMAT_NOEGLE_SUFFIX}`} stroke={farve} strokeWidth={2} strokeDasharray="1 4" strokeLinecap="round" fill="none" dot={false} isAnimationActive={false} />
                </Fragment>
              );
            })}
            {harBudget && (
              <Line type="monotone" dataKey="budget" stroke="hsl(var(--hb-rust))" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={false} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {harEstimater && <p className="mt-2 text-xs text-hb-ink-soft">Prikket linje — {ESTIMAT_FORKLARING}</p>}
    </div>
  );
};

/** Svaret fra generate-ai-forecast: tre perioder, lineær trend på facts
    med data_basis = measured. Eller `insufficient_data` under tre måneder. */
type ForecastPunkt = { period_key: string; period_label: string; revenue: number | null; ebt: number | null };

// ── Blok 4: Chatten — én tråd i fuld højde ──────────────────────────────

/** §3.4/§4 blok 4: samme tråd og samme skrivevej som /chat, via
    CompanyChatPanes valgfri `laastTilCompanyId` (Jonas 4/9) — ingen ny
    chatkomponent. FULD HØJDE uden skal-ændring: siden ligger i Hb-skallens
    side-variant (indholdskolonnen scroller; `layout="fuld"` ville binde HELE
    sidens højde og tage scrollet fra blok 1-7). Derfor får blokken selv
    viewport-højde minus skallens topbar/luft, og CompanyChatPane
    (`flex flex-1 min-h-0`, ingen egen højde) fylder wrapperen — samme
    højdekæde som AppLayout fullscreen giver den på /chat. Udtrykket
    indeni er chattens gamle (glass-card, appens tokens) — konverteringen
    til Hb er ikke denne etape. */
const Blok4 = ({ d }: { d: VirksomhedsData }) => {
  // Samtalestatus + «Tildelt» over chatten (MemberDetail:924-950, samme fire
  // tilstande). Samtalen er den med seneste besked; flere pr. virksomhed er
  // muligt. Rådgiverens navn kommer fra hookens raadgiverNavne — ingen ny
  // query. Rolig tone: ingen rust; «afventer rådgiver» er en tilstand, og
  // blok 1 bærer allerede signalet.
  const samtale = [...d.samtaler].sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""))[0] ?? null;
  const status = !samtale
    ? "Ingen samtale"
    : samtale.awaiting_reply_from === "advisor"
      ? "Afventer rådgiver"
      : samtale.awaiting_reply_from === "company"
        ? "Afventer medlem"
        : "Åben";
  const tildelt = samtale?.assigned_advisor_id ? d.raadgiverNavne[samtale.assigned_advisor_id] ?? null : null;
  return (
    <HbSection eyebrow="Chatten" hairline className="mt-12">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
        <HbTag className={cn("px-2 py-0.5 text-[11px]", samtale ? "border border-hb-line bg-hb-paper text-hb-ink" : "bg-hb-line/60 text-hb-ink-soft")}>{status}</HbTag>
        {samtale && (
          <span className="text-hb-ink-soft">
            Tildelt: <span className="text-hb-ink">{tildelt ?? "ingen"}</span>
          </span>
        )}
      </div>
      <div className="flex h-[calc(100dvh-10rem)] min-h-[520px] flex-col overflow-hidden rounded-hb border border-hb-line">
        <CompanyChatPane laastTilCompanyId={d.company.id} />
      </div>
    </HbSection>
  );
};

const Blok5 = ({ d, facts }: { d: VirksomhedsData; facts: CompanyFact[] }) => {
  // deriveKpiMetrics er den rene, testede dom fra /kpis: tal, formatering
  // og M/M — M/M er allerede gated med momErGyldig INDE i den (kpiDefs:111),
  // så changePct er null når en af de to seneste er et estimat. Benchmarks
  // er ikke blok 5's ærinde (ingen brancheprik her) — tom map.
  const metrics = useMemo(() => deriveKpiMetrics(facts, d.kpiMaal, {}), [facts, d.kpiMaal]);
  // Forecast — på en knap, aldrig ved sidevisning (samme regel som
  // sessionsforberedelsen i blok 2). Kaldet er MemberDetail:1285-1289.
  const [forecast, setForecast] = useState<ForecastPunkt[] | null>(null);
  const [forecastBesked, setForecastBesked] = useState<string | null>(null);
  const [henterForecast, setHenterForecast] = useState(false);
  const seneste = facts[facts.length - 1] ?? null;
  const tier = computeMembershipTier({
    contract_end_date: d.company.contract_end_date,
    subscription_status: d.company.subscription_status,
    subscription_current_period_end: d.company.subscription_current_period_end,
  });

  const hentForecast = async () => {
    if (henterForecast) return;
    setHenterForecast(true);
    setForecastBesked(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-ai-forecast", {
        body: { company_id: d.company.id },
      });
      if (!error && Array.isArray(data?.forecast)) {
        setForecast(data.forecast as ForecastPunkt[]);
      } else if (data?.error === "insufficient_data") {
        setForecastBesked(`Forecastet kræver mindst ${data.months_needed ?? 3} målte måneder.`);
      } else {
        setForecastBesked("Forecastet kunne ikke laves lige nu. Prøv igen om lidt.");
      }
    } catch {
      setForecastBesked("Forecastet kunne ikke laves lige nu. Prøv igen om lidt.");
    } finally {
      setHenterForecast(false);
    }
  };
  if (!seneste) {
    return (
      <HbSection eyebrow="Tallene" hairline className="mt-12">
        <p className="text-sm text-hb-ink-soft">Ingen committede tal endnu.</p>
      </HbSection>
    );
  }
  // data_basis-kontrakten: et estimeret punkt SKAL mærkes. Seneste periode
  // vises med EstimatMaerke når data_basis er 'estimated' (samme mærke som
  // NoegletalView:1002); M/M-linjen forklarer hvorfor den er tom.
  const senesteErEstimat = seneste.data_basis === "estimated";
  const momGyldig = momErGyldig(facts);
  // «Afviger» = målet er ikke nået (deriveKpiTone: tone attention) ELLER
  // M/M går den forkerte vej (trend down — kun sat når M/M er gyldig).
  // Afvigende først, resten i KPI_DEFS' rækkefølge. Ikke en fuld
  // nøgletalsflade — den findes på /kpis.
  const sorteret = [...metrics]
    .map((m) => {
      const def = KPI_DEFS.find((k) => k.key === m.key)!;
      const tone = deriveKpiTone({ actual: m.numValue, target: m.targetNum > 0 ? m.targetNum : null, lowerIsBetter: def.lowerIsBetter });
      return { m, afviger: tone.tone === "attention" || m.trend === "down" };
    })
    .sort((a, b) => Number(b.afviger) - Number(a.afviger));
  const antalAfviger = sorteret.filter((s) => s.afviger).length;
  const bank = factsToDanishMetrics(seneste.metrics).bank_balance ?? null;

  return (
    <HbSection eyebrow="Tallene" hairline className="mt-12">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm text-hb-ink">
          Seneste periode: <span className="font-medium">{seneste.period_label}</span>
        </p>
        {senesteErEstimat && <EstimatMaerke />}
        <p className="text-sm text-hb-ink-soft">
          {antalAfviger === 0 ? "Ingen afvigelser fra mål eller sidste måned." : `${antalAfviger} ${antalAfviger === 1 ? "afvigelse" : "afvigelser"} fremhævet.`}
        </p>
      </div>
      {facts.length >= 2 && !momGyldig && (
        <p className="mt-1 text-xs text-hb-ink-soft">M/M er ikke beregnet: en af de to seneste perioder er et estimat.</p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {sorteret.map(({ m, afviger }) => (
          <KpiKort key={m.key} metric={m} afviger={afviger} />
        ))}
      </div>
      {bank != null && (
        <p className={cn("mt-3 text-sm", bank < 0 ? "text-hb-rust" : "text-hb-ink-soft")}>
          Bank {formatKr(bank * 100)}{senesteErEstimat ? " (estimat)" : ""}
        </p>
      )}

      <FinansielUdvikling d={d} facts={facts} />

      {/* 3-måneders forecast — kortene som MemberDetail:1294-1305, i Hb-udtryk. */}
      <div className="mt-6">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <HbButton type="button" variant="secondary" className="h-9 px-4 text-sm" onClick={hentForecast} disabled={henterForecast}>
            {henterForecast ? "Regner…" : forecast ? "Regn forecastet igen" : "Generer 3-måneders forecast"}
          </HbButton>
          {forecastBesked && <p className="text-sm text-hb-ink-soft">{forecastBesked}</p>}
        </div>
        {forecast && (
          <div className="mt-3 grid grid-cols-3 gap-3">
            {forecast.map((f) => (
              <div key={f.period_key} className="rounded-hb border border-hb-line bg-hb-paper p-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{f.period_label}</p>
                <p className="mt-1 text-sm text-hb-ink">Omsætning {f.revenue != null ? formatKr(f.revenue * 100) : "—"}</p>
                <p className="text-sm text-hb-ink">Resultat {f.ebt != null ? formatKr(f.ebt * 100) : "—"}</p>
              </div>
            ))}
            <p className="col-span-3 text-xs text-hb-ink-soft">Lineær trend på de målte måneder — ikke en garanti.</p>
          </div>
        )}
      </div>

      {/* AI-sparring mod ai-data-chat — samme gate som MemberDetail:1362:
          committede tal findes (vi er forbi `!seneste`-returnen) og tier
          er ikke udløbet. Komponenten henter og streamer selv. */}
      {tier !== "expired" && (
        <div className="mt-6">
          <AdvisorAIChat companyId={d.company.id} companyName={d.company.name} />
        </div>
      )}
    </HbSection>
  );
};

// ── Blok 6: Aktivitet — kort, uden svigt ────────────────────────────────

/** Rapportstatus i ord — samme tilstande som MemberDetails liste, roligere
    tone (ingen alarm: rapport-error er en tilstand, ikke en dom over dem). */
const RAPPORT_STATUS: Record<string, string> = {
  processed: "Behandlet",
  processing: "Behandles",
  needs_manual_entry: "Mangler manuel indtastning",
  error: "Fejl i behandling",
};

type Rapport = VirksomhedsData["rapporter"][number];
type Kommentar = VirksomhedsData["rapportKommentarer"][number];

/** Rapportens tilstand som badge — SAMME fem tilstande som MemberDetail:
    1478-1486 (Committed vinder over status), i Hb-udtryk og rolig tone:
    intet er rødt, «Fejl i behandling» er en tilstand, ikke en dom. */
const rapportBadge = (r: Rapport, committed: boolean): { tekst: string; klasse: string } => {
  if (committed) return { tekst: "Committed", klasse: "bg-hb-sage text-hb-ink" };
  if (r.status === "needs_manual_entry") return { tekst: "Indtast tal manuelt", klasse: "border border-hb-line bg-hb-paper text-hb-ink-soft" };
  if (r.status === "processed") return { tekst: "Afventer godkendelse", klasse: "border border-hb-line bg-hb-paper text-hb-ink" };
  if (r.status === "processing") return { tekst: "Behandles", klasse: "border border-hb-line bg-hb-paper text-hb-ink-soft" };
  if (r.status === "error") return { tekst: "Fejl i behandling", klasse: "border border-hb-line bg-hb-paper text-hb-ink-soft" };
  return { tekst: RAPPORT_STATUS[r.status] ?? r.status, klasse: "border border-hb-line bg-hb-paper text-hb-ink-soft" };
};

/** De seks nøgletal MemberDetails renderExtractedData (575-638) viser,
    med ▲▼ mod forrige fact. Tallene læses fra FACTS via source_report_id —
    ikke fra rapportens egne jsonb-stier (useCompanyFacts.ts:53 bærer
    source_report_id, så hooken henter ingen talstier). Bank og egenkapital
    kun når de findes. Pilene er ink, ikke rust: et fald er et tal, ikke en
    afvigelse — afvigelser dømmes i blok 1 og 5. */
const RapportTal = ({ fact, forrige }: { fact: CompanyFact; forrige: CompanyFact | null }) => {
  const kf = factsToDanishMetrics(fact.metrics);
  const pk = forrige ? factsToDanishMetrics(forrige.metrics) : null;
  const kort: { label: string; v: number | undefined; p: number | undefined }[] = [
    { label: "Omsætning", v: kf.omsaetning, p: pk?.omsaetning },
    { label: "Dækningsbidrag", v: kf.daekningsbidrag, p: pk?.daekningsbidrag },
    { label: "Lønninger", v: kf.loenninger, p: pk?.loenninger },
    { label: "Resultat f. skat", v: kf.resultat_foer_skat, p: pk?.resultat_foer_skat },
    ...(kf.bank_balance != null ? [{ label: "Bank", v: kf.bank_balance, p: pk?.bank_balance }] : []),
    ...(kf.egenkapital != null ? [{ label: "Egenkapital", v: kf.egenkapital, p: pk?.egenkapital }] : []),
  ];
  const pil = (v?: number, p?: number) => {
    if (v == null || p == null || p === 0) return null;
    const pct = ((v - p) / Math.abs(p)) * 100;
    return `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)} %`;
  };
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {kort.map((k) => (
        <div key={k.label} className="rounded-hb border border-hb-line bg-hb-paper p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{k.label}</p>
          <p className="mt-1 text-sm text-hb-ink">{k.v != null ? formatKr(k.v * 100) : "—"}</p>
          {pk && pil(k.v, k.p) && <p className="text-xs text-hb-ink-soft">{pil(k.v, k.p)} mod {forrige!.period_label}</p>}
        </div>
      ))}
    </div>
  );
};

/** Én rapport, udfoldelig: badge, «Rettet», tal, godkend-link, original
    fil og kommentarer. Kommentar-skrivningen er ORDRET MemberDetails
    handleSubmitComment (539-568): samme messages-insert (message_type
    "user", context_type "report", context_id, context_meta.title) og
    samme notifyChatMessage bagefter, så kommentaren lander i chatten og
    udløser Slack + advisor_notifications som altid. Uden samtale
    (samtaleId null — de tre virksomheder uden medlemmer) skrives IKKE;
    det siges roligt, ingen fejl. */
const RapportRaekke = ({
  r, facts, kommentarer, samtaleId, medlemsnavne, aaben, onToggle,
}: {
  r: Rapport;
  facts: CompanyFact[];
  kommentarer: Kommentar[];
  samtaleId: string | null;
  medlemsnavne: Map<string, string>;
  aaben: boolean;
  onToggle: () => void;
}) => {
  const { user } = useAuth();
  const [tekst, setTekst] = useState("");
  const [sender, setSender] = useState(false);
  const [sendeFejl, setSendeFejl] = useState<string | null>(null);
  const [nye, setNye] = useState<Kommentar[]>([]);

  // Fact'et for denne rapport: source_report_id først (ejerskabet), ellers
  // samme periode-label — samme to opslag som MemberDetail:577-578.
  const idx = facts.findIndex((f) => f.source_report_id === r.id);
  const idx2 = idx >= 0 ? idx : facts.findIndex((f) => f.period_label === r.report_period);
  const fact = idx2 >= 0 ? facts[idx2] : null;
  const forrige = idx2 > 0 ? facts[idx2 - 1] : null;
  const committed = facts.some((f) => f.source_report_id === r.id);
  const badge = rapportBadge(r, committed);
  // «Rettet» = manuel override anvendt — hasManualOverride (financialUtils:111-113), inline fordi ReportData er en større type end rækken her.
  const rettet = r.manual_override_status === "applied";
  const alle = [...kommentarer, ...nye];
  const titel = r.manual_report_period_label ?? r.report_period ?? r.file_name;

  const sendKommentar = async () => {
    const content = tekst.trim();
    if (!content || !user || !samtaleId || sender) return;
    if (content.length > 2000) return;
    setSender(true);
    setSendeFejl(null);
    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: samtaleId,
        sender_id: user.id,
        content,
        message_type: "user",
        context_type: "report",
        context_id: r.id,
        context_meta: { title: r.file_name },
      } as any)
      .select("id, conversation_id, sender_id, content, context_id, created_at")
      .single();
    if (!error && data) {
      setNye((prev) => [...prev, data as Kommentar]);
      setTekst("");
      // Server-side: Slack + advisor notification — som MemberDetail:566.
      notifyChatMessage(data.id);
    } else {
      setSendeFejl("Kommentaren blev ikke sendt. Prøv igen.");
    }
    setSender(false);
  };

  return (
    <li id={`report-${r.id}`} className="scroll-mt-24 py-2 text-sm">
      <button type="button" onClick={onToggle} aria-expanded={aaben} className="w-full text-left">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-hb-ink">{titel}</span>
          <span className="shrink-0 text-xs text-hb-ink-soft">{formatDato(r.uploaded_at)}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <HbTag className={cn("px-2 py-0.5 text-[11px]", badge.klasse)}>{badge.tekst}</HbTag>
          {rettet && <HbTag className="border border-hb-line bg-hb-paper px-2 py-0.5 text-[11px] text-hb-ink-soft">Rettet</HbTag>}
          {alle.length > 0 && <span className="text-xs text-hb-ink-soft">{alle.length} {alle.length === 1 ? "kommentar" : "kommentarer"}</span>}
          <span className="ml-auto text-xs text-hb-ink-soft">{aaben ? "Fold sammen" : "Fold ud"}</span>
        </div>
      </button>

      {aaben && (
        <div className="mt-3 space-y-4 border-t border-hb-line pt-3">
          {fact ? (
            <RapportTal fact={fact} forrige={forrige} />
          ) : (
            <p className="text-sm text-hb-ink-soft">Ingen godkendte tal for denne rapport endnu.</p>
          )}

          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-hb-ink-soft">
            {r.status === "processed" && !committed && (
              <Link to="/admin/review-queue" className="text-hb-evergreen underline-offset-4 hover:underline">Godkend rapport →</Link>
            )}
            {r.file_path && !isLegacyPath(r.file_path) && (
              <button type="button" onClick={() => openReportFile(r.file_path)} className="text-hb-evergreen underline-offset-4 hover:underline">
                Se original fil
              </button>
            )}
            {r.processed_at && <span>Behandlet {formatDato(r.processed_at)}</span>}
          </p>

          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Kommentarer</p>
            {alle.length > 0 && (
              <ul className="mt-2 space-y-2">
                {alle.map((k) => (
                  <li key={k.id} className="rounded-hb bg-hb-paper p-3">
                    <p className="whitespace-pre-wrap break-words text-sm text-hb-ink">{k.content}</p>
                    <p className="mt-1 text-xs text-hb-ink-soft">
                      {k.sender_id === user?.id ? "Du" : medlemsnavne.get(k.sender_id) ?? "Medlem"} · {formatDato(k.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {samtaleId ? (
              <div className="mt-2 flex gap-2">
                <textarea
                  value={tekst}
                  onChange={(e) => setTekst(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendKommentar(); }
                  }}
                  placeholder="Skriv en kommentar — den lander i chatten"
                  maxLength={2000}
                  rows={1}
                  className="flex-1 resize-none rounded-hb border border-hb-line bg-hb-surface px-3 py-2 text-sm text-hb-ink placeholder:text-hb-ink-soft/60 focus:outline-none focus:ring-2 focus:ring-hb-evergreen/40"
                />
                <HbButton type="button" variant="secondary" className="h-9 px-4 text-sm" onClick={() => void sendKommentar()} disabled={sender || !tekst.trim()}>
                  {sender ? "Sender…" : "Send"}
                </HbButton>
              </div>
            ) : (
              <p className="mt-2 text-sm text-hb-ink-soft">Kommentarer kræver en samtale — virksomheden har ingen endnu.</p>
            )}
            {sendeFejl && <p className="mt-1 text-xs text-hb-ink-soft">{sendeFejl}</p>}
          </div>
        </div>
      )}
    </li>
  );
};

const Blok6 = ({
  d, facts, startAabenRapport, onAabnHandout,
}: {
  d: VirksomhedsData;
  facts: CompanyFact[];
  /** ?reportId fra URL'en (deep-link, MemberDetail-mønstret): rapporten
      foldes ud og rulles ind ved første render. */
  startAabenRapport: string | null;
  /** Åbn et handout i læse-tilstand; null når der intet medlem er at åbne
      det for (HandoutDetail er nøglet på user_id). */
  onAabnHandout: ((modul: HandoutModule) => void) | null;
}) => {
  /* Designets §4 blok 6: nogle skriver meget og ser lidt video, andre gør
     det modsatte — begge dele er i orden. Derfor: tal og datoer i ink/ink-
     soft, INGEN rust, ingen «mangler». Tomme tilstande siger hvad der er,
     ikke hvad der burde være.
     Akademi er IKKE med: member_progress er nøglet på user_id alene (ingen
     company_id), og opslaget pr. medlem er ikke besluttet (useVirksomhed,
     filhovedet). Blokken viser rapportering, handouts og milestones.

     RAPPORTLISTEN (4/9): hele listen med udfoldning, badges og kommentarer
     kunne gøre blokken til en mur. VALGT: rapporterne får deres eget
     afsnit UNDER de tre korte kort — ikke inde i «Rapportering»-kortet —
     og listen er FOLDET SAMMEN efter de tre nyeste med «Vis alle N». De
     tre kort bliver ved med at være et øjebliks skim; rapportarbejdet
     (udfold, kommentér, godkend) ligger lige under, når man vil det. */
  // Deep-link ?reportId: start udfoldet, og fold hele listen ud hvis
  // rapporten ligger under de tre nyeste — ellers kan den ikke rulles til.
  const dybRapportFindes = !!startAabenRapport && d.rapporter.some((r) => r.id === startAabenRapport);
  const [visAlle, setVisAlle] = useState(
    () => dybRapportFindes && d.rapporter.findIndex((r) => r.id === startAabenRapport) >= 3,
  );
  const [aabenRapport, setAabenRapport] = useState<string | null>(() => (dybRapportFindes ? startAabenRapport : null));
  // Rul til og fremhæv den deep-linkede rapport efter første render —
  // samme greb som MemberDetail:288-300, ring i evergreen frem for primary.
  useEffect(() => {
    if (!dybRapportFindes) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`report-${startAabenRapport}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-hb-evergreen", "ring-offset-2", "rounded-hb");
      setTimeout(() => el.classList.remove("ring-2", "ring-hb-evergreen", "ring-offset-2", "rounded-hb"), 2500);
    }, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const senesteRapport = d.rapporter[0] ?? null;
  const senesteCommittet = facts[facts.length - 1] ?? null;
  const fulgte = d.handouts.filter((h) => h.status === "completed").length;
  const handoutByModule = new Map(d.handouts.map((h) => [h.module, h]));
  const aktive = d.milestones.filter((m) => m.status !== "completed" && m.status !== "parked");
  const naaede = d.milestones.filter((m) => m.status === "completed").length;
  // Samtalen kommentarer skrives i: den med seneste besked (flere er
  // muligt pr. virksomhed). null = ingen samtale → der skrives ikke.
  const samtaleId = [...d.samtaler].sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""))[0]?.id ?? null;
  const kommentarerByRapport = new Map<string, Kommentar[]>();
  for (const k of d.rapportKommentarer) {
    if (!k.context_id) continue;
    const liste = kommentarerByRapport.get(k.context_id) ?? [];
    liste.push(k);
    kommentarerByRapport.set(k.context_id, liste);
  }
  const medlemsnavne = new Map(d.medlemmer.map((m) => [m.user_id, m.full_name]));
  const viste = visAlle ? d.rapporter : d.rapporter.slice(0, 3);
  const committede = facts.filter((f) => d.rapporter.some((r) => r.id === f.source_report_id)).length;

  return (
    <HbSection eyebrow="Aktivitet" hairline className="mt-12">
      <div className="grid gap-4 md:grid-cols-3">
        <HbCard className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">Rapportering</p>
          {d.rapporter.length === 0 ? (
            <p className="mt-3 text-sm text-hb-ink-soft">Ingen rapporter uploadet endnu.</p>
          ) : (
            <>
              <p className="mt-3 text-sm text-hb-ink">
                {d.rapporter.length} {d.rapporter.length === 1 ? "rapport" : "rapporter"}
                {committede > 0 && <span className="text-hb-ink-soft"> · {committede} godkendt</span>}
              </p>
              {senesteCommittet && <p className="mt-1 text-sm text-hb-ink-soft">Seneste godkendte periode {senesteCommittet.period_label}</p>}
              {senesteRapport && <p className="mt-1 text-sm text-hb-ink-soft">Seneste upload {formatDato(senesteRapport.uploaded_at)}</p>}
            </>
          )}
        </HbCard>

        <HbCard id="section-handouts" className="scroll-mt-24 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">Handouts</p>
          <p className="mt-3 text-sm text-hb-ink">{fulgte} af {moduleOrder.length} fulgt</p>
          <ul className="mt-3 divide-y divide-hb-line">
            {moduleOrder.map((modul: HandoutModule) => {
              const h = handoutByModule.get(modul);
              const tilstand = !h ? "Ikke startet" : h.status === "completed" ? `Fulgt${h.completed_at ? ` ${formatDato(h.completed_at)}` : ""}` : "I gang";
              return (
                <li key={modul} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                  <span className="min-w-0 truncate text-hb-ink">{handoutConfigs[modul]?.title ?? modul}</span>
                  <span className="flex shrink-0 items-baseline gap-2 text-xs text-hb-ink-soft">
                    {tilstand}
                    {/* «Åbn» i læse-tilstand (MemberDetail:1451 → HandoutDetail
                        med userId ≠ egen → isOwner=false, alt disabled).
                        Skjult når der intet medlem er at åbne det for. */}
                    {onAabnHandout && (
                      <button type="button" onClick={() => onAabnHandout(modul)} className="text-hb-evergreen underline-offset-4 hover:underline">
                        Åbn
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </HbCard>

        <HbCard id="section-milestones" className="scroll-mt-24 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">Milestones</p>
          {d.milestones.length === 0 ? (
            <p className="mt-3 text-sm text-hb-ink-soft">Ingen milestones endnu.</p>
          ) : (
            <>
              <p className="mt-3 text-sm text-hb-ink">
                {aktive.length} {aktive.length === 1 ? "aktiv" : "aktive"}
                {naaede > 0 && <span className="text-hb-ink-soft"> · {naaede} nået</span>}
              </p>
              <ul className="mt-3 divide-y divide-hb-line">
                {aktive.slice(0, 4).map((m) => (
                  <li key={m.id} className="py-1.5 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-hb-ink">{m.title}</span>
                      <span className="shrink-0 text-xs text-hb-ink-soft">{m.deadline ? formatDato(m.deadline) : "Ingen frist"}</span>
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-hb-sage/60">
                      <span className="block h-1 rounded-full bg-hb-evergreen" style={{ width: `${Math.max(0, Math.min(100, m.progress ?? 0))}%` }} aria-hidden />
                    </div>
                  </li>
                ))}
              </ul>
              {aktive.length > 4 && <p className="mt-2 text-xs text-hb-ink-soft">+{aktive.length - 4} flere</p>}
            </>
          )}
        </HbCard>
      </div>

      {/* Rapporterne — eget afsnit under kortene, foldet efter de tre nyeste. */}
      {d.rapporter.length > 0 && (
        <HbCard id="section-reports" className="mt-4 scroll-mt-24 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">Rapporter</p>
            {d.rapporter.length > 3 && (
              <button type="button" onClick={() => setVisAlle((v) => !v)} className="text-sm text-hb-evergreen underline-offset-4 hover:underline">
                {visAlle ? "Vis de tre nyeste" : `Vis alle ${d.rapporter.length}`}
              </button>
            )}
          </div>
          <ul className="mt-2 divide-y divide-hb-line">
            {viste.map((r) => (
              <RapportRaekke
                key={r.id}
                r={r}
                facts={facts}
                kommentarer={kommentarerByRapport.get(r.id) ?? []}
                samtaleId={samtaleId}
                medlemsnavne={medlemsnavne}
                aaben={aabenRapport === r.id}
                onToggle={() => setAabenRapport(aabenRapport === r.id ? null : r.id)}
              />
            ))}
          </ul>
        </HbCard>
      )}

      {/* Leveringsoverblik (MemberDetail:1646-1649) — komponenten UÆNDRET,
          MemberDetail bruger den også. committedReportIds fra facts via
          source_report_id, så «Afventer godkendelse» skelnes fra leveret.
          Den tegner i appens tokens (glass-card) — samme accepterede skift
          som de øvrige monterede komponenter. Returnerer null uden rapporter. */}
      {d.rapporter.length > 0 && (
        <div className="mt-4">
          <DeliveryOverview reports={d.rapporter} committedReportIds={new Set(facts.map((f) => f.source_report_id))} />
        </div>
      )}
    </HbSection>
  );
};

// ── Blok 7: Aftalen ─────────────────────────────────────────────────────

/** «Fjern medlem» pr. medlem (§3.6-handling, 4/9). Dommen er
    maaFjerneMedlem (admin OG ikke owner — serveren afviser en owner med
    403, så knappen vises ikke for en). Kaldet er manage-advisor
    remove-member, som MemberDetail:331-335. Teksten siger sandheden:
    kaldet sletter company_members, profiles OG auth-brugeren
    (manage-advisor:312-328) — mennesket, ikke bare medlemskabet.
    Efter succes AWAITes hookens invalider FØR dialogen lukkes
    (EditCompanyDialog-fælden, OVERLEVERING DEL 4). */
const FjernMedlem = ({ medlem, onFjernet }: { medlem: { user_id: string; full_name: string; email: string | null }; onFjernet: () => Promise<void> }) => {
  const [aaben, setAaben] = useState(false);
  const [fjerner, setFjerner] = useState(false);
  const fjern = async () => {
    if (fjerner) return;
    setFjerner(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("manage-advisor", {
        body: { action: "remove-member", target_user_id: medlem.user_id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await onFjernet();
      setAaben(false);
      toast.success("Medlemmet er fjernet", { description: `${medlem.full_name} er slettet fra platformen.` });
    } catch (err) {
      toast.error("Kunne ikke fjerne medlemmet", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setFjerner(false);
    }
  };
  return (
    <AlertDialog open={aaben} onOpenChange={(o) => { if (!fjerner) setAaben(o); }}>
      <button type="button" onClick={() => setAaben(true)} className="shrink-0 text-xs text-hb-rust underline-offset-4 hover:underline">
        Fjern medlem
      </button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Slet {medlem.full_name} fra platformen?</AlertDialogTitle>
          <AlertDialogDescription>
            «Fjern medlem» sletter brugeren{medlem.email ? ` (${medlem.email})` : ""} — ikke bare medlemskabet af virksomheden.
            Kontoen, profilen og adgangen forsvinder, og det kan ikke fortrydes. Virksomheden og dens tal bliver stående.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={fjerner}>Annuller</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); void fjern(); }} disabled={fjerner} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {fjerner ? "Sletter…" : "Slet brugeren"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const Blok7 = ({ d, onOpdateret }: { d: VirksomhedsData; onOpdateret: () => Promise<void> }) => {
  const c = d.company;
  const { isAdmin } = useAuth();
  // «Rediger virksomhedsdata» — kun admin, som MemberDetail:953. Dialogen
  // er delt (EditCompanyDialog, urørt) og har én rækkefølge ved gem:
  // onOpenChange(false) FØRST, derefter onSaved (EditCompanyDialog.tsx:112-113).
  // Fælden i OVERLEVERING DEL 4: lukkes dialogen før tilstanden er hentet,
  // viser fladen det gamle i et render. Derfor holdes lukningen tilbage:
  // onOpenChange(false) sætter kun et ønske og afgør det i en microtask —
  // når onSaved er kaldt i samme tick, venter vi på hookens invalidering og
  // lukker først når den er færdig. Annullér/Esc (ingen onSaved) lukker
  // straks i microtasken.
  const [redigerer, setRedigerer] = useState(false);
  const gemmer = useRef(false);
  const lukDialog = (open: boolean) => {
    if (open) { setRedigerer(true); return; }
    queueMicrotask(() => { if (!gemmer.current) setRedigerer(false); });
  };
  const efterGem = () => {
    gemmer.current = true;
    void (async () => {
      try {
        await onOpdateret();
      } finally {
        gemmer.current = false;
        setRedigerer(false);
      }
    })();
  };
  const tier = computeMembershipTier({
    contract_end_date: c.contract_end_date,
    subscription_status: c.subscription_status,
    subscription_current_period_end: c.subscription_current_period_end,
  });
  const fornyelse = afgoerFornyelsestilstand({
    contract_end_date: c.contract_end_date,
    subscription_status: c.subscription_status,
    subscription_current_period_end: c.subscription_current_period_end,
    beslutning: (d.fornyelse?.beslutning as Fornyelsesbeslutning | undefined) ?? null,
  });
  const indgang = d.betalingslink
    ? afgoerBetalingsfrist({
        prisniveau_oere: d.betalingslink.prisniveau_oere,
        underskrevet_at: d.betalingslink.underskrevet_at,
        betalingsmail_sendt_at: d.betalingslink.betalingsmail_sendt_at,
        sidste_paamindelse_dag: d.betalingslink.sidste_paamindelse_dag,
        contract_end_date: c.contract_end_date,
      })
    : null;
  // Prisniveau: indgangens pris når den findes, ellers virksomhedens egne
  // felter (indgangspris_oere / fornyelsespris_oere).
  const prisniveau = d.betalingslink?.prisniveau_oere ?? c.indgangspris_oere ?? null;
  const fejlede = d.traek.filter((t) => t.status === "fejlet");
  const fejletBadge = traekBadgeTekst(fejlede);
  const afventende = d.invitationer.filter((i) => i.status === "pending");

  return (
    <HbSection eyebrow="Aftalen" hairline className="mt-12">
      <div className="grid gap-4 md:grid-cols-2">
        <HbCard className="p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">Kontrakt</p>
            {isAdmin && (
              <button type="button" onClick={() => setRedigerer(true)} className="text-sm text-hb-evergreen underline-offset-4 hover:underline">
                Rediger virksomhedsdata
              </button>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <TierBadge tier={tier} kontraktSlut={c.contract_end_date} />
            <HbTag className="bg-hb-paper border border-hb-line px-2 py-0.5 text-[11px] text-hb-ink-soft">{FORNYELSE_LABEL[fornyelse.status]}</HbTag>
            {indgang && indgang.status !== "betalt" && (
              <HbTag className="bg-hb-rust/10 px-2 py-0.5 text-[11px] text-hb-rust">{INDGANG_LABEL[indgang.status]}</HbTag>
            )}
            {fejletBadge && <HbTag className="bg-hb-rust/10 px-2 py-0.5 text-[11px] text-hb-rust">{fejletBadge}</HbTag>}
          </div>
          <div className="mt-3 divide-y divide-hb-line">
            <Linje label="Start">{formatDato(c.contract_start_date)}</Linje>
            <Linje label="Slut">{formatDato(c.contract_end_date)}</Linje>
            <Linje label="Prisniveau">{formatKr(prisniveau)}</Linje>
            {c.fornyelsespris_oere != null && <Linje label="Fornyelsespris">{formatKr(c.fornyelsespris_oere)}</Linje>}
            {c.subscription_status && <Linje label="Abonnement">{c.subscription_status}{c.subscription_current_period_end ? ` · til ${formatDato(c.subscription_current_period_end)}` : ""}</Linje>}
            {d.betalingslink && <Linje label="Underskrevet">{formatDato(d.betalingslink.underskrevet_at)}</Linje>}
            {d.fornyelse && (
              <Linje label="Fornyelse">
                {d.fornyelse.beslutning === "tilbyd" ? "Tilbyd" : "Tilbyd ikke"} · {formatDato(d.fornyelse.besluttet_at)}
                {d.fornyelse.note && <span className="block text-xs text-hb-ink-soft">{d.fornyelse.note}</span>}
              </Linje>
            )}
          </div>
        </HbCard>

        <HbCard className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">Betaling</p>
          {d.perioder.length === 0 && d.traek.length === 0 ? (
            <p className="mt-3 text-sm text-hb-ink-soft">Ingen perioder eller træk registreret.</p>
          ) : (
            <div className="mt-3 divide-y divide-hb-line">
              {d.perioder.map((p) => (
                <Linje key={p.id} label={`${formatDato(p.periode_start)} – ${formatDato(p.periode_slut)}`}>
                  {formatKr(p.beloeb_oere)} · {BETALINGSMODEL_LABEL[p.betalingsmodel] ?? p.betalingsmodel} · {p.art}
                  {p.note && <span className="block text-xs text-hb-ink-soft">{p.note}</span>}
                </Linje>
              ))}
              {d.traek.map((t) => (
                <Linje key={t.stripe_invoice_id} label={t.faktura_nummer ? `Træk ${t.faktura_nummer}` : "Træk"}>
                  <span className={t.status === "fejlet" ? "text-hb-rust" : undefined}>
                    {beloebKr(t.beloeb_oere)} · {t.status}
                    {t.status === "fejlet" && kortDato(t.fejlet_at) ? ` ${kortDato(t.fejlet_at)}` : ""}
                    {t.status === "betalt" && kortDato(t.betalt_at) ? ` ${kortDato(t.betalt_at)}` : ""}
                  </span>
                  {t.status === "fejlet" && (
                    <span className="block text-xs text-hb-ink-soft">
                      {stripeSagde(t) ? `Stripe: ${stripeSagde(t)} · ` : ""}
                      {datoOgTid(t.naeste_forsoeg_at) ? `næste forsøg ${datoOgTid(t.naeste_forsoeg_at)}` : "ingen flere forsøg fra Stripe"}
                      {t.hosted_invoice_url && (
                        <>
                          {" · "}
                          <a href={t.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="text-hb-evergreen underline-offset-4 hover:underline">Faktura</a>
                        </>
                      )}
                    </span>
                  )}
                </Linje>
              ))}
            </div>
          )}
        </HbCard>

        <HbCard className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">Medlemmer</p>
          {d.medlemmer.length === 0 ? (
            // Gyldig tilstand, ikke en fejl (§3.3): virksomheden findes uden adgang.
            <p className="mt-3 text-sm text-hb-ink-soft">Ingen medlemmer endnu.</p>
          ) : (
            <ul className="mt-3 divide-y divide-hb-line">
              {d.medlemmer.map((m) => (
                <li key={m.user_id} className="flex items-center gap-3 py-2">
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full border border-hb-line object-cover" />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-hb-sage/40 text-sm text-hb-ink-soft">{m.full_name.charAt(0)}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-hb-ink">{m.full_name}</p>
                    <p className="truncate text-xs text-hb-ink-soft">{[m.email, m.role].filter(Boolean).join(" · ")}</p>
                  </div>
                  {maaFjerneMedlem(!!isAdmin, m.role) && <FjernMedlem medlem={m} onFjernet={onOpdateret} />}
                </li>
              ))}
            </ul>
          )}
        </HbCard>

        <HbCard className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">Invitationer</p>
          {d.invitationer.length === 0 ? (
            <p className="mt-3 text-sm text-hb-ink-soft">Ingen invitationer.</p>
          ) : (
            <ul className="mt-3 divide-y divide-hb-line">
              {d.invitationer.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-hb-ink">{i.email}</span>
                  <span className="shrink-0 text-xs text-hb-ink-soft">
                    {i.status === "pending" ? `Afventer · sendt ${formatDato(i.created_at)}` : i.status === "accepted" ? `Accepteret ${formatDato(i.accepted_at)}` : i.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {afventende.length > 0 && d.medlemmer.length === 0 && (
            <p className="mt-3 text-xs text-hb-ink-soft">Virksomheden har endnu ingen aktiv bruger — invitationen er ikke taget i brug.</p>
          )}
        </HbCard>
      </div>
      {isAdmin && (
        <EditCompanyDialog open={redigerer} onOpenChange={lukDialog} companyId={c.id} onSaved={efterGem} />
      )}
    </HbSection>
  );
};

// ── Siden ───────────────────────────────────────────────────────────────

export const VirksomhedView = ({ companyId }: { companyId: string | undefined }) => {
  const { data, facts, isLoading, isError, findesIkke, invalider } = useVirksomhed(companyId);

  /* DEEP-LINKS (4/9): 604 notifikationer i prod bærer ?reportId, 40 ?handout,
     6 ?section, og Slack-beskeder med absolutte URL'er er ude af huset.
     Siden læser derfor de tre parametre som MemberDetail (:201-229,
     :275-286) — én gang ved mount, derefter ryddes URL'en. Hooks i
     topblokken, før de betingede returns nedenfor. */
  const [searchParams, setSearchParams] = useSearchParams();
  const [dybRapport] = useState<string | null>(() => searchParams.get("reportId"));
  const [dybSektion] = useState<string | null>(() => searchParams.get("section"));
  const [aktivtHandout, setAktivtHandout] = useState<HandoutModule | null>(() => {
    const h = searchParams.get("handout") as HandoutModule | null;
    return h && moduleOrder.includes(h) ? h : null;
  });
  useEffect(() => {
    if (searchParams.has("handout") || searchParams.has("reportId") || searchParams.has("section")) {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ?section rulles først når blokkene er tegnet (data er inde) — ikke på
  // et fast tidsstempel som MemberDetails 400 ms.
  useEffect(() => {
    if (!dybSektion || !data || aktivtHandout) return;
    const timer = setTimeout(() => {
      document.getElementById(`section-${dybSektion}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => clearTimeout(timer);
  }, [dybSektion, data, aktivtHandout]);

  if (!companyId || findesIkke) {
    return (
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Virksomhed</p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">Virksomheden findes ikke.</h1>
        <p className="mt-3 text-sm text-hb-ink-soft">
          Der er ingen virksomhed med denne adresse. <Link to="/virksomheder" className="text-hb-evergreen underline-offset-4 hover:underline">Tilbage til listen</Link>
        </p>
      </section>
    );
  }
  if (isError) {
    return <p className="text-sm text-hb-rust">Virksomheden kunne ikke hentes. Prøv igen.</p>;
  }
  if (isLoading || !data) {
    return (
      <div aria-hidden>
        <div className="h-4 w-24 animate-pulse rounded bg-hb-line/60" />
        <div className="mt-4 h-10 w-2/3 animate-pulse rounded bg-hb-line/60" />
        <div className="mt-10 h-4 w-1/2 animate-pulse rounded bg-hb-line/40" />
      </div>
    );
  }

  const c = data.company;
  // Kontaktperson i underrubrikken: SAMME regel som virksomhedslisten
  // (Jonas 4/9) — owneren (profilens navn), ellers contact_person. Målt
  // 4/9 kl. 10:23: feltet er udfyldt på 4 af 30, owneren findes på 27.
  // Ét navn her, ikke medlemslisten — den står i blok 7 med roller.
  const ownerNavn = data.medlemmer.find((m) => m.role === "owner")?.full_name?.trim() || null;
  const kontaktperson = ownerNavn ?? (c.contact_person?.trim() || null);
  const metaLinje = [c.industry_label, c.cvr_number ? `CVR ${c.cvr_number}` : null, kontaktperson, c.contact_email].filter(Boolean).join(" · ");

  /* ÅBN HANDOUT i læse-tilstand — som MemberDetail:648-658 (HandoutDetail
     med userId ≠ egen → isOwner=false, alle felter disabled). HandoutDetail/
     loadHandout er nøglet på user_id, ikke company_id: vi giver rækkens
     egen ejer når handoutet er udfyldt, ellers virksomhedens første medlem
     (samme dom som foreslaa-opgave: første company_members-række). Uden
     medlem er der intet userId — så vises knappen ikke (onAabnHandout er
     null), og en ?handout-deep-link falder stille tilbage til siden. */
  const handoutUserId = (modul: HandoutModule): string | null =>
    data.handouts.find((h) => h.module === modul)?.user_id ?? data.medlemmer[0]?.user_id ?? null;
  const kanAabneHandout = data.medlemmer.length > 0 || data.handouts.length > 0;
  const aktivtHandoutUserId = aktivtHandout ? handoutUserId(aktivtHandout) : null;
  if (aktivtHandout && aktivtHandoutUserId) {
    return (
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
          <Link to="/virksomheder" className="underline-offset-4 hover:underline">Virksomheder</Link>
          <span className="text-hb-ink-soft"> · </span>
          <button type="button" onClick={() => setAktivtHandout(null)} className="underline-offset-4 hover:underline">{c.name}</button>
        </p>
        {/* HandoutDetail bærer sit gamle udtryk (appens tokens) — konverteringen er ikke denne etape. */}
        <div className="mt-6">
          <HandoutDetail config={handoutConfigs[aktivtHandout]} onBack={() => setAktivtHandout(null)} userId={aktivtHandoutUserId} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
          <Link to="/virksomheder" className="underline-offset-4 hover:underline">Virksomheder</Link>
        </p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">{c.name}</h1>
        {metaLinje && <p className="mt-3 text-sm text-hb-ink-soft">{metaLinje}</p>}
      </section>

      <div className="mt-10">
        <Blok1 d={data} facts={facts} />
      </div>
      <Blok2 d={data} />
      {/* Blok 3 kommer i en senere etape — rækkefølgen er designets. */}
      <Blok4 d={data} />
      <Blok5 d={data} facts={facts} />
      <Blok6
        d={data}
        facts={facts}
        startAabenRapport={dybRapport}
        onAabnHandout={kanAabneHandout ? setAktivtHandout : null}
      />
      <Blok7 d={data} onOpdateret={invalider} />
    </div>
  );
};
