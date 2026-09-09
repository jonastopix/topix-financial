/**
 * src/lib/pulsen.ts
 *
 * PULSEN — fire tal for hele porteføljen i forsidens højre spalte (Jonas
 * 8/9): rapporterer, svarer på forslag, tavse, fornyelser der venter. Ren
 * funktion, testet (src/lib/__tests__/pulsen.test.ts). Kalderen er
 * hentAdvisorDashboard.
 *
 * PULSEN MÅLER PORTEFØLJEN — DOMMENS LINJER MÅLER FLADEN (besluttet 9/9,
 * Jonas). De to tal om «det samme» MÅ afvige, og skal ikke rettes til
 * hinanden:
 *
 *   Dommen (forsidensDom) FORDELER: en virksomhed med tavshed som grund
 *   står enten med EGEN linje (hændelse gennem porten, eller tilstand med
 *   vindue), ELLER foldes ind i den samlede tilstandslinje — aldrig begge.
 *   «12 virksomheder har du ikke hørt fra længe» er derfor RESTEN efter at
 *   CARMA, Floren og Rezycl fik egen linje, og efter at lukkede grunde
 *   (opgaveLukning, #744) er taget ud. Det er fladens tal: hvad der står
 *   HER, når det andet står deroppe.
 *
 *   Pulsen TÆLLER: alle i porteføljen med motorens signal, uanset hvor de
 *   står på fladen og uanset om nogen har lukket linjen. «14 er tavse» er
 *   sandt om porteføljen — at tre af dem allerede står øverst, gør dem ikke
 *   mindre tavse. Det er porteføljens tal.
 *
 *   Forskellen gøres SYNLIG i teksten («14 tavse · 3 står øverst»), så den
 *   der ser begge tal forstår hvorfor de er forskellige — uden at pulsen
 *   forklarer sig ihjel. Den første udgave (9/9 formiddag) lovede at pulsen
 *   «SKAL sige det samme som linjerne»; det var den forkerte ambition, og
 *   den gjorde Jonas' skærm til tre modsigelser.
 *
 * UNIVERSET er LISTENS (/virksomheder): kunde, ikke legat, status aktiv
 * eller tom, ikke udløbet — 27, ikke dommens 23. Dommens pending-gate
 * (invitation uden medlemmer) hører til fladens linjer: en virksomhed der
 * er inviteret men ikke kommet ind, ER en del af porteføljen, og er netop
 * derfor interessant at tælle som tavs. Kalderen bygger to arrays af samme
 * motor-udfald: ét til dommen (uden pending), ét til pulsen (med).
 *
 * INGEN RPC (besluttet 9/9): tre af de fire tal regnes af det forsiden
 * allerede henter, og det fjerde af ét lille kald. En SECURITY DEFINER-
 * funktion ville lægge en FJERDE kopi af «tavshed» i databasen ved siden af
 * motorens — præcis den fejl 8/9 gik med at rette.
 *
 * TALLENE KOMMER FRA MOTORERNE — ikke herfra:
 *   tavse        = signal i køen `ikke_hoert_fra_laenge` (virksomhedsSignaler:
 *                  «aldrig skrevet», eller > STALE_DAGE = 21 hele dage siden
 *                  conversations.last_message_at). Tærsklen er motorens.
 *   fornyelser   = fornyelsestilstand i forsidensDom.FORNYELSE_VENTER_STATUSSER.
 *   rapporterer  = MÅLT facts-række (data_basis = 'measured') for SENESTE
 *                  AFSLUTTEDE MÅNED (getMissingReportKey). Et estimat er ikke
 *                  en rapportering.
 *   svarer       = mindst ét SVAR på et forslag inden for SVAR_VINDUE_DAGE:
 *                  accepted_at (proposed → active), ELLER lukket med
 *                  done/not_done/dropped — stemplet er closed_at (opgave-luk,
 *                  siden 31/8) ELLER completed_at (arven fra før modellen:
 *                  «done» skrevet af den gamle flade bærer kun completed_at,
 *                  opgaveEngine §7). Et svar er et svar, også et gammelt
 *                  (Jonas 9/9). Udløb (expired) er ikke et svar.
 *   «står øverst» = hvor mange af de tavse/fornyelserne der har EGEN linje i
 *                  dommen — det tal der forklarer afstanden til linjen.
 */

import { DANISH_MONTHS } from "./financialUtils";
import { venterPaaFornyelse, type Forsidensdom, type VirksomhedTilDom } from "./forsidensDom";

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
  /** Arvens stempel (før opgave-modellen): en «done» fra den gamle flade har
      kun denne. Valgfri, så ældre kaldere/tests stadig typer. */
  completed_at?: string | null;
}

