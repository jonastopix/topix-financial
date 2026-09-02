/**
 * src/lib/betalingsfrist.ts
 *
 * Ren, testbar afgørelse af en virksomheds betalingstilstand i indgangen
 * (underskrift → betalingsmail → betaling). Samme mønster som
 * afgoerFornyelsestilstand i src/lib/fornyelse.ts: ingen I/O, ingen
 * Supabase, ingen React — samme input giver altid samme output.
 *
 * IKKE spejlet i Deno endnu. Spejlingen (supabase/functions/_shared/) og
 * paritetstesten er en selvstændig opgave og laves først når en edge
 * function skal bruge motoren. Indtil da er denne fil den eneste kilde.
 *
 * Datagrundlag: public.company_betalingslink (migration 20260902080000)
 * plus companies.contract_end_date. Beslutningerne bag hver tilstand står i
 * docs/indgangen-design.md — §4 (de 30 dage), §9 (de fire mails), §16
 * (hvor niveauet bor), §17 (virksomheden oprettes uden pris), §19 (to
 * udløsere, fristen løber fra betalingsmailen), §21 (to mails, aldrig
 * samtidig).
 *
 * Dage regnes i hele kalenderdage på UTC-komponenter af begge datoer, så
 * tallet er det samme uanset maskinens tidszone (testene skal bestå både
 * lokalt og under TZ=UTC). Samme funktioner som i fornyelse.ts.
 */

/**
 * Betalingsfristen: så mange dage efter betalingsmailen kan medlemmet
 * betale via linket. Dagen efter (dag 31) sendes fakturaen på det fulde
 * beløb, og linket viser at fristen er passeret (§4, §5). Ændres tallet,
 * ændres mailene i produktion — de nævner fristen som dato.
 */
export const BETALINGSFRIST_DAGE = 30;

/**
 * Påmindelsesrytmen fra §9: dag 0 er betalingsmailen selv; herefter dag 14,
 * dag 25 og dag 31 (fakturaen). Dag 7 fra den gamle Monday-automatik er
 * bevidst droppet — «der er intet nyt at sige efter en uge». Rækkefølgen
 * er stigende; motoren stoler på det.
 */
export const PAAMINDELSESDAGE = [14, 25, 31] as const;

export type Paamindelsesdag = (typeof PAAMINDELSESDAGE)[number];

export interface BetalingsfristInput {
  /** company_betalingslink.prisniveau_oere — NULL = rådgiveren har ikke sat prisen (§17). */
  prisniveau_oere: number | null;
  /**
   * company_betalingslink.underskrevet_at — «Godkendt» på Monday. Bæres med
   * i inputtet, men indgår BEVIDST ikke i nogen afgørelse: fristen løber fra
   * betalingsmailen, ikke fra underskriften (§19). Feltet er her så
   * kalderen ikke skal vælge kolonner selv, og så en senere tilstand
   * («underskrevet, afventer pris i N dage») kan bygges uden at ændre
   * inputtet.
   */
  underskrevet_at: string;
  /** company_betalingslink.betalingsmail_sendt_at — dag 0. NULL = ikke sendt. */
  betalingsmail_sendt_at: string | null;
  /** company_betalingslink.sidste_paamindelse_dag — 14 | 25 | 31, eller NULL. */
  sidste_paamindelse_dag: number | null;
  /** companies.contract_end_date — sættes af stripe-webhook ved betaling. */
  contract_end_date: string | null;
}

export type Betalingsfriststatus =
  | "betalt"
  | "afventer_pris"
  | "klar_til_mail"
  | "afventer_betaling"
  | "frist_overskredet";

export interface Betalingsfristtilstand {
  status: Betalingsfriststatus;
  /**
   * Hele kalenderdage siden betalingsmailen; null hvis den ikke er sendt.
   * Negativ kan ikke forekomme (en mail stemplet i fremtiden regnes som
   * sendt i dag — se beregnDageSidenMail).
   */
  dage_siden_mail: number | null;
  /**
   * Hvilken påmindelse der er forfalden NU: 14, 25, 31 — eller null.
   * Null når ingen er forfalden, når den er sendt allerede, eller når
   * status ikke er afventer_betaling/frist_overskredet.
   */
  paamindelse_forfalden: Paamindelsesdag | null;
}

const MS_PER_DOEGN = 86_400_000;

