import { describe, expect, it } from "vitest";
import { deriveReportCardView, erForTidligt, foersteDagEfterPeriode, godkendSpaerret, kortGrund, nuSomPeriodeNoegle, rapportFejlgrund } from "../reportCardView";

describe("deriveReportCardView — mapping-tabellen række for række", () => {
  it("1) processing → Behandles…, quiet, ingen handling", () => {
    const view = deriveReportCardView({ status: "processing", isCommitted: false });
    expect(view.key).toBe("processing");
    expect(view.tone).toBe("quiet");
    expect(view.primary).toBeUndefined();
  });

  it("2) error → alert m. Prøv igen (upload) + Indtast manuelt (override)", () => {
    const view = deriveReportCardView({ status: "error", isCommitted: false });
    expect(view.key).toBe("error");
    expect(view.tone).toBe("alert");
    expect(view.primary?.action).toBe("upload");
    expect(view.secondary?.action).toBe("override");
  });

  it("3) period_not_completed → attention m. Ret periode (override)", () => {
    const view = deriveReportCardView({ status: "period_not_completed", isCommitted: false });
    expect(view.key).toBe("period_open");
    expect(view.tone).toBe("attention");
    expect(view.primary?.action).toBe("override");
  });

  it("4) needs_manual_entry → attention m. Indtast tallene (override)", () => {
    const view = deriveReportCardView({ status: "needs_manual_entry", isCommitted: false });
    expect(view.key).toBe("manual");
    expect(view.primary?.action).toBe("override");
  });

  it("5) processed + !committed + ready → Klar til gennemsyn (review)", () => {
    const view = deriveReportCardView({ status: "processed", isCommitted: false, commitState: "ready" });
    expect(view.key).toBe("awaiting");
    expect(view.tone).toBe("attention");
    expect(view.primary?.action).toBe("review");
  });

  it("5b) processed + !committed + blocked → detail = stateReason (review)", () => {
    const view = deriveReportCardView({
      status: "processed",
      isCommitted: false,
      commitState: "blocked",
      stateReason: "En anden rapport ejer perioden",
    });
    expect(view.key).toBe("blocked");
    expect(view.detail).toBe("En anden rapport ejer perioden");
    expect(view.primary?.action).toBe("review");
  });

  it("5c) processed + !committed + not_ready UDEN period_key → Ret periode (override), uændret", () => {
    const view = deriveReportCardView({ status: "processed", isCommitted: false, commitState: "not_ready" });
    expect(view.key).toBe("not_ready");
    expect(view.label).toBe("Perioden skal rettes først");
    expect(view.primary?.action).toBe("override");
  });

  it("5d) not_ready med en PASSERET period_key (en anden grund) → stadig Ret periode, uændret", () => {
    const view = deriveReportCardView({ status: "processed", isCommitted: false, commitState: "not_ready", periodKey: "2026-07", nowKey: "2026-09" });
    expect(view.key).toBe("not_ready");
    expect(view.primary?.action).toBe("override");
  });

  it("6) REGRESSIONSVÆRN: committed + update_available → stille Godkendt uden primær handling (ejerskabs-kapabilitet, ikke alarm)", () => {
    const view = deriveReportCardView({ status: "processed", isCommitted: true, commitState: "update_available" });
    expect(view.key).toBe("committed");
    expect(view.tone).toBe("quiet");
    expect(view.primary).toBeUndefined();
    expect(view.secondary?.action).toBe("override");
  });

  it("7) processed + committed → Godkendt, quiet, kun sekundær Ret data", () => {
    const view = deriveReportCardView({ status: "processed", isCommitted: true, commitState: "ready" });
    expect(view.key).toBe("committed");
    expect(view.tone).toBe("quiet");
    expect(view.primary).toBeUndefined();
    expect(view.secondary?.action).toBe("override");
  });

  it("prioritet: error slår commitState", () => {
    const view = deriveReportCardView({ status: "error", isCommitted: false, commitState: "ready" });
    expect(view.key).toBe("error");
  });

  it("prioritet: processing slår committed-flaget", () => {
    const view = deriveReportCardView({ status: "processing", isCommitted: true, commitState: "ready" });
    expect(view.key).toBe("processing");
  });

  it("ukendt status → unknown, quiet, handlingsløs (defensivt)", () => {
    const view = deriveReportCardView({ status: "noget_nyt", isCommitted: false });
    expect(view.key).toBe("unknown");
    expect(view.tone).toBe("quiet");
    expect(view.primary).toBeUndefined();
    expect(view.secondary).toBeUndefined();
  });
});

