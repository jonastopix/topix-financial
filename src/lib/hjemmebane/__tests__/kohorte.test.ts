import { describe, expect, it } from "vitest";
import {
  INGEN_NYE_TEKST,
  KOHORTE_DAGE,
  KOHORTE_OVERSKRIFT,
  dagsNoegleKbh,
  ikkeKommetIgenDele,
  ikkeKommetIgenDeleTekst,
  ikkeKommetIgenHale,
  ikkeKommetIgenTekst,
  kohorteLinje,
  kohorteTekst,
  startetIDagTekst,
  type KohorteInput,
  type KohorteLogin,
  type KohorteMedlem,
  type KohorteVirksomhed,
} from "@/lib/hjemmebane/kohorte";

/* 17/9 (PR 3, links på navnene): resultatet bærer nu også
   ikkeKommetIgenVirksomheder (id + navn, samme orden som ikkeKommetIgen). De
   syv toEqual-forventninger nedenfor er udvidet med feltet — var ordret
   `{ m, n, ikkeKommetIgen, udeladtIDag }` uden det. Dommen er uændret. */
/* Kohortelinjen (Jonas 16/9): «N af M kom igen efter dag 1». Reglen er
   nulpunktets (16/9 00:57): start = første company_members-række, dansk
   dato, login på en senere dansk dato. `nu` er 16/9-2026 kl. 14:00 dansk
   (12:00 UTC, sommertid UTC+2). */

const NU = new Date("2026-09-16T12:00:00Z");

const v = (id: string, over: Partial<KohorteVirksomhed> = {}): KohorteVirksomhed => ({ id, name: `Firma ${id}`, is_legat: false, er_kunde: true, ...over });
const m = (company_id: string, user_id: string, created_at: string): KohorteMedlem => ({ company_id, user_id, created_at });
const l = (user_id: string, logged_in_at: string): KohorteLogin => ({ user_id, logged_in_at });
const koer = (over: Partial<KohorteInput>): ReturnType<typeof kohorteLinje> =>
  kohorteLinje({ virksomheder: [], medlemmer: [], logins: [], nu: NU, ...over });

describe("dagsNoegleKbh — dansk dato, aldrig browserens", () => {
  it("22:30 UTC den 10/9 er 11/9 i Danmark (sommertid)", () => {
    expect(dagsNoegleKbh(new Date("2026-09-10T22:30:00Z"))).toBe("2026-09-11");
    expect(dagsNoegleKbh(new Date("2026-09-10T21:59:00Z"))).toBe("2026-09-10");
  });
  it("vintertid: 23:30 UTC den 10/1 er 11/1", () => {
    expect(dagsNoegleKbh(new Date("2027-01-10T23:30:00Z"))).toBe("2027-01-11");
  });
});

