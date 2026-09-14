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
 *    viser tjeklisten. Dommen er den samme som motorens (nextStep.ts:221):
 *    `tjekliste && !tjekliste.faerdig`. Er tjeklisten færdig, viser kortet
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
 * Skal den sammenfoldede pille trække sig? Ja, præcis når (a) man står
 * på forsiden («boardroom» i HbMemberShells `active`), og (b) fokuskortet
 * viser tjeklisten — samme dom som nextStep.ts:221. `active` er skallens
 * eneste viden om ruten; boksen får dommen som prop.
 */
export function pillenTraekkerSig(
  active: string,
  tjekliste: { faerdig: boolean } | null | undefined,
): boolean {
  return active === "boardroom" && Boolean(tjekliste) && !tjekliste!.faerdig;
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
