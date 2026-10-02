import { describe, expect, it } from "vitest";
import {
  afsenderNavn, beskedForhaandsvisning, danskeDageMellem, danskKlokke, kortetsContent, raadgiverAdresse, relativDanskTid, skrivTilPladsholder,
} from "@/lib/hjemmebane/raadgiverKort";
import { MAX_MESSAGE_LENGTH } from "@/lib/chatShared";

describe("relativDanskTid — dansk dato og klokkeslæt, `nu` givet ind", () => {
  const nu = new Date("2026-10-02T12:00:00Z"); // fredag 2/10-2026 kl. 14.00 dansk (sommertid)
  it("i dag", () => expect(relativDanskTid("2026-10-02T07:05:00Z", nu)).toBe("i dag kl. 09.05"));
  it("i går", () => expect(relativDanskTid("2026-10-01T12:12:00Z", nu)).toBe("i går kl. 14.12"));
  it("i går — sent om aftenen dansk, som er samme UTC-dag som nu", () => {
    // 1/10 kl. 23.30 dansk = 1/10 21.30Z; nu = 2/10 00.30 dansk = 1/10 22.30Z → UTC siger «i dag», dansk siger «i går».
    expect(relativDanskTid("2026-10-01T21:30:00Z", new Date("2026-10-01T22:30:00Z"))).toBe("i går kl. 23.30");
  });
  it("ugedag inden for 6 dage", () => expect(relativDanskTid("2026-09-29T12:12:00Z", nu)).toBe("tirsdag kl. 14.12"));
  it("dato i samme år", () => expect(relativDanskTid("2026-09-03T12:12:00Z", nu)).toBe("3. september kl. 14.12"));
  it("dato med år", () => expect(relativDanskTid("2025-12-24T15:00:00Z", nu)).toBe("24. december 2025 kl. 16.00"));
  it("DST: nat efter skiftet til vintertid", () => {
    // 25/10-2026 kl. 01.30 dansk (sommertid, 23.30Z 24/10); nu = 26/10 kl. 08.00 dansk (vintertid, 07.00Z) → i går.
    expect(relativDanskTid("2026-10-24T23:30:00Z", new Date("2026-10-26T07:00:00Z"))).toBe("i går kl. 01.30");
    expect(danskeDageMellem(new Date("2026-10-24T23:30:00Z"), new Date("2026-10-26T07:00:00Z"))).toBe(1);
  });
  it("skævt ur (fremtid) — aldrig «om»", () => {
    expect(relativDanskTid("2026-10-02T12:01:00Z", nu)).toBe("i dag kl. 14.01");
    expect(relativDanskTid("2026-10-05T12:00:00Z", nu)).toBe("5. oktober kl. 14.00");
  });
  it("ugyldig/tom → tom streng", () => {
    expect(relativDanskTid(null, nu)).toBe("");
    expect(relativDanskTid("ikke en dato", nu)).toBe("");
  });
  it("klokken med punktum og to cifre", () => expect(danskKlokke(new Date("2026-01-05T08:07:00Z"))).toBe("09.07"));
});

describe("beskedForhaandsvisning — pæn afkortning", () => {
  it("kort tekst urørt; HTML bliver ren tekst", () => {
    expect(beskedForhaandsvisning("Hej Morten")).toBe("Hej Morten");
    expect(beskedForhaandsvisning("<p><strong>Fed</strong> &amp; tekst</p><p>Linje 2</p>")).toBe("Fed & tekst Linje 2");
    expect(beskedForhaandsvisning(null)).toBe("");
  });
  it("lang tekst skæres ved et ord og får «…» inden for loftet", () => {
    const lang = "Vi har kigget på jeres likviditet og vil gerne foreslå et møde om budgettet for næste kvartal, så vi kan tale om lageret og kassekreditten";
    const u = beskedForhaandsvisning(lang, 60);
    expect(u.length).toBeLessThanOrEqual(60);
    expect(u.endsWith("…")).toBe(true);
    expect(u).toBe("Vi har kigget på jeres likviditet og vil gerne foreslå et…");
  });
  it("et langt ord uden mellemrum skæres hårdt", () => {
    const u = beskedForhaandsvisning("x".repeat(200), 20);
    expect(u).toBe(`${"x".repeat(19)}…`);
  });
});

describe("rådgivernes adresse — ingen tildeling, fornavnene", () => {
  it("«Morten og Jonas»", () => {
    expect(raadgiverAdresse(["Morten Larsen", "Jonas Herlev"])).toBe("Morten og Jonas");
    expect(skrivTilPladsholder(["Morten Larsen", "Jonas Herlev"])).toBe("Skriv til Morten og Jonas …");
  });
  it("én, tre, dubletter og tomme", () => {
    expect(raadgiverAdresse(["Morten Larsen"])).toBe("Morten");
    expect(raadgiverAdresse(["Morten", "Jonas", "Anne Holm"])).toBe("Morten, Jonas og Anne");
    expect(raadgiverAdresse(["Morten", " ", null, "Morten Munk"])).toBe("Morten");
  });
  it("uden navne: «dine rådgivere»", () => {
    expect(raadgiverAdresse([])).toBe("dine rådgivere");
    expect(raadgiverAdresse(null)).toBe("dine rådgivere");
    expect(skrivTilPladsholder(undefined)).toBe("Skriv til dine rådgivere …");
  });
});

describe("afsenderNavn", () => {
  const profiler = [
    { user_id: "r1", full_name: "Morten Larsen", is_advisor: true },
    { user_id: "m2", full_name: "  ", is_advisor: false },
  ];
  it("medlemmet selv = «Dig»", () => expect(afsenderNavn("u1", "u1", profiler)).toBe("Dig"));
  it("rådgiveren ved navn", () => expect(afsenderNavn("r1", "u1", profiler)).toBe("Morten Larsen"));
  it("ukendt navn: «Medlem» for en kollega, ellers «Rådgiver»", () => {
    expect(afsenderNavn("m2", "u1", profiler)).toBe("Medlem");
    expect(afsenderNavn("x", "u1", [])).toBe("Rådgiver");
  });
});

describe("kortetsContent — som chattens sendefelt (chatAfsendelse)", () => {
  it("ren tekst → teksten, trimmet", () => expect(kortetsContent("  Hej Morten  ")).toBe("Hej Morten"));
  it("med & < > → editorens HTML-afsnit (isPlain-reglen)", () => {
    expect(kortetsContent("a < b & c")).toBe("<p>a &lt; b &amp; c</p>");
  });
  it("tom eller over chattens loft → null", () => {
    expect(kortetsContent("   ")).toBeNull();
    expect(kortetsContent("x".repeat(MAX_MESSAGE_LENGTH + 1))).toBeNull();
    expect(kortetsContent("x".repeat(MAX_MESSAGE_LENGTH))).toBe("x".repeat(MAX_MESSAGE_LENGTH));
  });
});
