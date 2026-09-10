/** Tilstands-dommen for rapportkortene (rapportering-design §b): mapping
    fra rapportens server-tilstand (RP-1-felterne — financial_reports.status,
    committed-medlemskab i facts, get_report_commit_states) til kort-udtryk.
    REN funktion, så præsentationslogikken er testet — ikke spredt i JSX.
    Toner (Mola): quiet = ro; attention = hb-rust-accent uden alarm-flader;
    alert = tydelig men rolig alvor. Frontend DØMMER kun — den skriver
    aldrig status (A1-reglen bor i engine-laget). */

import { DANISH_MONTHS } from "@/lib/financialUtils";

export type CommitState = "not_ready" | "ready" | "update_available" | "blocked";

export interface ReportCardInput {
  status: string;
  isCommitted: boolean;
  commitState?: CommitState;
  stateReason?: string | null;
  /** Rapportens periode («YYYY-MM») — RPC'ens period_key, ellers den effektive
      nøgle fra rapporten. Bruges KUN til at skelne «for tidligt» fra de
      øvrige not_ready-grunde (se erForTidligt). */
  periodKey?: string | null;
  /** «Nu» som «YYYY-MM» — injiceres af tests; default er dags dato (lokal). */
  nowKey?: string;
  /** Grunden i medlemmets ord (rapportFejlgrund) — står på kortet efter
      label'en for error- og needs_manual_entry-kortene. null = ingen kendt grund. */
  fejlgrund?: string | null;
}

/**
 * Rapportkortets GRUND (10/9, recon-parseren §5f): «Kunne ikke behandles» stod
 * alene på kortet, og grunden lå i validation_errors — synlig først når
 * dialogen blev åbnet. Teksterne findes på serveren (danske siden #449, og
 * spænd-afvisningen fra #785); her vælges KUN de grunde der er skrevet til et
 * menneske, og de holdes korte: højst to sætninger, aldrig en tredje linje.
 * Tekniske strenge (checknavne, engelske fejl, «Unknown error») kommer aldrig
 * på kortet — der står label'en alene, og dialogen har detaljen som før.
 *
 * Kilderne i prioriteret orden: quality_signals.routing_branch (serverens egen
 * gren), så validation_errors (kolonnen; klienten skriver kun den), så
 * quality_signals.validation_errors (early-exit-veje skriver begge).
 */
export interface FejlgrundKilde {
  status?: string | null;
  validationErrors?: readonly string[] | null;
  qualityValidationErrors?: readonly string[] | null;
  routingBranch?: string | null;
}

const GRUND_MAKS = 120;

/** Højst `maksSaetninger` sætninger (default to), højst GRUND_MAKS tegn — en
    grund der fylder tre linjer på et kort er ikke bedre end ingen. Sætninger
    deles kun ved punktum/udråb/spørgsmål fulgt af STORT bogstav, så «pr. fil»
    og «fx.» ikke tæller. Serverens «— gør sådan»-hale efter en tankestreg
    klippes af hver sætning, så det der står, er hele sætninger:
    «Filen dækker 2 måneder (maj–juni 2026). Vi kan kun læse én måned ad gangen.» */
export function kortGrund(tekst: string, maksSaetninger = 2): string {
  const saetninger = tekst.trim().split(/(?<=[.!?])\s+(?=[A-ZÆØÅ])/u).filter(Boolean);
  const valgte = saetninger
    .slice(0, maksSaetninger)
    .map((sætning) => sætning.replace(/\s+[—–]\s+.*([.!?])$/u, "$1"));
  let ud = valgte.join(" ");
  if (ud.length > GRUND_MAKS) ud = `${ud.slice(0, GRUND_MAKS - 1).trimEnd()}…`;
  return ud;
}

