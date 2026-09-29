import { describe, expect, it } from "vitest";
import { getCertificateStatus } from "@/components/hjemmebane/certifikat/format";
import { certifikatDom, laesDanskDato } from "@/lib/certifikat/dom";
import { computeMembershipTier } from "@/lib/membershipTier";
import {
  aabningsdato,
  ADGANG_TIERS,
  certifikatKlokkeModtagere,
  dedupNoegle,
  gyldigStartdato,
  KLOKKE_LINK,
  KLOKKE_TEKST,
  KLOKKE_TITEL,
  KLOKKE_TYPE,
  type KlokkeVirksomhed,
} from "@/lib/certifikat/klokke";

/**
 * Certifikat trin 2 (29/9-2026): klokken, når «Dit certifikat» åbner.
 * Beviset for åbningsdatoen er en matrix over ALLE startdage 2024-01-01 …
 * 2027-12-31 mod pakkens egen getCertificateStatus(...).unlockDate
 * (format.ts er låst på SHA-256 og røres ikke).
 */

const DOEGN = 86_400_000;
/** Alle kalenderdage fra `fra` til og med `til` som «YYYY-MM-DD» (UTC-kalender, ingen tidszone). */
function alleDage(fra: string, til: string): string[] {
  const ud: string[] = [];
  for (let t = Date.parse(`${fra}T00:00:00Z`); t <= Date.parse(`${til}T00:00:00Z`); t += DOEGN) ud.push(new Date(t).toISOString().slice(0, 10));
  return ud;
}
/** En lokal Date (som format.ts regner) som «YYYY-MM-DD». */
const somStreng = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("åbningsdatoen = format.ts getCertificateStatus(...).unlockDate — alle startdage 2024–2027", () => {
  const dage = alleDage("2024-01-01", "2027-12-31");

  it(`matrixen har ${dage.length} startdage (fire år, to skudår-februarer med 29.)`, () => {
    expect(dage).toHaveLength(366 + 365 + 365 + 365);
    expect(dage).toContain("2024-02-29");
    expect(dage).not.toContain("2025-02-29");
  });

  it("hver startdag: ren kalender på strenge giver præcis pakkens unlockDate (samme læsning som dom.ts laesDanskDato)", () => {
    const afvigelser: string[] = [];
    for (const start of dage) {
      const pakken = somStreng(getCertificateStatus(laesDanskDato(start)!, true, new Date("2026-06-01T12:00:00Z")).unlockDate);
      const vores = aabningsdato(start);
      if (pakken !== vores) afvigelser.push(`${start}: pakken ${pakken}, vores ${vores}`);
    }
    expect(afvigelser).toEqual([]);
  });

  it("månedsslutninger og skudår — facit skrevet ud", () => {
    expect(aabningsdato("2024-02-29")).toBe("2025-02-21"); // 2025-02-28 (klippet) − 7
    expect(aabningsdato("2027-02-28")).toBe("2028-02-21"); // 2028 er skudår, men 28. står
    expect(aabningsdato("2025-03-31")).toBe("2026-03-24");
    expect(aabningsdato("2025-01-05")).toBe("2025-12-29"); // −7 krydser årsskiftet
    expect(aabningsdato("2025-10-22")).toBe("2026-10-15");
  });
});

describe("gyldigStartdato — samme dom som dom.ts laesDanskDato", () => {
  it("gyldig «YYYY-MM-DD» (trimmet) består; alt andet er null", () => {
    expect(gyldigStartdato("2025-10-22")).toBe("2025-10-22");
    expect(gyldigStartdato(" 2025-10-22 ")).toBe("2025-10-22");
    for (const s of ["2026-02-31", "2025-02-29", "2025-13-01", "2025-00-10", "2025-10-22T00:00:00Z", "22-10-2025", "", null, undefined]) {
      expect(gyldigStartdato(s), String(s)).toBeNull();
    }
  });
  it("enig med laesDanskDato på en blanding af gyldige og ugyldige", () => {
    for (const s of ["2024-02-29", "2023-02-29", "2026-04-31", "2026-04-30", "2026-12-31", "0999-01-01", " 2026-01-01"]) {
      expect(gyldigStartdato(s) !== null, s).toBe(laesDanskDato(s) !== null);
    }
  });
});

