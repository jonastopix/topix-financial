/**
 * src/lib/hjemmebane/stedsSaetninger.ts — «Det her er stedet, hvor …»
 * (seks steder, 2/10-2026 nat, FORBEREDT — afventer Jonas' ja kl. 08:15).
 *
 * Jonas 1/10 22:50: «Vi skal virkelig steppe op på UX, så medlemmer føler
 * sig holdt i hånden … Enkelthed er et nøgleord.» Hvert af det fulde
 * medlems seks steder (menuen i hbNav.ts: SEKS_STEDER) får ÉN sætning
 * øverst, der siger, hvad stedet er til. Sætningerne er forslagets
 * (ia-forslag, 1/10) ordret og bor KUN her — fladen (HbStedsSaetning)
 * tegner dem, skallen (HbMemberShell) vælger dem af stien, og ingen
 * flade skriver sin egen. REN dom, ingen React; testet i
 * __tests__/stedsSaetninger.test.ts og låst af seksSteder.guard.
 *
 * Stien afgør stedet — ikke `active` — fordi `active` deles af et sted og
 * dets undersider (community: feedet OG trådsiderne; medlemmer: listen OG
 * profilerne; akademiet: alle fire dybder), og sætningen hører KUN til
 * stedets egen forside. Kun de nøjagtige stier nedenfor giver en sætning;
 * en underside (/community/:id, /events/:id, /akademiet/:area) giver null.
 * «Dine tal» er tre stier (Rapportering, KPI'er, Budget) og «Netværket» fem
 * (Community, Events, Medlemmerne, Fordele, Anbefal) — samme sætning på
 * hver, så stedet er det samme uanset hvilken dør man kom ind ad.
 *
 * Abonnenten og rådgiveren får ingen sætninger (skallens gate): abonnenten
 * har ikke de seks steder, og sætningerne taler til medlemmet.
 */

export type Sted = "boardroom" | "dine_tal" | "dine_maal" | "netvaerket" | "akademiet" | "din_raadgiver";

/** Sætningerne — forslagets formuleringer ordret. */
export const STEDS_SAETNINGER: Readonly<Record<Sted, string>> = {
  boardroom:
    "Det her er stedet, hvor du ser, hvordan din virksomhed har det, og hvad dit næste skridt er. Alt andet er ét klik væk i menuen.",
  dine_tal:
    "Det her er stedet, hvor du afleverer dine tal hver måned og ser, hvad de fortæller. Ét skridt: upload, godkend, læs.",
  dine_maal:
    "Det her er stedet, hvor du sætter mål for virksomheden og bryder dem ned i skridt med en frist. Et mål er nået, når du selv siger det.",
  netvaerket:
    "Det her er stedet, hvor du møder de andre medlemmer — spørg, svar, mød op, og få de andres fordele. Community er forsiden.",
  akademiet:
    "Det her er stedet, hvor du lærer det, du skal bruge — korte lektioner med en øvelse i hver, som du udfylder og tager med til din rådgiver.",
  din_raadgiver:
    "Det her er stedet, hvor du skriver til os og booker en session. Vi svarer på hverdage — og vi er sammen om dig, så du skriver til begge.",
};

/** Stedets forside(r) — nøjagtige stier. Ruterne er uændrede (menuen i hbNav.ts). */
export const STEDERNES_STIER: Readonly<Record<string, Sted>> = {
  "/": "boardroom",
  "/reports": "dine_tal",
  "/kpis": "dine_tal",
  "/budget": "dine_tal",
  "/milestones": "dine_maal",
  "/community": "netvaerket",
  "/events": "netvaerket",
  "/medlemmer": "netvaerket",
  "/rabataftaler": "netvaerket",
  "/deling": "netvaerket",
  "/akademiet": "akademiet",
  "/chat": "din_raadgiver",
  "/book-session": "din_raadgiver",
};

/** Normaliseret sti: uden query/hash og uden efterstillet skråstreg (roden
    er «/»; en tom streng er ingen sti og giver intet sted). */
function normaliser(pathname: string): string {
  const uden = pathname.split(/[?#]/)[0];
  if (uden === "") return "";
  const trimmet = uden.replace(/\/+$/, "");
  return trimmet === "" ? "/" : trimmet;
}

/** Hvilket sted er stien forsiden for? null = ingen (underside, rådgiverflade, konto …). */
export function stedForSti(pathname: string): Sted | null {
  return STEDERNES_STIER[normaliser(pathname)] ?? null;
}

/** Sætningen for stien — eller null, når stien ikke er et steds forside. */
export function stedsSaetning(pathname: string): string | null {
  const sted = stedForSti(pathname);
  return sted ? STEDS_SAETNINGER[sted] : null;
}
