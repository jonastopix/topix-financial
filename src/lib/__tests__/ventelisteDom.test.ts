import { describe, expect, it } from "vitest";
import {
  BLOED_EFTER_MAANEDER,
  LEDIG_VED_FORNYELSESSTATUS,
  SVARFRIST_DAGE,
  afgoerSvar,
  anciennitet,
  datoKort,
  erBloedUdgave,
  erPladsLedig,
  forsidelinje,
  harTilbudUde,
  naesteIKoen,
  sorterKoe,
  svarfristFra,
  type VentepladsRaekke,
} from "@/lib/ventelisteDom";

// Ventelisten (udkast 18/9): et nej på nichen bliver til en plads i køen.
// Hver regel fra chatten 17/9 og Jonas' svar har sin egen it.

const NU = new Date("2026-09-18T12:00:00.000Z");
const r = (id: string, o: Partial<VentepladsRaekke> = {}): VentepladsRaekke => ({
  id, ansoegning_id: `a-${id}`, company_id: "c1", status: "venter", sat_at: "2026-09-01T10:00:00.000Z", afvist_at: null, ...o,
});

describe("konstanterne — reglerne fra 17/9", () => {
  it("syv dage, tolv måneder", () => {
    expect(SVARFRIST_DAGE).toBe(7);
    expect(BLOED_EFTER_MAANEDER).toBe(12);
  });
  it("pladsen er ledig ved «tilbyd ikke» (før og efter slutdato), dag 15 uden svar, og ophørt uden beslutning — ikke mens tilbuddet lever", () => {
    expect([...LEDIG_VED_FORNYELSESSTATUS].sort()).toEqual(["klar_til_afsked", "ophoert", "udloebet_tilbyd_ikke", "udloebet_vindue_lukket"]);
    expect(erPladsLedig("udloebet_tilbyd")).toBe(false);
    expect(erPladsLedig("i_god_tid")).toBe(false);
    expect(erPladsLedig("klar_til_tilbud")).toBe(false);
    expect(erPladsLedig("selvbetjener")).toBe(false);
    expect(erPladsLedig("udloebet_vindue_lukket")).toBe(true);
  });
});

