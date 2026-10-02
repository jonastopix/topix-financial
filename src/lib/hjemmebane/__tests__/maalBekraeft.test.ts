import { describe, expect, it } from "vitest";
import {
  aktiverFelter,
  BEKRAEFT_ORD,
  delBekraeftelser,
  erBekraeftet,
  erUbekraeftetAktivt,
  forslagOverskrift,
  GAMLE_MAAL_FOER,
  KVARTAL_VALG,
  KVARTALER,
  kvartalAnker,
  kvartalDatoer,
  kvartalstjekPrVirksomhed,
  KVARTALSTJEK_FRA,
  laesKvartal,
  laesKvartalValg,
  maalKilde,
  maaRegistrereKvartalstjek,
  skrevetAfTekst,
  taellerSomScoreMaal,
  ventendeKvartalstjek,
  ventendeKvartalstjekAlle,
  type MaalTilBekraeftelse,
  type MaalTilKvartalstjek,
} from "../maalBekraeft";

const NU = new Date("2026-10-02T10:00:00Z");

const maal = (over: Partial<MaalTilBekraeftelse> & { id: string }): MaalTilBekraeftelse => ({
  title: `Mål ${over.id}`,
  status: "active",
  created_at: "2026-09-01T10:00:00Z",
  source: "advisor",
  bekraeftet_at: null,
  ...over,
});

describe("erBekraeftet — fail-soft på en ulæst kolonne", () => {
  it("undefined (kolonnen ikke læst) tæller SOM I DAG: bekræftet", () => {
    expect(erBekraeftet({ bekraeftet_at: undefined })).toBe(true);
    expect(erBekraeftet({})).toBe(true);
  });
  it("null og tom streng er ubekræftet; et stempel er bekræftet", () => {
    expect(erBekraeftet({ bekraeftet_at: null })).toBe(false);
    expect(erBekraeftet({ bekraeftet_at: "  " })).toBe(false);
    expect(erBekraeftet({ bekraeftet_at: "2026-10-01T08:00:00Z" })).toBe(true);
  });
  it("erUbekraeftetAktivt: kun aktive, ubekræftede", () => {
    expect(erUbekraeftetAktivt({ status: "active", bekraeftet_at: null })).toBe(true);
    expect(erUbekraeftetAktivt({ status: "parked", bekraeftet_at: null })).toBe(false);
    expect(erUbekraeftetAktivt({ status: "active", bekraeftet_at: undefined })).toBe(false);
  });
});

describe("maalKilde — milestones.source som observation", () => {
  it("ordforrådet, målt i koden 2/10", () => {
    expect(maalKilde("manual")).toBe("medlem");
    expect(maalKilde("advisor")).toBe("raadgiver");
    expect(maalKilde("agent")).toBe("ai");
    expect(maalKilde("ai")).toBe("ai");
    expect(maalKilde("handout")).toBe("handout");
    expect(maalKilde("legat")).toBe("legat");
    expect(maalKilde("noget_andet")).toBeNull();
    expect(maalKilde(null)).toBeNull();
  });
  it("overskrift og «skrevet af» følger kilden; ukendt får et neutralt ord", () => {
    expect(forslagOverskrift("advisor")).toBe(BEKRAEFT_ORD.forslagOverskrift.raadgiver);
    expect(forslagOverskrift("xyz")).toBe(BEKRAEFT_ORD.forslagOverskrift.ukendt);
    expect(skrevetAfTekst("handout")).toBe("fra et handout");
    expect(skrevetAfTekst(undefined)).toBe("");
  });
  it("aldrig et personnavn i ordene (profilopslag er bevidst ikke bygget)", () => {
    const alle = [...Object.values(BEKRAEFT_ORD.forslagOverskrift), ...Object.values(BEKRAEFT_ORD.skrevetAf)];
    for (const o of alle) expect(o).not.toMatch(/Morten|Jonas/);
  });
});

describe("delBekraeftelser — nye forslag og gamle mål", () => {
  it("ubekræftede aktive deles på skillelinjen; bekræftede og parkerede er udenfor; ældste først", () => {
    const d = delBekraeftelser([
      maal({ id: "ny2", created_at: "2026-10-05T00:00:00Z" }),
      maal({ id: "gammel", created_at: "2026-06-01T00:00:00Z" }),
      maal({ id: "ny1", created_at: GAMLE_MAAL_FOER }),
      maal({ id: "bekraeftet", bekraeftet_at: "2026-09-01T00:00:00Z" }),
      maal({ id: "parkeret", status: "parked" }),
    ]);
    expect(d.forslag.map((m) => m.id)).toEqual(["ny1", "ny2"]);
    expect(d.gamle.map((m) => m.id)).toEqual(["gammel"]);
  });
  it("modellen slået fra (kolonnen ulæst): begge tomme", () => {
    const d = delBekraeftelser([maal({ id: "a", bekraeftet_at: undefined })]);
    expect(d.forslag).toEqual([]);
    expect(d.gamle).toEqual([]);
  });
});

