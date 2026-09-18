import { describe, expect, it } from "vitest";
import {
  KODE_CIFRE,
  KODE_GYLDIG_MINUTTER,
  KODE_MAX_FORSOEG,
  LINK_GYLDIG_DAGE,
  NY_KODE_PAUSE_SEKUNDER,
  afgoerAftaletilstand,
  afgoerIndtastning,
  afgoerKode,
  afgoerNavn,
  kanoniskTekst,
  linkUdloeb,
  maaBestilleNyKode,
  maskerEmail,
  nyKode,
  rensKode,
  udfyldSkabelon,
  type AftaleInput,
  type KodeInput,
} from "@/lib/underskriftDom";

// Rene domme for e-underskriften (udkast 18/9-2026). Hver regel fra Jonas'
// punkt 4 har sin egen it: seks cifre, 15 minutter, fem forsøg, ny kode kan
// bestilles, linket udløber efter 21 dage. `now` gives altid udefra.

const NU = new Date("2026-09-18T12:00:00.000Z");
const minutter = (n: number) => new Date(NU.getTime() + n * 60_000);
const dage = (n: number) => new Date(NU.getTime() + n * 86_400_000);

const aftale = (o: Partial<AftaleInput> = {}): AftaleInput => ({
  status: "sendt",
  sendt_at: NU.toISOString(),
  underskrevet_at: null,
  ...o,
});

const kode = (o: Partial<KodeInput> = {}): KodeInput => ({
  oprettet_at: NU.toISOString(),
  forsoeg: 0,
  brugt_at: null,
  erstattet_at: null,
  ...o,
});

describe("konstanterne er reglerne fra 18/9", () => {
  it("seks cifre, 15 minutter, fem forsøg, 21 dage", () => {
    expect(KODE_CIFRE).toBe(6);
    expect(KODE_GYLDIG_MINUTTER).toBe(15);
    expect(KODE_MAX_FORSOEG).toBe(5);
    expect(LINK_GYLDIG_DAGE).toBe(21);
    expect(NY_KODE_PAUSE_SEKUNDER).toBeGreaterThan(0);
  });
});

describe("afgoerAftaletilstand — linket lever i 21 dage", () => {
  it("lige sendt: kan underskrives, 21 dage tilbage, udløb = sendt + 21 dage", () => {
    const t = afgoerAftaletilstand(aftale(), NU);
    expect(t).toEqual({ tilstand: "kan_underskrives", udloeber_at: dage(21).toISOString(), dage_tilbage: 21 });
  });
  it("dag 20 kl. 23:59: stadig 1 dag tilbage", () => {
    const now = new Date(dage(21).getTime() - 60_000);
    expect(afgoerAftaletilstand(aftale(), now)).toMatchObject({ tilstand: "kan_underskrives", dage_tilbage: 1 });
  });
  it("præcis ved udløbet: udløbet (grænsen er lukket)", () => {
    expect(afgoerAftaletilstand(aftale(), dage(21))).toEqual({ tilstand: "udloebet", udloeb_at: dage(21).toISOString() });
  });
  it("underskrevet vinder over udløb — en underskrift bliver ikke ugyldig af tiden", () => {
    const u = aftale({ status: "underskrevet", underskrevet_at: dage(3).toISOString() });
    expect(afgoerAftaletilstand(u, dage(40))).toEqual({ tilstand: "underskrevet", underskrevet_at: dage(3).toISOString() });
  });
  it("annulleret er annulleret, også inden for de 21 dage", () => {
    expect(afgoerAftaletilstand(aftale({ status: "annulleret" }), NU)).toEqual({ tilstand: "annulleret" });
  });
  it("ulæselig sendt_at: ugyldig (fail-closed) — og linkUdloeb er null", () => {
    expect(afgoerAftaletilstand(aftale({ sendt_at: "ikke-en-dato" }), NU)).toEqual({ tilstand: "ugyldig" });
    expect(linkUdloeb("ikke-en-dato")).toBeNull();
  });
});

describe("afgoerKode — 15 minutter, fem forsøg, én gang", () => {
  it("frisk kode er gyldig; 14:59 senere stadig gyldig; 15:00 udløbet", () => {
    expect(afgoerKode(kode(), NU)).toBe("gyldig");
    expect(afgoerKode(kode(), new Date(minutter(15).getTime() - 1000))).toBe("gyldig");
    expect(afgoerKode(kode(), minutter(15))).toBe("udloebet");
  });
  it("fire forkerte forsøg: stadig gyldig; fem: låst", () => {
    expect(afgoerKode(kode({ forsoeg: 4 }), NU)).toBe("gyldig");
    expect(afgoerKode(kode({ forsoeg: 5 }), NU)).toBe("laast");
  });
  it("brugt og erstattet går forud for alt andet", () => {
    expect(afgoerKode(kode({ brugt_at: NU.toISOString(), forsoeg: 9 }), NU)).toBe("brugt");
    expect(afgoerKode(kode({ erstattet_at: NU.toISOString() }), minutter(30))).toBe("erstattet");
  });
  it("ulæselig oprettet_at er ugyldig", () => {
    expect(afgoerKode(kode({ oprettet_at: "?" }), NU)).toBe("ugyldig");
  });
});

