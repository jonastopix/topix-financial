/** Datalag for medlemsprofilen (member_profiles, migration 20260810120000).
    Selve tabellen og get_member_directory-RPC'en er endnu ikke i de
    genererede Supabase-typer — deraf as any-kaldene (samme mønster som
    get_all_advisor_profiles i CompanyChatPane). Self-only RLS håndhæver
    ejerskabet på både læsning og upsert. */

import { supabase } from "@/integrations/supabase/client";

/** DET fælles kolonnesæt fra visnings-RPC'erne (get_member_profile,
    get_event_participants, get_member_directory) — én type, ét sted.
    akademiApi's EventParticipant er et alias for denne. */
export type MemberProfile = {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  company_name: string | null;
  industry_label: string | null;
  website: string | null;
  linkedin_url: string | null;
  expertise: string[];
  bio: string | null;
  is_advisor: boolean;
};

export type MemberProfileFields = {
  linkedin_url: string | null;
  expertise: string[];
  bio: string | null;
};

/** Absolut href til eksterne links. Værdier uden protokol
    ("www.brroset.dk") er RELATIVE stier i et <a> — klikket lander på
    app.theboardroom.dk/medlemmer/www.brroset.dk i stedet for ude af
    siden. Feltet valideres bevidst ikke ved indtastning (et domæne uden
    protokol er ikke en fejl); reparationen sker her ved visning. */
export function externalHref(raw: string | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Én brugers visningsprofil via get_member_profile-RPC'en (SECURITY
    DEFINER; gates BEVIDST ikke på medlemskab — historiske deltagere skal
    kunne slås op). RETURNS TABLE → array; første række eller null.
    22P02 (ugyldig uuid) er "ikke fundet", ikke en fejl (getEvent-mønstret). */
export async function getMemberProfile(userId: string): Promise<MemberProfile | null> {
  const { data, error } = await supabase.rpc("get_member_profile" as any, {
    p_user_id: userId,
  });
  if (error) {
    if ((error as { code?: string }).code === "22P02") return null;
    throw new Error(error.message);
  }
  const rows = (data ?? []) as unknown as MemberProfile[];
  return rows[0] ?? null;
}

/** Egen række — null når profilen aldrig er udfyldt (normalt udfald). */
export async function getMyMemberProfile(userId: string): Promise<MemberProfileFields | null> {
  const { data, error } = await supabase
    .from("member_profiles" as any)
    .select("linkedin_url, expertise, bio")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as MemberProfileFields | null) ?? null;
}

/** Upsert på user_id (PK) — første gem opretter rækken. */
export async function saveMyMemberProfile(
  userId: string,
  fields: MemberProfileFields,
): Promise<void> {
  const { error } = await supabase
    .from("member_profiles" as any)
    .upsert({ user_id: userId, ...fields }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

/** Alle unikke expertise-værdier på tværs af netværket, alfabetisk —
    FORSLAG til tag-inputtet, aldrig en spærring (fri tekst er tilladt).
    Går via get_member_directory, så listen kun bygger på aktive
    medlemskaber (RPC'ens eget filter). */
export async function listExistingExpertise(): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_member_directory" as any);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { expertise: string[] | null }[];
  const unique = new Set<string>();
  for (const row of rows) {
    for (const tag of row.expertise ?? []) {
      const trimmed = tag.trim();
      if (trimmed) unique.add(trimmed);
    }
  }
  return [...unique].sort((a, b) => a.localeCompare(b, "da"));
}