// ── Udvælgelsen ─────────────────────────────────────────────────────────────

const NU = new Date("2026-10-15T07:00:00Z"); // torsdag 15/10-2026 kl. 09:00 dansk
const v = (id: string, x: Partial<KlokkeVirksomhed> = {}): KlokkeVirksomhed => ({
  id, name: id.toUpperCase(), certificate_eligible: true, contract_start_date: "2025-10-22",
  contract_end_date: "2026-10-21", subscription_status: null, subscription_current_period_end: null, ...x,
});
const kald = (virksomheder: KlokkeVirksomhed[], medlemmer = virksomheder.map((c) => ({ company_id: c.id, user_id: `u-${c.id}` })), raadgivere: string[] = [], harHentet: string[] = [], nu = NU) =>
  certifikatKlokkeModtagere({ virksomheder, medlemmer, raadgivere, harHentet, nu });

describe("certifikatKlokkeModtagere — hver gren", () => {
  it("åbner i dag → klar, med åbningsdato og dedup-nøgle; åbner i morgen → ikke endnu", () => {
    const u = kald([v("idag"), v("imorgen", { contract_start_date: "2025-10-23" })]);
    expect(u.iDag).toBe("2026-10-15");
    expect(u.klar).toEqual([{ companyId: "idag", navn: "IDAG", aabningsdato: "2026-10-15", modtagere: ["u-idag"], dedupKey: "certifikat_klar:idag:2026-10-15" }]);
    expect(u.sprunget.ikke_aabnet).toBe(1);
  });

  it("ALLEREDE åbent (BRILLEVÆRK/Capture IT-tilfældet): åbnede for måneder siden → stadig klar (<= i dag, ikke eksakt dag)", () => {
    const u = kald([v("gammel", { contract_start_date: "2025-03-01", contract_end_date: "2026-12-31" })]);
    expect(u.klar.map((k) => [k.companyId, k.aabningsdato])).toEqual([["gammel", "2026-02-22"]]);
  });

  it("«i dag» er den DANSKE kalenderdag: 14/10 kl. 22:30 UTC er 15/10 kl. 00:30 i Danmark", () => {
    expect(kald([v("idag")], undefined, [], [], new Date("2026-10-14T22:30:00Z")).klar).toHaveLength(1);
    expect(kald([v("idag")], undefined, [], [], new Date("2026-10-14T21:59:00Z")).klar).toHaveLength(0);
  });

  it("ikke berettiget, ingen startdato og ugyldig startdato springes over", () => {
    const u = kald([
      v("nej", { certificate_eligible: false }), v("null", { certificate_eligible: null }),
      v("ingen", { contract_start_date: null }), v("tom", { contract_start_date: "  " }),
      v("ugyldig", { contract_start_date: "2025-02-30" }),
    ]);
    expect(u.klar).toEqual([]);
    expect(u.sprunget).toMatchObject({ ikke_berettiget: 2, ingen_startdato: 2, ugyldig_startdato: 1 });
  });

  it("tier: «full» og «no_date» har adgang (fladen gør no_date til full); subscriber og expired har ikke", () => {
    expect([...ADGANG_TIERS]).toEqual(["full", "no_date"]);
    const u = kald([
      v("full"),
      v("nodate", { contract_end_date: null }),
      v("udloebet", { contract_end_date: "2026-10-14" }),
      v("abonnent", { contract_end_date: "2026-01-01", subscription_status: "active", subscription_current_period_end: "2026-11-30T00:00:00Z" }),
    ]);
    expect(u.klar.map((k) => k.companyId)).toEqual(["full", "nodate"]);
    expect(u.sprunget.ikke_fuldt_medlem).toBe(2);
  });

  it("rådgivere og medlemmer med hentninger får ingen klokke; alle andre brugere på virksomheden får hver sin", () => {
    const c = v("firma");
    const u = kald([c], [
      { company_id: "firma", user_id: "a" }, { company_id: "firma", user_id: "b" }, { company_id: "firma", user_id: "b" },
      { company_id: "firma", user_id: "raadgiver" }, { company_id: "firma", user_id: "har-hentet" },
    ], ["raadgiver"], ["har-hentet"]);
    expect(u.klar[0].modtagere).toEqual(["a", "b"]);
    expect(u.raadgivere).toBe(1);
    expect(u.harHentet).toBe(1);
  });

  it("en virksomhed uden modtagere (ingen brugere, eller alle har hentet) står ikke i klar", () => {
    const u = kald([v("tom"), v("alle")], [{ company_id: "alle", user_id: "x" }], [], ["x"]);
    expect(u.klar).toEqual([]);
    expect(u.sprunget.ingen_modtagere).toBe(2);
  });

  it("klokkens tekst og nøgle", () => {
    expect(KLOKKE_TYPE).toBe("certifikat_klar");
    expect(KLOKKE_TITEL).toBe("Dit certifikat er klar");
    expect(KLOKKE_TEKST).toBe("Du har været medlem af The Boardroom i 12 måneder. Vælg design og hent dit certifikat.");
    expect(KLOKKE_LINK).toBe("/certifikat");
    expect(dedupNoegle("c1", "2026-10-15")).toBe("certifikat_klar:c1:2026-10-15");
  });
});

