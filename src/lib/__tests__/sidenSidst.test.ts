import { describe, expect, it } from "vitest";
import {
  NAVNE_MAKS,
  SIDEN_SIDST_LOFT_DAGE,
  erFunktionenIkkeFundet,
  intetNytTekst,
  samlNavne,
  sidenAf,
  sidenSidstLinjeDele,
  sidenSidstLinjeTekst,
  sidenSidstLinjer,
  sidenSidstNavneSep,
  sidenTekst,
  talord,
  type SidenSidstRaekke,
} from "@/lib/sidenSidst";

const NU = new Date(2026, 8, 9, 8, 30); // 9. september 2026, morgen
const dageSiden = (d: number, t = 9) => new Date(2026, 8, 9 - d, t, 0);

describe("sidenAf — syv-dages-loftet", () => {
  it("i går → i går; en uge → loftet; en måned → loftet (syv dage)", () => {
    expect(sidenAf(dageSiden(1), NU).getTime()).toBe(dageSiden(1).getTime());
    expect(sidenAf(dageSiden(7, 8), NU).getTime()).toBe(NU.getTime() - 7 * 86_400_000); // 7 dage + 30 min → loftet
    expect(sidenAf(dageSiden(6), NU).getTime()).toBe(dageSiden(6).getTime()); // inden for loftet
    expect(sidenAf(dageSiden(30), NU).getTime()).toBe(NU.getTime() - 7 * 86_400_000);
    expect(SIDEN_SIDST_LOFT_DAGE).toBe(7);
  });
  it("uden stempel (første gang) → loftet; ulæseligt → loftet; fremtid → nu", () => {
    expect(sidenAf(null, NU).getTime()).toBe(NU.getTime() - 7 * 86_400_000);
    expect(sidenAf("nej", NU).getTime()).toBe(NU.getTime() - 7 * 86_400_000);
    expect(sidenAf(new Date(NU.getTime() + 60_000), NU).getTime()).toBe(NU.getTime());
  });
  it("tager både ISO-streng og Date", () => {
    expect(sidenAf(dageSiden(2).toISOString(), NU).getTime()).toBe(dageSiden(2).getTime());
  });
});

describe("sidenTekst", () => {
  it("i morges / i går / de seneste N dage / den seneste uge", () => {
    expect(sidenTekst(new Date(2026, 8, 9, 6), NU)).toBe("siden i morges");
    expect(sidenTekst(dageSiden(1), NU)).toBe("siden i går");
    expect(sidenTekst(dageSiden(3), NU)).toBe("de seneste 3 dage");
    expect(sidenTekst(sidenAf(dageSiden(30), NU), NU)).toBe("den seneste uge");
    expect(intetNytTekst(dageSiden(1), NU)).toBe("Intet nyt siden i går.");
  });
});

describe("samlNavne og talord", () => {
  it("ét, to, tre navne", () => {
    expect(samlNavne(["Doggybed"])).toBe("Doggybed");
    expect(samlNavne(["Doggybed", "PHILBERT"])).toBe("Doggybed og PHILBERT");
    expect(samlNavne(["Doggybed", "PHILBERT", "Floren"])).toBe("Doggybed, PHILBERT og Floren");
  });
  it("flere end tre: «og N andre», ental «anden»", () => {
    expect(NAVNE_MAKS).toBe(3);
    expect(samlNavne(["Doggybed", "PHILBERT", "Floren", "Rezycl"])).toBe("Doggybed, PHILBERT, Floren og en anden");
    expect(samlNavne(["Doggybed", "PHILBERT", "Floren", "Rezycl", "CARMA", "Brick Works"])).toBe("Doggybed, PHILBERT, Floren og tre andre");
  });
  it("tomme og blanke navne ignoreres", () => {
    expect(samlNavne([])).toBe("");
    expect(samlNavne([" ", "Doggybed"])).toBe("Doggybed");
  });
  it("talord til tolv, ellers tal", () => {
    expect(talord(3)).toBe("Tre");
    expect(talord(12)).toBe("Tolv");
    expect(talord(13)).toBe("13");
    expect(talord(2, false)).toBe("to");
  });
});

describe("sidenSidstLinjer", () => {
  it("Jonas' eksempel, ordret", () => {
    const l = sidenSidstLinjer([{ slags: "rapporter", antal: 3, navne: ["Doggybed", "PHILBERT", "Floren"] }]);
    expect(l[0].tekst).toBe("Tre rapporter kom ind · Doggybed, PHILBERT og Floren");
  });
  it("ental/flertal pr. slags, størst først, nul og ukendte slags ude", () => {
    const l = sidenSidstLinjer([
      { slags: "medlemmer", antal: 1, navne: ["Ny ApS"] },
      { slags: "beskeder", antal: 5, navne: ["Doggybed", "Floren"] },
      { slags: "svar", antal: 1, navne: ["CARMA STUDIO"] },
      { slags: "betalinger", antal: 0, navne: [] },
      { slags: "andet", antal: 9, navne: ["x"] },
      { slags: "betalinger", antal: 2, navne: ["Rezycl", "Brick Works"] },
    ]);
    expect(l.map((x) => x.tekst)).toEqual([
      "Fem nye beskeder · Doggybed og Floren",
      "To betalinger · Rezycl og Brick Works",
      "Et nyt medlem · Ny ApS",
      "Et forslag besvaret · CARMA STUDIO",
    ]);
  });
  it("«og N andre» regnes af navnene, ikke af hændelserne: tre beskeder fra én virksomhed", () => {
    const l = sidenSidstLinjer([{ slags: "beskeder", antal: 3, navne: ["Doggybed"] }]);
    expect(l[0].tekst).toBe("Tre nye beskeder · Doggybed");
  });
});

