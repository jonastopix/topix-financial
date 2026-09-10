/**
 * Digestens gate (10/9): cronen sender kun på den 22.; admin-knappen tester
 * som standard og sender kun til alle ved et eksplicit valg; én nøgle pr.
 * modtager pr. måned.
 */
import { describe, expect, it } from "vitest";
import { DIGEST_DAG, afgoerDigestKald, digestNoegle, digestPeriode, maanedensStart } from "../../../supabase/functions/_shared/digestGate.ts";

const d = (iso: string) => new Date(iso);

describe("afgoerDigestKald — cronen", () => {
  it("sender på digestdagen (UTC)", () => {
    expect(DIGEST_DAG).toBe(22);
    expect(afgoerDigestKald({ kaldtAf: "cron", body: {}, now: d("2026-09-22T08:00:00Z") })).toEqual({ tilstand: "cron_send" });
  });
  it("sender IKKE på nogen anden dag — heller ikke med body", () => {
    expect(afgoerDigestKald({ kaldtAf: "cron", body: { send_til_alle: true }, now: d("2026-09-10T08:00:00Z") })).toEqual({ tilstand: "cron_ikke_digestdag", dag: 10 });
    expect(afgoerDigestKald({ kaldtAf: "cron", body: null, now: d("2026-09-23T08:00:00Z") }).tilstand).toBe("cron_ikke_digestdag");
  });
  it("dagen læses i UTC som cronens ur — kl. 23:30 dansk den 21. er den 21. UTC", () => {
    expect(afgoerDigestKald({ kaldtAf: "cron", body: {}, now: d("2026-09-21T21:30:00Z") }).tilstand).toBe("cron_ikke_digestdag");
  });
});

describe("afgoerDigestKald — admin-knappen", () => {
  it("test til én adresse er standarden", () => {
    expect(afgoerDigestKald({ kaldtAf: "admin", body: { test_email: " jonas@topix.dk " }, now: d("2026-09-10T10:00:00Z") })).toEqual({ tilstand: "admin_test", testEmail: "jonas@topix.dk" });
  });
  it("kun et eksplicit send_til_alle: true sender til alle — og det må ske en hvilken som helst dag", () => {
    expect(afgoerDigestKald({ kaldtAf: "admin", body: { send_til_alle: true }, now: d("2026-09-10T10:00:00Z") })).toEqual({ tilstand: "admin_send_alle" });
    expect(afgoerDigestKald({ kaldtAf: "admin", body: { send_til_alle: "true" }, now: d("2026-09-10T10:00:00Z") }).tilstand).toBe("admin_afvist");
  });
  it("tom body afvises — det gamle «Send digest nu» uden body sender ikke længere til alle", () => {
    const dom = afgoerDigestKald({ kaldtAf: "admin", body: {}, now: d("2026-09-22T10:00:00Z") });
    expect(dom.tilstand).toBe("admin_afvist");
    expect(afgoerDigestKald({ kaldtAf: "admin", body: { test_email: "ikke en mail" }, now: d("2026-09-22T10:00:00Z") }).tilstand).toBe("admin_afvist");
  });
});

describe("nøgle og periode", () => {
  it("periode og nøgle i UTC; månedens start er den 1. kl. 00:00 UTC", () => {
    expect(digestPeriode(d("2026-09-22T08:00:00Z"))).toBe("2026-09");
    expect(digestPeriode(d("2026-12-31T23:30:00Z"))).toBe("2026-12");
    expect(digestNoegle("2026-09", "u1")).toBe("monthly-digest:2026-09:u1");
    expect(maanedensStart(d("2026-09-22T08:00:00Z")).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});