describe("kohorteLinje — hvem er med", () => {
  it("nul nye → m 0, n 0, ingen navne", () => {
    expect(koer({ virksomheder: [v("a")], medlemmer: [m("a", "u1", "2026-06-01T10:00:00Z")] })).toEqual({ m: 0, n: 0, ikkeKommetIgen: [], ikkeKommetIgenVirksomheder: [], udeladtIDag: 0 });
  });

  it("én kom igen: login på en senere dansk dato", () => {
    const r = koer({ virksomheder: [v("a")], medlemmer: [m("a", "u1", "2026-09-10T08:00:00Z")], logins: [l("u1", "2026-09-12T09:00:00Z")] });
    expect(r).toEqual({ m: 1, n: 1, ikkeKommetIgen: [], ikkeKommetIgenVirksomheder: [], udeladtIDag: 0 });
  });

  it("én ikke kommet igen: kun startdagens logins", () => {
    const r = koer({ virksomheder: [v("a")], medlemmer: [m("a", "u1", "2026-09-10T08:00:00Z")], logins: [l("u1", "2026-09-10T08:00:05Z"), l("u1", "2026-09-10T15:00:00Z")] });
    expect(r).toEqual({ m: 1, n: 0, ikkeKommetIgen: ["Firma a"], ikkeKommetIgenVirksomheder: [{ id: "a", navn: "Firma a" }], udeladtIDag: 0 });
  });

  it("login samme danske dag tæller ikke — heller ikke kl. 23:59 dansk (21:59 UTC)", () => {
    const r = koer({ virksomheder: [v("a")], medlemmer: [m("a", "u1", "2026-09-10T08:00:00Z")], logins: [l("u1", "2026-09-10T21:59:00Z")] });
    expect(r.n).toBe(0);
    expect(r.ikkeKommetIgen).toEqual(["Firma a"]);
  });

  it("login dagen efter tæller — også kl. 00:30 dansk = 22:30 UTC dagen før", () => {
    const r = koer({ virksomheder: [v("a")], medlemmer: [m("a", "u1", "2026-09-10T08:00:00Z")], logins: [l("u1", "2026-09-10T22:30:00Z")] });
    expect(r).toEqual({ m: 1, n: 1, ikkeKommetIgen: [], ikkeKommetIgenVirksomheder: [], udeladtIDag: 0 });
  });

  it("30-døgnsgrænsen: start præcis 30 døgn før er med, 30 døgn og et minut før er ikke", () => {
    const paa = new Date(NU.getTime() - KOHORTE_DAGE * 86_400_000).toISOString();
    const foer = new Date(NU.getTime() - KOHORTE_DAGE * 86_400_000 - 60_000).toISOString();
    expect(koer({ virksomheder: [v("a")], medlemmer: [m("a", "u1", paa)] }).m).toBe(1);
    expect(koer({ virksomheder: [v("a")], medlemmer: [m("a", "u1", foer)] }).m).toBe(0);
  });

  it("legat og ikke-kunde er udeladt; er_kunde null/undefined er kunde (fail-open)", () => {
    const med = [m("a", "u1", "2026-09-10T08:00:00Z"), m("b", "u2", "2026-09-10T08:00:00Z"), m("c", "u3", "2026-09-10T08:00:00Z"), m("d", "u4", "2026-09-10T08:00:00Z")];
    const r = koer({ virksomheder: [v("a", { is_legat: true }), v("b", { er_kunde: false }), v("c", { er_kunde: null }), v("d", { er_kunde: undefined })], medlemmer: med });
    expect(r.m).toBe(2);
    expect(r.ikkeKommetIgen).toEqual(["Firma c", "Firma d"]);
  });

  it("virksomhed uden medlemmer er udeladt — ingen start", () => {
    expect(koer({ virksomheder: [v("a")], medlemmer: [] })).toEqual({ m: 0, n: 0, ikkeKommetIgen: [], ikkeKommetIgenVirksomheder: [], udeladtIDag: 0 });
  });

  it("flere medlemmer hvor kun ét kom igen: virksomheden er kommet igen", () => {
    const r = koer({
      virksomheder: [v("a")],
      medlemmer: [m("a", "u1", "2026-09-10T08:00:00Z"), m("a", "u2", "2026-09-10T08:05:00Z")],
      logins: [l("u1", "2026-09-10T09:00:00Z"), l("u2", "2026-09-13T09:00:00Z")],
    });
    expect(r).toEqual({ m: 1, n: 1, ikkeKommetIgen: [], ikkeKommetIgenVirksomheder: [], udeladtIDag: 0 });
  });

  it("ankeret er den FØRSTE række: et nyt andet medlem gør ikke en gammel virksomhed ny", () => {
    const r = koer({ virksomheder: [v("a")], medlemmer: [m("a", "u1", "2026-03-01T08:00:00Z"), m("a", "u2", "2026-09-14T08:00:00Z")] });
    expect(r.m).toBe(0);
  });

  it("startet i dag (dansk dato) er ikke i M men tælles i udeladtIDag", () => {
    const r = koer({ virksomheder: [v("a"), v("b")], medlemmer: [m("a", "u1", "2026-09-16T05:00:00Z"), m("b", "u2", "2026-09-15T21:00:00Z")] });
    // b startede 15/9 kl. 23:00 dansk → før i dag → med; a startede 16/9 → udeladt.
    expect(r).toEqual({ m: 1, n: 0, ikkeKommetIgen: ["Firma b"], ikkeKommetIgenVirksomheder: [{ id: "b", navn: "Firma b" }], udeladtIDag: 1 });
  });

  it("et login FØR startdagen tæller ikke (en importeret bruger med gammel historik)", () => {
    const r = koer({ virksomheder: [v("a")], medlemmer: [m("a", "u1", "2026-09-10T08:00:00Z")], logins: [l("u1", "2026-08-01T09:00:00Z")] });
    expect(r.n).toBe(0);
  });

  it("ikkeKommetIgen er ældste start først", () => {
    const r = koer({
      virksomheder: [v("ny"), v("aeldst"), v("midt")],
      medlemmer: [m("ny", "u1", "2026-09-14T08:00:00Z"), m("aeldst", "u2", "2026-09-01T08:00:00Z"), m("midt", "u3", "2026-09-07T08:00:00Z")],
    });
    expect(r.ikkeKommetIgen).toEqual(["Firma aeldst", "Firma midt", "Firma ny"]);
  });

  it("ugyldige datoer ignoreres roligt", () => {
    const r = koer({ virksomheder: [v("a")], medlemmer: [m("a", "u1", "ikke en dato")], logins: [l("u1", "heller ikke")] });
    // 17/9 (PR 3): var `{ m: 0, n: 0, ikkeKommetIgen: [], udeladtIDag: 0 }` — feltet
    // ikkeKommetIgenVirksomheder (id + navn) kom til, så navnene kan linke.
    expect(r).toEqual({ m: 0, n: 0, ikkeKommetIgen: [], ikkeKommetIgenVirksomheder: [], udeladtIDag: 0 });
  });
});

