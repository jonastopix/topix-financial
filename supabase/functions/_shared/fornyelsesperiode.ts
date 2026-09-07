/**
 * supabase/functions/_shared/fornyelsesperiode.ts
 *
 * Spejlet ordret fra src/lib/fornyelsesperiode.ts — enhver ændring her
 * SKAL også laves der. Pariteten håndhæves af testen i
 * src/lib/__tests__/fornyelsesperiodeParitet.test.ts.
 *
 * Filen har nul imports og kan derfor loades af både Vite/Vitest (Node)
 * og Deno uden ændringer. Filhovedet er den ENESTE forskel mellem de to.
 *
 * Ren, testbar afgørelse af den periode en fornyelsesbetaling giver:
 * periode_start, periode_slut (= den nye contract_end_date) og hvilken
 * gren betalingen faldt i. Samme mønster som afgoerBetalingsfrist og
 * afgoerFornyelsestilstand: ingen I/O, ingen Supabase, ingen React —
 * samme input giver altid samme output. Betalingsdagen tages ind som
 * parameter, aldrig som new Date() herinde.
 *
 * BESLUTTET 7/9 (Jonas): fornyelse kan betales FØR slutdatoen, ikke kun
 * efter. Det ændrer beslutningen fra 1/9 («fornyelse betales EFTER
 * udløb») og regnestykket for den nye slutdato:
 *
 *   Betaling FØR eller PÅ slutdatoen  (gren "foer_udloeb"):
 *     ny slutdato = GAMMEL SLUTDATO + 12 måneder.
 *     Gammel 2026-09-29, betalt 2026-09-07 → ny 2027-09-29.
 *     Den der handler tidligt må ikke miste dage.
 *
 *   Betaling EFTER slutdatoen  (gren "efter_udloeb"):
 *     ny slutdato = BETALINGSDAGEN + 12 måneder — som stripe-webhook
 *     regner i dag (fornyelsesgrenen, «fra BETALINGSDATOEN», 1/9).
 *     Gammel 2026-09-29, betalt 2026-10-05 → ny 2027-10-05.
 *     Dagene uden adgang gives ikke tilbage; de var ikke medlemmer i dem.
 *
 *   Grænsen: betalingsdagen er «før eller på» når den er <= slutdatoen,
 *   i hele UTC-kalenderdage — samme dagbegreb som resten af huset
 *   (fornyelse.ts, betalingsfrist.ts: adgangen forsvinder kl. 00:00 UTC
 *   på selve slutdagen, så slutdatoen er EKSKLUSIV).
 *
 * PERIODE_START — afgjort af hvordan company_perioder bruges i dag:
 *   Begge eksisterende skrivere (stripe-webhooks fornyelsesgren og
 *   beregnIndgangsPeriode i _shared/indgangsFakturaBetaling.ts) holder
 *   invarianten periode_slut = periode_start + 12 måneder, og tabellen er
 *   «append-only historik over medlemsperioder» med CHECK periode_slut >
 *   periode_start (migration 20260901140000). Med ny slutdato = gammel
 *   slutdato + 12 måneder er den eneste periode_start der bevarer
 *   invarianten den GAMLE SLUTDATO: den nye periode begynder i det
 *   øjeblik den gamle slutter (eksklusiv slutdato → ingen overlap, intet
 *   hul), og rådgiverens periodeliste (VirksomhedView, «start – slut»)
 *   læses sammenhængende. Betalingsdagen er IKKE periode_start i
 *   før-grenen: så ville perioden overlappe den løbende, og slut ville
 *   ikke længere være start + 12 måneder. I efter-grenen er
 *   periode_start betalingsdagen, som i dag.
 *
 * 29. FEBRUAR — eksplicit regel (reconen 7/9 fandt at setUTCMonth(+12)
 * ruller 29/2 tavst til 1/3, og at ingen kode håndterede det):
 *   «12 måneder frem» er samme kalenderdag året efter. Findes dagen ikke
 *   (kun 29/2), er slutdatoen 1/3 året efter. Begrundelse: slutdatoen er
 *   eksklusiv, så 1/3 giver adgang til og med 28/2 — februars sidste dag
 *   året efter — og medlemmet mister ingen dag. 28/2 som slutdato ville
 *   give én dag mindre end et helt kalenderår. Resultatet er det samme
 *   som JavaScripts rul, men nu skrevet ud og låst med test frem for at
 *   hvile på Date-objektets adfærd.
 *
 * GAMMEL SLUTDATO NULL eller ulæselig: der er ingen slutdato at være
 * «før», så betalingen dømmes "efter_udloeb" med betalingsdagen som
 * anker — dagens regnestykke. Motoren (afgoerFornyelsestilstand) og
 * checkout-gaten afviser i praksis en virksomhed uden slutdato
 * (ingen_slutdato) før dette regnestykke nogensinde nås.
 */

