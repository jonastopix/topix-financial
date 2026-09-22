/**
 * klokkeMail — rådgivernes klokker (advisor_notifications) som mail: dommen,
 * grupperingen, nøglerne og teksterne. REN (ingen Supabase, ingen Deno), så
 * vitest dækker den (src/lib/__tests__/klokkeMail.test.ts). Functionen
 * klokke-mail-cron henter rækkerne, sender og stempler.
 *
 * HVORFOR (princip 1, 20/9: «et signal, kun en browser kan vise, er ikke et
 * signal»; recon-klokker-mail.md 21/9): 23 skrivere ringer klokken gennem
 * skrivRaadgiverBesked, og ingen mailvej læser tabellen — send-notification-email
 * læser kun `notifications`, og dens ADVISOR_EMAIL_DISABLED gælder medlemmernes
 * motor. Kun tre hændelser mailede rådgiveren selv (ny ansøgning, gensenderens
 * alarm, profil-cronens alarm).
 *
 * BESLUTTET (Jonas 21/9) — tre mails, typerne står HER og kun her:
 *   ALARM      — kun til driftModtager (Jonas), straks (kørslen hvert kvarter),
 *                én samlet mail pr. kørsel. Samme hændelse har én række pr.
 *                rådgiver; mailen lister hændelsen ÉN gang (alarmHaendelser),
 *                og alle rækkerne stemples.
 *   COMMUNITY  — til hver rådgiver, straks, én samlet mail pr. rådgiver.
 *   MORGEN     — til hver rådgiver, første kørsel efter kl. 07 dansk PÅ EN HVERDAG
 *                (Jonas 21/9: hverdagsreglen er hverdage.ts' — mandag–fredag minus
 *                danske helligdage og husets tre lukkedage), én mail pr. rådgiver
 *                pr. hverdag med klokkerne fra FØR kl. 07 (morgenGraense); en klokke
 *                fra efter kl. 07, fra weekenden eller fra en helligdag venter til
 *                næste hverdags morgenmail. Teksten siger, hvornår den forrige
 *                morgenmail gik (sidenOrd: «i går» · «fredag» · «onsdag 1. april»),
 *                regnet af samme regel (forrigeHverdagFra).
 *   ALDRIG     — ansoegning_ny (mailes allerede af motoren), ansoegning_afholdt
 *                (rykkerkøen mailer dag 2), legacy-typerne (Slack-vejen, rækker
 *                uden advisor_id) — og en «drift»-klokke, hvis reference_type
 *                står i SELVMAILENDE_REFERENCER: gensenderen (klaviyo_haendelser)
 *                og profil-cronen (klaviyo_profil) mailer SELV driftModtager og
 *                skriver klokken bagefter; mailede vi den igen, fik Jonas samme
 *                alarm to gange inden for et kvarter (rettelse 21/9) — det samme
 *                gælder meta-send-cron (meta_haendelser) og ga-send-cron
 *                (ga_haendelser), som begge kom i main samme aften. De øvrige
 *                drift-klokker (vagt_cron → cron_vagt_log, meta_hentning_vagt og
 *                meta-annoncer-cron → meta_hentning) har ingen egen mail og går
 *                som ALARM.
 * En type uden plads i listerne er «ukendt»: den mailes ikke, står i svaret, og
 * kildeværnet (klokkeMail.guard) fælder, når en ny type dukker op i koden uden
 * at få plads — så en fremtidig klokke ikke stille falder udenfor.
 *
 * REGLERNE:
 *   - Hver rådgiver får kun sine EGNE rækker (advisor_id). Rækker uden advisor_id
 *     (legacy) mailes aldrig.
 *   - En klokke, der er LÆST (read_at sat), mailes ikke.
 *   - En klokke mailes højst én gang: mailet_at (kolonnen, migration 20260922070000)
 *     sættes EFTER en vellykket afsendelse; functionen læser kun rækker med
 *     mailet_at IS NULL. Idempotensen på selve mailen går gennem sendManagedEmail
 *     (idempotencyKey → email_send_log.message_id), som gensenderen: nøglen for
 *     ALARM og COMMUNITY bærer et aftryk af rækkernes id'er (samme sæt → samme
 *     nøgle, så en stempling, der fejlede efter afsendelsen, ikke giver en mail
 *     nr. to); MORGEN-nøglen bærer den danske dato (én pr. dag pr. rådgiver).
 *   - Kun rækker fra de sidste VINDUE_DAGE dage — en klokke, der har stået ulæst
 *     i en uge, er hverken «straks» eller «i morgen tidlig».
 *   - Tiden gives ind som `nu` — den gættes ikke.
 */
