/**
 * dag1Klokke — klokken «{Virksomhed} kom ind i går og har ikke hørt fra os
 * endnu» (2/10-2026, aftenlisten a1002-velkomst; Jonas: «Klokke i morgenmailen,
 * vi skriver selv»). REN: ingen Supabase, ingen Deno — vitest dækker den
 * (src/lib/__tests__/dag1Klokke.test.ts, kildeværnet dag1Klokke.guard.test.ts).
 * stille-klokker-cron henter data, kalder dommen og ringer klokken gennem
 * skrivRaadgiverBesked.
 *
 * HVORFOR: ingen skriver til et nyt medlem, før hun selv skriver. Signalet
 * «Kom ind i går, har ikke hørt fra os» stod KUN på rådgiverens forside
 * (forsidensDom → lib/venterPaaVelkomst) — og «et signal, kun en browser kan
 * vise, er ikke et signal» (princip 1, 20/9). Nu når det rådgivernes
 * MORGEN-mail (klokke-mail-cron) på dag 1, så rådgiverne skriver velkommen selv.
 *
 * DOMMEN ER FORSIDENS — ingen ny regel. «Venter på velkomst» er
 * doemVenterPaaVelkomst (spejlet ordret fra src/lib/venterPaaVelkomst.ts,
 * paritetstest): et medlem (første company_members.created_at) og INGEN
 * menneskebesked fra en rådgiver (max conversations.last_advisor_reply_at er
 * null), fra én kalenderdag. Kun to ting lægges oveni, og begge er KLOKKENS,
 * ikke signalets:
 *   1. KALENDEREN ER DANSK. Forsiden tæller i læserens kalender (browseren
 *      står i Danmark). Cronen kører i UTC: et medlem, der kom ind kl. 00:30
 *      dansk (22:30 UTC dagen før), ville stå som «kom ind i går» samme morgen
 *      kl. 06:30. Derfor tæller danskeKalenderdageSiden på kbhDato
 *      (hverdage.ts), og doemVenterPaaVelkomst får dagene givet ind.
 *   2. VINDUET: klokken ringer kun til og med dag KLOKKE_SENEST_DAG = 7.
 *      Signalet har ingen øvre grænse og står stadig på forsiden — men en
 *      klokke er «i morgen tidlig», ikke en efterregistrering: første kørsel
 *      må ikke ringe for et medlem, der har ventet i 40 dage (det står på
 *      forsiden). 7 = klokke-mail-cron's VINDUE_DAGE (en klokke ældre end 7
 *      dage mailes alligevel ikke) og dækker en weekend, en påske og en
 *      kørsel, der fejlede en dag eller to.
 *
 * UNIVERSET ER RÅDGIVERFORSIDENS (medlemsOverblik.iUniverset + forsidens
 * «expired»-gate): ikke demo (is_demo), ikke legat (is_legat), en kunde
 * (er_kunde !== false — fail-open som raadgiverensKunder.erKunde), status
 * 'active' eller tom, ikke slettet (data_slettet_at), og tier ≠ «expired»
 * (computeMembershipTier — forsiden lægger expiredCompanyIds udenfor).
 * dag1Klokke.test.ts beviser, at universet her siger det samme som
 * iUniverset på alle kombinationer.
 *
 * HØJST ÉN KLOKKE PR. (RÅDGIVER, VIRKSOMHED) — tre lag:
 *   (a) cronen slår op, om virksomheden HAR en venter_paa_velkomst-række (hos
 *       nogen rådgiver) — så er dommen «har_klokke», for altid. Titlen bærer
 *       dagene, så skriverens titel-dedup alene ville ringe igen på dag 2;
 *       opslaget gør det ikke. Fejler opslaget, ringer intet (fail-closed).
 *   (b) skrivRaadgiverBesked dedupper pr. rådgiver på type + titel.
 *   (c) DATABASEN: det delvise unikke indeks
 *       advisor_notifications_venter_paa_velkomst_uidx (advisor_id, company_id)
 *       WHERE type = 'venter_paa_velkomst' (migration 20261002276000).
 *
 * TIL HVEM: skrivRaadgiverBesked — én række pr. rådgiver (user_roles advisor/
 * admin), ingen tildeling («Rådgiverne er sammen om alle medlemmer», 1/10).
 * Tjenestekontoen (claude@) får rækken i sin klokke som alle andre klokker
 * (CLAUDE.md «Tjenestekonti»: «klokker skrives stadig til den — den skal se
 * alt»), men ALDRIG en mail: klokke-mail-cron lægger tjenestekonti udenfor
 * gennem udenTjenestekonti, før den fordeler (dag1Klokke.guard dom 5).
 *
 * LINKET: reference_type «chat» uden reference_id → klokkeSti (klokkeMail.ts)
 * og raadgiverSti (src/lib/hjemmebane/klokke.ts) giver
 * /chat?companyId=<virksomhed> — virksomhedens chat, uden messageId.
 *
 * LÅSEN: app_config.dag1_klokke_aktiv (standard false, indsat af migrationen).
 * stille-klokker-cron's job 566 kører allerede {"dry_run": false} hver morgen,
 * så klokken skrives KUN, når dry_run er false OG låsen er åben
 * (dag1SkriverRigtigt). Låsen læses fail-closed FØR tørkørslens tal, så svaret
 * altid viser den.
 *
 * SVARET bærer "dag1_klokke": "skive-1" (beviset for udrulningen — kun den nye
 * kode har feltet) og tællerne i "dag1" — ALDRIG et navn, en mail eller et id
 * (Dag1Resultat har kun tal, sandhedsværdier og fejlbeskeder uden navne).
 */
