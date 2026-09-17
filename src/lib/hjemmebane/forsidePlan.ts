/**
 * src/lib/hjemmebane/forsidePlan.ts — «Din plan» på medlemmets forside
 * (forside PR 3, 17/9-2026 — Jonas «A på alle», valg 3: «Din plan» erstatter
 * «Dine skridt» + «Dine mål» (skridt under deres mål)).
 *
 * REN dom, ingen React, ingen Supabase. Bygger oven på dineMaalDom (fase 3:
 * målene med fremdrift regnet af skridtene — SAMME dom som /milestones og
 * rådgiverens Planen) og forsidens company_actions-rækker (actionsQuery:
 * open/proposed/active, med deferral_count/expires_at/context — det
 * «Dine skridt» læste). Ingen ny hentning: begge kilder hentes allerede.
 *
 *   - De aktive mål (højst tre, forsideMaal) som rækker med fremdrift; under
 *     hvert mål dets AKTIVE skridt (forfaldne øverst — sorterAktive) og
 *     VENTENDE forslag (ikke udløbne — B8 på læsesiden). Handlingerne er
 *     fladens (samme functions: opgave-luk/-udskyd/-accepter, skridt-tilfoej).
 *   - Skridt uden mål samlet sidst under «Uden mål»; skridt under mål der
 *     ikke vises (parkeret/fjerde) under «Skridt under andre mål».
 *   - TOM-TILSTANDE — medlemmet ejer sine mål (Jonas 16/9, ordret: «Nej. Vi
 *     er rådgivere, men det er medlemmernes virksomheder.»): uden mål en
 *     INVITATION, ikke en mangel; et mål uden skridt: «Tilføj det første
 *     skridt».
 *   - FEJRING (analyse §5: «intet bliver fejret»): et skridt markeret gjort
 *     får ✓ og «Godt gået — {mål} er nu {N} %»; et mål på 100 % siger «Alle
 *     skridt er gjort — marker målet som nået». Ingen konfetti, ingen lyd.
 * Testet i __tests__/forsidePlan.test.ts; kildeværn
 * src/lib/__tests__/forsidePlan.guard.test.ts.
 */
import type { DineMaalDom, MaalForMedlem } from "./dineMaal";
import { forsideMaal } from "./dineMaal";
import { sorterAktive, vaelgForslag } from "./aftaler";

/** Det af company_actions-rækken planen læser (forsidens actionsQuery). */
export interface PlanSkridt {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  maal_id: string | null;
  deferral_count: number;
  expires_at: string | null;
  context: string | null;
  source_type: string | null;
  created_at: string;
  priority?: string | null;
  /** Rådgiveren der foreslog (PR 4: ansigtet — ansigter.raadgiverAnsigt). Valgfri: ældre kald bygger rækker uden. */
  proposed_by?: string | null;
}

export interface MaalIForsidePlan {
  plan: MaalForMedlem;
  /** Aktive skridt, forfaldne øverst (aftaler.sorterAktive). */
  aktive: PlanSkridt[];
  /** Ventende forslag (proposed, ikke udløbne), vigtigste først (aftaler.vaelgForslag-rækkefølgen). */
  forslag: PlanSkridt[];
  /** Ingen skridt overhovedet (hverken aktive, ventende, gjorte eller andre) — «Tilføj det første skridt». */
  udenSkridt: boolean;
  /** Fremdriften er 100 % af skridtene og målet er stadig aktivt — «marker målet som nået». */
  alleGjort: boolean;
}

export interface ForsidePlanDom {
  /** Ingen mål overhovedet — invitationen. */
  tom: boolean;
  /** Mål findes, men ingen er aktive (parkerede/nåede). */
  ingenAktive: boolean;
  maal: MaalIForsidePlan[];
  /** Aktive mål ud over de tre viste. */
  flere: number;
  udenMaal: { aktive: PlanSkridt[]; forslag: PlanSkridt[] };
  andre: { aktive: PlanSkridt[]; forslag: PlanSkridt[] };
  overGraensen: boolean;
  graenseTekst: string;
  /** Antal ventende forslag i alt (til «N forslag venter»). */
  ventende: number;
}

// ── Teksterne (til Jonas' godkendelse — README) ──
export const PLAN_TOM_TEKST = "Din plan starter med et mål. Sæt det første selv — eller sammen med din rådgiver.";
export const PLAN_TOM_SAET_MAAL = "Sæt et mål";
export const PLAN_TOM_BOOK = "Book en session";
export const PLAN_INGEN_AKTIVE_TEKST = "Ingen aktive mål lige nu — aktivér et parkeret, eller sæt et nyt.";
export const MAAL_UDEN_SKRIDT_TEKST = "Tilføj det første skridt";
export const UDEN_MAAL_OVERSKRIFT = "Uden mål";
export const ANDRE_MAAL_OVERSKRIFT = "Skridt under andre mål";
export const ALLE_GJORT_TEKST = "Alle skridt er gjort — marker målet som nået";
export const SE_HELE_PLANEN = "Se hele planen";
export const PLAN_FEJL_TEKST = "Din plan kunne ikke hentes. Prøv igen.";