import { erHverdag, forrigeHverdagFra, kbhDato, kbhDele, kbhTilUtc } from "./hverdage.ts";

// ── Typerne — ét sted ────────────────────────────────────────────────────────

/** ALARM: går galt i driften eller i penge/adgang — kun til driftModtager, straks. */
export const ALARM_TYPER = [
  "traek_fejlet",            // stripe-webhook: fejlet træk (raadgiverBeskedTekst.ts)
  "invitation_fejlet",       // stripe-webhook: invitationen efter betaling fejlede
  "ansoegning_underskrevet", // ansoegningMotor: «Underskrift stoppet» — CVR findes som virksomhed
  "mail_spaerret",           // meldSpaerretMail: udbyderen har spærret virksomhedens adresse
  "fornyelse_dublet",        // stripe-webhook: fornyelsen betalt to gange
  "drift",                   // vagt_cron, meta_hentning_vagt, meta-annoncer-cron, gensenderen, profil-cronen
] as const;

/** COMMUNITY: til hver rådgiver, straks. Svar i tråde giver INGEN klokke (notify-community-svar skriver kun `notifications`). */
export const COMMUNITY_TYPER = ["community_opslag"] as const;

/** MORGEN: til hver rådgiver kl. 07 dansk, én mail. */
export const MORGEN_TYPER = [
  "stille_ingen_bruger",        // stille-klokker-cron
  "stille_ingen_login",         // stille-klokker-cron
  "venteliste",                 // _shared/venteliste.ts (og rykkerkøens udtømmende gren)
  "ansoegning_genoptaget",      // ansoegning-link
  "ansoegning_lukket_af_koen",  // ansoegning-rykker-cron, indgangs-paamindelser-cron
  "ansoegning_pause_slut",      // ansoegning-rykker-cron
  "ansoegning_webhook_afvist",  // calendly-webhook (RAADGIVER_BESKED.webhook_afvist)
  "ansoegning_cvr_loft",        // ansoegning-cvr
  "indgang_betalt",             // stripe-webhook
  "genindtraeden",              // stripe-webhook
  "fornyelse_betalt",           // stripe-webhook
  "ansoegning_samtale_booket",  // samtaleBesked (kun når ansøgeren selv bookede)
  "ansoegning_samtale_flyttet", // samtaleBesked
  "ansoegning_samtale_aflyst",  // samtaleBesked
] as const;

/** ALDRIG mailet — med grunden. */
export const ALDRIG_TYPER: Readonly<Record<string, string>> = {
  ansoegning_ny: "mailes allerede: ansoegningMotor sender «ansoegning-ny-raadgiver» til raadgiverModtager ved indsendelsen",
  ansoegning_afholdt: "rykkerkøen mailer rådgiveren dag 2 (trappen «afholdt», rykkerkoe.ts)",
  community_svar: "Jonas 21/9: klokke, ikke mail (notify-community-svar → communitySvarBesked.ts)",
};

/**
 * Drift-klokker, hvis skriver SELV mailer driftModtager i samme kørsel (sendManagedEmail +
 * skrivRaadgiverBesked type «drift» i samme function). Klassificeres «aldrig» — én alarm, én mail.
 * Listen står KUN her; klokkeMail.guard finder de selvmailende alarmer i koden og fælder en, der mangler.
 */
