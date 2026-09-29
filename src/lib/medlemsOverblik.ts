/**
 * src/lib/medlemsOverblik.ts — rådgiverens samlede overblik over medlemmerne,
 * KUN motoren (29/9-2026). Fladerne (kolonner og filtre på /virksomheder, en
 * ugentlig statusmail) bygges bagefter på denne motor.
 *
 * JONAS 29/9: «Vi har brug for et samlet overblik, så vi ikke skal tjekke på
 * hver enkelt kunde» — og en ugentlig mail med status på det hele. Grundlaget
 * er ~/Downloads/recon-raadgiver-overblik.md.
 *
 * MÅLT I PROD 29/9-2026 (Jonas' tal — nulpunktet, motoren skal kunne vise):
 *   - 28 aktive kunder, 27 medlemmer, 3 kunder uden bruger.
 *   - Sessioner: Jonas-retten er sat i hånden for 23 virksomheder 13/9 kl.
 *     20:50–20:54 UTC (Jonas: «det var mig»). Jonas-sessionen er kun en del af
 *     medlemskabet for NYE medlemmer; de 23 er «ikke omfattet», ikke «har haft
 *     session». Morten-retten står som brugt hos 12 uden en eneste
 *     session_bookings-række (21/6–13/8) — årsagen er IKKE målt. Kun 11 rækker
 *     nogensinde. Medlemmerne booker gennem platformen (Jonas).
 *   - 30 dage: login 24/27, godkendt rapport 15/28, uploadet 11/28, events
 *     14/27, chat 13/27, refleksion 7/28, akademi 5/27, community 4/27, mål
 *     2/28, handouts 0/27.
 *
 * GIT-MÅLING 29/9 (git log -p på create-free-intro-booking og calendly-webhook,
 * 15/6 → 20/8): fra første commit (db5e55b9, 21/6) tog functionen retten
 * ATOMISK FØRST (`update({ intro_session_used_at: ts }).is(…, null)`), lavede
 * Calendly-linket, og indsatte DEREFTER rækken (`status: "booking_sent"`) —
 * og rullede retten tilbage (`update({ intro_session_used_at: null })`), hvis
 * link eller insert fejlede. Koden skrev altså en række, når retten blev taget.
 * Retten kunne OGSÅ sættes i hånden fra samme dag (EditCompanyDialog, 0b2759aa
 * 21/6). «Ret brugt uden række» kan derfor ikke komme af den normale vej;
 * hvad det er (hånden, en fejlet rollback, en slettet række), bærer rækken
 * ikke — og motoren påstår det ikke.
 *
 * HUSETS DOMME GENBRUGES, IKKE GENTAGES (målt):
 *   - erAfholdt (lib/introSession)         «afholdt» = booked OG slut_tid passeret
 *   - dageSiden, senesteAf (lib/sidstOnline) hele døgn siden; det seneste stempel
 *   - afgoerIkkeIGang (lib/ikkeIGang)       «ny og ikke kommet i gang» (rapportering)
 *   - STILSTAND_LAENGE_DAGE (forsidensDom) = 60 — samme tal som TRAENGER_GODKENDT_DAGE
 *     (prøven låser ligheden; ikke importeret, forsidensDom er fladens fil)
 *   IKKE genbrugt: doemStille (lib/stilleDom) dømmer KONTRAKTER for klokkerne
 *   (90/120/150 dage) — et andet spørgsmål end «hvem trænger til et blik nu».
 *
 * REN: ingen React, ingen Supabase. Tiden gives ind som `nu`. Prøvet i
 * __tests__/medlemsOverblik.test.ts.
 */
import { erAfholdt } from "@/lib/introSession";
import { dageSiden, senesteAf } from "@/lib/sidstOnline";
import { afgoerIkkeIGang, type IkkeIGangInput } from "@/lib/ikkeIGang";

// ── Sessioner ────────────────────────────────────────────────────────────────

export type Raadgiver = "morten" | "jonas";

