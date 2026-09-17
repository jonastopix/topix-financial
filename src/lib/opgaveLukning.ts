/**
 * src/lib/opgaveLukning.ts
 *
 * Lukningen af en opgave på rådgiverens forside — dommen «lukket eller
 * levende», ren og testet (src/lib/__tests__/opgaveLukning.test.ts).
 *
 * BESLUTTET af Jonas 8/9: rådgiveren kan lukke en linje med to handlinger,
 * «Færdiggjort» og «Ikke relevant». Ingen «Udsæt» — linjerne er domme
 * regnet af data, og en udsættelse ville skjule noget der stadig er
 * sandt; rangeringen udsætter allerede. Jonas' regel, ordret: «Færdiggjort
 * holder på den opgave der er. Der skal være sket noget NYT for at en
 * opgave kan komme op igen. Hvis den er færdiggjort, så er den opgave
 * færdiggjort.» «Ikke relevant» er det samme: lukket indtil grundlaget
 * ændrer sig. For Jonas og Morten er linjerne OPGAVER, ikke observationer.
 *
 * Designets §7 («forsiden er et spejl … ingen klaret-knap», 4/9) er
 * hermed afløst for VIRKSOMHEDSLINJERNE: en linje forsvinder også når
 * rådgiveren lukker den. §7's «ikke relevant» og dets læring på
 * signaltype er bevaret i loggen (udfald + grundlag pr. grund).
 *
 * GRUNDLAGET er kernen. Hver grund på en linje bærer én værdi der siger
 * hvad dommen byggede på (forsidensDom.grundlagFor):
 *   stikker_ud            period_key for den seneste committede periode.
 *                         En NYERE periode = noget nyt; en gen-commit af
 *                         samme periode med andre tal = ikke nyt (valg:
 *                         perioden, ikke committed_at — en rettelse af
 *                         august er ikke en ny måned).
 *   tavshed               conversations.last_message_at («aldrig» uden
 *                         samtale). En ny besked = noget nyt — og så er
 *                         tavsheden alligevel væk, fordi dagene nulstilles.
 *                         Lukket uden ny besked: FORBLIVER lukket, også
 *                         når dagene vokser (Jonas' regel; det er her
 *                         reglen og «ingen må glemmes» (3/9) trækker hver
 *                         sin vej — Jonas valgte 8/9).
 *   venter_i_samtalen     conversations.last_member_message_at (seneste).
 *                         En ny medlemsbesked = noget nyt.
 *   fornyelse             status | beslutning | varsel 1 | varsel 2 —
 *                         enhver ændring i beslutning eller stempel.
 *   indgang               betalingsfristens status.
 *   opgave_naer_deadline  opgavens due_date (én grund pr. opgave, nøglet
 *                         på id). En flyttet frist = noget nyt; at fristen
 *                         passerer er det ikke (lukket er lukket).
 *
 * Testen er LIGHED, ikke «nyere»: grundlaget er en tekst pr. grund, og
 * «noget nyt» er at teksten er en anden end den kvitteringen gemte. Det
 * dækker også det sjældne tilfælde hvor grundlaget går baglæns (en fact
 * slettes) — det er stadig noget nyt.
 *
 * KVITTERINGEN er én række i advisor_company_acknowledgments pr. lukning
 * (en log, ikke en tilstand — migration 20260908150000): udfald,
 * grundlag (jsonb: nøgle → værdi for hver grund på linjen da den blev
 * lukket), advisor_id (hvem), acknowledged_at (hvornår). Dommen læser
 * kvitteringerne for virksomheden uanset hvilken rådgiver der lukkede:
 * opgaven er virksomhedens, ikke rådgiverens (Morten lukker Doggybed;
 * Jonas skal ikke se den).
 *
 * FLERE KVITTERINGER PR. VIRKSOMHED (rådgivernes forside PR 5, 17/9 —
 * «Ikke relevant» på tilstandslinjerne): før læste dommen KUN den nyeste
 * række («Dommen læser den NYESTE kvittering med grundlag for
 * virksomheden»). Det holdt så længe en virksomheds lukning altid bar ALLE
 * dens grunde (Virksomhedslinje.grundlag). En tilstand kvitteres pr.
 * virksomhed med KUN tilstandens grund ({ingen_maal: «ingen:0»}), og
 * lukkes tavsheden for samme virksomhed en uge senere, ville «ingen mål»
 * være levende igen uden at noget var sket. Derfor FLETTES rækkerne
 * (fletKvitteringer): nøgle for nøgle, nyeste vinder. Jonas' regel gælder
 * uændret — lukket holder til grundlaget er et andet; en ældre kvittering
 * på et gammelt grundlag lukker intet, fordi ligheden fejler.
 */

