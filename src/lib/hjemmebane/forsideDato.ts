/**
 * src/lib/hjemmebane/forsideDato.ts — forsidens ENE datoformat (docs/forside-v3.md
 * §0: «ÉT datoformat i alle kort: ‹tirs. 20. okt.› (år kun når det ikke er i år)»).
 * REN: ingen React, ingen Supabase; `nu` gives ind. Testet i
 * __tests__/forsideDato.test.ts.
 *
 * Formen:
 *   samme år som `nu` (dansk tid) → «tirs. 20. okt.»   (ugedag kort + dag + måned kort)
 *   et andet år                   → «30. mar. 2027»    (UDEN ugedag, med år)
 * Ugedagen udgår, når året står der: «tirs. 30. mar. 2027» bliver for lang til
 * en linje på 375 px, og et andet år er altid langt nok væk til, at ugedagen
 * ikke er det, man handler på.
 *
 * Datoen er en KALENDERDATO («YYYY-MM-DD», fx streak.ts:fristDato) — ikke et
 * tidspunkt. Den formateres derfor kl. 12:00 UTC på dagen, som i dansk tid er
 * kl. 13 (vinter) eller 14 (sommer) SAMME dato — midnat UTC ville være samme
 * dato i dansk tid også, men middag holder sig fra døgnskiftet uanset zone.
 * «I år» er `nu`s DANSKE år (kbhDato), så nytårsaften kl. 23:30 dansk
 * (= 22:30Z) stadig er det gamle år.
 */
import { kbhDato } from "@/lib/hverdage";

const MED_UGEDAG = new Intl.DateTimeFormat("da-DK", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Copenhagen" });
const MED_AAR = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Copenhagen" });

/** «tirs. 20. okt.» i år, ellers «30. mar. 2027». En ugyldig dato kaster — datoen er vores egen. */
export function kortDato(dato: string, nu: Date): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dato);
  if (!m) throw new Error(`forsideDato: ugyldig dato «${dato}»`);
  const aar = Number(m[1]);
  const maaned = Number(m[2]);
  const dag = Number(m[3]);
  const d = new Date(Date.UTC(aar, maaned - 1, dag, 12));
  // Date.UTC ruller en umulig dato videre (31/2 → 3/3) — det er en fejl, ikke en dato.
  if (d.getUTCFullYear() !== aar || d.getUTCMonth() !== maaned - 1 || d.getUTCDate() !== dag) {
    throw new Error(`forsideDato: ugyldig dato «${dato}»`);
  }
  const iAar = Number(kbhDato(nu).slice(0, 4));
  return aar === iAar ? MED_UGEDAG.format(d) : MED_AAR.format(d);
}

/**
 * En frist i forsidens ene format (forside v3 §0), set fra dansk «i dag»:
 *   i dag → «frist i dag»; i morgen → «frist i morgen»; passeret → «fristen var tirs. 29. sep.» (forfalden);
 *   ellers «frist man. 12. okt.» / «frist 30. mar. 2027».
 * Kalenderdatoer sammenlignes som «YYYY-MM-DD»-strenge (kbhDato), aldrig som tidspunkter.
 */
export function fristKort(dato: string, nu: Date): { tekst: string; forfalden: boolean; iDag: boolean } {
  const idag = kbhDato(nu);
  const imorgen = kbhDato(new Date(nu.getTime() + 86_400_000));
  if (dato === idag) return { tekst: "frist i dag", forfalden: false, iDag: true };
  if (dato < idag) return { tekst: `fristen var ${kortDato(dato, nu)}`, forfalden: true, iDag: false };
  if (dato === imorgen) return { tekst: "frist i morgen", forfalden: false, iDag: false };
  return { tekst: `frist ${kortDato(dato, nu)}`, forfalden: false, iDag: false };
}

/** Hvornår et forslag kom, i forsidens format: «foreslået i dag» / «foreslået i går» / «foreslået tirs. 23. sep.». */
export function foreslaaetKort(iso: string | null | undefined, nu: Date): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const dag = kbhDato(t);
  if (dag >= kbhDato(nu)) return "foreslået i dag";
  if (dag === kbhDato(new Date(nu.getTime() - 86_400_000))) return "foreslået i går";
  return `foreslået ${kortDato(dag, nu)}`;
}