export const SELVMAILENDE_REFERENCER = [
  "klaviyo_haendelser", // klaviyo-gensend-cron: alarmmail + drift-klokke (skrivAlarm)
  "klaviyo_profil",     // klaviyo-profil-cron: alarmmail + drift-klokke (skrivAlarm)
  "meta_haendelser",    // meta-send-cron (#1069, i main siden 21/9 aften): alarmmail + drift-klokke
  "ga_haendelser",      // ga-send-cron (merget 21/9 aften, da848925): alarmmail + drift-klokke
] as const;
export const SELVMAILENDE_GRUND = "mailes allerede af sin egen alarm (sendManagedEmail i samme kørsel som klokken)";

/** Legacy-writerne (send-slack-*, run-company-agent): én fælles række UDEN advisor_id, og Slack er deres vej. Mailes aldrig. */
export const LEGACY_TYPER = ["new_message", "report_uploaded", "handout_completed", "feedback_submitted", "agent_insight"] as const;

export type MailArt = "alarm" | "community" | "morgen";
export type Klasse = MailArt | "aldrig" | "legacy" | "ukendt";

/** Klassen af en klokke: typen — og for «drift» også reference_type (en selvmailende alarm mailes aldrig igen). */
export function klassificer(type: string, referenceType: string | null = null): Klasse {
  if (type === "drift" && referenceType !== null && (SELVMAILENDE_REFERENCER as readonly string[]).includes(referenceType)) return "aldrig";
  if ((ALARM_TYPER as readonly string[]).includes(type)) return "alarm";
  if ((COMMUNITY_TYPER as readonly string[]).includes(type)) return "community";
  if ((MORGEN_TYPER as readonly string[]).includes(type)) return "morgen";
  if (type in ALDRIG_TYPER) return "aldrig";
  if ((LEGACY_TYPER as readonly string[]).includes(type)) return "legacy";
  return "ukendt";
}

// ── Konstanterne ─────────────────────────────────────────────────────────────

/** Morgenmailen går i den første kørsel, hvor den danske klokke er ≥ 07. */
export const MORGEN_TIME = 7;
/** Kun rækker fra de sidste 7 dage læses. */
export const VINDUE_DAGE = 7;
export const NOEGLE_PRAEFIKS = "klokke-mail:";
export const MAIL_LABEL: Readonly<Record<MailArt, string>> = {
  alarm: "klokke-mail-alarm",
  community: "klokke-mail-community",
  morgen: "klokke-mail-morgen",
};
/** Alarmens «modtager» i nøglen — den går ikke til en rådgiver-id, men til driftModtager. */
export const ALARM_MODTAGER_ID = "drift";
export const APP_URL = "https://app.theboardroom.dk";

// ── Rækkerne ─────────────────────────────────────────────────────────────────

export interface KlokkeRaekke {
  id: string;
  advisor_id: string | null;
  type: string;
  title: string;
  body: string | null;
  company_id: string | null;
  reference_type: string | null;
  reference_id: string | null;
  read_at: string | null;
  mailet_at: string | null;
  created_at: string;
}

export interface Raadgiver {
  id: string;
  email: string;
  fornavn: string | null;
}

/** Dagens 07:00 dansk tid for et tidspunkt. */
export function morgenGraense(nu: Date): Date {
  return kbhTilUtc(kbhDato(nu), MORGEN_TIME, 0);
}

/** Er kørslen en morgenkørsel — en HVERDAG (hverdage.ts: ikke weekend, helligdag eller lukkedag) med dansk klokke ≥ 07? */
export function erMorgenkoersel(nu: Date): boolean {
  return erHverdag(nu) && kbhDele(nu).time >= MORGEN_TIME;
}

