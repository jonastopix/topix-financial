/**
 * src/lib/hjemmebane/maalRetning.ts — «Jeres retning» øverst i Dine mål
 * (Jonas 1/10-2026 kl. 22:37, ja): handoutet «Målsætning 12 mdr.»
 * (handoutConfig.ts, modul 'overordnet') flytter ind i toppen af Dine mål som
 * TRE spørgsmål. Svarene BOR stadig i handouts-rækken (handouts.responses) —
 * ingen ny tabel, ingen migration; handoutet og Dine mål læser og skriver de
 * SAMME nøgler, så et svar givet ét sted står det andet.
 *
 *   lykkedes_12mdr               «Om 12 måneder er vi lykkedes, hvis…»
 *   anderledes_hverdag           «Hvad skal være anderledes i hverdagen?» (inkl. arbejdstiden)
 *   konsekvenser_ingen_aendring  «Hvad koster det, hvis intet ændrer sig?»
 *
 * Nøglerne står ORDRET i handoutConfigs.overordnet (testen holder dem i takt);
 * ordlyden her er Dine måls korte form af handoutets spørgsmål.
 *
 * REN: ingen React, ingen Supabase. Hentning og skrivning: hooks/dineMaalGrundlag.ts.
 */

export const RETNING_MODUL = "overordnet" as const;

export const RETNING_NOEGLER = ["lykkedes_12mdr", "anderledes_hverdag", "konsekvenser_ingen_aendring"] as const;
export type RetningNoegle = (typeof RETNING_NOEGLER)[number];

export const RETNING_ORD = {
  overskrift: "Jeres retning",
  spoergsmaal: {
    lykkedes_12mdr: "Om 12 måneder er vi lykkedes, hvis…",
    anderledes_hverdag: "Hvad skal være anderledes i hverdagen?",
    konsekvenser_ingen_aendring: "Hvad koster det, hvis intet ændrer sig?",
  } satisfies Record<RetningNoegle, string>,
  hjaelp: {
    lykkedes_12mdr: null,
    anderledes_hverdag: "Også arbejdstiden — hvor meget vil I arbejde?",
    konsekvenser_ingen_aendring: null,
  } satisfies Record<RetningNoegle, string | null>,
} as const;

/** Det af handouts-rækken retningen læser. */
export interface RetningsRaekke {
  id: string;
  user_id: string;
  module: string;
  responses: unknown;
  updated_at: string | null;
  status?: string | null;
}

export interface Retning {
  /** Rækken svarene står i; null = ingen række (endnu). */
  handoutId: string | null;
  /** Hvis række (handouts er pr. bruger — UNIQUE (user_id, module)). */
  userId: string | null;
  /** De tre svar; et manglende eller ikke-tekst-svar er "". */
  svar: Record<RetningNoegle, string>;
  /** Antal af de tre med indhold (efter trim). */
  besvaret: number;
  opdateret: string | null;
}

const TOMME_SVAR = (): Record<RetningNoegle, string> => ({ lykkedes_12mdr: "", anderledes_hverdag: "", konsekvenser_ingen_aendring: "" });

const erObjekt = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Den række, retningen læses af: KUN modul 'overordnet', den NYESTE
 * (updated_at; lige/manglende: den først i listen). Handouts er pr. bruger;
 * en rådgiver ser alle virksomhedens rækker (RLS «Advisors can view all
 * handouts»), et medlem kun sin egen («Users can view own handouts») — derfor
 * «nyeste» frem for «den ene».
 */
export function vaelgRetningsRaekke(raekker: readonly RetningsRaekke[]): RetningsRaekke | null {
  let valgt: RetningsRaekke | null = null;
  for (const r of raekker) {
    if (r.module !== RETNING_MODUL) continue;
    if (valgt === null || (r.updated_at ?? "") > (valgt.updated_at ?? "")) valgt = r;
  }
  return valgt;
}

/** De tre svar af én handouts-række (null → tomme svar). Et felt er en observation: kun tekst læses. */
export function retningFraHandout(raekke: RetningsRaekke | null): Retning {
  const svar = TOMME_SVAR();
  const resp = raekke && erObjekt(raekke.responses) ? raekke.responses : {};
  for (const n of RETNING_NOEGLER) {
    const v = resp[n];
    svar[n] = typeof v === "string" ? v : "";
  }
  return {
    handoutId: raekke?.id ?? null,
    userId: raekke?.user_id ?? null,
    svar,
    besvaret: RETNING_NOEGLER.filter((n) => svar[n].trim() !== "").length,
    opdateret: raekke?.updated_at ?? null,
  };
}

export type RetningSkrivDom = { ok: true; responses: Record<string, unknown>; harIndhold: boolean } | { ok: false; grund: string };

/**
 * De nye responses, når de tre svar skrives (fail-closed):
 *   - kun de tre nøgler må ændres — en anden nøgle afvises (handoutets øvrige
 *     svar røres aldrig herfra);
 *   - hvert givet svar skal være tekst; et udeladt svar står uændret;
 *   - alle ANDRE nøgler i de eksisterende responses bevares ordret (også
 *     ikke-tekst-værdier — de er handoutets, ikke vores);
 *   - harIndhold: om rækken efter skrivningen har noget indhold i responses
 *     (samme afledning som handoutEngine.saveHandout: en ikke-tom tekst).
 */
export function retningTilResponses(eksisterende: unknown, nye: Partial<Record<string, unknown>>): RetningSkrivDom {
  const ud: Record<string, unknown> = erObjekt(eksisterende) ? { ...eksisterende } : {};
  for (const [k, v] of Object.entries(nye)) {
    if (!(RETNING_NOEGLER as readonly string[]).includes(k)) return { ok: false, grund: "Kun de tre spørgsmål om retningen kan gemmes her" };
    if (v === undefined) continue;
    if (typeof v !== "string") return { ok: false, grund: "Svaret skal være tekst" };
    ud[k] = v;
  }
  const harIndhold = Object.values(ud).some((v) => typeof v === "string" && v.trim() !== "");
  return { ok: true, responses: ud, harIndhold };
}

/**
 * Handout-status efter en retningsskrivning: en række, der stod 'not_started',
 * og nu har indhold, bliver 'in_progress' (handoutEngine.saveHandout's
 * afledning); 'in_progress' og 'completed' røres ALDRIG — et udfyldt handout
 * genåbnes ikke af, at retningen rettes på Dine mål. Ny række: 'in_progress'
 * med indhold, ellers 'not_started'.
 */
export function retningStatus(gammel: string | null | undefined, harIndhold: boolean): "not_started" | "in_progress" | "completed" {
  if (gammel === "completed") return "completed";
  if (gammel === "in_progress") return "in_progress";
  return harIndhold ? "in_progress" : "not_started";
}
