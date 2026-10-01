/**
 * src/lib/medlemsOverblik.ts — motoren bag forsidens «Mangler at booke»
 * (29/9-2026, #1122 → forenklet i #1129 → ryddet op 29/9).
 *
 * JONAS 29/9: «Jeg skal bare vide hvor mange der mangler.» Forsiden
 * (RaadgiverForsideView → ManglerAtBooke) viser «Morten-session: N» og
 * «Jonas-session: M» med navnene; linjerne bygges i
 * lib/hjemmebane/manglerAtBookeBlok.ts gennem manglerAtBooke her.
 *
 * OPRYDNINGEN 29/9 (statusmailen droppet — forsiden dækker behovet): aktiviteten
 * (ni felter, 30 dage), mærke-dommen (overbliksDom, MAERKE_VAEGT, FILTER_MAERKER,
 * MAERKE_ORD, harMaerke, sammenlignOverblik) og Deno-spejlet i _shared er
 * fjernet — de havde ingen bruger uden for prøver. byggOverblik læser nu kun
 * companies, company_members og session_bookings.
 *
 * MÅLT I PROD 29/9-2026 (Jonas' tal): Jonas-retten er sat i hånden for 23
 * virksomheder 13/9 kl. 20:50–20:54 UTC («det var mig») — de 23 er «ikke
 * omfattet», fordi Jonas-sessionen kun er en del af medlemskabet for NYE
 * medlemmer. Morten-retten står som brugt hos 12 uden en eneste
 * session_bookings-række (21/6–13/8) — årsagen er IKKE målt.
 *
 * GIT-MÅLING 29/9 (create-free-intro-booking, 21/6 →): functionen tog retten
 * ATOMISK FØRST, lavede Calendly-linket og indsatte DEREFTER rækken (status
 * «booking_sent») — og rullede retten tilbage, hvis link eller insert fejlede.
 * «Ret brugt uden række» kan derfor ikke komme af den normale vej; hvad det er
 * (hånden, en fejlet rollback, en slettet række), bærer rækken ikke — og
 * motoren påstår det ikke.
 *
 * HUSETS DOMME GENBRUGES: erAfholdt (lib/introSession — «afholdt» = booked OG
 * slut_tid passeret) og erKunde (lib/raadgiverensKunder).
 *
 * REN: ingen React, ingen Supabase. Tiden gives ind som `nu`. Prøvet i
 * __tests__/medlemsOverblik.test.ts og __tests__/manglerAtBookeUaendret.test.ts.
 */
import { erAfholdt } from "@/lib/introSession";
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

// ── Nyt medlem ───────────────────────────────────────────────────────────────

/** Er medlemmet nyt nok til, at Jonas-sessionen er en del af medlemskabet? Uden startdato: nej (fail-closed). */
export function erNytMedlem(medlemSiden: string | null | undefined): boolean {
  if (!medlemSiden) return false;
  const ms = Date.parse(medlemSiden);
  return Number.isFinite(ms) && ms >= Date.parse(IKKE_OMFATTET_FRA);
}

/**
 * Er Jonas-sessionen en del af medlemskabet? Nyt medlem (erNytMedlem) ELLER
 * tilbudt (companies.jonas_session_tilbudt_at sat, 1/10-2026). MÅLT 1/10:
 * ANLA GLAS A/S (medlem fra maj) fik fjernet «… brugt», men stod ikke under
 * «Mangler at booke» — porten var kun «nyt». Tilbuddet er rådgiverens
 * afkrydsning i EditCompanyDialog; et medlem kan ikke sætte det
 * (companies_medlem_kolonnevaern — kolonnen står ikke på hvidlisten).
 */
export function omfattetAfJonas(raekke: { medlemSiden: string | null | undefined; jonasTilbudtAt?: string | null }): boolean {
  return erNytMedlem(raekke.medlemSiden) || !!raekke.jonasTilbudtAt;
}

// ── Sammenkoblingen: fra rå rækker til én række pr. virksomhed ───────────────

/** Én virksomheds række — det, forsidens «Mangler at booke» læser. */
export interface OverbliksRaekke {
  companyId: string;
  /** companies.name — samme regel som /virksomheder (`name || ""`); tom, når kalderen ikke hentede navnet. */
  navn: string;
  /** Første company_members.created_at — «ny»-porten for Jonas-sessionen (erNytMedlem). */
  medlemSiden: string | null;
  /**
   * companies.jonas_session_tilbudt_at (1/10-2026, migration 20261001110000):
   * rådgiveren har TILBUDT et ældre medlem (fra før IKKE_OMFATTET_FRA) Jonas-
   * sessionen. Sat = sessionen tæller med i «Mangler at booke», som for et nyt.
   */
  jonasTilbudtAt: string | null;
  sessioner: { morten: SessionDom; jonas: SessionDom };
}

