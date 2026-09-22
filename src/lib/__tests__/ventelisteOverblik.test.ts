import { describe, expect, it } from "vitest";
import {
  antalKanTilbydes,
  bygVentelisteOverblik,
  type OverblikInput,
  TILSTAND_ORD,
  TILSTANDE,
  tilstandFor,
} from "../ansoegninger/ventelisteOverblik";
import type { VentepladsRaekke } from "../ventelisteDom";

/**
 * Ventelisten under Ansøgninger (udkast 22/9-2026). Dommen komponerer husets
 * eksisterende domme; prøverne her viser, at den komponerer dem RIGTIGT —
 * især at rækkefølgen af tjek gør, hvad filhovedet siger.
 */

const NU = new Date("2026-09-22T18:30:00.000Z");

const plads = (
  id: string,
  over: Partial<VentepladsRaekke> = {},
): VentepladsRaekke => ({
  id,
  ansoegning_id: `a-${id}`,
  company_id: "c1",
  status: "venter",
  sat_at: "2026-09-01T10:00:00.000Z",
  afvist_at: "2026-09-01T10:00:00.000Z",
  tidligst_tilbud_at: null,
  ...over,
});

const input = (p: VentepladsRaekke, koe: VentepladsRaekke[], over: Partial<OverblikInput> = {}): OverblikInput => ({
  venteplads: p,
  ansoegerNavn: `Ansøger ${p.id}`,
  virksomhed: "Studio Mini ApS",
  fornyelseStatus: "ophoert", // ledig
  koe,
  tilbudUdloeberAt: null,
  ...over,
});

describe("ventelisteOverblik — tilstanden for én venteplads", () => {
  it("først i køen, ledig plads, intet tilbud ude → kan tilbydes nu", () => {
    const p = plads("p1");
    expect(tilstandFor(input(p, [p]), NU)).toBe("kan_tilbydes_nu");
  });

  it("rækken bærer selv tilbuddet → «tilbudt», uanset alt andet", () => {
    const p = plads("p1", { status: "tilbudt" });
    // Selv hvis pladsen ikke længere er ledig: tilbuddet ER sendt, fristen løber.
    expect(tilstandFor(input(p, [p], { fornyelseStatus: "aktiv" }), NU)).toBe("tilbudt");
  });

  it("pladsen er ikke ledig → alle venter på pladsen", () => {
    const p = plads("p1");
    expect(tilstandFor(input(p, [p], { fornyelseStatus: "aktiv" }), NU)).toBe("venter_paa_plads");
  });

  it("en ANDEN har tilbuddet → resten venter på svaret", () => {
    const a = plads("p1", { status: "tilbudt" });
    const b = plads("p2", { sat_at: "2026-09-02T10:00:00.000Z", afvist_at: "2026-09-02T10:00:00.000Z" });
    expect(tilstandFor(input(b, [a, b]), NU)).toBe("tilbud_ude");
  });

  it("først i køen, men «tidligst»-datoen er ikke nået → venter på dato", () => {
    // ABC hundeudstyr → Doggybed: tidligst 13/10.
    const p = plads("p1", { tidligst_tilbud_at: "2026-10-13" });
    expect(tilstandFor(input(p, [p]), NU)).toBe("venter_paa_dato");
  });

  it("«tidligst»-datoen er nået → kan tilbydes nu", () => {
    const p = plads("p1", { tidligst_tilbud_at: "2026-09-01" });
    expect(tilstandFor(input(p, [p]), NU)).toBe("kan_tilbydes_nu");
  });

  it("ikke først i køen → venter i kø", () => {
    const a = plads("p1", { afvist_at: "2026-09-01T10:00:00.000Z" });
    const b = plads("p2", { afvist_at: "2026-09-05T10:00:00.000Z" });
    expect(tilstandFor(input(b, [a, b]), NU)).toBe("venter_i_koe");
  });

  it("den FØRSTE holdes tilbage af en dato — den NÆSTE rykker ikke op", () => {
    // Køens orden er ancienniteten; en dato holder rækken tilbage, men giver
    // ikke pladsen videre. Ellers ville «tidligst» blive til «aldrig» for den
    // første, hver gang nogen stod bag ham.
    const a = plads("p1", { afvist_at: "2026-09-01T10:00:00.000Z", tidligst_tilbud_at: "2026-10-13" });
    const b = plads("p2", { afvist_at: "2026-09-05T10:00:00.000Z" });
    expect(tilstandFor(input(a, [a, b]), NU)).toBe("venter_paa_dato");
    // b er nu den, klarTilTilbud peger på — og det ER husets regel (klarTilTilbud).
    expect(tilstandFor(input(b, [a, b]), NU)).toBe("kan_tilbydes_nu");
  });
});

