/**
 * src/lib/medlemsOverblik.ts — rådgiverens samlede overblik over medlemmerne,
 * KUN motoren (29/9-2026). FORENKLET 29/9 (Jonas: «Jeg skal bare vide hvor
 * mange der mangler»): kolonnerne og filtrene på /virksomheder er fjernet igen;
 * den eneste flade er forsidens «Mangler at booke» (manglerAtBooke nederst).
 * Statusmailen (Deno-spejlet) er sat på pause på en anden gren.
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
 *
 * SPEJLET i supabase/functions/_shared/medlemsOverblik.ts (29/9, statusmailen):
 * kroppen efter dette filhoved er ordret ens på nær import-linjerne
 * (`@/lib/x` her, `./x.ts` dér — edge functions kan ikke importere fra src,
 * og der er intet import map). Paritetsprøven __tests__/medlemsOverblik.paritet
 * normaliserer KUN import-linjerne og sammenligner resten tegn for tegn.
 * De tre importerede domme er spejlet på samme måde (introSession, sidstOnline,
 * raadgiverensKunder — uden imports; ikkeIGang havde sit spejl i forvejen).
 *
 * ÉN SAMMENKOBLING (29/9): byggOverblik nederst er DEN join, hooken og
 * statusmailens function deler — fra rå rækker til én OverbliksRaekke pr.
 * virksomhed. Hooken henter kun; functionen henter kun; begge kalder den.
 */
import { erAfholdt } from "@/lib/introSession";
import { dageSiden, senesteAf } from "@/lib/sidstOnline";
import { afgoerIkkeIGang, type IkkeIGangInput } from "@/lib/ikkeIGang";
import { erKunde } from "@/lib/raadgiverensKunder";

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

// ── Ordene for mærkerne — ÉN kilde (fladen og statusmailen læser her) ────────

/** De fire filtre, i rækkefølge — Jonas' fire. */
export const FILTER_MAERKER: readonly Maerke[] = ["traenger", "ingen_session_endnu", "ikke_i_gang", "ingen_bruger"];

/** Mærkernes ord. lib/hjemmebane/overblikOrd re-eksporterer dem; statusMail.ts læser dem gennem spejlet. Ingen tredje kopi. */
export const MAERKE_ORD: Readonly<Record<Maerke, string>> = {
  traenger: "Trænger",
  ingen_session_endnu: "Ingen session endnu",
  ikke_i_gang: "Ikke i gang",
  ingen_bruger: "Ingen bruger",
  ingen_login: "Ingen login i 30 dage",
  ingen_godkendt_rapport: "Ingen godkendt rapport i 60 dage",
};

// ── Sammenkoblingen: fra rå rækker til én række pr. virksomhed ───────────────

/** Én virksomheds overblik — det, fladen og statusmailen tegner. */
export interface OverbliksRaekke {
  companyId: string;
  /** companies.name — samme regel som /virksomheder (`name || ""`); tom, når kalderen ikke hentede navnet. */
  navn: string;
  antalBrugere: number;
  medlemSiden: string | null;
  sessioner: { morten: SessionDom; jonas: SessionDom };
  aktivitet: Record<AktivitetsFelt, Aktivitet>;
  dom: OverbliksDom;
}

/**
 * De rå rækker, som de kommer fra tabellerne — KUN de kolonner, sammenkoblingen
 * læser. Hooken (rådgiverens RLS) og functionen (service role) henter dem hver
 * for sig og giver dem hertil; filtre i forespørgslen (amount_dkk 0, deleted_at
 * null, uden sentinel) er kalderens, og de skal være ens (hooks/medlemsOverblik.ts).
 */
