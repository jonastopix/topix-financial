/**
 * src/lib/pulsen.ts
 *
 * PULSEN — fire tal for hele porteføljen i forsidens højre spalte (Jonas
 * 8/9): rapporterer, svarer på forslag, tavse, fornyelser der venter. Ren
 * funktion, testet (src/lib/__tests__/pulsen.test.ts). Kalderen er
 * hentAdvisorDashboard, som allerede har alt undtagen svarene.
 *
 * INGEN RPC (besluttet 9/9): tre af de fire tal regnes af det forsiden
 * allerede henter, og det fjerde af ét lille kald. En SECURITY DEFINER-
 * funktion ville lægge en FJERDE kopi af «tavshed» i databasen ved siden af
 * motorens — præcis den fejl dagen gik med at rette (milepælene havde seks
 * domme, forsiden og listen hver sin). Derfor: dommens data ind, fire tal ud.
 *
 * TALLENE KOMMER FRA MOTORERNE — ikke herfra:
 *   tavse        = virksomheder med et signal i køen `ikke_hoert_fra_laenge`
 *                  (virksomhedsSignaler.afgoerVirksomhedsSignaler: «aldrig
 *                  skrevet», eller mere end STALE_DAGE = 21 hele dage siden
 *                  conversations.last_message_at). Jonas bad 8/9 om «over
 *                  tredive dage»; motoren siger 21, og forsidens linjer
 *                  bruger den. Pulsen SKAL sige det samme som linjerne, så
 *                  tærsklen er motorens. Ændres den, ændres den dér — ét sted.
 *   fornyelser   = virksomheder hvis fornyelsestilstand (lib/fornyelse) er en
 *                  af forsidensDom.FORNYELSE_VENTER_STATUSSER — samme mængde
 *                  som dommens «N fornyelser venter på dig».
 *   rapporterer  = virksomheder med en MÅLT facts-række (data_basis =
 *                  'measured') for SENESTE AFSLUTTEDE MÅNED — nøglen er
 *                  forsidens getMissingReportKey (forrige måned; indeværende
 *                  kan ikke committes, reportCardView regel 6). Husets regel 1
 *                  for måneden (AdvisorDashboard.companiesMissingReport) med
 *                  regel 3's measured-gate (mangellisten «19 af 27 faldet
 *                  ud», målt 7/9: «seneste MÅLTE rapport»). Et estimat er ikke
 *                  en rapportering.
 *   svarer       = virksomheder med mindst ét SVAR på et forslag inden for
 *                  SVAR_VINDUE_DAGE: accepted_at (proposed → active,
 *                  opgaveEngine.accepter) eller closed_at med done/not_done/
 *                  dropped (opgaveEngine.luk). Vinduet er det samme som
 *                  «faldet ud»-målingen brugte (7/9: «nul besvarede
 *                  opgaveforslag de seneste tre måneder»). Udløb (expired)
 *                  er ikke et svar.
 *
 * Universet er forsidens (de VirksomhedTilDom dommen får): ikke legat,
 * er_kunde, ikke udløbet, ikke pending.
 */

import { DANISH_MONTHS } from "./financialUtils";
import { venterPaaFornyelse, type VirksomhedTilDom } from "./forsidensDom";

/** Tre måneder — mangellistens «faldet ud»-kriterium (7/9). */
export const SVAR_VINDUE_DAGE = 90;

export interface PulsFact {
  company_id: string;
  period_key: string;
  data_basis: string | null;
}

export interface PulsSvar {
  company_id: string;
  status: string;
  accepted_at: string | null;
  closed_at: string | null;
}

export interface PulsInput {
  /** Forsidens univers med motorernes udfald — samme array dommen får. */
  virksomheder: readonly VirksomhedTilDom[];
  facts: readonly PulsFact[];
  /** Seneste afsluttede måned, «YYYY-MM» (AdvisorDashboard.getMissingReportKey). */
  maanedNoegle: string;
  svar: readonly PulsSvar[];
  nu: Date;
}

export interface PulsTal {
  antal: number;
  /** Virksomhedernes id'er — til «klik» når det giver mening. */
  companyIds: string[];
}

