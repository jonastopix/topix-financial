/**
 * src/lib/venterPaaVelkomst.ts
 *
 * «VENTER PÅ VELKOMST» — dommen som ren funktion, testet
 * (src/lib/__tests__/venterPaaVelkomst.test.ts). Forsidens dom
 * (forsidensDom) skal kalde den og lave en linje af den — samme form som
 * lib/ikkeIGang (grundFraIkkeIGang): et modul, én grund, ingen ny
 * skrivevej.
 *
 * BAGGRUND (9/9): handle_new_user skriver profil, medlemskab, samtale og
 * accepteret invitation — og INGEN besked til nogen. Indtil 25/8 skrev
 * onboarding-agenten velkomsten i rådgiverens navn (as_advisor); #433
 * slog det fra, og prompten siger nu «velkomsten er rådgiverens egen
 * opgave». Men intet siger at den venter. Mangellisten: «Ingen klokke
 * når et nyt medlem venter.» Siden 25/8 er ingen rigtige medlemmer kommet
 * ind — den næste får ingenting, og ingen ser det.
 *
 * VALGET (Jonas' udgangspunkt, bekræftet): et SIGNAL regnet af data, ikke
 * en trigger-notifikation. Tre grunde: det er husets mønster (fornyelse,
 * indgang, ikke_i_gang er alle grunde regnet af data i dommen); det
 * kræver ingen ny skrivevej og ingen klokke i det gamle design
 * (advisor_notifications læses kun dér); og det virker BAGUD — et medlem
 * der kom ind for 40 dage siden uden at høre fra os, står der også. En
 * trigger ville kun ramme de fremtidige.
 *
 * DOMMEN: virksomheden har mindst ét medlem (første company_members.
 * created_at = «de fik adgang», samme start som ikkeIGang), og INGEN
 * rådgiver har skrevet en menneskebesked i deres samtale
 * (conversations.last_advisor_reply_at er null — trigger'en
 * 20260316074924:78 sætter den KUN for message_type 'user' fra en
 * advisor/admin; systembeskeder og agentens grå bokse tæller ikke).
 * Agentens gamle as_advisor-velkomst (31/3–25/8) satte stemplet, så
 * Bastant, Homie og TOFT står IKKE her — de fik en besked, om end
 * maskinens. Det er rigtigt: signalet hedder «har ikke hørt fra os», og
 * det har de.
 *
 * TÆRSKLEN — VELKOMST_FRA_DAGE = 1: samme dag er for tidligt (Jonas 9/9:
 * en rådgiver skal have dagen til at skrive selv), en uge er for sent.
 * Én hel kalenderdag: kom de ind i går og har intet hørt, står de der i
 * morgen tidlig. Det er den frist et menneske ville acceptere for et
 * svar på «hej, jeg er kommet». INGEN øvre grænse: at ingen skrev til dem
 * på 165 dage er ikke mindre sandt end på dag 3 — og det er netop det
 * bagudrettede signal (b) blev valgt for.
 *
 * FORSVINDER når en rådgiver har skrevet, punktum. Ikke når medlemmet
 * skriver (så venter de STADIG på os — og «venter på svar» tager over
 * som sin egen grund), ikke når agenten skriver en systembesked.
 *
 * ALVOR — ALVOR_VENTER_PAA_VELKOMST = 80. Et menneske er lige kommet ind
 * og venter på et menneske; hver stille dag koster den adoption huset
 * har målt sig til at mangle (19 af 27 faldet ud). Over klar_til_tilbud
 * og ikke_i_gang (75): en der ikke er kommet i gang efter 21 dage har
 * haft tre uger; en der ikke er blevet hilst på efter én dag har fået
 * ingenting. På linje med omsætningsfald (80). Under bankovertræk og
 * frist_overskredet (90): der er penge på spil dér, her er det tillid.
 * Gennem alvorsporten (70) alene fra dag 1.
 *
 * HANDLINGEN er «Skriv til {navn}» — den findes (tavshedens ord, §1:
 * vi ringer ikke).
 */

export const VELKOMST_FRA_DAGE = 1;
export const ALVOR_VENTER_PAA_VELKOMST = 80;

export interface VenterPaaVelkomstInput {
  /** Første company_members.created_at (ISO); null = ingen medlemmer. */
  medlemSiden: string | Date | null | undefined;
  /** conversations.last_advisor_reply_at — seneste MENNESKEBESKED fra en
      rådgiver (trigger'en sætter den kun for message_type 'user'); null =
      ingen rådgiver har skrevet. Flere samtaler: den seneste. */
  sidsteRaadgiverBeskedAt: string | Date | null | undefined;
}

export type VenterPaaVelkomstTilstand = "ingen_medlem" | "hilst_paa" | "for_tidligt" | "venter";

export interface VenterPaaVelkomstDom {
  tilstand: VenterPaaVelkomstTilstand;
  /** Hele kalenderdage siden medlemskabet begyndte; null uden medlem. */
  dage: number | null;
  /** Sandt kun for «venter» — det der giver en linje. */
  signal: boolean;
}

const MS_PER_DOEGN = 86_400_000;

function tilDato(v: string | Date | null | undefined): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Hele kalenderdage siden — læserens dag, som husets øvrige domme
    (ikkeIGang.dageSidenStart har samme regnestykke). */
export function kalenderdageSiden(start: string | Date | null | undefined, nu: Date): number | null {
  const d = tilDato(start);
  if (!d) return null;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate()).getTime();
  return Math.round((b - a) / MS_PER_DOEGN);
}

export function afgoerVenterPaaVelkomst(input: VenterPaaVelkomstInput, nu: Date): VenterPaaVelkomstDom {
  const dage = kalenderdageSiden(input.medlemSiden, nu);
  if (dage == null) return { tilstand: "ingen_medlem", dage, signal: false };
  if (tilDato(input.sidsteRaadgiverBeskedAt)) return { tilstand: "hilst_paa", dage, signal: false };
  if (dage < VELKOMST_FRA_DAGE) return { tilstand: "for_tidligt", dage, signal: false };
  return { tilstand: "venter", dage, signal: true };
}

/** Linjens tekst: «Kom ind i går, har ikke hørt fra os» /
    «Kom ind for 3 dage siden, har ikke hørt fra os». */
export function venterPaaVelkomstTekst(dom: VenterPaaVelkomstDom): string {
  const dage = dom.dage ?? 0;
  const komInd = dage === 1 ? "Kom ind i går" : `Kom ind for ${dage} dage siden`;
  return `${komInd}, har ikke hørt fra os`;
}

/** Grundlaget for lukningen (lib/opgaveLukning): startdagen. Der SKER
    intet nyt mens de venter — dagene tæller ikke; en lukket linje bliver
    lukket, indtil et nyt medlemskab begynder (ny startdag). */
export function venterPaaVelkomstGrundlag(input: VenterPaaVelkomstInput): string {
  const d = tilDato(input.medlemSiden);
  return d ? d.toISOString().slice(0, 10) : "";
}
