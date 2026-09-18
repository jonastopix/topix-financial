/**
 * vejenInd — én linje på virksomhedssiden om, hvor medlemmet kom fra (18/9
 * aften, Jonas): «Kom ind via ansøgning 12. september (webinar) · samtale
 * 18. september · underskrevet 25. september». Ren dom over ansøgningen bag
 * virksomheden (ansoegninger.company_id = virksomheden; samme id). Ingen
 * React. Datoer i dansk tid; dele der mangler, udelades.
 */
import { KILDER, type Kilde } from "@/lib/ansoegningTrin";

export interface AnsoegningTilVejenInd {
  id: string;
  indsendt_at: string | null;
  samtale_start: string | null;
  konverteret_at: string | null;
  kilde: string | null;
}

const KILDE_ORD: Record<Kilde, string> = { webinar: "webinaret", anbefaling: "en anbefaling", linkedin: "LinkedIn", direkte: "sitet", andet: "andet" };

/** «12. september» / «12. september 2025» når året ikke er det nuværende — dansk tid. */
export function datoOrd(iso: string, nu: Date): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const sammeAar = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" }).slice(0, 4) === nu.toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" }).slice(0, 4);
  return new Intl.DateTimeFormat("da-DK", { timeZone: "Europe/Copenhagen", day: "numeric", month: "long", ...(sammeAar ? {} : { year: "numeric" }) }).format(d);
}

/** Linjen — eller null, når der ingen ansøgning er (Monday-vejen, import). */
export function vejenIndTekst(a: AnsoegningTilVejenInd | null | undefined, nu: Date): string | null {
  if (!a) return null;
  const dele: string[] = [];
  const ind = a.indsendt_at ? datoOrd(a.indsendt_at, nu) : null;
  const kilde = a.kilde && (KILDER as readonly string[]).includes(a.kilde) ? ` (${KILDE_ORD[a.kilde as Kilde]})` : "";
  dele.push(ind ? `Kom ind via ansøgning ${ind}${kilde}` : `Kom ind via ansøgning${kilde}`);
  const samtale = a.samtale_start ? datoOrd(a.samtale_start, nu) : null;
  if (samtale) dele.push(`samtale ${samtale}`);
  const under = a.konverteret_at ? datoOrd(a.konverteret_at, nu) : null;
  if (under) dele.push(`underskrevet ${under}`);
  return dele.join(" · ");
}