// ── «For tidligt» (regel 6 i resolve_report_commit_candidate), rettet 7/9 ──
//
// SQL'en afviser en rapport for indeværende/fremtidig måned med not_ready
// og «Periode … er ikke afsluttet endnu». Fladen sagde «Perioden skal
// rettes først» med knappen «Ret periode» — usandt, og destruktivt hvis
// medlemmet fulgte det. Skellet er period_key >= nu-måneden: ingen anden
// not_ready-grund sætter period_key.
describe("for tidligt — perioden fejler ikke, den er ikke omme", () => {
  it("august-rapport i august: «Modtaget — kan godkendes fra 1. september 2026», quiet, INGEN knapper", () => {
    const view = deriveReportCardView({ status: "processed", isCommitted: false, commitState: "not_ready", periodKey: "2026-08", nowKey: "2026-08" });
    expect(view.key).toBe("too_early");
    expect(view.label).toBe("Modtaget — kan godkendes fra 1. september 2026");
    expect(view.tone).toBe("quiet");
    expect(view.detail).toBe("Tallene er læst og i orden. Måneden skal være omme, før de kan godkendes.");
    expect(view.primary).toBeUndefined();
    expect(view.secondary).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain("Ret periode");
  });

  it("fremtidig måned (fejlsat eller forud): også for tidligt, datoen følger perioden", () => {
    const view = deriveReportCardView({ status: "processed", isCommitted: false, commitState: "not_ready", periodKey: "2026-12", nowKey: "2026-09" });
    expect(view.key).toBe("too_early");
    expect(view.label).toBe("Modtaget — kan godkendes fra 1. januar 2027");
  });

  it("grænsen: perioden lige før nu-måneden er IKKE for tidligt — og uden not_ready er period_key ligegyldig", () => {
    expect(erForTidligt("2026-08", "2026-09")).toBe(false);
    expect(erForTidligt("2026-09", "2026-09")).toBe(true);
    expect(erForTidligt("2026-10", "2026-09")).toBe(true);
    expect(erForTidligt(null, "2026-09")).toBe(false);
    expect(erForTidligt("", "2026-09")).toBe(false);
    expect(erForTidligt("September 2026", "2026-09")).toBe(false);
    const klar = deriveReportCardView({ status: "processed", isCommitted: false, commitState: "ready", periodKey: "2026-09", nowKey: "2026-09" });
    expect(klar.key).toBe("awaiting"); // serverens ready vinder — klienten dømmer kun not_ready
  });

  it("foersteDagEfterPeriode: månedsskifte og årsskifte", () => {
    expect(foersteDagEfterPeriode("2026-09")).toBe("1. oktober 2026");
    expect(foersteDagEfterPeriode("2026-01")).toBe("1. februar 2026");
    expect(foersteDagEfterPeriode("2026-12")).toBe("1. januar 2027");
  });

  it("nuSomPeriodeNoegle: lokal måned med to cifre", () => {
    expect(nuSomPeriodeNoegle(new Date(2026, 8, 7))).toBe("2026-09");
    expect(nuSomPeriodeNoegle(new Date(2026, 0, 1))).toBe("2026-01");
  });

  it("committed vinder over for tidligt (kan ikke ske i SQL, men dommen skal være stabil)", () => {
    const view = deriveReportCardView({ status: "processed", isCommitted: true, commitState: "not_ready", periodKey: "2026-09", nowKey: "2026-09" });
    expect(view.key).toBe("committed");
  });
});

describe("godkendSpaerret — punkt 4 (10/9): en fejlet facts-hentning må ikke åbne for godkend oveni", () => {
  it("spærrer review og override når godkendelsen er ukendt", () => {
    expect(godkendSpaerret("review", true)).toBe(true);
    expect(godkendSpaerret("override", true)).toBe(true);
  });
  it("lader upload og none stå — de rører ikke godkendelsen", () => {
    expect(godkendSpaerret("upload", true)).toBe(false);
    expect(godkendSpaerret("none", true)).toBe(false);
  });
  it("spærrer intet når facts er hentet", () => {
    for (const a of ["review", "override", "upload", "none"] as const) expect(godkendSpaerret(a, false)).toBe(false);
  });
});

