/**
 * ansoegningAnbefaling — systemets anbefaling ved en ny ansøgning:
 * «tal med dem» / «tvivl» / «afvis» PLUS grundlaget i ord. Aldrig et tal
 * alene. Spejl: src/lib/ansoegningAnbefaling.ts (kroppen efter filhovedet
 * er ordret ens; pariteten låses af
 * src/lib/__tests__/ansoegningMotor.paritet.test.ts).
 *
 * JONAS 18/9: «systemet giver en anbefaling med grundlaget skrevet ud,
 * ikke en score». Rådgiveren læser grundlaget — «omsætning 2 – 5 mio. kr.,
 * 12 ansatte, tømrer, selskab fra 2019, har set webinaret, har selv
 * prøvet: at ansætte en projektleder» — og træffer beslutning (1): tal med
 * dem eller afvis. Anbefalingen er et forslag; den ændrer ikke trin, og
 * den skrives på rækken (ansoegninger.anbefaling jsonb) i det øjeblik
 * ansøgningen indsendes, med version, så en senere justering af
 * tærsklerne kan ses.
 *
 * INPUTTET ER B'S FELTER (ansoegningSkema.ts, 18/9): omsætningsintervallet
 * A–G (ikke et tal — formularen spørger ikke om et tal), antal_ansatte,
 * de tre tekster (udfordring, proevet, om_tolv_maaneder), start_tidspunkt,
 * set_webinar, kilden — og CVR-visningen (stiftet_aar, branche,
 * selskabsform, status) fra cvr_opslag. Motoren bygger inputtet fra
 * rækken (ansoegningMotor.ts); denne fil læser aldrig rækken selv.
 *
 * DE TO HOVEDKRITERIER — JONAS 18/9 (ordret): «Intet er skrevet i sten, men
 * som udgangspunkt ingen helt nye virksomheder. Minimum 2 mio i omsætning.
 * Men som skrevet er det en vurdering hver gang.» Målt på theboardroom.dk:
 * «soloselvstændige og ejerledere med mindst 2 mio. kr. i omsætning».
 *   OMSÆTNING  interval D–G (≥ 2 mio.) opfylder minimum; A–C (under 2
 *              mio.) trækker KLART ned. Ukendt nævnes og trækker ned.
 *   ALDER      stiftet for under NYSTIFTET_AAR (1) år siden = «helt ny»,
 *              trækker KLART ned; ≥ MODENT_AAR (3) taler for. Regnes på
 *              stiftet_aar alene (hele år), for det er hvad CVR-visningen
 *              bærer — «stiftet i år eller sidste år» er den grove dom.
 * DE ØVRIGE taler kun for eller imod i grundlaget og vipper «tvivl»:
 *   STATUS     ophørt/under konkurs i CVR → afvis uanset.
 *   WEBINAR    set_webinar = ja taler for; kilde «anbefaling» taler for og
 *              løfter et rent afvis til tvivl (nogen står inde for dem).
 *   TIMING     start_tidspunkt = hurtigst_muligt nævnes i grundlaget. Svaret
 *              «senere» er UDE af formularen (Jonas 18/9 kl. 10:10: alle skal
 *              til afklaringssamtale; der er kun tre svar om tid) og vægtes
 *              ikke — en gammel række med «senere» tæller som ukendt.
 *   TEKST      alle tre tekster under 40 tegn taler imod (sjældent — B's
 *              formular kræver 40; rækker fra import kan mangle).
 * UDFALDET (versjon 3):
 *   afvis        selskabet er ophørt, ELLER begge hovedkriterier fejler
 *                (under 2 mio. OG helt ny), ELLER under 2 mio. uden
 *                anbefaling.
 *   tal_med_dem  begge hovedkriterier opfyldt (D–G, ikke helt ny) og intet
 *                andet imod.
 *   tvivl        alt andet — det er dér vurderingen er menneskets.
 * TALLENE ER IKKE LÅST: README §4 bærer SQL'en der måler de 38 medlemmer
 * mod de samme to kriterier, og hvad tallene ville ændre.
 */
import type { Kilde } from "./ansoegningTrin.ts";

