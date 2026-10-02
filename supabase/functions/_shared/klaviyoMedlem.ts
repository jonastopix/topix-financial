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
 *   R0 SLETTET, EGEN og DEMO er IKKE medlem (det tekniske råd 30/9, «RET FØRST» fund 2+3),
 *      dømt FØRST — før legat, gæst og tier:
 *        `companies.data_slettet_at` sat → «slettet» (migration 20260908120000: medlemsdata
 *          er tømt af slet-medlemsdata-cron — virksomheden giver aldrig et medlem igen).
 *        `companies.er_kunde = false` → «egen» (Topix.dk ApS, migration 20260906210000:
 *          status active, kontrakt til 2030 — vores egen, ikke et medlem).
 *        `companies.is_demo = true` → «demo» (kolonnen er oprettet i Lovable, ikke i en
 *          migration — 20260903230000 siger det; målt i types.ts: `is_demo: boolean | null`).
 *        Kun eksplicit false/true tæller; null er hverken egen eller demo.
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
 *   R12 FALSE KUN FOR EN MAIL, PLATFORMEN STADIG KENDER (rådet 30/9, fund 3): false
 *      skrives kun, når mailen stadig findes som bruger (company_members → profiles)
 *      eller kontaktmail i en IKKE-slettet virksomhed (`Medlemsmails.kendte`). Ellers
 *      — personen er slettet af slet-medlemsdata-cron, som IKKE rører klaviyo_profil —
 *      skrives intet: at POST'e en slettet persons mail til Klaviyo er en ny behandling
 *      af en person, vi har lovet at glemme. Tælles som `ukendt_udeladt`. Rækken i
 *      klaviyo_profil og feltet hos Klaviyo bliver stående (ÅBENT punkt i
 *      docs/marketingmotoren.md §9.5 — en DELETE i sletnings-cronen er en separat beslutning).
 *   R13 LÅSEN (rådet 30/9, fund 1): en rigtig skrivning kræver `dry_run: false` OG
 *      (app_config.klaviyo_medlem_aktiv = true ELLER prøven til én adresse, `email`).
 *      Standard false — job 571 kører allerede `{"dry_run": false}` hvert :17, så uden
 *      låsen ville første kørsel efter udrulningen være en umålt backfill til alle
 *      medlemsmails. Samme form som webinar_mail_aktiv (`!toer && (laas || email !== null)`).
 *      Låsen gælder KUN medlemspasset; webinarpasset er i drift og røres ikke.
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

/** R13: app_config-nøglen for medlemspassets lås. Standard false — Jonas sætter den med én guarded UPDATE. */
export const MEDLEM_LAAS_NOEGLE = "klaviyo_medlem_aktiv";

/** R13: app_config.config_value som læst — kun eksplicit true (jsonb true eller "true") åbner låsen. */
export function laasVaerdiErAktiv(v: unknown): boolean {
  return v === true || v === "true";
}

/** R13: skriver medlemspasset for alvor? Tørkørsel aldrig; ellers låsen ELLER prøven til én adresse. */
export function medlemSkriverRigtigt(toerKoersel: boolean, laasAktiv: boolean, email: string | null): boolean {
  return !toerKoersel && (laasAktiv === true || email !== null);
}

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
  /** R0: false = vores egen virksomhed (Topix.dk ApS). NOT NULL DEFAULT true. */
  er_kunde: boolean | null;
  /** R0: demo-virksomhed. Oprettet i Lovable; nullable. */
  is_demo: boolean | null;
  /** R0/R12: sat = medlemsdata slettet (slet-medlemsdata-cron). */
  data_slettet_at: string | null;
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
export type VirksomhedsGrund = "aktiv_kontrakt" | "aktivt_abonnement" | "slettet" | "egen" | "demo" | "legat" | "gaest" | "uden_dato" | "udloebet";

/** R0–R5: grunden for én virksomhed. Slettet, egen, demo, legat og gæst dømmes FØR tier — de er aldrig medlemmer her. */
export function virksomhedsGrund(v: MedlemVirksomhed, nu: Date): VirksomhedsGrund {
  if (v.data_slettet_at !== null && v.data_slettet_at !== undefined) return "slettet";
  if (v.er_kunde === false) return "egen";
  if (v.is_demo === true) return "demo";
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
  /** R12: alle mails, platformen stadig kender — bruger eller kontaktmail i en IKKE-slettet virksomhed, uanset grund. */
  kendte: Set<string>;
  /** Virksomheder talt pr. grund — beviset for, at reglerne ramte. */
  virksomheder: Record<VirksomhedsGrund, number>;
  /** Personer/kontaktmails i en medlemsvirksomhed uden brugbar mail (R8). */
  uden_mail: number;
}