describe("ventelisteOverblik — listen", () => {
  const ledig = "ophoert";

  it("sorterer det, der kan handles på, øverst", () => {
    const iKoe = plads("p3", { company_id: "c2", afvist_at: "2026-09-10T10:00:00.000Z" });
    const foerst = plads("p4", { company_id: "c2", afvist_at: "2026-09-01T10:00:00.000Z" });
    const paaDato = plads("p5", { company_id: "c3", tidligst_tilbud_at: "2026-10-13" });
    const laast = plads("p6", { company_id: "c4" });
    const raekker = bygVentelisteOverblik([
      input(iKoe, [foerst, iKoe], { fornyelseStatus: ledig }),
      input(laast, [laast], { fornyelseStatus: "aktiv" }),
      input(paaDato, [paaDato], { fornyelseStatus: ledig }),
      input(foerst, [foerst, iKoe], { fornyelseStatus: ledig }),
    ], NU);
    expect(raekker.map((r) => r.tilstand)).toEqual([
      "kan_tilbydes_nu", "venter_paa_dato", "venter_i_koe", "venter_paa_plads",
    ]);
  });

  it("inden for samme tilstand vinder ancienniteten — som i køen", () => {
    const gammel = plads("p1", { company_id: "c1", afvist_at: "2026-01-01T10:00:00.000Z" });
    const ny = plads("p2", { company_id: "c2", afvist_at: "2026-09-01T10:00:00.000Z" });
    const raekker = bygVentelisteOverblik([
      input(ny, [ny], { fornyelseStatus: ledig }),
      input(gammel, [gammel], { fornyelseStatus: ledig }),
    ], NU);
    expect(raekker.map((r) => r.ventepladsId)).toEqual(["p1", "p2"]);
  });

  it("bærer nummeret i køen, tilbuddets frist, datoen og om pladsen er ledig", () => {
    const a = plads("p1", { afvist_at: "2026-09-01T10:00:00.000Z" });
    const b = plads("p2", { afvist_at: "2026-09-05T10:00:00.000Z", tidligst_tilbud_at: "2026-10-13" });
    const raekker = bygVentelisteOverblik([
      input(a, [a, b], { tilbudUdloeberAt: "2026-09-29T10:00:00.000Z" }),
      input(b, [a, b]),
    ], NU);
    const r1 = raekker.find((r) => r.ventepladsId === "p1")!;
    const r2 = raekker.find((r) => r.ventepladsId === "p2")!;
    expect(r1.nummer).toBe(1);
    expect(r1.tilbudUdloeberAt).toBe("2026-09-29T10:00:00.000Z");
    expect(r1.pladsLedig).toBe(true);
    expect(r2.nummer).toBe(2);
    expect(r2.tidligstTilbudAt).toBe("2026-10-13");
  });

  it("tom ind = tom ud", () => {
    expect(bygVentelisteOverblik([], NU)).toEqual([]);
    expect(antalKanTilbydes([])).toBe(0);
  });

  it("antalKanTilbydes tæller kun dem, knappen virker på", () => {
    const a = plads("p1", { company_id: "c1" });
    const b = plads("p2", { company_id: "c2" });
    const c = plads("p3", { company_id: "c3" });
    const raekker = bygVentelisteOverblik([
      input(a, [a], { fornyelseStatus: ledig }),
      input(b, [b], { fornyelseStatus: ledig }),
      input(c, [c], { fornyelseStatus: "aktiv" }),
    ], NU);
    expect(antalKanTilbydes(raekker)).toBe(2);
  });

  it("de to målte sager 22/9: Tatti kan tilbydes, ABC venter på 13/10", () => {
    const tatti = plads("v-tatti", { company_id: "studio-mini", afvist_at: "2026-09-22T13:06:00.000Z" });
    const abc = plads("v-abc", { company_id: "doggybed", afvist_at: "2026-09-22T13:06:00.000Z", tidligst_tilbud_at: "2026-10-13" });
    const raekker = bygVentelisteOverblik([
      input(abc, [abc], { fornyelseStatus: "udloebet_tilbyd_ikke", virksomhed: "Doggybed", ansoegerNavn: "ABC hundeudstyr" }),
      input(tatti, [tatti], { fornyelseStatus: "ophoert", virksomhed: "Studio Mini ApS", ansoegerNavn: "Tatti ApS" }),
    ], NU);
    expect(raekker[0].ansoegerNavn).toBe("Tatti ApS");
    expect(raekker[0].tilstand).toBe("kan_tilbydes_nu");
    expect(raekker[1].ansoegerNavn).toBe("ABC hundeudstyr");
    expect(raekker[1].tilstand).toBe("venter_paa_dato");
  });

  it("hver tilstand har et ord — ellers ville skærmen vise en nøgle", () => {
    for (const t of TILSTANDE) expect(`${t}: ${TILSTAND_ORD[t]}`).not.toBe(`${t}: undefined`);
  });
});
