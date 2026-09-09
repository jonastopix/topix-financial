/**
 * src/lib/sidstOnline.ts
 *
 * «Sidst online» — rene funktioner, testet i __tests__/sidstOnline.test.ts.
 *
 * Jonas 8/9: «vi havde på et tidspunkt hvornår folk sidst var online. Det
 * synes jeg slet ikke fremgår nogen steder nu.» Kolonnen «Sidst aktiv» kom
 * 11/6 og forsvandt 4/9 med swappet til Hjemmebane — ikke ved en
 * beslutning, men fordi designet ikke nævnte den (recon-sidst-online.md).
 *
 * KILDEN er auth.users.last_sign_in_at via RPC'en get_users_last_login
 * (advisor-gated i kroppen, 20260507120000) — IKKE user_login_log: målt
 * 9/9 kl. 11:16 er de to kilder enige om datoen (24 af 24), men loggens
 * rækker tæller faneskift og reloads (Booking Innovation 618, BR Roset
 * 393), så ANTALLET er ubrugeligt. Kun datoen.
 *
 * DEFINITIONEN for en virksomhed: den SENESTE af alle medlemmers logins —
 * samme regel som den gamle forside (AdvisorDashboard.tsx:704: «MAX
 * (last_sign_in_at) over virksomhedens medlemmer»). På virksomhedssiden
 * (blok 7) står det pr. person, hvor pr. person giver mening.
 *
 * SPROGET er husets: «N dage siden» (listens «Sidste kontakt»,
 * virksomhedsSignalers «Ingen dialog i N dage»); «Aldrig logget ind» er
 * /members' ord (MemberCompanyRow.tsx:337) og designets løfte for blok 7
 * (raadgiverfladen-design.md:308). Dagene regnes som heleDageSiden
 * (virksomhedsSignaler.ts:206): hele døgn, floor.
 *
 * FARVEN: én grænse, ikke tre. Den gamle forside havde grøn <7, gul ≤21,
 * rød >21 — en trafiklys-skala ved siden af tavshedsdommen (21 dage,
 * alvor) ville være en anden dom for det samme. Rust er husets farve for
 * det der kræver noget; «har ikke været inde i tre måneder» kræver
 * måske noget, så rust fra 90 dage (samme tre måneder som isFiguresFresh
 * regner friskhed i). «Aldrig» får ingen farve: en virksomhed inviteret i
 * går har også «aldrig», og det kræver intet.
 */

const MS_PER_DOEGN = 86_400_000;

/** Rust fra og med så mange dage. Tre måneder — som friskhedsgaten. */
export const LAENGE_SIDEN_DAGE = 90;

/** Hele døgn siden et ISO-tidsstempel; null når intet stempel eller
    ulæseligt. Negativ (stempel i fremtiden, uret skævt) klippes til 0. */
export function dageSiden(iso: string | null | undefined, nu: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((nu.getTime() - t) / MS_PER_DOEGN));
}

/** Det seneste af flere stempler (ISO-strenge sorterer korrekt); null når
    ingen. Ulæselige og tomme springes over. */
export function senesteAf(isos: ReadonlyArray<string | null | undefined>): string | null {
  let seneste: string | null = null;
  for (const iso of isos) {
    if (!iso || Number.isNaN(new Date(iso).getTime())) continue;
    if (seneste === null || iso > seneste) seneste = iso;
  }
  return seneste;
}

/** «Online i dag» / «Online 1 dag siden» / «Online 63 dage siden» /
    «Aldrig logget ind». */
export function sidstOnlineTekst(dage: number | null): string {
  if (dage === null) return "Aldrig logget ind";
  if (dage <= 0) return "Online i dag";
  if (dage === 1) return "Online 1 dag siden";
  return `Online ${dage} dage siden`;
}

/** Rust når det er længe siden — ikke ved «aldrig». */
export function erLaengeSiden(dage: number | null): boolean {
  return dage !== null && dage >= LAENGE_SIDEN_DAGE;
}
