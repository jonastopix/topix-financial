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
import { erPaaPause } from "@/lib/ansoegningTrin";

export interface StatusVisning {
  titel: string;
  /** Hvad der sker nu / hvad vi venter på. */
  tekst: string;
  /** Tidsvælgeren vises — kun når ansøgeren er indkaldt (samtalen vælges på siden og oprettes i Calendly bagved, udkast 18/9). */
  book: boolean;
  /** Den bookede samtale: tid, Meet-link (fra Calendly-eventet, kan mangle) — flyt/aflys vises på siden. */
  booket: { start: string; slut: string | null; moedeLink: string | null } | null;
  /** «Læs og underskriv» — e-underskriftens /aftale?token=… når den findes (brist 8), ellers rådgiverens aftale_url; null = ingen knap. */
  aftale: string | null;
  /** «Ikke nu» vises på åbne trin, når ansøgningen ikke allerede er på pause. */
  visIkkeNu: boolean;
  /** Ventelisten på en lukket ansøgning (19/9): «tilbud» viser ja/nej-knapperne; «koe» kun teksten. */
  plads: "tilbud" | "koe" | null;
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

export function afgoerStatus(s: StatusSvar, nu: Date = new Date()): StatusVisning {
  const ingen = { book: false, booket: null, aftale: null, visIkkeNu: false, plads: null as StatusVisning["plads"] };
  // Pausen gælder til og med dagen før slutdatoen — en dato i fortiden er ingen pause (rettelse 19/9).
  if (erPaaPause(s.paa_pause_til, nu)) {
    return { ...ingen, titel: "Din ansøgning holder pause", tekst: `Du bad os vente. Vi skriver ikke til dig før ${danskDato(s.paa_pause_til)} — og gerne før, hvis du selv siger til på ${"kontakt@theboardroom.dk"}.` };
  }
  switch (s.trin) {
    case "ny":
      return { ...ingen, visIkkeNu: true, titel: "Vi har din ansøgning", tekst: "Morten og Jonas læser og vurderer den. Vi venter ikke på noget fra dig — Jonas vender tilbage." };
    case "indkaldt":
      return { ...ingen, book: true, visIkkeNu: true, titel: "Jonas vil gerne tale med dig", tekst: "Det næste skridt er en uforpligtende snak på 30 minutter, online. Vælg et tidspunkt herunder — så får du en kalenderinvitation med mødelinket med det samme." };
    case "booket":
      return s.samtale_start
        // Ingen «Ikke nu» på en booket samtale: den ville gemme mødet væk uden at aflyse det i kalenderen (rettelse 19/9). Aflys først.
        ? { ...ingen, booket: { start: s.samtale_start, slut: s.samtale_slut, moedeLink: s.moede_link }, visIkkeNu: false, titel: "Samtalen er booket", tekst: `Vi ses ${danskTidspunkt(s.samtale_start)}. Mødelinket står i din kalenderinvitation${s.moede_link ? " — og herunder" : ""}. Skal tiden flyttes, kan du gøre det her.` }
        : { ...ingen, book: true, visIkkeNu: false, titel: "Samtalen er booket", tekst: "Tiden er ikke registreret hos os — vælg den gerne igen herunder, så er vi sikre." };
    case "afholdt":
      return { ...ingen, visIkkeNu: true, titel: "Tak for snakken", tekst: "Jonas og Morten tager stilling og vender tilbage til dig. Du behøver ikke gøre mere nu." };
    case "aftalegrundlag_sendt": {
      // Brist 8 (18/9): e-underskriften vinder over rådgiverens indtastede aftale_url.
      // Findes der en aftale i aftale_underskrift, er DEN knappen — eller grunden til at
      // der ingen knap er. aftale_url bruges KUN når der ingen aftale findes.
      const u = s.underskrift ?? null;
      if (u?.tilstand === "underskrevet") {
        return { ...ingen, titel: "Velkommen — du har skrevet under", tekst: "Det næste er betalingen; du får en mail om den. Så er du inde." };
      }
      if (u?.tilstand === "udloebet") {
        return { ...ingen, visIkkeNu: true, titel: "Linket til aftalegrundlaget er udløbet", tekst: "Det gjaldt i 21 dage. Jonas sender et nyt — du behøver ikke gøre noget nu." };
      }
      if (u && u.tilstand !== "kan_underskrives") {
        return { ...ingen, visIkkeNu: true, titel: "Aftalegrundlaget er på vej igen", tekst: "Det første er trukket tilbage. Jonas sender et nyt — du behøver ikke gøre noget nu." };
      }
      const aftale = u ? u.url : s.aftale_url;
      return { ...ingen, aftale, visIkkeNu: true, titel: "Aftalegrundlaget ligger klar", tekst: "Læs det igennem i ro og mag, og underskriv når du er klar. Vi venter på din underskrift." };
    }
    case "underskrevet":
      return { ...ingen, titel: "Velkommen — du har skrevet under", tekst: "Det næste er betalingen; du har fået en mail om den. Så er du inde." };
    case "lukket": {
      // Recon-sammenhæng §5 (19/9): et nej på nichen er ikke «afsluttet», når de står i kø eller har et tilbud.
      const v = s.ventepladser ?? null;
      if (v?.tilbud) {
        const frist = v.tilbud.udloeber_at ? ` Svar senest ${danskDato(v.tilbud.udloeber_at)} — ellers går pladsen videre til den næste i køen.` : "";
        return { ...ingen, plads: "tilbud", titel: "Du har et tilbud om en plads", tekst: `Pladsen i jeres niche er blevet ledig, og du står først i køen. Sig ja, så genåbner vi din ansøgning, og Jonas inviterer dig til en snak.${frist}` };
      }
      if (v && v.venter > 0) {
        return { ...ingen, plads: "koe", titel: "Du står i kø", tekst: `Vi måtte sige nej, fordi pladsen i jeres niche var optaget — men du står i kø${v.venter > 1 ? ` til ${v.venter} pladser` : ""}. Bliver pladsen ledig, skriver vi til dig, og du har syv dage til at sige ja.` };
      }
      return { ...ingen, titel: "Ansøgningen er afsluttet", tekst: "Der er ikke mere at gøre her. Passer det bedre senere, er du velkommen til at søge igen." };
    }
    default:
      return { ...ingen, titel: "Din ansøgning", tekst: "Jonas vender tilbage til dig." };
  }
}

// ── Ventelisten: «Ja tak» / «Nej tak» fra mailen (rettelse 19/9, recon §8 punkt 6) ──
//
// C's ventelistemail linker til /ansoeg/status?t=…&handling=tag_pladsen|afslaa_pladsen.
// Serveren (ansoegning-link) kender begge (svarPaaPlads: accepteret/afslaaet), men siden
// kendte kun ikke_nu — så knapperne var døde, og en lukket ansøgning sagde «afsluttet».
// Som ved «ikke nu»: ét klik på siden, aldrig automatisk fra et link.

export type PladsSvar = "ja" | "nej";

/** ?handling= → hvilket svar mailen bar; alt andet → null. */
export function laesPladsHandling(raw: string | null): PladsSvar | null {
  return raw === "tag_pladsen" ? "ja" : raw === "afslaa_pladsen" ? "nej" : null;
}

/** Bekræftelseskortets ord, før svaret sendes. */
export function pladsSpoergsmaal(svar: PladsSvar): { titel: string; tekst: string; knap: string } {
  return svar === "ja"
    ? { titel: "Ja tak til pladsen?", tekst: "Siger du ja, genåbner vi din ansøgning, og Jonas inviterer dig til en snak — som da du søgte.", knap: "Ja tak, jeg vil have pladsen" }
    : { titel: "Nej tak til pladsen?", tekst: "Siger du nej, går pladsen videre til den næste i køen. Du er velkommen til at søge igen senere.", knap: "Nej tak — giv den videre" };
}

/** Ordene efter svaret — eller når tilbuddet ikke længere gælder (409 fra serveren). */
export function pladsSvarTekst(svar: PladsSvar, genaabnet: boolean): { titel: string; tekst: string } {
  if (svar === "ja") {
    return genaabnet
      ? { titel: "Tak — pladsen er din", tekst: "Vi har genåbnet din ansøgning. Jonas inviterer dig til en snak, så vælg gerne et tidspunkt, når mailen kommer." }
      : { titel: "Tak for dit svar", tekst: "Vi har noteret dit ja. Jonas vender tilbage til dig." };
  }
  return { titel: "Tak for besked", tekst: "Pladsen går videre til den næste i køen. Du er velkommen til at søge igen, når det passer bedre." };
}

export const PLADS_UDLOEBET = { titel: "Tilbuddet gælder ikke længere", tekst: "Pladsen er gået videre, eller fristen er udløbet. Skriv til kontakt@theboardroom.dk, hvis du stadig er interesseret." };
