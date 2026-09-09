/**
 * src/lib/invitationer.ts
 *
 * Invitationerne i det nye design (Jonas 9/9: «Invitationer skal være en del
 * af platformen») — de rene dele, testet (src/lib/__tests__/invitationer.test.ts).
 * Datakilden er company_invitations (id, company_id, email, status,
 * created_at, accepted_at) plus email_send_log for «sendt» og
 * company_members for «har medlem». Hentning og skrivning: hooks/invitationer.
 *
 * HVOR (besluttet 9/9): (a) /virksomheder bærer de ÅBNE på tværs — «Åbne
 * invitationer · N», ældste øverst, med gensend og slet, og knappen
 * «Inviter» — fordi en invitation handler om at få nogen ind i en
 * virksomhed, og listen er virksomhedernes sted. (b) Virksomhedssiden
 * havde allerede blokken «Invitationer» (kun visning); den får de samme
 * handlinger pr. virksomhed. Ingen egen flade. /members røres ikke.
 *
 * ÅBEN = status 'pending'. Sorteres ÆLDST FØRST: den ældste (15. juni, målt
 * 9/9) skal ses, ikke gemmes nederst. GAMMEL = ældre end GAMMEL_DAGE — mærkes
 * i rust, skjules ikke.
 *
 * TALLENE (Members.tsx:1081-1083, ordret samme regel): pr. virksomhed —
 * ingen invitationsrække → «uden invitation»; har medlemmer → accepteret;
 * ellers rækkens status. De hører IKKE i pulsen (9/9): en virksomhed uden
 * medlem er et onboarding-problem, ikke en tavs kunde — det er en anden
 * slags. De står som én linje under invitationerne på /virksomheder.
 */

export interface InvitationRaekke {
  id: string;
  company_id: string | null;
  email: string;
  status: string;
  created_at: string;
  accepted_at: string | null;
}

export const GAMMEL_DAGE = 30;
const MS_PER_DOEGN = 86_400_000;

/** Åbne invitationer, ældste først. */
export function aabneInvitationer<T extends InvitationRaekke>(raekker: readonly T[]): T[] {
  return raekker.filter((r) => r.status === "pending").sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Hele KALENDERdage siden (læserens dag), som husets øvrige domme — i går
    er 1 dag, uanset klokkeslæt. */
export function dageSiden(iso: string | null | undefined, nu: Date): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate()).getTime();
  return Math.max(0, Math.round((b - a) / MS_PER_DOEGN));
}

export function erGammel(dage: number | null): boolean {
  return dage != null && dage > GAMMEL_DAGE;
}

/** «Sendt 15. juni · 86 dage» eller «Oprettet 15. juni · 86 dage» (Members-
    reglen 7/9: «Sendt» kun når mailloggen bærer en afsendt invitationsmail;
    ellers kun rækkens oprettelse). */
export function invitationTekst(
  inv: Pick<InvitationRaekke, "created_at">,
  sidstSendtAt: string | null | undefined,
  nu: Date,
  formatDato: (iso: string) => string,
): { tekst: string; dage: number | null; gammel: boolean } {
  const stempel = sidstSendtAt ?? inv.created_at;
  const dage = dageSiden(stempel, nu);
  const hoved = sidstSendtAt ? `Sendt ${formatDato(sidstSendtAt)}` : `Oprettet ${formatDato(inv.created_at)}`;
  const alder = dage == null ? "" : dage === 0 ? " · i dag" : dage === 1 ? " · 1 dag" : ` · ${dage} dage`;
  return { tekst: `${hoved}${alder}`, dage, gammel: erGammel(dage) };
}

export type InvitationStatus = "accepteret" | "afventer" | "uden_invitation";

/** Members.tsx:527-534, ordret samme regel. */
export function invitationStatusFor(
  companyId: string,
  invitationer: readonly InvitationRaekke[],
  medlemmerPrVirksomhed: ReadonlyMap<string, number>,
): InvitationStatus {
  const egne = invitationer.filter((i) => i.company_id === companyId);
  if (egne.length === 0) return "uden_invitation";
  if ((medlemmerPrVirksomhed.get(companyId) ?? 0) > 0) return "accepteret";
  // Nyeste række afgør (Members læser én pr. virksomhed).
  const nyeste = [...egne].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return nyeste.status === "accepted" ? "accepteret" : "afventer";
}

export interface InvitationsTal {
  accepteret: number;
  afventer: number;
  udenInvitation: number;
  /** Uden invitation OG uden medlem — det egentlige onboarding-hul. */
  udenMedlem: number;
}

export function invitationsTal(
  companyIds: readonly string[],
  invitationer: readonly InvitationRaekke[],
  medlemmerPrVirksomhed: ReadonlyMap<string, number>,
): InvitationsTal {
  const tal: InvitationsTal = { accepteret: 0, afventer: 0, udenInvitation: 0, udenMedlem: 0 };
  for (const id of companyIds) {
    const s = invitationStatusFor(id, invitationer, medlemmerPrVirksomhed);
    if (s === "accepteret") tal.accepteret += 1;
    else if (s === "afventer") tal.afventer += 1;
    else {
      tal.udenInvitation += 1;
      if ((medlemmerPrVirksomhed.get(id) ?? 0) === 0) tal.udenMedlem += 1;
    }
  }
  return tal;
}

/** «9 accepteret · 3 afventer · 15 uden invitation (12 uden medlem)». */
export function invitationsTalTekst(t: InvitationsTal): string {
  const uden = t.udenMedlem > 0 && t.udenMedlem !== t.udenInvitation ? `${t.udenInvitation} uden invitation (${t.udenMedlem} uden medlem)` : `${t.udenInvitation} uden invitation`;
  return `${t.accepteret} accepteret · ${t.afventer} afventer · ${uden}`;
}

/** E-mailen normaliseres som Members gør det: trim + små bogstaver. */
export function normaliserEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function erGyldigEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normaliserEmail(email));
}
