import { describe, expect, it } from "vitest";
import { deriveReportCardView, erForTidligt, foersteDagEfterPeriode, nuSomPeriodeNoegle } from "../reportCardView";

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