export type FornyelsesGren = "foer_udloeb" | "efter_udloeb";

export interface Fornyelsesperiode {
  /** "YYYY-MM-DD" — gammel slutdato (før-grenen) eller betalingsdagen (efter-grenen). */
  periode_start: string;
  /** "YYYY-MM-DD" — den nye contract_end_date. Altid periode_start + 12 måneder. */
  periode_slut: string;
  gren: FornyelsesGren;
}

/**
 * Datoens UTC-kalenderdag som "YYYY-MM-DD" — samme hjælper som i
 * fornyelse.ts. Null ved ulæselig streng. Sammenligninger på strengen er
 * rene kalenderdato-sammenligninger og afhænger ikke af maskinens tidszone.
 */
function utcKalenderdato(s: string): string | null {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Tolv måneder frem fra en UTC-kalenderdag: samme kalenderdag året efter.
 * Findes dagen ikke (29. februar), er svaret 1. marts året efter — reglen
 * står i filhovedet. Skrevet med Date.UTC på komponenter, så der aldrig
 * regnes i lokal tid, og så 29/2-tilfældet er en synlig gren og ikke et
 * tavst rul.
 */
export function tolvMaanederFrem(dag: string): string {
  const [aar, md, d] = dag.split("-").map((x) => parseInt(x, 10));
  const erSkuddag = md === 2 && d === 29;
  const frem = erSkuddag
    ? new Date(Date.UTC(aar + 1, 2, 1)) // 1. marts året efter
    : new Date(Date.UTC(aar + 1, md - 1, d));
  return frem.toISOString().slice(0, 10);
}

/**
 * Afgør fornyelsesperioden for en betaling.
 *
 * @param gammelSlutdato companies.contract_end_date FØR fornyelsen — date-
 *   kolonne ("YYYY-MM-DD"), men tidsstempler accepteres og læses som UTC-
 *   kalenderdag. null = ingen slutdato.
 * @param betalingsdag tidspunktet betalingen behandles; læses som UTC-
 *   kalenderdag. Injiceres af kalderen (webhooken giver sit «nu»).
 */
export function beregnFornyelsesperiode(
  gammelSlutdato: string | null,
  betalingsdag: Date,
): Fornyelsesperiode {
  const betalingsdagen = betalingsdag.toISOString().slice(0, 10);
  const slutdag = gammelSlutdato === null ? null : utcKalenderdato(gammelSlutdato);

  // FØR ELLER PÅ slutdatoen: den nye periode begynder hvor den gamle
  // slutter, og løber tolv måneder derfra. Grænsen er <= på kalenderdag —
  // betaling PÅ slutdagen hører til her, selvom adgangen allerede er
  // forsvundet kl. 00:00 UTC den dag: den gamle periode er præcis netop
  // sluttet, og den nye tager over uden hul.
  if (slutdag !== null && betalingsdagen <= slutdag) {
    return {
      periode_start: slutdag,
      periode_slut: tolvMaanederFrem(slutdag),
      gren: "foer_udloeb",
    };
  }

  // EFTER slutdatoen (eller ingen slutdato): dagens regnestykke — tolv
  // måneder fra betalingsdagen. Dagene mellem gammel slutdato og betaling
  // var uden adgang og gives ikke tilbage.
  return {
    periode_start: betalingsdagen,
    periode_slut: tolvMaanederFrem(betalingsdagen),
    gren: "efter_udloeb",
  };
}
