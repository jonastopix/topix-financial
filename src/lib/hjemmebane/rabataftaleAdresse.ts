/**
 * src/lib/hjemmebane/rabataftaleAdresse.ts — én rabataftales adresse (29/9-2026).
 *
 * Trin 2 af #-henvisningerne (Jonas 28/9: «events, lektioner, rabatter»):
 * en henvisning kræver en adresse, og en aftale havde ingen — /rabataftaler
 * tegnede listen med <article key={aftale.id}> uden id, uden rute og uden anker
 * (~/Downloads/recon-hash-i-chatten.md §5).
 *
 * HUSETS MØNSTER for ÉT element på en liste-flade (målt 29/9):
 *   RapporteringView  ?reportId=   → find i listen, scrollIntoView (center),
 *                                    ring-2 ring-hb-evergreen/50, ryd parameteren
 *                                    med navigate(…, { replace: true }) og bevar hash
 *   FeedbackView      ?feedbackId= → find, scroll til id="feedback-{id}", ryd
 *   CompanyChatPane   ?messageId=  → scroll (center), ring i 2 s, ryd
 * Hash-ankre (#goals, #upload, #dine-refleksioner + useScrollToHash) er husets
 * mønster for SEKTIONER, ikke for elementer. Egne ruter (/events/:id,
 * /community/:id) findes, hvor elementet har sin egen side — det har en aftale
 * ikke. Derfor: /rabataftaler?aftaleId={id}, som de tre ovenfor.
 *
 * REN: ingen React, ingen Supabase. Fladen (RabataftalerView) kalder den.
 */

export const RABATAFTALER_STI = "/rabataftaler";

/** Query-parameteren — samme form som reportId/feedbackId/messageId. */
export const AFTALE_PARAM = "aftaleId";

/** Markeringens varighed — samme to sekunder som chattens ?messageId= (CompanyChatPane.tsx:912). */
export const MARKERING_MS = 2000;

/** Den rolige linje, når linket peger på en aftale, der ikke vises (arkiveret, udløbet, ukendt). */
export const AFTALE_FINDES_IKKE =
  "Den aftale, linket peger på, findes ikke længere. Her er de aftaler, der gælder nu.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Adressen til én aftale. Et id, der ikke er et uuid, giver listen uden mål. */
export function rabataftaleAdresse(id: string): string {
  const rent = typeof id === "string" ? id.trim().toLowerCase() : "";
  return UUID.test(rent) ? `${RABATAFTALER_STI}?${AFTALE_PARAM}=${rent}` : RABATAFTALER_STI;
}

/** Aftalens id ud af location.search — kun et uuid, ellers null. Små bogstaver, som partners.id. */
export function laesRabataftaleId(search: string | null | undefined): string | null {
  if (typeof search !== "string" || search === "") return null;
  let vaerdi: string | null;
  try {
    vaerdi = new URLSearchParams(search).get(AFTALE_PARAM);
  } catch {
    return null;
  }
  const rent = (vaerdi ?? "").trim().toLowerCase();
  return UUID.test(rent) ? rent : null;
}

/** Udløbet aftale = valid_until er passeret. Aftalen gælder TIL OG MED
    dagen (kolonnen er DATE), så grænsen lægges ved døgnets udgang —
    udløbne aftaler vises slet ikke. Flyttet hertil fra RabataftalerView
    (29/9-2026, trin 3), så /rabataftaler og chattens #-forslag dømmer med
    SAMME sætning: en aftale, listen ikke viser, må chatten ikke tilbyde. */
export const aftalenErUdloebet = (validUntil: string | null, nu: Date = new Date()): boolean =>
  !!validUntil && new Date(`${validUntil}T23:59:59`) < nu;

/** DOM-id'et på aftalens <article> — samme form som FeedbackView's `feedback-{id}`. */
export function rabataftaleElementId(id: string): string {
  return `aftale-${id}`;
}

export type AftaleMaal =
  | { art: "intet" }        // intet (gyldigt) id i adressen — eller hentningen fejlede: vi påstår intet
  | { art: "venter" }       // listen er ikke hentet endnu
  | { art: "fundet"; id: string }
  | { art: "findes_ikke" }; // hentet, men aftalen er ikke blandt dem, der vises

/**
 * Dommen over adressens mål. «Vises» er fladens liste EFTER dens eget filter
 * (published + ikke udløbet), så en arkiveret, udløbet eller ukendt aftale alle
 * er «findes_ikke». En fejlet hentning er ikke et svar: dér siges intet.
 */
export function afgoerAftaleMaal(input: {
  oensketId: string | null;
  henter: boolean;
  fejlet: boolean;
  vistIds: readonly string[];
}): AftaleMaal {
  if (input.oensketId === null) return { art: "intet" };
  if (input.fejlet) return { art: "intet" };
  if (input.henter) return { art: "venter" };
  return input.vistIds.includes(input.oensketId) ? { art: "fundet", id: input.oensketId } : { art: "findes_ikke" };
}