export function rapportFejlgrund(kilde: FejlgrundKilde): string | null {
  const foerste = kilde.validationErrors?.[0] ?? kilde.qualityValidationErrors?.[0] ?? null;
  const gren = kilde.routingBranch ?? null;

  // 1) Filen dækker flere måneder (#785) — serverens danske tekst, forkortet.
  if (gren === "period_span_rejected" || (foerste && /^Filen dækker \d+ måneder/.test(foerste))) {
    return foerste ? kortGrund(foerste) : "Filen dækker flere måneder — vi kan kun læse én måned ad gangen.";
  }
  // 2) Perioden er ikke afsluttet (periode-gaten).
  if (gren === "period_not_completed" || foerste === "Periode ikke afsluttet") {
    return "Måneden er ikke afsluttet endnu — upload rapporten, når den er omme.";
  }
  // 3) Kendt kilde uden skabelon (#449) — «Filen er genkendt som en rapport fra …».
  if (gren === "known_source_unsupported_variant" || (foerste && /^Filen er genkendt som en rapport fra/.test(foerste))) {
    // Kun første sætning: den anden («Du kan indtaste tallene manuelt på
    // rapportkortet») siger det knappen «Indtast tallene» allerede siger.
    return foerste ? kortGrund(foerste, 1) : "Formatet understøttes ikke automatisk endnu — indtast tallene på kortet.";
  }
  // 4) Klientens egne, skrevet til et menneske eller med kendt betydning.
  if (foerste && /multi-sheet/i.test(foerste)) {
    return "Filen har flere ark (DATA + P&L Top Line) — upload ét ark med saldobalance eller resultatopgørelse.";
  }
  if (foerste && /password protected/i.test(foerste)) {
    return "PDF'en er beskyttet med adgangskode — eksportér den igen uden kode, eller upload en Excel-version.";
  }
  if (foerste && /^PDF structural extraction failed/.test(foerste)) {
    return "PDF'en kunne ikke læses — prøv at eksportere som Excel i stedet.";
  }
  if (foerste && /^Extraction timed out/.test(foerste)) {
    return "Behandlingen blev ikke færdig — prøv igen.";
  }
  // 5) Ingen grund gemt: cron-oprydningen (status error uden fejl) — det ENESTE
  //    tilfælde hvor kortet siger noget uden en gemt grund.
  if (kilde.status === "error" && !foerste) {
    return "Behandlingen blev ikke færdig — prøv igen.";
  }
  // 6) Alt andet (checknavne, engelske/tekniske strenge): ingen grund på kortet.
  return null;
}

/** Dags dato som «YYYY-MM» (lokal tid — samme dagbegreb som SQL'ens
    to_char(now(), 'YYYY-MM') på serverens ur; en times skævhed omkring
    månedsskiftet er ufarlig, fordi serveren stadig dømmer ved commit). */
