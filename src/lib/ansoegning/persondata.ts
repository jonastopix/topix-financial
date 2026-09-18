/**
 * src/lib/ansoegning/persondata.ts
 *
 * UDKAST TIL JONAS (18/9-2026, punkt 4) — IKKE JURIDISK RÅDGIVNING. Skal
 * læses af et menneske (og gerne en jurist) før det går i luften. Der
 * fandtes ingen samtykke-/persondatatekst i platformen 18/9 (grep i src,
 * supabase og docs: ingen), så dette er første udkast.
 *
 * Den korte linje under «Send ansøgningen» bor i spoergsmaal.ts
 * (SAMTYKKE_LINJE); den lange tekst her vises på PERSONDATA_STI
 * (/ansoeg/persondata). Fakta der SKAL tjekkes før publicering er
 * markeret [TJEK]: dataansvarlig og CVR er læst af theboardroom.dk's
 * schema.org-blok 18/9 (Topix.dk ApS, DK45281736); databehandlerne er
 * dem koden bruger (Supabase via Lovable Cloud, Lovable mail-API,
 * DataCVR). Opbevaringsfristerne er formularens egne regler (README §3).
 */

export interface PersondataAfsnit {
  titel: string;
  afsnit: string[];
}

export const PERSONDATA_TITEL = "Sådan behandler vi dine oplysninger, når du ansøger";

export const PERSONDATA_AFSNIT: readonly PersondataAfsnit[] = [
  {
    titel: "Hvem er ansvarlig",
    afsnit: [
      "The Boardroom drives af Topix.dk ApS, CVR 45281736 [TJEK]. Det er os, der er dataansvarlige for de oplysninger, du giver i ansøgningen. Spørgsmål om dine oplysninger kan altid sendes til kontakt@theboardroom.dk.",
    ],
  },
  {
    titel: "Hvad vi gemmer",
    afsnit: [
      "Det, du selv skriver i formularen: virksomhedens CVR-nummer, hjemmeside, omsætningsinterval og antal ansatte; dit navn, din e-mail og dit telefonnummer; dine svar på de tre spørgsmål om udfordring, hvad du har prøvet, og hvor du vil hen; hvornår du kan starte, og om du har set webinaret.",
      "Det, vi slår op om virksomheden i CVR-registret ud fra nummeret: navn, stiftelsesår, branche, selskabsform, antal ansatte (som interval) og hjemmeside. Vi henter ikke oplysninger om ejere eller andre personer.",
      "Hvor du kom fra (fx webinaret, LinkedIn eller direkte), og en anonymiseret dags-nøgle for din internetadresse, som vi kun bruger til at begrænse misbrug af formularen. Selve adressen gemmes ikke.",
    ],
  },
  {
    titel: "Hvorfor",
    afsnit: [
      "For at kunne vurdere din ansøgning og tage kontakt til dig om en afklaringssamtale. Det sker, fordi du selv har bedt om at blive vurderet — behandlingen er nødvendig for at kunne indgå en eventuel aftale med dig, og vi har en berettiget interesse i at kunne besvare henvendelser [TJEK retsgrundlag].",
      "For at kunne minde dig om en ansøgning, du ikke blev færdig med. Vi sender højst én påmindelse.",
    ],
  },
  {
    titel: "Hvor længe",
    afsnit: [
      "En ansøgning, du ikke sender, slettes automatisk 30 dage efter du sidst skrev i den.",
      "En sendt ansøgning gemmes i op til 12 måneder, så vi kan vende tilbage til den, hvis timingen ikke passer nu. Bliver du medlem, følger oplysningerne dit medlemskab.",
    ],
  },
  {
    titel: "Hvem ser dem",
    afsnit: [
      "Morten Larsen og Jonas Herlev, som læser og vurderer ansøgningerne, og de rådgivere der arbejder for The Boardroom.",
      "Vores leverandører behandler oplysningerne på vores vegne og efter vores instruks [TJEK databehandleraftaler]: Supabase (databasen, via Lovable Cloud), Lovable (afsendelse af e-mail) og DataCVR (opslaget i CVR-registret — de får kun CVR-nummeret). Vi sælger eller videregiver aldrig dine oplysninger til andre.",
    ],
  },
  {
    titel: "Dine rettigheder",
    afsnit: [
      "Du kan når som helst bede om at se, rette eller få slettet det, vi har gemt om dig — skriv til kontakt@theboardroom.dk, så sker det inden for en måned. Du kan også klage til Datatilsynet, hvis du mener, vi behandler dine oplysninger forkert.",
    ],
  },
];