/** Datoen for den forrige morgenmail: seneste hverdag FØR i dag (samme regel). */
export function forrigeMorgenDato(nu: Date): string {
  return forrigeHverdagFra(kbhDato(nu), false);
}

/** Tidspunktet for den forrige morgenmail (kl. 07 dansk på den dato). */
export function forrigeMorgen(nu: Date): Date {
  return kbhTilUtc(forrigeMorgenDato(nu), MORGEN_TIME, 0);
}

export interface Sprunget {
  laest: number;
  mailet: number;
  uden_advisor: number;
  aldrig: number;
  legacy: number;
  /** Morgen-typer fra EFTER kl. 07 i dag, eller læst før kl. 07 — de venter til næste morgen. */
  venter_paa_morgen: number;
}

export interface Fordeling {
  alarm: KlokkeRaekke[];
  community: Map<string, KlokkeRaekke[]>;
  morgen: Map<string, KlokkeRaekke[]>;
  sprunget: Sprunget;
  ukendte: { id: string; type: string }[];
}

const efterTid = (a: KlokkeRaekke, b: KlokkeRaekke) =>
  a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1;

function laegTil(m: Map<string, KlokkeRaekke[]>, noegle: string, r: KlokkeRaekke) {
  const liste = m.get(noegle);
  if (liste) liste.push(r); else m.set(noegle, [r]);
}

/**
 * Dommen: hvem får hvad. Læste og allerede mailede rækker springes over;
 * rækker uden advisor_id springes over; morgen-typer kun i en morgenkørsel og
 * kun fra før dagens kl. 07. Rækkefølgen inden i hver liste er ældste først.
 */
export function fordel(raekker: readonly KlokkeRaekke[], nu: Date): Fordeling {
  const ud: Fordeling = {
    alarm: [], community: new Map(), morgen: new Map(),
    sprunget: { laest: 0, mailet: 0, uden_advisor: 0, aldrig: 0, legacy: 0, venter_paa_morgen: 0 },
    ukendte: [],
  };
  const morgen = erMorgenkoersel(nu);
  const graenseMs = morgenGraense(nu).getTime();
  for (const r of [...raekker].sort(efterTid)) {
    if (r.read_at) { ud.sprunget.laest++; continue; }
    if (r.mailet_at) { ud.sprunget.mailet++; continue; }
    if (!r.advisor_id) { ud.sprunget.uden_advisor++; continue; }
    switch (klassificer(r.type, r.reference_type)) {
      case "alarm": ud.alarm.push(r); break;
      case "community": laegTil(ud.community, r.advisor_id, r); break;
      case "morgen":
        if (morgen && Date.parse(r.created_at) < graenseMs) laegTil(ud.morgen, r.advisor_id, r);
        else ud.sprunget.venter_paa_morgen++;
        break;
      case "aldrig": ud.sprunget.aldrig++; break;
      case "legacy": ud.sprunget.legacy++; break;
      default: ud.ukendte.push({ id: r.id, type: r.type });
    }
  }
  return ud;
}

/** Én hændelse pr. (type, reference_id — ellers titlen): alarmens rækker findes én gang pr. rådgiver, mailen lister dem én gang. */
export function alarmHaendelser(raekker: readonly KlokkeRaekke[]): KlokkeRaekke[] {
  const set = new Set<string>();
  const ud: KlokkeRaekke[] = [];
  for (const r of [...raekker].sort(efterTid)) {
    const n = `${r.type}\u0000${r.reference_id ?? `t:${r.title}`}`;
    if (set.has(n)) continue;
    set.add(n);
    ud.push(r);
  }
  return ud;
}

// ── Nøglerne ─────────────────────────────────────────────────────────────────

