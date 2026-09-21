/**
 * GA's klient-id og session-id (21/9-2026 aften): parseren er ren og prøves på RIGTIGE
 * cookie-strenge i begge formater (GS1 og GS2 — thyngster.com / optimizesmart.com, citeret
 * i skema.ts), tom streng, fremmede cookies, og _ga i andre former. Svaret er null, når
 * noget ikke passer — aldrig et gæt. Serverens dom (gaAf) dømmer igen med samme former, og
 * spejlet i _shared dømmer ens.
 */
import { describe, expect, it } from "vitest";
import {
  cookieVaerdi, GA_CLIENT_ID_FORM, GA_SESSION_COOKIE, GA_SESSION_ID_FORM, gaAf, harGa, laesGa, laesGaClientId, laesGaSessionId, TOM_GA,
} from "@/lib/ansoegning/skema";
import * as deno from "../../../supabase/functions/_shared/ansoegningSkema.ts";

// Eksemplerne ordret fra kilderne (skema.ts' filhoved): optimizesmart (_ga, GS2) og thyngster (GS1, GS2).
const GA = "GA1.1.860784081.1732738496";
const GS2 = "GS2.1.s1747323152$o28$g0$t1747323152$j60$l0$h69286059";
const GS2_B = "GS2.1.s1746825440$o14$g0$t1746825440$j60$l0$h295082955";
const GS1 = "GS1.1.1746825440.14.0.17468254406.0.0.295082955";

describe("cookieVaerdi — én cookie ud af document.cookie", () => {
  it("finder værdien, uanset placering og mellemrum; _ga rammer ikke _ga_…", () => {
    const c = `tbr_cookie_consent=accepted; _ga=${GA}; ${GA_SESSION_COOKIE}=${GS2}; __cf_bm=x`;
    expect(cookieVaerdi(c, "_ga")).toBe(GA);
    expect(cookieVaerdi(c, GA_SESSION_COOKIE)).toBe(GS2);
    expect(cookieVaerdi(`${GA_SESSION_COOKIE}=${GS2}`, "_ga")).toBeNull();
    expect(cookieVaerdi(`_ga=${GA}`, GA_SESSION_COOKIE)).toBeNull();
  });
  it("tom, fraværende, tom værdi, ikke en streng → null", () => {
    expect(cookieVaerdi("", "_ga")).toBeNull();
    expect(cookieVaerdi(null, "_ga")).toBeNull();
    expect(cookieVaerdi(undefined, "_ga")).toBeNull();
    expect(cookieVaerdi("_ga=; b=2", "_ga")).toBeNull();
    expect(cookieVaerdi("a=1; b=2", "_ga")).toBeNull();
  });
});

describe("laesGaClientId — «GA1.<n>.<tal>.<tal>» → de to sidste dele", () => {
  it("det rigtige format giver client_id", () => {
    expect(laesGaClientId(GA)).toBe("860784081.1732738496");
    expect(laesGaClientId(" GA1.1.860784081.1732738496 ")).toBe("860784081.1732738496");
    // Universal Analytics' gamle GA1.2.… har samme form — de to sidste dele er stadig id'et.
    expect(laesGaClientId("GA1.2.123.456")).toBe("123.456");
  });
  it("andre former → null: for få dele, bogstaver, sessionsformatet i _ga, tom, ikke-streng", () => {
    expect(laesGaClientId("GA1.1.860784081")).toBeNull();
    expect(laesGaClientId("GA1.1.abc.def")).toBeNull();
    expect(laesGaClientId("GA1.1.abc.1732738496")).toBeNull();
    expect(laesGaClientId(GS2)).toBeNull();
    expect(laesGaClientId(GS1)).toBeNull();
    expect(laesGaClientId("1.1.860784081.1732738496")).toBeNull();
    expect(laesGaClientId("")).toBeNull();
    expect(laesGaClientId(null)).toBeNull();
    expect(laesGaClientId(undefined)).toBeNull();
    expect(laesGaClientId("GA1.1." + "9".repeat(21) + ".1")).toBeNull();
  });
});

