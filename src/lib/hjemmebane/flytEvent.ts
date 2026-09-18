/**
 * src/lib/hjemmebane/flytEvent.ts — dommen bag EventEditor's «Gem» (UDKAST
 * 18/9-2026, recon-event-aendring.md §7 pkt. 3).
 *
 * Målt: en ændring af dato/tid var en almindelig UPDATE — ingen besked til de
 * tilmeldte. Nu deles patchen i to: TIDEN (starts_at/ends_at) og RESTEN.
 * På et PUBLICERET event går tiden gennem flyt-event (Bucket A), som
 * opdaterer OG giver de tilmeldte besked; resten gemmes som i dag med
 * updateEvent. På en kladde eller et afholdt/aflyst event er der ingen
 * tilmeldte at underrette: hele patchen går til updateEvent som før.
 *
 * REN: ingen React, ingen Supabase — kaldene gives ind (gemEventEllerFlyt i
 * adminContentApi). Testet i __tests__/flytEvent.test.ts; kildeværn
 * src/lib/__tests__/flytEvent.guard.test.ts.
 */

const TIDSFELTER = ["starts_at", "ends_at"] as const;

export interface Tidspatch {
  starts_at: string;
  ends_at?: string | null;
}

export interface Gemplan {
  /** Sendes til flyt-event — kun når eventet er publiceret og tiden er ændret. */
  flytning: Tidspatch | null;
  /** Alt andet (og hele patchen når der ikke er en flytning). */
  rest: Record<string, unknown>;
}

function sammeTid(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const ta = new Date(a).getTime(), tb = new Date(b).getTime();
  return Number.isFinite(ta) && Number.isFinite(tb) && ta === tb;
}

/** Er der en ÆNDRING af tiden i patchen (ikke bare feltet gentaget)? */
export function erTidsaendring(
  gemt: { starts_at: string; ends_at?: string | null },
  patch: Record<string, unknown>,
): boolean {
  const start = "starts_at" in patch && !sammeTid(gemt.starts_at, patch.starts_at as string | null | undefined);
  const slut = "ends_at" in patch && !sammeTid(gemt.ends_at ?? null, patch.ends_at as string | null | undefined);
  return start || slut;
}

/**
 * Deler patchen. Flytning KUN når status er published og tiden er ændret;
 * så bærer flytningen ALTID starts_at (den nye eller den gemte — flyt-event
 * skal have et fuldt tidspunkt), og ends_at kun hvis patchen har den.
 */
export function planlaegGem(
  gemt: { status: string; starts_at: string; ends_at?: string | null },
  patch: Record<string, unknown>,
): Gemplan {
  if (gemt.status !== "published" || !erTidsaendring(gemt, patch)) return { flytning: null, rest: { ...patch } };
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (!(TIDSFELTER as readonly string[]).includes(k)) rest[k] = v;
  const flytning: Tidspatch = { starts_at: (patch.starts_at as string | undefined) ?? gemt.starts_at };
  if ("ends_at" in patch) flytning.ends_at = (patch.ends_at as string | null | undefined) ?? null;
  return { flytning, rest };
}

/** Knappens tekst når udkastet indeholder en flytning af et publiceret event. */
export function gemKnapTekst(plan: Gemplan, tilmeldte: number): string {
  if (!plan.flytning) return "Gem";
  return tilmeldte > 0
    ? `Gem — ${tilmeldte} tilmeldt${tilmeldte === 1 ? "" : "e"} får besked om den nye tid`
    : "Gem — den nye tid";
}
