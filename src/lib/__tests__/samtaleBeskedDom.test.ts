import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afgoerSamtaleBesked, klokkeTekst, SAMTALE_KLOKKE, SAMTALE_MAIL, samtaleIdempotensnoegle } from "@/lib/samtaleBeskedDom";
import { KOE_SKABELONER } from "@/lib/rykkerkoe";

const krop = (sti: string) => { const k = readFileSync(resolve(process.cwd(), sti), "utf8"); return k.slice(k.indexOf("*/") + 2); };

describe("samtaleBeskedDom — hvem får besked (flyt-event-mønstret, #986)", () => {
  it("paritet src/lib ↔ _shared", () => {
    expect(krop("src/lib/samtaleBeskedDom.ts")).toBe(krop("supabase/functions/_shared/samtaleBeskedDom.ts"));
  });
  it("ansøgeren får altid en mail; rådgiverne får kun en klokke når ansøgeren handlede", () => {
    expect(afgoerSamtaleBesked("book", "ansoeger")).toEqual({ mailTilAnsoeger: "ansoegning-samtale-bekraeftet", klokkeTilRaadgiver: "ansoegning_samtale_booket" });
    expect(afgoerSamtaleBesked("book", "raadgiver")).toEqual({ mailTilAnsoeger: "ansoegning-samtale-bekraeftet", klokkeTilRaadgiver: null });
    expect(afgoerSamtaleBesked("flyt", "ansoeger")).toEqual({ mailTilAnsoeger: "ansoegning-samtale-flyttet", klokkeTilRaadgiver: "ansoegning_samtale_flyttet" });
    expect(afgoerSamtaleBesked("flyt", "raadgiver")).toEqual({ mailTilAnsoeger: "ansoegning-samtale-flyttet", klokkeTilRaadgiver: null });
    expect(afgoerSamtaleBesked("aflys", "ansoeger")).toEqual({ mailTilAnsoeger: "ansoegning-samtale-aflyst", klokkeTilRaadgiver: "ansoegning_samtale_aflyst" });
    expect(afgoerSamtaleBesked("aflys", "raadgiver")).toEqual({ mailTilAnsoeger: "ansoegning-samtale-aflyst", klokkeTilRaadgiver: null });
  });
  it("de tre mails går uden om rykkerkøen: ingen af dem er i KOE_SKABELONER", () => {
    for (const s of Object.values(SAMTALE_MAIL)) expect(KOE_SKABELONER).not.toContain(s);
    expect(Object.values(SAMTALE_KLOKKE).every((k) => k.startsWith("ansoegning_samtale_"))).toBe(true);
  });
  it("idempotensnøglen bærer ansøgning, ændring og den nye tid — en aflysning har ingen tid", () => {
    expect(samtaleIdempotensnoegle("a1", "book", "2026-09-21T07:00:00.000Z")).toBe("samtale:a1:book:2026-09-21T07:00:00.000Z");
    expect(samtaleIdempotensnoegle("a1", "aflys", null)).toBe("samtale:a1:aflys:ingen");
    expect(samtaleIdempotensnoegle("a1", "flyt", "x")).not.toBe(samtaleIdempotensnoegle("a1", "flyt", "y"));
  });
  it("klokketeksten siger hvad der skete med tiderne i ord", () => {
    expect(klokkeTekst("book", "Nordic Byg ApS", "mandag den 21. september kl. 09.00", null).title).toBe("Nordic Byg ApS har booket samtalen");
    expect(klokkeTekst("flyt", "Nordic Byg ApS", "ny", "gammel").body).toBe("Ny tid: ny. Den var sat til gammel.");
    expect(klokkeTekst("aflys", "Nordic Byg ApS", null, "gammel").body).toMatch(/står igen som indkaldt/);
  });
});
