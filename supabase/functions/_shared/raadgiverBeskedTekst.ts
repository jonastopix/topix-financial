/**
 * raadgiverBeskedTekst — de RENE dele af rådgiverbeskeden (10/9): dedup-dommen
 * og teksterne. Uden Supabase-import, så vitest kan dække dem
 * (src/lib/__tests__/raadgiverBesked.test.ts). Writeren bor i raadgiverBesked.ts.
 */
import { formatKrOere } from "./fornyelsesMail.ts";
import type { Betalingsmodel } from "./fornyelsespris.ts";

export interface EksisterendeRaekke {
  advisor_id: string | null;
  reference_id: string | null;
  title: string;
  /** Læses med (raadgiverBesked.ts), så kunUlaeste kan dømme. Valgfri: ældre kaldere af den rene dom uden feltet er uændrede. */
  read_at?: string | null;
}

/**
 * Ren: hvilke rådgivere mangler rækken? Dedup PR. RÅDGIVER på reference_id, ellers på titlen.
 * Fælles rækker (advisor_id null) tæller ikke. Standard: en læst række spærrer stadig.
 * kunUlaeste (Jonas 21/9, kun notify-community-svar): kun rækker med read_at null spærrer —
 * én ULÆST klokke pr. rådgiver; læst den, giver næste besked en ny.
 */
export function raadgivereUdenRaekke(
  raadgivere: readonly string[],
  eksisterende: readonly EksisterendeRaekke[],
  besked: { title: string; reference_id?: string | null },
  kunUlaeste = false,
): string[] {
  const har = new Set<string>();
  for (const r of eksisterende) {
    if (!r.advisor_id) continue;
    if (kunUlaeste && r.read_at) continue;
    const match = besked.reference_id ? r.reference_id === besked.reference_id : r.title === besked.title;
    if (match) har.add(r.advisor_id);
  }
  return raadgivere.filter((id) => !har.has(id));
}

// ── Teksterne (rene) ─────────────────────────────────────────────────

export const TYPE_FORNYELSE_BETALT = "fornyelse_betalt";
export const TYPE_FORNYELSE_DUBLET = "fornyelse_dublet";
export const TYPE_TRAEK_FEJLET = "traek_fejlet";
/** Fund B (14/9): invitationen efter betaling gik ikke — samme navneform som traek_fejlet. */
export const TYPE_INVITATION_FEJLET = "invitation_fejlet";
/** Før 22/9 (recon-webinar-22-9.md §7 pkt. 3, Jonas «1. Ja»): et NYT medlem har betalt — spejl af fornyelse_betalt. */
export const TYPE_INDGANG_BETALT = "indgang_betalt";

const MODEL_TEKST: Record<Betalingsmodel, string> = {
  fuld: "på én gang",
  rate2: "i to rater",
  rate12: "i tolv rater",
};

/** «CARMA STUDIO har fornyet medlemskabet» · «20.000 kr. ekskl. moms i to rater · til 3. oktober 2027». */
export function fornyelsesBeskedTekst(a: {
  virksomhed: string;
  samletOere: number;
  betalingsmodel: string;
  nySlutDatoTekst: string;
}): { title: string; body: string } {
  const model = MODEL_TEKST[a.betalingsmodel as Betalingsmodel] ?? a.betalingsmodel;
  return {
    title: `${a.virksomhed} har fornyet medlemskabet`,
    body: `${formatKrOere(a.samletOere)} kr. ekskl. moms ${model} · til ${a.nySlutDatoTekst}`,
  };
}

/**
 * Det fejlede træk (11/9, mangellistens kort 23): «doggybed: et træk på
 * 4.375 kr. fejlede» · «Stripe: Your card has insufficient funds.
 * (insufficient_funds) · prøver igen 17. september 2026 · faktura
 * DZ7BZXM5-0012». Beløbet er company_traek.beloeb_oere — fakturaens total
 * INKL. moms (migration 20260903150000:84); siden 16/9 trækkes momsen fra
 * når moms_oere er kendt («3.500 kr. ekskl. moms»), ellers står der
 * «inkl. moms» (traekBeloebTekst).
 * Datoen kommer færdigformateret ind (formatDanskDato i webhooken), som
 * nySlutDatoTekst gør det ovenfor: dette modul er rent.
 */
/**
 * Afvisningsgrunden på dansk, kort (16/9): Stripes decline_code (ellers
 * code) oversat for de koder et menneske kan handle på; ukendte koder står
 * ORDRET, så ingen gætter. Ordene er fra Stripes «Decline codes»-side
 * (docs.stripe.com/declines/codes), målt 16/9. Ren funktion.
 */
