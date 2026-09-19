import { describe, expect, it } from "vitest";
import { kontrollerUdkast, skrivDom } from "@/lib/marketing/udkastVaern";

const regler = (dom: { fejl: { regel: string }[]; tjek: { regel: string }[] }) => ({
  fejl: dom.fejl.map((f) => f.regel.split(" ")[0]),
  tjek: dom.tjek.map((t) => t.regel.split(" ")[0]),
});

/**
 * DEN SANDE SAG (19/9): denne sætning står lige nu i den godkendte Klaviyo-
 * skabelon «Webinar — 7 dage før» (TVbT4b, opdateret 18:16). De øvrige ni blev
 * rettet senere på aftenen; denne blev ikke. Den er værnets første rigtige
 * fund — ikke en opdigtet prøve.
 */
const LIVE_FORKERT = "Det er dét, webinaret handler om: at se tallene, mens de stadig kan bruges til noget.";

describe("udkastVaern — den fejl, der faktisk blev begået", () => {
  it("fanger den live sætning, der siger webinaret handler om tallene", () => {
    const dom = kontrollerUdkast(LIVE_FORKERT);
    expect(regler(dom).fejl).toContain("R7");
    expect(dom.ingenPaaviseligFejl).toBe(false);
    expect(dom.fejl.find((f) => f.regel.startsWith("R7"))?.besked).toContain("to områder");
  });
  it("den rigtige ramme går igennem uden fejl", () => {
    const rigtigt = "På webinaret gennemgår Morten de to områder, der afgør din vækst, og de fem faste spørgsmål, han forventer sine investeringer kan svare på.";
    expect(kontrollerUdkast(rigtigt).ingenPaaviseligFejl).toBe(true);
  });
  it("et udkast, der PÅSTÅR noget om indholdet uden at nævne rammen, får et tjek", () => {
    const dom = kontrollerUdkast("På webinaret gennemgår vi, hvordan du læser dit budget.");
    // ÆRLIGHED: dette udkast er ikke påviseligt forkert — værnet kan kun bede
    // et menneske læse det mod tilmeldingssiden.
    expect(dom.ingenPaaviseligFejl).toBe(true);
    expect(regler(dom).tjek).toContain("R7");
  });
  it("men en mail, der blot NÆVNER webinaret, får intet tjek — porten er snæver", () => {
    // Uden denne port fyrede reglen på «Efter 01», som er godkendt og fejlfri.
    const dom = kontrollerUdkast("Du er tilmeldt webinaret. Linket kommer en time før start.");
    expect(dom.ingenPaaviseligFejl).toBe(true);
    expect(regler(dom).tjek).not.toContain("R7");
  });
});

describe("udkastVaern — det, der kan afgøres maskinelt (fejl)", () => {
  it("R1: et beløb, der ikke findes i grundlaget", () => {
    expect(regler(kontrollerUdkast("Det koster 39.000 kr. om året.")).fejl).toContain("R1");
    expect(kontrollerUdkast("50.000 kr. ex moms for et år, eller 4.375 kr. om måneden.").ingenPaaviseligFejl).toBe(true);
  });
  it("R2: årsprisfælden — 12 × månedsraten er regnerigtigt og alligevel forkert", () => {
    const dom = kontrollerUdkast("Et år koster 52.500 kr.");
    expect(regler(dom).fejl).toContain("R2");
    expect(dom.fejl.find((f) => f.regel.startsWith("R2"))?.besked).toContain("ratetillæg");
  });
  it("R4: et citat, ingen har sagt", () => {
    expect(regler(kontrollerUdkast('Som Morten siger: «Det her ændrer alt for din bundlinje».')).fejl).toContain("R4");
    expect(kontrollerUdkast('Morten siger det selv: «Jeg har lavet fejlene – så du slipper for dem».').ingenPaaviseligFejl).toBe(true);
  });
  it("R5: et link, vi ikke ejer", () => {
    expect(regler(kontrollerUdkast("Læs mere på https://eksempel.dk/tilbud")).fejl).toContain("R5");
    expect(kontrollerUdkast("Ansøg her: https://app.theboardroom.dk/ansoeg?kilde=webinar").ingenPaaviseligFejl).toBe(true);
  });
  it("R6: udråbstegn og salgssprog", () => {
    expect(regler(kontrollerUdkast("Vi glæder os til at se dig!")).fejl).toContain("R6");
    expect(regler(kontrollerUdkast("Vi er glade for at kunne tilbyde dig en enestående mulighed.")).fejl.length).toBeGreaterThanOrEqual(2);
  });
  it("R8: et citat tillagt en person, hvis ordlyd står som MANGLER", () => {
    const dom = kontrollerUdkast('Carsten Guldhammer fortæller: «Morten har løftet vores bestyrelse markant».');
    expect(regler(dom).fejl).toContain("R8");
  });
  it("R11: Jonas præsenteret med en historik, grundlaget ikke har", () => {
    expect(regler(kontrollerUdkast("Jonas Herlev har bygget flere virksomheder.")).fejl).toContain("R11");
  });
});