export type LukningsUdfald = "faerdiggjort" | "ikke_relevant";

export const LUKNINGS_UDFALD: readonly LukningsUdfald[] = ["faerdiggjort", "ikke_relevant"];

export const UDFALD_TEKST: Record<LukningsUdfald, string> = {
  faerdiggjort: "Færdiggjort",
  ikke_relevant: "Ikke relevant",
};

/** Det dommen får at vide om den nyeste kvittering for en virksomhed. */
export interface Kvittering {
  udfald: LukningsUdfald;
  /** Grundens nøgle → grundlaget da linjen blev lukket. */
  grundlag: Record<string, string>;
  /** ISO — hvornår. Bruges ikke i dommen; bæres til visning og log. */
  lukketAt: string;
}

/** Det dommen skal vide om én grund for at afgøre lukket/levende. */
export interface GrundTilLukning {
  /** Stabil identitet: slags, evt. med signaltype eller opgave-id. */
  noegle: string;
  /** Én tekst — hvad dommen byggede på (se filhovedet). */
  grundlag: string;
}

/**
 * LUKKET når kvitteringen gemte præcis dette grundlag for præcis denne
 * nøgle. Alt andet er LEVENDE: ingen kvittering, en nøgle kvitteringen
 * ikke kendte (grunden er ny), eller et andet grundlag (noget er sket).
 */
export function erLukket(grund: GrundTilLukning, kvittering: Kvittering | null | undefined): boolean {
  if (!kvittering) return false;
  const gemt = kvittering.grundlag[grund.noegle];
  return typeof gemt === "string" && gemt === grund.grundlag;
}

/** Det der gemmes når en linje lukkes: alle linjens grunde, nøgle → grundlag. */
export function grundlagForLinje(grunde: readonly GrundTilLukning[]): Record<string, string> {
  const ud: Record<string, string> = {};
  for (const g of grunde) ud[g.noegle] = g.grundlag;
  return ud;
}

/** Fletter en virksomheds kvitteringer (NYESTE FØRST) til én: nøgle for
    nøgle vinder den nyeste; udfald og tidspunkt er den nyestes. Tom liste →
    null. PR 5 (17/9) — se filhovedet. */
export function fletKvitteringer(nyesteFoerst: readonly Kvittering[]): Kvittering | null {
  if (nyesteFoerst.length === 0) return null;
  const grundlag: Record<string, string> = {};
  for (const k of nyesteFoerst) {
    for (const [noegle, g] of Object.entries(k.grundlag)) {
      if (!(noegle in grundlag)) grundlag[noegle] = g;
    }
  }
  return { udfald: nyesteFoerst[0].udfald, grundlag, lukketAt: nyesteFoerst[0].lukketAt };
}

/** Læser en kvittering-række som den kommer fra databasen; null når rækken
    er fra før 8/9 (uden udfald/grundlag — den gamle snooze-model) eller
    er beskadiget. Fail-open: en ulæselig kvittering lukker ingenting. */
export function laesKvittering(raekke: {
  udfald?: string | null;
  grundlag?: unknown;
  acknowledged_at?: string | null;
} | null | undefined): Kvittering | null {
  if (!raekke) return null;
  const udfald = raekke.udfald;
  if (udfald !== "faerdiggjort" && udfald !== "ikke_relevant") return null;
  const g = raekke.grundlag;
  if (!g || typeof g !== "object" || Array.isArray(g)) return null;
  const grundlag: Record<string, string> = {};
  for (const [k, v] of Object.entries(g as Record<string, unknown>)) {
    if (typeof v === "string") grundlag[k] = v;
  }
  return { udfald, grundlag, lukketAt: raekke.acknowledged_at ?? "" };
}
