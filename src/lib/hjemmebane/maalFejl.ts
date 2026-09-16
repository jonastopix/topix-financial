/**
 * src/lib/hjemmebane/maalFejl.ts — «Én plan», fase 2 (16/9-2026): medlemmets
 * møde med databasens «højst tre aktive mål» (triggeren
 * milestones_hoejst_tre_aktive, migration 20260917150000).
 *
 * Jonas 16/9: «Nej. Vi er rådgivere, men det er medlemmernes virksomheder.»
 * — medlemmet ejer sine mål og opretter/omdøber/parkerer/sletter selv fra
 * klienten (RLS uændret). Højst tre aktive gælder for ALLE skrivere; når
 * medlemmet rammer grænsen, svarer databasen med triggerens tekst, og fladen
 * oversætter den til husets ord — aldrig en rå databasefejl på skærmen.
 *
 * Rene funktioner, kun klienten (ingen Deno-spejl: triggeren taler til
 * klienten, ikke til functions — maal-skriv har sin egen 409-oversættelse).
 * Testet i __tests__/maalFejl.test.ts.
 */
import { kanOpretteMaal, MAX_AKTIVE_MAAL } from "@/lib/hjemmebane/maal";

/** Husets tekst når medlemmet rammer grænsen. */
export const HOEJST_TRE_TEKST = `Du har allerede ${MAX_AKTIVE_MAAL} aktive mål — parkér eller markér et som nået først`;

/** Triggerens eget signal: errcode P0001 og ordene «aktive mål» i beskeden
    (migration 20260917150000: «milestones: virksomheden har allerede 3 aktive
    mål — parkér eller markér et som nået først»). PostgREST giver code og
    message videre; begge læses, så en ændret ordlyd i den ene stadig rammes. */
export function erHoejstTreFejl(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  const besked = (error.message ?? "").toLowerCase();
  return besked.includes("aktive mål") || (error.code === "P0001" && besked.includes("milestones"));
}

/** Teksten fladen viser for en skrivefejl på et mål: husets ord ved «højst
    tre», ellers den generelle tekst kalderen giver. */
export function maalFejlTekst(error: { code?: string | null; message?: string | null } | null | undefined, ellers: string): string {
  return erHoejstTreFejl(error) ? HOEJST_TRE_TEKST : ellers;
}

/** Løftestang → mål (handoutEngine.createLeverMilestone): målet oprettes
    aktivt når der er plads, ellers PARKERET — så løftestangen ikke går tabt
    og triggeren ikke afviser. Fail-closed på ulæseligt tal (parkeret). */
export function loeftestangStatus(antalAktive: number): "active" | "parked" {
  return kanOpretteMaal(antalAktive) ? "active" : "parked";
}

/** Toasten efter løftestangen, pr. status. */
export function loeftestangToast(status: "active" | "parked", titel: string): { title: string; description: string } {
  return status === "parked"
    ? { title: "Gemt som parkeret mål", description: `Gemt som parkeret mål — du har allerede ${MAX_AKTIVE_MAAL} aktive. Aktivér det når der er plads.` }
    : { title: "Milestone oprettet", description: `"${titel}" er nu en aktiv milestone. Åbn Milestones for at tilføje et konkret talmål.` };
}