/* Links på navnene (17/9, PR 3): linjen i DELE. Kontrakten: delene siger
   præcis det teksten siger — sidenSidstLinjeTekst(dele) === tekst. */
describe("sidenSidstLinjeDele — delene siger det teksten siger", () => {
  const raekker: SidenSidstRaekke[] = [
    { slags: "rapporter", antal: 3, navne: ["Doggybed", "PHILBERT", "Floren"], virksomheder: [{ id: "d", navn: "Doggybed" }, { id: "p", navn: "PHILBERT" }, { id: "f", navn: "Floren" }] },
    { slags: "beskeder", antal: 5, navne: ["A", "B", "C", "D", "E"], virksomheder: [{ id: "a", navn: "A" }, { id: "b", navn: "B" }, { id: "c", navn: "C" }, { id: "d", navn: "D" }, { id: "e", navn: "E" }] },
    { slags: "svar", antal: 1, navne: ["CARMA STUDIO"], virksomheder: [{ id: "c1", navn: "CARMA STUDIO" }] },
    { slags: "medlemmer", antal: 2, navne: ["Ny ApS", "Anden"] },
    { slags: "betalinger", antal: 4, navne: ["X", "Y", "Z", "W"] },
    { slags: "betalinger", antal: 0, navne: [] },
    { slags: "andet", antal: 9, navne: ["x"] },
    { slags: "rapporter", antal: 1, navne: [] },
  ];
  it("for hver linje: samme slags, antal og tekst som sidenSidstLinjer, i samme orden", () => {
    const tekst = sidenSidstLinjer(raekker);
    const dele = sidenSidstLinjeDele(raekker);
    expect(dele.map((d) => [d.slags, d.antal])).toEqual(tekst.map((t) => [t.slags, t.antal]));
    expect(dele.map(sidenSidstLinjeTekst)).toEqual(tekst.map((t) => t.tekst));
  });
  it("id'erne følger med når rækken har virksomheder; null når kun navne (den gamle RPC)", () => {
    const dele = sidenSidstLinjeDele(raekker);
    const rapporter = dele.find((d) => d.slags === "rapporter" && d.antal === 3)!;
    expect(rapporter.viste).toEqual([{ id: "d", navn: "Doggybed" }, { id: "p", navn: "PHILBERT" }, { id: "f", navn: "Floren" }]);
    expect(rapporter.efter).toBe("");
    const medlemmer = dele.find((d) => d.slags === "medlemmer")!;
    expect(medlemmer.viste).toEqual([{ id: null, navn: "Ny ApS" }, { id: null, navn: "Anden" }]);
  });
  it("højst NAVNE_MAKS vises; halen «to andre»/«en anden»; blanke navne ud", () => {
    const [b] = sidenSidstLinjeDele([{ slags: "beskeder", antal: 5, navne: [" A ", "", "B", "C", "D", "E"] }]);
    expect(b.viste.map((v) => v.navn)).toEqual(["A", "B", "C"]);
    expect(b.viste).toHaveLength(NAVNE_MAKS);
    expect(b.efter).toBe("to andre");
    const [en] = sidenSidstLinjeDele([{ slags: "beskeder", antal: 4, navne: ["A", "B", "C", "D"] }]);
    expect(en.efter).toBe("en anden");
  });
  it("skilletegnene: «, » mellem, « og » før det sidste — men «, » hele vejen når «… andre» følger", () => {
    expect([0, 1, 2].map((i) => sidenSidstNavneSep(i, 3, false))).toEqual(["", ", ", " og "]);
    expect([0, 1, 2].map((i) => sidenSidstNavneSep(i, 3, true))).toEqual(["", ", ", ", "]);
    expect(sidenSidstNavneSep(1, 2, false)).toBe(" og ");
  });
  it("uden navne: kun hovedet", () => {
    const [d] = sidenSidstLinjeDele([{ slags: "rapporter", antal: 1, navne: [] }]);
    expect(d.viste).toEqual([]);
    expect(sidenSidstLinjeTekst(d)).toBe("En rapport kom ind");
  });
});

describe("erFunktionenIkkeFundet — kun PostgREST's «funktionen findes ikke» sender hooken tilbage", () => {
  it("PGRST202, eller beskeden «Could not find the function», er «findes ikke»", () => {
    expect(erFunktionenIkkeFundet({ code: "PGRST202", message: "x" })).toBe(true);
    expect(erFunktionenIkkeFundet({ code: null, message: "Could not find the function public.get_siden_sidst_virksomheder(siden) in the schema cache" })).toBe(true);
  });
  it("alle andre fejl er fejl", () => {
    expect(erFunktionenIkkeFundet({ code: "42501", message: "permission denied" })).toBe(false);
    expect(erFunktionenIkkeFundet({ code: "PGRST301", message: "JWT expired" })).toBe(false);
    expect(erFunktionenIkkeFundet(null)).toBe(false);
    expect(erFunktionenIkkeFundet(undefined)).toBe(false);
  });
});
