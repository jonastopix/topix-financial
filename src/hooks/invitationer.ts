/**
 * src/hooks/invitationer.ts
 *
 * Hentning og DEN ENE skrivevej for invitationer i det nye design (9/9):
 * /virksomheder (åbne på tværs) og virksomhedssiden (pr. virksomhed) kalder
 * de samme funktioner. Husets to tjek på hver skrivning — error OG antal
 * berørte rækker — og ingen optimistisk patch: kalderen invaliderer.
 * De rene dele (åbne, alder, tal, e-mail) bor i src/lib/invitationer.ts.
 *
 * MAILEN: send-invitation-email afgør selv virksomhedsnavn og signup-link
 * ud fra invitationsrækken (funktionen «cannot be used as a phishing
 * relay», :107-160) — klienten sender KUN e-mailen. Gensend = samme kald.
 * OPRET: findes rækken (virksomhed + e-mail) genbruges den (accepteret →
 * nulstilles til pending), ellers indsættes den — Members' regel
 * (:900-990), uden 23505-racen (én bruger ad gangen). RLS: rådgivere har
 * SELECT/INSERT/UPDATE/DELETE på company_invitations.
 */

import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { kraevRaekker } from "@/lib/kraevRaekker";
import { aabneInvitationer, normaliserEmail, type InvitationRaekke } from "@/lib/invitationer";

export const INVITATIONER_KEY = ["invitationer"] as const;

export interface AabenInvitation extends InvitationRaekke {
  virksomhedNavn: string | null;
  /** Seneste afsendte invitationsmail til adressen (email_send_log), ellers null. */
  sidstSendtAt: string | null;
}

export interface Invitationsdata {
  aabne: AabenInvitation[];
  alle: InvitationRaekke[];
  /** company_id → antal medlemmer (til tallene). */
  medlemmerPrVirksomhed: Map<string, number>;
  virksomheder: { id: string; name: string }[];
}

export async function hentInvitationer(): Promise<Invitationsdata> {
  const [invRes, compRes, memRes] = await Promise.all([
    supabase.from("company_invitations").select("id, company_id, email, status, created_at, accepted_at").order("created_at", { ascending: true }).limit(2000),
    supabase.from("companies").select("id, name, is_legat").order("name").limit(500),
    supabase.from("company_members").select("company_id").limit(2000),
  ]);
  const alle = kraevRaekker(invRes, "company_invitations") as InvitationRaekke[];
  const virksomheder = (kraevRaekker(compRes, "companies") as { id: string; name: string | null; is_legat: boolean | null }[])
    .filter((c) => !c.is_legat && c.name)
    .map((c) => ({ id: c.id, name: c.name as string }));
  const navnAf = new Map(virksomheder.map((c) => [c.id, c.name]));
  const medlemmerPrVirksomhed = new Map<string, number>();
  for (const m of (memRes.data ?? []) as { company_id: string }[]) {
    medlemmerPrVirksomhed.set(m.company_id, (medlemmerPrVirksomhed.get(m.company_id) ?? 0) + 1);
  }
  const aabne = aabneInvitationer(alle);
  // «Sendt {dato}» kun med spor i mailloggen (Members.tsx:363-385, 7/9).
  const sidstSendt = new Map<string, string>();
  if (aabne.length > 0) {
    const { data: logs } = await supabase
      .from("email_send_log")
      .select("recipient_email, created_at")
      .eq("template_name", "invitation")
      .eq("status", "sent")
      .in("recipient_email", aabne.map((i) => i.email))
      .order("created_at", { ascending: false })
      .limit(1000);
    for (const l of (logs ?? []) as { recipient_email: string; created_at: string }[]) {
      if (!sidstSendt.has(l.recipient_email)) sidstSendt.set(l.recipient_email, l.created_at);
    }
  }
  return {
    aabne: aabne.map((i) => ({ ...i, virksomhedNavn: i.company_id ? navnAf.get(i.company_id) ?? null : null, sidstSendtAt: sidstSendt.get(i.email) ?? null })),
    alle,
    medlemmerPrVirksomhed,
    virksomheder,
  };
}

/** Gensend: mailen bygges serverside af rækken. */
export async function gensendInvitation(email: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("send-invitation-email", { body: { email: normaliserEmail(email) } });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
}

export async function sletInvitation(id: string): Promise<void> {
  const { data, error } = await supabase.from("company_invitations").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Sletningen ramte nul rækker — invitationen står stadig (RLS).");
}

/** Opret (eller genbrug) og send. companyId null = personen opretter selv en virksomhed. */
export async function opretInvitation(input: { email: string; companyId: string | null; invitedBy: string }): Promise<{ gensendt: boolean }> {
  const email = normaliserEmail(input.email);
  let eksisterende = supabase.from("company_invitations").select("id, status").eq("email", email);
  eksisterende = input.companyId ? eksisterende.eq("company_id", input.companyId) : eksisterende.is("company_id", null);
  const { data: fundet, error: laeseFejl } = await eksisterende.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (laeseFejl) throw new Error(laeseFejl.message);
  let gensendt = false;
  if (fundet) {
    gensendt = true;
    if (fundet.status === "accepted") {
      const { data, error } = await supabase
        .from("company_invitations")
        .update({ status: "pending", accepted_at: null, accepted_by: null })
        .eq("id", fundet.id)
        .select("id");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error("Nulstillingen ramte nul rækker — invitationen er IKKE genåbnet (RLS).");
    }
  } else {
    const { data, error } = await supabase
      .from("company_invitations")
      .insert({ company_id: input.companyId, email, invited_by: input.invitedBy })
      .select("id");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error("Oprettelsen ramte nul rækker — invitationen er IKKE gemt (RLS).");
  }
  await gensendInvitation(email);
  return { gensendt };
}

/** Alle læsere af invitationer: listen, virksomhedssiden og /members' data. */
export async function invaliderInvitationer(queryClient: QueryClient, companyId?: string | null): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: [...INVITATIONER_KEY] }),
    queryClient.invalidateQueries({ queryKey: ["virksomhedsliste"] }),
    ...(companyId ? [queryClient.invalidateQueries({ queryKey: ["virksomhed", companyId] })] : []),
  ]);
}