describe("udvælgelsen er ENIG med fladens egen dom (dom.ts certifikatDom + useAuth's tier)", () => {
  // useAuth.tsx:126-135 afgoerMedlemsTier: computeMembershipTier, og no_date → full.
  const fladensTier = (c: KlokkeVirksomhed, nu: Date) => {
    const t = computeMembershipTier({ contract_end_date: c.contract_end_date, subscription_status: c.subscription_status, subscription_current_period_end: c.subscription_current_period_end }, nu);
    return t === "no_date" ? "full" : t;
  };
  it("for hver startdag i 2025 × tre «nu» omkring åbningen × fire tier-former: klar ⇔ siden er synlig og ÅBEN", () => {
    const former: Partial<KlokkeVirksomhed>[] = [
      { contract_end_date: "2027-12-31" }, { contract_end_date: null }, { contract_end_date: "2025-01-01" },
      { contract_end_date: "2025-01-01", subscription_status: "active", subscription_current_period_end: "2030-01-01T00:00:00Z" },
    ];
    let klar = 0;
    for (const start of alleDage("2025-01-01", "2025-12-31")) {
      const aabning = aabningsdato(start);
      for (const nu of [`${aabning}T10:00:00Z`, new Date(Date.parse(`${aabning}T10:00:00Z`) - DOEGN).toISOString(), "2027-06-01T10:00:00Z"].map((s) => new Date(s))) {
        for (const f of former) {
          const c = v(`c-${start}`, { contract_start_date: start, ...f });
          const vores = kald([c], [{ company_id: c.id, user_id: "u" }], [], [], nu).klar.length === 1;
          const dom = certifikatDom({ isAdvisor: false, membershipTier: fladensTier(c, nu), eligible: true, kontraktStart: start }, nu);
          const fladen = dom.synlig === true && dom.status.state === "open";
          expect(vores, `${start} · ${nu.toISOString()} · ${JSON.stringify(f)}`).toBe(fladen);
          if (vores) klar++;
        }
      }
    }
    expect(klar).toBeGreaterThan(365); // porten åbner faktisk — ikke en tavs dom
  });
});