/** UTC-midnat for datoens kalenderdag — tidszone-uafhængig dagsammenligning. */
function utcMidnat(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Hele kalenderdage fra betalingsmailen til nu. Mailen sendt kl. 09:00 UTC
 * den 2/9 og nu kl. 08:00 UTC den 3/9 er én dag — kalenderdage, ikke
 * 24-timers-perioder, fordi mailene taler om dage og datoer (§9: «Fristen
 * angives med DATO»). Et stempel i fremtiden (uret på to maskiner er ikke
 * ens) klemmes til 0: negative dage giver ingen mening for en frist.
 * Ugyldigt tidsstempel giver null; kalderen behandler det som «sendt, alder
 * ukendt» (se afgoerBetalingsfrist) — aldrig som «ikke sendt», for det
 * ville sende betalingsmailen igen.
 */
function beregnDageSidenMail(sendtAt: string, now: Date): number | null {
  const sendt = new Date(sendtAt);
  if (Number.isNaN(sendt.getTime())) return null;
  const dage = Math.round((utcMidnat(now) - utcMidnat(sendt)) / MS_PER_DOEGN);
  return Math.max(0, dage);
}

/**
 * Den påmindelse der er forfalden nu — højst én, og det er den SENESTE
 * forfaldne.
 *
 * Regnestykket: en påmindelse t (14, 25 eller 31) er forfalden når
 *   dage_siden_mail >= t  OG  (sidste_paamindelse_dag er null ELLER < t).
 * Dag 14 kræver altså sidste = null. Dag 25 kræver sidste ∈ {null, 14}.
 * Dag 31 kræver sidste ∈ {null, 14, 25}. sidste = 31 giver null uanset
 * alder — der findes ikke et trin efter fakturaen.
 *
 * Springet: er der gået 26 dage og ingen påmindelse sendt, returneres 25,
 * ikke 14. En påmindelse om noget der skete for tolv dage siden er støj;
 * medlemmet skal have den besked der passer til hvor de er NU. Derfor
 * gennemløbes trinnene fra det højeste, og det første forfaldne vinder.
 * Konsekvensen er at et oversprunget trin aldrig sendes — det er
 * tilsigtet, og sidste_paamindelse_dag stemples med det trin der faktisk
 * blev sendt, så næste kørsel regner rigtigt.
 */
function findForfaldenPaamindelse(
  dageSidenMail: number,
  sidstePaamindelseDag: number | null,
): Paamindelsesdag | null {
  for (let i = PAAMINDELSESDAGE.length - 1; i >= 0; i--) {
    const trin = PAAMINDELSESDAGE[i];
    const forfalden = dageSidenMail >= trin;
    const ikkeSendt = sidstePaamindelseDag === null || sidstePaamindelseDag < trin;
    if (forfalden && ikkeSendt) return trin;
  }
  return null;
}

/**
 * Afgør betalingstilstanden for en virksomhed i indgangen.
 *
 * Fem tilstande i PRIORITERET rækkefølge — den første der matcher, vinder:
 *   1. betalt             contract_end_date er sat. Afgøres FØRST, så en
 *                         betalt virksomhed aldrig får en påmindelse,
 *                         uanset hvad linkrækken siger.
 *   2. afventer_pris      prisniveau_oere er null (§17). Ingen mail er sendt
 *                         og må ikke sendes; rådgiveren har fået besked.
 *   3. klar_til_mail      pris sat, mail ikke sendt. De to udløsere fra §19
 *                         (Godkendt MED pris, eller prisen sat manuelt
 *                         bagefter) ender begge her — motoren skelner ikke,
 *                         for handlingen er den samme: send dag 0-mailen.
 *   4. afventer_betaling  mail sendt, 0–30 dage siden. Linket åbner en
 *                         betaling.
 *   5. frist_overskredet  mere end 30 dage siden. Fakturaen er sendt (eller
 *                         skal sendes) dag 31; aftalen bortfalder IKKE (§4);
 *                         linket viser at fristen er passeret (§5).
 *
 * Fravær af række i company_betalingslink er ikke et input her: kalderen
 * afgør selv om virksomheden er i indgangen (rækken findes) eller ej.
 */
export function afgoerBetalingsfrist(
  input: BetalingsfristInput,
  now: Date = new Date(),
): Betalingsfristtilstand {
  // BETALT — afgøres før alt andet. contract_end_date skrives af
  // stripe-webhook når betalingen er gået igennem, og det er det eneste
  // signal der tæller. En betalt virksomhed med en gammel linkrække må
  // aldrig ende i en påmindelsesgren.
  if (input.contract_end_date) {
    return { status: "betalt", dage_siden_mail: null, paamindelse_forfalden: null };
  }

  // AFVENTER PRIS — §17: virksomheden oprettes ved «Godkendt» selv uden
  // pris, så «har skrevet under, mangler noget» er en synlig tilstand og
  // ikke et tomrum. Der sendes ingen betalingsmail før prisen er sat.
  if (input.prisniveau_oere === null) {
    return { status: "afventer_pris", dage_siden_mail: null, paamindelse_forfalden: null };
  }

  // KLAR TIL MAIL — prisen er der, dag 0-mailen er ikke sendt. Idempotensen
  // bæres af betalingsmail_sendt_at (§19): når kalderen har sendt, stempler
  // den feltet, og næste kørsel lander i afventer_betaling.
  if (input.betalingsmail_sendt_at === null) {
    return { status: "klar_til_mail", dage_siden_mail: null, paamindelse_forfalden: null };
  }

  const dage_siden_mail = beregnDageSidenMail(input.betalingsmail_sendt_at, now);

  // Ugyldigt stempel: mailen ER sendt (feltet er ikke null), men alderen
  // kan ikke regnes. Fail-closed: afventer_betaling uden påmindelse — vi
  // sender hverken dag 0 igen eller en påmindelse på et gæt.
  if (dage_siden_mail === null) {
    return { status: "afventer_betaling", dage_siden_mail: null, paamindelse_forfalden: null };
  }

  // Fristen løber fra betalingsmailen, IKKE fra underskrevet_at (§19: den
  // der ventede fire dage på at få sin pris sat, skal ikke have fire dage
  // mindre til at betale). Dag 30 er stadig inden for fristen; dag 31 er
  // overskredet — samme dag som fakturaen (§4, §9).
  const paamindelse_forfalden = findForfaldenPaamindelse(
    dage_siden_mail,
    input.sidste_paamindelse_dag,
  );

  if (dage_siden_mail <= BETALINGSFRIST_DAGE) {
    return { status: "afventer_betaling", dage_siden_mail, paamindelse_forfalden };
  }

  return { status: "frist_overskredet", dage_siden_mail, paamindelse_forfalden };
}