import { computeMembershipTier } from "./membershipTier.ts";
import { kbhDato } from "./hverdage.ts";
import { laasVaerdiErAktiv } from "./klaviyoMedlem.ts";
import { doemVenterPaaVelkomst } from "./venterPaaVelkomst.ts";

/** Klokke-typen — står i klokkeMail.ts MORGEN_TYPER (klokkeMail.guard dom 1). */
export const TYPE_VENTER_PAA_VELKOMST = "venter_paa_velkomst";
/** Beviset for udrulningen: feltet `dag1_klokke` i stille-klokker-cron's svar. */
export const DAG1_SKIVE = "skive-1";
/** app_config-nøglen for låsen. Standard false — Jonas åbner den med én guarded UPDATE. */
export const DAG1_LAAS_NOEGLE = "dag1_klokke_aktiv";
/** Klokken ringer til og med denne danske kalenderdag efter første medlemskab (= klokkeMail.VINDUE_DAGE). */
export const KLOKKE_SENEST_DAG = 7;
/**
 * Hvor langt tilbage cronen leder efter nye medlemsrækker: KLOKKE_SENEST_DAG + 2
 * døgn. Regnestykket: en dansk kalenderdag strækker sig højst 2 timer forbi
 * UTC-døgnet (UTC+2 om sommeren), så 7 danske kalenderdage før i dag ligger
 * altid inden for 7 + 1 UTC-døgn — ét døgn mere er slæk. Hvem der er for
 * gammel, afgør dommen (for_gammel); vinduet er kun læsningens afgrænsning.
 */
export const KANDIDAT_VINDUE_DAGE = KLOKKE_SENEST_DAG + 2;
const DOEGN_MS = 86_400_000;

/** Vinduets start (ISO) for company_members-opslaget. */
export function kandidatVindueFra(nu: Date): string {
  return new Date(nu.getTime() - KANDIDAT_VINDUE_DAGE * DOEGN_MS).toISOString();
}

/**
 * Hele DANSKE kalenderdage fra start til nu (kbhDato på begge sider; Date.parse
 * af «YYYY-MM-DD» er UTC-midnat, så forskellen er et helt antal døgn uanset
 * sommertid). null = ingen/ugyldig start.
 */
