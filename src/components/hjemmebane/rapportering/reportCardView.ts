/** Tilstands-dommen for rapportkortene (rapportering-design §b): mapping
    fra rapportens server-tilstand (RP-1-felterne — financial_reports.status,
    committed-medlemskab i facts, get_report_commit_states) til kort-udtryk.
    REN funktion, så præsentationslogikken er testet — ikke spredt i JSX.
    Toner (Mola): quiet = ro; attention = hb-rust-accent uden alarm-flader;
    alert = tydelig men rolig alvor. Frontend DØMMER kun — den skriver
    aldrig status (A1-reglen bor i engine-laget). */

import { DANISH_MONTHS } from "@/lib/financialUtils";
import { naesteSkridtTekst } from "@/lib/hjemmebane/rapporteringTekst";
import { afsluttedeMaanederTekstFoer } from "@/lib/maanedsnoegle";

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
  /** Næste skridt (rapportNaesteSkridt) — står under grunden på error- og
      needs_manual_entry-kortene. null = intet at sige. */
  naesteSkridt?: string | null;
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

export const GRUND_MAKS = 120;

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
  // 4b) Kontrollernes checknavne (14/9, mangellistens nr. 8): kun dem hvis
  //     betydning står i koden får en tekst — se KONTROL_GRUNDE.
  const kontrol = foerste ? kontrolGrund(foerste) : null;
  if (kontrol) return kontrol;
  // 5) Ingen grund gemt: cron-oprydningen (status error uden fejl) — det ENESTE
  //    tilfælde hvor kortet siger noget uden en gemt grund.
  if (kilde.status === "error" && !foerste) {
    return "Behandlingen blev ikke færdig — prøv igen.";
  }
  // 6) Alt andet (øvrige checknavne, engelske/tekniske strenge): ingen grund på kortet.
  return null;
}

/**
 * Kontrollernes grund (14/9). validation_errors er «navn: details»
 * (extract-financial-data:1407, canonicalEngine.runExtendedValidation) eller
 * «Kontrol af dokumentet — navn: details» (:1410, skabelonens egne checks).
 * Før 14/9 blev alle filtreret fra som teknik, så «gross_profit_sum:
 * MISMATCH: 95829.05 ≠ 96220.67» gav et kort med «Kræver manuel
 * indtastning» og ingen grund. Ordene er formularens («Ret data manuelt»,
 * reportOverrideHelpers.FIELD_LABELS: Omsætning, Direkte omkostninger,
 * Dækningsbidrag, Resultat f. skat, Aktiver i alt), så grunden peger på
 * felter medlemmet kan finde. Kun kontroller med belæg i koden står her;
 * ebit_calculation (EBITDA/EBIT — ingen felter på formularen),
 * numeric_values_only (parserens fejl, ikke filens), deterministic_parser_status
 * og skabelonernes øvrige navne (sign_convention, defaulted_fields,
 * ambiguous_lines …) har ingen tekst og går stadig til gren 6.
 */
export const KONTROL_GRUNDE: readonly { navn: string; tekst: string }[] = [
  // canonicalEngine.ts:625-636 og skabelonernes gross_profit_sum: omsætning −
  // direkte omkostninger ≠ dækningsbidrag (tolerance 2). I drift var fire af
  // fire fortegnsvendte (−115.840,07 ≠ 115.840,07; docs/import-model-design.md:80-83).
  { navn: "gross_profit_sum", tekst: "Dækningsbidraget stemmer ikke med omsætning minus direkte omkostninger — tjek de tre tal på kortet." },
  // skabelonernes revenue_present («No revenue found») og canonicalEngine.ts:795 (missing_core_totals: «P&L report without revenue»).
  { navn: "revenue_present", tekst: "Vi fandt ingen omsætning i filen — indtast tallene på kortet." },
  // skabelonernes ebt_present («No EBT found»).
  { navn: "ebt_present", tekst: "Vi fandt intet resultat før skat i filen — indtast tallene på kortet." },
  // canonicalEngine.ts:812: omsætning, men ingen omkostningslinjer.
  { navn: "cost_lines_present", tekst: "Filen har omsætning, men ingen omkostninger — resultatet ville blive lig omsætningen. Indtast tallene på kortet." },
  // canonicalEngine.ts:717: periodegrundlaget (måned/år til dato) kunne ikke bestemmes.
  { navn: "mixed_period_columns_detected", tekst: "Vi kunne ikke se, om tallene gælder måneden eller året til dato — tjek perioden og tallene på kortet." },
  // canonicalEngine.ts:702-708: år til dato < perioden.
  { navn: "period_consistency", tekst: "Tallet for året til dato er mindre end tallet for måneden — tjek, hvilken kolonne der er hvad." },
  // canonicalEngine.ts:735-751: et anker (omsætning, aktiver, passiver) negativt, eller flertallet af omkostningerne.
  { navn: "suspicious_sign_pattern", tekst: "Fortegnene ser vendte ud: omsætning eller omkostninger står som negative tal — tjek fortegnene på kortet." },
  // canonicalEngine.ts:769: dækningsgrad uden for ±100 %.
  { navn: "impossible_margin_check", tekst: "Dækningsgraden er uden for det mulige (over 100 %) — tjek omsætning og direkte omkostninger på kortet." },
  // canonicalEngine.ts:670-677: resultat før skat > dækningsbidrag.
  { navn: "result_consistency", tekst: "Resultat før skat er større end dækningsbidraget — tjek fortegnene på kortet." },
  // canonicalEngine.ts:686-692 (og skabelonernes balance_equation): aktiver ≠ passiver.
  { navn: "balance_equation", tekst: "Aktiver i alt og passiver i alt stemmer ikke overens — tjek totalerne på kortet." },
];

