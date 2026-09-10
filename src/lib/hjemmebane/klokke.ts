/**
 * src/lib/hjemmebane/klokke.ts — klokken i Hjemmebane, de rene dele
 * (#171 medlemmet, #6 rådgiveren — 10/9-2026). Testet i __tests__/klokke.test.ts.
 *
 * HVORFOR: notifications (medlem) og advisor_notifications (rådgiver) blev
 * skrevet, men ingen Hjemmebane-side viste dem — klokkerne fandtes kun i den
 * gamle skal (NotificationCenter, AdvisorNotifications). Og mail-motoren
 * (send-notification-email) springer kun notifikationer over hvor seen_at er
 * sat; seen_at sættes kun når klokken åbnes. Uden klokke: alt mailes.
 *
 * TÆLLINGEN opfindes ikke: medlemmets «uset» er useNotifications' regel
 * (seen_at NULL og prioritet important/action_required — info-beskeder
 * tæller ikke i pillen), rådgiverens «ulæst» er AdvisorNotifications' (read_at
 * NULL). Én klokke, ét tal pr. rolle. Ingen pille når tallet er 0 — en
 * klokke uden tal er støj; en klokke med et tal er en opgave.
 *
 * DRIFT (afgjort): vagtens driftsbeskeder (type 'drift') står i SAMME liste
 * som resten, mærket «Drift». Vagten holder selv én åben besked pr. titel,
 * og forsidens Driften-linje er stedet for den løbende tilstand — en anden
 * tæller ville være en anden dom for det samme.
 */

export type Prioritet = "info" | "important" | "action_required";

export interface MedlemsNotifikation {
  id: string;
  title: string;
  body: string | null;
  priority: Prioritet;
  deep_link: string | null;
  seen_at: string | null;
  read_at: string | null;
  created_at: string;
}

export interface RaadgiverNotifikation {
  id: string;
  type: string;
  title: string;
  body: string | null;
  company_id: string | null;
  member_id: string | null;
  reference_id: string | null;
  reference_type: string | null;
  read_at: string | null;
  created_at: string;
}

/** Medlemmets pille: uset OG vigtig — samme regel som useNotifications.unseenCount. */
export function erUset(n: Pick<MedlemsNotifikation, "seen_at" | "priority">): boolean {
  return !n.seen_at && (n.priority === "important" || n.priority === "action_required");
}

export const taelUsete = (liste: readonly Pick<MedlemsNotifikation, "seen_at" | "priority">[]): number =>
  liste.filter(erUset).length;

/** Rådgiverens pille: ulæst — samme regel som AdvisorNotifications.unreadCount. */
export const erUlaest = (n: Pick<RaadgiverNotifikation, "read_at">): boolean => !n.read_at;

export const taelUlaeste = (liste: readonly Pick<RaadgiverNotifikation, "read_at">[]): number =>
  liste.filter(erUlaest).length;

/** Pillens tekst: tallet, loft «99+». null når 0 — ingen pille. */
export function pilleTekst(antal: number): string | null {
  if (antal <= 0) return null;
  return antal > 99 ? "99+" : String(antal);
}

export const erDrift = (n: Pick<RaadgiverNotifikation, "type">): boolean => n.type === "drift";

/** Én linje i udfoldningen — fælles form for begge roller. */
export interface KlokkeLinje {
  id: string;
  titel: string;
  tekst: string | null;
  tid: string;
  /** Vises som ny (prik + mørk tekst) til den er læst. */
  ny: boolean;
  /** Hvor klikket fører hen; null = ingen vej (kun markér læst). */
  til: string | null;
  maerke: "Drift" | "Kræver handling" | null;
}

export const KLOKKE_LOFT = 10;

/** Nyeste først, højst KLOKKE_LOFT. */
export function nyesteFoerst<T extends { created_at: string }>(liste: readonly T[], loft = KLOKKE_LOFT): T[] {
  return [...liste].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, loft);
}

export function medlemsLinje(n: MedlemsNotifikation): KlokkeLinje {
  return {
    id: n.id,
    titel: n.title,
    tekst: n.body,
    tid: n.created_at,
    ny: !n.read_at,
    til: n.deep_link,
    maerke: n.priority === "action_required" && !n.read_at ? "Kræver handling" : null,
  };
}

/** Rådgiverens vej fra en besked — Hjemmebanes ruter, ikke det gamle /members.
    Rapport: virksomhedssiden med rapporten foldet ud (?reportId, blok 6).
    Handout og chat: virksomhedssiden / indbakken uden opslag (den gamle
    klokke slog modul og samtale op i databasen — det er ikke en ren funktion). */
export function raadgiverSti(n: Pick<RaadgiverNotifikation, "type" | "reference_type" | "reference_id" | "company_id">): string | null {
  if (n.type === "drift") return "/";
  const virksomhed = n.company_id ? `/virksomheder/${n.company_id}` : null;
  switch (n.reference_type) {
    case "report":
      return virksomhed ? (n.reference_id ? `${virksomhed}?reportId=${n.reference_id}` : virksomhed) : "/virksomheder";
    case "handout":
      return virksomhed ?? "/virksomheder";
    case "chat":
      return "/chat";
    case "feedback":
      return `/admin/feedback${n.reference_id ? `?feedbackId=${n.reference_id}` : ""}`;
    default:
      return virksomhed;
  }
}

export function raadgiverLinje(n: RaadgiverNotifikation): KlokkeLinje {
  return {
    id: n.id,
    titel: n.title,
    tekst: n.body,
    tid: n.created_at,
    ny: erUlaest(n),
    til: raadgiverSti(n),
    maerke: erDrift(n) ? "Drift" : null,
  };
}

export const KLOKKE_TOM = "Intet nyt.";
export const KLOKKE_LABEL = "Notifikationer";
