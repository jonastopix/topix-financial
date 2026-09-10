/**
 * src/lib/hjemmebane/hentefejl.ts
 *
 * Ordene for «vi kunne ikke hente …» på medlemmets flader — rene
 * funktioner, testet i __tests__/hentefejl.test.ts.
 *
 * HVORFOR (recon-fejlovervaagningen §2/§6, Jonas 10/9: «medlemmets side
 * først»): 29 kald på medlemmets flader gjorde en fejl til tom data. Så så
 * medlemmet den TOMME tilstand («Kom i gang med dine tal», «ingen kommende
 * events»), Sentry så en succes, og rådgiveren havde ingen flade der viste
 * det. Sendt-loggen stod sådan i et halvt år (#701).
 *
 * TOM OG FEJLET ER TO BESKEDER: «du har ingen rapporter endnu» er en
 * tilstand; «vi kunne ikke hente dine rapporter» er en fejl. De må aldrig
 * se ens ud. Fejlen siger HVAD der ikke kunne hentes (kildens navn fra
 * HentningsFejl, oversat til medlemmets ord), og den er ROLIG: ingen
 * udråb, ingen teknik, og det er ikke noget medlemmet har gjort.
 *
 * MØNSTRET er 7/9's (#703, #706, #708): queryFn'en KASTER (kraevRaekker /
 * HentningsFejl med kildens navn), fladen læser isError og siger det ved
 * den sektion det gælder — ikke på hele siden. Sentry får fejlen af
 * QueryCache.onError (#702, App.tsx) fordi den nu kastes; ingen ny
 * Sentry-kode her (fejllogning.guard låser at kun App.tsx logger).
 */

/** Kildens navn (tabellen HentningsFejl bærer) → medlemmets ord. */
// data_basis-undtagelse: kun tabelNAVNE i en ordbog til fejltekster — filen læser ingen rækker
export const KILDE_ORD: Readonly<Record<string, string>> = {
  financial_reports: "dine rapporter",
  financial_report_facts: "dine tal",
  milestones: "dine milepæle",
  pulse_checkins: "din refleksion",
  handouts: "dine handouts",
  handout_lever_milestones: "dine handouts",
  member_profiles: "din profil",
  companies: "din aftale",
  conversations: "dine beskeder",
  messages: "dine beskeder",
  company_actions: "dine aftaler",
  weekly_focus: "ugens fokus",
  events: "kommende events",
  community: "fællesskabet",
  // De nitten (10/9): resten af medlemmets flader efter #780.
  events_afholdte: "afholdte events",
  events_detalje: "eventet",
  event_registrations: "deltagerne",
  community_traade: "opslaget",
  community_svar: "svarene",
  community_forslag: "forslagene til @ og #",
  akademiet: "Akademiet",
  content_item_attachments: "materialet",
  financial_reports_papirkurv: "papirkurven",
  kpi_chart_comments: "kommentarerne",
};

/** Kilden af en kastet fejl: HentningsFejl bærer `kilde`; alt andet er «ukendt». */
export function kildeAf(error: unknown): string {
  if (error && typeof error === "object" && "kilde" in error && typeof (error as { kilde: unknown }).kilde === "string") {
    return (error as { kilde: string }).kilde;
  }
  return "ukendt";
}

/** Medlemmets ord for en kilde; ukendte kilder bliver «noget af det du ser her». */
export function kildeOrd(kilde: string): string {
  return KILDE_ORD[kilde] ?? "noget af det du ser her";
}

/** «a», «a og b», «a, b og c» — uden dubletter, i den rækkefølge de kom. */
export function listeMedOg(ord: readonly string[]): string {
  const unikke = [...new Set(ord)];
  if (unikke.length === 0) return "";
  if (unikke.length === 1) return unikke[0];
  return `${unikke.slice(0, -1).join(", ")} og ${unikke[unikke.length - 1]}`;
}

/** Roligt: «Dine milepæle og din refleksion kunne ikke hentes lige nu. Prøv igen.» */
export function hentefejlTekst(kilder: readonly string[]): string | null {
  const ord = kilder.map(kildeOrd);
  if (ord.length === 0) return null;
  const liste = listeMedOg(ord);
  return `${liste.charAt(0).toUpperCase()}${liste.slice(1)} kunne ikke hentes lige nu. Prøv igen.`;
}

/** Én sektions egen linje — «Kommende events kunne ikke hentes lige nu.» */
export function sektionsfejlTekst(kilde: string): string {
  const ord = kildeOrd(kilde);
  return `${ord.charAt(0).toUpperCase()}${ord.slice(1)} kunne ikke hentes lige nu.`;
}

/**
 * Rapporteringens spærring (punkt 4, 10/9): når listen ikke kunne hentes,
 * lukkes upload-zonen med denne linje. Den siger HVORFOR (vi kan ikke se
 * om rapporten allerede ligger her) og hvad medlemmet gør (prøver igen) —
 * ikke «fejl», ikke skyld.
 */
export function uploadSpaerretTekst(): string {
  return "Dine rapporter kunne ikke hentes lige nu, så vi kan ikke se om rapporten allerede ligger her. Prøv igen om lidt — så åbner upload igen.";
}

/**
 * Dommen tom-mod-fejlet for én hentning (de nitten, 10/9). Fladen spørger
 * ÉT sted og får ÉT svar: henter · fejlet · tom · data. «tom» dækker både
 * en tom liste og «findes ikke» (opslag, event, kursus) — og den må først
 * afsiges når hentningen er lykkedes. Før stod `data ?? []` og `!data`
 * alene, så en fejl blev til «Ingen svar endnu» eller «Eventet findes ikke».
 */
export type Hentetilstand = "henter" | "fejlet" | "tom" | "data";

export function hentetilstand(
  hentning: { isLoading: boolean; isError: boolean },
  tom: boolean,
): Hentetilstand {
  if (hentning.isLoading) return "henter";
  if (hentning.isError) return "fejlet";
  return tom ? "tom" : "data";
}
