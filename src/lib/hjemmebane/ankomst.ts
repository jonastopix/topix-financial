/**
 * src/lib/hjemmebane/ankomst.ts
 *
 * Ankomstens to løse ender (docs/indgangen-overhaling.md §10, 3/9) som rene
 * domme — nul imports, ingen React, testet i __tests__/ankomst.test.ts.
 *
 * 1. VELKOMST-HASHEN. Velkomst-punktet har sti "" (onboardingTjekliste.ts:
 *    TJEKLISTE_STIER), fordi videoen åbner i tjekliste-boksens egen
 *    overlejring og ikke på en side. Fokuskortet på forsiden kunne derfor
 *    ikke åbne den: boksen er et søskende til <main> i HbMemberShell, og
 *    dens `videoAaben` er komponent-state uden context, event eller prop.
 *    Vejen er URL-hashen — mønstret findes allerede (FocusCards hash-
 *    CTA'er, useScrollToHash, Guide-kontrakten /kpis#goals): kortet linker
 *    til "#velkomst", boksen læser hashen med useLocation, åbner
 *    overlejringen og RYDDER hashen (replace), så den ikke hænger i URL'en
 *    og genåbner ved næste navigation. Valgt frem for en tredje context
 *    (huset har to: auth og viewMode) og frem for at flytte overlejringen
 *    ud af boksen — hashen kræver ingen ny kobling mellem søskende.
 *
 * 2. PILLEN TRÆKKER SIG — KUN på forsiden, og KUN når fokuskortet FAKTISK
 *    viser tjeklisten. Dommen er den samme som motorens:
 *    tjeklistenStyrerForsiden (afsnit 4). Er tjeklisten færdig — eller er
 *    medlemmet erfarent (30/9) — viser kortet
 *    noget andet, og boksen opfører sig som i dag (lykønskningen). På alle
 *    andre sider bliver pillen stående: der er intet fokuskort dér, og
 *    pillen er det eneste der minder medlemmet om hvad der mangler. Kun
 *    den SAMMENFOLDEDE pille trækker sig; den udfoldede boks kan stadig
 *    hentes frem fra sidebarens «Kom godt i gang».
 */

/** URL-hashen fokuskortet linker til, og boksen reagerer på. */
export const VELKOMST_HASH = "#velkomst";

/** Er hashen (fra useLocation().hash, med #) velkomstens? */
export function erVelkomstHash(hash: string | null | undefined): boolean {
  return (hash ?? "").trim() === VELKOMST_HASH;
}

/**
 * Fokuskortets href for et punkt: tjeklistens velkomst-punkt (kind
 * "tjekliste", sti "") bliver VELKOMST_HASH — et samme-side-anker, som
 * kortet allerede renderer som <a href> (ruller/naviger natively). Alle
 * andre punkter bærer deres ctaHref uændret. Motoren (nextStep.ts) og
 * tjeklistens stier røres ikke: oversættelsen sker i fladen.
 */
export function fokusCtaHref(item: { kind: string; ctaHref: string }): string {
  return item.kind === "tjekliste" && item.ctaHref === "" ? VELKOMST_HASH : item.ctaHref;
}

/**
 * 4. ERFARNE MEDLEMMER SLIPPES (30/9, værdivurderingen før live-sessionen
 *    1/10): tjeklisten blev vist for ALLE medlemmer, og «Din profil» kræver
 *    ask_me_about + foto, som 0 af 8 gamle og 1 af 17 nye havde (målt i prod
 *    30/9). Så længe listen var ufærdig, var den fokuskortets ENESTE kilde, og
 *    overskriften sagde «Velkommen» — et medlem, der har været med i 8
 *    måneder, så «Din profil» som næste skridt og aldrig «Godkend dine
 *    augusttal». Nu styrer tjeklisten KUN forsiden for et medlem, der er
 *    kommet ind for højst ERFAREN_EFTER_DAGE døgn siden. For de erfarne
 *    falder fokusmotoren igennem til (a)-(i), overskriften bruger
 *    tidshilsenen, og tjeklisten står, hvor den står på alle andre sider:
 *    pillen/boksen nederst og «Kom godt i gang» i menuen (pillen trækker
 *    sig IKKE for dem — kortet viser ikke listen).
 *
 *    KILDEN er profiles.created_at (TjeklisteInput.medlem_siden, hentet af
 *    useOnboardingTjekliste i samme opslag som velkomsten — ingen ny
 *    forespørgsel, samme kilde som grænsen DELING_PUNKT_FRA). Den er
 *    PERSONENS dag 0 (sat af handle_new_user; ingen kodevej skriver den
 *    igen er kendt — ikke målt ud over de 30 rækker nedenfor). Fravalgt,
 *    målt i prod 30/9 (30 medlemskonti):
 *      - companies.contract_start_date: VIRKSOMHEDENS, ikke personens (en
 *        kollega tilføjet 28/9 til en virksomhed med kontrakt 15/9 ville
 *        dømmes efter virksomheden); null for 2 af 30; og den flytter sig —
 *        Warburg står med 2026-06-26 og KJ Auto med 2026-05-20, men deres
 *        profiler er fra 4/3 og 11/3.
 *      - første login: auth.users.created_at er dag for dag lig
 *        profiles.created_at i alle 30 rækker — ingen ny viden for en
 *        ekstra forespørgsel.
 *
 *    NULL/UGYLDIG = NY (tjeklisten styrer som hidtil). Fejlen i den retning
 *    er, at en erfaren ser listen som før 30/9 — kendt og synlig. Fejlen i
 *    den anden retning ville skjule ankomsten for et nyt medlem, hvis dato
 *    ikke kunne læses, uden at nogen opdagede det. Målt 30/9: alle 30 har
 *    datoen.
 *
 *    GRÆNSEN: MERE end 30 døgn (30 × 86 400 000 ms) mellem medlem_siden og
 *    nu. Kommet ind 30/9 kl. 10:00 → ny til og med 30/10 kl. 10:00:00,000,
 *    erfaren fra ,001. En måned er én rapportrytme: efter den er
 *    fokuskortets tal-punkter vigtigere end ankomsten. En dato i fremtiden
 *    (ur-skævhed) giver en negativ forskel = ny.
 */