describe("laesGaSessionId — GS2 (feltet s…) og GS1 (tredje del)", () => {
  it("GS2: session-id er feltet med præfiks s, uanset rækkefølge", () => {
    expect(laesGaSessionId(GS2)).toBe("1747323152");
    expect(laesGaSessionId(GS2_B)).toBe("1746825440");
    expect(laesGaSessionId("GS2.1.o28$s1747323152$g0")).toBe("1747323152");
    expect(laesGaSessionId("GS2.3.s99$t1")).toBe("99");
  });
  it("GS1: session-id er tredje punktum-del", () => {
    expect(laesGaSessionId(GS1)).toBe("1746825440");
    expect(laesGaSessionId("GS1.1.1747323152.5.1.1747323300.60.0.0")).toBe("1747323152");
  });
  it("andre former → null: klient-formatet, s uden cifre, s med bogstaver, ukendt hoved, tom", () => {
    expect(laesGaSessionId(GA)).toBeNull();
    expect(laesGaSessionId("GS2.1.o28$g0$t1747323152")).toBeNull();
    expect(laesGaSessionId("GS2.1.s$o1")).toBeNull();
    expect(laesGaSessionId("GS2.1.sabc$o1")).toBeNull();
    expect(laesGaSessionId("GS1.1.abc.5")).toBeNull();
    expect(laesGaSessionId("GS3.1.s1$o1")).toBeNull();
    expect(laesGaSessionId("")).toBeNull();
    expect(laesGaSessionId(null)).toBeNull();
  });
});

describe("laesGa — fladen, ét kald på document.cookie", () => {
  it("begge cookies i begge formater", () => {
    expect(laesGa(`_ga=${GA}; ${GA_SESSION_COOKIE}=${GS2}`)).toEqual({ client_id: "860784081.1732738496", session_id: "1747323152" });
    expect(laesGa(`${GA_SESSION_COOKIE}=${GS1}; _ga=${GA}`)).toEqual({ client_id: "860784081.1732738496", session_id: "1746825440" });
  });
  it("kun den ene, fremmede cookies, tom streng, intet samtykke → null hvor der intet er (aldrig et genereret id)", () => {
    expect(laesGa(`_ga=${GA}`)).toEqual({ client_id: "860784081.1732738496", session_id: null });
    expect(laesGa(`${GA_SESSION_COOKIE}=${GS2}`)).toEqual({ client_id: null, session_id: "1747323152" });
    expect(laesGa("tbr_cookie_consent=declined; __cf_bm=abc; _fbp=fb.1.1.2")).toEqual(TOM_GA);
    expect(laesGa("")).toEqual(TOM_GA);
    expect(laesGa(null)).toEqual(TOM_GA);
    // En anden ejendoms sessionscookie tæller ikke.
    expect(laesGa(`_ga_9S4NL9FKGK=${GS2}`)).toEqual(TOM_GA);
    // Sessionsformatet i _ga (fremmed form) → null.
    expect(laesGa(`_ga=${GS2}`).client_id).toBeNull();
  });
});

describe("gaAf — serveren dømmer igen, fail-closed", () => {
  it("rigtige former passerer; alt andet bliver null", () => {
    expect(gaAf({ client_id: "860784081.1732738496", session_id: "1747323152" })).toEqual({ client_id: "860784081.1732738496", session_id: "1747323152" });
    expect(gaAf({ client_id: " 1.2 ", session_id: " 3 " })).toEqual({ client_id: "1.2", session_id: "3" });
    expect(gaAf({ client_id: "GA1.1.860784081.1732738496", session_id: "s1747323152" })).toEqual(TOM_GA);
    expect(gaAf({ client_id: "1.2.3", session_id: "1.2" })).toEqual(TOM_GA);
    expect(gaAf({ client_id: 12, session_id: 34 })).toEqual(TOM_GA);
    expect(gaAf({ client_id: "9".repeat(21) + ".1", session_id: "9".repeat(21) })).toEqual(TOM_GA);
    expect(gaAf(null)).toEqual(TOM_GA);
    expect(gaAf("x")).toEqual(TOM_GA);
    expect(gaAf([])).toEqual(TOM_GA);
    expect(gaAf({})).toEqual(TOM_GA);
  });
  it("formerne er præcis dem, chatten besluttede", () => {
    expect(GA_CLIENT_ID_FORM.source).toBe("^\\d{1,20}\\.\\d{1,20}$");
    expect(GA_SESSION_ID_FORM.source).toBe("^\\d{1,20}$");
  });
  it("harGa: kun når mindst ét felt er sat", () => {
    expect(harGa(TOM_GA)).toBe(false);
    expect(harGa({ client_id: "1.2", session_id: null })).toBe(true);
    expect(harGa({ client_id: null, session_id: "3" })).toBe(true);
  });
});

describe("paritet: _shared dømmer ens", () => {
  it("laesGa og gaAf giver det samme på begge sider", () => {
    for (const c of [`_ga=${GA}; ${GA_SESSION_COOKIE}=${GS2}`, `${GA_SESSION_COOKIE}=${GS1}`, "", `_ga=${GS2}`, "a=1"]) {
      expect(deno.laesGa(c)).toEqual(laesGa(c));
    }
    for (const r of [{ client_id: "1.2", session_id: "3" }, { client_id: "x" }, null, {}]) expect(deno.gaAf(r)).toEqual(gaAf(r));
    expect(deno.GA_SESSION_COOKIE).toBe(GA_SESSION_COOKIE);
  });
});
