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