export interface OverbliksKilder {
  companies: readonly { id: string; name?: string | null; status: string | null; is_legat: boolean | null; er_kunde: boolean | null; is_demo: boolean | null; intro_session_used_at: string | null; jonas_session_used_at: string | null }[];
  medlemmer: readonly { company_id: string; user_id: string; created_at: string | null }[];
  /** session_bookings med amount_dkk = 0 (de inkluderede) — alle rådgivere; fordeles her. */
  bookinger: readonly (SessionRaekke & { company_id: string | null; advisor: string })[];
  /** user_login_log — det NYESTE pr. bruger er nok, men flere rækker pr. bruger skader ikke (senesteAf). */
  logins: readonly { user_id: string; logged_in_at: string }[];
  facts: readonly { company_id: string; committed_at: string | null; data_basis: string | null }[];
  /** financial_reports uden slettede og uden sentinel-rækker (kalderens filter). */
  uploads: readonly { company_id: string | null; uploaded_at: string | null }[];
  refleksioner: readonly { company_id: string; created_at: string }[];
  samtaler: readonly { company_id: string | null; last_member_message_at: string | null }[];
  events: readonly { user_id: string; registered_at: string; response: string | null; cancelled_at: string | null }[];
  progress: readonly { user_id: string; updated_at: string }[];
  traade: readonly { forfatter_id: string; created_at: string }[];
  svar: readonly { forfatter_id: string; created_at: string }[];
  reaktioner: readonly { bruger_id: string; created_at: string }[];
  maal: readonly { company_id: string; created_at: string; progress_updated_at: string | null; completed_at: string | null }[];
}

/**
 * Universet — samme som /virksomheder: aktive/status-løse kunder, ikke legat,
 * IKKE demo. Demo-virksomheden (companies.is_demo, a0de0000-…) skjules for
 * rådgiveren af RESTRICTIVE-politikker (20260903230000), men IKKE for service
 * role — og heller ikke for en admin i browseren. Målt 29/9: status/is_legat/
 * er_kunde udelukker den ikke, så filtret står her, ens for hook og function.
 */
export function iUniverset(c: Pick<OverbliksKilder["companies"][number], "status" | "is_legat" | "er_kunde" | "is_demo">): boolean {
  if (c.is_demo === true) return false;
  if (c.is_legat) return false;
  if (!(c.status === "active" || !c.status)) return false;
  return erKunde(c);
}