describe("taellerSomScoreMaal — disciplinens 25 point (beslutning 2/10: aktivt · bekræftet · frist; tal-mål med måltal; art kræves ikke)", () => {
  const ok = { status: "active", bekraeftet_at: "2026-09-01T00:00:00Z", art: "tal", deadline: "2027-03-01", target_value: 2_000_000, udgangspunkt: 1_000_000 };
  it("aktivt · bekræftet · frist · et tal-mål med måltal", () => {
    expect(taellerSomScoreMaal(ok)).toBe(true);
    expect(taellerSomScoreMaal({ ...ok, status: "parked" })).toBe(false);
    expect(taellerSomScoreMaal({ ...ok, bekraeftet_at: null })).toBe(false);
    expect(taellerSomScoreMaal({ ...ok, deadline: null })).toBe(false);
    expect(taellerSomScoreMaal({ ...ok, target_value: null })).toBe(false);
  });
  it("art kræves IKKE (0 af prods manual-mål har en, målt 2/10): et gammelt mål med frist tæller; udgangspunktet kræves ikke", () => {
    expect(taellerSomScoreMaal({ ...ok, art: null, target_value: null, udgangspunkt: null })).toBe(true);
    expect(taellerSomScoreMaal({ ...ok, udgangspunkt: null })).toBe(true);
    // Uden frist tæller det ikke — løfteren siger «Sæt et mål med en frist.».
    expect(taellerSomScoreMaal({ ...ok, art: null, deadline: null })).toBe(false);
  });
  it("et begivenhedsmål med frist tæller; kolonnen ulæst tæller som bekræftet", () => {
    expect(taellerSomScoreMaal({ status: "active", bekraeftet_at: undefined, art: "begivenhed", deadline: "2027-01-01" })).toBe(true);
  });
});

describe("aktiverFelter — «Aktivér» er også et klik (fund 13)", () => {
  const nu = new Date("2026-10-10T08:00:00Z");
  it("et ubekræftet mål bekræftes i samme skrivning; bekræftet eller ulæst kolonne → kun status", () => {
    expect(aktiverFelter({ bekraeftet_at: null }, "u1", nu)).toEqual({ status: "active", bekraeftet_at: nu.toISOString(), bekraeftet_af: "u1" });
    expect(aktiverFelter({ bekraeftet_at: "2026-09-01T00:00:00Z" }, "u1", nu)).toEqual({ status: "active" });
    expect(aktiverFelter({ bekraeftet_at: undefined }, "u1", nu)).toEqual({ status: "active" });
  });
  it("uden bruger (rådgiveren) → kun status: bekræftelsen er medlemmets", () => {
    expect(aktiverFelter({ bekraeftet_at: null }, null, nu)).toEqual({ status: "active" });
  });
});

