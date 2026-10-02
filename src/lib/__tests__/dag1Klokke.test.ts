import { describe, expect, it } from "vitest";
import { iUniverset } from "@/lib/medlemsOverblik";
import { computeMembershipTier } from "@/lib/membershipTier";
import { afgoerVenterPaaVelkomst } from "@/lib/venterPaaVelkomst";
import {
  DAG1_LAAS_NOEGLE,
  DAG1_SKIVE,
  DAG1_TEKST,
  dag1Besked,
  dag1LaasAktiv,
  dag1SkriverRigtigt,
  dag1Titel,
  dag1Udenfor,
  type Dag1Virksomhed,
  danskeKalenderdageSiden,
  doemDag1Klokke,
  KANDIDAT_VINDUE_DAGE,
  kandidatVindueFra,
  KLOKKE_SENEST_DAG,
  medlemSidenPrVirksomhed,
  sidsteRaadgiverBeskedPrVirksomhed,
  STANDARD_NAVN,
  tomtDag1Resultat,
  TYPE_VENTER_PAA_VELKOMST,
} from "../../../supabase/functions/_shared/dag1Klokke.ts";
import { VINDUE_DAGE } from "../../../supabase/functions/_shared/klokkeMail.ts";

// Dag-1-klokken (2/10-2026, a1002-velkomst): forsidens dom «venter på velkomst»
// som klokke i morgenmailen. Én test pr. regel.

const C = (o: Partial<Dag1Virksomhed> = {}): Dag1Virksomhed => ({
  id: "c1", name: "Firma ApS", status: "active", is_legat: false, er_kunde: true, is_demo: false,
  data_slettet_at: null, contract_end_date: "2027-10-01", subscription_status: null, subscription_current_period_end: null, ...o,
});
// Kørslen: 3/10-2026 kl. 04:30 UTC = 06:30 dansk sommertid.
const NU = new Date("2026-10-03T04:30:00Z");

describe("konstanterne", () => {
  it("typen, låsen, skiven, vinduet", () => {
    expect(TYPE_VENTER_PAA_VELKOMST).toBe("venter_paa_velkomst");
    expect(DAG1_LAAS_NOEGLE).toBe("dag1_klokke_aktiv");
    expect(DAG1_SKIVE).toBe("skive-1");
    expect(KLOKKE_SENEST_DAG).toBe(7);
    expect(KLOKKE_SENEST_DAG).toBe(VINDUE_DAGE); // en klokke ældre end morgenmailens vindue mailes alligevel ikke
    expect(KANDIDAT_VINDUE_DAGE).toBe(KLOKKE_SENEST_DAG + 2);
    expect(kandidatVindueFra(NU)).toBe("2026-09-24T04:30:00.000Z");
  });
});

describe("danskeKalenderdageSiden — den danske kalender, ikke maskinens", () => {
  it("kom ind kl. 00:30 dansk (22:30 UTC dagen før): dag 0 kl. 06:30 — ikke «i går»", () => {
    expect(danskeKalenderdageSiden("2026-10-02T22:30:00Z", NU)).toBe(0);
  });
  it("kom ind i går kl. 23:50 dansk (21:50 UTC): dag 1", () => {
    expect(danskeKalenderdageSiden("2026-10-02T21:50:00Z", NU)).toBe(1);
  });
  it("kom ind i forgårs kl. 01:30 dansk (23:30 UTC tre UTC-dage før): dag 2, ikke 3", () => {
    expect(danskeKalenderdageSiden("2026-09-30T23:30:00Z", NU)).toBe(2);
  });
  it("vintertid (CET = UTC+1) og over sommertidsskiftet 25/10-2026", () => {
    const vinter = new Date("2026-11-03T04:30:00Z"); // 05:30 dansk
    expect(danskeKalenderdageSiden("2026-11-02T23:10:00Z", vinter)).toBe(0); // 00:10 dansk 3/11
    expect(danskeKalenderdageSiden("2026-11-02T22:50:00Z", vinter)).toBe(1); // 23:50 dansk 2/11
    expect(danskeKalenderdageSiden("2026-10-24T22:30:00Z", new Date("2026-10-26T04:30:00Z"))).toBe(1); // 00:30 dansk 25/10 → 26/10
  });
  it("ugyldig eller tom start: null", () => {
    expect(danskeKalenderdageSiden(null, NU)).toBeNull();
    expect(danskeKalenderdageSiden(undefined, NU)).toBeNull();
    expect(danskeKalenderdageSiden("hest", NU)).toBeNull();
  });
});

