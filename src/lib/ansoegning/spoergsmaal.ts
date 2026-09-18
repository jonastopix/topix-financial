/**
 * src/lib/ansoegning/spoergsmaal.ts
 *
 * Teksten på de elleve skærme — spørgsmål, hjælpelinje og placeholders.
 * KUN tekst; rækkefølge, felter og domme bor i skema.ts (spejlet i Deno).
 * Alt her er UDKAST til Jonas' godkendelse (README §7). Jonas' egne ord
 * 18/9 for de tre der filtrerer er brugt ordret.
 */
import type { FeltId, SkaermId } from "./skema";

export interface SkaermTekst {
  id: SkaermId;
  /** Gruppens navn over spørgsmålet — «Virksomheden», «Dig», … */
  eyebrow: string;
  spoergsmaal: string;
  hjaelp?: string;
  placeholder?: Partial<Record<FeltId, string>>;
  /** Knappen der går videre; standard «Næste». */
  knap?: string;
}

export const GRUPPENAVNE = {
  virksomheden: "Virksomheden",
  dig: "Dig",
  de_tre: "Det vi læser grundigst",
  timing: "Timing",
} as const;

export const SKAERMTEKSTER: readonly SkaermTekst[] = [
  {
    id: "cvr",
    eyebrow: GRUPPENAVNE.virksomheden,
    spoergsmaal: "Hvad er jeres CVR-nummer?",
    hjaelp: "Vi slår det op, så du slipper for at skrive resten.",
    placeholder: { cvr: "12 34 56 78" },
    knap: "Slå op",
  },
  {
    id: "hjemmeside",
    eyebrow: GRUPPENAVNE.virksomheden,
    spoergsmaal: "Har I en hjemmeside?",
    hjaelp: "Vi kigger forbi, før vi taler sammen.",
    placeholder: { hjemmeside: "nordicbyg.dk" },
  },
  {
    id: "omsaetning",
    eyebrow: GRUPPENAVNE.virksomheden,
    spoergsmaal: "Hvor stor er omsætningen om året?",
    hjaelp: "Cirka — det seneste hele år.",
  },
  {
    id: "ansatte",
    eyebrow: GRUPPENAVNE.virksomheden,
    spoergsmaal: "Hvor mange er I?",
    hjaelp: "Ansatte, dig selv medregnet. Skriv 0, hvis du er alene.",
    placeholder: { antal_ansatte: "14" },
  },
  {
    id: "navn",
    eyebrow: GRUPPENAVNE.dig,
    spoergsmaal: "Hvad hedder du?",
    placeholder: { navn: "Dit fulde navn" },
  },
  {
    id: "kontakt",
    eyebrow: GRUPPENAVNE.dig,
    spoergsmaal: "Hvor fanger vi dig?",
    hjaelp: "Vi ringer, hvis der er et match. Og bliver du ikke færdig i dag, sender vi dig et link tilbage hertil.",
    placeholder: { email: "dig@virksomheden.dk", telefon: "12 34 56 78" },
  },
  {
    id: "udfordring",
    eyebrow: GRUPPENAVNE.de_tre,
    spoergsmaal: "Hvad er den største udfordring i din virksomhed lige nu?",
    hjaelp: "Skriv, som du ville sige det til én, du stoler på. Det behøver ikke være pænt.",
    placeholder: { udfordring: "Fx: Vi har travlt, men der er ingen penge tilbage, når måneden er omme …" },
  },
  {
    id: "proevet",
    eyebrow: GRUPPENAVNE.de_tre,
    spoergsmaal: "Hvad har du selv prøvet for at løse den?",
    hjaelp: "Både det, der virkede, og det, der ikke gjorde.",
    placeholder: { proevet: "Fx: Sat priserne op i foråret, skiftet bogholder, prøvet at sige nej til de små opgaver …" },
  },
  {
    id: "om_tolv_maaneder",
    eyebrow: GRUPPENAVNE.de_tre,
    spoergsmaal: "Hvor vil du gerne stå om tolv måneder?",
    hjaelp: "Tal, tid, ro i maven — det du selv måler det på.",
    placeholder: { om_tolv_maaneder: "Fx: Overskud hver måned, en driftsleder på plads, og fri hver anden fredag …" },
  },
  {
    id: "start",
    eyebrow: GRUPPENAVNE.timing,
    spoergsmaal: "Hvornår kan du starte?",
  },
  {
    id: "webinar",
    eyebrow: GRUPPENAVNE.timing,
    spoergsmaal: "Har du set Mortens webinar?",
    hjaelp: "Det er ikke et krav — men det gør den første samtale bedre.",
    knap: "Send ansøgningen",
  },
];

