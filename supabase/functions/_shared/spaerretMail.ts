/**
 * spaerretMail — den rene motor bag rådgivernes klokke, når en mail om
 * adgang eller penge bliver spærret (16/9-2026).
 *
 * HVORFOR DEN FINDES (recon-klokke-spaerret-mail.md, recon-afmeldingslinket.md):
 * Lovable spærrer en adresse for ALLE app-mails efter en afmelding, en
 * bounce eller en klage (scoped til modtager + afsenderdomænets apex).
 * sendManagedEmail får «recipient_suppressed» og logger «suppressed» —
 * men ingen rådgiver fik besked: sendIndgangsMail svarede bare false, og
 * cronen prøvede igen næste dag mod samme mur. En invitation, en
 * betalingsmail eller et fornyelsesvarsel der aldrig når frem, er adgang
 * og penge der forsvinder i tavshed. Klokken skal ringe én gang pr.
 * virksomhed, med hvad rådgiveren skal gøre: skaffe en adresse der virker.
 *
 * KUN mails om adgang og penge (SPAERRET_KLOKKE_LABELS). Onboarding,
 * intro-påmindelser og notifikationer er ikke med — de er ikke kritiske,
 * og de har husets eget fravalg.
 *
 * DEDUP: beskeden bærer type TYPE_MAIL_SPAERRET og reference_id =
 * company_id. skrivRaadgiverBesked (raadgiverBesked.ts:80-97) slår op på
 * type + advisor_id + reference_id, og raadgivereUdenRaekke
 * (raadgiverBeskedTekst.ts:16-28) matcher på reference_id alene —
 * read_at indgår IKKE. Konsekvensen er én række pr. rådgiver pr.
 * virksomhed, så længe rækken findes i advisor_notifications:
 *   - cronens daglige nye forsøg (stemplet står tomt, mailen prøves igen,
 *     Lovable afviser igen) giver IKKE en ny klokke hver dag;
 *   - at rådgiveren læser beskeden (read_at) nulstiller IKKE dedup'en — en
 *     læst besked spærrer stadig for en ny med samme virksomhed;
 *   - en senere spærring af en ANDEN adresse i samme virksomhed giver
 *     heller ikke en ny klokke: referencen er virksomheden, ikke adressen.
 *     Den anden adresse står da kun i email_send_log (status suppressed,
 *     VirksomhedMailLog).
 *
 * REN: ingen Deno-, URL- eller npm-imports — vitest importerer filen
 * direkte (src/lib/__tests__/spaerretMail.test.ts). IO-omslaget
 * meldSpaerretMail bor i raadgiverBesked.ts.
 */

export const TYPE_MAIL_SPAERRET = "mail_spaerret";

/** Labels (template_name i email_send_log = label hos Lovable) der ringer klokken.
    Navnene er kodens: send-invitation-email ('invitation'),
    indgangsBetalingsmail.ts (LABEL_DAG0), indgangs-paamindelser-cron
    (`indgang-dag${trin}`, trin ∈ betalingsfrist.ts PAAMINDELSESDAGE) og
    fornyelsesMail.ts (LABEL_VARSEL_*, LABEL_VINDUE_*, LABEL_KVITTERING).
    KUN levende labels: indgang-dag<N>-mængden her er præcis PAAMINDELSESDAGE
    (låst af spaerretMail.guard.test.ts) — ændres trinnene, ændres listen. */
export const SPAERRET_KLOKKE_LABELS = [
  "invitation",
  "indgang-dag0",
  "indgang-dag14",
  "indgang-dag25",
  "indgang-dag31",
  "fornyelse-varsel1",
  "fornyelse-varsel2",
  "fornyelse-vindue1",
  "fornyelse-vindue2",
  "fornyelse-kvittering",
] as const;

export type SpaerretKlokkeLabel = (typeof SPAERRET_KLOKKE_LABELS)[number];

export function erSpaerretKlokkeLabel(label: string): label is SpaerretKlokkeLabel {
  return (SPAERRET_KLOKKE_LABELS as readonly string[]).includes(label);
}

/** Kort dansk navn på mailen, til klokkens tekst. Ukendt label står ordret. */
export function beskrivMail(label: string): string {
  if (label === "invitation") return "Invitationen";
  if (label === "indgang-dag0") return "Betalingsmailen";
  const dag = /^indgang-dag(\d+)$/.exec(label);
  if (dag) return `Betalingspåmindelsen (dag ${dag[1]})`;
  if (label === "fornyelse-varsel1" || label === "fornyelse-varsel2") return "Fornyelsesvarslet";
  if (label === "fornyelse-vindue1" || label === "fornyelse-vindue2") return "Mailen om at forlænge";
  if (label === "fornyelse-kvittering") return "Kvitteringen for fornyelsen";
  return label;
}

/** Strukturelt lig RaadgiverBesked (raadgiverBesked.ts) — som TraekFejletBesked
    og InvitationFejletBesked i raadgiverBeskedTekst.ts. reference_id =
    companies.id (uuid): klokken linker til /virksomhed/{company_id}
    (klokke.ts raadgiverSti, default-grenen). */
export interface SpaerretMailBesked {
  type: string;
  title: string;
  body: string;
  company_id: string;
  reference_type: "company";
  reference_id: string;
}

/**
 * Ren dom: skal der en besked i klokken? Null når labelen ikke er en af
 * adgangs-/pengemailene, eller når companyId mangler (kolonnen bruges som
 * reference og som link — uden den er der intet at dedup'e på).
 */
export function beskedVedSpaerretMail(a: {
  label: string;
  companyId: string | null | undefined;
  virksomhed: string;
  modtager: string;
}): SpaerretMailBesked | null {
  const companyId = (a.companyId ?? "").trim();
  if (!companyId) return null;
  if (!erSpaerretKlokkeLabel(a.label)) return null;
  const modtager = (a.modtager ?? "").trim() || "mailadresse ukendt";
  return {
    type: TYPE_MAIL_SPAERRET,
    title: `Mails til ${a.virksomhed} bliver ikke leveret`,
    body:
      `${beskrivMail(a.label)} til ${modtager} blev ikke sendt: adressen er spærret hos mailudbyderen (afmeldt, bounce eller klage). ` +
      "Platformen kan ikke sende flere mails til adressen — hverken invitation, betalingspåmindelser eller fornyelsesvarsler. " +
      "Kontakt dem direkte og få en adresse der virker.",
    company_id: companyId,
    reference_type: "company",
    reference_id: companyId,
  };
}
