import { describe, expect, it } from "vitest";
import {
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
  laesKvartal,
  laesKvartalValg,
  maalKilde,
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

describe("taellerSomScoreMaal — disciplinens 25 point", () => {
  const ok = { status: "active", bekraeftet_at: "2026-09-01T00:00:00Z", art: "tal", deadline: "2027-03-01", target_value: 2_000_000, udgangspunkt: 1_000_000 };
  it("aktivt · bekræftet · art · frist · måltal og udgangspunkt", () => {
    expect(taellerSomScoreMaal(ok)).toBe(true);
    expect(taellerSomScoreMaal({ ...ok, status: "parked" })).toBe(false);
    expect(taellerSomScoreMaal({ ...ok, bekraeftet_at: null })).toBe(false);
    expect(taellerSomScoreMaal({ ...ok, art: null })).toBe(false);
    expect(taellerSomScoreMaal({ ...ok, deadline: null })).toBe(false);
    expect(taellerSomScoreMaal({ ...ok, target_value: null })).toBe(false);
    expect(taellerSomScoreMaal({ ...ok, udgangspunkt: null })).toBe(false);
  });
  it("et begivenhedsmål med frist tæller; kolonnen ulæst tæller som bekræftet", () => {
    expect(taellerSomScoreMaal({ status: "active", bekraeftet_at: undefined, art: "begivenhed", deadline: "2027-01-01" })).toBe(true);
  });
});

describe("kvartalstjekket — regnestykket", () => {
  const m = (over: Partial<MaalTilKvartalstjek> = {}): MaalTilKvartalstjek => ({ id: "m1", title: "Omsætning", status: "active", bekraeftet_at: "2026-01-15T12:00:00Z", company_id: "c1", ...over });

  it("anker og datoer: bekræftet 15/1 → 15/4, 15/7, 15/10; 31/8 → 30/11 (dagen klippes)", () => {
    expect(kvartalAnker("2026-01-15T12:00:00Z")).toBe("2026-01-15");
    expect(kvartalDatoer("2026-01-15").map((d) => d.dato)).toEqual(["2026-04-15", "2026-07-15", "2026-10-15"]);
    expect(kvartalDatoer("2026-08-31")[0].dato).toBe("2026-11-30");
    expect(kvartalAnker(null)).toBeNull();
    expect(kvartalAnker("ikke en dato")).toBeNull();
  });
  it("i dag 2/10 uden rækker → kvartal 2 (måned 6) venter — kun det seneste forfaldne", () => {
    expect(ventendeKvartalstjek(m(), [], NU)).toEqual({ maalId: "m1", maalTitel: "Omsætning", companyId: "c1", kvartal: 2, maaned: 6, dato: "2026-07-15" });
  });
  it("en registreret række med kvartal ≥ det forfaldne dækker", () => {
    expect(ventendeKvartalstjek(m(), [{ milestone_id: "m1", kvartal: 2 }], NU)).toBeNull();
    expect(ventendeKvartalstjek(m(), [{ milestone_id: "m1", kvartal: 1 }], NU)?.kvartal).toBe(2);
    expect(ventendeKvartalstjek(m(), [{ milestone_id: "andet", kvartal: 3 }], NU)?.kvartal).toBe(2);
  });
  it("før måned 3 og efter måned 12: intet", () => {
    expect(ventendeKvartalstjek(m({ bekraeftet_at: "2026-08-01T00:00:00Z" }), [], NU)).toBeNull();
    expect(ventendeKvartalstjek(m({ bekraeftet_at: "2025-10-01T00:00:00Z" }), [], NU)).toBeNull();
    // Dagen før slut: kvartal 3 venter stadig.
    expect(ventendeKvartalstjek(m({ bekraeftet_at: "2025-10-03T10:00:00Z" }), [], NU)?.kvartal).toBe(3);
  });
  it("dansk dato: et stempel 22:30Z den 30/6 er 1/7 i Danmark → dato_1 = 1/10, forfalden 2/10", () => {
    expect(ventendeKvartalstjek(m({ bekraeftet_at: "2026-06-30T22:30:00Z" }), [], NU)?.dato).toBe("2026-10-01");
  });
  it("kun aktive, bekræftede mål; kolonnen ulæst → intet tjek", () => {
    expect(ventendeKvartalstjek(m({ status: "parked" }), [], NU)).toBeNull();
    expect(ventendeKvartalstjek(m({ status: "completed" }), [], NU)).toBeNull();
    expect(ventendeKvartalstjek(m({ bekraeftet_at: null }), [], NU)).toBeNull();
    expect(ventendeKvartalstjek(m({ bekraeftet_at: undefined }), [], NU)).toBeNull();
  });
  it("alle: ældste forfaldsdato først; pr. virksomhed: flest først", () => {
    const alle = ventendeKvartalstjekAlle(
      [m({ id: "a", bekraeftet_at: "2026-01-15T00:00:00Z", company_id: "c1" }), m({ id: "b", bekraeftet_at: "2026-06-20T00:00:00Z", company_id: "c2" }), m({ id: "c", bekraeftet_at: "2025-12-01T00:00:00Z", company_id: "c2" })],
      [],
      NU,
    );
    // a: kvartal 2 forfaldt 15/7 · c: kvartal 3 forfaldt 1/9 · b: kvartal 1 forfaldt 20/9.
    expect(alle.map((v) => [v.maalId, v.dato])).toEqual([["a", "2026-07-15"], ["c", "2026-09-01"], ["b", "2026-09-20"]]);
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
