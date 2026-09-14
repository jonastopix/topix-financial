/**
 * src/lib/cvrBerigelse.ts
 *
 * Synligheden af en fejlet CVR-berigelse — rene domme, ingen IO.
 *
 * HVORFOR DEN FINDES (målt i prod 14/9 2026 kl. 08:10:15 UTC): importen af
 * Nordic By Hand fik «cvrapi svarede error=QUOTA_EXCEEDED». Virksomheden
 * blev oprettet UDEN adresse og UDEN branchekode, og rådgiverens kvittering
 * var ordret den samme som ved succes. import-application svarede allerede
 * cvr_data, men ingen fil i src/ læste feltet; cvr_fetched_at IS NULL var
 * det eneste spor, og kolonnen opdateres aldrig efter oprettelsen. Den 22.
 * importeres 10–15 ansøgere ad samme vej: rammer kvoten, får rådgiveren ti
 * grønne kvitteringer og ti virksomheder uden branchekode uden at vide det.
 *
 * KUN SYNLIGHEDEN, IKKE KILDEN: hentCvrData røres ikke — ingen retry, ingen
 * ny udbyder, ingen kø (beslutningen om Virk er truffet, bygges ikke i dag).
 * Tre steder siger det samme ud fra samme dom:
 *   1. Kvitteringen efter import (importKvittering) — HbAnsoegningsimport.
 *   2. Virksomhedssiden, «Hvad skal du vide nu» — et signal i motoren
 *      (virksomhedsSignaler.ts, køen stamdata_mangler). Forsidens dom
 *      springer den kø over, så forsiden ændrer sig ikke.
 *   3. Virksomhedslisten — et mærke på rækken (CVR_MANGEL_MAERKE), så de
 *      ramte kan findes uden SQL.
 *
 * DOMMEN (cvrOpslagMangler): et gyldigt CVR (otte cifre), cvr_fetched_at
 * tom, og mindst ét af felterne adresse/branchekode tomt. Er felterne fyldt
 * — af berigelsen (berig-virksomheder) eller i hånden — forsvinder mærket
 * af sig selv; cvr_fetched_at sættes nemlig kun ved oprettelsen
 * (virksomhedsraekke.ts:199) og aldrig siden. Uden gyldigt CVR er der
 * intet at slå op, og det er ikke en fejlet berigelse.
 *
 * HVAD RÅDGIVEREN SKAL GØRE står i teksterne: køre berigelsen når
 * CVR-kvoten er fri (50 opslag/dag, berig-virksomheder/index.ts:15-29) —
 * den udfylder tomme felter fra CVR. Rådgiverens redigeringsdialog har
 * intet adressefelt og sætter kun branche-labelen, ikke koden; kun
 * medlemmet (Indstillinger) og berigelsen skriver industry_code.
 */

export const CVR_FORMAT = /^\d{8}$/;

/** Otte cifre, uden mellemrum — det eneste format hentCvrData slår op på (samme regel som berigelse.ts). */
export function erGyldigtCvr(cvr: string | null | undefined): boolean {
  return CVR_FORMAT.test((cvr ?? "").replace(/\s/g, ""));
}

export type CvrMangelFelt = "adresse" | "branchekode";

export interface CvrStamdata {
  cvr_number: string | null | undefined;
  /** companies.cvr_fetched_at — sættes kun ved oprettelsen, når opslaget lykkedes. */
  cvr_fetched_at: string | null | undefined;
  address: string | null | undefined;
  industry_code: string | null | undefined;
}

export interface CvrMangel {
  mangler: boolean;
  /** Det der er tomt og som et opslag ville have fyldt — tom liste når intet mangler. */
  felter: CvrMangelFelt[];
}

const tom = (v: string | null | undefined) => (v ?? "").trim() === "";

/** Er virksomheden ramt af et fejlet CVR-opslag ved oprettelsen? */
export function cvrOpslagMangler(s: CvrStamdata): CvrMangel {
  if (!erGyldigtCvr(s.cvr_number)) return { mangler: false, felter: [] };
  if (!tom(s.cvr_fetched_at)) return { mangler: false, felter: [] };
  const felter: CvrMangelFelt[] = [];
  if (tom(s.address)) felter.push("adresse");
  if (tom(s.industry_code)) felter.push("branchekode");
  return { mangler: felter.length > 0, felter };
}

/** Mærket på listen og i signalet — samme ord begge steder. */
export const CVR_MANGEL_MAERKE = "CVR-opslag mangler";

/** Handlingen — samme sætning i kvittering og signal. */
export const CVR_MANGEL_HANDLING =
  "Kør berigelsen (berig-virksomheder) når CVR-kvoten er fri — den udfylder de tomme felter fra CVR.";

/** «adresse og branchekode» / «adresse» / «branchekode». */
export function felterTekst(felter: readonly CvrMangelFelt[]): string {
  return felter.join(" og ");
}

// ── Kvitteringen efter import ─────────────────────────────────────────────

/** Det kvitteringen læser af import-applications svar (index.ts:229-238). */
export interface ImportSvar {
  reused_company?: boolean;
  company_name?: string | null;
  /** null når opslaget ikke lykkedes ELLER ikke blev forsøgt (genbrug, intet gyldigt CVR). */
  cvr_data?: unknown;
}

export interface ImportKvittering {
  tone: "success" | "warning";
  titel: string;
  beskrivelse: string;
}

/**
 * Kvitteringen — siger altid at virksomheden er oprettet og invitationen
 * sendt (det ER sket), og siger det ligeud når CVR-opslaget ikke lykkedes:
 * hvad der mangler, og hvad rådgiveren skal gøre. En mangel, ikke en fejl.
 */
export function importKvittering(svar: ImportSvar, form: { email: string; cvr_number: string }): ImportKvittering {
  const navn = (svar.company_name ?? "").trim() || "Virksomheden";
  const email = form.email.trim();
  if (svar.reused_company) {
    return {
      tone: "success",
      titel: "Virksomheden findes allerede — ny invitation sendt",
      beskrivelse: `Invitation sendt til ${email} for ${navn}`,
    };
  }
  const grund = `${navn} er oprettet, og invitationen er sendt til ${email}.`;
  if (svar.cvr_data) {
    return { tone: "success", titel: "Ansøgning importeret ✓", beskrivelse: `${grund} Adresse og branche er hentet fra CVR.` };
  }
  if (!erGyldigtCvr(form.cvr_number)) {
    return { tone: "success", titel: "Ansøgning importeret ✓", beskrivelse: `${grund} Uden CVR-nummer er adresse og branche ikke hentet.` };
  }
  return {
    tone: "warning",
    titel: "Importeret — men CVR-opslaget lykkedes ikke",
    beskrivelse:
      `${grund} Adresse og branchekode mangler: CVR-registret svarede ikke (dagskvoten kan være brugt). ` +
      `${CVR_MANGEL_HANDLING} Virksomheden er mærket «${CVR_MANGEL_MAERKE}» på listen og på sin side, indtil felterne er fyldt.`,
  };
}
