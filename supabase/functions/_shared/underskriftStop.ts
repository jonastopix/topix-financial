/**
 * underskriftStop — må aftalegrundlaget sendes til underskrift for DENNE ansøgning?
 * (C's recon af pengekæden 18/9, §4 og §8 pkt. 2 + 4.)
 *
 *   CVR findes allerede som virksomhed → STOP, altid (409 cvr_findes_som_virksomhed).
 *     Konverteringen ville stoppe ved underskriften alligevel (ansoegningMotor:
 *     konverterTilVirksomhed, «genbrugt»), og så har den, der lige har skrevet under,
 *     en aftale uden virksomhed. Vejen er at koble ansøgningen til den eksisterende
 *     virksomhed i hånden, eller rette CVR-nummeret — FØR aftalen sendes.
 *   Mailen er kontakt på en virksomhed i forvejen → et BEVIDST VALG (409
 *     mail_findes_som_kontakt, medmindre bekraeft_ny_virksomhed er sat). En person kan
 *     ejerligt have to virksomheder; men uden valget opstår to virksomheder med samme
 *     kontaktperson og en invitation til en, der allerede har login (attach-user-to-company
 *     giver én user_company_id). Rådgiveren bekræfter i fladen, og valget står i sporet.
 *
 * Ren funktion — ingen Deno, ingen Supabase. Testet i src/lib/__tests__/underskriftStop.test.ts.
 */
export interface KendtVirksomhed {
  id: string;
  name: string;
  status: string | null;
  contract_end_date: string | null;
}

export type UnderskriftStopKode = "cvr_findes_som_virksomhed" | "mail_findes_som_kontakt";

export interface UnderskriftStopInput {
  /** companies med samme cvr_number som ansøgningen (tom når ansøgningen intet CVR har). */
  paaCvr: KendtVirksomhed[];
  /** companies med samme contact_email (lowercase) som ansøgningen. */
  paaMail: KendtVirksomhed[];
  /** Rådgiveren har bekræftet «ja, det er en ny virksomhed» (kun mail-tilfældet). */
  bekraeftNyVirksomhed: boolean;
}

export type UnderskriftStopDom =
  | { stop: null }
  | { stop: UnderskriftStopKode; virksomheder: KendtVirksomhed[]; kanBekraeftes: boolean };

export function afgoerUnderskriftStop(i: UnderskriftStopInput): UnderskriftStopDom {
  if (i.paaCvr.length > 0) return { stop: "cvr_findes_som_virksomhed", virksomheder: i.paaCvr, kanBekraeftes: false };
  if (i.paaMail.length > 0 && !i.bekraeftNyVirksomhed) return { stop: "mail_findes_som_kontakt", virksomheder: i.paaMail, kanBekraeftes: true };
  return { stop: null };
}

/** Én linje til rådgiveren: «findes allerede som virksomheden «X» (active, kontrakt til 2027-03-01)». */
export function beskrivVirksomheder(v: readonly KendtVirksomhed[]): string {
  return v.map((x) => `«${x.name}» (${x.status ?? "status ukendt"}${x.contract_end_date ? `, kontrakt til ${x.contract_end_date}` : ""})`).join("; ");
}