describe("kvartalstjekket — regnestykket (ankeret er aldrig før KVARTALSTJEK_FRA = 2/10-2026)", () => {
  // I dag 20/4-2027: et mål bekræftet 15/10-2026 har tjek 15/1, 15/4, 15/7-2027 → kvartal 2 venter.
  const NU_2027 = new Date("2027-04-20T10:00:00Z");
  const m = (over: Partial<MaalTilKvartalstjek> = {}): MaalTilKvartalstjek => ({ id: "m1", title: "Omsætning", status: "active", bekraeftet_at: "2026-10-15T12:00:00Z", company_id: "c1", ...over });

  it("anker og datoer: bekræftet 15/10 → 15/1, 15/4, 15/7; 31/8 → 30/11 (dagen klippes); FØR 2/10-2026 → ankeret er 2/10 (fund 9)", () => {
    expect(KVARTALSTJEK_FRA).toBe("2026-10-02");
    expect(kvartalAnker("2026-10-15T12:00:00Z")).toBe("2026-10-15");
    expect(kvartalDatoer("2026-10-15").map((d) => d.dato)).toEqual(["2027-01-15", "2027-04-15", "2027-07-15"]);
    expect(kvartalDatoer("2027-08-31")[0].dato).toBe("2027-11-30");
    // Backfillet bekraeftet_at = created_at 15/1-2026 → anker 2/10-2026 → første tjek 2/1-2027 (regnestykket: 2/10 + 3 mdr.).
    expect(kvartalAnker("2026-01-15T12:00:00Z")).toBe("2026-10-02");
    expect(kvartalDatoer(kvartalAnker("2026-01-15T12:00:00Z")!)[0].dato).toBe("2027-01-02");
    // Dansk dato: 1/10 22:30Z er 2/10 i Danmark = ankerets egen dag.
    expect(kvartalAnker("2026-10-01T22:30:00Z")).toBe("2026-10-02");
    expect(kvartalAnker(null)).toBeNull();
    expect(kvartalAnker("ikke en dato")).toBeNull();
  });
  it("dag 1 (2/10-2026): INTET af de backfillede gamle mål får et tjek — de 6 ældre end 3 måneder ville ellers", () => {
    expect(ventendeKvartalstjek(m({ bekraeftet_at: "2026-01-15T12:00:00Z" }), [], NU)).toBeNull();
    expect(ventendeKvartalstjek(m({ bekraeftet_at: "2025-03-01T12:00:00Z" }), [], NU)).toBeNull();
    // Første tjek for dem: 2/1-2027.
    expect(ventendeKvartalstjek(m({ bekraeftet_at: "2025-03-01T12:00:00Z" }), [], new Date("2027-01-01T12:00:00Z"))).toBeNull();
    expect(ventendeKvartalstjek(m({ bekraeftet_at: "2025-03-01T12:00:00Z" }), [], new Date("2027-01-02T12:00:00Z"))?.dato).toBe("2027-01-02");
  });
  it("i dag 20/4-2027 uden rækker → kvartal 2 (måned 6) venter — kun det seneste forfaldne", () => {
    expect(ventendeKvartalstjek(m(), [], NU_2027)).toEqual({ maalId: "m1", maalTitel: "Omsætning", companyId: "c1", kvartal: 2, maaned: 6, dato: "2027-04-15" });
  });
  it("en registreret række med kvartal ≥ det forfaldne dækker", () => {
    expect(ventendeKvartalstjek(m(), [{ milestone_id: "m1", kvartal: 2 }], NU_2027)).toBeNull();
    expect(ventendeKvartalstjek(m(), [{ milestone_id: "m1", kvartal: 1 }], NU_2027)?.kvartal).toBe(2);
    expect(ventendeKvartalstjek(m(), [{ milestone_id: "andet", kvartal: 3 }], NU_2027)?.kvartal).toBe(2);
  });
  it("før måned 3 og efter måned 12: intet", () => {
    expect(ventendeKvartalstjek(m({ bekraeftet_at: "2027-02-01T00:00:00Z" }), [], NU_2027)).toBeNull();
    expect(ventendeKvartalstjek(m({ bekraeftet_at: "2026-04-01T00:00:00Z" }), [], new Date("2027-10-02T12:00:00Z"))).toBeNull();
    // Dagen før slut (anker 2/10-2026, slut 2/10-2027): kvartal 3 venter stadig.
    expect(ventendeKvartalstjek(m({ bekraeftet_at: "2026-04-01T00:00:00Z" }), [], new Date("2027-10-01T12:00:00Z"))?.kvartal).toBe(3);
  });
  it("dansk dato: et stempel 23:30Z den 19/1 er 20/1 i Danmark (CET) → dato_1 = 20/4, forfalden 20/4", () => {
    expect(ventendeKvartalstjek(m({ bekraeftet_at: "2027-01-19T23:30:00Z" }), [], NU_2027)?.dato).toBe("2027-04-20");
    expect(ventendeKvartalstjek(m({ bekraeftet_at: "2027-01-20T23:30:00Z" }), [], NU_2027)).toBeNull();
  });
  it("kun aktive, bekræftede mål; kolonnen ulæst → intet tjek", () => {
    expect(ventendeKvartalstjek(m({ status: "parked" }), [], NU_2027)).toBeNull();
    expect(ventendeKvartalstjek(m({ status: "completed" }), [], NU_2027)).toBeNull();
    expect(ventendeKvartalstjek(m({ bekraeftet_at: null }), [], NU_2027)).toBeNull();
    expect(ventendeKvartalstjek(m({ bekraeftet_at: undefined }), [], NU_2027)).toBeNull();
  });
  it("alle: ældste forfaldsdato først; pr. virksomhed: flest først", () => {
    const alle = ventendeKvartalstjekAlle(
      [m({ id: "a", bekraeftet_at: "2026-10-15T00:00:00Z", company_id: "c1" }), m({ id: "b", bekraeftet_at: "2027-01-10T00:00:00Z", company_id: "c2" }), m({ id: "c", bekraeftet_at: "2026-06-01T00:00:00Z", company_id: "c2" })],
      [],
      NU_2027,
    );
    // c (anker 2/10-2026): kvartal 2 forfaldt 2/4 · a: kvartal 2 forfaldt 15/4 · b: kvartal 1 forfaldt 10/4.
    expect(alle.map((v) => [v.maalId, v.dato])).toEqual([["c", "2027-04-02"], ["b", "2027-04-10"], ["a", "2027-04-15"]]);
    const pr = kvartalstjekPrVirksomhed(alle);
    expect(pr.map((p) => [p.companyId, p.antal])).toEqual([["c2", 2], ["c1", 1]]);
  });
  it("ordforrådet læses fail-closed", () => {
    expect(KVARTALER).toEqual([1, 2, 3]);
    expect(KVARTAL_VALG).toEqual(["behold", "justeret", "parkeret", "naaet"]);
    expect(laesKvartal(4)).toBeNull();
    expect(laesKvartal("2")).toBeNull();
    expect(laesKvartalValg("naaet")).toBe("naaet");
    expect(laesKvartalValg("slettet")).toBeNull();
  });
});

