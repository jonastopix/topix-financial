/**
 * supabase/functions/_shared/forslagEngine.ts
 *
 * Afgørelses-motoren for agent-forslag (design §7): den ene sandhed for
 * hvilke afgørelser der er gyldige, fra hvilke tilstande, og hvilke
 * felter en afgørelse sætter. Bor i _shared efter opgaveEngine-mønstret:
 * edge-funktionen (agent-forslag-afgoer) eksekverer, motoren dømmer.
 *
 * Nul imports, så filen kan læses af både Deno og Vitest.
 * Testet i src/lib/__tests__/forslagEngine.test.ts.
 *
 * Bemærk decided_by: motoren tager KALDERENS callerId som parameter —
 * der findes ingen vej fra request-body til decided_by, hverken her
 * eller i edge-funktionen (spejler agentens company_id-tvangsoverskrivning).
 */

export type Afgoerelse = "approve" | "approve_edited" | "reject";

export const AFGOERELSER: readonly Afgoerelse[] = ["approve", "approve_edited", "reject"];

/** De skriveveje godkendelse kan UDFØRE i dag — præcis de idempotente
    (agentSkriveveje.ts). Øvrige tools kan forkastes, men ikke godkendes,
    før deres gentagelses-semantik er besluttet. write_session_prep udgik
    med C3 (docs/chat-design.md, 31/8) — gamle session_prep-forslag kan
    dermed kun forkastes. */
export const UNDERSTOETTEDE_SKRIVEVEJE: ReadonlySet<string> = new Set([
  "update_weekly_focus",
]);

export type Dom = { ok: true } | { ok: false; grund: string };

/** Forkast-kategorierne (design §4.4): DEN ene eksporterede sandhed om
    værdisættet — stabile slugs, ALDRIG visningstekst. Kategorien er den
    tællelige dom; decision_reason er det menneskelige fritekst-spor.
    En grund der ikke kan tælles er ikke læring. Spejler DB-CHECK'en
    agent_proposals_decision_category_valid (migration 20260825230000);
    fladen spejler sættet med paritetstest. */
export const FORKAST_KATEGORIER: readonly string[] = [
  "ikke_relevant",
  "forkert_tolkning",
  "allerede_talt_om",
  "forkert_timing",
  "andet",
] as const;

/** Kategori-dommen — SEPARAT fra validerInput, så input-kontrakten fra
    PR #428 står urørt: reject KRÆVER en kendt kategori-slug (spejler
    DB-constrainten forkast_kraever_kategori); approve/approve_edited
    AFVISER en medsendt kategori — en godkendelse har ingen forkast-dom. */
export function validerKategori(decision: Afgoerelse, category: unknown): Dom {
  if (decision === "reject") {
    if (typeof category !== "string" || !FORKAST_KATEGORIER.includes(category)) {
      return {
        ok: false,
        grund: `en forkastelse kræver en decision_category fra sættet: ${FORKAST_KATEGORIER.join(", ")}`,
      };
    }
    return { ok: true };
  }
  if (category !== undefined && category !== null) {
    return { ok: false, grund: `decision_category er kun gyldig ved reject — ikke ved ${decision}` };
  }
  return { ok: true };
}

function erAlmindeligtObjekt(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Input-dommen: decision skal være kendt; reject kræver ikke-tom grund
    (spejler DB-constrainten forkast_kraever_grund — motoren fejler FØR
    databasen ville); approve_edited kræver et objekt som edited_args. */
export function validerInput(
  decision: unknown,
  reason: unknown,
  editedArgs: unknown,
): Dom {
  if (typeof decision !== "string" || !(AFGOERELSER as readonly string[]).includes(decision)) {
    return { ok: false, grund: "decision skal være approve, approve_edited eller reject" };
  }
  if (decision === "reject") {
    if (typeof reason !== "string" || reason.trim().length === 0) {
      return { ok: false, grund: "en forkastelse kræver en grund (A4) — reason mangler eller er tom" };
    }
  }
  if (decision === "approve_edited" && !erAlmindeligtObjekt(editedArgs)) {
    return { ok: false, grund: "approve_edited kræver edited_args som objekt" };
  }
  return { ok: true };
}

/** Tilstandsdommen: kun 'proposed' kan afgøres — alt andet er en ærlig
    fejl, aldrig stiltiende succes. */
export function kanAfgoeres(status: string): Dom {
  if (status !== "proposed") {
    return { ok: false, grund: `forslaget kan ikke afgøres fra status '${status}' — kun 'proposed'` };
  }
  return { ok: true };
}

/** Skrivegrundlaget: approve_edited bruger rådgiverens redigerede args;
    approve bruger agentens originale. args røres ALDRIG i databasen. */
export function skrivegrundlag(
  decision: Afgoerelse,
  args: Record<string, unknown>,
  editedArgs: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return decision === "approve_edited" ? (editedArgs ?? {}) : args;
}

export interface AfgoerelsesPatch {
  status: "approved" | "rejected";
  decided_by: string;
  decided_at: string;
  decision_reason?: string;
  decision_category?: string;
  applied_at?: string;
  edited_args?: Record<string, unknown>;
}

/** Felterne en afgørelse sætter. decided_by er ALTID callerId-parameteren.
    applied_at sættes kun ved godkendelse — og edge-funktionen kalder
    denne EFTER at skrivningen er lykkedes (fejlet skrivning = rækken
    forbliver 'proposed'). */
export function afgoerelsesPatch(
  decision: Afgoerelse,
  callerId: string,
  nu: Date,
  reason?: string,
  editedArgs?: Record<string, unknown>,
  decisionCategory?: string,
): AfgoerelsesPatch {
  const decidedAt = nu.toISOString();
  if (decision === "reject") {
    const patch: AfgoerelsesPatch = {
      status: "rejected",
      decided_by: callerId,
      decided_at: decidedAt,
      decision_reason: (reason ?? "").trim(),
    };
    // Kategorien sættes kun når den er givet — edge-funktionen giver den
    // altid (validerKategori kræver den); udeladelsen holder ældre
    // kaldeformer (og PR #428-testene) gyldige.
    if (decisionCategory !== undefined) patch.decision_category = decisionCategory;
    return patch;
  }
  const patch: AfgoerelsesPatch = {
    status: "approved",
    decided_by: callerId,
    decided_at: decidedAt,
    applied_at: decidedAt,
  };
  if (decision === "approve_edited") {
    patch.edited_args = editedArgs ?? {};
  }
  return patch;
}