export function danskeKalenderdageSiden(start: string | Date | null | undefined, nu: Date): number | null {
  if (start == null) return null;
  const d = start instanceof Date ? start : new Date(start);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((Date.parse(kbhDato(nu)) - Date.parse(kbhDato(d))) / DOEGN_MS);
}

/** De kolonner, universet læser — companies-rækken som hentet. */
export interface Dag1Virksomhed {
  id: string;
  name: string | null;
  status: string | null;
  is_legat: boolean | null;
  er_kunde: boolean | null;
  is_demo: boolean | null;
  data_slettet_at: string | null;
  contract_end_date: string | null;
  subscription_status: string | null;
  subscription_current_period_end: string | null;
}

export type UdenforGrund = "ingen_virksomhed" | "slettet" | "demo" | "legat" | "ikke_kunde" | "ikke_aktiv" | "udloebet";

/** null = i universet; ellers grunden. Rækkefølgen afgør kun, hvilken grund der tælles. */
export function dag1Udenfor(c: Dag1Virksomhed | null | undefined, nu: Date): UdenforGrund | null {
  if (!c) return "ingen_virksomhed";
  if (c.data_slettet_at) return "slettet";
  if (c.is_demo === true) return "demo";
  if (c.is_legat) return "legat";
  if (c.er_kunde === false) return "ikke_kunde";
  if (!(c.status === "active" || !c.status)) return "ikke_aktiv";
  const tier = computeMembershipTier({
    contract_end_date: c.contract_end_date,
    subscription_status: c.subscription_status,
    subscription_current_period_end: c.subscription_current_period_end,
  }, nu);
  if (tier === "expired") return "udloebet";
  return null;
}

export type Dag1Grund = UdenforGrund | "ingen_medlem" | "hilst_paa" | "for_tidligt" | "for_gammel" | "har_klokke";

/** «tavs», ikke null: tsconfig har strict = false, og uden strictNullChecks er null ingen diskriminant (stilleDom regel 11). */
export type Dag1Dom =
  | { klokke: "ring"; dage: number; titel: string; tekst: string }
  | { klokke: "tavs"; grund: Dag1Grund };

export interface Dag1Input {
  virksomhed: Dag1Virksomhed | null;
  /** Første company_members.created_at for virksomheden (ISO). */
  medlemSiden: string | null;
  /** Seneste conversations.last_advisor_reply_at på tværs af virksomhedens samtaler. */
  sidsteRaadgiverBeskedAt: string | null;
  /** Findes der allerede en venter_paa_velkomst-række for virksomheden (hos nogen rådgiver)? */
  harKlokke: boolean;
}

export const STANDARD_NAVN = "Et nyt medlem";

/** «Firma ApS kom ind i går og har ikke hørt fra os endnu» / «… for 3 dage siden …». */
export function dag1Titel(navn: string | null | undefined, dage: number): string {
  const n = (navn ?? "").trim() || STANDARD_NAVN;
  const komInd = dage === 1 ? "kom ind i går" : `kom ind for ${dage} dage siden`;
  return `${n} ${komInd} og har ikke hørt fra os endnu`;
}

export const DAG1_TEKST = "Ingen rådgiver har skrevet til dem endnu. Skriv velkommen selv — linket går til virksomhedens chat.";

/** Dommen: universet → forsidens regel (danske dage) → klokkens vindue → én gang. */
export function doemDag1Klokke(a: Dag1Input, nu: Date): Dag1Dom {
  const udenfor = dag1Udenfor(a.virksomhed, nu);
  if (udenfor) return { klokke: "tavs", grund: udenfor };
  const velkomst = doemVenterPaaVelkomst(
    { sidsteRaadgiverBeskedAt: a.sidsteRaadgiverBeskedAt },
    danskeKalenderdageSiden(a.medlemSiden, nu),
  );
  if (velkomst.tilstand !== "venter") return { klokke: "tavs", grund: velkomst.tilstand };
  const dage = velkomst.dage ?? 0;
  if (dage > KLOKKE_SENEST_DAG) return { klokke: "tavs", grund: "for_gammel" };
  if (a.harKlokke) return { klokke: "tavs", grund: "har_klokke" };
  return { klokke: "ring", dage, titel: dag1Titel(a.virksomhed?.name, dage), tekst: DAG1_TEKST };
}

