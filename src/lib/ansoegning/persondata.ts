/**
 * src/lib/ansoegning/persondata.ts
 *
 * Persondatateksten til ansøgningen. ORDLYDEN ER GODKENDT AF JONAS 19/9-2026
 * — og Meta-afsnittet under «Hvad vi gemmer» (afsendelsen til Metas Conversions
 * API) samt «og hvilken slags browser du brugte» i afsnittet om klik-id'et er
 * godkendt af Jonas 21/9-2026 (udkast-meta-send). Teksten skal gengives ordret — den er skrevet som ét stykke og redigeres som ét
 * stykke. Skal noget ændres, kommer den nye ordlyd fra Jonas, ikke herfra.
 *
 * FORMEN: `PERSONDATA_TITEL` er sidens h1; hvert element i `PERSONDATA_AFSNIT`
 * er en sektion med en h2 og et antal brødtekst-afsnit. Siden
 * (`src/pages/AnsoegPersondata.tsx`) bruger hver STRENG som React-nøgle, så to
 * afsnit i samme sektion må aldrig være ordret ens. Den korte linje under
 * «Send ansøgningen» er en anden tekst og bor i `spoergsmaal.ts`
 * (`SAMTYKKE_LINJE`); den linker hertil via `PERSONDATA_STI`.
 *
 * HVAD DER ÆNDREDE SIG 19/9: den gamle tekst var skrevet 18/9, før Calendly,
 * eWebinar og e-underskriften kom til, og dækkede dem ikke. Nu står de tre med
 * hver sit sted: webinartilmelding og deltagelse under «Hvad vi gemmer» (og
 * koblingen på mailen), Calendly og eWebinar blandt leverandørerne med land,
 * og det underskrevne aftalegrundlag med sit uforanderlige revisionsspor.
 * Annoncesporet (utm-mærkerne og Metas klik-id) er også nyt. De gamle
 * arbejdsmærker i brødteksten er fjernet: de stod i den tekst ANSØGEREN
 * læser, og en ansøger skal ikke se vores egne noter. Det, der stadig skal
 * ses af en jurist, står i noten nederst i filen — aldrig i teksten.
 *
 * RETTET 21/9-2026 (aften, godkendt af Jonas): linjen under «Hvem ser dem» sagde «Ud
 * over leverandørerne ovenfor videregiver vi dem ikke.» — og MODSAGDE dermed afsnittet
 * ovenfor om, at vi fortæller Meta, at en ansøgning er påbegyndt og sendt, når ansøgeren
 * kom fra en annonce. Fundet ved gennemlæsning af den levende side efter udrulningen af
 * #1069 (meta-send-cron). Meta er ikke en leverandør, der behandler på vores instruks —
 * derfor står undtagelsen nu i selve sætningen, og de to afsnit siger det samme.
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
      "The Boardroom drives af Topix.dk ApS, CVR 45281736, Brunbjergvej 4, st. tv., 8240 Risskov. Vi er dataansvarlige for de oplysninger, du giver i ansøgningen. Spørgsmål om dine oplysninger kan altid sendes til kontakt@theboardroom.dk.",
    ],
  },
  {
    titel: "Hvad vi gemmer",
    afsnit: [
      "Det, du selv skriver i formularen: virksomhedens CVR-nummer, hjemmeside, omsætningsinterval og antal ansatte; dit navn, din e-mail og dit telefonnummer; dine svar på de tre spørgsmål om udfordring, hvad du har prøvet, og hvor du vil hen; hvornår du kan starte, og om du har set vores webinar.",
      "Det, vi slår op om virksomheden i CVR-registret ud fra nummeret: navn, stiftelsesår, branche, selskabsform, antal ansatte og adresse. Vi henter ikke oplysninger om ejere eller andre personer.",
      "Hvor du kom fra — for eksempel vores webinar, en annonce, LinkedIn eller direkte — og de mærker, der står i linket, du klikkede på. Kom du fra en annonce på Facebook eller Instagram, gemmer vi det klik-id, Meta selv satte på linket, og hvilken slags browser du brugte.",
      "Kom du fra en annonce på Facebook eller Instagram, fortæller vi Meta, at der er sket noget — at en ansøgning er påbegyndt, og at den er sendt. Vi sender kun det klik-id, Meta selv satte på linket, hvilken slags browser du brugte, og et id, vi selv har lavet. Vi sender aldrig dit navn, din e-mail, dit telefonnummer, dit CVR-nummer eller dine svar. Kom du ikke fra en annonce, sender vi ingenting. Vil du helst være fri, så skriv til kontakt@theboardroom.dk.",
      "En anonymiseret dags-nøgle for din internetadresse, som vi kun bruger til at begrænse misbrug af formularen. Selve adressen gemmes ikke her.",
      "Har du tilmeldt dig vores webinar, gemmer vi også din tilmelding og din deltagelse: hvornår du meldte dig til, om du deltog, og hvor stor en del af webinaret du så. Bruger du samme e-mailadresse til at ansøge, kobler vi de to sammen, så vi ved, at du har set det.",
      "Skriver du under på et aftalegrundlag, gemmer vi det underskrevne dokument sammen med et revisionsspor: dit navn, tidspunktet, din internetadresse og hvilken browser du brugte. Sporet kan ikke ændres eller slettes bagefter — det er netop dets formål, for det er beviset for, at aftalen blev indgået.",
    ],
  },
  {
    titel: "Hvorfor",
    afsnit: [
      "For at vurdere din ansøgning og aftale en samtale med dig. Du har selv bedt om at blive vurderet, og behandlingen er nødvendig for at kunne indgå en aftale med dig.",
      "For at minde dig om en ansøgning, du ikke blev færdig med. Vi sender højst én påmindelse.",
      "For at forstå, hvilke annoncer og kanaler der virker, så vi bruger annoncepengene rigtigt. Det gør vi ud fra vores berettigede interesse i at måle vores markedsføring. Du kan gøre indsigelse — skriv til os.",
      "For at kunne dokumentere en indgået aftale, hvis der senere opstår tvivl om den.",
    ],
  },
  {
    titel: "Sådan bruger vi tallene, og hvem der beslutter",
    afsnit: [
      "Når din ansøgning kommer ind, udregner platformen automatisk en anbefaling ud fra det, du har skrevet — for eksempel omsætning, branche og selskabets alder. Anbefalingen er kun vejledende.",
      "Det er altid Morten eller Jonas, der læser din ansøgning og beslutter. Der træffes ingen afgørelse om dig alene på grundlag af automatisk behandling.",
    ],
  },
  {
    titel: "Hvor længe",
    afsnit: [
      "En ansøgning, du ikke sender, slettes automatisk 30 dage efter, du sidst skrev i den.",
      "En sendt ansøgning gemmes i op til 12 måneder, så vi kan vende tilbage, hvis timingen ikke passer nu — derefter slettes den.",
      "Bliver du medlem, følger oplysningerne dit medlemskab, så længe det varer.",
      "Et underskrevet aftalegrundlag og dets spor gemmes i fem år efter aftalens ophør, fordi det er dokumentation for en indgået aftale.",
      "Webinartilmeldinger gemmes i op til 24 måneder.",
    ],
  },
  {
    titel: "Hvem ser dem",
    afsnit: [
      "Morten Larsen og Jonas Herlev, som læser og vurderer ansøgningerne, og de rådgivere, der arbejder for The Boardroom.",
      "Vores leverandører behandler oplysningerne på vores vegne og efter vores instruks: Supabase (databasen, via Lovable Cloud, i EU), Lovable (afsendelse af e-mail, i EU), DataCVR (opslaget i CVR-registret — de får kun CVR-nummeret, i Danmark), Calendly (dit navn, din e-mail og din virksomhed, når du booker en samtale, i USA), eWebinar (din tilmelding og deltagelse, hvis du har set webinaret, i USA) og Klaviyo (din e-mail og hvor du kom fra, når du begynder en ansøgning — og virksomhedens branche, omsætningsinterval og antal ansatte, når du sender den; det styrer, hvilke af vores egne mails om The Boardroom du får, i USA).",
      "Vi sælger aldrig dine oplysninger. Ud over leverandørerne ovenfor, og det vi fortæller Meta, når du kom fra en annonce, videregiver vi dem ikke.",
    ],
  },
  {
    titel: "Dine rettigheder",
    afsnit: [
      "Du kan når som helst bede om at se, rette, få slettet eller få udleveret det, vi har gemt om dig. Du kan også gøre indsigelse mod, at vi behandler dine oplysninger til at måle vores markedsføring, og bede om at få behandlingen begrænset.",
      "Skriv til kontakt@theboardroom.dk — vi svarer inden for en måned.",
      "Mener du, at vi behandler dine oplysninger forkert, kan du klage til Datatilsynet, Carl Jacobsens Vej 35, 2500 Valby, dt@datatilsynet.dk.",
    ],
  },
];

/*
 * ─────────────────────────────────────────────────────────────────────────
 * NOTE — FIRE TING SKAL SES AF EN JURIST (19/9-2026)
 *
 * Denne note er til os, ikke til ansøgeren. Den står bevidst UDEN FOR
 * `PERSONDATA_AFSNIT`, så den aldrig kan havne på siden. Teksten ovenfor er
 * godkendt af Jonas som ordlyd — den er ikke juridisk gennemgået.
 *
 * 1. RETSGRUNDLAGET FOR SELVE ANSØGNINGEN. Teksten siger, at behandlingen er
 *    «nødvendig for at kunne indgå en aftale med dig». Det skal efterprøves,
 *    om forholdet før en aftale rettelig hviler på foranstaltninger truffet
 *    på den registreredes anmodning, eller om noget af det snarere er en
 *    berettiget interesse — og om det i så fald skal stå anderledes.
 *
 * 2. OVERFØRSLERNE TIL USA. Calendly, eWebinar og Klaviyo behandler alle
 *    personoplysninger uden for EU/EØS. Grundlaget for overførslen skal
 *    fastlægges og nævnes, hvis det kræves — og det skal afgøres, om teksten
 *    skal sige mere end blot «i USA».
 *
 * 3. OPBEVARINGSTIDERNE. 30 dage, 12 måneder, 24 måneder og fem år er
 *    husets egne valg, ikke juridisk fastsatte frister. Femårsfristen på det
 *    underskrevne aftalegrundlag og sporet skal holdes op mod den faktiske
 *    dokumentations- og forældelsesinteresse. Bemærk samtidig, at sporet er
 *    gjort uforanderligt med vilje (databasetriggere), så en
 *    sletteanmodning ikke kan efterkommes på den del — det skal være
 *    juridisk holdbart og stemme med det, teksten lover.
 *
 * 4. DATABEHANDLERAFTALERNE. Der skal være en aftale på plads med ALLE FEM:
 *    Supabase (via Lovable Cloud), Lovable, DataCVR, Calendly og eWebinar.
 *    Teksten siger, at de behandler «på vores vegne og efter vores instruks»
 *    — det skal være sandt for hver enkelt, før teksten går i luften.
 *
 * Se også `SAMTYKKE_LINJE` i `spoergsmaal.ts`: den korte linje under «Send
 * ansøgningen» opsummerer kun 12 måneder og 30 dage og nævner hverken
 * femårsfristen på et underskrevet aftalegrundlag eller det uforanderlige
 * spor. Den er ikke rettet her, fordi dens ordlyd ikke er godkendt sammen
 * med denne tekst.
 * ─────────────────────────────────────────────────────────────────────────
 */
