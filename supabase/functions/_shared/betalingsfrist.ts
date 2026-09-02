/**
 * supabase/functions/_shared/betalingsfrist.ts
 *
 * Spejlet ordret fra src/lib/betalingsfrist.ts — enhver ændring her SKAL
 * også laves der. Pariteten håndhæves af testen i
 * src/lib/__tests__/betalingsfristParitet.test.ts.
 *
 * Filen har nul imports og kan derfor loades af både Vite/Vitest (Node)
 * og Deno uden ændringer. Filhovedet er den ENESTE forskel mellem de to.
 *
 * Ren, testbar afgørelse af en virksomheds betalingstilstand i indgangen
 * (underskrift → betalingsmail → betaling). Samme mønster som
 * afgoerFornyelsestilstand i src/lib/fornyelse.ts: ingen I/O, ingen
 * Supabase, ingen React — samme input giver altid samme output.
 *
 * FRISTEN ER KONTRAKTENS — RETTET 2/9. Aftalegrundlaget giver 30 dage fra
 * UNDERSKRIFTEN; det er kontraktens frist, ikke vores at give. En tidligere
 * version regnede fra betalingsmailen (§19 i designdokumentet, besluttet
 * 1/9 — det var forkert). Dag 0-mailen sagde hele tiden «30 dage fra
 * underskriften», og den tekst er rigtig. Konsekvensen er tilsigtet:
 * sættes prisen fire dage efter godkendelsen, har medlemmet 26 dage
 * tilbage — ikke 30. Alle dage regnes derfor fra underskrevet_at;
 * betalingsmail_sendt_at bruges KUN til at skelne klar_til_mail fra
 * afventer_betaling, aldrig til at regne dage.
 *
 * Datagrundlag: public.company_betalingslink (migration 20260902080000)
 * plus companies.contract_end_date. Beslutningerne bag hver tilstand står i
 * docs/indgangen-design.md — §4 (de 30 dage), §9 (de fire mails), §16
 * (hvor niveauet bor), §17 (virksomheden oprettes uden pris), §19 (to
 * udløsere), §21 (to mails, aldrig samtidig).
 *
 * Dage regnes i hele kalenderdage på UTC-komponenter af begge datoer, så
 * tallet er det samme uanset maskinens tidszone (testene skal bestå både
 * lokalt og under TZ=UTC). Samme funktioner som i fornyelse.ts.
 */

/**
 * Betalingsfristen: så mange dage efter UNDERSKRIFTEN kan medlemmet betale
 * via linket — kontraktens frist. Dagen efter (dag 31) sendes fakturaen på
 * det fulde beløb, og linket viser at fristen er passeret (§4, §5). Ændres
 * tallet, ændres mailene i produktion — de nævner fristen som dato.
 */
export const BETALINGSFRIST_DAGE = 30;

/**
 * Påmindelsesrytmen fra §9, regnet fra UNDERSKRIFTEN: dag 14, dag 25 og dag
 * 31 (fakturaen). Dag 0 er betalingsmailen, som kan komme senere end
 * underskriften (§19, udløser 2). Rytmen følger kontraktens frist, ikke
 * mailen — ellers ville en sent sat pris skubbe hele rytmen, og dag
 * 31-fakturaen ville komme efter fristen var passeret. Dag 7 fra den gamle
 * Monday-automatik er bevidst droppet — «der er intet nyt at sige efter en
 * uge». Rækkefølgen er stigende; motoren stoler på det.
 */
export const PAAMINDELSESDAGE = [14, 25, 31] as const;

export type Paamindelsesdag = (typeof PAAMINDELSESDAGE)[number];

export interface BetalingsfristInput {
  /** company_betalingslink.prisniveau_oere — NULL = rådgiveren har ikke sat prisen (§17). */
  prisniveau_oere: number | null;
  /**
   * company_betalingslink.underskrevet_at — «Godkendt» på Monday. ANKERET
   * for alle dage: fristen er kontraktens 30 dage fra underskriften, og
   * påmindelserne regnes herfra (rettet 2/9).
   */
  underskrevet_at: string;
  /**
   * company_betalingslink.betalingsmail_sendt_at — dag 0. NULL = ikke sendt.
   * Bruges KUN til at skelne klar_til_mail fra afventer_betaling — aldrig
   * til at regne dage.
   */
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
   * Hele kalenderdage siden underskriften — kontraktens ur. Null ved betalt
   * (der er ingen frist mere) og ved et ugyldigt underskrevet_at. Findes for
   * afventer_pris og klar_til_mail også: fristen løber, selvom mailen ikke
   * er sendt endnu. Negativ kan ikke forekomme (en underskrift stemplet i
   * fremtiden regnes som i dag — se beregnDageSidenUnderskrift).
   */
  dage_siden_underskrift: number | null;
  /**
   * Hvilken påmindelse der er forfalden NU: 14, 25, 31 — eller null.
   * Null når ingen er forfalden, når den er sendt allerede, eller når
   * status ikke er afventer_betaling/frist_overskredet: før dag 0 er
   * sendt, sendes der ingen påmindelser, uanset hvor mange dage der er
   * gået — der er intet link at minde om.
   */
  paamindelse_forfalden: Paamindelsesdag | null;
}

const MS_PER_DOEGN = 86_400_000;

