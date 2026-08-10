/** Datalag for medlemsprofilen (member_profiles, migration 20260810120000).
    Selve tabellen og get_member_directory-RPC'en er endnu ikke i de
    genererede Supabase-typer — deraf as any-kaldene (samme mønster som
    get_all_advisor_profiles i CompanyChatPane). Self-only RLS håndhæver
    ejerskabet på både læsning og upsert. */

import { supabase } from "@/integrations/supabase/client";

export type MemberProfileFields = {
  linkedin_url: string | null;
  expertise: string[];
  bio: string | null;
};

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