/** Et forslag er udløbet når expires_at er passeret (B8 på læsesiden — samme dom som nextStep.filtrerUdloebneForslag). */
export function erUdloebetForslag(s: Pick<PlanSkridt, "status" | "expires_at">, nu: Date): boolean {
  return s.status === "proposed" && s.expires_at != null && nu.getTime() > new Date(s.expires_at).getTime();
}

/** Forslag i den rækkefølge fladen viser dem: vaelgForslag's rangorden (kilde → prioritet → ældste) gentaget. */
export function ordnForslag(forslag: readonly PlanSkridt[]): PlanSkridt[] {
  const rest = [...forslag];
  const ud: PlanSkridt[] = [];
  while (rest.length > 0) {
    const valgt = vaelgForslag(rest);
    if (!valgt) break;
    ud.push(valgt);
    rest.splice(rest.indexOf(valgt), 1);
  }
  return ud;
}

function del(skridt: readonly PlanSkridt[], nu: Date): { aktive: PlanSkridt[]; forslag: PlanSkridt[] } {
  return {
    aktive: sorterAktive(skridt.filter((s) => s.status === "active")),
    forslag: ordnForslag(skridt.filter((s) => s.status === "proposed" && !erUdloebetForslag(s, nu))),
  };
}

export function forsidePlanDom(dineMaal: DineMaalDom, skridt: readonly PlanSkridt[], nu: Date): ForsidePlanDom {
  const { viste, flere } = forsideMaal(dineMaal);
  const visteIds = new Set(viste.map((x) => x.plan.maal.id));
  const alleMaalIds = new Set([...dineMaal.aktive, ...dineMaal.parkerede, ...dineMaal.naaede].map((x) => x.plan.maal.id));
  const maal: MaalIForsidePlan[] = viste.map((x) => {
    const egne = skridt.filter((s) => s.maal_id === x.plan.maal.id);
    const { aktive, forslag } = del(egne, nu);
    const harNogen = x.plan.skridt.aktive.length + x.plan.skridt.venter.length + x.plan.skridt.gjorte.length + x.plan.skridt.andre.length > 0;
    return {
      plan: x,
      aktive,
      forslag,
      udenSkridt: !harNogen && aktive.length === 0 && forslag.length === 0,
      alleGjort: x.plan.beregnet && x.plan.fremdrift >= 100 && x.plan.dom.aktiv,
    };
  });
  const udenMaal = del(skridt.filter((s) => !s.maal_id), nu);
  const andre = del(skridt.filter((s) => s.maal_id && !visteIds.has(s.maal_id) && alleMaalIds.has(s.maal_id)), nu);
  // Skridt der peger på et mål der slet ikke findes i listen (fx slettet — FK'en sætter maal_id til NULL, så det sker ikke i praksis) regnes som uden mål.
  const forladte = del(skridt.filter((s) => s.maal_id && !alleMaalIds.has(s.maal_id)), nu);
  udenMaal.aktive = sorterAktive([...udenMaal.aktive, ...forladte.aktive]);
  udenMaal.forslag = ordnForslag([...udenMaal.forslag, ...forladte.forslag]);
  const ventende = maal.reduce((n, m) => n + m.forslag.length, 0) + udenMaal.forslag.length + andre.forslag.length;
  return {
    tom: dineMaal.tom,
    ingenAktive: !dineMaal.tom && viste.length === 0,
    maal,
    flere,
    udenMaal,
    andre,
    overGraensen: dineMaal.overGraensen,
    graenseTekst: dineMaal.graenseTekst,
    ventende,
  };
}

/** Om planen har noget at vise ud over tom-tilstanden. */
export function planHarIndhold(dom: ForsidePlanDom): boolean {
  return dom.maal.length > 0 || dom.udenMaal.aktive.length + dom.udenMaal.forslag.length > 0 || dom.andre.aktive.length + dom.andre.forslag.length > 0;
}

// ── Fejringen ──
export interface Fejring {
  skridtId: string;
  titel: string;
  /** «Godt gået — {mål} er nu {N} %» — eller uden mål: «Godt gået.» */
  tekst: string;
  /** Målet skridtet hørte til (til at vise linjen under det rigtige mål); null uden mål. */
  maalId: string | null;
}

/** Fejringens linje. Fremdriften er den motoren skrev (opgave-luk's svar `maal.progress`)
    — aldrig regnet her. Uden mål eller uden tal: «Godt gået.» */
export function fejringTekst(maalTitel: string | null, progress: number | null): string {
  if (!maalTitel || progress == null || !Number.isFinite(progress)) return "Godt gået.";
  const pct = Math.round(progress);
  // 100 %: målet er færdigt i planens dom (Jonas «A») og forlader de aktive —
  // fejringen bærer derfor selv opfordringen til at markere det som nået.
  if (pct >= 100) return `Godt gået — ${maalTitel} er nu 100 %. ${ALLE_GJORT_TEKST}.`;
  return `Godt gået — ${maalTitel} er nu ${pct} %`;
}

export function fejring(skridt: { id: string; title: string; maal_id: string | null }, maalTitel: string | null, progress: number | null): Fejring {
  return { skridtId: skridt.id, titel: skridt.title, tekst: fejringTekst(maalTitel, progress), maalId: skridt.maal_id };
}

/** Hvor længe fejringen står (ms) — en stille linje, ikke en fanfare. */
export const FEJRING_VARIGHED_MS = 8000;