function tomTaelling(): Record<VirksomhedsGrund, number> {
  return { aktiv_kontrakt: 0, aktivt_abonnement: 0, slettet: 0, egen: 0, demo: 0, legat: 0, gaest: 0, uden_dato: 0, udloebet: 0 };
}

/** Hvem er medlem nu — og hvem kender platformen stadig? R0–R8, R12. */
export function medlemsmails(
  virksomheder: readonly MedlemVirksomhed[],
  tilknytninger: readonly MedlemTilknytning[],
  profiler: readonly MedlemProfil[],
  nu: Date,
): Medlemsmails {
  const taelling = tomTaelling();
  const medlemsIds = new Set<string>();
  const levendeIds = new Set<string>();
  const mails = new Set<string>();
  const kendte = new Set<string>();
  let udenMail = 0;
  for (const v of virksomheder) {
    const g = virksomhedsGrund(v, nu);
    taelling[g]++;
    // R12: en slettet virksomhed giver hverken medlemmer eller kendte mails.
    if (g === "slettet") continue;
    levendeIds.add(v.id);
    const k = normaliserMail(v.contact_email);
    if (k) kendte.add(k);
    if (g !== "aktiv_kontrakt" && g !== "aktivt_abonnement") continue;
    medlemsIds.add(v.id);
    if (k) mails.add(k); else udenMail++;
  }
  const mailPrBruger = new Map<string, string | null>(profiler.map((p) => [p.user_id, normaliserMail(p.email)]));
  for (const t of tilknytninger) {
    if (!levendeIds.has(t.company_id)) continue;
    const m = mailPrBruger.get(t.user_id) ?? null;
    if (m) kendte.add(m);
    if (!medlemsIds.has(t.company_id)) continue;
    if (m) mails.add(m); else udenMail++;
  }
  return { mails, kendte, virksomheder: taelling, uden_mail: udenMail };
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
  /** R12: sidst skrevet true, men platformen kender ikke længere mailen (slettet) — intet skrives. */
  ukendt_udeladt: number;
}

/**
 * R9/R10/R12: hvad skal skrives? `sidst` er klaviyo_profil.tb_medlem pr. mail
 * (true · false · null = aldrig skrevet). `kendte` er de mails, platformen stadig
 * kender (Medlemsmails.kendte) — false skrives KUN for dem. Sorteret på mail, så
 * kørslen er deterministisk. `kun` begrænser til én mail (beviset).
 */
export function medlemPlan(
  medlemmer: ReadonlySet<string>,
  kendte: ReadonlySet<string>,
  sidst: ReadonlyMap<string, boolean | null>,
  kun: string | null = null,
): MedlemPlan {
  const plan: MedlemPlan = { poster: [], saet_true: 0, saet_false: 0, uaendret: 0, ukendt_udeladt: 0 };
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
      if (foer === true) {
        // R12: en mail, platformen ikke længere kender (slettet), sendes aldrig til Klaviyo igen.
        if (!kendte.has(email)) { plan.ukendt_udeladt++; continue; }
        plan.saet_false++;
        plan.poster.push({ email, oensket: false });
        continue;
      }
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
  /** R13: app_config.klaviyo_medlem_aktiv som læst (fail-closed). */
  laas_aktiv: boolean;
  /** R13: skrev passet for alvor: !dry_run && (laas_aktiv || prøven til én adresse). */
  sender_rigtigt: boolean;
  /** R13: poster, en rigtig kørsel ville have skrevet, men som den lukkede lås holdt tilbage. */
  holdt_af_laas: number;
  /** Virksomheder pr. grund (R0–R5). */
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
  /** R12: sidst skrevet true, men slettet i platformen — intet skrevet. */
  ukendt_udeladt: number;
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
    laas_aktiv: false, sender_rigtigt: false, holdt_af_laas: 0,
    virksomheder: tomTaelling(),
    medlemsmails: 0, uden_mail: 0, tilstand_true: 0, saet_true: 0, saet_false: 0, uaendret: 0, ukendt_udeladt: 0,
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
    laas_aktiv: m.laas_aktiv, sender_rigtigt: m.sender_rigtigt, holdt_af_laas: m.holdt_af_laas,
    skrevet: m.skrevet, lykkedes: m.lykkedes, fejlede: m.fejlede, udsat: m.udsat,
    // Kun ANTALLET — en sti kan selv bære mailen (en nøgle, der er en adresse).
    fejl: [`svaret bar persondata og er fjernet (${fund.length} sted(er))`],
  };
}