describe("afgoerIndtastning — dommen over ét forsøg", () => {
  it("ingen kode bestilt endnu", () => {
    expect(afgoerIndtastning(null, true, NU)).toEqual({ udfald: "ingen_kode" });
  });
  it("rigtig kode, gyldig: ok", () => {
    expect(afgoerIndtastning(kode(), true, NU)).toEqual({ udfald: "ok" });
  });
  it("forkert kode: forsøg tilbage tæller ned 4, 3, 2, 1 — og det femte låser", () => {
    expect(afgoerIndtastning(kode({ forsoeg: 0 }), false, NU)).toEqual({ udfald: "forkert", forsoeg_tilbage: 4 });
    expect(afgoerIndtastning(kode({ forsoeg: 3 }), false, NU)).toEqual({ udfald: "forkert", forsoeg_tilbage: 1 });
    expect(afgoerIndtastning(kode({ forsoeg: 4 }), false, NU)).toEqual({ udfald: "laast" });
  });
  it("rigtig kode men allerede låst: låst — matcher hjælper ikke", () => {
    expect(afgoerIndtastning(kode({ forsoeg: 5 }), true, NU)).toEqual({ udfald: "laast" });
  });
  it("rigtig kode men udløbet: udløbet", () => {
    expect(afgoerIndtastning(kode(), true, minutter(16))).toEqual({ udfald: "udloebet" });
  });
  it("rigtig kode men brugt eller erstattet: afvist med grunden", () => {
    expect(afgoerIndtastning(kode({ brugt_at: NU.toISOString() }), true, NU)).toEqual({ udfald: "brugt" });
    expect(afgoerIndtastning(kode({ erstattet_at: NU.toISOString() }), true, NU)).toEqual({ udfald: "erstattet" });
  });
});

describe("maaBestilleNyKode — pausen mellem to koder", () => {
  it("ingen tidligere kode: ja", () => {
    expect(maaBestilleNyKode(null, NU)).toEqual({ ok: true });
  });
  it("lige bestilt: nej, med sekunder at vente; efter pausen: ja", () => {
    expect(maaBestilleNyKode(NU.toISOString(), NU)).toEqual({ ok: false, vent_sekunder: NY_KODE_PAUSE_SEKUNDER });
    expect(maaBestilleNyKode(NU.toISOString(), new Date(NU.getTime() + NY_KODE_PAUSE_SEKUNDER * 1000))).toEqual({ ok: true });
  });
});

describe("nyKode og rensKode", () => {
  it("seks cifre fra kilden, førende nul bevaret", () => {
    const cifre = [0, 0, 4, 2, 1, 7];
    let i = 0;
    expect(nyKode(() => cifre[i++])).toBe("004217");
  });
  it("en kilde uden for 0–9 kaster — koden må aldrig blive kortere eller indeholde andet end cifre", () => {
    expect(() => nyKode(() => 10)).toThrow();
    expect(() => nyKode(() => -1)).toThrow();
  });
  it("rensKode: mellemrum fjernes; alt andet end præcis seks cifre er null", () => {
    expect(rensKode(" 12 34 56 ")).toBe("123456");
    expect(rensKode("12345")).toBeNull();
    expect(rensKode("1234567")).toBeNull();
    expect(rensKode("12345a")).toBeNull();
  });
});

describe("afgoerNavn — navnet er underskriften", () => {
  it("trimmer og samler mellemrum", () => {
    expect(afgoerNavn("  Lisbeth   Hansen ")).toEqual({ ok: true, navn: "Lisbeth Hansen" });
  });
  it("tomt, ét tegn, kun tal, og 121 tegn afvises hver med sin grund", () => {
    expect(afgoerNavn("   ")).toEqual({ ok: false, grund: "tomt" });
    expect(afgoerNavn("L")).toEqual({ ok: false, grund: "for_kort" });
    expect(afgoerNavn("12345")).toEqual({ ok: false, grund: "uden_bogstav" });
    expect(afgoerNavn("a".repeat(121))).toEqual({ ok: false, grund: "for_langt" });
  });
  it("æøå og bindestreg er bogstaver", () => {
    expect(afgoerNavn("Åse Ørum-Jensen")).toEqual({ ok: true, navn: "Åse Ørum-Jensen" });
  });
});

describe("kanoniskTekst — samme tekst, samme aftryk", () => {
  it("CRLF og CR bliver LF, efterstillede blanktegn og tomme kantlinjer fjernes", () => {
    expect(kanoniskTekst("\n\nA  \r\nB\t\rC\n\n\n")).toBe("A\nB\nC");
  });
  it("indre tomme linjer bevares (afsnit er del af teksten)", () => {
    expect(kanoniskTekst("A\n\nB")).toBe("A\n\nB");
  });
  it("idempotent", () => {
    const t = kanoniskTekst("X \r\n Y \n");
    expect(kanoniskTekst(t)).toBe(t);
  });
});

describe("udfyldSkabelon — ingen pladsholder må overleve", () => {
  it("udfylder kendte felter og melder de ukendte sorteret", () => {
    const r = udfyldSkabelon("{{virksomhed}} betaler {{ pris_kr }} kr. Frist {{frist}} — {{cvr}}", { virksomhed: "FLOOR1", pris_kr: "50.000" });
    expect(r.tekst).toBe("FLOOR1 betaler 50.000 kr. Frist {{frist}} — {{cvr}}");
    expect(r.manglende).toEqual(["cvr", "frist"]);
  });
  it("uden pladsholdere: uændret, intet mangler", () => {
    expect(udfyldSkabelon("ren tekst", {})).toEqual({ tekst: "ren tekst", manglende: [] });
  });
});

describe("maskerEmail", () => {
  it("første tegn og domænet, resten stjerner", () => {
    expect(maskerEmail("Jonas@Topix.dk")).toBe("j***@topix.dk");
    expect(maskerEmail("ikke-en-mail")).toBe("***");
  });
});