export interface Pulsen {
  iAlt: number;
  maanedNoegle: string;
  /** «august» — månedens navn, lille. */
  maanedNavn: string;
  rapporterer: PulsTal;
  svarer: PulsTal;
  tavse: PulsTal;
  fornyelser: PulsTal;
}

const MS_PER_DOEGN = 86_400_000;

/** «2026-08» → «august». Ukendt nøgle → nøglen selv. */
export function maanedNavnAf(noegle: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(noegle);
  if (!m) return noegle;
  const md = parseInt(m[2], 10);
  if (md < 1 || md > 12) return noegle;
  return DANISH_MONTHS[md - 1].toLowerCase();
}

export function afgoerPulsen(input: PulsInput): Pulsen {
  const univers = new Set(input.virksomheder.map((v) => v.companyId));
  const graense = input.nu.getTime() - SVAR_VINDUE_DAGE * MS_PER_DOEGN;

  const rapporterer = new Set<string>();
  for (const f of input.facts) {
    if (univers.has(f.company_id) && f.period_key === input.maanedNoegle && f.data_basis === "measured") rapporterer.add(f.company_id);
  }

  const svarer = new Set<string>();
  for (const s of input.svar) {
    if (!univers.has(s.company_id)) continue;
    const acc = s.accepted_at ? new Date(s.accepted_at).getTime() : NaN;
    const luk = s.closed_at ? new Date(s.closed_at).getTime() : NaN;
    const lukketMedSvar = (s.status === "done" || s.status === "not_done" || s.status === "dropped") && luk >= graense;
    if (acc >= graense || lukketMedSvar) svarer.add(s.company_id);
  }

  const tavse: string[] = [];
  const fornyelser: string[] = [];
  for (const v of input.virksomheder) {
    if (v.signaler.some((s) => s.koe === "ikke_hoert_fra_laenge")) tavse.push(v.companyId);
    if (venterPaaFornyelse(v.fornyelse?.status)) fornyelser.push(v.companyId);
  }

  const tal = (ids: Iterable<string>): PulsTal => {
    const liste = [...ids];
    return { antal: liste.length, companyIds: liste };
  };
  return {
    iAlt: univers.size,
    maanedNoegle: input.maanedNoegle,
    maanedNavn: maanedNavnAf(input.maanedNoegle),
    rapporterer: tal(rapporterer),
    svarer: tal(svarer),
    tavse: tal(tavse),
    fornyelser: tal(fornyelser),
  };
}

export interface PulsLinje {
  noegle: "rapporterer" | "svarer" | "tavse" | "fornyelser";
  tekst: string;
  /** Link når det giver mening; null = ren tekst. */
  to: string | null;
}

/** De fire linjer som ord — «3 af 27 har rapporteret august». Én
    virksomhed → direkte til den; flere → listen. */
export function pulsLinjer(p: Pulsen): PulsLinje[] {
  const link = (t: PulsTal, slags?: string): string | null => {
    if (t.antal === 0) return null;
    if (t.antal === 1) return `/virksomhed/${t.companyIds[0]}${slags ? `?grund=${slags}` : ""}`;
    return "/virksomheder";
  };
  const af = (n: number) => `${n} af ${p.iAlt}`;
  return [
    { noegle: "rapporterer", tekst: `${af(p.rapporterer.antal)} har rapporteret ${p.maanedNavn}`, to: link(p.rapporterer) },
    { noegle: "svarer", tekst: `${af(p.svarer.antal)} har svaret på et forslag de seneste ${SVAR_VINDUE_DAGE} dage`, to: link(p.svarer) },
    { noegle: "tavse", tekst: `${p.tavse.antal === 1 ? "1 er tavs" : `${p.tavse.antal} er tavse`} — ikke hørt fra længe`, to: link(p.tavse, "tavshed") },
    { noegle: "fornyelser", tekst: `${p.fornyelser.antal} ${p.fornyelser.antal === 1 ? "fornyelse venter" : "fornyelser venter"}`, to: link(p.fornyelser, "fornyelse") },
  ];
}
