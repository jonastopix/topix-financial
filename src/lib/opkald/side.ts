/**
 * opkald/side — de rene dele af /ring-mig-op (2/10-2026): ordene og knappens dom.
 * Testet i src/lib/__tests__/opkaldDom.test.ts. Ordlyden ved krydset bor IKKE her —
 * den er opkaldDom.SAMTYKKE_ORDLYD (ét sted, spejlet, gemt ordret).
 *
 * TEKSTEN (docs/samtykke-og-opkald.md §2.3, skåret til Jonas' fem svar): ingen
 * tidsrum, ingen besked, ingen kvitteringsmail. Siden lover «på hverdage inden
 * for et par dage» — og klokken går i rådgivernes morgenmail, så løftet holder.
 * Ordet «optagelse» må ikke stå nogen steder (Jonas 28/9: den sendes ikke).
 */

import { KONTAKT_ADRESSE } from "@/lib/kontaktadresse";
import { INDSEND_PAUSE_MIN } from "@/lib/opkald/dom";

export interface RingOpslag {
  navn: string;
  session_tid: string | null;
  har_anmodet: boolean;
}

export const RING_TEKST = {
  titel: "Skal Morten eller Jonas ringe dig op?",
  indledning:
    "Vi ringer én gang, om The Boardroom — om det er noget for dig, og hvad du vil have ud af det. Ingen salgstrappe, ingen SMS, ingen nyhedsbreve ud af det her.",
  telefonHjaelp: "Dansk nummer, 8 cifre. Du må gerne skrive +45 foran.",
  samtykkeForklaring: (dage: number) =>
    `Topix.dk ApS gemmer dit navn og nummer, så Morten Larsen eller Jonas Herlev kan ringe dig op én gang om The Boardroom. Nummeret bruges ikke til andet og slettes senest ${dage} dage efter. Du kan trække samtykket tilbage ved at skrive til ${KONTAKT_ADRESSE}.`,
  knap: "Ring mig op",
  harAnmodetTitel: "Du har allerede bedt om et opkald",
  // En ÅBEN anmodning overskrives aldrig (rådets fund 2/10, punkt 3) — et videresendt link må ikke skifte nummeret.
  harAnmodet: "Vi har dit nummer, og Morten eller Jonas ringer på hverdage inden for et par dage. Skal vi bruge et andet nummer, så skriv til os.",
  takTitel: "Tak — du hører fra os",
  takTekst: "Morten eller Jonas ringer på hverdage inden for et par dage. Vi sender ikke en mail om det.",
  ukendtTitel: "Linket virker ikke",
  ukendtTekst: "Linket er ufuldstændigt, udløbet, eller det hører ikke til en, der var med til webinaret. Skriv til os, så ringer vi alligevel.",
  fejlTitel: "Der gik noget galt",
  fejlTekst: "Vi kunne ikke behandle anmodningen lige nu. Det er ikke dit link — prøv igen om lidt, eller skriv til os.",
} as const;

/** Knappen er inaktiv, til navnet står, nummeret har form og krydset er sat. */
export function afgoerRingKnap(a: { navn: string; telefonOk: boolean; kryds: boolean; arbejder: boolean }): { ok: boolean; grund: "arbejder" | "navn" | "telefon" | "kryds" | null } {
  if (a.arbejder) return { ok: false, grund: "arbejder" };
  if (a.navn.trim() === "") return { ok: false, grund: "navn" };
  if (!a.telefonOk) return { ok: false, grund: "telefon" };
  if (!a.kryds) return { ok: false, grund: "kryds" };
  return { ok: true, grund: null };
}

/** Functionens fejl → én sætning til mennesket. Aldrig teknik. */
export function tolkRingFejl(status: number | null, data: Record<string, unknown> | null): string {
  const grund = data && typeof data.grund === "string" ? data.grund : null;
  if (status === 400 && grund === "telefon") return "Nummeret har ikke den rigtige form — 8 cifre, evt. med +45 foran.";
  if (status === 400 && grund === "navn") return "Skriv dit navn.";
  if (status === 400 && (grund === "samtykke" || grund === "ordlyd")) return "Sæt kryds i, at vi må ringe til dig.";
  if (status === 403) return RING_TEKST.ukendtTekst;
  if (status === 409) return RING_TEKST.harAnmodet;
  if (status === 429 && grund === "for_snart") return `Du har lige sendt en anmodning. Vent ${INDSEND_PAUSE_MIN} minutter, før du prøver igen.`;
  if (status === 429) return `For mange anmodninger lige nu. Prøv igen om en time, eller skriv til ${KONTAKT_ADRESSE}.`;
  if (status === 503) return `Vi kunne ikke behandle anmodningen lige nu. Skriv til ${KONTAKT_ADRESSE}, så ringer vi alligevel.`;
  return `Noget gik galt. Prøv igen om lidt, eller skriv til ${KONTAKT_ADRESSE}.`;
}