export const ANBEFALING_VERSION = 3;

/** Minimum 2 mio. i omsætning — Jonas 18/9; theboardroom.dk. Interval D er det første der opfylder det. */
export const OMSAETNING_MINIMUM_KR = 2_000_000;
/** «Ingen helt nye virksomheder»: stiftet for under ét år siden. */
export const NYSTIFTET_AAR = 1;
/** Mindst tre års drift taler for: der er tal og historik at arbejde med. */
export const MODENT_AAR = 3;
export const TEKST_KONKRET_TEGN = 40;

/**
 * B's syv intervaller (ansoegningSkema.OMSAETNINGSINTERVALLER, målt 18/9
 * mod Monday-boardet) som kroner. Nøglen er kontrakten mellem formularen
 * og motoren; label'en er den tekst grundlaget viser. Guard-testen låser
 * at nøglerne er de samme som B's.
 */
export const OMSAETNINGSINTERVALLER_KR: Record<string, { label: string; min: number; max: number | null }> = {
  A: { label: "under 500.000 kr.", min: 0, max: 499_999 },
  B: { label: "500.000 – 999.999 kr.", min: 500_000, max: 999_999 },
  C: { label: "1 – 2 mio. kr.", min: 1_000_000, max: 1_999_999 },
  D: { label: "2 – 5 mio. kr.", min: 2_000_000, max: 4_999_999 },
  E: { label: "5 – 10 mio. kr.", min: 5_000_000, max: 9_999_999 },
  F: { label: "10 – 20 mio. kr.", min: 10_000_000, max: 19_999_999 },
  G: { label: "over 20 mio. kr.", min: 20_000_000, max: null },
};

export type AnbefalingsUdfald = "tal_med_dem" | "tvivl" | "afvis";

export interface AnbefalingsInput {
  /** A–G fra formularen; null når ubesvaret. */
  omsaetningsnoegle: string | null;
  antalAnsatte: number | null;
  /** CVR-visningen (cvr_opslag): branche, stiftet_aar, selskabsform, status. */
  branche: string | null;
  stiftetAar: number | null;
  selskabsform: string | null;
  cvrStatus: string | null;
  /** «ja» | «nej» | null */
  setWebinar: string | null;
  kilde: Kilde;
  kildeRaa: string | null;
  udfordring: string | null;
  proevet: string | null;
  omTolvMaaneder: string | null;
  /** hurtigst_muligt | inden_1_maaned | inden_3_maaneder | null («senere» ude 18/9 — tæller som ukendt) */
  startTidspunkt: string | null;
  nu: Date;
}

export interface Anbefaling {
  udfald: AnbefalingsUdfald;
  /** Grundlaget i ord, i den rækkefølge rådgiveren læser det. */
  grundlag: string[];
  for: string[];
  imod: string[];
  version: number;
}

function klip(tekst: string, maks = 80): string {
  const t = tekst.replace(/\s+/g, " ").trim();
  return t.length <= maks ? t : `${t.slice(0, maks - 1).trimEnd()}…`;
}

