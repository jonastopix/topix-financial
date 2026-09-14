import { describe, expect, it } from "vitest";
import { NOTE_FIRE_AAR, VEJLEDNING, byggDelingstekster } from "@/lib/delingstekster";

// Teksten over billedet, anden runde (14/9): fire VEJE — glad og ligefrem,
// ærlig, forretningsmæssig, invitation — Jonas' egne ord, ordret. Aldrig
// «ejerleder», aldrig udråbstegn, intet om pris eller medlemstal.

const INPUT = { memberName: "Mette Hansen", companyName: "Hansen Byg ApS", dateLabel: "september 2026" };
const alle = () => byggDelingstekster(INPUT);
const find = (id: string) => alle().find((x) => x.id === id)!;

describe("de fire veje — ordret som godkendt", () => {
  it("Glad og ligefrem", () => {
    expect(find("glad").tekst).toBe(
      "Så blev det officielt: jeg er blevet medlem af The Boardroom.\n" +
        "De næste 12 måneder får jeg sparring fra Morten Larsen og Jonas Herlev — to der selv har bygget, drevet og solgt virksomheder. Og så er der en flok andre selvstændige med, som jeg glæder mig til at lære at kende.\n" +
        "Jeg er ret spændt på det her.",
    );
  });
  it("Ærlig — med virksomheden, og noten om «fire år»", () => {
    const t = find("aerlig");
    expect(t.tekst).toBe(
      "Jeg har brugt fire år på at lade som om jeg havde styr på tallene.\n" +
        "Det har jeg sådan set også. Jeg har bare ikke haft nogen at vende dem med, når noget skulle besluttes — og revisoren ser dem jo først bagefter.\n" +
        "Derfor er Hansen Byg ApS nu med i The Boardroom. 12 måneder med Morten Larsen og Jonas Herlev, der har mine tal ved hånden hele vejen.",
    );
    expect(t.note).toBe(NOTE_FIRE_AAR);
    expect(NOTE_FIRE_AAR).toMatch(/fire år/);
  });
  it("Forretningsmæssig — med virksomheden", () => {
    expect(find("forretning").tekst).toBe(
      "Jeg har lige investeret i noget der ikke står i regnskabet: rådgivning.\n" +
        "Hansen Byg ApS er blevet medlem af The Boardroom — 12 måneder med Morten Larsen og Jonas Herlev, som kender mine tal og er der når beslutningerne opstår. Ikke kun hvert kvartal.\n" +
        "Det er den slags udgift jeg tror betaler sig selv. Vi får se om et år.",
    );
  });
  it("Invitation — med virksomheden og datoen", () => {
    expect(find("invitation").tekst).toBe(
      "Hvis du også sidder alene med din virksomhed, så er det her måske noget for dig.\n" +
        "Jeg er blevet medlem af The Boardroom: 12 måneder med Morten Larsen og Jonas Herlev, og en gruppe andre selvstændige at spille bold op ad.\n" +
        "Hansen Byg ApS er med fra september 2026. Sig til hvis du vil høre hvordan det går.",
    );
  });
  it("titlerne er vejene, i den rækkefølge", () => {
    expect(alle().map((x) => x.titel)).toEqual(["Glad og ligefrem", "Ærlig", "Forretningsmæssig", "Invitation"]);
  });
});

describe("hvad de IKKE må", () => {
  it("aldrig «ejerleder», aldrig udråbstegn", () => {
    for (const x of alle()) {
      expect(x.tekst, x.id).not.toMatch(/ejerleder/i);
      expect(x.tekst, x.id).not.toContain("!");
      expect(x.tekst, x.id).not.toMatch(/stolt|annoncere/i);
    }
  });
  it("ingen pris, procent eller medlemstal — de eneste tal er de 12 måneder, årstallet i datoen og «fire år» som ord", () => {
    for (const x of alle()) {
      const rest = x.tekst.replace("september 2026", "").replace(/12 måneder/g, "");
      expect(rest, x.id).not.toMatch(/\d/);
      expect(x.tekst, x.id).not.toMatch(/\bkr\b|kr\.|pris|%|gratis|rabat|tilbud/i);
      expect(x.tekst, x.id).not.toMatch(/\d+\s*(andre\s+)?medlemmer|medlem nummer/i);
    }
  });
  it("intet fra ansøgningen", () => {
    for (const x of alle()) expect(x.tekst, x.id).not.toMatch(/omsætning|branche|situation|mål med|søger hjælp|udfordring/i);
  });
});

