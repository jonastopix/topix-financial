/**
 * src/lib/hjemmebane/profilUdfyldt.ts
 *
 * ÉN dom om netværksprofilen (member_profiles): er den udfyldt, hvad
 * mangler, og hvor fører man hen for at udfylde den. Ren funktion — ingen
 * React, ingen Supabase. Testet i __tests__/profilUdfyldt.test.ts.
 *
 * MÅLT I PROD 9/9 kl. 13:43: NUL af 25 medlemmer har en række i
 * member_profiles. Netværket viser 25 navne uden indhold.
 *
 * HVORFOR NUL — Jonas 9/9: «Det er gamle medlemmer, som vi skal have til at
 * udfylde en NY funktion. Så derfor de 0 af alle.» Netværksprofilen er ny.
 * Ingen af de 25 er nogensinde blevet BEDT om at udfylde den — den dukkede
 * op på en indstillingsside de sjældent besøger, bag en fane der ikke var
 * forvalgt. Nul er derfor ikke en dom over feltet; det er en funktion der
 * venter på sin første bruger.
 *
 * DERFOR ÉT FELT: «udfyldt» = ask_me_about er sat. Ikke LinkedIn, ikke
 * spidskompetencer, ikke «det arbejder jeg med lige nu», ikke billedet.
 * ask_me_about er det bærende felt — det Netværket sorterer på
 * (communityMedlemmer.ts), det andre faktisk skriver til én om, og det
 * migration 20260810200000 begrunder: «Et netværk bruges kun, hvis man ved
 * hvem man skal SPØRGE». Ét felt der bliver udfyldt, er bedre end fire der
 * er tomme. STRAM IKKE kriteriet tilbage til fire felter fordi «profilen er
 * jo halvtom» — så får ingen af de 25 nogensinde et flueben, og nudget
 * bliver til støj. Perfektion er fjenden her.
 *
 * FØR 9/9 var der TRE domme der ikke var enige: profilsiden
 * (MemberProfileView) sagde tom når alle fire felter var tomme; Community
 * og forsidens fokusmotor så kun på ask_me_about; tjeklisten krævede
 * ask_me_about OG billede. En der havde sat LinkedIn men ingen tekst, fik
 * opfordringen ét sted og ikke det andet. Nu bruger alle fire denne fil.
 *
 * STIEN: /settings?fane=profil. De tre nudges (tjeklistens punkt, forsidens
 * fokuskort, den tomme profil selv) sendte alle til /settings, hvor fanen
 * «Profil i netværket» ikke var forvalgt og URL'en ikke blev læst —
 * medlemmet landede på «Virksomhed» og skulle selv finde kortet. Query-
 * parameteren følger husets mønster (/virksomheder?grund=, ?puls=) og
 * flytter ikke profilen; at flytte den ind i Netværket som en del af
 * onboardingen er NÆSTE skridt, og det løser intet hvis nudget ikke virker.
 * Billedet bor på /konto (#757) og er ikke længere en del af punktet.
 */

/** Query-parameteren Settings læser for at forvælge fanen. */
export const FANE_PARAM = "fane";

export type SettingsFane = "virksomhed" | "profil" | "notifikationer";

const FANER: readonly SettingsFane[] = ["virksomhed", "profil", "notifikationer"];

/** Den fane URL'en beder om; ukendt eller manglende → «virksomhed» som før. */
export function laesFaneParam(raa: string | null | undefined): SettingsFane {
  const v = (raa ?? "").trim().toLowerCase();
  return (FANER as readonly string[]).includes(v) ? (v as SettingsFane) : "virksomhed";
}

/** Dér hvor felterne står. Alle nudges bruger denne — ikke "/settings". */
export const PROFIL_STI = `/settings?${FANE_PARAM}=profil`;

/** Det ene der kan mangle — samme ord i tjeklisten og testen. */
export const PROFIL_MANGLER_TEKST = "hvad man kan spørge dig om";

/** Opfordringen (MemberProfileViews formulering, brugt tre steder). */
export const PROFIL_OPFORDRING = "Fortæl de andre hvad du er god til";
export const PROFIL_OPFORDRING_LINK = "udfyld din profil";

export interface ProfilInput {
  /** member_profiles.ask_me_about — null når rækken ikke findes. */
  ask_me_about: string | null | undefined;
}

/** Udfyldt = ask_me_about er sat. Tomme strenge og mellemrum tæller ikke. */
export function profilUdfyldt(p: ProfilInput | null | undefined): boolean {
  return (p?.ask_me_about ?? "").trim() !== "";
}

/** Hvad der mangler for at profilen er udfyldt — tom liste når den er. */
export function profilMangler(p: ProfilInput | null | undefined): string[] {
  return profilUdfyldt(p) ? [] : [PROFIL_MANGLER_TEKST];
}
