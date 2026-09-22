import { describe, expect, it } from "vitest";
import { AFMELDT_ORD, type AfmeldTilstand, erAfmeldt, skalAfmeldes } from "../../../supabase/functions/_shared/webinarAfmelding.ts";

/**
 * Dommen «går denne besked til afmeldt?» (udkast 22/9-2026).
 * Reglerne står i filhovedet på webinarAfmelding.ts; her har hver sin prøve.
 */

const t = (subscribed: string | null, sidste_action: string | null): AfmeldTilstand => ({ subscribed, sidste_action });

describe("webinarAfmelding — erAfmeldt", () => {
  it("ordet er eWebinars, i små bogstaver", () => {
    expect(AFMELDT_ORD).toBe("unsubscribed");
  });

  it("sand når tilstanden siger det", () => {
    expect(erAfmeldt(t("Unsubscribed", "Registered"))).toBe(true);
  });

  it("sand når den seneste hændelse siger det", () => {
    expect(erAfmeldt(t("Subscribed", "Unsubscribed"))).toBe(true);
  });

  it("falsk for en almindelig tilmelding", () => {
    expect(erAfmeldt(t("Subscribed", "Registered"))).toBe(false);
  });

  it("falsk for null og for tomme felter", () => {
    expect(erAfmeldt(null)).toBe(false);
    expect(erAfmeldt(undefined)).toBe(false);
    expect(erAfmeldt(t(null, null))).toBe(false);
  });

  it("kapitalisering og mellemrum betyder intet — feltet er eWebinars, ikke vores", () => {
    expect(erAfmeldt(t("UNSUBSCRIBED", null))).toBe(true);
    expect(erAfmeldt(t("unsubscribed", null))).toBe(true);
    expect(erAfmeldt(t("  Unsubscribed  ", null))).toBe(true);
    expect(erAfmeldt(t(null, "uNsUbScRiBeD"))).toBe(true);
  });

  it("et ord, der blot INDEHOLDER ordet, tæller ikke", () => {
    expect(erAfmeldt(t("Unsubscribed-pending", null))).toBe(false);
    expect(erAfmeldt(t(null, "NotUnsubscribed"))).toBe(false);
  });
});

describe("webinarAfmelding — skalAfmeldes", () => {
  it("(1) hændelsen: action = Unsubscribed er altid en afmelding", () => {
    expect(skalAfmeldes(t("Subscribed", "Registered"), t("Subscribed", "Unsubscribed"))).toBe(true);
    expect(skalAfmeldes(null, t(null, "Unsubscribed"))).toBe(true);
  });

  it("(2) tilstanden skifter: Subscribed → Unsubscribed", () => {
    expect(skalAfmeldes(t("Subscribed", "Registered"), t("Unsubscribed", "Left"))).toBe(true);
  });

  it("(2) ukendt → Unsubscribed tæller også (importens optOut, første gang vi ser mailen)", () => {
    expect(skalAfmeldes(null, t("Unsubscribed", "Registered"))).toBe(true);
    expect(skalAfmeldes(t(null, null), t("Unsubscribed", "Registered"))).toBe(true);
  });

  it("allerede afmeldt + en almindelig besked = INGEN ny afmelding", () => {
    // eWebinar POSTer ved hver ændring; uden denne regel ville hver besked
    // tælle som en ny afmelding for den samme person.
    expect(skalAfmeldes(t("Unsubscribed", "Unsubscribed"), t("Unsubscribed", "WebinarFinished"))).toBe(false);
  });

  it("en almindelig besked er aldrig en afmelding", () => {
    expect(skalAfmeldes(null, t("Subscribed", "Registered"))).toBe(false);
    expect(skalAfmeldes(t("Subscribed", "Registered"), t("Subscribed", "Joined"))).toBe(false);
    expect(skalAfmeldes(t("Subscribed", "Joined"), t(null, null))).toBe(false);
  });

  it("gentilmelding er ikke en afmelding", () => {
    expect(skalAfmeldes(t("Unsubscribed", "Unsubscribed"), t("Subscribed", "Registered"))).toBe(false);
  });

  it("kapitalisering betyder intet, også her", () => {
    expect(skalAfmeldes(t("subscribed", null), t(null, "UNSUBSCRIBED"))).toBe(true);
    expect(skalAfmeldes(t("UNSUBSCRIBED", null), t("unsubscribed", "Left"))).toBe(false);
  });

  it("de fire målte hændelser 22/9: state betyder intet for dommen", () => {
    // Målt i prod (maal-webinar-22-09.sql): Joined 1, NotJoined 1, Registered 2.
    // `state` indgår ikke i dommen — kun action og subscribed.
    for (const foer of ["Registered", "NotJoined", "Joined"]) {
      expect(skalAfmeldes(t("Subscribed", foer), t("Subscribed", "Unsubscribed"))).toBe(true);
    }
  });
});