/** Klokken som skrivRaadgiverBesked-argument. reference_id er null: linket er virksomhedens chat uden messageId. */
export function dag1Besked(companyId: string, dom: { titel: string; tekst: string }) {
  return {
    type: TYPE_VENTER_PAA_VELKOMST,
    title: dom.titel,
    body: dom.tekst,
    company_id: companyId,
    reference_type: "chat",
    reference_id: null,
  };
}

/** Skriver passet for alvor? Kun med dry_run false OG åben lås. */
export function dag1SkriverRigtigt(toerKoersel: boolean, laasAktiv: boolean): boolean {
  return !toerKoersel && laasAktiv === true;
}

/** Låsens værdi som læst fra app_config — kun eksplicit true åbner (samme dom som klaviyoMedlem). */
export function dag1LaasAktiv(configValue: unknown): boolean {
  return laasVaerdiErAktiv(configValue);
}

/** Tællerne i svaret — tal, sandhedsværdier og fejlbeskeder. ALDRIG et navn, en mail eller et id. */
export interface Dag1Resultat {
  laas_aktiv: boolean;
  skriver_rigtigt: boolean;
  /** Virksomheder med en medlemsrække i kandidatvinduet. */
  kandidater: number;
  /** Dommen sagde «ring». */
  ring: number;
  /** Tørkørsel: ville have ringet. */
  ville_ringe: number;
  /** dry_run false, men låsen lukket: intet skrevet. */
  holdt_af_laas: number;
  /** Mindst én rådgiver fik rækken. */
  ringet: number;
  /** Rækken fandtes allerede hos alle rådgivere. */
  fandtes: number;
  /** Tavse med grund (Dag1Grund → antal). */
  tavse: Record<string, number>;
  fejlet: number;
  /** Fejlbeskederne — databasens tekst, aldrig et navn. */
  fejl: string[];
}

export function tomtDag1Resultat(laasAktiv: boolean, toerKoersel: boolean): Dag1Resultat {
  return {
    laas_aktiv: laasAktiv,
    skriver_rigtigt: dag1SkriverRigtigt(toerKoersel, laasAktiv),
    kandidater: 0, ring: 0, ville_ringe: 0, holdt_af_laas: 0, ringet: 0, fandtes: 0,
    tavse: {}, fejlet: 0, fejl: [],
  };
}

/** Første medlemsrække pr. virksomhed (min created_at) — samme regnestykke som forsiden (AdvisorDashboard medlemSidenByCompany). */
export function medlemSidenPrVirksomhed(raekker: readonly { company_id: string | null; created_at: string | null }[]): Map<string, string> {
  const ud = new Map<string, string>();
  for (const m of raekker) {
    if (!m.company_id || !m.created_at) continue;
    const hidtil = ud.get(m.company_id);
    if (!hidtil || m.created_at < hidtil) ud.set(m.company_id, m.created_at);
  }
  return ud;
}

/** Seneste rådgiverbesked pr. virksomhed (max last_advisor_reply_at) — samme regnestykke som forsiden (sidsteRaadgiverBeskedByCompany). */
export function sidsteRaadgiverBeskedPrVirksomhed(raekker: readonly { company_id: string | null; last_advisor_reply_at: string | null }[]): Map<string, string> {
  const ud = new Map<string, string>();
  for (const c of raekker) {
    if (!c.company_id || !c.last_advisor_reply_at) continue;
    const eks = ud.get(c.company_id);
    if (!eks || c.last_advisor_reply_at > eks) ud.set(c.company_id, c.last_advisor_reply_at);
  }
  return ud;
}
