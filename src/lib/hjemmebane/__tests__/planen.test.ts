import { describe, expect, it } from "vitest";
import { erMedlemmetsEget, fremdriftTekst, grupperSkridt, MEDLEMMETS_EGET_KILDE, MEDLEMMETS_EGET_TEKST, planenDom, planenTekst, udenBevaegelseTekst, type MaalRaekke, type SkridtRaekke } from "@/lib/hjemmebane/planen";

/* «Planen» på virksomhedssiden (fase 2, 16/9): målene i tre grupper, skridt
   under hvert, knappernes tilstand, gennemgangen ved flere end tre aktive. */

const NU = new Date("2026-09-16T20:00:00Z");
const maal = (over: Partial<MaalRaekke> & { id: string }): MaalRaekke => ({
  title: `Mål ${over.id}`, status: "active", progress: 0, deadline: null, category: "other", source: "manual",
  progress_updated_at: "2026-09-10T10:00:00Z", completed_at: null, created_at: "2026-09-01T00:00:00Z", ...over,
});
const skridt = (over: Partial<SkridtRaekke> & { id: string; maal_id: string | null }): SkridtRaekke => ({
  title: `Skridt ${over.id}`, status: "active", due_date: null, ...over,
});

describe("planenDom — grupperne", () => {
  it("aktive, parkerede og nåede efter milepaelDom; progress 100 er nået selv med status active (Jonas: A)", () => {
    const d = planenDom([
      maal({ id: "a" }), maal({ id: "p", status: "parked" }), maal({ id: "n", status: "completed", completed_at: "2026-09-12T00:00:00Z" }),
      maal({ id: "h", status: "active", progress: 100 }),
    ], [], NU);
    expect(d.aktive.map((x) => x.maal.id)).toEqual(["a"]);
    expect(d.parkerede.map((x) => x.maal.id)).toEqual(["p"]);
    expect(d.naaede.map((x) => x.maal.id)).toEqual(["n", "h"]);
    expect(d.gennemgang).toBe(false);
    expect(d.kanSaetteMaal).toBe(true);
    expect(d.tekst).toBe("1 af 3 aktive · 1 parkeret · 2 nåede");
  });
  it("ældste først i hver gruppe", () => {
    const d = planenDom([maal({ id: "ny", created_at: "2026-09-10T00:00:00Z" }), maal({ id: "gl", created_at: "2026-08-01T00:00:00Z" })], [], NU);
    expect(d.aktive.map((x) => x.maal.id)).toEqual(["gl", "ny"]);
  });
  it("ingen mål: teksten beder om at sætte dem sammen med medlemmet", () => {
    const d = planenDom([], [], NU);
    expect(d.tekst).toBe("Ingen mål endnu — sæt dem sammen med medlemmet");
    expect(d.kanSaetteMaal).toBe(true);
  });
});

describe("planenDom — gennemgangen (flere end tre aktive)", () => {
  const fire = ["a", "b", "c", "d"].map((id, i) => maal({ id, created_at: `2026-0${(i % 9) + 1}-01T00:00:00Z` }));
  it("fire aktive → gennemgang; ingen ny kan sættes; parkerede kan ikke aktiveres; foreslå skridt er lukket", () => {
    const d = planenDom([...fire, maal({ id: "p", status: "parked" })], [], NU);
    expect(d.gennemgang).toBe(true);
    expect(d.kanSaetteMaal).toBe(false);
    expect(d.tekst).toBe("Gennemgå målene: 4 aktive — behold højst 3, parkér eller markér resten som nået");
    for (const x of d.aktive) expect(x.handlinger).toEqual({ kanAktivere: false, kanParkere: true, kanMarkereNaaet: true, kanForeslaaSkridt: false });
    expect(d.parkerede[0].handlinger.kanAktivere).toBe(false);
  });
  it("præcis tre aktive → ingen gennemgang, men ingen plads til en fjerde; parkerede kan ikke aktiveres", () => {
    const d = planenDom([...fire.slice(0, 3), maal({ id: "p", status: "parked" })], [], NU);
    expect(d.gennemgang).toBe(false);
    expect(d.kanSaetteMaal).toBe(false);
    expect(d.parkerede[0].handlinger.kanAktivere).toBe(false);
    expect(d.aktive[0].handlinger.kanForeslaaSkridt).toBe(true);
  });
  it("to aktive → plads: parkerede og nåede kan aktiveres (genåbnes)", () => {
    const d = planenDom([...fire.slice(0, 2), maal({ id: "p", status: "parked" }), maal({ id: "n", status: "completed" })], [], NU);
    expect(d.kanSaetteMaal).toBe(true);
    expect(d.parkerede[0].handlinger.kanAktivere).toBe(true);
    expect(d.naaede[0].handlinger.kanAktivere).toBe(true);
    expect(d.naaede[0].handlinger.kanMarkereNaaet).toBe(false);
  });
});

