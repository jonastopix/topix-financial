/**
 * klaviyoMedlem — dommen over profilfeltet `tb_medlem` på Klaviyo-profilen
 * (30/9-2026, recon-klaviyo-medlemmer.md §4; Jonas' beslutninger 30/9 07:22).
 *
 * HVORFOR: listen «Medlemmer (ekskluderes)» `Xr6Pm9` blev fyldt i hånden 28/9 og
 * holdes af ingen. Det nye medlem 29/9 (lh@greensolar.dk) stod uden for den.
 * Platformen ved, hvem der er medlem; Klaviyo gør ikke. Derfor skriver platformen
 * ÉT felt, og Klaviyo danner segmentet «Medlemmer (auto)» på `tb_medlem = true`,
 * der erstatter listen i flowfiltre og kampagneekskluderinger.
 *
 * REN: ingen Deno, ingen I/O, ingen nøgle. Skrivningen bor i klaviyoProfil.ts
 * (skrivMedlem), nøglen i klaviyoAfsendelse.ts (skrivMedlemHvisNoegle), og
 * klaviyo-profil-cron henter, dømmer her og skriver.
 *
 * REGLERNE — hver har sin test (src/lib/__tests__/klaviyoMedlem.test.ts):
 *   R1 AKTIV KONTRAKT: computeMembershipTier = «full» → virksomheden er en
 *      medlemsvirksomhed. INGEN egen udløbslogik her — den findes fem steder i
 *      forvejen (docs/adgangsdomme.md §1); dette ville være en sjette.
 *   R2 AKTIVT ABONNEMENT: tier = «subscriber» → medlemsvirksomhed (dom 5's
 *      exit-abonnent: subscription_status = 'active' + fremtidig periodeslut).
 *   R3 LEGAT er IKKE medlem i denne forstand (Jonas 30/9 07:22, beslutning 2):
 *      `companies.is_legat = true` → aldrig medlemsvirksomhed. Samme felt som
 *      dom 4 og 5 (`har_aktivt_medlemskab`, `har_aktivt_abonnement`) udelukker på.
 *   R4 GÆSTER er IKKE medlem (samme beslutning): `companies.vis_i_netvaerk = false`
 *      (migration 20260902110000 — «adgang ja, netværk nej … uden at være
 *      medlemmer»). Kun eksplicit false er gæst; null/true er det ikke (kolonnen
 *      er NOT NULL DEFAULT true, samme COALESCE(…, true) som get_member_directory).
 *   R5 UDEN DATO og UDLØBET er ikke medlem: tier «no_date» (ingen kontrakt at
 *      løbe — dom 4 er fail-closed på NULL) og «expired». Beslutning 3: tidligere
 *      medlemmer må komme tilbage i markedsføringen, når medlemskabet er udløbet.
 *   R6 HVEM i en medlemsvirksomhed: ALLE brugere (company_members → profiles.email)
 *      OG virksomhedens kontaktmail (companies.contact_email).
 *   R7 EN MAIL I TO VIRKSOMHEDER: true vinder (én medlemsvirksomhed er nok).
 *   R8 MAILEN normaliseres som resten af huset: trim + små bogstaver; en tom
 *      mail eller en uden «@» tælles som `uden_mail` og skrives aldrig.
 *   R9 KUN ÆNDRINGER SKRIVES: medlem og sidst skrevet true → uændret.
 *   R10 FALSE KUN FOR ET TIDLIGERE MEDLEM: ikke medlem nu og sidst skrevet true →
 *      skriv false (eksplicit — et ophørt medlem er synligt som ophørt, og
 *      segmentet slipper det). Sidst false → uændret. ALDRIG skrevet (null) →
 *      rør den ikke: vi opretter ikke Klaviyo-profiler for folk, der aldrig var
 *      medlemmer (profile-import OPRETTER profilen, hvis den ikke findes).
 *   R11 AFMELDTE MARKERES OGSÅ: afmeldte-porten i webinarpasset gælder IKKE her.
 *      Et afmeldt medlem skal stadig bære true, så det aldrig kommer tilbage i en
 *      kampagne, den dag samtykket skifter. Et profilfelt flytter ikke samtykket.
 *
 * VÆRDIEN er altid boolean fra første skrivning (Klaviyo typer feltet efter
 * første værdi — samme fælde som datoen, recon-profilmodel §1.2).
 *
 * SVARET BÆRER ALDRIG EN MAIL: tællere, ingen adresser. `findForbudteNoegler`
 * afviser svarets `medlem`-del i drift (en rå mail hvor som helst, eller en
 * nøgle med navnet email/mail/contact_email) — samme form som metaSend.ts.
 */
import { computeMembershipTier, type MembershipTier } from "./membershipTier.ts";

/** Feltnavnet hos Klaviyo — står KUN her (klaviyoMedlem.guard dom 1). */
export const MEDLEM_FELT = "tb_medlem";

