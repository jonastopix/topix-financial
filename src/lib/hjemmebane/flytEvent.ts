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

/**
 * Knappens tekst når udkastet indeholder en flytning af et publiceret event
 * (21/9): begge grupper tæller — de tilmeldte (tekst A) og de andre med
 * adgang (kan ikke + har ikke svaret, tekst B). Tallene kommer fra
 * get_event_svaroversigt (samme regel som flyt-event bruger).
 */
export function gemKnapTekst(plan: Gemplan, tilmeldte: number, andre: number): string {
  if (!plan.flytning) return "Gem";
  if (tilmeldte === 0 && andre === 0) return "Gem — den nye tid";
  return `Gem — ${grupperOrd(tilmeldte, andre)} får besked om den nye tid`;
}

function grupperOrd(tilmeldte: number, andre: number): string {
  const t = `${tilmeldte} tilmeldt${tilmeldte === 1 ? "" : "e"}`;
  const a = `${andre} ${andre === 1 ? "anden" : "andre"}`;
  return `${t} og ${a}`;
}

/** flyt-events svar, som fladen læser det (adminContentApi.flytEvent). Felterne
    `grupper`/`notified_grupper` findes KUN i koden fra 21/9 — de er beviset på,
    at den nye function er udrullet (CLAUDE.md «Deployment af edge functions»). */
export interface FlytSvar {
  ok: boolean;
  moved?: boolean;
  unchanged?: boolean;
  status?: string;
  recipients?: number;
  notified?: number;
  grupper?: { tilmeldte: number; andre: number };
  notified_grupper?: { tilmeldte: number; andre: number };
  notify_error?: string;
}

/**
 * BEVISET PÅ SKÆRMEN (21/9): den stille kvittering i EditorBar, når en
 * flytning er gemt. Tallene kan kun komme fra den nye function — svarer den
 * gamle, står der bare «Flyttet». null = ingen flytning (eller uændret tid):
 * kvitteringen er den almindelige «Gemt · tid».
 */
export function flytSvarTekst(svar: FlytSvar | null | undefined): string | null {
  if (!svar || svar.unchanged) return null;
  if (svar.notify_error) return `Flyttet — men beskederne gik ikke: ${svar.notify_error}`;
  if (svar.notified_grupper) {
    return `Flyttet — ${grupperOrd(svar.notified_grupper.tilmeldte, svar.notified_grupper.andre)} fik besked om den nye tid`;
  }
  if (svar.grupper) {
    return `Flyttet — kladde, ingen besked (${grupperOrd(svar.grupper.tilmeldte, svar.grupper.andre)} får besked, når den er publiceret og flyttes)`;
  }
  return "Flyttet";
}
