/**
 * src/lib/forslagUdloeb.ts
 *
 * Spejlet i supabase/functions/_shared/forslagUdloeb.ts — enhver ændring
 * her SKAL også laves der. Pariteten håndhæves af testen i
 * src/lib/__tests__/forslagUdloebParitet.test.ts. Importstien er den
 * ENESTE tilladte forskel mellem de to filer ud over filhovederne.
 *
 * Ren, testbar dom: ER ET AGENT-FORSLAG STADIG GYLDIGT? Samme mønster som
 * afgoerFornyelsestilstand og afgoerBetalingsfrist: ingen I/O, ingen
 * Supabase, ingen React — «nu» er en eksplicit parameter.
 *
 * BESLUTTET 7/9 (Jonas): et forslag udløber når dets egen ISO-uge er
 * passeret. HVORFOR UGEN og ikke 7 × 24 timer: den eneste godkendbare
 * skrivevej, update_weekly_focus, skriver UGENS fokus med nøglen for
 * GODKENDELSENS uge (skrivUgensFokus → getISOWeekKey(new Date()),
 * _shared/agentSkriveveje.ts). Et forslag fra en anden uge er derfor ikke
 * bare gammelt — det er om en anden uge end den det ville lande i. Set på
 * skærm 7/9: et forslag fra 25/8 (uge 35) om «Budget for Januar 2025 …»
 * kunne godkendes i uge 37 og blive medlemmets fokus DENNE uge. Med
 * ISO-ugen som grænse er «kan det godkendes» og «hvor lander det» det
 * samme spørgsmål, afgjort af den samme nøgle.
 *
 * REGLEN: gyldigt ⇔ getISOWeekKey(proposed_at) === getISOWeekKey(nu).
 *   Forslag fra mandag 31/8 kl. 09:00 (uge 36):
 *     søndag 6/9 kl. 23:59:59 → uge 36 → gyldigt (sidste øjeblik)
 *     mandag 7/9 kl. 00:00:00 → uge 37 → udløbet (første øjeblik i næste)
 *   Ulæseligt proposed_at → udløbet (fail-closed: kan ikke godkendes; kan
 *   forkastes, så det kan ryddes op).
 *
 * HVAD DOMMEN IKKE ER: den skriver ikke status = 'expired'. Det gør
 * SQL-cronen agentforslag-udloeb (20260911000000, 04:05 UTC) med samme
 * regel udtrykt som to_char(proposed_at, 'IYYY-"W"IW') <> to_char(now(),
 * 'IYYY-"W"IW') i dansk tid — pariteten låses af
 * __tests__/agentforslagUdloebsCron.paritet.test.ts, som læser
 * migrationsfilen. Dommen her er sand med det samme, uden at vente på
 * den natlige kørsel; en 'proposed'-række fra en passeret uge er udløbet
 * fra midnat, bogført fra 04:05.
 *
 * TIDSZONE: getISOWeekKey læser LOKALE datokomponenter. Edge-funktionen
 * (Deno) kører i UTC; browseren i medlemmets/rådgiverens zone. Tæt på
 * midnat søndag/mandag kan de to derfor være uenige med op til to timer
 * (CEST). Afgørelsen (Deno) er den bindende — det er dér skrivningen
 * sker med samme nøgle. Det er arvet fra ugenøglen, ikke indført her.
 */
import { getISOWeekKey } from "./hjemmebane/week";

export interface Forslagsgyldighed {
  /** true når forslagets ISO-uge er den samme som «nu»s. */
  gyldigt: boolean;
  /** «YYYY-WNN» for proposed_at; null når stemplet ikke kan læses. */
  forslagets_uge: string | null;
  /** «YYYY-WNN» for nu — den uge en godkendelse ville lande i. */
  nu_uge: string;
  /** Kort dansk begrundelse, til fejlsvar og log. */
  grund: string;
}

/**
 * Afgør om et forslag stadig er gyldigt. proposed_at er
 * agent_proposals.proposed_at (timestamptz som ISO-streng).
 */
export function afgoerForslagsgyldighed(proposedAt: string, nu: Date): Forslagsgyldighed {
  const nu_uge = getISOWeekKey(nu);
  const stemplet = new Date(proposedAt);
  if (Number.isNaN(stemplet.getTime())) {
    return { gyldigt: false, forslagets_uge: null, nu_uge, grund: "proposed_at kan ikke læses — forslaget kan kun forkastes" };
  }
  const forslagets_uge = getISOWeekKey(stemplet);
  if (forslagets_uge === nu_uge) {
    return { gyldigt: true, forslagets_uge, nu_uge, grund: `forslaget er fra ${forslagets_uge}, som er indeværende uge` };
  }
  return {
    gyldigt: false,
    forslagets_uge,
    nu_uge,
    grund: `forslaget er fra ${forslagets_uge}; en godkendelse ville lande i ${nu_uge} — forslaget kan kun forkastes`,
  };
}

/** Kort form til fladen: kan forslaget stadig godkendes? */
export function erForslagGyldigt(proposedAt: string, nu: Date): boolean {
  return afgoerForslagsgyldighed(proposedAt, nu).gyldigt;
}