export function skaermTekst(id: SkaermId): SkaermTekst {
  const t = SKAERMTEKSTER.find((s) => s.id === id);
  if (!t) throw new Error(`Ingen tekst til skærmen ${id}`);
  return t;
}

/** CVR-bekræftelsen: sætningen fra skema.ts + dette spørgsmål. */
export const CVR_RIGTIGT = "Rigtigt?";
export const CVR_JA = "Ja, det er os";
export const CVR_NEJ = "Nej, ret nummeret";
export const CVR_FINDES_IKKE = "Vi kan ikke finde det nummer i CVR. Tjek cifrene — eller fortsæt, hvis virksomheden er helt ny.";
export const CVR_UTILGAENGELIG = "Vi kunne ikke slå nummeret op lige nu. Du kan fortsætte — så tjekker vi det.";
export const CVR_IKKE_AKTIV = "CVR siger, at virksomheden ikke er aktiv. Er det den rigtige?";
export const CVR_FORTSAET_ALLIGEVEL = "Fortsæt alligevel";
export const HJEMMESIDE_INGEN_KNAP = "Vi har ingen hjemmeside";

/** Over formularen — hvad der sker bagefter, og prisen. UDKAST. */
export const INTRO = {
  eyebrow: "Ansøg om medlemskab",
  titel: "Ansøg om en plads i The Boardroom",
  manchet:
    "Tolv måneder med to rådgivere, der kender dine tal, fordi du deler dem hver måned. Vi optager kun virksomheder, hvor vi kan gøre en forskel — derfor spørger vi.",
  trin: [
    { titel: "Du svarer på elleve spørgsmål", tekst: "Det tager fem til syv minutter. Dine svar gemmes undervejs, så du kan stoppe og vende tilbage." },
    // JONAS 18/9 (ordret): ALLE skal til afklaringssamtale — der findes ikke et tilbud uden samtale.
    {
      titel: "Vi gennemgår din ansøgning",
      tekst:
        "Morten og Jonas læser og vurderer, om The Boardroom er det rigtige for dig. Jonas inviterer dig til en uforpligtende snak, hvor I begge tager stilling til, om der er et match.",
    },
    { titel: "I beslutter jer sammen", tekst: "Er der et match efter snakken, får du et aftalegrundlag. Først når du har sagt ja, sker der mere." },
  ],
  pris: "Medlemskabet koster 50.000 kr. om året ekskl. moms.",
  prisNote: "Vi skriver det her, så du ikke bruger tid på en samtale, der ikke giver mening for dig.",
  knap: "Start ansøgningen",
  varighed: "5–7 minutter · gemmes undervejs · ingen konto",
} as const;

export const KVITTERING = {
  eyebrow: "Tak",
  titel: "Din ansøgning er sendt",
  tekst: "Morten og Jonas læser og vurderer den. Er The Boardroom det rigtige for dig, inviterer Jonas dig til en uforpligtende snak. Hold øje med telefonen og indbakken.",
} as const;

/**
 * PERSONDATA — UDKAST TIL JONAS. Ikke juridisk rådgivning; skal læses af et
 * menneske før det går i luften (Jonas 18/9, punkt 4). Den korte linje står
 * under «Send ansøgningen»; den lange tekst bor i persondata.ts og vises på
 * PERSONDATA_STI.
 */
export const PERSONDATA_STI = "/ansoeg/persondata";
export const SAMTYKKE_LINJE =
  "Når du sender, gemmer vi dine svar, så Morten og Jonas kan vurdere din ansøgning. Vi gemmer dem i op til 12 måneder; en ufærdig ansøgning slettes efter 30 dage. Du kan altid bede om at få dem slettet.";
export const SAMTYKKE_LINK = "Sådan behandler vi dine oplysninger";

/** 409 fra «indsend»: mailen har allerede en åben, indsendt ansøgning (A's ansoegninger_aaben_email_uidx). */
export const ALLEREDE = {
  eyebrow: "Tak",
  titel: "Vi har allerede din ansøgning",
  tekst: "Der ligger allerede en ansøgning fra dig hos os, og den er ikke afsluttet endnu. Du behøver ikke sende en ny — vi vender tilbage til dig. Har du spørgsmål, så skriv til kontakt@theboardroom.dk.",
} as const;

export const GENOPTAG = {
  titel: "Velkommen tilbage",
  tekst: "Dine svar er gemt. Vi fortsætter, hvor du slap.",
} as const;
