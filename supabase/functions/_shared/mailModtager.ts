/**
 * _shared/mailModtager.ts — må dette medlem få platformens mails? (15/9-2026)
 *
 * REN: ingen I/O. Importerer computeMembershipTier fra ./membershipTier.ts
 * (ingen kopi). Testet fra src/lib/__tests__/mailModtager.test.ts.
 *
 * UDLØBET-REGLEN — chattens beslutning 15/9 (ikke Jonas'), på Jonas' krav
 * «ingen platformsmails i forlængelsesvinduet» (DEL 2 «15. september» §14):
 * en notifikationsrække til en bruger, hvis virksomheder (company_members →
 * companies) ALLE har tier «expired» efter computeMembershipTier, stemples
 * uden mail med grund «udloebet». Én ikke-udløbet virksomhed er nok til at
 * få mail — samme EXISTS-form som har_aktivt_medlemskab (20260907141500:43-61).
 * En bruger uden company_members-række (rådgivere m.fl.) er uberørt af
 * reglen: en tom liste er IKKE udløbet. Reglen gælder ALLE typer køen
 * henter, også chat-samlingen, og afgøres FØR chat-grupperingen og
 * selectNotificationEmails (send-notification-email/index.ts).
 *
 * HVORFOR TIER OG IKKE STATUS: companies.status er 'active' | 'tidligere'
 * og sættes kun i hånden; adgangen styres af contract_end_date
 * (computeMembershipTier → expired → MembershipExpiredGate). Grænsen er
 * den samme som SQL-dommene: expired fra 00:00 UTC dagen efter slutdatoen
 * (CARMA STUDIO, slut 2026-09-11: 11/9 23:59:59Z full, 12/9 00:00:00Z
 * expired). no_date, full og subscriber er ikke udløbet.
 *
 * KOBLINGEN GÅR PÅ user_id → company_members: notifications.company_id er
 * ikke sat for event_*, community_* og chat_reply fra notify-chat-reply
 * (recon-koe-regel-og-vinduesmails.md §1), og en bruger kan være medlem af
 * flere virksomheder (company_members UNIQUE(company_id, user_id), ingen
 * UNIQUE på user_id). user_company_id er LIMIT 1 uden ORDER BY og bruges
 * derfor ikke her.
 */
import { computeMembershipTier, type MembershipTierInput } from "./membershipTier.ts";

/** De tre companies-kolonner dommen læser (send-report-reminder:293-295 henter de samme). */
export interface VirksomhedTilMail {
  contract_end_date: string | null;
  subscription_status: string | null;
  subscription_current_period_end: string | null;
}

/** Grunden i loggen og i tørkørslens svar — som køens øvrige disposeGrund. */
export const UDLOEBET_GRUND = "udloebet";

/** Sand KUN når listen ikke er tom og ALLE virksomheder er expired. Tom liste → false (ingen medlemskab = uberørt). */
export function erAlleVirksomhederUdloebet(virksomheder: readonly VirksomhedTilMail[], nu: Date): boolean {
  if (virksomheder.length === 0) return false;
  return virksomheder.every((v) => computeMembershipTier(v as MembershipTierInput, nu) === "expired");
}

export interface RaekkeTilMail {
  id: string;
  user_id: string;
}

export interface FordelUdloebneResultat {
  /** Rækker der stemples uden mail (grund «udloebet»). */
  udloebne: string[];
  /** Rækker der går videre i køen — herunder alle uden medlemskab. */
  resten: string[];
}

/**
 * Deler rækkerne i udløbne og resten. INVARIANT: hver række optræder præcis
 * ét sted (udloebne ∪ resten = alle, disjunkte). En bruger uden opslag i
 * `medlemskaber` (ingen company_members-række) er aldrig udløbet.
 */
export function fordelUdloebne(
  raekker: readonly RaekkeTilMail[],
  medlemskaber: ReadonlyMap<string, readonly VirksomhedTilMail[]>,
  nu: Date,
): FordelUdloebneResultat {
  const udloebne: string[] = [];
  const resten: string[] = [];
  const domPrBruger = new Map<string, boolean>();
  for (const r of raekker) {
    let udloebet = domPrBruger.get(r.user_id);
    if (udloebet === undefined) {
      udloebet = erAlleVirksomhederUdloebet(medlemskaber.get(r.user_id) ?? [], nu);
      domPrBruger.set(r.user_id, udloebet);
    }
    (udloebet ? udloebne : resten).push(r.id);
  }
  return { udloebne, resten };
}
