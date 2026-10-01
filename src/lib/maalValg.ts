/**
 * src/lib/maalValg.ts — SPEJL af supabase/functions/_shared/maalValg.ts (samme
 * krop efter filhovedet, låst af src/lib/__tests__/maalValgParitet.test.ts).
 * Ingen imports. «Foreslå skridt» kræver et mål, når virksomheden har aktive
 * mål (1/10-2026). Dialogerne (CompanyChatPane, VirksomhedPlanen) og
 * foreslaa-opgave dømmer ens.
 */

/** Kræver «Foreslå skridt» et mål? Ja, når virksomheden har mindst ét aktivt
    mål — så SKAL rådgiveren vælge et af dem; «uden mål» er kun lovligt, når
    listen er tom (1/10-2026, maal-produkt.md §4 «Chatten»; før: Jonas «B»
    16/9, valgfrit). Kalderen giver de aktive mål (status = 'active') — samme
    regel i dialogen og i foreslaa-opgave. */
export function kraeverMaalValg(aktiveMaal: readonly unknown[]): boolean {
  return aktiveMaal.length > 0;
}

/** Grunden i serverens 400-svar, når maalId mangler, men et mål kræves. */
export const MAAL_KRAEVES_GRUND = "maal_kraeves";
export const MAAL_KRAEVES_TEKST = "Vælg det mål, skridtet hører til — virksomheden har aktive mål.";

export type ForslagMaalDom =
  | { kanSendes: true; maalId: string | null }
  | { kanSendes: false; grund: "henter" | "fejl" | "vaelg_maal" | "ukendt_maal" };

/** Dialogens dom: må forslaget sendes, og med hvilket mål? `valgtMaalId` er
    rådgiverens eksplicitte valg (null/"" = intet valgt endnu — der er INGEN
    standard, valget kræves). Mens målene hentes, eller hentningen fejlede,
    kan forslaget ikke sendes: et forslag «uden mål» ville blive afvist af
    serveren, hvis der viste sig at være mål. */
export function forslagMaalDom(
  status: "henter" | "fejl" | "klar",
  aktiveMaal: readonly { id: string }[],
  valgtMaalId: string | null,
): ForslagMaalDom {
  if (status === "henter") return { kanSendes: false, grund: "henter" };
  if (status === "fejl") return { kanSendes: false, grund: "fejl" };
  if (!kraeverMaalValg(aktiveMaal)) return { kanSendes: true, maalId: null };
  if (valgtMaalId == null || valgtMaalId === "") return { kanSendes: false, grund: "vaelg_maal" };
  if (!aktiveMaal.some((m) => m.id === valgtMaalId)) return { kanSendes: false, grund: "ukendt_maal" };
  return { kanSendes: true, maalId: valgtMaalId };
}
