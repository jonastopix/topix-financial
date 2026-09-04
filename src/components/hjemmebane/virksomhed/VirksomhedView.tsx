import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useVirksomhed, type VirksomhedsData } from "@/hooks/useVirksomhed";
import type { CompanyFact } from "@/hooks/useCompanyFacts";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { afgoerVirksomhedsSignaler, type FactPunkt, type Signal, type VirksomhedsInput } from "@/lib/virksomhedsSignaler";
import { computeMembershipTier, type MembershipTier } from "@/lib/membershipTier";
import { afgoerFornyelsestilstand, type FornyelseStatus, type Fornyelsesbeslutning } from "@/lib/fornyelse";
import { afgoerBetalingsfrist, type Betalingsfriststatus } from "@/lib/betalingsfrist";
import { beloebKr, kortDato, datoOgTid, stripeSagde, traekBadgeTekst } from "@/lib/traek";
import { KPI_DEFS, deriveKpiMetrics, type KpiMetric } from "@/lib/kpiDefs";
import { deriveKpiTone } from "../noegletal/kpiTone";
import { momErGyldig } from "@/lib/dataGrundlag";
import { handoutConfigs, moduleOrder, type HandoutModule } from "@/lib/handoutConfig";
import { openReportFile, isLegacyPath } from "@/lib/reportFileAccess";
import { DANISH_MONTHS } from "@/lib/financialUtils";
import { EstimatMaerke } from "../EstimatMaerke";
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
          <HbCard className="p-5">
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
  </div>
);

const Blok5 = ({ d, facts }: { d: VirksomhedsData; facts: CompanyFact[] }) => {
  // deriveKpiMetrics er den rene, testede dom fra /kpis: tal, formatering
  // og M/M — M/M er allerede gated med momErGyldig INDE i den (kpiDefs:111),
  // så changePct er null når en af de to seneste er et estimat. Benchmarks
  // er ikke blok 5's ærinde (ingen brancheprik her) — tom map.
  const metrics = useMemo(() => deriveKpiMetrics(facts, d.kpiMaal, {}), [facts, d.kpiMaal]);
  const seneste = facts[facts.length - 1] ?? null;
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

const Blok6 = ({ d, facts }: { d: VirksomhedsData; facts: CompanyFact[] }) => {
  /* Designets §4 blok 6: nogle skriver meget og ser lidt video, andre gør
     det modsatte — begge dele er i orden. Derfor: tal og datoer i ink/ink-
     soft, INGEN rust, ingen «mangler». Tomme tilstande siger hvad der er,
     ikke hvad der burde være.
     Akademi er IKKE med: member_progress er nøglet på user_id alene (ingen
     company_id), og opslaget pr. medlem er ikke besluttet (useVirksomhed,
     filhovedet). Blokken viser rapportering, handouts og milestones. */
  const senesteRapport = d.rapporter[0] ?? null;
  const senesteCommittet = facts[facts.length - 1] ?? null;
  const fulgte = d.handouts.filter((h) => h.status === "completed").length;
  const handoutByModule = new Map(d.handouts.map((h) => [h.module, h]));
  const aktive = d.milestones.filter((m) => m.status !== "completed" && m.status !== "parked");
  const naaede = d.milestones.filter((m) => m.status === "completed").length;

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
                {senesteCommittet && <span className="text-hb-ink-soft"> · seneste godkendte periode {senesteCommittet.period_label}</span>}
              </p>
              <ul className="mt-3 divide-y divide-hb-line">
                {d.rapporter.slice(0, 3).map((r) => (
                  <li key={r.id} className="py-2 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-hb-ink">{r.manual_report_period_label ?? r.report_period ?? r.file_name}</span>
                      <span className="shrink-0 text-xs text-hb-ink-soft">{formatDato(r.uploaded_at)}</span>
                    </div>
                    <p className="text-xs text-hb-ink-soft">
                      {RAPPORT_STATUS[r.status] ?? r.status}
                      {r.file_path && !isLegacyPath(r.file_path) && (
                        <>
                          {" · "}
                          <button type="button" onClick={() => openReportFile(r.file_path)} className="text-hb-evergreen underline-offset-4 hover:underline">
                            Se original fil
                          </button>
                        </>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
              {d.rapporter.length > 3 && <p className="mt-2 text-xs text-hb-ink-soft">+{d.rapporter.length - 3} ældre</p>}
            </>
          )}
          {senesteRapport && <p className="mt-2 text-xs text-hb-ink-soft">Seneste upload {formatDato(senesteRapport.uploaded_at)}</p>}
        </HbCard>

        <HbCard className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">Handouts</p>
          <p className="mt-3 text-sm text-hb-ink">{fulgte} af {moduleOrder.length} fulgt</p>
          <ul className="mt-3 divide-y divide-hb-line">
            {moduleOrder.map((modul: HandoutModule) => {
              const h = handoutByModule.get(modul);
              const tilstand = !h ? "Ikke startet" : h.status === "completed" ? `Fulgt${h.completed_at ? ` ${formatDato(h.completed_at)}` : ""}` : "I gang";
              return (
                <li key={modul} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                  <span className="min-w-0 truncate text-hb-ink">{handoutConfigs[modul]?.title ?? modul}</span>
                  <span className="shrink-0 text-xs text-hb-ink-soft">{tilstand}</span>
                </li>
              );
            })}
          </ul>
        </HbCard>

        <HbCard className="p-5">
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
    </HbSection>
  );
};

// ── Blok 7: Aftalen ─────────────────────────────────────────────────────

const Blok7 = ({ d }: { d: VirksomhedsData }) => {
  const c = d.company;
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
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">Kontrakt</p>
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
                  <div className="min-w-0">
                    <p className="truncate text-sm text-hb-ink">{m.full_name}</p>
                    <p className="truncate text-xs text-hb-ink-soft">{[m.email, m.role].filter(Boolean).join(" · ")}</p>
                  </div>
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
    </HbSection>
  );
};

// ── Siden ───────────────────────────────────────────────────────────────

export const VirksomhedView = ({ companyId }: { companyId: string | undefined }) => {
  const { data, facts, isLoading, isError, findesIkke } = useVirksomhed(companyId);

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
  const metaLinje = [c.industry_label, c.cvr_number ? `CVR ${c.cvr_number}` : null, c.contact_person, c.contact_email].filter(Boolean).join(" · ");
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
      {/* Blok 3 og 4 kommer i senere etaper — rækkefølgen er designets. */}
      <Blok5 d={data} facts={facts} />
      <Blok6 d={data} facts={facts} />
      <Blok7 d={data} />
    </div>
  );
};
