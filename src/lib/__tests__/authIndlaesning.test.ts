/**
 * authIndlaesning (29/9-2026, analyse-hastighed.md #1–#3): de rene domme bag
 * useAuth's indlæsning — hvad et joinet virksomhedssvar betyder, hvornår der
 * hentes igen, hvornår et login logges, og at PPI's ventetid kappes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  medTimeout,
  PPI_TIMEOUT_MEDLEM_MS,
  PPI_TIMEOUT_RAADGIVER_MS,
  skalHenteBrugerdata,
  skalLoggeLogin,
  skalStarteOnboardingAgent,
  tierFraVirksomhed,
} from "@/lib/authIndlaesning";

const IDAG = new Date();
const omDage = (n: number) => new Date(IDAG.getTime() + n * 86_400_000).toISOString().slice(0, 10);

describe("tierFraVirksomhed — samme regel som afgoerMedlemsTier", () => {
  it("ingen række (RLS eller manglende join) giver full", () => {
    expect(tierFraVirksomhed(null)).toBe("full");
    expect(tierFraVirksomhed(undefined)).toBe("full");
  });

  it("ingen kontraktdato (no_date) giver full", () => {
    expect(tierFraVirksomhed({ contract_end_date: null })).toBe("full");
  });

  it("kontrakt der løber endnu giver full", () => {
    expect(tierFraVirksomhed({ contract_end_date: omDage(30) })).toBe("full");
  });

  it("udløbet kontrakt uden abonnement giver expired", () => {
    expect(tierFraVirksomhed({ contract_end_date: omDage(-30), subscription_status: null })).toBe("expired");
  });

  it("udløbet kontrakt med aktivt abonnement giver subscriber", () => {
    expect(
      tierFraVirksomhed({
        contract_end_date: omDage(-30),
        subscription_status: "active",
        subscription_current_period_end: new Date(IDAG.getTime() + 10 * 86_400_000).toISOString(),
      }),
    ).toBe("subscriber");
  });

  it("joinets ekstra felter (onboarding) påvirker ikke tier", () => {
    expect(
      tierFraVirksomhed({ contract_end_date: omDage(30), onboarding_completed: false, application_context: { a: 1 } }),
    ).toBe("full");
  });
});

describe("skalStarteOnboardingAgent — ordret betingelsen fra før", () => {
  it("kun når onboarding_completed er EKSPLICIT false og der er en application_context", () => {
    expect(skalStarteOnboardingAgent({ onboarding_completed: false, application_context: { svar: 1 } })).toBe(true);
  });
  it("ikke når flaget er true, null eller mangler", () => {
    expect(skalStarteOnboardingAgent({ onboarding_completed: true, application_context: { svar: 1 } })).toBe(false);
    expect(skalStarteOnboardingAgent({ onboarding_completed: null, application_context: { svar: 1 } })).toBe(false);
    expect(skalStarteOnboardingAgent({ application_context: { svar: 1 } })).toBe(false);
  });
  it("ikke uden application_context, og ikke uden række", () => {
    expect(skalStarteOnboardingAgent({ onboarding_completed: false, application_context: null })).toBe(false);
    expect(skalStarteOnboardingAgent(null)).toBe(false);
  });
});

describe("skalHenteBrugerdata — faneskift genhenter ikke", () => {
  it("første session: hent", () => {
    expect(skalHenteBrugerdata({ hentetFor: null, igangFor: null }, "a")).toBe(true);
  });
  it("samme bruger, allerede hentet (SIGNED_IN ved faneskift, TOKEN_REFRESHED): hent ikke", () => {
    expect(skalHenteBrugerdata({ hentetFor: "a", igangFor: null }, "a")).toBe(false);
  });
  it("samme bruger, hentning kører (SIGNED_IN + INITIAL_SESSION ved hard reload): hent ikke igen", () => {
    expect(skalHenteBrugerdata({ hentetFor: null, igangFor: "a" }, "a")).toBe(false);
  });
  it("en anden bruger (ny konto i en anden fane): hent", () => {
    expect(skalHenteBrugerdata({ hentetFor: "a", igangFor: null }, "b")).toBe(true);
    expect(skalHenteBrugerdata({ hentetFor: null, igangFor: "a" }, "b")).toBe(true);
  });
  it("forrige hentning fejlede (hentetFor ryddet): næste hændelse prøver igen", () => {
    expect(skalHenteBrugerdata({ hentetFor: null, igangFor: null }, "a")).toBe(true);
  });
});

describe("skalLoggeLogin — kun overgangen til en ny session", () => {
  it("SIGNED_IN efter ingen session er et login", () => {
    expect(skalLoggeLogin("SIGNED_IN", null, "a")).toBe(true);
  });
  it("SIGNED_IN for samme bruger (faneskift, anden fane, kodeordsskift) er IKKE et login", () => {
    expect(skalLoggeLogin("SIGNED_IN", "a", "a")).toBe(false);
  });
  it("SIGNED_IN for en anden bruger er et login", () => {
    expect(skalLoggeLogin("SIGNED_IN", "a", "b")).toBe(true);
  });
  it("andre hændelser logges aldrig", () => {
    for (const h of ["INITIAL_SESSION", "TOKEN_REFRESHED", "USER_UPDATED", "PASSWORD_RECOVERY"]) {
      expect(skalLoggeLogin(h, null, "a")).toBe(false);
    }
  });
});

describe("medTimeout — PPI må ikke blokere uden grænse", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("svar inden fristen giver svaret", async () => {
    const p = medTimeout(Promise.resolve(42), 4_000);
    await expect(p).resolves.toEqual({ udfald: "svar", vaerdi: 42 });
  });

  it("intet svar inden fristen giver timeout", async () => {
    const aldrig = new Promise<number>(() => {});
    const p = medTimeout(aldrig, 4_000);
    vi.advanceTimersByTime(4_000);
    await expect(p).resolves.toEqual({ udfald: "timeout" });
  });

  it("svar lige efter fristen er stadig timeout", async () => {
    const sent = new Promise<number>((r) => setTimeout(() => r(1), 4_001));
    const p = medTimeout(sent, 4_000);
    vi.advanceTimersByTime(4_001);
    await expect(p).resolves.toEqual({ udfald: "timeout" });
  });

  it("en afvisning går videre til kalderens catch", async () => {
    const p = medTimeout(Promise.reject(new Error("net")), 4_000);
    await expect(p).rejects.toThrow("net");
  });

  it("timeren ryddes, når svaret når først", async () => {
    await medTimeout(Promise.resolve("ok"), 4_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rådgiveren venter kortere end medlemmet, hvis kobling PPI er", () => {
    expect(PPI_TIMEOUT_RAADGIVER_MS).toBe(4_000);
    expect(PPI_TIMEOUT_MEDLEM_MS).toBeGreaterThan(PPI_TIMEOUT_RAADGIVER_MS);
  });
});