/** Sammenkoblingen. Ren: rækker og `nu` ind, én række pr. virksomhed i universet ud. */
export function byggOverblik(k: OverbliksKilder, nu: Date): Map<string, OverbliksRaekke> {
  // Bruger → virksomhed (akademi, events, community, logins har intet company_id).
  const brugereByCompany = new Map<string, string[]>();
  const companyByUser = new Map<string, string[]>();
  const medlemSidenByCompany = new Map<string, string>();
  for (const m of k.medlemmer) {
    if (!m.company_id || !m.user_id) continue;
    brugereByCompany.set(m.company_id, [...(brugereByCompany.get(m.company_id) ?? []), m.user_id]);
    companyByUser.set(m.user_id, [...(companyByUser.get(m.user_id) ?? []), m.company_id]);
    if (m.created_at && (!medlemSidenByCompany.has(m.company_id) || m.created_at < (medlemSidenByCompany.get(m.company_id) as string))) medlemSidenByCompany.set(m.company_id, m.created_at);
  }
  const loginByUser = new Map<string, string>();
  for (const l of k.logins) {
    if (!l.user_id || !l.logged_in_at) continue;
    loginByUser.set(l.user_id, senesteAf([loginByUser.get(l.user_id), l.logged_in_at]) as string);
  }

  const laeg = (kort: Map<string, string[]>, id: string | null | undefined, stempel: string | null | undefined) => {
    if (!id || !stempel) return;
    kort.set(id, [...(kort.get(id) ?? []), stempel]);
  };
  const prBruger = (kort: Map<string, string[]>, userId: string | null | undefined, stempel: string | null | undefined) => {
    for (const cid of companyByUser.get(userId ?? "") ?? []) laeg(kort, cid, stempel);
  };
  const godkendt = new Map<string, string[]>(), uploadet = new Map<string, string[]>(), refl = new Map<string, string[]>(), besked = new Map<string, string[]>(),
    eventer = new Map<string, string[]>(), akademi = new Map<string, string[]>(), community = new Map<string, string[]>(), maalRoert = new Map<string, string[]>();
  const maaltByCompany = new Set<string>();
  const uploadsByCompany = new Map<string, number>();
  for (const f of k.facts) { laeg(godkendt, f.company_id, f.committed_at); if (f.data_basis === "measured") maaltByCompany.add(f.company_id); }
  for (const u of k.uploads) { laeg(uploadet, u.company_id, u.uploaded_at); if (u.company_id) uploadsByCompany.set(u.company_id, (uploadsByCompany.get(u.company_id) ?? 0) + 1); }
  for (const r of k.refleksioner) laeg(refl, r.company_id, r.created_at);
  for (const s of k.samtaler) laeg(besked, s.company_id, s.last_member_message_at);
  for (const e of k.events) if (e.response === "attending" && !e.cancelled_at) prBruger(eventer, e.user_id, e.registered_at);
  for (const p of k.progress) prBruger(akademi, p.user_id, p.updated_at);
  for (const t of k.traade) prBruger(community, t.forfatter_id, t.created_at);
  for (const s of k.svar) prBruger(community, s.forfatter_id, s.created_at);
  for (const r of k.reaktioner) prBruger(community, r.bruger_id, r.created_at);
  for (const m of k.maal) { laeg(maalRoert, m.company_id, m.created_at); laeg(maalRoert, m.company_id, m.progress_updated_at); laeg(maalRoert, m.company_id, m.completed_at); }
  const bookingerByCompany = new Map<string, OverbliksKilder["bookinger"][number][]>();
  for (const b of k.bookinger) if (b.company_id) bookingerByCompany.set(b.company_id, [...(bookingerByCompany.get(b.company_id) ?? []), b]);

  const ud = new Map<string, OverbliksRaekke>();
  for (const c of k.companies) {
    if (!iUniverset(c)) continue;
    const brugere = brugereByCompany.get(c.id) ?? [];
    const rk = bookingerByCompany.get(c.id) ?? [];
    const input: AktivitetsInput = {
      login: brugere.map((u) => loginByUser.get(u)).filter((x): x is string => !!x),
      godkendt_rapport: godkendt.get(c.id) ?? [],
      uploadet_rapport: uploadet.get(c.id) ?? [],
      refleksion: refl.get(c.id) ?? [],
      medlemsbesked: besked.get(c.id) ?? [],
      event_tilmelding: eventer.get(c.id) ?? [],
      akademi: akademi.get(c.id) ?? [],
      community: community.get(c.id) ?? [],
      maal: maalRoert.get(c.id) ?? [],
    };
    const aktivitet = aktiviteterAf(input, nu);
    const sessioner = {
      morten: sessionStatus({ raadgiver: "morten", retAt: c.intro_session_used_at, raekker: rk.filter((b) => b.advisor === "morten"), nu }),
      jonas: sessionStatus({ raadgiver: "jonas", retAt: c.jonas_session_used_at, raekker: rk.filter((b) => b.advisor === "jonas"), nu }),
    };
    const medlemSiden = medlemSidenByCompany.get(c.id) ?? null;
    const dom = overbliksDom({
      nu, antalBrugere: brugere.length, medlemSiden, sessioner, aktivitet,
      harMaaltRapport: maaltByCompany.has(c.id), antalUploads: uploadsByCompany.get(c.id) ?? 0,
    });
    ud.set(c.id, { companyId: c.id, navn: c.name || "", antalBrugere: brugere.length, medlemSiden, sessioner, aktivitet, dom });
  }
  return ud;
}

// ── Mangler at booke (29/9, forsiden) ────────────────────────────────────────

/**
 * JONAS 29/9: «Jeg skal bare vide hvor mange der mangler.» Én dom pr. rådgiver:
 *   morten mangler — sessionen er ikke_brugt, link_sendt eller aflyst.
 *   jonas mangler  — KUN for et nyt medlem (erNytMedlem), og sessionen er
 *                    ikke_brugt, link_sendt eller aflyst.
 *   booket, afholdt, markeret_uden_booking og ikke_omfattet = mangler ikke.
 * Forsidens blok tæller KUN gennem denne (værn: medlemsOverblikFlade.guard).
 */
export const MANGLER_STATUSSER: readonly SessionStatus[] = ["ikke_brugt", "link_sendt", "aflyst"];

export function manglerAtBooke(raekke: Pick<OverbliksRaekke, "sessioner" | "medlemSiden">): { morten: boolean; jonas: boolean } {
  const mangler = (s: SessionStatus) => MANGLER_STATUSSER.includes(s);
  return {
    morten: mangler(raekke.sessioner.morten.status),
    jonas: erNytMedlem(raekke.medlemSiden) && mangler(raekke.sessioner.jonas.status),
  };
}
