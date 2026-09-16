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
 *    brugere (rådgiverne). Et fortrudt svar bliver i data (fortryd
 *    nulstiller kun acknowledged_at, ElementView/clearAcknowledge), men
 *    tæller ikke: uden acknowledged_at er lektionen ikke set færdig, og
 *    så er svaret ikke et svar på en gennemført lektion. Invariant:
 *    ja + nej + ubesvaret = gennemfoert, altid.
 *
 * Reglen fra MemberProgress gælder: et fraværende felt (undefined) er det
 * samme som null — ikke sket / ikke besvaret.
 */

import type { ItemProgressState } from "./akademiApi";

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