/**
 * De rå rækker, som de kommer fra tabellerne — KUN de kolonner, sammenkoblingen
 * læser. Hooken (src/hooks/medlemsOverblik.ts, rådgiverens RLS) henter dem;
 * filtret amount_dkk = 0 er hookens.
 */
export interface OverbliksKilder {
  companies: readonly { id: string; name?: string | null; status: string | null; is_legat: boolean | null; er_kunde: boolean | null; is_demo: boolean | null; intro_session_used_at: string | null; jonas_session_used_at: string | null; jonas_session_tilbudt_at: string | null }[];
  medlemmer: readonly { company_id: string; user_id: string; created_at: string | null }[];
  /** session_bookings med amount_dkk = 0 (de inkluderede) — alle rådgivere; fordeles her. */
  bookinger: readonly (SessionRaekke & { company_id: string | null; advisor: string })[];
}

/**
 * Universet — samme som /virksomheder: aktive/status-løse kunder, ikke legat,
 * IKKE demo. Demo-virksomheden (companies.is_demo, a0de0000-…) skjules for
 * rådgiveren af RESTRICTIVE-politikker (20260903230000), men IKKE for en admin
 * i browseren. Målt 29/9: status/is_legat/er_kunde udelukker den ikke, så
 * filtret står her.
 */
export function iUniverset(c: Pick<OverbliksKilder["companies"][number], "status" | "is_legat" | "er_kunde" | "is_demo">): boolean {
  if (c.is_demo === true) return false;
  if (c.is_legat) return false;
  if (!(c.status === "active" || !c.status)) return false;
  return erKunde(c);
}

/** Sammenkoblingen. Ren: rækker og `nu` ind, én række pr. virksomhed i universet ud. */
export function byggOverblik(k: OverbliksKilder, nu: Date): Map<string, OverbliksRaekke> {
  const medlemSidenByCompany = new Map<string, string>();
  for (const m of k.medlemmer) {
    if (!m.company_id || !m.user_id) continue;
    if (m.created_at && (!medlemSidenByCompany.has(m.company_id) || m.created_at < (medlemSidenByCompany.get(m.company_id) as string))) medlemSidenByCompany.set(m.company_id, m.created_at);
  }
  const bookingerByCompany = new Map<string, OverbliksKilder["bookinger"][number][]>();
  for (const b of k.bookinger) if (b.company_id) bookingerByCompany.set(b.company_id, [...(bookingerByCompany.get(b.company_id) ?? []), b]);

  const ud = new Map<string, OverbliksRaekke>();
  for (const c of k.companies) {
    if (!iUniverset(c)) continue;
    const rk = bookingerByCompany.get(c.id) ?? [];
    const sessioner = {
      morten: sessionStatus({ raadgiver: "morten", retAt: c.intro_session_used_at, raekker: rk.filter((b) => b.advisor === "morten"), nu }),
      jonas: sessionStatus({ raadgiver: "jonas", retAt: c.jonas_session_used_at, raekker: rk.filter((b) => b.advisor === "jonas"), nu }),
    };
    ud.set(c.id, { companyId: c.id, navn: c.name || "", medlemSiden: medlemSidenByCompany.get(c.id) ?? null, jonasTilbudtAt: c.jonas_session_tilbudt_at ?? null, sessioner });
  }
  return ud;
}

// ── Mangler at booke (29/9, forsiden) ────────────────────────────────────────

/**
 * JONAS 29/9: «Jeg skal bare vide hvor mange der mangler.» Én dom pr. rådgiver:
 *   morten mangler — sessionen er ikke_brugt, link_sendt eller aflyst.
 *   jonas mangler  — KUN for et nyt medlem (erNytMedlem) ELLER et ældre medlem,
 *                    som rådgiveren har tilbudt sessionen (jonasTilbudtAt sat —
 *                    Jonas 1/10 10:35: «ja tilbudt»), og sessionen er
 *                    ikke_brugt, link_sendt eller aflyst.
 *   booket, afholdt, markeret_uden_booking og ikke_omfattet = mangler ikke.
 * Forsidens blok tæller KUN gennem denne (værn: medlemsOverblikFlade.guard).
 */
export const MANGLER_STATUSSER: readonly SessionStatus[] = ["ikke_brugt", "link_sendt", "aflyst"];

export function manglerAtBooke(raekke: Pick<OverbliksRaekke, "sessioner" | "medlemSiden" | "jonasTilbudtAt">): { morten: boolean; jonas: boolean } {
  const mangler = (s: SessionStatus) => MANGLER_STATUSSER.includes(s);
  return {
    morten: mangler(raekke.sessioner.morten.status),
    jonas: omfattetAfJonas(raekke) && mangler(raekke.sessioner.jonas.status),
  };
}