/** Tier-udfaldene, der gør en (ikke-legat, ikke-gæst) virksomhed til medlemsvirksomhed. */
export const MEDLEMS_TIERS: readonly MembershipTier[] = ["full", "subscriber"];

export interface MedlemVirksomhed {
  id: string;
  contract_end_date: string | null;
  subscription_status: string | null;
  subscription_current_period_end: string | null;
  is_legat: boolean | null;
  vis_i_netvaerk: boolean | null;
  contact_email: string | null;
}

export interface MedlemTilknytning {
  company_id: string;
  user_id: string;
}

export interface MedlemProfil {
  user_id: string;
  email: string | null;
}

/** Hvorfor en virksomhed er — eller ikke er — medlemsvirksomhed. Én værdi pr. virksomhed. */
export type VirksomhedsGrund = "aktiv_kontrakt" | "aktivt_abonnement" | "legat" | "gaest" | "uden_dato" | "udloebet";

/** R1–R5: grunden for én virksomhed. Legat og gæst dømmes FØR tier — de er aldrig medlemmer her. */
export function virksomhedsGrund(v: MedlemVirksomhed, nu: Date): VirksomhedsGrund {
  if (v.is_legat === true) return "legat";
  if (v.vis_i_netvaerk === false) return "gaest";
  const tier = computeMembershipTier(
    { contract_end_date: v.contract_end_date, subscription_status: v.subscription_status, subscription_current_period_end: v.subscription_current_period_end },
    nu,
  );
  if (tier === "full") return "aktiv_kontrakt";
  if (tier === "subscriber") return "aktivt_abonnement";
  if (tier === "no_date") return "uden_dato";
  return "udloebet";
}

export function erMedlemsvirksomhed(v: MedlemVirksomhed, nu: Date): boolean {
  const g = virksomhedsGrund(v, nu);
  return g === "aktiv_kontrakt" || g === "aktivt_abonnement";
}

/** R8: trim + små bogstaver; null, når det ikke er en mail. */
export function normaliserMail(m: string | null | undefined): string | null {
  if (typeof m !== "string") return null;
  const e = m.trim().toLowerCase();
  return e.includes("@") ? e : null;
}

export interface Medlemsmails {
  /** R6/R7: alle mails, der er medlem nu (normaliseret, uden dubletter). */
  mails: Set<string>;
  /** Virksomheder talt pr. grund — beviset for, at reglerne ramte. */
  virksomheder: Record<VirksomhedsGrund, number>;
  /** Personer/kontaktmails i en medlemsvirksomhed uden brugbar mail (R8). */
  uden_mail: number;
}

/** Hvem er medlem nu? R1–R8. */
export function medlemsmails(
  virksomheder: readonly MedlemVirksomhed[],
  tilknytninger: readonly MedlemTilknytning[],
  profiler: readonly MedlemProfil[],
  nu: Date,
): Medlemsmails {
  const taelling: Record<VirksomhedsGrund, number> = { aktiv_kontrakt: 0, aktivt_abonnement: 0, legat: 0, gaest: 0, uden_dato: 0, udloebet: 0 };
  const medlemsIds = new Set<string>();
  const mails = new Set<string>();
  let udenMail = 0;
  for (const v of virksomheder) {
    const g = virksomhedsGrund(v, nu);
    taelling[g]++;
    if (g !== "aktiv_kontrakt" && g !== "aktivt_abonnement") continue;
    medlemsIds.add(v.id);
    const k = normaliserMail(v.contact_email);
    if (k) mails.add(k); else udenMail++;
  }
  const mailPrBruger = new Map<string, string | null>(profiler.map((p) => [p.user_id, normaliserMail(p.email)]));
  for (const t of tilknytninger) {
    if (!medlemsIds.has(t.company_id)) continue;
    const m = mailPrBruger.get(t.user_id) ?? null;
    if (m) mails.add(m); else udenMail++;
  }
  return { mails, virksomheder: taelling, uden_mail: udenMail };
}

export interface MedlemPlanPost {
  email: string;
  oensket: boolean;
}

export interface MedlemPlan {
  poster: MedlemPlanPost[];
  saet_true: number;
  saet_false: number;
  uaendret: number;
}

/**
 * R9/R10: hvad skal skrives? `sidst` er klaviyo_profil.tb_medlem pr. mail
 * (true · false · null = aldrig skrevet). Sorteret på mail, så kørslen er
 * deterministisk. `kun` begrænser til én mail (beviset).
 */
