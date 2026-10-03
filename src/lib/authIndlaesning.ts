import { computeMembershipTier } from "@/lib/membershipTier";

/** Rene domme bag useAuth's indlæsning (29/9, analyse-hastighed.md #1–#3).
    Hooken henter og sætter state; HVAD der skal hentes, HVORNÅR, og hvad
    et svar betyder, afgøres her — så det kan prøves uden React og uden net.

    Tre ting blev ændret i useAuth, og hver har sin dom her:
    1. Medlemmets login var fire rundture i serie (roller/profil/medlemskab →
       legat → tier → onboarding-flag). Nu er det ÉN: legat hentes i samme
       Promise.all, og virksomhedens tier- og onboarding-felter kommer med i
       joinet på company_members. `tierFraVirksomhed` og
       `skalStarteOnboardingAgent` er beregning på det allerede hentede.
    2. process-pending-invitation (PPI) kunne holde rådgiverens forside
       tilbage i ubestemt tid. Nu kappes ventetiden af `medTimeout`.
    3. Hver auth-hændelse med session (også SIGNED_IN ved hvert faneskift
       og TOKEN_REFRESHED) genhentede alt og loggede et nyt login. Nu afgør
       `skalHenteBrugerdata` og `skalLoggeLogin` det ud fra bruger-id'et. */

/** Felterne fra `companies`, som indlæsningen læser — i joinet på
    company_members (bred forespørgsel) eller i det gamle enkeltopslag. */
export interface VirksomhedsFelter {
  contract_end_date?: string | null;
  subscription_status?: string | null;
  subscription_current_period_end?: string | null;
  onboarding_completed?: boolean | null;
  application_context?: unknown;
}

/** Medlemmets tier ud fra virksomhedens kontraktdatoer og abonnement.
    Ingen række (RLS/mangler) og no_date giver begge "full" — ordret den
    regel, afgoerMedlemsTier havde (legacy eller manuelt styrede
    virksomheder ser ud som fulde for deres egne brugere). */
export function tierFraVirksomhed(
  virksomhed: VirksomhedsFelter | null | undefined,
): "full" | "subscriber" | "expired" {
  if (!virksomhed) return "full";
  const tier = computeMembershipTier({
    contract_end_date: virksomhed.contract_end_date ?? null,
    subscription_status: virksomhed.subscription_status ?? null,
    subscription_current_period_end: virksomhed.subscription_current_period_end ?? null,
  });
  return tier === "no_date" ? "full" : tier;
}

/** Onboarding-agenten startes for en importeret virksomheds første login:
    onboarding_completed er EKSPLICIT false (ikke null/ukendt), og der er
    en application_context at arbejde ud fra. Ordret betingelsen fra før. */
export function skalStarteOnboardingAgent(virksomhed: VirksomhedsFelter | null | undefined): boolean {
  return virksomhed?.onboarding_completed === false && !!virksomhed?.application_context;
}

/** Hvor langt brugerdata-hentningen er for den aktuelle session. */
export interface HentningsTilstand {
  /** Bruger-id, hvis data er hentet FÆRDIGT og uden fejl. */
  hentetFor: string | null;
  /** Bruger-id, hvis en hentning kører lige nu. */
  igangFor: string | null;
}

/** Skal brugerdata hentes for `nyBrugerId`? Kun når de ikke allerede er
    hentet for den bruger, og ingen hentning for den bruger kører.
    - Faneskift (SIGNED_IN), TOKEN_REFRESHED, USER_UPDATED for SAMME bruger:
      nej — roller, virksomhed og tier skifter ikke med tokenet.
    - Ny bruger (login, eller en anden konto via en anden fane): ja.
    - En hentning, der fejlede (kastede, eller koblingen til virksomheden
      fejlede), sætter IKKE `hentetFor` — så næste hændelse prøver igen,
      som faneskiftet gjorde før. */
export function skalHenteBrugerdata(tilstand: HentningsTilstand, nyBrugerId: string): boolean {
  return tilstand.hentetFor !== nyBrugerId && tilstand.igangFor !== nyBrugerId;
}

/** Skal hændelsen logges som et login (log_user_login)? Kun et SIGNED_IN,
    hvor handleren SIDST så en anden bruger eller ingen session — altså
    overgangen til en ny session. Et SIGNED_IN ved faneskift, fra en anden
    fane eller ved kodeordsskift for samme bruger er ikke et nyt login. */
export function skalLoggeLogin(
  haendelse: string,
  forrigeBrugerId: string | null,
  nyBrugerId: string,
): boolean {
  return haendelse === "SIGNED_IN" && forrigeBrugerId !== nyBrugerId;
}

/** Skal process-pending-invitation (PPI) kaldes? (3/10-2026, pakke D,
    «Hastighed, første skive».) Målt i prod 3/10: PPI tog 1,49 s på
    rådgiverens forside og svarede næsten altid «no_pending_invitation»;
    3 rådgivere/admins i alt, 0 med en afventende company_invitations-række.
    - Rollen ukendt (roller-opslaget fejlede): KALD — fail-safe, som før.
    - Medlem (ikke rådgiver): KALD — PPI er medlemmets kobling til
      virksomheden. Medlemsstien er uændret.
    - KENDT rådgiver/admin: KALD ALDRIG, uanset invite_token. PPI kan koble
      kontoen på en virksomhed, og huset forbyder at koble en rådgiver/admin
      på en virksomhed (attach-user-to-company/index.ts:66-87). PPI's
      e-mail-fallback og token-sti kører derfor ikke for rådgivere. */
export function skalKaldePendingInvitation(input: {
  rolleKendt: boolean;
  erRaadgiver: boolean;
}): boolean {
  if (!input.rolleKendt) return true;
  return !input.erRaadgiver;
}

/** Hvor længe forsiden venter på process-pending-invitation.
    - Rådgiveren kalder aldrig PPI (skalKaldePendingInvitation), så der er
      ingen rådgiver-timeout.
    - Medlemmet uden virksomhed (og en konto med ukendt rolle): 12 s. Her ER PPI koblingen (det nye
      medlems første login, evt. med koldstart), og en timeout viser
      CompanyLinkFailedGate. PPI kører videre på serveren; gatens «Prøv
      igen» genindlæser, og så findes company_members-rækken. */
export const PPI_TIMEOUT_MEDLEM_MS = 12_000;

export type MedTimeoutUdfald<T> = { udfald: "svar"; vaerdi: T } | { udfald: "timeout" };

/** Venter på `loefte` i højst `ms`. Afviser løftet, afvises dette også
    (kalderen har allerede sin catch). Løftet afbrydes ikke — kaldet kører
    færdigt i baggrunden; kun ventetiden kappes. Timeren ryddes, når
    løftet når først, så den ikke hænger. */
export function medTimeout<T>(loefte: Promise<T>, ms: number): Promise<MedTimeoutUdfald<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<MedTimeoutUdfald<T>>((resolve) => {
    timer = setTimeout(() => resolve({ udfald: "timeout" }), ms);
  });
  const svar = loefte.then((vaerdi): MedTimeoutUdfald<T> => ({ udfald: "svar", vaerdi }));
  return Promise.race([svar, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
