/**
 * src/lib/cvrBerigelse.ts
 *
 * Synligheden af en fejlet CVR-berigelse — rene domme, ingen IO.
 *
 * HVORFOR DEN FINDES (målt i prod 14/9 2026 kl. 08:10:15 UTC): importen af
 * Nordic By Hand fik fra den daværende kilde cvrapi.dk «error=QUOTA_EXCEEDED».
 * Virksomheden blev oprettet UDEN adresse og UDEN branchekode, og
 * rådgiverens kvittering var ordret den samme som ved succes.
 * import-application svarede allerede cvr_data, men ingen fil i src/ læste
 * feltet; cvr_fetched_at IS NULL var det eneste spor, og kolonnen opdateres
 * aldrig efter oprettelsen. Den 22. importeres 10–15 ansøgere ad samme vej:
 * fejler opslaget, får rådgiveren ti grønne kvitteringer og ti virksomheder
 * uden branchekode uden at vide det.
 *
 * KILDEN SKIFTEDE 16/9 til DataCVR (_shared/cvrOpslag.ts): opslaget svarer
 * nu et navngivet udfald, og import-application sender det med som
 * cvr_udfald ved siden af cvr_data. Kvitteringen siger derfor HVAD der
 * skete — nummeret findes ikke, grænsen er nået, eller opslaget fejlede —
 * frem for ét ord for alle tre (fund 13). Tre steder siger det samme ud fra
 * samme dom:
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
 * (virksomhedsraekke.ts:231) og aldrig siden. Uden gyldigt CVR er der
 * intet at slå op, og det er ikke en fejlet berigelse.
 *
 * HVAD RÅDGIVEREN SKAL GØRE står i teksterne: køre berigelsen
 * (berig-virksomheder) — den udfylder tomme felter fra CVR og standser selv
 * ved DataCVR's grænse (25 opslag pr. dag pr. nøgle; berig-virksomheder
 * bruger højst 20 pr. kørsel). Findes nummeret ikke i registret, hjælper
 * ingen berigelse — så skal nummeret tjekkes (fund 13: to cifre byttet om).
 * Rådgiverens redigeringsdialog har intet adressefelt og sætter kun
 * branche-labelen, ikke koden; kun medlemmet (Indstillinger) og berigelsen
 * skriver industry_code.
 */

export const CVR_FORMAT = /^\d{8}$/;

/** Otte cifre, uden mellemrum — det eneste format opslaget (slaaCvrOp) slår op på (samme regel som berigelse.ts). */
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

/** Handlingen — samme sætning i signalet på virksomhedssiden. */
export const CVR_MANGEL_HANDLING =
  "Kør berigelsen (berig-virksomheder) — den udfylder de tomme felter fra CVR. Findes CVR-nummeret ikke i registret, så tjek nummeret.";

/** «adresse og branchekode» / «adresse» / «branchekode». */
export function felterTekst(felter: readonly CvrMangelFelt[]): string {
  return felter.join(" og ");
}

// ── Kvitteringen efter import ─────────────────────────────────────────────

/** Opslagets udfald, som _shared/cvrOpslag.ts' CvrOpslag["udfald"] (src kan ikke importere fra _shared). */
export type CvrUdfald = "fundet" | "findes_ikke" | "graense" | "fejl" | "noegle_mangler";

/** Det kvitteringen læser af import-applications svar. */
export interface ImportSvar {
  reused_company?: boolean;
  company_name?: string | null;
  /** null når opslaget ikke lykkedes ELLER ikke blev forsøgt (genbrug, intet gyldigt CVR). */
  cvr_data?: unknown;
  /** Opslagets udfald (16/9). Mangler feltet (gammel server), læses det som «fejl». */
  cvr_udfald?: CvrUdfald | null;
}

export interface ImportKvittering {
  tone: "success" | "warning";
  titel: string;
  beskrivelse: string;
}

const MANGEL_HALE = `Virksomheden er mærket «${CVR_MANGEL_MAERKE}» på listen og på sin side, indtil felterne er fyldt.`;

/**
 * Kvitteringen — siger altid at virksomheden er oprettet og invitationen
 * sendt (det ER sket), og siger det ligeud når CVR-opslaget ikke lykkedes:
 * hvad der skete, hvad der mangler, og hvad rådgiveren skal gøre. En
 * mangel, ikke en fejl.
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
  // Opslaget lykkedes ikke — sig hvad der skete (udfaldet fra slaaCvrOp).
  // fejl, noegle_mangler og et manglende felt (gammel server) får samme ord.
  const hvad =
    svar.cvr_udfald === "findes_ikke"
      ? "CVR-nummeret findes ikke i registret — tjek nummeret. Adresse og branchekode er ikke hentet."
      : svar.cvr_udfald === "graense"
        ? "Grænsen for CVR-opslag i dag er nået — kør berigelsen (berig-virksomheder) i morgen, så udfyldes adresse og branchekode."
        : "CVR-opslaget fejlede — kør berigelsen (berig-virksomheder) senere, så udfyldes adresse og branchekode.";
  return {
    tone: "warning",
    titel: "Importeret — men CVR-opslaget lykkedes ikke",
    beskrivelse: `${grund} ${hvad} ${MANGEL_HALE}`,
  };
}