export function nuSomPeriodeNoegle(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * «For tidligt» — regel 6 i resolve_report_commit_candidate: en rapport
 * for indeværende eller en fremtidig måned afvises med state 'not_ready'
 * og state_reason «Periode … er ikke afsluttet endnu — kan kun godkendes
 * efter månedens afslutning». RPC'en returnerer den SAMME period_key, og
 * ingen af de seks ANDRE not_ready-grunde (ikke fundet, slettet, status ≠
 * processed, ingen metrics, ingen mappable metrics, periode kan ikke
 * bestemmes) når frem til at sætte period_key — så «not_ready med en
 * period_key på eller efter denne måned» ER regel 6, uden at læse
 * teksten og uden at ændre SQL-funktionen (rettet 7/9).
 */
export function erForTidligt(periodKey: string | null | undefined, nowKey: string = nuSomPeriodeNoegle()): boolean {
  return typeof periodKey === "string" && /^\d{4}-\d{2}$/.test(periodKey) && periodKey >= nowKey;
}

/** Første dag EFTER perioden, som dansk dato: «2026-09» → «1. oktober 2026». */
export function foersteDagEfterPeriode(periodKey: string): string {
  const [aar, md] = periodKey.split("-").map((x) => parseInt(x, 10));
  const naesteMd = md === 12 ? 1 : md + 1;
  const naesteAar = md === 12 ? aar + 1 : aar;
  return `1. ${DANISH_MONTHS[naesteMd - 1].toLowerCase()} ${naesteAar}`;
}

export type CardAction = "review" | "override" | "upload" | "none";

export interface ReportCardView {
  key:
    | "processing"
    | "error"
    | "period_open"
    | "manual"
    | "awaiting"
    | "blocked"
    | "too_early"
    | "not_ready"
    | "committed"
    | "unknown";
  label: string;
  tone: "quiet" | "attention" | "alert";
  detail?: string;
  primary?: { label: string; action: CardAction };
  secondary?: { label: string; action: CardAction };
}

export function deriveReportCardView(input: ReportCardInput): ReportCardView {
  const { status, isCommitted, commitState, stateReason, periodKey, nowKey, fejlgrund } = input;

  // Rå status-tilstande dømmer først (error slår commitState — prioritet).
  if (status === "processing") {
    return { key: "processing", label: "Behandles…", tone: "quiet" };
  }
  if (status === "error") {
    return {
      key: "error",
      label: "Kunne ikke behandles",
      tone: "alert",
      // Grunden PÅ kortet (10/9) — «Kunne ikke behandles — Filen dækker 2 måneder …».
      detail: fejlgrund ?? undefined,
      primary: { label: "Prøv igen", action: "upload" },
      secondary: { label: "Indtast manuelt", action: "override" },
    };
  }
  if (status === "period_not_completed") {
    return {
      key: "period_open",
      label: "Perioden er ikke afsluttet endnu",
      tone: "attention",
      primary: { label: "Ret periode", action: "override" },
    };
  }
  if (status === "needs_manual_entry") {
    return {
      key: "manual",
      label: "Kræver manuel indtastning",
      tone: "attention",
      detail: fejlgrund ?? undefined,
      primary: { label: "Indtast tallene", action: "override" },
    };
  }

  if (status === "processed") {
    if (!isCommitted) {
      if (commitState === "blocked") {
        return {
          key: "blocked",
          label: "Kan ikke godkendes endnu",
          tone: "attention",
          detail: stateReason ?? undefined,
          primary: { label: "Se hvorfor", action: "review" },
        };
      }
      if (commitState === "not_ready" && erForTidligt(periodKey, nowKey)) {
        // Regel 6: perioden fejler IKKE — den er ikke omme endnu. Før stod her
        // «Perioden skal rettes først» med knappen «Ret periode», som bad
        // medlemmet rette noget rigtigt (og ville ødelægge en korrekt periode).
        // Ingen knapper: «Ret periode» er destruktiv her, og «Se tallene»
        // åbner review-dialogen, der siger «ikke klar» — færre knapper er
        // bedre end en forkert. Filnavn, dato og slet er stadig i det
        // udfoldede kort.
        return {
          key: "too_early",
          label: `Modtaget — kan godkendes fra ${foersteDagEfterPeriode(periodKey as string)}`,
          tone: "quiet",
          detail: "Tallene er læst og i orden. Måneden skal være omme, før de kan godkendes.",
        };
      }
      if (commitState === "not_ready") {
        return {
          key: "not_ready",
          label: "Perioden skal rettes først",
          tone: "attention",
          primary: { label: "Ret periode", action: "override" },
        };
      }
      return {
        key: "awaiting",
        label: "Klar til gennemsyn",
        tone: "attention",
        primary: { label: "Gennemgå og godkend", action: "review" },
      };
    }
    // 'update_available' fra get_report_commit_states er en EJERSKABS-
    // KAPABILITET (same_report → altid update_available), ikke en alarm —
    // maskinen sammenligner ikke metrics; gen-commit-flowet bor i
    // review-dialogen. Godkendte rapporter dømmes derfor ALTID stille.
    return {
      key: "committed",
      label: "Godkendt",
      tone: "quiet",
      secondary: { label: "Ret data", action: "override" },
    };
  }

  // Defensivt: ukendt tilstand dømmes stille og handlingsløst.
  return { key: "unknown", label: "Ukendt tilstand", tone: "quiet" };
}

/**
 * Godkend-vejens spærring (de nitten, punkt 4, 10/9). «Godkendt» aflæses af
 * facts (committedReportIds) — en ANDEN hentning end listen. Fejler den,
 * står alle godkendte rapporter som ugodkendte med «Gennemgå og godkend»,
 * og en ny godkendelse oveni er et klik væk. Så når facts ikke kunne
 * hentes, holdes de handlinger der kan ende i commit (review, override)
 * tilbage; upload/none rører ikke godkendelsen og lades stå.
 */
export function godkendSpaerret(action: CardAction, godkendelseUkendt: boolean): boolean {
  return godkendelseUkendt && (action === "review" || action === "override");
}