/**
 * Jonas' ord (29/9): «Jonas-sessionen er kun en del af medlemskabet for NYE
 * medlemmer.» De 23 Jonas-retter blev sat i hånden 13/9-2026 kl. 20:50–20:54
 * UTC; retten kom med migrationen 20260913220000 samme aften. Regnestykket:
 * en Jonas-ret sat FØR 14/9-2026 00:00 UTC uden en session_bookings-række er
 * «ikke_omfattet» — ikke «har haft session», ikke «markeret uden booking».
 * Gælder KUN Jonas' ret: Mortens 12 uden række (21/6–13/8) er «markeret_uden_
 * booking» — årsagen er ikke målt, og motoren gætter ikke.
 */
export const IKKE_OMFATTET_FRA = "2026-09-14T00:00:00Z";

export type SessionStatus =
  /** Retten er ikke brugt (kolonnen null) — også når en host-aflysning har genåbnet den. */
  | "ikke_brugt"
  /** Rækken står som booking_sent: link sendt, ingen tid valgt. */
  | "link_sendt"
  /** booked og slut_tid i fremtiden (eller uden tid — så bærer `tid` null). */
  | "booket"
  /** UDLEDT: booked og slut_tid passeret (introSession.erAfholdt). «Udeblev» kan ikke vides. */
  | "afholdt"
  | "aflyst"
  /** Retten er sat, men ingen række — hvorfor, bærer rækken ikke. */
  | "markeret_uden_booking"
  /** Jonas' ret sat før IKKE_OMFATTET_FRA uden række: ikke en del af deres medlemskab. */
  | "ikke_omfattet";

/** Så lidt af session_bookings, som dommen behøver — KUN den inkluderede række (amount_dkk 0) for rådgiveren. */
export interface SessionRaekke {
  status: string;
  start_tid: string | null;
  slut_tid: string | null;
  created_at: string;
}

export interface SessionDom {
  raadgiver: Raadgiver;
  status: SessionStatus;
  /** Sat, når rækken bærer en tid (booket/afholdt). */
  tid: { start: string | null; slut: string | null } | null;
  /** companies.intro_session_used_at / jonas_session_used_at. */
  retAt: string | null;
}

const KENDTE_STATUSSER = ["booking_sent", "booked", "cancelled"] as const;

