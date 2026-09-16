/**
 * src/lib/hjemmebane/fremdriftDetalje.ts
 *
 * Dommen over Fremdrift-fanens MEDLEMSDETALJE (rådgiverens Akademi-flade,
 * ProgressView.tsx): må tallet «N af M videoer gennemført» og listen med
 * markeringsknapperne vises? Ren funktion, testet i
 * __tests__/fremdriftDetalje.test.ts.
 *
 * HVORFOR (fundet af vindue A 16/9, mangellisten «Fremdrift-fanens
 * medlemsdetalje læser ingen hentefejl»): detaljens eneste fejllinje var
 * markeringernes SKRIVEfejl. Fejlede hentningen af lektionerne
 * (listPublishedItems), samlingerne (listPublishedCollections) eller
 * medlemmets fremdrift (listAllMemberProgress), stod der «0 af 0 videoer
 * gennemført» — som om medlemmet intet havde set. Samme klasse som de tavse
 * fejl 12/9 (raadgiverHentefejl.ts): en rådgiver der ser 0, tror der ikke er
 * noget at gøre. Overblikket «Svar pr. lektion» fik sin fejlgren i #909;
 * detaljen får den her.
 *
 * REGLEN, i rækkefølge:
 *   1. fejl   — én af de tre hentninger er fejlet (lektionerne først: uden
 *               dem er samlinger og fremdrift meningsløse). Fejlen gives
 *               videre, så raadgiverHentefejlTekst kan navngive kilden.
 *   2. klar   — lektionerne OG samlingerne er hentet, og fremdriften er
 *               hentet ELLER der er ingen publicerede lektioner (fremdrift-
 *               hentningen er da slået fra — «0 af 0» er så det sande tal).
 *   3. henter — alt andet (aldrig 0, aldrig knapper).
 */

export interface HentningsStatus {
  isError: boolean;
  isSuccess: boolean;
  error?: unknown;
}

export type DetaljeTilstand = { art: "henter" } | { art: "fejl"; error: unknown } | { art: "klar" };

export function detaljeTilstand(h: {
  lektioner: HentningsStatus;
  samlinger: HentningsStatus;
  fremdrift: HentningsStatus;
  /** Antal publicerede lektioner; 0 betyder at fremdrift-hentningen er slået fra. */
  publiceredeLektioner: number;
}): DetaljeTilstand {
  if (h.lektioner.isError) return { art: "fejl", error: h.lektioner.error };
  if (h.samlinger.isError) return { art: "fejl", error: h.samlinger.error };
  if (h.fremdrift.isError) return { art: "fejl", error: h.fremdrift.error };
  const fremdriftKlar = h.fremdrift.isSuccess || h.publiceredeLektioner === 0;
  if (h.lektioner.isSuccess && h.samlinger.isSuccess && fremdriftKlar) return { art: "klar" };
  return { art: "henter" };
}