describe("ordene", () => {
  it("overskrift og tom tilstand", () => {
    expect(KOHORTE_OVERSKRIFT).toBe("Nye medlemmer (30 dage)");
    expect(kohorteTekst({ m: 0, n: 0 })).toBe(INGEN_NYE_TEKST);
    expect(INGEN_NYE_TEKST).toBe("Ingen nye medlemmer de sidste 30 dage.");
  });
  it("«N af M kom igen efter dag 1»", () => {
    expect(kohorteTekst({ m: 5, n: 3 })).toBe("3 af 5 kom igen efter dag 1");
    expect(kohorteTekst({ m: 1, n: 0 })).toBe("0 af 1 kom igen efter dag 1");
  });
  it("startet i dag: kun når der er nogen", () => {
    expect(startetIDagTekst(0)).toBeNull();
    expect(startetIDagTekst(2)).toBe("(+ 2 startet i dag)");
  });
  it("ikke kommet igen: højst fem navne, ellers «… og N mere»; null uden navne", () => {
    expect(ikkeKommetIgenTekst([])).toBeNull();
    expect(ikkeKommetIgenTekst(["A", "B", "C"])).toBe("Ikke kommet igen: A, B, C");
    expect(ikkeKommetIgenTekst(["A", "B", "C", "D", "E", "F", "G"])).toBe("Ikke kommet igen: A, B, C, D, E … og 2 mere");
    expect(ikkeKommetIgenTekst(["A", "B", "C", "D", "E"])).toBe("Ikke kommet igen: A, B, C, D, E");
  });
});

/* Links på navnene (17/9, PR 3): virksomhederne med id, og linjen i dele. */
describe("ikkeKommetIgenVirksomheder og ikkeKommetIgenDele", () => {
  it("samme virksomheder som ikkeKommetIgen, samme orden (ældste start først), med id", () => {
    const r = koer({
      virksomheder: [v("ny"), v("aeldst"), v("midt")],
      medlemmer: [m("ny", "u1", "2026-09-14T08:00:00Z"), m("aeldst", "u2", "2026-09-01T08:00:00Z"), m("midt", "u3", "2026-09-07T08:00:00Z")],
    });
    expect(r.ikkeKommetIgenVirksomheder).toEqual([
      { id: "aeldst", navn: "Firma aeldst" },
      { id: "midt", navn: "Firma midt" },
      { id: "ny", navn: "Firma ny" },
    ]);
    expect(r.ikkeKommetIgenVirksomheder.map((x) => x.navn)).toEqual(r.ikkeKommetIgen);
  });
  it("delene siger det teksten siger — også over loftet på fem", () => {
    const navne = ["A", "B", "C", "D", "E", "F", "G"];
    const virksomheder = navne.map((n) => ({ id: n.toLowerCase(), navn: n }));
    for (const antal of [0, 1, 3, 5, 7]) {
      const dele = ikkeKommetIgenDele(virksomheder.slice(0, antal));
      expect(ikkeKommetIgenDeleTekst(dele)).toBe(ikkeKommetIgenTekst(navne.slice(0, antal)));
    }
  });
  it("højst fem viste; flere tælles; null uden navne", () => {
    const virksomheder = ["A", "B", "C", "D", "E", "F", "G"].map((n) => ({ id: n, navn: n }));
    const dele = ikkeKommetIgenDele(virksomheder)!;
    expect(dele.viste.map((x) => x.id)).toEqual(["A", "B", "C", "D", "E"]);
    expect(dele.flere).toBe(2);
    expect(ikkeKommetIgenHale(2)).toBe(" … og 2 mere");
    expect(ikkeKommetIgenHale(0)).toBe("");
    expect(ikkeKommetIgenDele([])).toBeNull();
  });
});