/** Den nyeste række med en kendt status; pending/paid/refunded er ikke den inkluderede vej og tæller ikke. */
function nyesteRaekke(raekker: readonly SessionRaekke[]): SessionRaekke | null {
  const kendte = raekker.filter((r) => (KENDTE_STATUSSER as readonly string[]).includes(r.status));
  if (kendte.length === 0) return null;
  return [...kendte].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

/**
 * Sessionsstatus for én virksomhed og én rådgiver. Rækkefølgen er fail-closed:
 * retten først (uden ret er der ingen session, uanset rækker), så rækken.
 * Påstår aldrig mere, end rækken bærer.
 */
export function sessionStatus(i: {
  raadgiver: Raadgiver;
  /** companies.intro_session_used_at (morten) / jonas_session_used_at (jonas). */
  retAt: string | null | undefined;
  /** session_bookings for virksomheden med advisor = raadgiver og amount_dkk = 0. */
  raekker: readonly SessionRaekke[];
  nu: Date;
}): SessionDom {
  const retAt = i.retAt ?? null;
  const bas = { raadgiver: i.raadgiver, retAt, tid: null as SessionDom["tid"] };
  if (retAt === null) return { ...bas, status: "ikke_brugt" };
  const r = nyesteRaekke(i.raekker);
  if (r === null) {
    const retMs = Date.parse(retAt);
    const foerOmfattet = Number.isFinite(retMs) && retMs < Date.parse(IKKE_OMFATTET_FRA);
    if (i.raadgiver === "jonas" && foerOmfattet) return { ...bas, status: "ikke_omfattet" };
    return { ...bas, status: "markeret_uden_booking" };
  }
  const tid = r.start_tid || r.slut_tid ? { start: r.start_tid, slut: r.slut_tid } : null;
  if (r.status === "cancelled") return { ...bas, status: "aflyst", tid };
  if (r.status === "booked") return { ...bas, status: erAfholdt(r, i.nu) ? "afholdt" : "booket", tid };
  return { ...bas, status: "link_sendt", tid };
}

// ── Aktivitet ────────────────────────────────────────────────────────────────

/** Vinduet, «har været aktiv» regnes i — de 30 dage, Jonas målte nulpunktet i (og kohortens KOHORTE_DAGE). */
export const AKTIVITET_VINDUE_DAGE = 30;

export type AktivitetsFelt =
  | "login"
  | "godkendt_rapport"
  | "uploadet_rapport"
  | "refleksion"
  | "medlemsbesked"
  | "event_tilmelding"
  | "akademi"
  | "community"
  | "maal";

/**
 * Stemplerne pr. felt — ISO-strenge. Kalderen (hooken/cronen) henter dem;
 * dommen ved ikke, hvor de kommer fra, men det står her, felt for felt.
 * «Overlever» = hvad der sker, hvis en tredjepart udskiftes (recon §2).
 */
export interface AktivitetsInput {
  /** user_login_log.logged_in_at for virksomhedens brugere — KUN DATOEN duer (rækkerne tæller faneskift og reloads, recon §2a). Overlever: platform. Data fra 2026-03-02. */
  login: readonly string[];
  /** financial_report_facts.committed_at pr. periode — en gen-godkendelse overskriver (første godkendelse tabes, §2b). Overlever: platform. */
  godkendt_rapport: readonly string[];
  /** financial_reports.uploaded_at, uden sentinel-rækker (file_path '_sentinel') — kan ikke skelnes fra rådgiverens import (§2b). Overlever: platform. */
  uploadet_rapport: readonly string[];
  /** pulse_checkins.created_at — én pr. måned, «sendt» = første gang (§2c). Overlever: platform. */
  refleksion: readonly string[];
  /** messages.created_at med message_type 'user' fra et MEDLEM (eller conversations.last_member_message_at, §2j). Overlever: platform. */
  medlemsbesked: readonly string[];
  /** event_registrations.registered_at med response 'attending' og uden cancelled_at — første tilmelding; fremmøde findes ikke (§2h). Overlever: platform. */
  event_tilmelding: readonly string[];
  /** member_progress.updated_at (seen/acknowledged/brugbar) for virksomhedens brugere via company_members — tabellen har intet company_id (§2g). Overlever: platform (Circle er død). */
  akademi: readonly string[];
  /** community_traade/svar/reaktioner.created_at for virksomhedens brugere (§2i). Overlever: platform. */
  community: readonly string[];
  /** milestones: created_at, progress_updated_at, completed_at — hvem der rørte målet, bærer rækken ikke (§2d). Overlever: platform. */
  maal: readonly string[];
}

export const AKTIVITETS_FELTER: readonly AktivitetsFelt[] = [
  "login", "godkendt_rapport", "uploadet_rapport", "refleksion", "medlemsbesked", "event_tilmelding", "akademi", "community", "maal",
];

export interface Aktivitet {
  /** Det seneste stempel (ISO) — null når intet. */
  sidst: string | null;
  /** Hele døgn siden `sidst` (sidstOnline.dageSiden) — null når intet. */
  dage: number | null;
  /** Inden for AKTIVITET_VINDUE_DAGE: dage < 30. Dag 30 er ude. */
  iVinduet: boolean;
}

export function aktivitetAf(stempler: readonly string[], nu: Date): Aktivitet {
  const sidst = senesteAf(stempler);
  const dage = dageSiden(sidst, nu);
  return { sidst, dage, iVinduet: dage !== null && dage < AKTIVITET_VINDUE_DAGE };
}

export function aktiviteterAf(i: AktivitetsInput, nu: Date): Record<AktivitetsFelt, Aktivitet> {
  const ud = {} as Record<AktivitetsFelt, Aktivitet>;
  for (const felt of AKTIVITETS_FELTER) ud[felt] = aktivitetAf(i[felt] ?? [], nu);
  return ud;
}

// ── Den samlede dom ──────────────────────────────────────────────────────────

/** Ingen login i så mange dage «trænger» — samme 30 dage som aktivitetsvinduet og nulpunktet (24/27 havde login). */
export const TRAENGER_LOGIN_DAGE = 30;
/** Ingen godkendt rapport i så mange dage «trænger» — 60, som forsidensDom.STILSTAND_LAENGE_DAGE (to måneder uden tal er stilstand længe). */
export const TRAENGER_GODKENDT_DAGE = 60;

export type Maerke =
  /** Ingen login i TRAENGER_LOGIN_DAGE (eller aldrig) — kun når virksomheden HAR brugere. */
  | "ingen_login"
  /** Ingen godkendt rapport i TRAENGER_GODKENDT_DAGE (eller aldrig). */
  | "ingen_godkendt_rapport"
  /** ingen_login ELLER ingen_godkendt_rapport. */
  | "traenger"
  /** Morten ikke_brugt/link_sendt — eller Jonas ikke_brugt for et NYT medlem (medlem fra IKKE_OMFATTET_FRA). */
  | "ingen_session_endnu"
  /** ikkeIGang siger signal (ny, uden målt rapport, dag 7–90). */
  | "ikke_i_gang"
  /** Kunde uden bruger — kan hverken logge ind eller gøre noget (3 i prod 29/9). */
  | "ingen_bruger";

export interface OverbliksInput {
  nu: Date;
  /** Antal brugere (company_members). */
  antalBrugere: number;
  /** Første company_members.created_at — ikkeIGang's start og «ny»-porten for Jonas-sessionen. */
  medlemSiden: string | null;
  sessioner: { morten: SessionDom; jonas: SessionDom };
  aktivitet: Record<AktivitetsFelt, Aktivitet>;
  /** ikkeIGang's to øvrige felter — hooken har dem allerede til forsiden. */
  harMaaltRapport: boolean;
  antalUploads: number;
}

export interface OverbliksDom {
  maerker: Maerke[];
  /** Til sortering: flere og tungere mærker først. */
  vaegt: number;
}

/** Vægten pr. mærke — «traenger» og «ingen_bruger» tungest; sessionen er et blik, ikke en alarm. */
export const MAERKE_VAEGT: Readonly<Record<Maerke, number>> = {
  ingen_bruger: 50,
  traenger: 40,
  ingen_login: 10,
  ingen_godkendt_rapport: 10,
  ikke_i_gang: 30,
  ingen_session_endnu: 5,
};

/** Er medlemmet nyt nok til, at Jonas-sessionen er en del af medlemskabet? Uden startdato: nej (fail-closed). */
export function erNytMedlem(medlemSiden: string | null | undefined): boolean {
  if (!medlemSiden) return false;
  const ms = Date.parse(medlemSiden);
  return Number.isFinite(ms) && ms >= Date.parse(IKKE_OMFATTET_FRA);
}

function udenFor(a: Aktivitet, dage: number): boolean {
  return a.dage === null || a.dage >= dage;
}

export function overbliksDom(i: OverbliksInput): OverbliksDom {
  const maerker: Maerke[] = [];
  if (i.antalBrugere <= 0) maerker.push("ingen_bruger");
  const ingenLogin = i.antalBrugere > 0 && udenFor(i.aktivitet.login, TRAENGER_LOGIN_DAGE);
  const ingenGodkendt = udenFor(i.aktivitet.godkendt_rapport, TRAENGER_GODKENDT_DAGE);
  if (ingenLogin) maerker.push("ingen_login");
  if (ingenGodkendt) maerker.push("ingen_godkendt_rapport");
  if (ingenLogin || ingenGodkendt) maerker.push("traenger");
  const m = i.sessioner.morten.status, j = i.sessioner.jonas.status;
  if (m === "ikke_brugt" || m === "link_sendt" || (j === "ikke_brugt" && erNytMedlem(i.medlemSiden))) maerker.push("ingen_session_endnu");
  const ikkeIGang: IkkeIGangInput = { medlemSiden: i.medlemSiden, harMaaltRapport: i.harMaaltRapport, antalUploads: i.antalUploads };
  if (afgoerIkkeIGang(ikkeIGang, i.nu).signal) maerker.push("ikke_i_gang");
  return { maerker, vaegt: maerker.reduce((s, x) => s + MAERKE_VAEGT[x], 0) };
}

/** Til filtre: har virksomheden mærket? */
export function harMaerke(dom: OverbliksDom, m: Maerke): boolean {
  return dom.maerker.includes(m);
}

/** Til sortering: tungest først, derefter navn. */
export function sammenlignOverblik(a: { dom: OverbliksDom; navn: string }, b: { dom: OverbliksDom; navn: string }): number {
  return b.dom.vaegt - a.dom.vaegt || a.navn.localeCompare(b.navn, "da-DK");
}
