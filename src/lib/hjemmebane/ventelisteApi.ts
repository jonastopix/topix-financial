/**
 * src/lib/hjemmebane/ventelisteApi.ts — ventelistens læse- og skrivevej fra
 * rådgiverfladen (udkast 18/9). Læsning: ventepladser med ansøgningens
 * navn og lukket_at (RLS: advisor SELECT på begge). Skrivning: KUN gennem
 * venteliste-handling (Bucket A) — fladen skriver aldrig i tabellen selv, så
 * der aldrig findes et tilbud uden trappe og mail.
 */
import { supabase } from "@/integrations/supabase/client";
import type { VentepladsRaekke } from "@/lib/ventelisteDom";

export interface VentepladsVisning extends VentepladsRaekke {
  hvorfor: string | null;
  tilbud_udloeber_at: string | null;
  ansoegerNavn: string;
}

/** Ansøgerens virksomhedsnavn som A's virksomhedsnavnAf: CVR-opslagets navn, ellers personens navn, ellers mailen. */
export function ansoegerNavn(a: { navn: string | null; email: string | null; cvr_opslag: { navn?: string | null } | null } | null): string {
  const cvr = a?.cvr_opslag?.navn?.trim();
  if (cvr) return cvr;
  const navn = a?.navn?.trim();
  if (navn) return navn;
  return a?.email?.trim() || "ukendt ansøger";
}

export async function hentVenteliste(companyId: string): Promise<VentepladsVisning[]> {
  const { data, error } = await supabase
    .from("ventepladser" as never)
    .select("id, ansoegning_id, company_id, status, hvorfor, sat_at, tilbud_udloeber_at, tidligst_tilbud_at, ansoegninger(lukket_at, navn, email, cvr_opslag)" as never)
    .eq("company_id" as never, companyId as never)
    .in("status" as never, ["venter", "tilbudt"] as never);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => {
    const a = (r.ansoegninger as { lukket_at?: string | null; navn: string | null; email: string | null; cvr_opslag: { navn?: string | null } | null } | null) ?? null;
    return {
      id: r.id as string,
      ansoegning_id: r.ansoegning_id as string,
      company_id: r.company_id as string,
      status: r.status as VentepladsRaekke["status"],
      hvorfor: (r.hvorfor as string | null) ?? null,
      sat_at: r.sat_at as string,
      tilbud_udloeber_at: (r.tilbud_udloeber_at as string | null) ?? null,
      afvist_at: a?.lukket_at ?? null,
      tidligst_tilbud_at: (r.tidligst_tilbud_at as string | null) ?? null,
      ansoegerNavn: ansoegerNavn(a),
    };
  });
}

async function kald(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke("venteliste-handling", {
    body,
    headers: { Authorization: `Bearer ${session?.access_token}` },
  });
  if (error) {
    let tekst = error.message;
    try {
      const t = await (error as { context?: Response }).context?.text();
      if (t) tekst = (JSON.parse(t) as { error?: string }).error ?? t;
    } catch { /* behold error.message */ }
    throw new Error(tekst);
  }
  return (data as Record<string, unknown>) ?? {};
}

/** MENNESKET TRYKKER: første i køen får tilbuddet og 7 dage. */
export function tilbydPladsen(companyId: string): Promise<Record<string, unknown>> {
  return kald({ handling: "tilbyd", company_id: companyId });
}
export function fjernFraVenteliste(ventepladsId: string): Promise<Record<string, unknown>> {
  return kald({ handling: "fjern", venteplads_id: ventepladsId });
}
export function saetPaaVenteliste(ansoegningId: string, companyId: string, hvorfor: string | null, tidligstTilbudAt: string | null = null): Promise<Record<string, unknown>> {
  return kald({ handling: "saet", ansoegning_id: ansoegningId, company_id: companyId, hvorfor, tidligst_tilbud_at: tidligstTilbudAt });
}