export const ERFAREN_EFTER_DAGE = 30;
const DOEGN_MS = 86_400_000;

export function erErfarentMedlem(medlemSiden: string | null | undefined, nu: Date): boolean {
  if (!medlemSiden) return false;
  const t = new Date(medlemSiden).getTime();
  if (!Number.isFinite(t)) return false;
  return nu.getTime() - t > ERFAREN_EFTER_DAGE * DOEGN_MS;
}

/**
 * Styrer tjeklisten forsiden (fokuskortets eneste kilde + «Velkommen»)?
 * Ja, præcis når der ER en tjekliste, den ikke er færdig, og medlemmet
 * ikke er erfarent. ÉN dom, brugt af fokusmotoren (nextStep.ts),
 * overskriften (BoardroomView) og pillen (pillenTraekkerSig) — så kortet,
 * hilsenen og pillen aldrig er uenige.
 */
export function tjeklistenStyrerForsiden(
  tjekliste: { faerdig: boolean } | null | undefined,
  medlemSiden: string | null | undefined,
  nu: Date,
): boolean {
  return Boolean(tjekliste) && !tjekliste!.faerdig && !erErfarentMedlem(medlemSiden, nu);
}

/**
 * Skal den sammenfoldede pille trække sig? Ja, præcis når (a) man står
 * på forsiden («boardroom» i HbMemberShells `active`), og (b) fokuskortet
 * viser tjeklisten — tjeklistenStyrerForsiden, samme dom som motoren.
 * For et erfarent medlem viser kortet ikke listen, så pillen bliver
 * stående (ellers stod listen intetsteds på forsiden). `active` er
 * skallens eneste viden om ruten; boksen får dommen som prop. medlemSiden
 * udeladt/null = ny = som før 30/9.
 */
export function pillenTraekkerSig(
  active: string,
  tjekliste: { faerdig: boolean } | null | undefined,
  medlemSiden: string | null = null,
  nu: Date = new Date(),
): boolean {
  return active === "boardroom" && tjeklistenStyrerForsiden(tjekliste, medlemSiden, nu);
}

/**
 * Skal onboarding-boksen MONTERES overhovedet? Nej, når man står i chatten
 * på mobil. Sammenfoldet er boksen en fixed bjælke i bunden (`fixed inset-x-0
 * bottom-0 z-40`, ca. 46 px) og lå oven på de nederste 46 af sendefeltets 99 px
 * — send-knappen ligger 30-66 px fra bunden, så ca. 16 px af den var dækket
 * (målt 29/9 ved 375 × 812). Udfoldet fik `main` `pb-[72vh]` (HbMemberShell),
 * og i layout="fuld" blev der 812 - 65 - 585 = 162 px tilbage til faner + header
 * + sendefelt (36 + 57 + 99 = 192): beskedlisten forsvandt.
 *
 * Værdien i HbMemberShell er `active === "chat"` (ChatShell.tsx:45/103/117
 * giver `active="chat"`); `erMobil` er skallens dom om bredden under md
 * (< 768, som useIsMobile). På desktop og tablet er boksen uændret. Boksen
 * ejer også velkomstoverlejringen og «Kom godt i gang»-menupunktets
 * udfoldning, så skallen skjuler punktet, når boksen ikke er monteret.
 */
export function onboardingBoksMonteres(active: string, erMobil: boolean): boolean {
  return !(active === "chat" && erMobil);
}

/**
 * 3. VELKOMSTOVERLEJRINGENS TEKST FØLGER TILSTANDEN — set på skærm 14/9 kl.
 *    13:01 (første menneske, GUID sat samme dag): teksten sagde «Tjeklisten
 *    nederst på siden følger med dig», men på forsiden — netop dér hvor
 *    overlejringen vises automatisk — har pillen trukket sig (dommen
 *    ovenfor), og tjeklisten står i stedet i fokuskortet under «Dit næste
 *    skridt» (BoardroomView, lag 1, øverst). Sætningen pegede på noget der
 *    ikke var på skærmen. Overlejringen får samme dom som pillen (boksen
 *    har allerede prop'en pilleTraekkerSig fra skallen), så ordene kan
 *    følge den: forsiden → kortet; alle andre sider → boksen nederst på
 *    skærmen (fuld bredde i bunden under lg, nederste hjørne på lg —
 *    «nederst» er sandt begge steder). Når overlejringen vises på en anden
 *    side, er boksen ikke lukket (den automatiske velkomst viser sig aldrig
 *    for en lukket boks, og den eksplicitte åbnes fra listen), så pillen
 *    eller den udfoldede boks ER der.
 */
export const VELKOMST_INDLEDNING = "Her er en kort gennemgang af, hvordan du får mest ud af platformen.";

export function velkomstTekst(pilleTraekkerSig: boolean): string {
  const hvor = pilleTraekkerSig
    ? "Tjeklisten står under «Dit næste skridt» her på forsiden og følger med dig, indtil alt er på plads."
    : "Tjeklisten ligger nederst på skærmen og følger med dig, indtil alt er på plads.";
  return `${VELKOMST_INDLEDNING} ${hvor}`;
}
