import { describe, expect, it } from "vitest";
import { afgoerRaadgivermail, raadgivermailTekst, raekkerForAnsoegning, RAADGIVERMAIL_LABEL, type MailLogRaekke } from "@/lib/ansoegninger/raadgivermailStatus";

// Brist 7 (18/9): dommen over email_send_log — kom mailen til kontakt@ af sted?
const ID = "a1";
const raekke = (over: Partial<MailLogRaekke>): MailLogRaekke => ({
  status: "sent", created_at: "2026-09-18T12:00:00Z", error_message: null, recipient_email: "kontakt@theboardroom.dk",
  template_name: RAADGIVERMAIL_LABEL, metadata: { ansoegning_id: ID }, ...over,
});
const tid = (iso: string) => `T(${iso})`;

describe("afgoerRaadgivermail", () => {
  it("ingen række for ansøgningen → «ingen» (også når andre ansøgningers rækker findes)", () => {
    expect(afgoerRaadgivermail([raekke({ metadata: { ansoegning_id: "b2" } })], ID, [])).toEqual({ tilstand: "ingen" });
    expect(afgoerRaadgivermail([raekke({ template_name: "indgang-dag0" })], ID, [])).toEqual({ tilstand: "ingen" });
  });
  it("sent uden bounce → sendt med tidspunktet", () => {
    expect(afgoerRaadgivermail([raekke({})], ID, [])).toEqual({ tilstand: "sendt", tidspunkt: "2026-09-18T12:00:00Z" });
  });
  it("failed / rate_limited / suppressed → fejlet med status og grund", () => {
    expect(afgoerRaadgivermail([raekke({ status: "failed", error_message: "500 fra Lovable" })], ID, [])).toEqual({ tilstand: "fejlet", tidspunkt: "2026-09-18T12:00:00Z", status: "failed", grund: "500 fra Lovable" });
    expect(afgoerRaadgivermail([raekke({ status: "rate_limited" })], ID, []).tilstand).toBe("fejlet");
  });
  it("nyeste række vinder: et fejlet forsøg efterfulgt af sent → sendt", () => {
    const rows = [raekke({ status: "failed", created_at: "2026-09-18T12:00:00Z" }), raekke({ created_at: "2026-09-18T12:05:00Z" })];
    expect(afgoerRaadgivermail(rows, ID, []).tilstand).toBe("sendt");
    expect(raekkerForAnsoegning(rows, ID)[0].created_at).toBe("2026-09-18T12:05:00Z");
  });
  it("en bounce på kontakt@ EFTER den sendte række → sendt, men bouncet; en bounce FØR tæller ikke", () => {
    const bounce = raekke({ status: "bounced", error_message: "Mailen bouncede", template_name: "email-event", metadata: null, created_at: "2026-09-18T12:01:00Z" });
    expect(afgoerRaadgivermail([raekke({})], ID, [bounce])).toEqual({ tilstand: "sendt_men_bouncet", tidspunkt: "2026-09-18T12:01:00Z", grund: "Mailen bouncede" });
    expect(afgoerRaadgivermail([raekke({})], ID, [{ ...bounce, created_at: "2026-09-18T11:00:00Z" }]).tilstand).toBe("sendt");
  });
  it("teksterne siger hvad Jonas skal gøre — og at «sent» er «Lovable tog imod», ikke leveret", () => {
    expect(raadgivermailTekst({ tilstand: "sendt", tidspunkt: "x" }, tid)).toBe("Mail til jer (kontakt@): sendt T(x) — Lovable tog imod, ingen bounce set.");
    expect(raadgivermailTekst({ tilstand: "fejlet", tidspunkt: "x", status: "rate_limited", grund: null }, tid)).toMatch(/IKKE sendt .*afvist af mailloftet.*Klokken er den eneste besked/);
    expect(raadgivermailTekst({ tilstand: "sendt_men_bouncet", tidspunkt: "x", grund: "g" }, tid)).toMatch(/bouncede/);
    expect(raadgivermailTekst({ tilstand: "ingen" }, tid)).toMatch(/ingen række/);
  });
});
