/**
 * supabase/functions/_shared/opgaveRad.ts
 *
 * VVS mellem company_actions-rækken (strenge fra PostgREST) og motorens
 * Opgave-form (Date-objekter) — INGEN regler bor her; tilstandsmaskinen
 * er ./opgaveEngine.ts og B10 er ./opgaveUdloeb.ts. Delt af de tre
 * skrivevejs-functions (opgave-accepter/-udskyd/-luk), så kolonnelisten
 * og dato-parsningen ikke driver fra hinanden.
 */

import type { Opgave, OpgaveSourceType, OpgaveStatus } from "./opgaveEngine.ts";

/** Samtlige kolonner — motorens Opgave-interface kræver dem alle. */
export const OPGAVE_KOLONNER =
  "id, company_id, user_id, title, context, priority, source_type, source_id, status, week_key, generated_at, created_at, updated_at, completed_at, dismissed_at, due_date, accepted_at, deferral_count, expires_at, closed_at, proposed_by";

type Rad = Record<string, unknown>;

function tilDato(v: unknown): Date | null {
  return typeof v === "string" && v.length > 0 ? new Date(v) : null;
}

/** PostgREST-række -> Opgave. due_date ("YYYY-MM-DD") parses som
    UTC-midnat; edge-runtime kører UTC, så kalenderdags-komponenterne i
    motorens dagVaerdi matcher datoen præcist. */
export function radTilOpgave(rad: Rad): Opgave {
  return {
    id: rad.id as string,
    company_id: rad.company_id as string,
    user_id: rad.user_id as string,
    title: rad.title as string,
    context: (rad.context as string | null) ?? null,
    priority: rad.priority as string,
    source_type: rad.source_type as OpgaveSourceType,
    source_id: (rad.source_id as string | null) ?? null,
    status: rad.status as OpgaveStatus,
    week_key: (rad.week_key as string | null) ?? null,
    generated_at: tilDato(rad.generated_at),
    created_at: tilDato(rad.created_at)!,
    updated_at: tilDato(rad.updated_at)!,
    completed_at: tilDato(rad.completed_at),
    dismissed_at: tilDato(rad.dismissed_at),
    due_date: tilDato(rad.due_date),
    accepted_at: tilDato(rad.accepted_at),
    deferral_count: (rad.deferral_count as number) ?? 0,
    expires_at: tilDato(rad.expires_at),
    closed_at: tilDato(rad.closed_at),
    proposed_by: (rad.proposed_by as string | null) ?? null,
  };
}

/** Date -> date-kolonneform ("YYYY-MM-DD", UTC-kalenderdag). */
export function tilDbDato(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Klientens dato-input: kræv "YYYY-MM-DD" og en reel kalenderdato.
    Returnerer null ved alt andet — kalderen svarer 400. */
export function parseDatoInput(v: unknown): Date | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
