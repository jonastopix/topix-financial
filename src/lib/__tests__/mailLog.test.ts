import { describe, expect, it } from "vitest";
import { MAILLOG_FEJL, MAILLOG_TOM, MAIL_STATUS_LABELS, erMailFejl, nyesteRaekkePrMail, virksomhedensAdresser } from "@/lib/mailLog";

const r = (id: string, message_id: string | null, created_at: string, status: string) => ({ id, message_id, created_at, status });

describe("virksomhedensAdresser — medlemmer + invitationer, én gang hver", () => {
  it("samler begge mængder, små bogstaver, uden tomme og dubletter", () => {
    expect(
      virksomhedensAdresser(
        [{ email: "Nille@Philbert.dk" }, { email: null }, { email: "  " }],
        [{ email: "nille@philbert.dk" }, { email: "ny@philbert.dk" }],
      ),
    ).toEqual(["nille@philbert.dk", "ny@philbert.dk"]);
  });
  it("tom ind → tom ud", () => {
    expect(virksomhedensAdresser([], [])).toEqual([]);
  });
});

describe("nyesteRaekkePrMail — EmailLogViews dedup, ordret", () => {
  it("pending + sent med samme message_id → én linje, den nyeste (sent)", () => {
    const ud = nyesteRaekkePrMail([
      r("a", "m1", "2026-09-07T11:57:50Z", "pending"),
      r("b", "m1", "2026-09-07T11:57:53Z", "sent"),
    ]);
    expect(ud.map((x) => x.status)).toEqual(["sent"]);
  });
  it("en mail der fejlede VISES — failed er den nyeste række", () => {
    const ud = nyesteRaekkePrMail([
      r("a", "m1", "2026-09-07T11:57:50Z", "pending"),
      r("b", "m1", "2026-09-07T11:57:55Z", "failed"),
    ]);
    expect(ud).toHaveLength(1);
    expect(ud[0].status).toBe("failed");
  });
  it("rækker uden message_id står for sig selv og fjernes ikke", () => {
    const ud = nyesteRaekkePrMail([
      r("a", null, "2026-09-01T00:00:00Z", "sent"),
      r("b", null, "2026-09-02T00:00:00Z", "sent"),
      r("c", "m1", "2026-09-03T00:00:00Z", "sent"),
    ]);
    expect(ud.map((x) => x.id)).toEqual(["c", "b", "a"]);
  });
  it("nyeste først på tværs af mails", () => {
    const ud = nyesteRaekkePrMail([
      r("a", "m1", "2026-09-01T00:00:00Z", "sent"),
      r("b", "m2", "2026-09-05T00:00:00Z", "pending"),
      r("c", "m2", "2026-09-05T00:00:10Z", "sent"),
      r("d", "m3", "2026-09-03T00:00:00Z", "sent"),
    ]);
    expect(ud.map((x) => x.id)).toEqual(["c", "d", "a"]);
  });
  it("input-rækkefølgen betyder intet — nyeste pr. mail vinder også når den kommer først", () => {
    const ud = nyesteRaekkePrMail([
      r("b", "m1", "2026-09-07T11:57:53Z", "sent"),
      r("a", "m1", "2026-09-07T11:57:50Z", "pending"),
    ]);
    expect(ud.map((x) => x.id)).toEqual(["b"]);
  });
});

describe("status-ordene og teksterne", () => {
  it("fejl-familien er failed, dlq, bounced, complained — ikke pending/rate_limited", () => {
    for (const s of ["failed", "dlq", "bounced", "complained"]) expect(erMailFejl(s)).toBe(true);
    for (const s of ["sent", "pending", "rate_limited", "suppressed"]) expect(erMailFejl(s)).toBe(false);
  });
  it("de otte statusser har et dansk ord", () => {
    expect(Object.keys(MAIL_STATUS_LABELS).sort()).toEqual(["bounced", "complained", "dlq", "failed", "pending", "rate_limited", "sent", "suppressed"]);
  });
  it("tom og fejl er to forskellige tekster", () => {
    expect(MAILLOG_TOM).not.toBe(MAILLOG_FEJL);
    expect(MAILLOG_FEJL).toContain("kunne ikke hentes");
  });
});
