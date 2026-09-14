/**
 * Skabelonvalget i send-invitation-email — DB-rækken «Invitation til
 * virksomhed» eller husets fallback (invitationsMail.ts). Skrevet 14/9 2026.
 *
 * HVORFOR DEN FINDES: før stod valget som `if (tpl && tpl.enabled)` efter et
 * maybeSingle()-opslag hvor error ikke blev læst. Ingen række, enabled=false,
 * flere rækker (PGRST116 fra postgrest-js) og en opslagsfejl gav alle
 * fallback — i tavshed, og email_send_log fik samme template_name på begge
 * veje. Målt i prod 14/9: rækken findes med enabled=false, og ingen log
 * sagde det.
 *
 * NU læses ALLE rækker med navnet (intet maybeSingle), og dommen falder her,
 * ren og testet (src/lib/__tests__/invitationsMail.test.ts). Rækkefølgen:
 *   1. opslagsfejl   — error fra Supabase; detaljen bæres med til loggen
 *   2. ingen_raekke  — nul rækker
 *   3. flere_raekker — mere end én række med navnet; ingen af dem bruges,
 *                      for vi kan ikke vide hvilken der er den rigtige
 *   4. enabled_false — præcis én række, slået fra
 *   5. skabelon      — præcis én række, slået til
 *
 * REN: ingen IO. Kalderen logger skabelonvalgLogtekst() og lægger vej +
 * årsag i email_send_log.metadata — template_name ('invitation') røres IKKE,
 * den har aftagere (src/hooks/invitationer.ts:62, EmailLogView.tsx:77).
 */

export const SKABELON_NAVN = "Invitation til virksomhed";

export interface SkabelonRaekke {
  id: string;
  subject: string;
  body_html: string;
  sender_name: string | null;
  sender_email: string | null;
  enabled: boolean;
}

export type FallbackAarsag = "opslagsfejl" | "ingen_raekke" | "flere_raekker" | "enabled_false";

export type Skabelonvalg =
  | { vej: "skabelon"; raekke: SkabelonRaekke }
  | { vej: "fallback"; aarsag: FallbackAarsag; detalje: string | null };

export interface SkabelonOpslag {
  raekker: SkabelonRaekke[] | null;
  fejl: { message: string; code?: string | null } | null;
}

export function afgoerSkabelonvalg(opslag: SkabelonOpslag): Skabelonvalg {
  if (opslag.fejl) {
    const kode = opslag.fejl.code ? `${opslag.fejl.code}: ` : "";
    return { vej: "fallback", aarsag: "opslagsfejl", detalje: `${kode}${opslag.fejl.message}` };
  }
  const raekker = opslag.raekker ?? [];
  if (raekker.length === 0) {
    return { vej: "fallback", aarsag: "ingen_raekke", detalje: null };
  }
  if (raekker.length > 1) {
    return { vej: "fallback", aarsag: "flere_raekker", detalje: `${raekker.length} rækker med navnet «${SKABELON_NAVN}»` };
  }
  const raekke = raekker[0];
  if (raekke.enabled !== true) {
    return { vej: "fallback", aarsag: "enabled_false", detalje: `række ${raekke.id}` };
  }
  return { vej: "skabelon", raekke };
}

/** Én linje til loggen: vejen, årsagen og detaljen — så en logsøgning siger hvad der blev sendt. */
export function skabelonvalgLogtekst(valg: Skabelonvalg): string {
  if (valg.vej === "skabelon") {
    return `[send-invitation-email] skabelonvalg: skabelon (række ${valg.raekke.id}, «${SKABELON_NAVN}» enabled=true)`;
  }
  const detalje = valg.detalje ? ` — ${valg.detalje}` : "";
  return `[send-invitation-email] skabelonvalg: fallback (${valg.aarsag}${detalje})`;
}

/** Det der lægges i email_send_log.metadata, så loggen siger vejen uden at template_name ændres. */
export function skabelonvalgMetadata(valg: Skabelonvalg): Record<string, string | null> {
  if (valg.vej === "skabelon") {
    return { skabelonvalg: "skabelon", skabelon_id: valg.raekke.id, fallback_aarsag: null };
  }
  return { skabelonvalg: "fallback", skabelon_id: null, fallback_aarsag: valg.aarsag };
}
