/**
 * src/lib/hjemmebane/adminListeTekst.ts
 *
 * Tom og fejlet er to beskeder — også i rådgiverens redaktionsflader
 * (30/9-2026, mangellisten «Tavse queryFn'er», resten efter #928/#1126:
 * EventsView, ContentView, HbMaterials).
 *
 * MÅLT I KODEN 30/9: queryFn'erne (listEvents, listCollections, listItems,
 * listAttachments i adminContentApi.ts) KASTER allerede gennem throwIfError,
 * men fladerne læste kun isLoading: en fejlet hentning gav «Ingen events
 * endnu. Opret det første» og «Området er tomt. Opret en samling …». En
 * rådgiver, der tror listen er tom, opretter det, der allerede findes.
 *
 * Dommen er husets hentetilstand (hentefejl.ts): henter · fejlet · tom.
 * Teksten ved «fejlet» siger HVAD der ikke kunne hentes, og at listen kan
 * mangle noget — rådgiverens ord (raadgiverHentefejl.ts' tone), rolig, ingen
 * teknik. Ren funktion, testet i __tests__/adminListeTekst.test.ts.
 */
import { hentetilstand } from "./hentefejl";

export const ADMIN_HENTER_TEKST = "Henter…";

/** «Eventsene kunne ikke hentes lige nu — listen kan mangle noget. Prøv igen.» */
export function adminHentefejlTekst(hvad: string): string {
  return `${hvad.charAt(0).toUpperCase()}${hvad.slice(1)} kunne ikke hentes lige nu — listen kan mangle noget. Prøv igen.`;
}

/**
 * Listens tomme-tekst: «Henter…» mens den henter, fejlteksten når hentningen
 * fejlede, ellers den tomme tilstand. Tegnes kun, når listen ER tom — med
 * data i cachen og en fejlet genhentning står rækkerne stadig.
 */
export function adminListeTekst(
  hentning: { isLoading: boolean; isError: boolean },
  tekster: { hvad: string; tom: string },
): string {
  switch (hentetilstand(hentning, true)) {
    case "henter":
      return ADMIN_HENTER_TEKST;
    case "fejlet":
      return adminHentefejlTekst(tekster.hvad);
    default:
      return tekster.tom;
  }
}

/**
 * Events-fladens to SIDEHENTNINGER (3/10, kort g03-tavse-queryfn — det, der
 * stod tilbage efter #1160): countRegistrations og listRecordingCandidates
 * kaster (throwIfError), men fladen læste kun `data ?? {}` / `data ?? []`.
 * En fejlet tilmeldingstælling gav «0 tilmeldte» i editoren og — værst —
 * «0 tilmeldinger slettes med» i sletningens bekræftelse; en fejlet
 * optagelsesliste gav en tom vælger. Linjen siger, HVAD der mangler; null =
 * intet fejlede (henter tæller ikke som fejl).
 */
export function eventsSidefejl(
  tilmeldinger: { isError: boolean },
  optagelser: { isError: boolean },
): string | null {
  if (tilmeldinger.isError && optagelser.isError)
    return "Tilmeldingerne og optagelserne kunne ikke hentes lige nu — antallet af tilmeldte og listen over optagelser kan være forkerte. Prøv igen.";
  if (tilmeldinger.isError)
    return "Tilmeldingerne kunne ikke hentes lige nu — antallet af tilmeldte kan være forkert (også ved sletning). Prøv igen.";
  if (optagelser.isError) return "Optagelserne kunne ikke hentes lige nu — listen over optagelser kan mangle noget. Prøv igen.";
  return null;
}
