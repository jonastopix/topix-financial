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
