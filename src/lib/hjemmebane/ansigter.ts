/**
 * src/lib/hjemmebane/ansigter.ts — ansigterne på medlemmets forside
 * (forside PR 4, 17/9-2026 — Jonas «A på alle», valg 6: rådgiverens ansigt
 * ved næste skridt, forslag og events; analyse §5: «Hvor mangler der
 * menneskelige ansigter (rådgiverne, andre medlemmer)»).
 *
 * REN dom: ingen React, ingen Supabase. To kilder, begge SECURITY DEFINER-
 * RPC'er som medlemmer allerede kalder:
 *   - get_all_advisor_profiles (user_id, full_name, avatar_url) — én
 *     hentning på forsiden føder pushets afsender, «Dit næste skridt» og
 *     forslagene i «Din plan». Før hentedes den kun for pushets afsender.
 *   - get_community_feed (forfatter_id/_navn/_avatar_url, created_at) og
 *     get_member_directory (Netværket: vis_i_netvaerk, ingen rådgivere,
 *     ingen legat) — de seneste aktive medlemmer.
 *
 * VALG (skrevet, ikke gættet):
 *   - Et ansigt vises KUN når skridtet er fra en rådgiver (source_type
 *     "advisor") OG bærer proposed_by der findes blandt rådgiverne. AI-
 *     forslag (ai_weekly/agent) og refleksioner får intet ansigt — der er
 *     ingen at vise, og et rådgiveransigt på en maskines forslag ville
 *     være usandt. aftaler.forslagKilde («Fra din rådgiver») er fald-tilbage.
 *   - «Fra Morten»: fornavnet, som pushets overlinje (pushOverlinje).
 *   - Aktive medlemmer = forfattere af opslag OPRETTET de seneste 7 døgn,
 *     dublet-frit, nyeste først, højst 6 portrætter; tallet tæller alle.
 *     KUN dem der står i Netværket (synlige) — er Netværket ikke hentet
 *     endnu, vises ingen (fail-closed), aldrig «alle indtil videre».
 *     Rådgivere tælles ikke som medlemmer.
 * Testet i __tests__/ansigter.test.ts; kildeværn
 * src/lib/__tests__/forsideAnsigter.guard.test.ts.
 */

export interface RaadgiverProfil {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export type RaadgiverOpslag = ReadonlyMap<string, RaadgiverProfil>;

/** Tom opslagsliste — én delt instans, så useMemo-afhængigheder står stille. */
export const INGEN_RAADGIVERE: RaadgiverOpslag = new Map();

/** RPC-rækkerne → opslag pr. user_id. Rækker uden user_id springes over. */
export function raadgiverOpslag(
  rows: readonly { user_id?: string | null; full_name?: string | null; avatar_url?: string | null }[] | null | undefined,
): Map<string, RaadgiverProfil> {
  const m = new Map<string, RaadgiverProfil>();
  for (const r of rows ?? []) {
    if (!r.user_id) continue;
    m.set(r.user_id, { user_id: r.user_id, full_name: r.full_name?.trim() || null, avatar_url: r.avatar_url?.trim() || null });
  }
  return m;
}

/** «Morten Munk» → «Morten»; tom/null → null. */
export function fornavn(fullName: string | null | undefined): string | null {
  const t = fullName?.trim();
  if (!t) return null;
  return t.split(/\s+/)[0] || null;
}

export interface Ansigt {
  userId: string;
  navn: string;
  avatarUrl: string | null;
  /** «Fra Morten». */
  linje: string;
}

/** Rådgiverens ansigt ved et skridt/forslag — eller null (AI, refleksion,
    ukendt proposed_by, rådgiver uden navn). Aldrig et gæt. */
export function raadgiverAnsigt(
  skridt: { proposed_by?: string | null; source_type?: string | null },
  raadgivere: RaadgiverOpslag,
): Ansigt | null {
  if (skridt.source_type !== "advisor") return null;
  if (!skridt.proposed_by) return null;
  const p = raadgivere.get(skridt.proposed_by);
  if (!p) return null;
  const navn = p.full_name;
  const fn = fornavn(navn);
  if (!navn || !fn) return null;
  return { userId: p.user_id, navn, avatarUrl: p.avatar_url, linje: `Fra ${fn}` };
}

/** Pushets afsender fra samme opslag (før: egen hentning pr. author_user_id). */
export function afsender(userId: string | null | undefined, raadgivere: RaadgiverOpslag): { full_name: string; avatar_url: string | null } | null {
  if (!userId) return null;
  const p = raadgivere.get(userId);
  if (!p || !p.full_name) return null;
  return { full_name: p.full_name, avatar_url: p.avatar_url };
}

// ── Fællesskabet: de seneste aktive medlemmer ──

/** Det dommen læser af en feed-række (snit af CommunityTraad). */
export interface AktivTraad {
  forfatter_id: string;
  forfatter_navn: string | null;
  forfatter_avatar_url: string | null;
  created_at: string;
}

export interface AktivtMedlem {
  userId: string;
  navn: string | null;
  avatarUrl: string | null;
}

export interface AktiveMedlemmer {
  /** Højst AKTIVE_MAKS, nyeste først. */
  medlemmer: AktivtMedlem[];
  /** Alle synlige der har skrevet i vinduet — også dem ud over de viste. */
  antal: number;
  /** «N medlemmer har skrevet den seneste uge» — null ved nul. */
  tekst: string | null;
}

export const AKTIVE_DAGE = 7;
export const AKTIVE_MAKS = 6;

/** Netværkets medlemmer (get_member_directory) — rådgiverne er ikke medlemmer. */
export function synligeMedlemmer(directory: readonly { user_id: string; is_advisor: boolean }[]): Set<string> {
  return new Set(directory.filter((m) => !m.is_advisor).map((m) => m.user_id));
}

export function aktiveTekst(antal: number): string | null {
  if (antal <= 0) return null;
  return antal === 1 ? "1 medlem har skrevet den seneste uge" : `${antal} medlemmer har skrevet den seneste uge`;
}

export function aktiveMedlemmer(
  traade: readonly AktivTraad[],
  synlige: ReadonlySet<string> | null,
  nu: Date,
  dage = AKTIVE_DAGE,
  maks = AKTIVE_MAKS,
): AktiveMedlemmer {
  if (!synlige) return { medlemmer: [], antal: 0, tekst: null };
  const graense = nu.getTime() - dage * 86_400_000;
  const set = new Set<string>();
  const alle: AktivtMedlem[] = [];
  const nye = [...traade]
    .filter((t) => t.forfatter_id && synlige.has(t.forfatter_id) && Number.isFinite(new Date(t.created_at).getTime()) && new Date(t.created_at).getTime() >= graense && new Date(t.created_at).getTime() <= nu.getTime() + 60_000)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const t of nye) {
    if (set.has(t.forfatter_id)) continue;
    set.add(t.forfatter_id);
    alle.push({ userId: t.forfatter_id, navn: t.forfatter_navn?.trim() || null, avatarUrl: t.forfatter_avatar_url?.trim() || null });
  }
  return { medlemmer: alle.slice(0, maks), antal: alle.length, tekst: aktiveTekst(alle.length) };
}
