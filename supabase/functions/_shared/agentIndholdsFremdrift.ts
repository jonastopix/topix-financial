/**
 * agentIndholdsFremdrift — det run-company-agent's get_member_content_progress
 * svarer pr. lektion (3/10-2026, v8; F0 «Åbne punkter» i
 * docs/akademi-grundlag.md §8). REN — ingen Deno, ingen klient; testet i
 * src/lib/__tests__/agentIndholdsFremdrift.test.ts.
 *
 * FØR v8 dømte functionen `state` af det rå acknowledged_at, så de 199
 * backfillede batch-rækker (acknowledged_at = markeret_at, rådgiverens
 * kvittering fra 5/8 og 12/8) stod som «gennemført» af medlemmet. Nu går
 * dommen gennem husets itemProgressState (spejlet ordret i progressState.ts):
 *   - `state` er MEDLEMMETS EGEN tilstand (gennemført/sprunget over/set/urørt);
 *   - `gennemgaaet_med_raadgiver` er rådgiverens markering, for sig;
 *   - de rå tidsstempler sendes IKKE videre — kun medlemmets egne
 *     (`egen_gennemfoert_at`, `eget_set_at`), så modellen ikke kan læse
 *     rådgiverens stempel som hendes.
 */
import { egetStempel, itemProgressState, markeringsTilstand, type ItemProgressState } from "./progressState.ts";

/** Markøren i svaret, der beviser udrulningen af v8 (kun den nye kode kender den). */
export const F0_MARKOER = "skive-1";

export type AgentProgressKilde = {
  content_item_id: string;
  seen_at?: string | null;
  acknowledged_at?: string | null;
  skipped_at?: string | null;
  markeret_at?: string | null;
  last_position_seconds?: number | null;
  content_items?: { title?: string | null; area?: string | null; duration_seconds?: number | null } | null;
};

export type AgentTilstand = "gennemført" | "sprunget_over" | "set_men_ikke_gennemført" | "urørt";

const TILSTAND: Record<ItemProgressState, AgentTilstand> = {
  done: "gennemført",
  skipped: "sprunget_over",
  started: "set_men_ikke_gennemført",
  untouched: "urørt",
};

export type AgentProgressRaekke = {
  content_item_id: string;
  title: string | null;
  area: string | null;
  /** Medlemmets EGEN tilstand — rådgiverens markering tæller aldrig her. */
  state: AgentTilstand;
  /** Rådgiveren har markeret lektionen «gennemgået med rådgiver» (markeret_at sat). */
  gennemgaaet_med_raadgiver: boolean;
  /** Medlemmets eget «gennemført»-stempel; null når det ikke findes eller er rådgiverens. */
  egen_gennemfoert_at: string | null;
  /** Medlemmets eget «set»-stempel; null når det ikke findes eller er rådgiverens. */
  eget_set_at: string | null;
  last_position_seconds: number | null;
  duration_seconds: number | null;
};

export function agentProgressRaekke(r: AgentProgressKilde): AgentProgressRaekke {
  return {
    content_item_id: r.content_item_id,
    title: r.content_items?.title ?? null,
    area: r.content_items?.area ?? null,
    state: TILSTAND[itemProgressState(r)],
    gennemgaaet_med_raadgiver: markeringsTilstand(r) === "gennemgaaet",
    egen_gennemfoert_at: egetStempel(r.acknowledged_at, r.markeret_at),
    eget_set_at: egetStempel(r.seen_at, r.markeret_at),
    last_position_seconds: r.last_position_seconds ?? null,
    duration_seconds: r.content_items?.duration_seconds ?? null,
  };
}
