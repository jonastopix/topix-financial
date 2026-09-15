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
}

/** Ren: hvilke rådgivere mangler rækken? Dedup på reference_id, ellers på titlen. Fælles rækker (advisor_id null) tæller ikke. */
export function raadgivereUdenRaekke(
  raadgivere: readonly string[],
  eksisterende: readonly EksisterendeRaekke[],
  besked: { title: string; reference_id?: string | null },
): string[] {
  const har = new Set<string>();
  for (const r of eksisterende) {
    if (!r.advisor_id) continue;
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
 * INKL. moms (migration 20260903150000:84), derfor står der ikke «ekskl.».
 * Datoen kommer færdigformateret ind (formatDanskDato i webhooken), som
 * nySlutDatoTekst gør det ovenfor: dette modul er rent.
 */
export function traekFejletBeskedTekst(a: {
  virksomhed: string;
  beloebOere: number;
  fejlBesked: string | null;
  declineCode: string | null;
  /** «17. september 2026» — eller null når Stripe ikke prøver igen. */
  naesteForsoegTekst: string | null;
  fakturaNummer: string | null;
}): { title: string; body: string } {
  const besked = (a.fejlBesked ?? "").trim();
  const kode = (a.declineCode ?? "").trim();
  const grund = besked && kode ? `Stripe: ${besked} (${kode})` : besked ? `Stripe: ${besked}` : kode ? `Stripe: ${kode}` : "Stripe gav ingen grund";
  const naeste = a.naesteForsoegTekst ? `prøver igen ${a.naesteForsoegTekst}` : "ingen flere forsøg fra Stripe";
  const faktura = (a.fakturaNummer ?? "").trim();
  const dele = [grund, naeste, ...(faktura ? [`faktura ${faktura}`] : [])];
  return {
    title: `${a.virksomhed}: et træk på ${formatKrOere(a.beloebOere)} kr. fejlede`,
    body: dele.join(" · "),
  };
}

/** De felter fra company_traek-rækken dommen og teksten bruger. */
export interface FejletTraekRaekke {
  id: string | null;
  status: string;
  company_id: string | null;
  beloeb_oere: number;
  fejl_besked: string | null;
  fejl_decline_code: string | null;
  faktura_nummer: string | null;
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
}): TraekFejletBesked | null {
  const id = (a.traek.id ?? "").trim();
  const companyId = (a.traek.company_id ?? "").trim();
  if (!id || a.traek.status !== "fejlet" || !companyId) return null;
  const tekst = traekFejletBeskedTekst({
    virksomhed: a.virksomhed,
    beloebOere: a.traek.beloeb_oere,
    fejlBesked: a.traek.fejl_besked,
    declineCode: a.traek.fejl_decline_code,
    naesteForsoegTekst: a.naesteForsoegTekst,
    fakturaNummer: a.traek.faktura_nummer,
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
