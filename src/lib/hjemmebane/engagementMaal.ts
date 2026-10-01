/**
 * src/lib/hjemmebane/engagementMaal.ts — målene på rådgivernes /engagement
 * (1/10-2026; designpapiret om «Dine mål», Jonas 1/10: målene er «et vigtigt
 * fundament for hele arbejdet over 12 mdr»). Ren dom, testet i
 * __tests__/engagementMaal.test.ts; hentningen bor i hooks/trofaeer.ts
 * (hentEngagement, samme batch som resten).
 *
 * To kolonner pr. virksomhed:
 *   «Aktive mål»  antallet mål, som afgoerMilepael(...).aktiv kalder aktive —
 *                 samme regel som «Din plan» (planen.ts): hverken parkeret
 *                 eller markeret nået. Ikke status-kolonnen alene (status
 *                 null er også aktiv). Tallet er det TÆLLEDE, ikke klemt til
 *                 3: en virksomhed med flere end tre står med sit rigtige tal
 *                 (gennemgangen, maal.ts gennemgangVenter).
 *   «Sidst rørt»  (kolonnenøglen hedder stadig «bevaegelse») dage siden
 *                 seneste MENNESKELIGE bevægelse på et AKTIVT mål
 *                 (koordinatoren 1/10: agenten og ugens fokus opretter forslag
 *                 selv — talte de med, så en virksomhed levende ud, uden at
 *                 nogen havde rørt målet; tekniske råd 1/10 R1: et TAGET
 *                 forslag talte på agentens created_at — nu menneskets
 *                 accepted_at):
 *                   max( milestones.progress_updated_at,
 *                        milestones.created_at (R2: et nyt mål er rørt),
 *                        company_actions.accepted_at, når sat
 *                          (opgave-accepter/index.ts:144: forslag → active; skridt-tilfoej
 *                          sætter den ved oprettelsen —
 *                          supabase/functions/skridt-tilfoej/index.ts:188),
 *                        company_actions.closed_at  for skridt med status
 *                          done · not_done · dropped (LUKKET_AF_MENNESKE —
 *                          expired lukkes af forfalds-cronen, ikke et menneske),
 *                        company_actions.created_at KUN når accepted_at er
 *                          null OG status ∈ STATUSSER_I_HENTNINGEN (dvs. ikke
 *                          proposed/dismissed) OG source_type = 'manual'
 *                          (MEDLEMMETS_KILDE) )
 *                 Valget af created_at-reglen (R1): der findes INTET felt, der
 *                 sikkert skiller medlemmets egne skridt fra forslag ud over
 *                 source_type — proposed_by er kalderen i skridt-tilfoej
 *                 (index.ts:187), men også rådgiverens id i foreslaa-opgave
 *                 (index.ts:223, source_type 'advisor', status 'proposed'), og
 *                 NULL for agent/ugens fokus (migration 20260822220000:64).
 *                 source_type 'manual' er medlemmets egen vej
 *                 (skridt-tilfoej/index.ts:36-38 og :184; constrainten
 *                 20260822220000:29), mens agent (run-company-agent:718-719),
 *                 ugens fokus (generate-weekly-focus: 'ai_weekly', 'proposed')
 *                 og rådgiveren altid skriver 'proposed'. Da skridt-tilfoej
 *                 også sætter accepted_at = nu, er created_at-grenen kun for
 *                 ældre 'manual'-rækker uden accepted_at (den gamle
 *                 Milestones-side).
 *                 Forslag (proposed), dismissed og en udløbet rækkes closed_at
 *                 tæller IKKE.
 *                 Over alle virksomhedens aktive mål. Ingen aktive mål →
 *                 null («—»). Aktive mål uden noget tidspunkt → null («—»),
 *                 men SORTERES som de mest stagnerede (bevaegelseSorteringsnoegle).
 *                 Dagene regnes på DANSK kalenderdag (dagsdatoDansk): et
 *                 tidspunkt 23:30 dansk i går er «for 1 dag siden», ikke
 *                 «i dag», også når UTC-datoen er den samme.
 *                 Regnestykket: dage = (dansk dato(nu) − dansk dato(seneste))
 *                 i hele kalenderdage, UTC-aritmetik på de rene datoer, så
 *                 ingen sommertid skrider. Et tidspunkt i fremtiden (ur-skred)
 *                 tæller som 0.
 *
 * HENTNINGEN (B3/B4, hooks/trofaeer.ts:hentMaalGrundlag): company_actions
 * kun med status ∈ STATUSSER_I_HENTNINGEN; milestones kun for universets
 * virksomheder (company_id IN ids i bidder á MAAL_ID_BID) — IKKE et filter
 * på status ≠ completed/parked: PostgREST's not.in giver NULL NOT IN (...) =
 * NULL, så mål med status null (aktive, afgoerMilepael) ville falde ud. En
 * tom læsning (kundevirksomheder, men 0 målrækker og ingen fejl) er en
 * hentefejl, ikke «0» (tomMaalLaesning).
 *
 * ADGANG (målt i prod 1/10-2026): rådgiverens SELECT på milestones og
 * company_actions for alle virksomheder går gennem has_role(advisor).
 * Fejler hentningen alligevel, er siden fail-soft (hooks/trofaeer.ts).
 */
