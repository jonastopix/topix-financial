/**
 * lektionBrugbar — den rene motor bag «Kunne du bruge den?» (video-rating
 * med ét tryk i Akademiet, 16/9-2026). Ingen IO, ingen supabase-import;
 * kolonnerne er member_progress.brugbar / brugbar_at (migration
 * 20260916100000). Tre domme:
 *
 * 1. skalSpoergeOmBrugbar — spørgsmålet stilles præcis når lektionen er
 *    tracked (Bunny-video, isTrackedItem), set færdig (state "done", dvs.
 *    acknowledged_at sat), endnu ubesvaret (brugbar null/undefined) og
 *    læseren ikke er rådgiver. acknowledged_at er KILDELØS (baseline,
 *    addendum 2026-08-05): der er intet spor af om medlemmet eller
 *    rådgiveren satte den, så en rådgivermarkeret lektion bliver også
 *    spurgt — bevidst; svaret er stadig medlemmets. Rådgivere spørges
 *    ikke: de åbner lektioner for at se fladen, ikke for at lære, og
 *    deres egne rækker (self-only RLS gælder også dem) ville forurene
 *    tallet.
 *
 * 2. brugbarPatch — de to kolonner sættes altid sammen, aldrig alene.
 *
 * 3. optaelBrugbarPrLektion — tallet pr. lektion til rådgiverne. Tæller KUN
 *    rækker med acknowledged_at sat, og aldrig rækker fra udelukkede
 *    brugere (rådgiverne og ikke-kunders medlemmer, se 4). Et fortrudt
 *    svar bliver i data (fortryd nulstiller kun acknowledged_at,
 *    ElementView/clearAcknowledge), men tæller ikke: uden acknowledged_at
 *    er lektionen ikke set færdig, og så er svaret ikke et svar på en
 *    gennemført lektion. Invariant: ja + nej + ubesvaret = gennemfoert, altid.
 *
 * 4. udelukFraBrugbar — HVEM der ikke tæller (16/9, «Svar pr. lektion»
 *    uden ikke-kunder): rådgiverne (get_all_advisor_profiles, vinder altid)
 *    ∪ medlemmer hvis ALLE medlemskaber er ikke-kunder (companies.er_kunde
 *    = false, dommen erKunde i raadgiverensKunder.ts regnet i listMembers,
 *    fail-open). PR. BRUGER, ikke pr. række: company_members er unik på
 *    (company, user), så en bruger kan stå i flere virksomheder, og
 *    listMembers giver én række pr. medlemskab. Et medlem af både en kunde
 *    og en ikke-kunde TÆLLER MED — progress-rækker har ingen company_id, så
 *    svaret kan ikke deles op, og en kunde der forsvinder uden beslutning
 *    er den fejl der ikke opdages (erKunde's regel). Kun tallet: listen på
 *    Fremdrift-fanen viser stadig alle (chattens valg (i), 16/9).
 *
 * Reglen fra MemberProgress gælder: et fraværende felt (undefined) er det
 * samme som null — ikke sket / ikke besvaret.
 */

import type { ItemProgressState } from "./akademiApi";

/** Fladens ord (Jonas 16/9): spørgsmålet, de to svar og kvitteringen. */
export const BRUGBAR_SPOERGSMAAL = "Kunne du bruge den?";
export const BRUGBAR_JA = "Ja";
export const BRUGBAR_NEJ = "Nej";
export const BRUGBAR_TAK = "Tak for svaret.";

export interface SkalSpoergeInput {
  /** isTrackedItem/isTrackedEntry — kun Bunny-videoer spores. */
  tracked: boolean;
  /** itemProgressState — "done" er acknowledged_at sat. */
  state: ItemProgressState;
  /** member_progress.brugbar — null/undefined = ikke besvaret. */
  brugbar: boolean | null | undefined;
  erRaadgiver: boolean;
}

export function skalSpoergeOmBrugbar(input: SkalSpoergeInput): boolean {
  return (
    input.tracked === true &&
    input.state === "done" &&
    (input.brugbar === null || input.brugbar === undefined) &&
    input.erRaadgiver === false
  );
}