/** UTC-midnat for datoens kalenderdag — tidszone-uafhængig dagsammenligning. */
function utcMidnat(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Hele kalenderdage fra underskriften til nu. Underskrevet kl. 09:00 UTC
 * den 2/9 og nu kl. 08:00 UTC den 3/9 er én dag — kalenderdage, ikke
 * 24-timers-perioder, fordi mailene taler om dage og datoer (§9: «Fristen
 * angives med DATO»). Et stempel i fremtiden (uret på to maskiner er ikke
 * ens) klemmes til 0: negative dage giver ingen mening for en frist.
 * Ugyldigt tidsstempel giver null; kalderen behandler det som «alder
 * ukendt» (se afgoerBetalingsfrist): ingen påmindelse, aldrig
 * frist_overskredet — fail-closed.
 */
function beregnDageSidenUnderskrift(underskrevetAt: string, now: Date): number | null {
  const underskrevet = new Date(underskrevetAt);
  if (Number.isNaN(underskrevet.getTime())) return null;
  const dage = Math.round((utcMidnat(now) - utcMidnat(underskrevet)) / MS_PER_DOEGN);
  return Math.max(0, dage);
}

/**
 * Den påmindelse der er forfalden nu — højst én, og det er den SENESTE
 * forfaldne.
 *
 * Regnestykket: en påmindelse t (14, 25 eller 31) er forfalden når
 *   dage_siden_underskrift >= t  OG  (sidste_paamindelse_dag er null ELLER < t).
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
 * blev sendt, så næste kørsel regner rigtigt. Samme spring gælder når dag
 * 0-mailen selv kom sent (prisen sat dag 20): første påmindelse er så dag
 * 25, ikke dag 14 — kontraktens ur har kørt imens.
 */
function findForfaldenPaamindelse(
  dageSidenUnderskrift: number,
  sidstePaamindelseDag: number | null,
): Paamindelsesdag | null {
  for (let i = PAAMINDELSESDAGE.length - 1; i >= 0; i--) {
    const trin = PAAMINDELSESDAGE[i];
    const forfalden = dageSidenUnderskrift >= trin;
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
 *                         Fristen LØBER imens — dage_siden_underskrift
 *                         bæres med, så rådgiveren kan se hvor mange dage
 *                         der er tilbage.
 *   3. klar_til_mail      pris sat, mail ikke sendt. De to udløsere fra §19
 *                         (Godkendt MED pris, eller prisen sat manuelt
 *                         bagefter) ender begge her — motoren skelner ikke,
 *                         for handlingen er den samme: send dag 0-mailen.
 *                         Også når fristen allerede er passeret: mailen
 *                         skal ud, og den siger selv hvad fristen var.
 *   4. afventer_betaling  mail sendt, 0–30 dage siden UNDERSKRIFTEN. Linket
 *                         åbner en betaling.
 *   5. frist_overskredet  mere end 30 dage siden underskriften og mailen er
 *                         sendt. Fakturaen er sendt (eller skal sendes) dag
 *                         31; aftalen bortfalder IKKE (§4); linket viser at
 *                         fristen er passeret (§5).
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
    return { status: "betalt", dage_siden_underskrift: null, paamindelse_forfalden: null };
  }

  // Kontraktens ur: dage fra underskriften, uanset hvad der ellers er sket.
  // Null = ugyldigt stempel; så kendes alderen ikke, og der sendes hverken
  // påmindelser eller dømmes frist_overskredet (fail-closed).
  const dage_siden_underskrift = beregnDageSidenUnderskrift(input.underskrevet_at, now);

  // AFVENTER PRIS — §17: virksomheden oprettes ved «Godkendt» selv uden
  // pris, så «har skrevet under, mangler noget» er en synlig tilstand og
  // ikke et tomrum. Der sendes ingen betalingsmail før prisen er sat — men
  // fristen løber (den er kontraktens), og dagene bæres med.
  if (input.prisniveau_oere === null) {
    return { status: "afventer_pris", dage_siden_underskrift, paamindelse_forfalden: null };
  }

  // KLAR TIL MAIL — prisen er der, dag 0-mailen er ikke sendt. Idempotensen
  // bæres af betalingsmail_sendt_at (§19): når kalderen har sendt, stempler
  // den feltet, og næste kørsel lander i afventer_betaling.
  if (input.betalingsmail_sendt_at === null) {
    return { status: "klar_til_mail", dage_siden_underskrift, paamindelse_forfalden: null };
  }

  // Ugyldigt underskrevet_at: mailen ER sendt, men alderen kan ikke regnes.
  // Fail-closed: afventer_betaling uden påmindelse.
  if (dage_siden_underskrift === null) {
    return { status: "afventer_betaling", dage_siden_underskrift: null, paamindelse_forfalden: null };
  }

  // Fristen er kontraktens: 30 dage fra UNDERSKRIFTEN, ikke fra mailen
  // (rettet 2/9). Dag 30 er stadig inden for fristen; dag 31 er
  // overskredet — samme dag som fakturaen (§4, §9). Påmindelserne følger
  // samme ur.
  const paamindelse_forfalden = findForfaldenPaamindelse(
    dage_siden_underskrift,
    input.sidste_paamindelse_dag,
  );

  if (dage_siden_underskrift <= BETALINGSFRIST_DAGE) {
    return { status: "afventer_betaling", dage_siden_underskrift, paamindelse_forfalden };
  }

  return { status: "frist_overskredet", dage_siden_underskrift, paamindelse_forfalden };
}
