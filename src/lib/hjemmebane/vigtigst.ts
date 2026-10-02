/**
 * «Det vigtigste lige nu» — forsidens første felt (forside v3, docs/forside-v3.md §1; mockup v3 godkendt af
 * Jonas 2/10-2026 kl. 20:41). Det PRIMÆRE punkt er fokusmotorens (deriveFocus — uændret dom); denne fil
 * afgør kun tre ting omkring det, rent og testet:
 *
 *   1. RAPPORT-PUNKTETS SÆTNING (rapportFristTekst): «Frist tirs. 20. okt. Godkend dem til tiden, så holder
 *      din streak.» — KUN når det er sandt. Fristen er streakens (streak.ts:fristDato — den 20. i måneden
 *      efter, rykket til hverdag). «så holder din streak» kræver, at streaken er i live OG at punktets måned
 *      er netop den, streakens næste frist gælder (naesteFrist.key); brudt → «så starter du en ny streak»;
 *      ingen → «så starter din streak»; en anden måned → kun «Frist …. Godkend dem til tiden.». Passeret
 *      frist → null (motorens egen tekst står).
 *   2. TJEKLISTE-LINJEN (tjeklisteLinje): «Kom godt i gang · 3 af 5 — næste: {punkt}» med «Se listen», så
 *      længe listen ikke er færdig. Er det primære punkt selv et tjeklistepunkt, siges «næste» ikke (det står
 *      lige over).
 *   3. DE STILLE LINJER (stilleLinjer): højst VIGTIGST_LINJER_MAKS i alt, tjeklisten først; skridt og mål-
 *      punkter (erPlanPunkt — de står med knapper i «Din plan») og tjeklistepunkter (linjen samler dem) står
 *      aldrig som stille linjer.
 *
 * Tiden gives ind som `nu`.
 */
import { fristDato, fristPasseret } from "@/lib/boardroomScore/streak";
import type { StreakDom } from "@/lib/boardroomScore/typer";
import { kortDato } from "@/lib/hjemmebane/forsideDato";
import { erPlanPunkt } from "@/lib/hjemmebane/forsideMaal";

/** Højst så mange linjer under knappen (mockup v3: «højst 1–2 linjer»). */
export const VIGTIGST_LINJER_MAKS = 2;

export const VIGTIGST_ORD = {
  eyebrow: "Det vigtigste lige nu",
  seListen: "Se listen",
  komGodtIGang: "Kom godt i gang",
} as const;

export interface RapportPunkt {
  kind: string;
  /** «YYYY-MM» — måneden punktet gælder (nextStep.rapportPunkt). */
  periodKey?: string;
}

export function rapportFristTekst(punkt: RapportPunkt, streak: StreakDom | null | undefined, nu: Date): string | null {
  if (punkt.kind !== "missing-report" && punkt.kind !== "pending-approval") return null;
  const p = punkt.periodKey;
  if (!p || !/^\d{4}-\d{2}$/.test(p)) return null;
  if (fristPasseret(p, nu)) return null;
  // kortDato slutter med månedens forkortelsespunktum («okt.») — men «30. mar. 2027» gør ikke: punktum kun når det mangler.
  const dato = kortDato(fristDato(p), nu);
  const frist = `Frist ${dato}${dato.endsWith(".") ? "" : "."}`;
  if (!streak || streak.naesteFrist.key !== p) return `${frist} Godkend dem til tiden.`;
  if (streak.status === "aktiv" && streak.laengde > 0) return `${frist} Godkend dem til tiden, så holder din streak.`;
  if (streak.status === "brudt") return `${frist} Godkend dem til tiden, så starter du en ny streak.`;
  return `${frist} Godkend dem til tiden, så starter din streak.`;
}

export interface TjeklisteKilde {
  faerdig: boolean;
  antal_gjort: number;
  antal_i_alt: number;
  punkter: readonly { titel: string; gjort: boolean }[];
}

export interface VigtigstLinje {
  tekst: string;
  /** «Se listen» åbner boksen (TJEKLISTE_HASH); ellers punktets egen sti. */
  til: string;
  href: string;
  key: string;
}

/** Hashen, der folder «Kom godt i gang»-boksen ud (HbOnboardingTjekliste læser og rydder den). */
export const TJEKLISTE_HASH = "#kom-godt-i-gang";

export function tjeklisteLinje(t: TjeklisteKilde | null | undefined, primaerErTjekliste: boolean): VigtigstLinje | null {
  if (!t || t.faerdig || t.antal_i_alt <= 0) return null;
  const tal = `${VIGTIGST_ORD.komGodtIGang} · ${t.antal_gjort} af ${t.antal_i_alt}`;
  const naeste = primaerErTjekliste ? null : t.punkter.find((p) => !p.gjort)?.titel ?? null;
  return { tekst: naeste ? `${tal} — næste: ${naeste}` : tal, til: VIGTIGST_ORD.seListen, href: TJEKLISTE_HASH, key: "tjekliste-linje" };
}

export interface StilleKilde {
  key: string;
  kind: string;
  title: string;
}

/**
 * Punkterne efter det primære, der må stå som stille linjer: ikke plan-punkter, ikke tjeklistepunkter, højst
 * VIGTIGST_LINJER_MAKS minus tjekliste-linjen.
 */
export function stilleLinjer<T extends StilleKilde>(efterPrimaer: readonly T[], harTjeklisteLinje: boolean): T[] {
  const plads = Math.max(0, VIGTIGST_LINJER_MAKS - (harTjeklisteLinje ? 1 : 0));
  return efterPrimaer.filter((i) => !erPlanPunkt(i) && i.kind !== "tjekliste").slice(0, plads);
}