describe("udkastVaern — det, der kun kan antydes (tjek)", () => {
  it("R3: et ukendt tal uden enhed er et tjek, ikke en fejl — det kan være en dato", () => {
    const dom = kontrollerUdkast("Vi ses den 24. september. Der er 847 tilmeldte.");
    expect(dom.ingenPaaviseligFejl).toBe(true);
    expect(regler(dom).tjek).toContain("R3");
    expect(dom.tjek.some((t) => t.fundet === "847")).toBe(true);
    // Datoen støjer ikke.
    expect(dom.tjek.some((t) => t.fundet === "24")).toBe(false);
  });
  it("R9: samme sætning som medlemskabet er en FEJL, ikke et tjek", () => {
    const dom = kontrollerUdkast("Søren Guldager er et godt eksempel på, hvad et medlemskab i The Boardroom kan gøre.");
    expect(regler(dom).fejl).toContain("R9");
    expect(dom.fejl.find((f) => f.regel.startsWith("R9"))?.besked).toContain("Daniel Sand og Peter Holst Jacobsen");
  });
  it("R9: løsere nærhed — to afsnit fra hinanden — er kun et tjek", () => {
    const dom = kontrollerUdkast(
      "Christoffer Hübertz har arbejdet tæt sammen med Morten i bestyrelsen.\n\nVil du selv sidde over for ham hver måned? Så er medlemskabet vejen.",
    );
    expect(regler(dom).tjek).toContain("R9");
    expect(regler(dom).fejl).not.toContain("R9");
  });
  it("R9: de to medlemmer må gerne stå ved siden af medlemskabet", () => {
    const dom = kontrollerUdkast("Daniel Sand er medlem af The Boardroom og driver remm.dk.");
    expect(regler(dom).fejl).not.toContain("R9");
    expect(regler(dom).tjek).not.toContain("R9");
  });
  it("R13: ansøgning fremstillet som adgang", () => {
    const dom = kontrollerUdkast("Ansøg på https://app.theboardroom.dk/ansoeg?kilde=webinar — så får du adgang med det samme.");
    expect(regler(dom).tjek).toContain("R13");
  });
});

describe("udkastVaern — VÆRNET VIRKER (selvbevis)", () => {
  it("dommen er ikke tavs: hver fejlregel kan bringes til at fyre OG til at tie", () => {
    const par: [string, string, string][] = [
      ["R1", "Det koster 39.000 kr.", "Det koster 50.000 kr."],
      ["R2", "Et år koster 52.500 kr.", "Et år koster 50.000 kr."],
      ["R4", 'Han siger «noget helt andet end det godkendte».', "Han siger det ligeud."],
      ["R5", "Se https://fremmed.dk/x", "Se https://www.topix.dk/webinar/optagelse"],
      ["R6", "Kom med!", "Kom med."],
      ["R7", LIVE_FORKERT, "Webinaret gennemgår de to områder og de fem spørgsmål."],
      ["R9", "Carsten Guldhammer viser, hvad The Boardroom kan.", "Daniel Sand viser, hvad The Boardroom kan."],
      ["R11", "Jonas Herlev har solgt to virksomheder.", "Jonas Herlev tager samtalen."],
    ];
    for (const [regel, fyrer, tier] of par) {
      expect(regler(kontrollerUdkast(fyrer)).fejl, `${regel} skulle fyre`).toContain(regel);
      expect(regler(kontrollerUdkast(tier)).fejl, `${regel} skulle tie`).not.toContain(regel);
    }
  });
  it("et tomt udkast er ikke et bevis på noget — og dommen siger det selv", () => {
    const dom = kontrollerUdkast("");
    expect(dom.ingenPaaviseligFejl).toBe(true);
    expect(skrivDom(dom)).toContain("ikke afgøre, om præmissen er rigtig");
  });
  it("R7-porten ÅBNER på rigtige ord — den er snæver, ikke tavs", () => {
    // En tavs dom ligner en grøn dom. Derfor bevises begge retninger:
    for (const ord of ["gennemgår", "kommer vi ind på", "lærer du", "deler jeg"]) {
      const dom = kontrollerUdkast(`På webinaret ${ord} noget om budgetter.`);
      expect(regler(dom).tjek, `porten skulle åbne på «${ord}»`).toContain("R7");
    }
    // ... og den lukker, når rammen faktisk står der.
    expect(regler(kontrollerUdkast("På webinaret gennemgår vi de to områder.")).tjek).not.toContain("R7");
  });
  it("dommen skelner: fejl blokerer, tjek gør ikke", () => {
    const kun_tjek = kontrollerUdkast("Der er 847 tilmeldte.");
    expect(kun_tjek.ingenPaaviseligFejl).toBe(true);
    expect(kun_tjek.tjek.length).toBeGreaterThan(0);
    const med_fejl = kontrollerUdkast("Der er 847 tilmeldte, og det koster 39.000 kr.");
    expect(med_fejl.ingenPaaviseligFejl).toBe(false);
  });
});
