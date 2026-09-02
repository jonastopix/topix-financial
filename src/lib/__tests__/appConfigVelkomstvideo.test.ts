import { describe, it, expect } from "vitest";
import { laesVelkomstvideoGuid, harVelkomstvideo } from "@/lib/appConfig";

/**
 * Låser dommen «er der sat en velkomstvideo?» — app_config.config_value er
 * JSON, ikke text. Målt 2/9: rækken er oprettet i produktion med '""'::json,
 * en tom JSON-streng. supabase-js leverer jsonb parset (JS-strengen ""),
 * men læses værdien rå (fx config_value::text i SQL), er den strengen «""»
 * på to tegn. Begge SKAL give «ingen video» — ellers viser platformen en
 * overlejring med tom indlejring og tæller punktet med. Det er præcis det
 * Jonas bad om ikke skulle ske.
 */

const GUID = "5c6191a2-c148-470a-b5d2-e9740a25fac7";

describe("laesVelkomstvideoGuid — JSON-værdien fra app_config", () => {
  it("tom JSON-streng (parset: \"\") → tom", () => {
    expect(laesVelkomstvideoGuid("")).toBe("");
  });

  it("tom JSON-streng læst RÅ (to tegn: «\"\"») → tom", () => {
    expect(laesVelkomstvideoGuid('""')).toBe("");
  });

  it("JSON-streng med kun mellemrum → tom, parset og rå", () => {
    expect(laesVelkomstvideoGuid("   ")).toBe("");
    expect(laesVelkomstvideoGuid('"   "')).toBe("");
    expect(laesVelkomstvideoGuid("\t\n")).toBe("");
  });

  it("en rigtig GUID → GUID'et, trimmet, parset og rå", () => {
    expect(laesVelkomstvideoGuid(GUID)).toBe(GUID);
    expect(laesVelkomstvideoGuid(`  ${GUID}  `)).toBe(GUID);
    expect(laesVelkomstvideoGuid(`"${GUID}"`)).toBe(GUID);
  });

  it("alt der ikke er en streng → tom (null, tal, objekt, boolean, undefined)", () => {
    expect(laesVelkomstvideoGuid(null)).toBe("");
    expect(laesVelkomstvideoGuid(undefined)).toBe("");
    expect(laesVelkomstvideoGuid(30)).toBe("");
    expect(laesVelkomstvideoGuid({ guid: GUID })).toBe("");
    expect(laesVelkomstvideoGuid(true)).toBe("");
  });

  it("noget der ikke ligner et GUID → tom (kun GUID-form er en video)", () => {
    expect(laesVelkomstvideoGuid("abc")).toBe("");
    expect(laesVelkomstvideoGuid("https://iframe.mediadelivery.net/embed/720547/x")).toBe("");
    expect(laesVelkomstvideoGuid('"abc"')).toBe("");
  });

  it("GUID i store bogstaver accepteres og normaliseres til små", () => {
    expect(laesVelkomstvideoGuid(GUID.toUpperCase())).toBe(GUID);
  });
});

describe("harVelkomstvideo — dommen fladen og motoren bruger", () => {
  it("tom JSON-streng og mellemrum → false", () => {
    expect(harVelkomstvideo("")).toBe(false);
    expect(harVelkomstvideo('""')).toBe(false);
    expect(harVelkomstvideo("   ")).toBe(false);
    expect(harVelkomstvideo('"  "')).toBe(false);
    expect(harVelkomstvideo(null)).toBe(false);
  });

  it("en rigtig GUID → true", () => {
    expect(harVelkomstvideo(GUID)).toBe(true);
    expect(harVelkomstvideo(`"${GUID}"`)).toBe(true);
  });
});
