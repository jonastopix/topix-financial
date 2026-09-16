/**
 * src/lib/delingstekster.ts
 *
 * Teksten over billedet (mangellistens nr. 3: «3-4 tekster»). Kreativen er
 * billedet; det her er det hun skriver i LinkedIn-opslaget. Ren motor —
 * ingen React, ingen IO — af { memberName, companyName, dateLabel }: trim,
 * tomt → null, og en sætning der aldrig hænger (mønstret fra præsentationens
 * titel, som blev slettet 16/9). Testet i __tests__/delingstekster.test.ts.
 *
 * ANDEN RUNDE (Jonas 14/9 om første runde: «røvsyge»). To ting var galt:
 *   (1) «ejerleder» — målt på theboardroom.dk 14/9 er målgruppen
 *       «soloselvstændige og ejerledere med mindst 2 mio. kr. i omsætning»,
 *       og de fleste medlemmer er nærmere solo-selvstændige. Her står
 *       «selvstændige» eller ingenting — aldrig «ejerleder» alene.
 *   (2) Fire tekster skal være FIRE VEJE, ikke fire længder af samme stemme:
 *       «hvilken vej vil du i dit opslag?» — glad og ligefrem, ærlig,
 *       forretningsmæssig, invitation.
 * De fire tekster er Jonas' egne, godkendt 14/9, og står her ORDRET som
 * skabeloner med {virksomhed} og {dato} sat ind. Ingen udråbstegn, ingen
 * pris, intet medlemstal, intet fra ansøgningen.
 *
 * LØFTET er websitets, ordret (theboardroom.dk 14/9): «Rådgivere, der er
 * der, når beslutningen opstår. Ikke bare hvert kvartal.» og «12 måneder
 * med to rådgivere, der har bygget, drevet og solgt virksomheder – og som
 * har dine tal ved hånden, fordi du uploader dem hver måned.» Teksterne
 * bruger det og opfinder intet.
 *
 * «fire år» i «Ærlig» er et eksempel hun retter selv — fladen siger det
 * (note-feltet).
 */

export interface DelingsteksterInput {
  memberName: string | null | undefined;
  companyName: string | null | undefined;
  /** «september 2026» — delingskreativ.dateLabel. */
  dateLabel: string | null | undefined;
}

export type DelingstekstId = "glad" | "aerlig" | "forretning" | "invitation";

export interface Delingstekst {
  id: DelingstekstId;
  /** Vejen, som kortet viser den: «Glad og ligefrem», «Ærlig», «Forretningsmæssig», «Invitation». */
  titel: string;
  /** Afsnit adskilt af linjeskift — som hun sætter det ind. */
  tekst: string;
  /** Det hun skal rette selv, hvis der er noget. */
  note?: string;
}

/** Kort vejledning ved siden af teksterne — det medlemmet ikke ved. Kun disse fire; intet mere om algoritmen. */
export const VEJLEDNING: readonly string[] = [
  "Tag Morten Larsen (linkedin.com/in/mortenlarsen) og Jonas Herlev (linkedin.com/in/jonasherlev) i selve opslaget.",
  "Læg linket til theboardroom.dk i første kommentar, ikke i opslaget — LinkedIn viser opslag med eksterne links til færre.",
  "Svar på kommentarer den første time. Det er dér rækkevidden afgøres.",
  "Billedet først, teksten under.",
];

export const NOTE_FIRE_AAR = "«fire år» er et eksempel — ret det til dit eget tal.";

const trimEllerNull = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

/** Afsnit af sætninger — tomme udelades, så intet hænger. */
const afsnit = (...saetninger: (string | null)[]): string => saetninger.filter((s): s is string => !!s).join(" ");
/** Teksten af afsnit — ét linjeskift imellem. */
const tekst = (...afsnitListe: string[]): string => afsnitListe.filter((a) => a.trim() !== "").join("\n");

export function byggDelingstekster(input: DelingsteksterInput): Delingstekst[] {
  const virksomhed = trimEllerNull(input.companyName);
  const dato = trimEllerNull(input.dateLabel);

  const glad: Delingstekst = {
    id: "glad",
    titel: "Glad og ligefrem",
    tekst: tekst(
      "Så blev det officielt: jeg er blevet medlem af The Boardroom.",
      "De næste 12 måneder får jeg sparring fra Morten Larsen og Jonas Herlev — to der selv har bygget, drevet og solgt virksomheder. Og så er der en flok andre selvstændige med, som jeg glæder mig til at lære at kende.",
      "Jeg er ret spændt på det her.",
    ),
  };

  const aerlig: Delingstekst = {
    id: "aerlig",
    titel: "Ærlig",
    tekst: tekst(
      "Jeg har brugt fire år på at lade som om jeg havde styr på tallene.",
      "Det har jeg sådan set også. Jeg har bare ikke haft nogen at vende dem med, når noget skulle besluttes — og revisoren ser dem jo først bagefter.",
      afsnit(
        virksomhed ? `Derfor er ${virksomhed} nu med i The Boardroom.` : "Derfor er jeg nu med i The Boardroom.",
        "12 måneder med Morten Larsen og Jonas Herlev, der har mine tal ved hånden hele vejen.",
      ),
    ),
    note: NOTE_FIRE_AAR,
  };

  const forretning: Delingstekst = {
    id: "forretning",
    titel: "Forretningsmæssig",
    tekst: tekst(
      "Jeg har lige investeret i noget der ikke står i regnskabet: rådgivning.",
      `${virksomhed ?? "Jeg"} er blevet medlem af The Boardroom — 12 måneder med Morten Larsen og Jonas Herlev, som kender mine tal og er der når beslutningerne opstår. Ikke kun hvert kvartal.`,
      "Det er den slags udgift jeg tror betaler sig selv. Vi får se om et år.",
    ),
  };

  const invitation: Delingstekst = {
    id: "invitation",
    titel: "Invitation",
    tekst: tekst(
      "Hvis du også sidder alene med din virksomhed, så er det her måske noget for dig.",
      "Jeg er blevet medlem af The Boardroom: 12 måneder med Morten Larsen og Jonas Herlev, og en gruppe andre selvstændige at spille bold op ad.",
      afsnit(
        `${virksomhed ?? "Jeg"} er med${dato ? ` fra ${dato}` : ""}.`,
        "Sig til hvis du vil høre hvordan det går.",
      ),
    ),
  };

  return [glad, aerlig, forretning, invitation];
}