describe("universet er rådgiverforsidens", () => {
  it("demo, legat, ikke-kunde, ikke aktiv, slettet, udløbet og ingen virksomhed er udenfor — med grund", () => {
    expect(dag1Udenfor(null, NU)).toBe("ingen_virksomhed");
    expect(dag1Udenfor(C({ data_slettet_at: "2026-09-01T00:00:00Z" }), NU)).toBe("slettet");
    expect(dag1Udenfor(C({ is_demo: true }), NU)).toBe("demo");
    expect(dag1Udenfor(C({ is_legat: true }), NU)).toBe("legat");
    expect(dag1Udenfor(C({ er_kunde: false }), NU)).toBe("ikke_kunde");
    expect(dag1Udenfor(C({ status: "tidligere" }), NU)).toBe("ikke_aktiv");
    expect(dag1Udenfor(C({ contract_end_date: "2026-09-01" }), NU)).toBe("udloebet");
    expect(dag1Udenfor(C(), NU)).toBeNull();
  });
  it("er_kunde null og status null er INDE (fail-open som erKunde og iUniverset); ingen slutdato er «no_date», ikke udløbet", () => {
    expect(dag1Udenfor(C({ er_kunde: null, status: null }), NU)).toBeNull();
    expect(dag1Udenfor(C({ contract_end_date: null }), NU)).toBeNull();
  });
  it("siger det samme som medlemsOverblik.iUniverset + forsidens expired-gate på ALLE kombinationer", () => {
    for (const is_demo of [true, false, null]) for (const is_legat of [true, false, null]) for (const er_kunde of [true, false, null])
      for (const status of ["active", "tidligere", null, ""]) for (const contract_end_date of ["2027-01-01", "2026-09-01", null])
        for (const data_slettet_at of [null, "2026-09-01T00:00:00Z"]) {
          const c = C({ is_demo, is_legat, er_kunde, status, contract_end_date, data_slettet_at });
          const forsiden = iUniverset(c) && !data_slettet_at
            && computeMembershipTier({ contract_end_date, subscription_status: null, subscription_current_period_end: null }, NU) !== "expired";
          expect(dag1Udenfor(c, NU) === null, JSON.stringify(c)).toBe(forsiden);
        }
  });
});

describe("doemDag1Klokke — forsidens regel, klokkens vindue, én gang", () => {
  const ind = (o: Partial<Parameters<typeof doemDag1Klokke>[0]> = {}) => ({
    virksomhed: C(), medlemSiden: "2026-10-02T08:00:00Z", sidsteRaadgiverBeskedAt: null, harKlokke: false, ...o,
  });
  it("dag 1, ingen rådgiverbesked: ring — titlen og teksten", () => {
    expect(doemDag1Klokke(ind(), NU)).toEqual({
      klokke: "ring", dage: 1, titel: "Firma ApS kom ind i går og har ikke hørt fra os endnu", tekst: DAG1_TEKST,
    });
  });
  it("dag 0: for tidligt (rådgiveren har dagen) — også når UTC-kalenderen ville sige dag 1", () => {
    expect(doemDag1Klokke(ind({ medlemSiden: "2026-10-02T22:30:00Z" }), NU)).toEqual({ klokke: "tavs", grund: "for_tidligt" });
  });
  it("en rådgiver har skrevet — punktum", () => {
    expect(doemDag1Klokke(ind({ sidsteRaadgiverBeskedAt: "2026-10-02T09:00:00Z" }), NU)).toEqual({ klokke: "tavs", grund: "hilst_paa" });
  });
  it("intet medlem", () => {
    expect(doemDag1Klokke(ind({ medlemSiden: null }), NU)).toEqual({ klokke: "tavs", grund: "ingen_medlem" });
  });
  it("vinduet: dag 7 ringer, dag 8 er for gammel (forsiden bærer resten)", () => {
    expect(doemDag1Klokke(ind({ medlemSiden: "2026-09-26T08:00:00Z" }), NU)).toMatchObject({ klokke: "ring", dage: 7, titel: "Firma ApS kom ind for 7 dage siden og har ikke hørt fra os endnu" });
    expect(doemDag1Klokke(ind({ medlemSiden: "2026-09-25T08:00:00Z" }), NU)).toEqual({ klokke: "tavs", grund: "for_gammel" });
  });
  it("har virksomheden allerede klokken: aldrig igen (dag 2, 3 …)", () => {
    expect(doemDag1Klokke(ind({ harKlokke: true }), NU)).toEqual({ klokke: "tavs", grund: "har_klokke" });
    expect(doemDag1Klokke(ind({ harKlokke: true, medlemSiden: "2026-09-30T08:00:00Z" }), NU)).toEqual({ klokke: "tavs", grund: "har_klokke" });
  });
  it("universet først: en demo ringer aldrig, uanset alt andet", () => {
    expect(doemDag1Klokke(ind({ virksomhed: C({ is_demo: true }) }), NU)).toEqual({ klokke: "tavs", grund: "demo" });
  });
  it("SAMME DOM SOM FORSIDEN, når kalenderen er den samme: signalet ⇔ «venter»", () => {
    // Forsiden tæller i læserens kalender; testen kører med TZ fra miljøet. Vi sammenligner kun
    // på tidspunkter midt på den danske dag, hvor UTC- og dansk kalender og en europæisk/UTC-
    // maskines kalender er enige (kl. 12 UTC).
    const nu = new Date("2026-10-03T12:00:00Z");
    for (const dage of [0, 1, 2, 5, 7]) {
      const medlemSiden = new Date(Date.UTC(2026, 9, 3 - dage, 12, 0)).toISOString();
      for (const sidsteRaadgiverBeskedAt of [null, "2026-09-01T12:00:00Z"]) {
        const forsiden = afgoerVenterPaaVelkomst({ medlemSiden, sidsteRaadgiverBeskedAt }, nu);
        const klokken = doemDag1Klokke({ virksomhed: C(), medlemSiden, sidsteRaadgiverBeskedAt, harKlokke: false }, nu);
        expect(klokken.klokke === "ring").toBe(forsiden.signal);
      }
    }
  });
});