const AFVISNING_DANSK: Readonly<Record<string, string>> = {
  invalid_account: "kortet er afvist: lukket eller ugyldig konto",
  insufficient_funds: "ikke nok penge på kontoen",
  expired_card: "kortet er udløbet",
  card_declined: "kortet er afvist",
  generic_decline: "kortet er afvist uden angivet grund",
  do_not_honor: "kortet er afvist uden angivet grund",
  lost_card: "kortet er afvist",
  stolen_card: "kortet er afvist",
  fraudulent: "kortet er afvist",
  card_not_supported: "kortet kan ikke bruges til den slags køb",
  incorrect_cvc: "forkert CVC",
  incorrect_number: "forkert kortnummer",
  processing_error: "fejl hos kortudstederen",
  authentication_required: "kortet kræver godkendelse (3D Secure)",
  card_velocity_exceeded: "kortets beløbsgrænse er nået",
  withdrawal_count_limit_exceeded: "kortets beløbsgrænse er nået",
  currency_not_supported: "kortet understøtter ikke valutaen",
  new_account_information_available: "kortet er afvist: nye kortoplysninger findes hos udstederen",
  pickup_card: "kortet er afvist",
  restricted_card: "kortet er afvist",
  try_again_later: "kortudstederen beder om et nyt forsøg senere",
};

export function afvisningsgrundDansk(a: { declineCode?: string | null; kode?: string | null }): string | null {
  const decline = (a.declineCode ?? "").trim();
  const kode = (a.kode ?? "").trim();
  const noegle = decline || kode;
  if (!noegle) return null;
  return AFVISNING_DANSK[noegle] ?? noegle;
}

/** advice_code «do_not_try_again» (Stripe: «The card was declined and you shouldn’t use it again for the same transaction.») */
export function nyeForsoegVilIkkeLykkes(adviceCode: string | null | undefined): boolean {
  return (adviceCode ?? "").trim() === "do_not_try_again";
}

/**
 * Grunden i klokken (16/9): dansk kort form når koden kendes, ellers
 * Stripes besked; «Stripe gav ingen grund» KUN når hverken kode eller
 * besked findes. Stripes egen besked står i parentes efter den danske,
 * når begge findes og siger noget forskelligt.
 */
export function traekGrundTekst(a: { fejlBesked: string | null; declineCode: string | null; kode?: string | null }): string {
  const dansk = afvisningsgrundDansk({ declineCode: a.declineCode, kode: a.kode });
  const besked = (a.fejlBesked ?? "").trim();
  if (dansk && besked) return `${dansk} (Stripe: ${besked})`;
  if (dansk) return dansk;
  if (besked) return `Stripe: ${besked}`;
  return "Stripe gav ingen grund";
}

/**
 * Beløbet i klokken (16/9): «3.500 kr. ekskl. moms» når momsen er kendt
 * (company_traek.moms_oere), ellers «4.375 kr. inkl. moms» — beløbet vi
 * har, med det ord der er sandt. Aldrig 25 % antaget. Samme regel som
 * fladernes lib/traek.beloebTekst; hele kroner som klokken altid har skrevet.
 */
export function traekBeloebTekst(beloebOere: number, momsOere: number | null | undefined): string {
  return typeof momsOere === "number" && Number.isFinite(momsOere)
    ? `${formatKrOere(beloebOere - momsOere)} kr. ekskl. moms`
    : `${formatKrOere(beloebOere)} kr. inkl. moms`;
}

