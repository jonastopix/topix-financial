import { describe, expect, it } from "vitest";
import { deriveReportCardView } from "../reportCardView";

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

  it("5c) processed + !committed + not_ready → Ret periode (override)", () => {
    const view = deriveReportCardView({ status: "processed", isCommitted: false, commitState: "not_ready" });
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