import { afgoerMilepael } from "@/lib/milepaelDom";
import { dagsdatoDansk } from "@/lib/hjemmebane/skridtForslag";

export interface EngagementMaalRaekke {
  id: string;
  company_id: string;
  status: string | null;
  progress: number | null;
  deadline: string | null;
  progress_updated_at: string | null;
  /** R2: et nyt mål er en bevægelse. */
  created_at: string | null;
}

export interface EngagementSkridtRaekke {
  maal_id: string | null;
  /** company_actions.status — afgør, om tidspunkterne er et menneskes. */
  status: string | null;
  /** Menneskets accept (opgave-accepter) eller oprettelse (skridt-tilfoej). */
  accepted_at: string | null;
  closed_at: string | null;
  created_at: string | null;
  /** 'manual' = medlemmets egen vej; alt andet er et forslag fra agent/ugens fokus/rådgiver. */
  source_type: string | null;
}

export interface EngagementMaalDom {
  /** Antal aktive mål (afgoerMilepael(...).aktiv). */
  aktive: number;
  /** Seneste bevægelse på et aktivt mål (ISO), null uden. */
  senesteBevaegelse: string | null;
  /** Hele danske kalenderdage siden senesteBevaegelse; null uden. */
  dageSidenBevaegelse: number | null;
}

/** Skridt, et menneske har lukket: closed_at er bevægelse. */
export const LUKKET_AF_MENNESKE: readonly string[] = ["done", "not_done", "dropped"];
/** De statusser, dommen kan bruge — og PRÆCIS dem, hentningen beder om (B3).
    expired er med for accepted_at (en accepteret opgave, forfalds-cronen
    lod udløbe — opgaveEngine.ts antalUdloebneForslag); proposed og
    dismissed har aldrig et menneskes tidspunkt her. */
export const STATUSSER_I_HENTNINGEN: readonly string[] = ["active", "done", "not_done", "dropped", "expired"];
/** source_type for medlemmets egne skridt (skridt-tilfoej/index.ts:184). */
export const MEDLEMMETS_KILDE = "manual";
/** Bidstørrelse for company_id IN (...) — URL-længden (budgetEngine.ts sletPaaId). */
export const MAAL_ID_BID = 200;
/** Kilden i maalHentefejl, når læsningen var tom uden fejl (B4). */
export const TOM_MAAL_LAESNING = "milestones_tom";

const MS_PER_DOEGN = 86_400_000;