function tusind(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Registrets status som «ophørt»: Ophørt, Under konkurs, Opløst, Tvangsopløst. */
export function erOphoert(status: string | null): boolean {
  const s = (status ?? "").toLowerCase();
  return /ophørt|ophoert|konkurs|opløst|oploest|tvangsopl/.test(s);
}

/** Opfylder intervallet minimumsomsætningen? null = ukendt. */
export function opfylderMinimum(noegle: string | null): boolean | null {
  const i = noegle ? OMSAETNINGSINTERVALLER_KR[noegle] ?? null : null;
  return i ? i.min >= OMSAETNING_MINIMUM_KR : null;
}

/** Er selskabet «helt nyt»? null = ukendt alder. Hele år: stiftet i år eller sidste år = under ét år (groft, bevidst). */
export function erHeltNyt(stiftetAar: number | null, nu: Date): boolean | null {
  const aar = nu.getUTCFullYear();
  if (stiftetAar === null || stiftetAar <= 1800 || stiftetAar > aar) return null;
  return aar - stiftetAar < NYSTIFTET_AAR;
}

export function afgoerAnbefaling(i: AnbefalingsInput): Anbefaling {
  const grundlag: string[] = [];
  const forListe: string[] = [];
  const imod: string[] = [];

  // Hovedkriterium 1: omsætningen (intervallet A–G).
  const interval = i.omsaetningsnoegle ? OMSAETNINGSINTERVALLER_KR[i.omsaetningsnoegle] ?? null : null;
  const minimumOk = opfylderMinimum(i.omsaetningsnoegle);
  if (interval) {
    grundlag.push(`omsætning ${interval.label}`);
    if (minimumOk) forListe.push("omsætning mindst 2 mio.");
    else imod.push("omsætning under 2 mio.");
  } else {
    grundlag.push("omsætning ikke oplyst");
    imod.push("omsætning ikke oplyst");
  }

  if (i.antalAnsatte !== null && i.antalAnsatte >= 0) {
    // Tallet er «ansatte, dig selv medregnet» (Jonas 18/9, valg A): 1 = ejeren alene. Et gammelt 0 (før 18/9) læses som det samme.
    grundlag.push(i.antalAnsatte <= 1 ? "alene (1 person)" : `${tusind(i.antalAnsatte)} ansatte`);
  }

  if (i.branche) grundlag.push(i.branche.trim().toLowerCase());

  // Hovedkriterium 2: alderen.
  const heltNyt = erHeltNyt(i.stiftetAar, i.nu);
  if (heltNyt !== null && i.stiftetAar !== null) {
    grundlag.push(`selskab fra ${i.stiftetAar}`);
    const alder = i.nu.getUTCFullYear() - i.stiftetAar;
    if (heltNyt) imod.push("helt ny virksomhed (under et år)");
    else if (alder >= MODENT_AAR) forListe.push("mindst tre års drift");
  } else {
    grundlag.push("stiftelsesår ukendt");
  }
  if (i.selskabsform) grundlag.push(i.selskabsform.trim());

  const ophoert = erOphoert(i.cvrStatus);
  if (ophoert) {
    grundlag.push(`registret siger: ${(i.cvrStatus ?? "").trim().toLowerCase()}`);
    imod.push("selskabet er ophørt ifølge CVR");
  }

  if (i.setWebinar === "ja") {
    grundlag.push("har set webinaret");
    forListe.push("har set webinaret");
  }
  if (i.kilde === "anbefaling") {
    grundlag.push(i.kildeRaa && i.kildeRaa !== "anbefaling" ? `anbefalet af ${klip(i.kildeRaa, 40)}` : "kommer på anbefaling");
    forListe.push("kommer på anbefaling");
  } else if (i.kilde === "linkedin") grundlag.push("kom via LinkedIn");

  if (i.proevet?.trim()) grundlag.push(`har selv prøvet: ${klip(i.proevet)}`);
  else if (i.udfordring?.trim()) grundlag.push(`udfordringen: ${klip(i.udfordring)}`);
  const tekster = [i.udfordring, i.proevet, i.omTolvMaaneder].map((t) => (t ?? "").trim());
  if (tekster.some((t) => t.length >= TEKST_KONKRET_TEGN)) forListe.push("har beskrevet konkret hvad de vil");
  else imod.push("ansøgningen er tynd: intet konkret om udfordring, forsøg eller mål");

  if (i.startTidspunkt === "hurtigst_muligt") grundlag.push("kan starte hurtigst muligt");

  let udfald: AnbefalingsUdfald = "tvivl";
  const underMinimum = minimumOk === false;
  if (ophoert || (underMinimum && heltNyt === true) || (underMinimum && i.kilde !== "anbefaling")) udfald = "afvis";
  else if (minimumOk === true && heltNyt === false && imod.length === 0) udfald = "tal_med_dem";

  return { udfald, grundlag, for: forListe, imod, version: ANBEFALING_VERSION };
}

/** Grundlaget som én linje: «omsætning 2 – 5 mio. kr., 12 ansatte, tømrer, selskab fra 2019, …». */
export function grundlagSomTekst(a: Anbefaling): string {
  return a.grundlag.join(", ");
}
