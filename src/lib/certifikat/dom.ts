/**
 * «Dit certifikat» — husets dom oven på pakkens getCertificateStatus (29/9-2026,
 * ~/Downloads/boardroom-certifikat/HANDOFF.md §3, recon-certifikat.md).
 *
 * HVEM: kun FULDE medlemmer. Rådgivere, abonnenter, legat og udløbne ser hverken
 * menupunkt eller side (HANDOFF §3 «Hvem ser området»). Flaget
 * companies.certificate_eligible (migration 20260929190000) gælder VIRKSOMHEDEN;
 * to brugere i samme virksomhed får hver sit certifikat.
 *
 * STARTDATOEN er companies.contract_start_date — en DATE («2025-10-22»), som
 * læses som DANSK kalenderdato: de tre tal splittes og gives til
 * new Date(år, måned - 1, dag). ALDRIG new Date("2025-10-22"): den streng er
 * UTC-midnat, og i en tidszone vest for UTC bliver den 21. oktober — én dag for
 * tidligt, som Supabase-DATE'en i optagelsesdato.ts (14/9) også kun læses som
 * år og måned af samme grund. NULL eller noget, der ikke er «YYYY-MM-DD», =
 * skjult: der findes ingen dato at regne 12 måneder fra, og en gættet dato er
 * værre end ingen (HANDOFF §10: «Uden startdato: vis ingen status»).
 *
 * MENUEN (HANDOFF §3 «Menupunkt»): «Ny» når området er åbent og medlemmet ingen
 * hentninger har; en hængelås når det er låst; ellers punktet alene. Skjult =
 * intet punkt. Dommen her er ren; hentningstallet kommer fra certificate_downloads
 * (hentninger.ts) og tiden gives ind som `nu` (taeller-og-naevner-lærdommen:
 * en dato, der ikke gives ind, kan ikke prøves frem).
 *
 * Prøver: src/lib/__tests__/certifikat.test.ts. Kildeværn: certifikat.guard.test.ts
 * (læsningen af DATE-strengen og pakkens låste filer).
 */
import { getCertificateStatus, type CertificateStatus } from "@/components/hjemmebane/certifikat/format";

export type MedlemsTier = "full" | "subscriber" | "expired" | null;

export type CertifikatGrund = "raadgiver" | "ikke_fuldt_medlem" | "ikke_berettiget" | "ingen_startdato" | "ugyldig_startdato";

export type CertifikatDom = { synlig: false; grund: CertifikatGrund } | { synlig: true; status: CertificateStatus };

export interface CertifikatInput {
  isAdvisor: boolean;
  membershipTier: MedlemsTier;
  /** companies.certificate_eligible — false når kolonnen mangler eller er false. */
  eligible: boolean;
  /** companies.contract_start_date som Supabase leverer den: «YYYY-MM-DD» eller null. */
  kontraktStart: string | null | undefined;
}

const DATO = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * «2025-10-22» → lokal midnat 22. oktober 2025 — samme kalenderdag i enhver
 * tidszone, fordi de tre tal gives hver for sig. null når strengen ikke er en
 * ren DATE (et tidsstempel med «T» afvises med vilje: kolonnen er DATE, og et
 * andet format er et tegn på, at kilden er en anden end ventet).
 */
export function laesDanskDato(s: string | null | undefined): Date | null {
  const m = DATO.exec((s ?? "").trim());
  if (!m) return null;
  const aar = Number(m[1]);
  const maaned = Number(m[2]);
  const dag = Number(m[3]);
  if (maaned < 1 || maaned > 12 || dag < 1 || dag > 31) return null;
  const d = new Date(aar, maaned - 1, dag);
  // 31. februar «ruller» i JS til marts — det er ikke en dato, det er en fejl i kilden.
  if (d.getFullYear() !== aar || d.getMonth() !== maaned - 1 || d.getDate() !== dag) return null;
  return d;
}

export function certifikatDom(input: CertifikatInput, nu: Date = new Date()): CertifikatDom {
  if (input.isAdvisor) return { synlig: false, grund: "raadgiver" };
  if (input.membershipTier !== "full") return { synlig: false, grund: "ikke_fuldt_medlem" };
  if (input.eligible !== true) return { synlig: false, grund: "ikke_berettiget" };
  if (input.kontraktStart === null || input.kontraktStart === undefined || input.kontraktStart.trim() === "") return { synlig: false, grund: "ingen_startdato" };
  const start = laesDanskDato(input.kontraktStart);
  if (start === null) return { synlig: false, grund: "ugyldig_startdato" };
  const status = getCertificateStatus(start, true, nu);
  if (status.state === "hidden") return { synlig: false, grund: "ikke_berettiget" };
  return { synlig: true, status };
}

/** Menupunktets tilstand: «ny» (åbent, aldrig hentet), «laast» (hængelås), «aaben» (punktet alene). null = intet punkt. */
export type CertifikatMenu = "ny" | "laast" | "aaben";

export function certifikatMenu(dom: CertifikatDom, hentninger: number): CertifikatMenu | null {
  if (dom.synlig === false) return null;
  if (dom.status.state === "locked") return "laast";
  return hentninger > 0 ? "aaben" : "ny";
}