export function medlemPlan(medlemmer: ReadonlySet<string>, sidst: ReadonlyMap<string, boolean | null>, kun: string | null = null): MedlemPlan {
  const plan: MedlemPlan = { poster: [], saet_true: 0, saet_false: 0, uaendret: 0 };
  const alle = new Set<string>([...medlemmer, ...[...sidst.entries()].filter(([, v]) => v !== null).map(([k]) => k)]);
  for (const email of [...alle].sort()) {
    if (kun !== null && email !== kun) continue;
    const nu = medlemmer.has(email);
    const foer = sidst.get(email) ?? null;
    if (nu) {
      if (foer === true) { plan.uaendret++; continue; }
      plan.saet_true++;
      plan.poster.push({ email, oensket: true });
    } else {
      if (foer === true) { plan.saet_false++; plan.poster.push({ email, oensket: false }); continue; }
      if (foer === false) plan.uaendret++;
      // foer === null: aldrig medlem hos os → rør den ikke (R10).
    }
  }
  return plan;
}

/** Kroppen til POST /profile-import/: ét felt, altid boolean. Rører aldrig webinarfelterne. */
export function bygMedlemKrop(email: string, medlem: boolean): Record<string, unknown> {
  return { data: { type: "profile", attributes: { email: email.trim().toLowerCase(), properties: { [MEDLEM_FELT]: medlem === true } } } };
}

// ── Svaret (feltet `medlem` i klaviyo-profil-cron) ───────────────────────────

export interface MedlemResultat {
  /** Rækker læst: companies, company_members, profiles. */
  virksomheder_laest: number;
  tilknytninger_laest: number;
  profiler_laest: number;
  /** Virksomheder pr. grund (R1–R5). */
  virksomheder: Record<VirksomhedsGrund, number>;
  /** Unikke medlemsmails nu. */
  medlemsmails: number;
  /** Personer/kontaktmails i en medlemsvirksomhed uden brugbar mail. */
  uden_mail: number;
  /** Mails med tb_medlem = true i klaviyo_profil før kørslen. */
  tilstand_true: number;
  saet_true: number;
  saet_false: number;
  uaendret: number;
  /** Faktisk skrevet hos Klaviyo (0 i tørkørsel). */
  skrevet: number;
  lykkedes: number;
  fejlede: number;
  /** Ikke nået inden for budgettet — tages næste time. */
  udsat: number;
  /** De fejlede skrivninger talt pr. udfald — aldrig mailene. */
  fejlede_udfald: Record<string, number>;
  fejl: string[];
}

export function tomtMedlemResultat(): MedlemResultat {
  return {
    virksomheder_laest: 0, tilknytninger_laest: 0, profiler_laest: 0,
    virksomheder: { aktiv_kontrakt: 0, aktivt_abonnement: 0, legat: 0, gaest: 0, uden_dato: 0, udloebet: 0 },
    medlemsmails: 0, uden_mail: 0, tilstand_true: 0, saet_true: 0, saet_false: 0, uaendret: 0,
    skrevet: 0, lykkedes: 0, fejlede: 0, udsat: 0, fejlede_udfald: {}, fejl: [],
  };
}

/** Nøgler, svarets medlem-del aldrig må bære. */
export const FORBUDTE_NOEGLER = ["email", "mail", "contact_email", "emails", "mails"] as const;
/** En rå mailadresse et sted i en streng. */
const RAA_MAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/;

/** Tom = rent. Ellers stierne, der bærer en forbudt nøgle eller en rå mail. */
export function findForbudteNoegler(obj: unknown, sti = ""): string[] {
  if (typeof obj === "string") return RAA_MAIL.test(obj) ? [`${sti}: rå e-mail`] : [];
  if (obj === null || typeof obj !== "object") return [];
  const ud: string[] = [];
  if (Array.isArray(obj)) { obj.forEach((v, i) => ud.push(...findForbudteNoegler(v, `${sti}[${i}]`))); return ud; }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const her = sti ? `${sti}.${k}` : k;
    if ((FORBUDTE_NOEGLER as readonly string[]).includes(k)) ud.push(`${her}: forbudt nøgle`);
    if (RAA_MAIL.test(k)) ud.push(`${her}: rå e-mail i nøglen`);
    ud.push(...findForbudteNoegler(v, her));
  }
  return ud;
}

/**
 * Værnet i drift: bærer medlem-delen en mail, erstattes den af et tomt resultat
 * med tællerne for skrivningerne bevaret og en fejl, der siger hvor mange steder — aldrig hvad.
 */
export function rensetMedlemResultat(m: MedlemResultat): MedlemResultat {
  const fund = findForbudteNoegler(m);
  if (fund.length === 0) return m;
  const tomt = tomtMedlemResultat();
  return {
    ...tomt,
    skrevet: m.skrevet, lykkedes: m.lykkedes, fejlede: m.fejlede, udsat: m.udsat,
    // Kun ANTALLET — en sti kan selv bære mailen (en nøgle, der er en adresse).
    fejl: [`svaret bar persondata og er fjernet (${fund.length} sted(er))`],
  };
}
