/**
 * src/lib/ansoegning/status.ts — hvad ansøgerens statusside siger (18/9,
 * flow-gennemgangen §10). Ren dom over svaret fra ansoegning-link «hent»:
 * hvad der sker nu, hvad vi venter på, og hvilke knapper der vises. Ingen
 * React, ingen Supabase; testet i __tests__/status.test.ts.
 *
 * Jonas 18/9: «Hold den lille: hvad der sker nu, hvad vi venter på, og de to
 * knapper» — «Book samtalen» (kun når indkaldt) og «Ikke nu» (åbne trin, ikke
 * allerede på pause). Teksterne er UDKAST.
 */
import type { StatusSvar } from "./api";

export interface StatusVisning {
  titel: string;
  /** Hvad der sker nu / hvad vi venter på. */
  tekst: string;
  /** «Book samtalen med Jonas» — kun når ansøgeren er indkaldt og linket findes. */
  book: string | null;
  /** «Læs og underskriv» — kun når aftalegrundlaget er sendt og linket findes. */
  aftale: string | null;
  /** «Ikke nu» vises på åbne trin, når ansøgningen ikke allerede er på pause. */
  visIkkeNu: boolean;
}

const MAANEDER = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

/** «2026-12-18» → «18. december 2026» — splitter selv, aldrig new Date(). Ulæseligt → uændret. */
export function danskDato(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${Number(m[3])}. ${MAANEDER[Number(m[2]) - 1]} ${m[1]}`;
}

/** «2026-09-21T08:00:00Z» → «mandag den 21. september kl. 10.00» i dansk tid. */
export function danskTidspunkt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("da-DK", { timeZone: "Europe/Copenhagen", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);
}

export function afgoerStatus(s: StatusSvar): StatusVisning {
  const ingen = { book: null, aftale: null, visIkkeNu: false };
  if (s.paa_pause_til) {
    return { ...ingen, titel: "Din ansøgning holder pause", tekst: `Du bad os vente. Vi skriver ikke til dig før ${danskDato(s.paa_pause_til)} — og gerne før, hvis du selv siger til på ${"kontakt@theboardroom.dk"}.` };
  }
  switch (s.trin) {
    case "ny":
      return { ...ingen, visIkkeNu: true, titel: "Vi har din ansøgning", tekst: "Morten og Jonas læser og vurderer den. Vi venter ikke på noget fra dig — Jonas vender tilbage." };
    case "indkaldt":
      return { ...ingen, book: s.booking_url, visIkkeNu: true, titel: "Jonas vil gerne tale med dig", tekst: "Det næste skridt er en uforpligtende snak på 30 minutter. Vi venter på, at du vælger et tidspunkt." };
    case "booket":
      return { ...ingen, visIkkeNu: true, titel: "Samtalen er booket", tekst: s.samtale_start ? `Vi ses ${danskTidspunkt(s.samtale_start)}. Mødelinket står i bekræftelsen fra Calendly — skal tiden flyttes, så brug linket dér.` : "Mødelinket og tiden står i bekræftelsen fra Calendly." };
    case "afholdt":
      return { ...ingen, visIkkeNu: true, titel: "Tak for snakken", tekst: "Jonas og Morten tager stilling og vender tilbage til dig. Du behøver ikke gøre mere nu." };
    case "aftalegrundlag_sendt":
      return { ...ingen, aftale: s.aftale_url, visIkkeNu: true, titel: "Aftalegrundlaget ligger klar", tekst: "Læs det igennem i ro og mag, og underskriv når du er klar. Vi venter på din underskrift." };
    case "underskrevet":
      return { ...ingen, titel: "Velkommen — du har skrevet under", tekst: "Det næste er betalingen; du har fået en mail om den. Så er du inde." };
    case "lukket":
      return { ...ingen, titel: "Ansøgningen er afsluttet", tekst: "Der er ikke mere at gøre her. Passer det bedre senere, er du velkommen til at søge igen." };
    default:
      return { ...ingen, titel: "Din ansøgning", tekst: "Jonas vender tilbage til dig." };
  }
}