export interface BrugbarPatch {
  brugbar: boolean;
  brugbar_at: string;
}

export function brugbarPatch(svar: boolean, nu: Date): BrugbarPatch {
  return { brugbar: svar, brugbar_at: nu.toISOString() };
}

/** Den optimistiske cache-patch (useAkademiData.svarBrugbar): patcher KUN
    en eksisterende række for itemId — svaret forudsætter at lektionen er
    set færdig, så rækken findes. Findes den ikke, returneres listen
    uændret (samme reference). Input røres aldrig. */
export function patchBrugbarIRaekker<T extends { content_item_id: string }>(
  raekker: T[],
  itemId: string,
  patch: BrugbarPatch,
): T[] {
  if (!raekker.some((raekke) => raekke.content_item_id === itemId)) return raekker;
  return raekker.map((raekke) =>
    raekke.content_item_id === itemId ? { ...raekke, ...patch } : raekke,
  );
}

/** Det subset af en member_progress-række optællingen læser. */
export interface BrugbarRaekke {
  user_id: string;
  content_item_id: string;
  acknowledged_at?: string | null;
  brugbar?: boolean | null;
}

export interface BrugbarOptaelling {
  /** Rækker med acknowledged_at sat (uden de udelukkede brugere). */
  gennemfoert: number;
  ja: number;
  nej: number;
  ubesvaret: number;
}

export function optaelBrugbarPrLektion(
  raekker: readonly BrugbarRaekke[],
  udelukUserIds: Iterable<string>,
): Record<string, BrugbarOptaelling> {
  const udeluk = new Set(udelukUserIds);
  const ud: Record<string, BrugbarOptaelling> = {};
  for (const raekke of raekker) {
    if (udeluk.has(raekke.user_id)) continue;
    if (!raekke.acknowledged_at) continue;
    const tal = ud[raekke.content_item_id] ?? { gennemfoert: 0, ja: 0, nej: 0, ubesvaret: 0 };
    ud[raekke.content_item_id] = tal;
    tal.gennemfoert += 1;
    if (raekke.brugbar === true) tal.ja += 1;
    else if (raekke.brugbar === false) tal.nej += 1;
    else tal.ubesvaret += 1;
  }
  return ud;
}

/** Det udelukkelsen læser af et medlem — AdminMember (adminContentApi.ts)
    opfylder den strukturelt. companyErKunde er erKunde(virksomheden). */
export interface UdelukMedlem {
  userId: string;
  companyErKunde: boolean;
}

/** user_id'er der ikke tæller i «Svar pr. lektion»: rådgiverne ∪ brugere
    hvis ALLE medlemskaber er ikke-kunder. En bruger uden rækker i
    medlemmer udelukkes kun hvis hun er rådgiver. Rører ikke input. */
export function udelukFraBrugbar(
  raadgiverUserIds: Iterable<string>,
  medlemmer: readonly UdelukMedlem[],
): Set<string> {
  const ud = new Set<string>();
  for (const id of raadgiverUserIds) if (id) ud.add(id);
  // Pr. bruger: mindst ét kunde-medlemskab holder brugeren inde.
  const harKundeMedlemskab = new Map<string, boolean>();
  for (const m of medlemmer) {
    harKundeMedlemskab.set(m.userId, (harKundeMedlemskab.get(m.userId) ?? false) || m.companyErKunde);
  }
  for (const [userId, erKunde] of harKundeMedlemskab) if (!erKunde) ud.add(userId);
  return ud;
}

/** Rådgiverens linje pr. lektion (ProgressView-overblikket). Tre grene:
    ingen gennemført → ingen tal; gennemført men intet svar → antallet
    og at ingen har svaret; ellers «ja af (ja+nej) kunne bruge den». */
export function brugbarLinje(t: BrugbarOptaelling | undefined): string {
  if (!t || t.gennemfoert === 0) return "Ingen har gennemført den endnu";
  const svar = t.ja + t.nej;
  if (svar === 0) return `${t.gennemfoert} gennemført · ingen har svaret endnu`;
  return `${t.ja} af ${svar} kunne bruge den · ${t.gennemfoert} gennemført`;
}