export interface PulsInput {
  /** Forsidens univers med motorernes udfald — samme array dommen får. */
  virksomheder: readonly VirksomhedTilDom[];
  facts: readonly PulsFact[];
  /** Seneste afsluttede måned, «YYYY-MM» (AdvisorDashboard.getMissingReportKey). */
  maanedNoegle: string;
  svar: readonly PulsSvar[];
  nu: Date;
  /** Forsidens dom over SIT univers — bruges kun til «står øverst». Valgfri:
      uden dom er tallet 0 og teksten nævner det ikke. */
  dom?: Pick<Forsidensdom, "linjer"> | null;
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
  /** Hvor mange af de tavse / fornyelserne der står med EGEN linje i dommen. */
  oeverst: { tavse: number; fornyelser: number };
}

export type PulsNoegle = "rapporterer" | "svarer" | "tavse" | "fornyelser";
export const PULS_NOEGLER: readonly PulsNoegle[] = ["rapporterer", "svarer", "tavse", "fornyelser"];

/** URL-parameteren listen læser når et pulstal klikkes: /virksomheder?puls=tavse.
    Søster til forsideLinks' ?grund= — men opslaget sker i PULSEN, ikke i
    dommens tilstandslinje, for pulsens 14 er ikke dommens 12. */
export const PULS_PARAM = "puls";
export function pulsLink(noegle: PulsNoegle): string {
  return `/virksomheder?${PULS_PARAM}=${noegle}`;
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
    // closed_at er modellens stempel; completed_at er arvens (opgaveEngine §7).
    // Et svar er et svar, også et gammelt — det nyeste af de to stempler gælder.
    const lukStempel = s.closed_at ?? s.completed_at ?? null;
    const luk = lukStempel ? new Date(lukStempel).getTime() : NaN;
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
  // «Står øverst»: dem i tallet der har EGEN virksomhedslinje i dommen.
  const medEgenLinje = new Set(
    (input.dom?.linjer ?? []).flatMap((l) => (l.linje === "virksomhed" ? [l.companyId] : [])),
  );
  const oeverst = (ids: string[]) => ids.filter((id) => medEgenLinje.has(id)).length;
  return {
    iAlt: univers.size,
    maanedNoegle: input.maanedNoegle,
    maanedNavn: maanedNavnAf(input.maanedNoegle),
    rapporterer: tal(rapporterer),
    svarer: tal(svarer),
    tavse: tal(tavse),
    fornyelser: tal(fornyelser),
    oeverst: { tavse: oeverst(tavse), fornyelser: oeverst(fornyelser) },
  };
}

export interface PulsLinje {
  noegle: PulsNoegle;
  tekst: string;
  /** Link når det giver mening; null = ren tekst. */
  to: string | null;
}

/** «· 3 står øverst» — kun når nogen gør. Det er ordene der gør afstanden
    til dommens linje forståelig på to sekunder: 14 tavse, 3 af dem står
    allerede deroppe, resten er linjens 11–12. */
export function staarOeverstTekst(antal: number): string {
  if (antal <= 0) return "";
  return ` · ${antal === 1 ? "1 står" : `${antal} står`} øverst`;
}

/** Tavshedens ord: «14 tavse» / «1 tavs». */
export function tavseTekst(antal: number): string {
  return antal === 1 ? "1 tavs" : `${antal} tavse`;
}

/** Fornyelsernes ord: «2 fornyelser venter» / «1 fornyelse venter». */
export function fornyelserTekst(antal: number): string {
  return `${antal} ${antal === 1 ? "fornyelse venter" : "fornyelser venter"}`;
}

/** De fire linjer som ord — «3 af 27 har rapporteret august», «14 tavse ·
    3 står øverst». Én virksomhed → direkte til den; flere → listen MED
    ?puls=<nøgle>, så listen viser præcis pulsens virksomheder (#743-mønstret,
    men mod pulsen — dommens tilstandslinje giver 12, ikke 14). */
export function pulsLinjer(p: Pulsen): PulsLinje[] {
  const link = (t: PulsTal, noegle: PulsNoegle, slags?: string): string | null => {
    if (t.antal === 0) return null;
    if (t.antal === 1) return `/virksomhed/${t.companyIds[0]}${slags ? `?grund=${slags}` : ""}`;
    return pulsLink(noegle);
  };
  const af = (n: number) => `${n} af ${p.iAlt}`;
  return [
    { noegle: "rapporterer", tekst: `${af(p.rapporterer.antal)} har rapporteret ${p.maanedNavn}`, to: link(p.rapporterer, "rapporterer") },
    { noegle: "svarer", tekst: `${af(p.svarer.antal)} har svaret på et forslag de seneste ${SVAR_VINDUE_DAGE} dage`, to: link(p.svarer, "svarer") },
    { noegle: "tavse", tekst: `${tavseTekst(p.tavse.antal)}${staarOeverstTekst(p.oeverst.tavse)}`, to: link(p.tavse, "tavse", "tavshed") },
    { noegle: "fornyelser", tekst: `${fornyelserTekst(p.fornyelser.antal)}${staarOeverstTekst(p.oeverst.fornyelser)}`, to: link(p.fornyelser, "fornyelser", "fornyelse") },
  ];
}
