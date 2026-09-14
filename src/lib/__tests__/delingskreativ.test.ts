import { describe, expect, it } from "vitest";
import {
  FARVER,
  FORMATER,
  PROEVETEKSTER,
  RAADGIVERE,
  TRE_PAA_RAEKKE_MOERK_KVADRAT as M,
  dateLabel,
  hentMaal,
  manglendeDele,
  skriftStil,
} from "../delingskreativ";

// Måltabellens invarianter — tallene er ordret fra v2 (docs/delingskreativ/
// Boardroom Delingskreativ v2.dc.html :38-67), så testen låser at
// oversættelsen ikke skrider, ikke at designet er rigtigt.
describe("delingskreativ — 3a mørk kvadrat", () => {
  it("lærredet er 1080×1080 og matcher FORMATER.kvadrat", () => {
    expect(M.canvas).toMatchObject({ bredde: 1080, hoejde: 1080 });
    expect(FORMATER.kvadrat).toEqual({ bredde: 1080, hoejde: 1080 });
    expect(FORMATER.liggende).toEqual({ bredde: 1200, hoejde: 627 });
  });

  it("slottet er mindre end sin ring, og ringen mindre end kolonnen", () => {
    expect(M.medlem.slot.diameter).toBeLessThan(M.medlem.ring.diameter);
    expect(M.medlem.ring.diameter).toBeLessThanOrEqual(M.medlem.bredde);
    // v2:45: 340 ring, 5 px kant, 310 slot — slottet ligger inden for kanten
    expect(M.medlem.slot.diameter).toBeLessThanOrEqual(M.medlem.ring.diameter - 2 * M.medlem.ring.kant);
    expect(M.logokort.slot.bredde).toBeLessThanOrEqual(M.logokort.bredde - 2 * M.logokort.padding);
    expect(M.logokort.slot.hoejde).toBeLessThanOrEqual(M.logokort.hoejde - 2 * M.logokort.padding);
  });

  it("marginerne er positive og rækken har plads i lærredet", () => {
    for (const v of [M.topblok.venstre, M.topblok.hoejre, M.topblok.top, M.raekke.venstre, M.raekke.hoejre, M.raekke.top, M.bund.venstre, M.bund.hoejre, M.bund.bund]) {
      expect(v).toBeGreaterThan(0);
    }
    // MÅLT 14/9 (ikke antaget): v2:43-62 giver 340 + 34 + 270 + 34 + 270 = 948 px
    // i en boks på 1080 − 80 − 80 = 920 px. Designets række stikker 28 px ud
    // over højremargenen (kolonnerne kan ikke krympe under deres billeder), så
    // højre kant ender på x = 1028, ikke 1000. Testen låser det målte tal, så
    // en rettelse i designet eller i tabellen bliver synlig her.
    const raekkeBredde = M.medlem.bredde + M.raekke.gap + 2 * M.raadgiver.bredde + M.raekke.gap;
    const boksBredde = M.canvas.bredde - M.raekke.venstre - M.raekke.hoejre;
    expect(raekkeBredde).toBe(948);
    expect(boksBredde).toBe(920);
    expect(M.raekke.venstre + raekkeBredde).toBeLessThanOrEqual(M.canvas.bredde);
    expect(M.raadgiver.portraet).toBe(270);
  });

  it("farverne er designets otte hex, ordret", () => {
    expect(FARVER).toEqual({
      navyGreen: "#133332",
      ocean: "#A3D9C4",
      shell: "#E9E9E7",
      hvid: "#FFFFFF",
      navyGreen80: "#3E5A59",
      navyGreen60: "#6A8180",
      ocean40: "#DAF0E7",
      shellDark: "#D6D6D3",
    });
    expect(M.canvas.baggrund).toBe(FARVER.navyGreen);
    expect(M.ordmaerke.fil).toBe("/topix-shell.png");
  });

  it("skriftStil oversætter designets font:-shorthand felt for felt", () => {
    expect(skriftStil(M.overskrift)).toEqual({
      fontFamily: "'Parkinsans', system-ui, sans-serif",
      fontWeight: 600,
      fontSize: "98px",
      lineHeight: 1,
      color: "#FFFFFF",
      letterSpacing: "-0.02em",
    });
    expect(skriftStil(M.label)).toMatchObject({ letterSpacing: "0.26em", textTransform: "uppercase" });
    expect(skriftStil(M.medlem.navn)).toMatchObject({ whiteSpace: "nowrap" });
    expect(skriftStil(M.medlem.navn).letterSpacing).toBeUndefined();
  });

  it("hentMaal giver kun mørk kvadrat; resten er null indtil de bygges", () => {
    expect(hentMaal("tre_paa_raekke", "moerk", "kvadrat")).toBe(M);
    expect(hentMaal("tre_paa_raekke", "lys", "kvadrat")).toBeNull();
    expect(hentMaal("tre_paa_raekke", "moerk", "liggende")).toBeNull();
    expect(hentMaal("optagelsen", "moerk", "kvadrat")).toBeNull();
    expect(hentMaal("optaget_i", "moerk", "kvadrat")).toBeNull();
  });

  it("rådgiverne står i designets rækkefølge med filer i public/", () => {
    expect(RAADGIVERE.map((r) => r.navn)).toEqual(["Morten Larsen", "Jonas Herlev"]);
    expect(RAADGIVERE.map((r) => r.fil)).toEqual(["/morten-hi.png", "/jonas-hi.png"]);
  });
});

describe("dateLabel", () => {
  it("giver «september 2026»-formen — måned med lille, år", () => {
    expect(dateLabel(new Date(2026, 8, 14))).toBe("september 2026");
    expect(dateLabel(new Date(2026, 8, 14))).toBe(PROEVETEKSTER.dateLabel);
    expect(dateLabel(new Date(2027, 0, 1))).toBe("januar 2027");
    expect(dateLabel(new Date(2026, 11, 31))).toBe("december 2026");
    expect(dateLabel(new Date(2026, 2, 5))).toBe("marts 2026");
  });
});

describe("manglendeDele", () => {
  const hel = { memberName: "Anne Kirkegaard", companyName: "Lazzaweb A/S", dateLabel: "september 2026", portraetUrl: "blob:a", logoUrl: "https://x/logo" };

  it("intet mangler når alle fire dele er der", () => {
    expect(manglendeDele(hel)).toEqual([]);
  });

  it("nævner hver manglende del i kreativens rækkefølge: portræt, navn, virksomhed, logo", () => {
    const m = manglendeDele({ memberName: "  ", companyName: "", dateLabel: "september 2026", portraetUrl: null, logoUrl: undefined });
    expect(m.map((x) => x.del)).toEqual(["portraet", "navn", "virksomhed", "logo"]);
    for (const x of m) expect(x.tekst.length).toBeGreaterThan(10);
  });

  it("kun det der mangler", () => {
    expect(manglendeDele({ ...hel, logoUrl: null }).map((x) => x.del)).toEqual(["logo"]);
    expect(manglendeDele({ ...hel, portraetUrl: "" }).map((x) => x.del)).toEqual(["portraet"]);
  });
});