export function traekFejletBeskedTekst(a: {
  virksomhed: string;
  beloebOere: number;
  /** company_traek.moms_oere — null/udeladt = ikke kendt → «inkl. moms». */
  momsOere?: number | null;
  fejlBesked: string | null;
  declineCode: string | null;
  /** «17. september 2026» — eller null når Stripe ikke prøver igen. */
  naesteForsoegTekst: string | null;
  fakturaNummer: string | null;
  /** company_traek.fejl_kode (Stripes `code`, fx card_declined) — bruges når decline_code mangler. */
  kode?: string | null;
  /** PaymentIntent.last_payment_error.advice_code — bæres kun til klokken (ingen kolonne). */
  adviceCode?: string | null;
}): { title: string; body: string } {
  const grund = traekGrundTekst({ fejlBesked: a.fejlBesked, declineCode: a.declineCode, kode: a.kode });
  // do_not_try_again (16/9): Stripes Smart Retries prøver igen, men
  // udstederen har sagt at det ikke vil lykkes — medlemmet skal have et nyt
  // kort. Ellers som før: næste forsøg, eller ingen flere.
  const naeste = nyeForsoegVilIkkeLykkes(a.adviceCode)
    ? `Stripes nye forsøg${a.naesteForsoegTekst ? ` (${a.naesteForsoegTekst})` : ""} vil ikke lykkes — medlemmet skal have et nyt kort`
    : a.naesteForsoegTekst
      ? `prøver igen ${a.naesteForsoegTekst}`
      : "ingen flere forsøg fra Stripe";
  const faktura = (a.fakturaNummer ?? "").trim();
  const dele = [grund, naeste, ...(faktura ? [`faktura ${faktura}`] : [])];
  return {
    title: `${a.virksomhed}: et træk på ${traekBeloebTekst(a.beloebOere, a.momsOere)} fejlede`,
    body: dele.join(" · "),
  };
}

/** De felter fra company_traek-rækken dommen og teksten bruger. */
export interface FejletTraekRaekke {
  id: string | null;
  status: string;
  company_id: string | null;
  beloeb_oere: number;
  /** company_traek.moms_oere (20260917120000) — valgfri; null/udeladt = «inkl. moms». */
  moms_oere?: number | null;
  fejl_besked: string | null;
  fejl_decline_code: string | null;
  faktura_nummer: string | null;
  /** company_traek.fejl_kode — valgfri, så ældre kaldere og tests er uændrede. */
  fejl_kode?: string | null;
}

/** Strukturelt lig RaadgiverBesked (raadgiverBesked.ts) — reference_id er company_traek.id (uuid). */
export interface TraekFejletBesked {
  type: string;
  title: string;
  body: string;
  company_id: string;
  reference_type: "traek";
  reference_id: string;
}

/**
 * Ren dom: skal der en besked i klokken for denne række? Null når rækken
 * ikke har et id (intet at dedup'e på), ikke står som fejlet (et gensendt
 * event efter at trækket er betalt), eller ikke hører til en virksomhed.
 * reference_id = company_traek.id: UNIQUE stripe_invoice_id giver én række
 * pr. faktura, så otte forsøg på samme faktura peger på samme id.
 */
export function beskedVedFejletTraek(a: {
  traek: FejletTraekRaekke;
  virksomhed: string;
  naesteForsoegTekst: string | null;
  /** advice_code fra dagens opslag (ikke i rækken) — «do_not_try_again» ændrer næste-forsøg-leddet. */
  adviceCode?: string | null;
}): TraekFejletBesked | null {
  const id = (a.traek.id ?? "").trim();
  const companyId = (a.traek.company_id ?? "").trim();
  if (!id || a.traek.status !== "fejlet" || !companyId) return null;
  const tekst = traekFejletBeskedTekst({
    virksomhed: a.virksomhed,
    beloebOere: a.traek.beloeb_oere,
    momsOere: a.traek.moms_oere ?? null,
    fejlBesked: a.traek.fejl_besked,
    declineCode: a.traek.fejl_decline_code,
    naesteForsoegTekst: a.naesteForsoegTekst,
    fakturaNummer: a.traek.faktura_nummer,
    kode: a.traek.fejl_kode ?? null,
    adviceCode: a.adviceCode ?? null,
  });
  return {
    type: TYPE_TRAEK_FEJLET,
    ...tekst,
    company_id: companyId,
    reference_type: "traek",
    reference_id: id,
  };
}

// ── Invitationen efter betaling (fund B, 14/9) ─────────────────────────
//
// sikrIndgangsInvitation (stripe-webhook) svarer med fire udfald og kaster
// aldrig; før 14/9 læste ingen svaret, og et betalt medlem uden login var
// kun en linje i Lovables log. Tre udfald er normale og skal ikke larme:
// «sendt», «fandtes_allerede» og «allerede_medlem» (15/9, DE TYVE (8):
// invitationen er accepteret, og brugeren findes — medlemmet HAR sit
// login, så «intet login» ville være usandt). To skal i klokken: «sprunget_over»
// (secret INVITATION_AFSENDER_USER_ID mangler) og «fejlet» (opslag,
// insert eller send-invitation-email fejlede). Typen er strukturelt lig
// IndgangsInvitationResultat (sikrIndgangsInvitation.ts:38-42) — gentaget
// her, så modulet forbliver uden import af noget der trækker Supabase ind.