describe("maaRegistrereKvartalstjek — klientens spejl af INSERT-policyen (fund 11)", () => {
  const NU_2027 = new Date("2027-04-20T10:00:00Z");
  const m = (over: Partial<MaalTilKvartalstjek> = {}): MaalTilKvartalstjek => ({ id: "m1", title: "Omsætning", status: "active", bekraeftet_at: "2026-10-15T12:00:00Z", company_id: "c1", ...over });

  it("samme dom som ventendeKvartalstjek for behold/justeret: forfaldent kvartal, ingen række ≥ k, aktivt og bekræftet", () => {
    expect(maaRegistrereKvartalstjek(m(), [], 2, "behold", NU_2027)).toBe(true);
    expect(maaRegistrereKvartalstjek(m(), [], 1, "justeret", NU_2027)).toBe(true); // kvartal 1 er også forfaldent (svaret dækker bagud)
    expect(maaRegistrereKvartalstjek(m(), [], 3, "behold", NU_2027)).toBe(false); // ikke forfaldent
    expect(maaRegistrereKvartalstjek(m(), [{ milestone_id: "m1", kvartal: 2 }], 2, "behold", NU_2027)).toBe(false);
    expect(maaRegistrereKvartalstjek(m(), [{ milestone_id: "m1", kvartal: 3 }], 2, "behold", NU_2027)).toBe(false);
    expect(maaRegistrereKvartalstjek(m({ bekraeftet_at: null }), [], 2, "behold", NU_2027)).toBe(false);
    expect(maaRegistrereKvartalstjek(m({ bekraeftet_at: undefined }), [], 2, "behold", NU_2027)).toBe(false);
    expect(maaRegistrereKvartalstjek(m({ status: "parked" }), [], 2, "behold", NU_2027)).toBe(false);
    // Efter måned 12: nej.
    expect(maaRegistrereKvartalstjek(m(), [], 3, "behold", new Date("2027-10-15T12:00:00Z"))).toBe(false);
  });
  it("handlingen skrives FØR rækken: parkeret tillader 'parked', naaet tillader 'completed' — og aldrig omvendt", () => {
    expect(maaRegistrereKvartalstjek(m({ status: "parked" }), [], 2, "parkeret", NU_2027)).toBe(true);
    expect(maaRegistrereKvartalstjek(m({ status: "completed" }), [], 2, "naaet", NU_2027)).toBe(true);
    expect(maaRegistrereKvartalstjek(m({ status: "completed" }), [], 2, "parkeret", NU_2027)).toBe(false);
    expect(maaRegistrereKvartalstjek(m({ status: "parked" }), [], 2, "naaet", NU_2027)).toBe(false);
    expect(maaRegistrereKvartalstjek(m({ status: "parked" }), [], 2, "justeret", NU_2027)).toBe(false);
  });
  it("ankeret er det samme som policyens greatest(bekraeftet_at, '2026-10-02')", () => {
    // Backfillet 15/1-2026 → anker 2/10-2026 → kvartal 2 forfalder 2/4-2027: ja 2/4, nej 1/4.
    expect(maaRegistrereKvartalstjek(m({ bekraeftet_at: "2026-01-15T12:00:00Z" }), [], 2, "behold", new Date("2027-04-02T12:00:00Z"))).toBe(true);
    expect(maaRegistrereKvartalstjek(m({ bekraeftet_at: "2026-01-15T12:00:00Z" }), [], 2, "behold", new Date("2027-04-01T12:00:00Z"))).toBe(false);
  });
});