describe("planenDom — skridtene under målet og fremdriften", () => {
  it("skridt grupperes: venter (proposed), aktive, gjorte, andre; skridt uden maal_id står for sig", () => {
    const d = planenDom([maal({ id: "a", progress: 40 })], [
      skridt({ id: "s1", maal_id: "a", status: "proposed" }), skridt({ id: "s2", maal_id: "a", status: "active" }),
      skridt({ id: "s3", maal_id: "a", status: "done" }), skridt({ id: "s4", maal_id: "a", status: "dismissed" }),
      skridt({ id: "s5", maal_id: null, status: "proposed" }),
    ], NU);
    const x = d.aktive[0];
    expect(x.skridt.venter.map((s) => s.id)).toEqual(["s1"]);
    expect(x.skridt.aktive.map((s) => s.id)).toEqual(["s2"]);
    expect(x.skridt.gjorte.map((s) => s.id)).toEqual(["s3"]);
    expect(x.skridt.andre.map((s) => s.id)).toEqual(["s4"]);
    expect(d.udenMaal.map((s) => s.id)).toEqual(["s5"]);
  });
  it("fremdriften er BEREGNET når målet har tællende skridt (rækkens 40 ignoreres): 1 af 2 → 50 %", () => {
    const d = planenDom([maal({ id: "a", progress: 40 })], [skridt({ id: "s2", maal_id: "a", status: "active" }), skridt({ id: "s3", maal_id: "a", status: "done" })], NU);
    expect(d.aktive[0].fremdrift).toBe(50);
    expect(d.aktive[0].beregnet).toBe(true);
    expect(fremdriftTekst(d.aktive[0])).toBe("1 af 2 skridt gjort · 50 %");
  });
  it("kun forslag under målet → ikke beregnet: rækkens tal vises", () => {
    const d = planenDom([maal({ id: "a", progress: 40 })], [skridt({ id: "s1", maal_id: "a", status: "proposed" })], NU);
    expect(d.aktive[0].fremdrift).toBe(40);
    expect(d.aktive[0].beregnet).toBe(false);
    expect(fremdriftTekst(d.aktive[0])).toBe("40 %");
  });
  it("not_done og dropped tæller med i «af N»", () => {
    const d = planenDom([maal({ id: "a" })], [skridt({ id: "1", maal_id: "a", status: "done" }), skridt({ id: "2", maal_id: "a", status: "dropped" }), skridt({ id: "3", maal_id: "a", status: "not_done" })], NU);
    expect(fremdriftTekst(d.aktive[0])).toBe("1 af 3 skridt gjort · 33 %");
  });
  it("grupperSkridt alene", () => {
    expect(grupperSkridt([skridt({ id: "x", maal_id: "a", status: "expired" })]).andre).toHaveLength(1);
  });
});

describe("dage uden bevægelse", () => {
  it("regnes fra progress_updated_at; teksten kun fra 30 dage", () => {
    const d = planenDom([maal({ id: "a", progress_updated_at: "2026-06-30T10:00:00Z" }), maal({ id: "b", progress_updated_at: "2026-09-10T10:00:00Z" }), maal({ id: "c", progress_updated_at: null })], [], NU);
    expect(d.aktive[0].dageUdenBevaegelse).toBe(78);
    expect(udenBevaegelseTekst(d.aktive[0].dageUdenBevaegelse)).toBe("Ingen bevægelse i 78 dage");
    expect(d.aktive[1].dageUdenBevaegelse).toBe(6);
    expect(udenBevaegelseTekst(6)).toBeNull();
    expect(d.aktive[2].dageUdenBevaegelse).toBeNull();
    expect(udenBevaegelseTekst(null)).toBeNull();
    expect(udenBevaegelseTekst(30)).toBe("Ingen bevægelse i 30 dage");
  });
});

describe("planenTekst", () => {
  it("ental og flertal", () => {
    expect(planenTekst(2, 0, 1, false)).toBe("2 af 3 aktive · 1 nået");
    expect(planenTekst(3, 2, 0, false)).toBe("3 af 3 aktive · 2 parkerede");
    expect(planenTekst(0, 1, 0, false)).toBe("0 af 3 aktive · 1 parkeret");
  });
});

describe("erMedlemmetsEget — mærket «medlemmets eget» (skridt-tilfoej, 17/9)", () => {
  it("source_type 'manual' er medlemmets eget; advisor/ai_weekly/agent, null og udeladt er det ikke", () => {
    expect(MEDLEMMETS_EGET_KILDE).toBe("manual");
    expect(MEDLEMMETS_EGET_TEKST).toBe("medlemmets eget");
    expect(erMedlemmetsEget(skridt({ id: "e", maal_id: "m", source_type: "manual" }))).toBe(true);
    for (const k of ["advisor", "ai_weekly", "agent", "reflection", null, undefined]) {
      expect(erMedlemmetsEget(skridt({ id: "x", maal_id: "m", source_type: k }))).toBe(false);
    }
  });
  it("skridtet grupperes som alle andre — kilden ændrer ikke gruppen eller fremdriften", () => {
    const d = planenDom([maal({ id: "m" })], [skridt({ id: "e", maal_id: "m", source_type: "manual" }), skridt({ id: "g", maal_id: "m", status: "done", source_type: "manual" })], NU);
    expect(d.aktive[0].skridt.aktive.map((s) => s.id)).toEqual(["e"]);
    expect(d.aktive[0].skridt.gjorte.map((s) => s.id)).toEqual(["g"]);
    expect(d.aktive[0].fremdrift).toBe(50);
  });
});