export type InvitationsUdfald =
  | { udfald: "sendt"; email: string }
  | { udfald: "fandtes_allerede"; email: string }
  | { udfald: "allerede_medlem"; email: string }
  | { udfald: "sprunget_over"; grund: "secret_mangler" }
  | { udfald: "fejlet"; aarsag: string };

/**
 * Strukturelt lig RaadgiverBesked. reference_type "company" + reference_id =
 * companies.id: klokken linker til /virksomhed/{company_id} (klokke.ts
 * raadgiverSti, default-grenen), og dedup'en i skrivRaadgiverBesked er
 * advisor_id + type + reference_id — så et event Stripe gensender fem
 * gange (webhooken svarer 500 ved kast) giver én besked pr. rådgiver. Nøglen
 * er stabil på tværs af gensendelser OG på tværs af checkout-/fakturavejen,
 * fordi begge veje ender på samme company_id; et Stripe-id kan ikke bruges
 * (kolonnen er uuid). Prisen: fejler invitationen igen for samme virksomhed
 * efter at rådgiveren har inviteret manuelt, ringer klokken ikke igen —
 * den manuelle invitation er netop udvejen.
 */
export interface InvitationFejletBesked {
  type: string;
  title: string;
  body: string;
  company_id: string;
  reference_type: "company";
  reference_id: string;
}

/** «FLOOR1 I/S: invitationen efter betaling blev ikke sendt» · «Til lisbeth@… · secret INVITATION_AFSENDER_USER_ID mangler · …». */
export function invitationFejletBeskedTekst(a: {
  virksomhed: string;
  email: string | null;
  grund: string;
  stripeReference: string;
}): { title: string; body: string } {
  const til = (a.email ?? "").trim() || "mailadresse ukendt";
  return {
    title: `${a.virksomhed}: invitationen efter betaling blev ikke sendt`,
    body: [
      `Til ${til}`,
      a.grund,
      `Betalingen er registreret (${a.stripeReference}) og adgangen er åben, men medlemmet har intet login`,
      "Invitér manuelt fra /virksomheder (Inviter) — mailen bygges af invitationsrækken",
    ].join(" · "),
  };
}

/**
 * Ren dom: skal der en besked i klokken for dette udfald? Null for «sendt»
 * og «fandtes_allerede» — begge betyder at en pending invitation findes og
 * mailen er gået (eller allerede var gået) — og for «allerede_medlem»
 * (15/9): invitationen er accepteret af en bruger der findes, så medlemmet
 * har sit login og intet mangler. company_id skal findes (kolonnen er
 * NOT NULL), ellers null.
 */
export function beskedVedInvitationsUdfald(a: {
  udfald: InvitationsUdfald;
  virksomhed: string;
  email: string | null;
  companyId: string;
  stripeReference: string;
}): InvitationFejletBesked | null {
  const companyId = (a.companyId ?? "").trim();
  if (!companyId) return null;
  if (a.udfald.udfald === "sendt" || a.udfald.udfald === "fandtes_allerede" || a.udfald.udfald === "allerede_medlem") return null;
  const grund =
    a.udfald.udfald === "sprunget_over"
      ? "Secret INVITATION_AFSENDER_USER_ID mangler i Lovable — ingen invitation kan oprettes før den er sat"
      : `Fejl: ${(a.udfald.aarsag ?? "").trim() || "ukendt"}`;
  return {
    type: TYPE_INVITATION_FEJLET,
    ...invitationFejletBeskedTekst({ virksomhed: a.virksomhed, email: a.email, grund, stripeReference: a.stripeReference }),
    company_id: companyId,
    reference_type: "company",
    reference_id: companyId,
  };
}

/** Dubletten: titlen er stabil pr. virksomhed (dedup uden reference_id), sessionen står i teksten. */
export function dubletBeskedTekst(a: {
  virksomhed: string;
  samletOere: number;
  sessionId: string;
  detalje: string;
}): { title: string; body: string } {
  return {
    title: `Mulig dobbeltbetaling: ${a.virksomhed}`,
    body: `Stripe-session ${a.sessionId} på ${formatKrOere(a.samletOere)} kr. ekskl. moms er betalt, men perioden var allerede betalt — ${a.detalje}. Der er IKKE skrevet en periode eller forlænget kontrakt. Refundér i Stripe, eller skriv perioden i hånden hvis det er meningen.`,
  };
}
