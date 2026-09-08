/**
 * src/lib/introSession.ts
 *
 * Dommen over den gratis intro-session med Morten — ren og testet
 * (src/lib/__tests__/introSession.test.ts). Læser session_bookings-rækken
 * (advisor = 'morten'), som calendly-webhook skriver.
 *
 * BAGGRUND (recon-introsessionen.md, 8/9): huset havde ingen tilstand for
 * «afholdt». intro_session_used_at er «retten er brugt» (sat ved KLIK på
 * book — før link, før tid, før møde; også i hånden af admin; nulstilles
 * ved host-aflysning) og RØRES IKKE her. booked er «tid er valgt».
 * Fra 8/9 gemmer webhooken start_tid/slut_tid (migration 20260908190000).
 *
 * REGLEN: AFHOLDT = status 'booked' OG slut_tid er passeret. Uden slut_tid
 * (rækker fra før 8/9, eller en payload uden scheduled_event): ukendt,
 * IKKE afholdt. Et møde der slutter om fem minutter er ikke afholdt; et
 * der sluttede i går er. Grænsen er sluttidspunktet selv: er nu >= slut,
 * er det afholdt.
 *
 * «UDEBLEV» KAN IKKE VIDES: det kræver invitee_no_show.created/deleted i
 * Calendly-abonnementet, behandling i webhooken, og at Morten markerer det
 * i Calendly. Intet af det er på plads. «Afholdt» betyder derfor «mødet er
 * passeret uden aflysning» — afholdt, medmindre nogen udeblev.
 *
 * De betalte 1:1-sessioner (advisor 'jonas') stopper ved booking_sent og
 * er et andet spor; dommen kaldes kun med Morten-rækken.
 */

export interface IntroBooking {
  /** session_bookings.status: pending | paid | booking_sent | booked | cancelled | refunded. */
  status: string;
  /** ISO (UTC) eller null — fra webhooken, 8/9. */
  start_tid: string | null;
  slut_tid: string | null;
  /** Hvornår bookingen (klikket) skete. */
  created_at: string;
}

export type IntroTilstand =
  | "afholdt"
  /** Tid valgt, mødet ligger forude. */
  | "booket"
  /** booked, men uden tid (fra før 8/9) — «afholdt» kan ikke afgøres. */
  | "booket_uden_tid"
  /** Link sendt, ingen tid valgt endnu. */
  | "link_sendt"
  | "aflyst"
  | "ingen";

export interface IntroDom {
  tilstand: IntroTilstand;
  start: Date | null;
  slut: Date | null;
}

function somDato(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** AFHOLDT = booked og sluttidspunktet er nået. Uden sluttid: nej (ukendt). */
export function erAfholdt(b: Pick<IntroBooking, "status" | "slut_tid"> | null | undefined, nu: Date): boolean {
  if (!b || b.status !== "booked") return false;
  const slut = somDato(b.slut_tid);
  return slut != null && slut.getTime() <= nu.getTime();
}

export function afgoerIntroSession(b: IntroBooking | null | undefined, nu: Date): IntroDom {
  if (!b) return { tilstand: "ingen", start: null, slut: null };
  const start = somDato(b.start_tid);
  const slut = somDato(b.slut_tid);
  if (b.status === "cancelled") return { tilstand: "aflyst", start, slut };
  if (b.status === "booked") {
    if (erAfholdt(b, nu)) return { tilstand: "afholdt", start, slut };
    return { tilstand: slut ? "booket" : "booket_uden_tid", start, slut };
  }
  if (b.status === "booking_sent") return { tilstand: "link_sendt", start, slut };
  return { tilstand: "ingen", start, slut };
}

/** «15. september» / «15. september kl. 11.00» i dansk tid — tidszonen er
    eksplicit, så teksten er den samme uanset hvor browseren står. */
export function formatIntroTid(d: Date, medKlokke: boolean, tidszone = "Europe/Copenhagen"): string {
  const dato = d.toLocaleDateString("da-DK", { day: "numeric", month: "long", timeZone: tidszone });
  if (!medKlokke) return dato;
  const klokke = d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: tidszone }).replace(":", ".");
  return `${dato} kl. ${klokke}`;
}

/** Linjens ord på virksomhedssiden. null = ingen linje. */
export function introSessionTekst(dom: IntroDom, b: IntroBooking | null | undefined): string | null {
  switch (dom.tilstand) {
    case "afholdt":
      return `Afholdt ${formatIntroTid(dom.start ?? (dom.slut as Date), false)}`;
    case "booket":
      return `Booket til ${formatIntroTid(dom.start ?? (dom.slut as Date), true)}`;
    case "booket_uden_tid":
      return "Booket — tidspunktet er ikke registreret (fra før 8/9)";
    case "link_sendt":
      return `Link sendt${b ? ` ${formatIntroTid(new Date(b.created_at), false)}` : ""}, ingen tid valgt`;
    case "aflyst":
      return "Aflyst";
    default:
      return null;
  }
}
