/**
 * src/lib/chatSendefejl.ts
 *
 * Medlemmets sendefejl i chatten (30/9-2026, analyse-medlemsrejse §2.8).
 * Rene regler, testet i __tests__/chatSendefejl.test.ts; fladen
 * (MemberChatPane) låst af samme fils kildeværn.
 *
 * FEJLEN, MÅLT I KODEN 30/9: `handleSend` indsatte beskeden og gjorde kun
 * noget ved `!error && data` — ingen else-gren, ingen toast, ingen linje.
 * Analysen skrev, at «teksten bliver stående i feltet». DET HOLDT IKKE:
 * ChatRichInput.submitFromEditor tømmer editoren (`clearContent`) og de
 * ventende filer i samme øjeblik, den kalder onSubmit — før indsættelsen
 * overhovedet er forsøgt. En fejlet besked forsvandt altså sporløst, og
 * medlemmet troede, den var sendt.
 *
 * RETTELSEN (mønstret fra #1140, rådgiverens sendelinje med «Prøv igen»):
 * den fejlede besked gemmes i panelets hukommelse, PRÆCIS som den skulle
 * indsættes (tekst, dokument, allerede uploadede vedhæftninger, svar og
 * nøgletals-chip), og vises som en linje over skrivefeltet med uddrag og
 * «Prøv igen». Prøv igen indsætter den samme række — ingen ny upload.
 */
import { svarUddrag } from "./chatSvar";

/** Udfaldet af `insert(...).select().single()`: sendt KUN med data og uden fejl. */
export function sendeUdfald(svar: { data: unknown; error: unknown }): "sendt" | "fejlet" {
  return !svar.error && svar.data ? "sendt" : "fejlet";
}

/** En besked, der ikke blev sendt — den række, der skulle indsættes. */
export interface FejletBesked {
  /** Rækken til `messages` (conversation_id, sender_id, content, …) — uændret ved «Prøv igen». */
  raekke: { conversation_id: string; content?: string | null } & Record<string, unknown>;
}

/** Linjens tekst: rolig, siger hvilken besked, og at den ikke er sendt. */
export function sendefejlTekst(besked: FejletBesked): string {
  return `Beskeden blev ikke sendt: «${svarUddrag(besked.raekke.content ?? "")}»`;
}

/** Linjen hører til den samtale, beskeden blev skrevet i — ikke den åbne, hvis medlemmet har skiftet. */
export function visSendefejl(besked: FejletBesked | null, aktivSamtale: string | null): besked is FejletBesked {
  return !!besked && besked.raekke.conversation_id === aktivSamtale;
}
