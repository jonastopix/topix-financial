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
 *   «Bevægelse»   dage siden seneste MENNESKELIGE bevægelse på et AKTIVT mål
 *                 (koordinatoren 1/10: agenten og ugens fokus opretter forslag
 *                 selv — talte de med, så en virksomhed levende ud, uden at
 *                 nogen havde rørt målet):
 *                   max( milestones.progress_updated_at,
 *                        company_actions.closed_at  for skridt under målet
 *                          med status done · not_done · dropped (LUKKET_AF_MENNESKE),
 *                        company_actions.created_at for skridt under målet
 *                          med status active · done · not_done · dropped
 *                          (TAGET_AF_MENNESKE — tilføjet eller taget) )
 *                 Forslag (proposed), dismissed og expired tæller IKKE.
 *                 Over alle virksomhedens aktive mål. Ingen aktive mål →
 *                 null («—»). Aktive mål uden noget tidspunkt → null («—»).
 *                 Dagene regnes på DANSK kalenderdag (dagsdatoDansk): et
 *                 tidspunkt 23:30 dansk i går er «1 dag», ikke «i dag»,
 *                 også når UTC-datoen er den samme.
 *                 Regnestykket: dage = (dansk dato(nu) − dansk dato(seneste))
 *                 i hele kalenderdage, UTC-aritmetik på de rene datoer, så
 *                 ingen sommertid skrider. Et tidspunkt i fremtiden (ur-skred)
 *                 tæller som 0.
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
}

export interface EngagementSkridtRaekke {
  maal_id: string | null;
  /** company_actions.status — afgør, om tidspunkterne er et menneskes. */
  status: string | null;
  closed_at: string | null;
  created_at: string | null;
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
/** Skridt, et menneske har tilføjet eller taget: created_at er bevægelse.
    proposed (agentens/ugens fokus' forslag), dismissed og expired er det ikke. */
export const TAGET_AF_MENNESKE: readonly string[] = ["active", "done", "not_done", "dropped"];

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
  }
  for (const s of skridt) {
    if (!s.maal_id || !aktiveIds.has(s.maal_id)) continue;
    const status = s.status ?? "";
    if (LUKKET_AF_MENNESKE.includes(status)) seneste = senere(seneste, s.closed_at);
    if (TAGET_AF_MENNESKE.includes(status)) seneste = senere(seneste, s.created_at);
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

/** «i dag» · «1 dag» · «N dage» · «—». */
export function bevaegelseTekst(dage: number | null): string {
  if (dage === null) return "—";
  if (dage === 0) return "i dag";
  return dage === 1 ? "1 dag" : `${dage} dage`;
}

/** Den rolige linje, når målene ikke kunne hentes (kolonnerne står da med «—»). */
export const MAAL_HENTEFEJL_TEKST = "Målene kunne ikke hentes lige nu — «Aktive mål» og «Bevægelse» står med «—».";