// ── Grunden på kortet (10/9, recon-parseren §5f) ──
describe("rapportFejlgrund — grunden står på kortet, kort og i medlemmets ord", () => {
  const SPAEND = "Filen dækker 2 måneder (maj–juni 2026). Vi kan kun læse én måned ad gangen — eksportér én måned pr. fil og upload dem hver for sig.";
  const KENDT_KILDE = "Filen er genkendt som en rapport fra e-conomic, men netop dette format understøttes ikke automatisk endnu. Du kan indtaste tallene manuelt på rapportkortet.";

  it("to måneder i én fil (#785): serverens tekst, klippet til to hele sætninger uden halen", () => {
    const g = rapportFejlgrund({ status: "error", validationErrors: [SPAEND], routingBranch: "period_span_rejected" });
    expect(g).toBe("Filen dækker 2 måneder (maj–juni 2026). Vi kan kun læse én måned ad gangen.");
    // grenen alene (ældre række uden tekst) giver stadig en grund
    expect(rapportFejlgrund({ status: "error", routingBranch: "period_span_rejected" })).toMatch(/flere måneder/);
  });

  it("periode ikke afsluttet (periode-gaten): dansk sætning i stedet for kolonnens «Periode ikke afsluttet»", () => {
    expect(rapportFejlgrund({ status: "error", validationErrors: ["Periode ikke afsluttet"] })).toBe("Måneden er ikke afsluttet endnu — upload rapporten, når den er omme.");
    expect(rapportFejlgrund({ status: "error", routingBranch: "period_not_completed" })).toMatch(/ikke afsluttet/);
  });

  it("kendt kilde uden skabelon (#449): første sætning, på needs_manual_entry-kortet", () => {
    const g = rapportFejlgrund({ status: "processed", qualityValidationErrors: [KENDT_KILDE], routingBranch: "known_source_unsupported_variant" });
    expect(g).toBe("Filen er genkendt som en rapport fra e-conomic, men netop dette format understøttes ikke automatisk endnu.");
    const view = deriveReportCardView({ status: "needs_manual_entry", isCommitted: false, fejlgrund: g });
    expect(view.detail).toBe(g);
  });

  it("klientens egne: flere ark, kodeord, PDF-struktur, afbrudt behandling", () => {
    expect(rapportFejlgrund({ status: "error", validationErrors: ["Denne filtype (multi-sheet regnskabsrapport med DATA + P&L Top Line ark) understøttes ikke endnu. Upload venligst en enkelt-sheet saldobalance/resultatopgørelse."] })).toMatch(/^Filen har flere ark/);
    expect(rapportFejlgrund({ status: "error", validationErrors: ["PDF is password protected"] })).toMatch(/adgangskode/);
    expect(rapportFejlgrund({ status: "processed", validationErrors: ["PDF structural extraction failed: pdfjs_worker_loading"] })).toMatch(/Excel i stedet/);
    expect(rapportFejlgrund({ status: "processed", validationErrors: ["Extraction timed out or crashed without updating DB"] })).toBe("Behandlingen blev ikke færdig — prøv igen.");
  });

  it("cron-oprydningen: error uden gemt grund → «Behandlingen blev ikke færdig — prøv igen.»", () => {
    expect(rapportFejlgrund({ status: "error", validationErrors: null, qualityValidationErrors: null })).toBe("Behandlingen blev ikke færdig — prøv igen.");
  });

  it("tekniske strenge kommer ALDRIG på kortet: checknavne, engelsk, «Unknown error»", () => {
    for (const teknisk of [
      "suspicious_sign_pattern: 5/9 metrics negative (>50%)",
      "gross_profit_sum: MISMATCH: 95829.05 ≠ 96220.67",
      "Kontrol af dokumentet — deterministic_parser_status: Parser reported: FAIL",
      "AI returned no tool call",
      "Unknown error",
      "Known source economic detected but no supported template matched. AI fallback is forbidden for known sources.",
    ]) {
      expect(rapportFejlgrund({ status: "processed", validationErrors: [teknisk] }), teknisk).toBeNull();
    }
  });

  it("kolonnen validation_errors går forud for quality_signals; ingen kilder → null (ikke error)", () => {
    expect(rapportFejlgrund({ status: "processed", validationErrors: ["Periode ikke afsluttet"], qualityValidationErrors: [SPAEND] })).toMatch(/ikke afsluttet/);
    expect(rapportFejlgrund({ status: "processed" })).toBeNull();
  });

  it("kortGrund: højst to sætninger, aldrig over 120 tegn, og en hale efter tankestreg klippes til en hel sætning", () => {
    expect(kortGrund("A. B. C.")).toBe("A. B.");
    expect(kortGrund(SPAEND).length).toBeLessThanOrEqual(120);
    expect(kortGrund(SPAEND)).toMatch(/\.$/);
    const lang = `${"x".repeat(200)}.`;
    expect(kortGrund(lang).length).toBeLessThanOrEqual(120);
    expect(kortGrund(lang)).toMatch(/…$/);
  });

  it("error-kortet bærer grunden som detail; uden grund står label'en alene", () => {
    const med = deriveReportCardView({ status: "error", isCommitted: false, fejlgrund: "Filen dækker 2 måneder (maj–juni 2026). Vi kan kun læse én måned ad gangen." });
    expect(med.label).toBe("Kunne ikke behandles");
    expect(med.detail).toMatch(/^Filen dækker/);
    const uden = deriveReportCardView({ status: "error", isCommitted: false, fejlgrund: null });
    expect(uden.detail).toBeUndefined();
  });
});