describe("teksten og klokken", () => {
  it("titlen: i går · N dage · tomt navn", () => {
    expect(dag1Titel("Firma ApS", 1)).toBe("Firma ApS kom ind i går og har ikke hørt fra os endnu");
    expect(dag1Titel("Firma ApS", 3)).toBe("Firma ApS kom ind for 3 dage siden og har ikke hørt fra os endnu");
    expect(dag1Titel("  ", 1)).toBe(`${STANDARD_NAVN} kom ind i går og har ikke hørt fra os endnu`);
    expect(dag1Titel(null, 1)).toBe(`${STANDARD_NAVN} kom ind i går og har ikke hørt fra os endnu`);
  });
  it("klokken: typen, chat-referencen uden reference_id, virksomheden", () => {
    expect(dag1Besked("c1", { titel: "T", tekst: "B" })).toEqual({
      type: "venter_paa_velkomst", title: "T", body: "B", company_id: "c1", reference_type: "chat", reference_id: null,
    });
  });
});

describe("låsen og tællerne", () => {
  it("skriver kun med dry_run false OG åben lås", () => {
    expect(dag1SkriverRigtigt(true, true)).toBe(false);
    expect(dag1SkriverRigtigt(false, false)).toBe(false);
    expect(dag1SkriverRigtigt(false, true)).toBe(true);
  });
  it("kun eksplicit true åbner låsen", () => {
    expect(dag1LaasAktiv(true)).toBe(true);
    expect(dag1LaasAktiv("true")).toBe(true);
    for (const v of [false, "false", null, undefined, 1, {}, "ja"]) expect(dag1LaasAktiv(v)).toBe(false);
  });
  it("det tomme resultat: tal, sandhedsværdier, ingen navne", () => {
    expect(tomtDag1Resultat(false, true)).toEqual({
      laas_aktiv: false, skriver_rigtigt: false, kandidater: 0, ring: 0, ville_ringe: 0, holdt_af_laas: 0, ringet: 0, fandtes: 0, tavse: {}, fejlet: 0, fejl: [],
    });
    expect(tomtDag1Resultat(true, false).skriver_rigtigt).toBe(true);
  });
});

describe("grundlaget — forsidens regnestykker", () => {
  it("første medlemskab = min created_at; tomme rækker springes over", () => {
    const m = medlemSidenPrVirksomhed([
      { company_id: "a", created_at: "2026-10-02T08:00:00Z" },
      { company_id: "a", created_at: "2026-09-01T08:00:00Z" },
      { company_id: "b", created_at: null },
      { company_id: null, created_at: "2026-09-01T08:00:00Z" },
    ]);
    expect([...m]).toEqual([["a", "2026-09-01T08:00:00Z"]]);
  });
  it("seneste rådgiverbesked = max last_advisor_reply_at på tværs af samtaler", () => {
    const s = sidsteRaadgiverBeskedPrVirksomhed([
      { company_id: "a", last_advisor_reply_at: null },
      { company_id: "a", last_advisor_reply_at: "2026-09-01T08:00:00Z" },
      { company_id: "a", last_advisor_reply_at: "2026-09-03T08:00:00Z" },
      { company_id: "b", last_advisor_reply_at: null },
    ]);
    expect([...s]).toEqual([["a", "2026-09-03T08:00:00Z"]]);
  });
});