describe("anciennitet og rækkefølgen — hvornår de blev afvist", () => {
  it("afvist_at går forud for sat_at; ulæselig dato sidst", () => {
    expect(anciennitet(r("x", { afvist_at: "2026-05-03T00:00:00.000Z", sat_at: "2026-09-01T00:00:00.000Z" }))).toBe(Date.UTC(2026, 4, 3));
    expect(anciennitet(r("x", { afvist_at: null }))).toBe(Date.UTC(2026, 8, 1, 10));
    expect(anciennitet(r("x", { afvist_at: "hest", sat_at: "hest" }))).toBe(Number.POSITIVE_INFINITY);
  });
  it("køen: kun «venter», ældst afvist først, stabil ved lige", () => {
    const koe = sorterKoe([
      r("b", { afvist_at: "2026-06-01T00:00:00.000Z" }),
      r("a", { afvist_at: "2026-05-03T00:00:00.000Z" }),
      r("t", { status: "tilbudt", afvist_at: "2026-01-01T00:00:00.000Z" }),
      r("c", { afvist_at: "2026-06-01T00:00:00.000Z" }),
      r("u", { status: "udloebet", afvist_at: "2026-01-01T00:00:00.000Z" }),
    ]);
    expect(koe.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(naesteIKoen(koe)?.id).toBe("a");
    expect(naesteIKoen([])).toBeNull();
  });
  it("harTilbudUde: sandt når én står som tilbudt", () => {
    expect(harTilbudUde([r("a"), r("t", { status: "tilbudt" })])).toBe(true);
    expect(harTilbudUde([r("a"), r("u", { status: "udloebet" })])).toBe(false);
  });
});

describe("den bløde udgave — afvist for mere end 12 måneder siden", () => {
  it("13 måneder: blød; 11 måneder: ikke; præcis 12 måneder: ikke (grænsen er lukket); ukendt: ikke", () => {
    expect(erBloedUdgave("2025-08-18T12:00:00.000Z", NU)).toBe(true);
    expect(erBloedUdgave("2025-10-18T12:00:00.000Z", NU)).toBe(false);
    expect(erBloedUdgave("2025-09-18T12:00:00.000Z", NU)).toBe(false);
    expect(erBloedUdgave("2025-09-18T11:59:59.000Z", NU)).toBe(true);
    expect(erBloedUdgave(null, NU)).toBe(false);
  });
});

describe("svarfristen", () => {
  it("syv døgn fra tilbuddet", () => {
    expect(svarfristFra(NU).toISOString()).toBe("2026-09-25T12:00:00.000Z");
  });
});

describe("afgoerSvar — ja ét sted = ude af alle køer; nej = kun den ene", () => {
  const pladser = [
    r("p1", { company_id: "c1", status: "tilbudt" }),
    r("p2", { company_id: "c2", status: "venter" }),
    r("p3", { company_id: "c3", status: "venter" }),
    r("p4", { company_id: "c4", status: "udloebet" }),
  ];
  it("ja: den tilbudte accepteret, de ventende trukket, den afsluttede urørt", () => {
    expect(afgoerSvar(pladser, "p1", "accepteret")).toEqual([
      { id: "p1", status: "accepteret" },
      { id: "p2", status: "trukket" },
      { id: "p3", status: "trukket" },
    ]);
  });
  it("nej: kun den tilbudte afslået — de andre venter videre", () => {
    expect(afgoerSvar(pladser, "p1", "afslaaet")).toEqual([{ id: "p1", status: "afslaaet" }]);
  });
  it("svar på en række der ikke er tilbudt: ingenting", () => {
    expect(afgoerSvar(pladser, "p2", "accepteret")).toEqual([{ id: "p1", status: "trukket" }, { id: "p3", status: "trukket" }]);
    expect(afgoerSvar(pladser, "p9", "afslaaet")).toEqual([]);
  });
});

describe("forsidelinjen — «X er ude. Y har ventet siden … — tilbyd pladsen?»", () => {
  it("én i køen: navn, dato og handling", () => {
    expect(forsidelinje({ virksomhedNavn: "Homie", naeste: { navn: "Nordic Byg", afvist_at: "2026-05-03T09:00:00.000Z", sat_at: "2026-06-01T00:00:00.000Z" }, antalIKoen: 1, tilbudUde: false, nu: NU }))
      .toEqual({ tekst: "Homie er ude. Nordic Byg har ventet siden 3. maj — tilbyd pladsen?", handling: "Tilbyd pladsen til Nordic Byg" });
  });
  it("flere i køen: «(N mere i køen)»; sidste år bærer årstallet", () => {
    const l = forsidelinje({ virksomhedNavn: "Homie", naeste: { navn: "Nordic Byg", afvist_at: "2025-05-03T09:00:00.000Z", sat_at: "x" }, antalIKoen: 3, tilbudUde: false, nu: NU });
    expect(l?.tekst).toBe("Homie er ude. Nordic Byg har ventet siden 3. maj 2025 (2 mere i køen) — tilbyd pladsen?");
  });
  it("tilbud ude: linjen siger det og har ingen handling — mennesket har trykket", () => {
    expect(forsidelinje({ virksomhedNavn: "Homie", naeste: null, antalIKoen: 2, tilbudUde: true, nu: NU }))
      .toEqual({ tekst: "Homie er ude. Pladsen er tilbudt — køen svarer selv, når fristen er gået.", handling: null });
  });
  it("tom kø: ingen linje", () => {
    expect(forsidelinje({ virksomhedNavn: "Homie", naeste: null, antalIKoen: 0, tilbudUde: false, nu: NU })).toBeNull();
  });
  it("datoKort: ukendt dato siges, ikke gættes", () => {
    expect(datoKort(null, NU)).toBe("ukendt dato");
    expect(datoKort("2026-09-01T23:30:00.000Z", NU)).toBe("1. september");
  });
});
