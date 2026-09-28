/**
 * src/lib/hjemmebane/rejselinje.ts
 *
 * Anerkendelseslinjen på forsidens «Dit næste skridt», når alt er ajour:
 * «Og rejsen kan ses: 3 godkendte rapporter i år · 1 mål nået · 2 refleksioner.»
 * Ren funktion, testet i __tests__/rejselinje.test.ts.
 *
 * REGLEN ER HUSETS, flyttet ordret ud af BoardroomView (28/9-2026): hver del
 * tæller det GJORTE, står kun når tallet er > 0, siger «1 …» i ental og
 * «N …» i flertal, og delene samles med « · ». Alle nul → null, og kortet
 * beholder sin rolige sætning (fokusTom). Ingen nævner, ingen procent.
 *
 * DEN FJERDE DEL (Jonas 28/9, forslag 1): refleksionerne. «Dit næste skridt»
 * rummer kun næste skridt — anerkendelsen af det, medlemmet HAR gjort, hører
 * hjemme dér, hvor der ellers står «Alt er ajour». Antallet er ALLE
 * virksomhedens pulse_checkins-rækker (også en sendt uden tekst — den er
 * sendt), talt af databasen (count, head) og givet ind her. Fladen tæller
 * ikke selv (værn: rejselinje.guard.test.ts).
 */
import { HentningsFejl } from "@/lib/kraevRaekker";

export interface RejseTal {
  /** Godkendte rapporter i indeværende år. */
  rapporterIAar: number;
  /** Nåede mål (afgoerMilepael → faerdig). */
  maalNaaet: number;
  /** Gennemførte videoer i Akademiet. */
  videoerGennemfoert: number;
  /** Sendte refleksioner, alle måneder. */
  refleksioner: number;
}

export function rejselinje(t: RejseTal): string | null {
  const parts: string[] = [];
  if (t.rapporterIAar > 0)
    parts.push(t.rapporterIAar === 1 ? "1 godkendt rapport i år" : `${t.rapporterIAar} godkendte rapporter i år`);
  if (t.maalNaaet > 0)
    parts.push(t.maalNaaet === 1 ? "1 mål nået" : `${t.maalNaaet} mål nået`);
  if (t.videoerGennemfoert > 0)
    parts.push(
      t.videoerGennemfoert === 1 ? "1 video gennemført i Akademiet" : `${t.videoerGennemfoert} videoer gennemført i Akademiet`,
    );
  if (t.refleksioner > 0)
    parts.push(t.refleksioner === 1 ? "1 refleksion" : `${t.refleksioner} refleksioner`);
  return parts.length > 0 ? `Og rejsen kan ses: ${parts.join(" · ")}.` : null;
}

/**
 * Antallet, som databasen svarede det (`select("id", { count: "exact", head: true })`).
 * En fejl KASTER med kildens navn — «0 refleksioner» er et svar, en fejl er
 * ikke (10/9-reglen). `count: null` uden fejl er 0.
 */
export function antalFraSvar(kilde: string, svar: { count: number | null; error: { message: string } | null }): number {
  if (svar.error) throw new HentningsFejl(kilde, svar.error.message);
  return svar.count ?? 0;
}