/** FNV-1a, 64 bit, som 16 hex-tegn. Ren og synkron — aftryk af et sæt id'er, ikke kryptografi. */
export function fnv1a64(s: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

/** Aftrykket af et sæt rækker — sorteret på id, så rækkefølgen ikke ændrer nøglen. */
export function saetAftryk(raekker: readonly Pick<KlokkeRaekke, "id">[]): string {
  return fnv1a64([...raekker].map((r) => r.id).sort().join(","));
}

/**
 * Idempotensnøglen (email_send_log.message_id): ALARM og COMMUNITY bærer sættets
 * aftryk (samme sæt → samme nøgle), MORGEN bærer dagen (én pr. dag pr. rådgiver).
 */
export function mailNoegle(art: MailArt, modtagerId: string, raekker: readonly Pick<KlokkeRaekke, "id">[], nu: Date): string {
  const hale = art === "morgen" ? kbhDato(nu) : saetAftryk(raekker);
  return `${NOEGLE_PRAEFIKS}${art}:${modtagerId}:${hale}`;
}

// ── Linket — samme regel som src/lib/hjemmebane/klokke.ts raadgiverSti ────────

export const CHAT_STI = "/chat";

/** Kopi af raadgiverSti (klokke.ts) — paritetsprøvet i klokkeMail.test.ts. */
export function klokkeSti(n: Pick<KlokkeRaekke, "type" | "reference_type" | "reference_id" | "company_id">): string | null {
  if (n.type === "drift") return "/";
  const virksomhed = n.company_id ? `/virksomhed/${n.company_id}` : null;
  switch (n.reference_type) {
    case "report":
      return virksomhed ? (n.reference_id ? `${virksomhed}?reportId=${n.reference_id}` : virksomhed) : "/virksomheder";
    case "traek":
      return virksomhed ? `${virksomhed}?section=aftale` : "/virksomheder";
    case "handout":
      return virksomhed ?? "/virksomheder";
    case "chat":
      return n.company_id ? `${CHAT_STI}?companyId=${n.company_id}${n.reference_id ? `&messageId=${n.reference_id}` : ""}` : CHAT_STI;
    case "feedback":
      return `/admin/feedback${n.reference_id ? `?feedbackId=${n.reference_id}` : ""}`;
    case "ansoegning":
      return n.reference_id ? `/ansoegninger/${n.reference_id}` : "/ansoegninger";
    case "community_traad":
      return n.reference_id ? `/community/${n.reference_id}` : "/community";
    default:
      return virksomhed;
  }
}

export function klokkeLink(n: Pick<KlokkeRaekke, "type" | "reference_type" | "reference_id" | "company_id">): string {
  return `${APP_URL}${klokkeSti(n) ?? "/"}`;
}

// ── Teksterne ────────────────────────────────────────────────────────────────

export interface MailTekst {
  emne: string;
  afsnit: string[];
  blokke: { overskrift: string; tekst: string }[];
  /** Ren tekst-udgaven. */
  tekst: string;
}

const to = (n: number) => String(n).padStart(2, "0");

/** «22/9-2026 kl. 07:04» — dansk. */
export function danskTid(nu: Date): string {
  const p = kbhDele(nu);
  return `${p.dag}/${p.maaned}-${p.aar} kl. ${to(p.time)}:${to(p.minut)}`;
}

const UGEDAGE = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
const MAANEDER = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

/** «tirsdag 22. september» — dansk. */
export function danskDag(nu: Date): string {
  const p = kbhDele(nu);
  return `${UGEDAGE[p.ugedag]} ${p.dag}. ${MAANEDER[p.maaned - 1]}`;
}

/**
 * Hvornår den forrige morgenmail gik, som ord: «i går» (forrige hverdag var i går),
 * ugedagen alene (inden for en uge: «fredag», «onsdag»), ellers ugedag + dato.
 * Aldrig «siden i går», når det ikke passer (mandag, efter en helligdag).
 */
export function sidenOrd(nu: Date): string {
  const forrige = forrigeMorgenDato(nu);
  const dage = Math.round((Date.parse(kbhDato(nu)) - Date.parse(forrige)) / 86_400_000);
  const d = kbhDele(kbhTilUtc(forrige, 12, 0));
  if (dage === 1) return "i går";
  if (dage <= 6) return UGEDAGE[d.ugedag];
  return `${UGEDAGE[d.ugedag]} ${d.dag}. ${MAANEDER[d.maaned - 1]}`;
}

/** «Klokken» som blok: titlen som overskrift, brødteksten + linket som tekst. */
export function klokkeBlok(r: KlokkeRaekke): { overskrift: string; tekst: string } {
  const krop = (r.body ?? "").trim();
  return { overskrift: r.title, tekst: `${krop ? `${krop} ` : ""}${klokkeLink(r)}` };
}

const hilsen = (fornavn: string | null | undefined) => `Hej ${(fornavn ?? "").trim() || "rådgiver"}`;
const tal = (n: number, ental: string, flertal: string) => `${n} ${n === 1 ? ental : flertal}`;

function renTekst(afsnit: string[], blokke: { overskrift: string; tekst: string }[], hale: string): string {
  return [...afsnit, "", ...blokke.map((b) => `${b.overskrift}: ${b.tekst}`), "", hale].join("\n");
}

const HALE = "Klokken i platformen: markér som læst, når du har taget dig af den — en læst klokke mailes ikke igen.";

/** ALARM — til driftModtager. `haendelser` er allerede foldet (alarmHaendelser). */
export function alarmMailTekst(haendelser: readonly KlokkeRaekke[], nu: Date): MailTekst {
  const n = haendelser.length;
  const emne = `Alarm: ${tal(n, "klokke", "klokker")} kræver et menneske (${danskTid(nu)})`;
  const typer = [...new Set(haendelser.map((h) => h.type))].join(", ");
  const afsnit = [
    `Platformen har ringet ${tal(n, "alarmklokke", "alarmklokker")} siden sidste kørsel (${typer}). Det er de klokker, der betyder, at penge, adgang eller driften er gået galt — de går kun til dig.`,
  ];
  const blokke = haendelser.map(klokkeBlok);
  return { emne, afsnit, blokke, tekst: renTekst([emne, ...afsnit], blokke, HALE) };
}

/** COMMUNITY — til én rådgiver, hendes/hans egne rækker. */
export function communityMailTekst(raekker: readonly KlokkeRaekke[], nu: Date, fornavn: string | null | undefined): MailTekst {
  const n = raekker.length;
  const emne = `Community: ${tal(n, "nyt opslag", "nye opslag")} (${danskTid(nu)})`;
  const afsnit = [
    `${hilsen(fornavn)}. ${n === 1 ? "Et medlem har skrevet et nyt opslag" : `Medlemmerne har skrevet ${n} nye opslag`} i Community. Vi vil gerne engagere os, mens det er varmt — linket går til tråden.`,
  ];
  const blokke = raekker.map(klokkeBlok);
  return { emne, afsnit, blokke, tekst: renTekst([emne, ...afsnit], blokke, HALE) };
}

/** MORGEN — til én rådgiver, hendes/hans egne rækker fra før kl. 07. «Siden» er den forrige morgenmail (sidenOrd), aldrig et gæt på «i går». */
export function morgenMailTekst(raekker: readonly KlokkeRaekke[], nu: Date, fornavn: string | null | undefined): MailTekst {
  const n = raekker.length;
  const siden = `siden ${sidenOrd(nu)} kl. ${to(MORGEN_TIME)}`;
  const emne = `Morgenmailen ${danskDag(nu)}: ${tal(n, "klokke", "klokker")} ${siden}`;
  const afsnit = [
    `${hilsen(fornavn)}. ${n === 1 ? "Én klokke har ringet" : `${n} klokker har ringet`} i platformen ${siden} — dem, der ikke haster nu og her, men skal ses i dag. Ældste først.`,
  ];
  const blokke = raekker.map(klokkeBlok);
  return { emne, afsnit, blokke, tekst: renTekst([emne, ...afsnit], blokke, HALE) };
}
