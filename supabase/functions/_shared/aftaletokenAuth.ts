/**
 * Aftaletoken som legitimation — e-underskriftens auth-prædikat.
 *
 * SAMME KLASSE som verifyBetalingstoken (_shared/betalingstokenAuth.ts,
 * docs/indgangen-design.md §23): kalderen af aftale-underskrift er en person
 * UDEN Supabase-session — de har ingen konto endnu. Bucket A afviser en
 * anon-nøgle (ingen sub-claim), så legitimationen ligger i KALDET: tokenet
 * fra linket, 122 bit (uuid, gen_random_uuid), kan ikke gættes. Registreres
 * som prædikat i scripts/check-edge-function-auth.ts (udkastets diff).
 *
 * FORSKEL fra verifyBetalingstoken: dommen ligger IKKE i SQL. Betalingens
 * SQL-funktion svarer null for «må ikke betale, uanset grund», fordi siden
 * ikke skal kende grunden. Her SKAL siden kende grunden — «udløbet»,
 * «allerede underskrevet» og «annulleret» er tre forskellige skærme — så
 * prædikatet svarer rækken for ethvert KENDT token, og
 * afgoerAftaletilstand (ren, testet) dømmer bagefter. null = ukendt eller
 * misdannet token; de to skelnes ikke (samme neutrale svar som betalingen).
 *
 * Kald den FØR enhver anden service-role-handling — samme invariant som
 * husets øvrige prædikater. Rækken læses med service role på token-kolonnen
 * (UNIQUE); RLS-fælden fra 25/2 (politik «på token» = alle rækker) gælder
 * anon-politikker, ikke et service-role-opslag med tokenet som filterværdi.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const AFTALE_FELTER =
  "id, company_id, ansoegning_id, status, dokument_titel, dokument_tekst, dokument_aftryk, prisniveau_oere, modtager_email, modtager_navn, sendt_at, underskrevet_at, underskrevet_navn, pdf_sti, pdf_aftryk, kvittering_sendt_at";

export interface AftaleRaekke {
  id: string;
  company_id: string | null;
  /** D1: aftalen hører til ENTEN en ansøgning ELLER en virksomhed (CHECK). */
  ansoegning_id: string | null;
  status: "sendt" | "underskrevet" | "annulleret";
  dokument_titel: string;
  dokument_tekst: string;
  dokument_aftryk: string;
  prisniveau_oere: number | null;
  modtager_email: string;
  modtager_navn: string | null;
  sendt_at: string;
  underskrevet_at: string | null;
  underskrevet_navn: string | null;
  pdf_sti: string | null;
  pdf_aftryk: string | null;
  kvittering_sendt_at: string | null;
}

/** Rækken for et kendt token; null for ukendt eller misdannet. Kaster aldrig. */
export async function verifyAftaletoken(token: string, adminClient: SupabaseClient): Promise<AftaleRaekke | null> {
  if (!UUID_RE.test(token)) return null;
  const { data, error } = await adminClient
    .from("aftale_underskrift")
    .select(AFTALE_FELTER)
    .eq("token", token)
    .maybeSingle();
  if (error) {
    console.error("[verifyAftaletoken] opslag fejlede:", error);
    return null;
  }
  return (data as AftaleRaekke | null) ?? null;
}
