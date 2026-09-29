/**
 * src/lib/hjemmebane/overblikOrd.ts — medlemsoverblikkets ORD og filtre på
 * /virksomheder (29/9-2026). Ren: ingen React, ingen Supabase. Reglerne bor
 * i lib/medlemsOverblik.ts; her vælges kun ord, datoer og URL-parametre.
 *
 * TONEN (Jonas 29/9): danske, rolige ord — ingen rust eller alarmfarve for
 * sessioner. «Afholdt» er UDLEDT (booked + tiden passeret) og bærer en
 * title-tekst, der siger det. Mærkerne er rolige chips.
 *
 * FILTRET er husets ?grund=-mønster (forsideLinks/branchefilter): en
 * URL-parameter, som listen læser stille — ukendt værdi = intet filter.
 * Prøvet i __tests__/overblikOrd.test.ts.
 */
import { FILTER_MAERKER, MAERKE_ORD, type Aktivitet, type AktivitetsFelt, type Maerke, type SessionDom } from "@/lib/medlemsOverblik";

// Mærkernes ord og de fire filtre bor i MOTOREN (29/9, statusmailen læser dem
// gennem Deno-spejlet) — her kun re-eksporteret, så fladen kan blive ved med
// at importere dem herfra. Ingen tredje kopi.
export { FILTER_MAERKER, MAERKE_ORD };

export const MAERKE_PARAM = "maerke";

/** Mærket i URL'en; kun de fire filtre, alt andet → null (som laesGrundParam). */
export function laesMaerkeParam(vaerdi: string | null | undefined): Maerke | null {
  if (!vaerdi) return null;
  return (FILTER_MAERKER as readonly string[]).includes(vaerdi) ? (vaerdi as Maerke) : null;
}

/** «Trænger · 4 virksomheder» — headerens linje, som forsidens udsnit. */
export function maerkeOverskrift(m: Maerke, vist: number): string {
  return `${MAERKE_ORD[m]} · ${vist} ${vist === 1 ? "virksomhed" : "virksomheder"}`;
}

/** Den rolige linje, når filtret ikke rammer nogen — ingen fejl. */
export function tomMaerkeTekst(m: Maerke): string {
  return `Ingen virksomheder under «${MAERKE_ORD[m]}» lige nu.`;
}

/** «2/10» i dansk tid. Ulæselig → null. */
function kortDag(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p: Record<string, string> = {};
  for (const del of new Intl.DateTimeFormat("da-DK", { timeZone: "Europe/Copenhagen", day: "numeric", month: "numeric" }).formatToParts(d)) p[del.type] = del.value;
  return `${p.day}/${p.month}`;
}

/** «12. sep.» i dansk tid — til tooltips. Ulæselig → null. */
export function datoOrd(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("da-DK", { timeZone: "Europe/Copenhagen", day: "numeric", month: "short" }).format(d);
}

export const AFHOLDT_TITLE = "udledt: sessionen var booket, og tiden er passeret";

/** Sessionsstatus i klare ord — og en title-tekst, hvor ordet er udledt. */
export function sessionOrd(dom: SessionDom): { tekst: string; title: string | null } {
  switch (dom.status) {
    case "ikke_brugt": return { tekst: "Ikke booket", title: null };
    case "link_sendt": return { tekst: "Link sendt", title: null };
    case "booket": {
      const dag = kortDag(dom.tid?.start ?? dom.tid?.slut);
      return { tekst: dag ? `Booket ${dag}` : "Booket", title: dag ? null : "tidspunktet er ikke registreret" };
    }
    case "afholdt": {
      const dag = kortDag(dom.tid?.start ?? dom.tid?.slut);
      return { tekst: dag ? `Afholdt ${dag}` : "Afholdt", title: AFHOLDT_TITLE };
    }
    case "aflyst": return { tekst: "Aflyst", title: null };
    case "markeret_uden_booking": return { tekst: "Markeret (ingen booking)", title: "retten står som brugt, men der findes ingen booking — hvorfor, bærer rækken ikke" };
    case "ikke_omfattet": return { tekst: "Ikke omfattet", title: "retten blev sat 13/9 for eksisterende medlemmer; Jonas-sessionen er kun en del af medlemskabet for nye" };
  }
}

export const FELT_ORD: Readonly<Record<AktivitetsFelt, string>> = {
  login: "Login",
  godkendt_rapport: "Godkendt rapport",
  uploadet_rapport: "Uploadet rapport",
  refleksion: "Refleksion",
  medlemsbesked: "Besked i chatten",
  event_tilmelding: "Event-tilmelding",
  akademi: "Akademi",
  community: "Community",
  maal: "Mål rørt",
};

/** Tooltip på prikken: «Login: 12. sep.» — eller «Login: ingen» når intet stempel findes. */
export function prikTitle(felt: AktivitetsFelt, a: Aktivitet): string {
  const dato = datoOrd(a.sidst);
  return `${FELT_ORD[felt]}: ${dato ?? "ingen"}${dato && !a.iVinduet ? " (over 30 dage)" : ""}`;
}

/** «Sidst logget ind 12. sep.» / «Aldrig logget ind» — kolonnernes ord. */
export function sidstTekst(hvad: "logget ind" | "godkendt rapport", a: Aktivitet): string {
  const dato = datoOrd(a.sidst);
  if (!dato) return hvad === "logget ind" ? "Aldrig logget ind" : "Ingen godkendt rapport";
  return `${dato}`;
}
