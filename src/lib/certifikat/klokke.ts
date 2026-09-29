/**
 * src/lib/certifikat/klokke.ts — spejl af supabase/functions/_shared/certifikatKlokke.ts
 * (certifikat trin 2, 29/9-2026). Kroppen efter filhovedet er ordret ens på nær
 * import-linjerne (`@/lib/x` her, `./x.ts` dér — edge functions kan ikke
 * importere fra src). Paritet: src/lib/__tests__/certifikatKlokke.paritet.test.ts.
 *
 * Reglerne, regnestykket for åbningsdatoen og citaterne fra fladen (dom.ts,
 * useCertificate.ts, useAuth.tsx afgoerMedlemsTier, format.ts) står i
 * Deno-filens filhoved — læs det før noget ændres her. Flaget
 * certificate_eligible er et FRAVALG siden 20260929195000 (standard true, alle
 * virksomheder har det; false = ingen certifikat og ingen klokke).
 */
import { computeMembershipTier, type MembershipTier } from "@/lib/membershipTier";
import { kbhDato, laegDageTilDato, laegMaanederTilDato } from "@/lib/hverdage";

export const CERTIFIKAT_MAANEDER = 12;
export const AABNER_DAGE_FOER = 7;

/** De tiers, der giver adgang til siden: fladens «full» — som computeMembershipTier kalder "full" eller "no_date". */
export const ADGANG_TIERS: readonly MembershipTier[] = ["full", "no_date"];

export const KLOKKE_TYPE = "certifikat_klar";
export const KLOKKE_TITEL = "Dit certifikat er klar";
export const KLOKKE_TEKST = "Du har været medlem af The Boardroom i 12 måneder. Vælg design og hent dit certifikat.";
export const KLOKKE_LINK = "/certifikat";
export const KLOKKE_REFERENCE_TYPE = "certifikat";

const DATO = /^\d{4}-\d{2}-\d{2}$/;

/** «YYYY-MM-DD» (trimmet), og en dato der findes — ellers null. Samme dom som dom.ts laesDanskDato, uden Date. */
export function gyldigStartdato(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  if (!DATO.test(t)) return null;
  return laegDageTilDato(t, 0) === t ? t : null;
}

/** Åbningsdatoen: startdato + 12 måneder − 7 dage, ren kalender (se filhovedet). */
export function aabningsdato(startdato: string): string {
  return laegDageTilDato(laegMaanederTilDato(startdato, CERTIFIKAT_MAANEDER), -AABNER_DAGE_FOER);
}

export function dedupNoegle(companyId: string, aabning: string): string {
  return `${KLOKKE_TYPE}:${companyId}:${aabning}`;
}

export interface KlokkeVirksomhed {
  id: string;
  name?: string | null;
  certificate_eligible: boolean | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  subscription_status: string | null;
  subscription_current_period_end: string | null;
}

export interface KlokkeMedlem {
  company_id: string;
  user_id: string;
}

export interface KlokkeKlar {
  companyId: string;
  navn: string;
  aabningsdato: string;
  modtagere: string[];
  dedupKey: string;
}

export type SprungetGrund =
  | "ikke_berettiget"
  | "ingen_startdato"
  | "ugyldig_startdato"
  | "ikke_aabnet"
  | "ikke_fuldt_medlem"
  | "ingen_modtagere";

export interface KlokkeUdvalg {
  iDag: string;
  klar: KlokkeKlar[];
  /** Virksomheder sprunget over, pr. grund. */
  sprunget: Record<SprungetGrund, number>;
  /** Medlemmer sprunget over på virksomheder, der ellers var klar. */
  raadgivere: number;
  harHentet: number;
}

/** Udvælgelsen. Ren: virksomheder, medlemmer, rådgiver-id'er, id'er med hentninger og `nu` ind — modtagerne ud. */
export function certifikatKlokkeModtagere(i: {
  virksomheder: readonly KlokkeVirksomhed[];
  medlemmer: readonly KlokkeMedlem[];
  /** user_roles med role advisor eller admin. */
  raadgivere: Iterable<string>;
  /** user_id'er med mindst én række i certificate_downloads. */
  harHentet: Iterable<string>;
  nu: Date;
}): KlokkeUdvalg {
  const iDag = kbhDato(i.nu);
  const raadgivere = new Set(i.raadgivere);
  const hentet = new Set(i.harHentet);
  const medlemmerPr = new Map<string, string[]>();
  for (const m of i.medlemmer) {
    if (!m.company_id || !m.user_id) continue;
    const liste = medlemmerPr.get(m.company_id) ?? [];
    if (!liste.includes(m.user_id)) liste.push(m.user_id);
    medlemmerPr.set(m.company_id, liste);
  }

  const ud: KlokkeUdvalg = {
    iDag,
    klar: [],
    sprunget: { ikke_berettiget: 0, ingen_startdato: 0, ugyldig_startdato: 0, ikke_aabnet: 0, ikke_fuldt_medlem: 0, ingen_modtagere: 0 },
    raadgivere: 0,
    harHentet: 0,
  };

  for (const c of i.virksomheder) {
    if (c.certificate_eligible !== true) { ud.sprunget.ikke_berettiget++; continue; }
    if ((c.contract_start_date ?? "").trim() === "") { ud.sprunget.ingen_startdato++; continue; }
    const start = gyldigStartdato(c.contract_start_date);
    if (start === null) { ud.sprunget.ugyldig_startdato++; continue; }
    const tier = computeMembershipTier(
      { contract_end_date: c.contract_end_date, subscription_status: c.subscription_status, subscription_current_period_end: c.subscription_current_period_end },
      i.nu,
    );
    if (!ADGANG_TIERS.includes(tier)) { ud.sprunget.ikke_fuldt_medlem++; continue; }
    const aabning = aabningsdato(start);
    if (aabning > iDag) { ud.sprunget.ikke_aabnet++; continue; }

    const modtagere: string[] = [];
    for (const uid of medlemmerPr.get(c.id) ?? []) {
      if (raadgivere.has(uid)) { ud.raadgivere++; continue; }
      if (hentet.has(uid)) { ud.harHentet++; continue; }
      modtagere.push(uid);
    }
    if (modtagere.length === 0) { ud.sprunget.ingen_modtagere++; continue; }
    ud.klar.push({ companyId: c.id, navn: c.name || "", aabningsdato: aabning, modtagere, dedupKey: dedupNoegle(c.id, aabning) });
  }
  return ud;
}
