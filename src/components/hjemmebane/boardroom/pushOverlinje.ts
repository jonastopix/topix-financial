/** Pushets overlinje som REN dom (forside PR 1, 17/9-2026 — Jonas «A på
    alle» til analysens otte valg; §5.4 punkt 3): «Ugens push · {marker}».
    Før stod datoen («12. august») når pushet var ældre end en uge — den
    udstillede alderen og gav intet. Nu: «Ny i denne uge» bevares for ≤ 7
    dage; ellers afsenderen («Fra Morten») når der er en; ellers ingen
    markering. Ingen React, ingen Supabase. Testet i
    __tests__/pushOverlinje.test.ts. */

export const NY_I_DENNE_UGE = "Ny i denne uge";
export const NY_MARKER_DAGE = 7;

export interface OverlinjeInput {
  /** content_items.published_at ?? created_at (ISO). */
  publishedAt: string | null;
  /** Afsenderens navn (profil eller fri-tekst-byline); null = ingen afsender. */
  afsenderNavn: string | null;
  nu: Date;
}

/** Fornavnet af et fuldt navn — «Morten Larsen» → «Morten». Tomt → null. */
export function fornavn(navn: string | null | undefined): string | null {
  const f = (navn ?? "").trim().split(/\s+/)[0] ?? "";
  return f === "" ? null : f;
}

/** «Ny i denne uge» (≤ 7 dage, ulæselig dato = ikke ny), ellers «Fra
    {fornavn}», ellers null. */
export function pushOverlinje({ publishedAt, afsenderNavn, nu }: OverlinjeInput): string | null {
  if (publishedAt) {
    const t = new Date(publishedAt).getTime();
    if (!Number.isNaN(t) && (nu.getTime() - t) / 86400000 <= NY_MARKER_DAGE) return NY_I_DENNE_UGE;
  }
  const f = fornavn(afsenderNavn);
  return f ? `Fra ${f}` : null;
}
