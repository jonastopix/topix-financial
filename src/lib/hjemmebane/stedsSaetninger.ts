/**
 * src/lib/hjemmebane/stedsSaetninger.ts — «Det her er stedet, hvor …»
 * (seks steder, 2/10-2026 nat, FORBEREDT — afventer Jonas' ja kl. 08:15).
 *
 * Jonas 1/10 22:50: «Vi skal virkelig steppe op på UX, så medlemmer føler
 * sig holdt i hånden … Enkelthed er et nøgleord.» Hvert af det fulde
 * medlems seks steder (menuen i hbNav.ts: SEKS_STEDER) får ÉN sætning
 * øverst, der siger, hvad stedet er til. Sætningerne er forslagets
 * (ia-forslag, 1/10) — tre rettet efter rådets fund 2/10 (dine_tal,
 * netvaerket, akademiet; begrundelsen står ved hver) — og bor KUN her — fladen (HbStedsSaetning)
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
 * Abonnenten og rådgiveren får ingen sætninger (komponentens gate,
 * `visStedsSaetning` nedenfor): abonnenten har ikke de seks steder, og
 * sætningerne taler til medlemmet.
 */

export type Sted = "boardroom" | "dine_tal" | "dine_maal" | "netvaerket" | "akademiet" | "din_raadgiver";

/** Sætningerne — forslagets formuleringer ordret. */
export const STEDS_SAETNINGER: Readonly<Record<Sted, string>> = {
  boardroom:
    "Det her er stedet, hvor du ser, hvordan din virksomhed har det, og hvad dit næste skridt er. Alt andet er ét klik væk i menuen.",
  // Rådets fund 5 (2/10): ÉN sætning, der er sand på alle tre stier — /reports
  // (afleverer), /kpis (nøgletallene) og /budget (budgettet). Den gamle
  // («upload, godkend, læs») var kun sand på Rapportering.
  dine_tal:
    "Det her er stedet, hvor du afleverer dine tal hver måned, følger nøgletallene og lægger budgettet — og ser, hvad tallene fortæller.",
  dine_maal:
    "Det her er stedet, hvor du sætter mål for virksomheden og bryder dem ned i skridt med en frist. Et mål er nået, når du selv siger det.",
  // Rådets fund 4 (2/10): «Community er forsiden.» er taget ud — den
  // forudsætter fanerne (skridt 2) og var usand på Events/Medlemmerne/
  // Fordele/Anbefal. Læg sætningen tilbage i skridt 2, når Netværket ER
  // én side med Community som første fane.
  netvaerket:
    "Det her er stedet, hvor du møder de andre medlemmer — spørg, svar, mød op, og få de andres fordele.",
  // Rådets fund 13 (2/10): «ofte med en øvelse» — det er UMÅLT, at hver
  // lektion har én; «i hver» lovede noget, ingen har talt.
  akademiet:
    "Det her er stedet, hvor du lærer det, du skal bruge — korte lektioner, ofte med en øvelse, som du udfylder og tager med til din rådgiver.",
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

/** Steder, hvis forside TEGNER SÆTNINGEN SELV — under sin egen h1, i stedet
    for sidens intro (rådets fund 7, 2/10: tre introer stablet — skallens
    sætning over sidens eyebrow → h1 → intro-<p> gav tre indledninger).
    Hierarkiet er nu ÉT: eyebrow → h1 → sætningen. Det gælder de otte
    forsider med det redaktionelle hoved (eyebrow + h1); de fem uden et
    sådant hoved (forsiden tegner selv under hilsenen; Community, Anbefal,
    chatten og booking har intet eyebrow → h1-hoved) får sætningen fra
    skallen som før — dér er den den ENESTE indledning, så intet stables.
    Skallen springer stierne her over (`skallenTegnerSaetning`); værnet
    (seksSteder.guard dom 3) kræver, at hver sti her har en view, der
    tegner `<HbStedsSaetning sti="<sti>"`. */
export const STEDER_MED_EGET_HOVED: ReadonlySet<string> = new Set([
  "/reports", "/kpis", "/budget", "/milestones", "/events", "/medlemmer", "/rabataftaler", "/akademiet",
]);

/** Tegner SKALLEN sætningen for stien? Nej på forsiden (BoardroomView
    tegner den under hilsenen) og nej på de steder, der har eget hoved. */
export function skallenTegnerSaetning(pathname: string): boolean {
  const sti = normaliser(pathname);
  const sted = STEDERNES_STIER[sti] ?? null;
  return sted !== null && sted !== "boardroom" && !STEDER_MED_EGET_HOVED.has(sti);
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

/** HVEM ser sætningen (rådets fund 2, 2/10): FAIL-CLOSED.
    - Medlemmet: KUN `membershipTier === "full"`. Tieren er null, mens
      useAuth henter — og i det første render er en abonnent også null. Med
      «ikke abonnent» (`!== "subscriber"`) ville abonnenten se Netværkets
      sætning et øjeblik, før tieren landede. null = intet; «expired» = intet.
    - Rådgiveren: KUN i «Se som medlem» (viewingAsMember) — aldrig af tieren,
      for useAuth sætter rådgiveren til «full», og `tier === "full"` alene
      ville tegne medlemmets sætning på rådgiverens egne flader (/chat er
      Indbakken, /community, /events, /akademiet …). */
export function visStedsSaetning({ isAdvisor, viewingAsMember, membershipTier }: {
  isAdvisor: boolean;
  viewingAsMember: boolean;
  membershipTier: "full" | "subscriber" | "expired" | null;
}): boolean {
  return isAdvisor ? viewingAsMember : membershipTier === "full";
}