function datoMs(dato: string): number {
  const [y, m, d] = dato.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Hele danske kalenderdage fra `tidspunkt` til `nu`; aldrig negativ. */
export function danskeDageSiden(tidspunkt: string, nu: Date): number | null {
  const t = new Date(tidspunkt);
  if (Number.isNaN(t.getTime())) return null;
  const dage = Math.round((datoMs(dagsdatoDansk(nu)) - datoMs(dagsdatoDansk(t))) / MS_PER_DOEGN);
  return Math.max(0, dage);
}

function senere(a: string | null, b: string | null | undefined): string | null {
  if (!b || Number.isNaN(Date.parse(b))) return a;
  if (a === null || Date.parse(b) > Date.parse(a)) return b;
  return a;
}

/** Et skridts menneskelige tidspunkter (R1, reglen i filhovedet). */
export function menneskeligeTidspunkter(s: EngagementSkridtRaekke): string[] {
  const status = s.status ?? "";
  if (!STATUSSER_I_HENTNINGEN.includes(status)) return [];
  const ud: string[] = [];
  if (s.accepted_at) ud.push(s.accepted_at);
  if (LUKKET_AF_MENNESKE.includes(status) && s.closed_at) ud.push(s.closed_at);
  if (!s.accepted_at && s.source_type === MEDLEMMETS_KILDE && s.created_at) ud.push(s.created_at);
  return ud;
}

/** Én virksomheds mål og skridt → kolonnerne. Skridt uden for virksomhedens aktive mål ignoreres. */
export function engagementMaalDom(
  maal: readonly EngagementMaalRaekke[],
  skridt: readonly EngagementSkridtRaekke[],
  nu: Date,
): EngagementMaalDom {
  const aktiveIds = new Set<string>();
  let seneste: string | null = null;
  for (const m of maal) {
    if (!afgoerMilepael(m, nu).aktiv) continue;
    aktiveIds.add(m.id);
    seneste = senere(seneste, m.progress_updated_at);
    seneste = senere(seneste, m.created_at);
  }
  for (const s of skridt) {
    if (!s.maal_id || !aktiveIds.has(s.maal_id)) continue;
    for (const t of menneskeligeTidspunkter(s)) seneste = senere(seneste, t);
  }
  if (aktiveIds.size === 0) return { aktive: 0, senesteBevaegelse: null, dageSidenBevaegelse: null };
  return { aktive: aktiveIds.size, senesteBevaegelse: seneste, dageSidenBevaegelse: seneste ? danskeDageSiden(seneste, nu) : null };
}

/** Alle virksomheders mål og skridt (ét batch) → dom pr. virksomhed. Skridt kobles gennem målets id. */
export function engagementMaalPrVirksomhed(
  maal: readonly EngagementMaalRaekke[],
  skridt: readonly EngagementSkridtRaekke[],
  nu: Date,
): Map<string, EngagementMaalDom> {
  const maalPr = new Map<string, EngagementMaalRaekke[]>();
  const virksomhedAfMaal = new Map<string, string>();
  for (const m of maal) {
    virksomhedAfMaal.set(m.id, m.company_id);
    const l = maalPr.get(m.company_id);
    if (l) l.push(m);
    else maalPr.set(m.company_id, [m]);
  }
  const skridtPr = new Map<string, EngagementSkridtRaekke[]>();
  for (const s of skridt) {
    const c = s.maal_id ? virksomhedAfMaal.get(s.maal_id) : undefined;
    if (!c) continue;
    const l = skridtPr.get(c);
    if (l) l.push(s);
    else skridtPr.set(c, [s]);
  }
  const ud = new Map<string, EngagementMaalDom>();
  for (const [c, egne] of maalPr) ud.set(c, engagementMaalDom(egne, skridtPr.get(c) ?? [], nu));
  return ud;
}

/** Virksomhed uden en eneste målrække: 0 aktive, ingen bevægelse. */
export const INGEN_MAAL: EngagementMaalDom = { aktive: 0, senesteBevaegelse: null, dageSidenBevaegelse: null };

/** «i dag» · «for 1 dag siden» · «for N dage siden» · «—» (K8). */
export function bevaegelseTekst(dage: number | null): string {
  if (dage === null) return "—";
  if (dage === 0) return "i dag";
  return dage === 1 ? "for 1 dag siden" : `for ${dage} dage siden`;
}

/** Sorteringsnøglen for «Sidst rørt» (B5). null = står ALTID nederst, uanset
    retning (ingen aktive mål, eller målene kunne ikke hentes). Aktive mål
    uden registreret bevægelse = +∞: de mest stagnerede, øverst ved faldende. */
export function bevaegelseSorteringsnoegle(dom: EngagementMaalDom | null): number | null {
  if (!dom || dom.aktive === 0) return null;
  return dom.dageSidenBevaegelse ?? Number.POSITIVE_INFINITY;
}

/** B4: kundevirksomheder, men 0 målrækker i alt og ingen fejl, er en tom
    læsning (fx RLS), ikke «0 aktive mål». */
export function tomMaalLaesning(antalVirksomheder: number, antalMaalRaekker: number): boolean {
  return antalVirksomheder > 0 && antalMaalRaekker === 0;
}

/** Den rolige linje, når målene ikke kunne hentes (kolonnerne står da med «—»). */
export const MAAL_HENTEFEJL_TEKST = "Målene kunne ikke hentes lige nu — «Aktive mål» og «Sidst rørt» står med «—».";
