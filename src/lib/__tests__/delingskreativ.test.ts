import { describe, expect, it } from "vitest";
import {
  ALLE_KOMBINATIONER,
  FARVER,
  FORMATER,
  OPTAGELSEN,
  OPTAGET_I,
  PROEVETEKSTER,
  RAADGIVERE,
  TRE_PAA_RAEKKE,
  TRE_PAA_RAEKKE_MOERK_KVADRAT as M,
  dateLabel,
  hentMaal,
  kombination,
  manglendeDele,
  skriftStil,
} from "../delingskreativ";
import { KREATIVER } from "@/components/hjemmebane/deling/kreativer";

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
    expect(M.medlem.ring.slot).toBeLessThan(M.medlem.ring.diameter);
    expect(M.medlem.ring.diameter).toBeLessThanOrEqual(M.medlem.bredde);
    // v2:45: 340 ring, 5 px kant, 310 slot — slottet ligger inden for kanten
    expect(M.medlem.ring.slot).toBeLessThanOrEqual(M.medlem.ring.diameter - 2 * M.medlem.ring.kant);
    expect(M.logokort.slot.bredde).toBeLessThanOrEqual(M.logokort.bredde - 2 * M.logokort.padding);
    expect(M.logokort.slot.hoejde).toBeLessThanOrEqual(M.logokort.hoejde - 2 * M.logokort.padding);
  });

  it("marginerne er positive og rækken har plads i lærredet", () => {
    for (const v of [M.topblok.venstre, M.topblok.hoejre, M.topblok.top, M.raekke.venstre, M.raekke.hoejre, M.raekke.top, M.bundraekke!.venstre, M.bundraekke!.hoejre, M.bundraekke!.bund]) {
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

  it("hentMaal giver den rigtige tabel for hvert layout, og mørk kvadrat er stadig M", () => {
    expect(hentMaal("tre_paa_raekke", "moerk", "kvadrat")).toBe(M);
    expect(hentMaal("tre_paa_raekke", "lys", "liggende")).toBe(TRE_PAA_RAEKKE["lys-liggende"]);
    expect(hentMaal("optagelsen", "moerk", "kvadrat")).toBe(OPTAGELSEN["moerk-kvadrat"]);
    expect(hentMaal("optaget_i", "lys", "liggende")).toBe(OPTAGET_I["lys-liggende"]);
    expect(kombination("lys", "liggende")).toBe("lys-liggende");
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

// ── De tolv (14/9): hver kombination har sine egne tal ────────────────────
describe("de tolv kombinationer", () => {
  /** Alle tal i et objekt, med sti — så et negativt tal kan nævnes ved navn. */
  const alleTal = (o: unknown, sti = ""): Array<[string, number]> => {
    if (typeof o === "number") return [[sti, o]];
    if (o && typeof o === "object") return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => alleTal(v, sti ? `${sti}.${k}` : k));
    return [];
  };

  it("er tolv, og hver har en tabel med sit eget layout-mærke", () => {
    expect(ALLE_KOMBINATIONER).toHaveLength(12);
    const noegler = new Set(ALLE_KOMBINATIONER.map((k) => `${k.layout}/${k.udgave}/${k.format}`));
    expect(noegler.size).toBe(12);
    for (const k of ALLE_KOMBINATIONER) {
      const m = hentMaal(k.layout, k.udgave, k.format);
      expect(m).toBeTruthy();
      expect(m.layout).toBe(k.layout);
    }
  });

  it("lærredet er 1080×1080 (kvadrat) eller 1200×627 (liggende), og baggrunden følger udgaven", () => {
    for (const k of ALLE_KOMBINATIONER) {
      const m = hentMaal(k.layout, k.udgave, k.format);
      expect({ bredde: m.canvas.bredde, hoejde: m.canvas.hoejde }).toEqual(FORMATER[k.format]);
      expect(m.canvas.baggrund).toBe(k.udgave === "moerk" ? FARVER.navyGreen : FARVER.shell);
    }
  });

  it("slottet er mindre end sin ring — i alle tolv", () => {
    for (const k of ALLE_KOMBINATIONER) {
      const m = hentMaal(k.layout, k.udgave, k.format);
      if (m.layout === "tre_paa_raekke") {
        expect(m.medlem.ring.slot, `${k.layout} ${k.udgave} ${k.format}`).toBeLessThanOrEqual(m.medlem.ring.diameter - 2 * m.medlem.ring.kant);
      } else if (m.layout === "optaget_i") {
        expect(m.ring.slot, `${k.layout} ${k.udgave} ${k.format}`).toBeLessThanOrEqual(m.ring.diameter - 2 * m.ring.kant);
      } else {
        // 3b: hvid cirkel uden kant — slottet inde i cirklen, seglet inde i cirklen
        expect(m.portraet.slot, `${k.udgave} ${k.format}`).toBeLessThan(m.portraet.diameter);
        expect(m.portraet.segl.stoerrelse + m.portraet.segl.hoejre).toBeLessThan(m.portraet.diameter);
      }
      // logoslottet inde i kortet
      expect(m.logokort.slot.bredde).toBeLessThanOrEqual(m.logokort.bredde - 2 * m.logokort.padding);
      expect(m.logokort.slot.hoejde).toBeLessThanOrEqual(m.logokort.hoejde - 2 * m.logokort.padding);
    }
  });

  it("ingen negative tal nogen steder — kun letter-spacing må være negativ (designets −.02em)", () => {
    for (const k of ALLE_KOMBINATIONER) {
      const m = hentMaal(k.layout, k.udgave, k.format);
      for (const [sti, tal] of alleTal(m)) {
        if (sti.endsWith(".spatiering")) continue;
        expect(tal, `${k.layout} ${k.udgave} ${k.format}: ${sti}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("kvadrat og liggende er ikke skaleringer af hinanden — overskriften er 98/62, 84/60, 100/68", () => {
    expect([TRE_PAA_RAEKKE["moerk-kvadrat"].overskrift.stoerrelse, TRE_PAA_RAEKKE["moerk-liggende"].overskrift.stoerrelse]).toEqual([98, 62]);
    expect([OPTAGELSEN["moerk-kvadrat"].overskrift.stoerrelse, OPTAGELSEN["moerk-liggende"].overskrift.stoerrelse]).toEqual([84, 60]);
    expect([OPTAGET_I["moerk-kvadrat"].overskrift.stoerrelse, OPTAGET_I["moerk-liggende"].overskrift.stoerrelse]).toEqual([100, 68]);
    // ringene: 340/250, 320/276, 330/268 — ikke samme forhold
    expect(TRE_PAA_RAEKKE["moerk-liggende"].medlem.ring.diameter / TRE_PAA_RAEKKE["moerk-kvadrat"].medlem.ring.diameter).not.toBeCloseTo(
      OPTAGET_I["moerk-liggende"].ring.diameter / OPTAGET_I["moerk-kvadrat"].ring.diameter,
      2,
    );
  });

  it("lys udgave bruger designets egne hex: shell-baggrund, navy tekst, shell-dark kant, navy ordmærke", () => {
    for (const k of ALLE_KOMBINATIONER.filter((x) => x.udgave === "lys")) {
      const m = hentMaal(k.layout, k.udgave, k.format);
      expect(m.canvas.baggrund).toBe("#E9E9E7");
      expect(m.logokort.kant).toBe("#D6D6D3");
      expect(m.overskrift.farve).toBe("#133332");
    }
    expect(TRE_PAA_RAEKKE["lys-kvadrat"].ordmaerke.fil).toBe("/topix-navy.png");
    expect(OPTAGELSEN["lys-liggende"].ordmaerke.fil).toBe("/topix-navy.png");
    // 3c bytter: lys bjælke er navy, så ordmærket er shell
    expect(OPTAGET_I["lys-kvadrat"].bjaelke.baggrund).toBe("#133332");
    expect(OPTAGET_I["lys-kvadrat"].ordmaerke.fil).toBe("/topix-shell.png");
    expect(OPTAGET_I["moerk-kvadrat"].bjaelke.baggrund).toBe("#A3D9C4");
    expect(OPTAGET_I["moerk-kvadrat"].ordmaerke.fil).toBe("/topix-navy.png");
  });

  it("listen KREATIVER har tolv poster med unikke id'er, én per kombination", () => {
    expect(KREATIVER).toHaveLength(12);
    expect(new Set(KREATIVER.map((p) => p.id)).size).toBe(12);
    const fraListen = new Set(KREATIVER.map((p) => `${p.layout}/${p.udgave}/${p.format}`));
    for (const k of ALLE_KOMBINATIONER) expect(fraListen.has(`${k.layout}/${k.udgave}/${k.format}`)).toBe(true);
    expect(KREATIVER[0].id).toBe("3a-moerk-kvadrat");
    expect(KREATIVER[0].titel).toBe("Tre på række — mørk kvadrat");
  });
});
