/**
 * webinarMotor/sessionplan — hvilke sessioner der kan vælges (skive 1, 30/9-2026).
 *
 * Spejlet ORDRET i src/lib/webinarMotor/sessionplan.ts
 * (paritetstest src/lib/__tests__/webinarMotor.paritet.test.ts). Nul imports.
 *
 * Gentagelser og JIT (materialiser, naesteJitSession) er skive 6 og bag flag
 * (beslutning G6). Her er kun «de næste N», som tilmeldingen og rummets
 * «Tag den næste session» bruger.
 */

export const SESSION_STATUSSER = ["planlagt", "aaben", "afholdt", "aflyst"] as const;
export type SessionStatus = (typeof SESSION_STATUSSER)[number];

/** eWebinars ord — så `session_type` på tilmeldingen passer til de eksisterende læsere. */
export const SESSION_TYPER = ["Scheduled", "JustInTime", "OnDemand"] as const;
export type SessionType = (typeof SESSION_TYPER)[number];

export interface SessionValg {
  id: string;
  starterMs: number;
  status: string;
  type: string;
  /** null = ingen grænse. */
  kapacitet: number | null;
  /** Antal tilmeldte (platformens rækker); null = ikke talt. */
  tilmeldte: number | null;
}

/** Så mange sessioner vises på tilmeldingssiden (spec §A1). */
export const VIS_SESSIONER = 3;

export const erFuld = (s: SessionValg): boolean => s.kapacitet !== null && s.tilmeldte !== null && s.tilmeldte >= s.kapacitet;

/**
 * De næste sessioner, man kan tilmelde sig: planlagt eller åben, starter EFTER
 * nu, ikke fuld — ældste først. En fuld session vises ikke (spec §A1).
 */
export function naesteSessioner(sessioner: readonly SessionValg[], nuMs: number, antal = VIS_SESSIONER): SessionValg[] {
  return sessioner
    .filter((s) => (s.status === "planlagt" || s.status === "aaben") && s.starterMs > nuMs && !erFuld(s))
    .sort((a, b) => a.starterMs - b.starterMs || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, antal));
}