const KERNEFELT_NAVNE: Readonly<Record<string, string>> = {
  revenue: "omsætningen",
  ebt: "resultatet før skat",
};

/** «navn: details» eller «Kontrol af dokumentet — navn: details» → navn og details. */
export function kontrolNavn(tekst: string): { navn: string; details: string } | null {
  const m = /^(?:Kontrol af dokumentet — )?([a-z][a-z0-9_]*):\s*(.*)$/su.exec(tekst.trim());
  return m ? { navn: m[1], details: m[2] } : null;
}

export function kontrolGrund(tekst: string): string | null {
  const k = kontrolNavn(tekst);
  if (!k) return null;
  // canonicalEngine.ts:607-611: required_fields_present «Missing: revenue, ebt» — nævn dem der mangler.
  if (k.navn === "required_fields_present") {
    const mangler = k.details
      .replace(/^Missing:\s*/i, "")
      .split(",")
      .map((f) => KERNEFELT_NAVNE[f.trim()])
      .filter((x): x is string => !!x);
    if (mangler.length === 0) return null;
    return `Vi fandt ikke ${mangler.join(" og ")} i filen — indtast tallene på kortet.`;
  }
  // canonicalEngine.ts:789: balancen uden begge totaler; :795 uden omsætning.
  if (k.navn === "missing_core_totals") {
    if (/without revenue/i.test(k.details)) return "Vi fandt ingen omsætning i filen — indtast tallene på kortet.";
    if (/without assets_total/i.test(k.details)) return "Vi fandt hverken aktiver i alt eller passiver i alt i filen — indtast tallene på kortet.";
    return null;
  }
  return KONTROL_GRUNDE.find((g) => g.navn === k.navn)?.tekst ?? null;
}

/**
 * Kortets NÆSTE SKRIDT (14/9, mangellistens nr. 8: kortet sagde hvorfor,
 * ikke hvad man skal gøre). Ren dom over samme kilder som rapportFejlgrund,
 * plus kildefingeraftrykket (raw_extracted_data.routing_trace
 * .source_fingerprint.source_system — null på ældre rækker og AI-vejen).
 * Spænd-afvisningen får serverens egen hale, som kortGrund klipper af
 * grunden («eksportér én måned pr. fil …»); «ikke afsluttet» siger allerede
 * i grunden hvad man gør; alt andet får vejen for kilden
 * (rapporteringTekst.naesteSkridtTekst) — aldrig et gættet program.
 */
export function rapportNaesteSkridt(kilde: FejlgrundKilde, sourceSystem: string | null | undefined): string | null {
  const foerste = kilde.validationErrors?.[0] ?? kilde.qualityValidationErrors?.[0] ?? null;
  const gren = kilde.routingBranch ?? null;
  if (gren === "period_span_rejected" || (foerste && /^Filen dækker \d+ måneder/.test(foerste))) {
    return "Eksportér én måned pr. fil, og upload dem hver for sig.";
  }
  if (gren === "period_not_completed" || foerste === "Periode ikke afsluttet") {
    return null;
  }
  return naesteSkridtTekst(sourceSystem);
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
  /** Hvad man gør (14/9) — egen linje under label og grund; ikke klippet af kortGrund. */
  naesteSkridt?: string;
  primary?: { label: string; action: CardAction };
  secondary?: { label: string; action: CardAction };
}

export function deriveReportCardView(input: ReportCardInput): ReportCardView {
  const { status, isCommitted, commitState, stateReason, periodKey, nowKey, fejlgrund, naesteSkridt } = input;

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
      naesteSkridt: naesteSkridt ?? undefined,
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
      naesteSkridt: naesteSkridt ?? undefined,
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
          // Instruks F (16/9): sig hvad hun kan gøre imens — de tre seneste
          // afsluttede måneder ved navn, regnet fra fladens nu-nøgle.
          detail: `Måneden skal være omme, før den kan godkendes. Imens: upload ${afsluttedeMaanederTekstFoer(nowKey ?? nuSomPeriodeNoegle())}, så kan de godkendes med det samme.`,
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