describe("fire veje, ikke fire længder", () => {
  it("de fire begynder forskelligt (de første fire ord) og deler ingen første sætning", () => {
    const starter = alle().map((x) => x.tekst.split(/\s+/).slice(0, 4).join(" "));
    expect(new Set(starter).size).toBe(4);
    const foersteSaetning = alle().map((x) => x.tekst.split(/[.:]/)[0]);
    expect(new Set(foersteSaetning).size).toBe(4);
  });
  it("de fire går hver sin vej: jeg-glæde, tal-ærlighed, investering, invitation til læseren", () => {
    expect(find("glad").tekst).toMatch(/^Så blev det officielt/);
    expect(find("aerlig").tekst).toMatch(/lade som om jeg havde styr på tallene/);
    expect(find("forretning").tekst).toMatch(/investeret|regnskabet|udgift/);
    expect(find("invitation").tekst).toMatch(/^Hvis du også/);
    expect(find("invitation").tekst).toMatch(/Sig til hvis du vil høre/);
  });
  it("kun tre af dem bærer virksomheden, kun én datoen — den glade er ren jeg-form", () => {
    expect(find("glad").tekst).not.toContain("Hansen Byg ApS");
    for (const id of ["aerlig", "forretning", "invitation"]) expect(find(id).tekst, id).toContain("Hansen Byg ApS");
    expect(alle().filter((x) => x.tekst.includes("september 2026")).map((x) => x.id)).toEqual(["invitation"]);
  });
});

describe("løftet er websitets ord", () => {
  it("«bygget, drevet og solgt virksomheder», «tal ved hånden», «er der når beslutningerne opstår. Ikke kun hvert kvartal»", () => {
    expect(find("glad").tekst).toContain("bygget, drevet og solgt virksomheder");
    expect(find("aerlig").tekst).toContain("har mine tal ved hånden");
    expect(find("forretning").tekst).toContain("er der når beslutningerne opstår. Ikke kun hvert kvartal.");
  });
});

describe("tomme felter hænger ikke (praesentation.ts-mønstret)", () => {
  it("uden virksomhed: «jeg» — ingen dobbelte mellemrum, intet hængende «fra»", () => {
    const t = byggDelingstekster({ memberName: null, companyName: "", dateLabel: "september 2026" });
    expect(t.find((x) => x.id === "aerlig")!.tekst).toContain("Derfor er jeg nu med i The Boardroom.");
    expect(t.find((x) => x.id === "forretning")!.tekst).toContain("Jeg er blevet medlem af The Boardroom —");
    expect(t.find((x) => x.id === "invitation")!.tekst).toContain("Jeg er med fra september 2026.");
    for (const x of t) expect(x.tekst, x.id).not.toMatch(/ {2}|\bfra[.,]| [.,]|\n\n/);
  });
  it("uden dato udgår «fra …»; uden noget som helst står alle fire stadig hele", () => {
    const udenDato = byggDelingstekster({ memberName: "Mette", companyName: "Hansen Byg ApS", dateLabel: null });
    expect(udenDato.find((x) => x.id === "invitation")!.tekst).toContain("Hansen Byg ApS er med. Sig til");
    const tomt = byggDelingstekster({ memberName: null, companyName: null, dateLabel: null });
    expect(tomt).toHaveLength(4);
    for (const x of tomt) {
      expect(x.tekst, x.id).not.toMatch(/ {2}|\bfra[.,]| [.,]|undefined|null/);
      expect(x.tekst.split("\n"), x.id).toHaveLength(3);
    }
    expect(tomt.find((x) => x.id === "invitation")!.tekst).toContain("Jeg er med. Sig til");
  });
});

describe("vejledningen — fire punkter, ikke ét mere", () => {
  it("de to personer tagges med deres LinkedIn-adresser; ingen virksomhedsside", () => {
    expect(VEJLEDNING).toHaveLength(4);
    expect(VEJLEDNING[0]).toContain("linkedin.com/in/mortenlarsen");
    expect(VEJLEDNING[0]).toContain("linkedin.com/in/jonasherlev");
    expect(VEJLEDNING.join(" ")).not.toMatch(/linkedin\.com\/company/);
  });
  it("linket i første kommentar, svar den første time, billedet først — og ingen andre påstande om algoritmen", () => {
    expect(VEJLEDNING[1]).toBe("Læg linket til theboardroom.dk i første kommentar, ikke i opslaget — LinkedIn viser opslag med eksterne links til færre.");
    expect(VEJLEDNING[2]).toBe("Svar på kommentarer den første time. Det er dér rækkevidden afgøres.");
    expect(VEJLEDNING[3]).toBe("Billedet først, teksten under.");
    expect(VEJLEDNING.join(" ")).not.toMatch(/hashtag|algoritme|kl\. |tidspunkt|bedste tid|emoji|carousel/i);
    for (const v of VEJLEDNING) expect(v).not.toContain("!");
  });
});
