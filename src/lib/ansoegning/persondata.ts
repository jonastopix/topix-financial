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
 *
 * GA-AFSNITTET, godkendt 21/9-2026 (chatten, med Jonas' fulde mandat): ét nyt afsnit under
 * «Hvad vi gemmer», lige efter afsnittet om hvor du kom fra: «Har du sagt ja til cookies på
 * theboardroom.dk, gemmer vi også det id, Google Analytics har givet din browser, så vi kan
 * se, hvilken kanal din ansøgning kom fra.» Grund: platformen gemmer fra 21/9 aften GA's
 * klient-id og session-id (_ga, _ga_6LHR66CDJ4) ved «opret» — kun når ansøgeren har sagt ja
 * til cookies på theboardroom.dk (ellers findes cookierne ikke). De sendes endnu ikke til
 * Google. Ordet «anonyme» er taget ud med vilje: id'et er tilfældigt, men det genkender
 * samme browser igen — og så er det ikke anonymt. Ordlyden er låst af gaOpsamling.guard
 * dom 6 og metaSend.guard dom 9.
 *
 * GA-AFSENDELSEN, godkendt 21/9-2026 (chatten, med Jonas' fulde mandat; udkast-ga-send):
 * ét nyt afsnit under «Hvad vi gemmer», lige efter Meta-afsnittet, og en tilføjelse til
 * «Vi sælger aldrig …»-sætningen, så Google står der som Meta gør. Grund: fra det øjeblik
 * ga-send-cron er i drift, FORTÆLLER vi Google Analytics om påbegyndt og sendt ansøgning —
 * og teksten skal være sand om det, koden GØR. Det, vi sender, er GA's eget klient-id
 * (og session-id), hvor ansøgeren kom fra (kilde og utm-mærker) og hændelsens tidspunkt;
 * aldrig navn, mail, telefon, CVR eller svar (Googles egen politik forbyder det, og
 * gaSend.guard dom 2 fælder det). Betingelsen er den samme som for opsamlingen: cookien
 * findes kun, når ansøgeren har sagt ja på theboardroom.dk. Ordlyden låses af
 * gaSend.guard dom 8, så den ikke kan skride ubemærket.
 *
 * META-UDVIDELSEN, 22/9-2026 — TO ÆNDRINGER I «HVAD VI GEMMER»:
 *
 * (a) META-AFSNITTET er ERSTATTET, og den nye ordlyd er GODKENDT AF CHATTEN MED JONAS'
 *     FULDE MANDAT (21/9 aften). Den gamle tekst sagde «Kom du fra en annonce …, sender vi
 *     kun det klik-id …» og «Vi sender aldrig dit navn, din e-mail, dit telefonnummer».
 *     Begge dele holdt op med at være sandt samme aften: platformen sender nu for ALLE
 *     ansøgere (ikke kun annonce-ansøgere) og sender en SHA-256-hashet udgave af e-mail,
 *     telefon og navn. En tekst, der lover noget, koden ikke gør, er værre end ingen tekst.
 *     Ordet «krypteret» er valgt frem for «hashet»: det er ikke det præcise fagord, men det
 *     er det ord, en ansøger forstår — og sætningen efter forklarer, hvad det betyder i
 *     praksis («Meta kan ikke se selve oplysningerne, men kan genkende dem …»).
 *     Låst ordret af metaSend.guard dom 9.
 *
 * (b) AFSNITTET OM «HVOR DU KOM FRA» er godkendt 21/9 (chatten, med Jonas' fulde mandat). Grunden til, at
 *     det skal rettes: user agent og Metas cookier gemmes fra 22/9 for ALLE, ikke kun for
 *     annonce-ansøgere, og den gamle sætning bandt begge dele til «Kom du fra en annonce».
 *     Teksten adskiller de tre: browseren altid, klik-id'et kun fra en annonce, cookierne
 *     kun med samtykke. Det er den ENESTE nye ordlyd i denne omgang, og den er markeret her,
 *     så den kan ses igennem som ét stykke. Sætningen skal blive ved med at begynde med
 *     «Hvor du kom fra», fordi gaOpsamling.guard dom 6 placerer GA-afsnittet lige efter den.
 *
 * (c) «VI SÆLGER ALDRIG …» har mistet forbeholdet «når du kom fra en annonce» om Meta, af
 *     samme grund som (a). Låst af gaSend.guard dom 8.
 *
 * FRAVALGET er nu mere end en adresse i en tekst: ansoegninger.meta_fravalg (migration
 * 20260922040000) får meta-send-cron til at springe ansøgningen over. Sættes i hånden med
 * én SQL, indtil der er en knap i rådgiverfladen. Punkt 5 i noten til juristen nedenfor.
 *
 * META TRIN 2, 22/9-2026 — GODKENDT 21/9 (chatten, med Jonas' fulde mandat). Meta-afsnittet er udvidet, fordi
 * platformen fra 22/9 fortæller Meta om tre ting mere: at rådgiveren har sagt ja til en samtale
 * («Kvalificeret»), at der er booket en tid («Schedule») og at et medlemskab er betalt
 * («Purchase»). Tre ændringer i ordlyden, hver med sin grund:
 *   (a) opremsningen «påbegyndt … sendt» er udvidet med samtale, booking og betaling. Uden det
 *       ville teksten love færre hændelser, end koden sender.
 *   (b) «Ved betalingen fortæller vi også, hvad medlemskabet kostede.» Purchase BÆRER beløbet
 *       (Meta kræver value og currency), og et beløb er en oplysning om kunden. Den skal stå.
 *   (c) «Klikket kan også være det, du gjorde, da du tilmeldte dig vores webinar.» Fra 22/9 er
 *       webinartilmeldingens klik-id tredje led i fbc-kæden, når linket til ansøgningen ikke
 *       selv bar et. Teksten sagde før «det klik-id … Meta selv har sat» uden at sige HVOR
 *       klikket skete — og det sted er et andet besøg, på et andet domæne.
 * Låst ordret af metaSend.guard dom 9.
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
      "Hvor du kom fra — for eksempel vores webinar, en annonce, LinkedIn eller direkte — og de mærker, der står i linket, du klikkede på. Vi gemmer altid, hvilken slags browser du brugte. Kom du fra en annonce på Facebook eller Instagram, gemmer vi også det klik-id, Meta selv satte på linket. Har du sagt ja til cookies på theboardroom.dk, gemmer vi desuden de cookies, Meta selv har sat i din browser.",
      "Har du sagt ja til cookies på theboardroom.dk, gemmer vi også det id, Google Analytics har givet din browser, så vi kan se, hvilken kanal din ansøgning kom fra.",
      "Vi fortæller Meta, at der er sket noget — at en ansøgning er påbegyndt, at den er sendt, at vi har sagt ja til en samtale, at der er booket en tid, og at et medlemskab er betalt — så vi kan se, om vores annoncer virker. Ved betalingen fortæller vi også, hvad medlemskabet kostede. Vi sender en krypteret udgave af din e-mail, dit telefonnummer og dit navn, det klik-id og de cookies, Meta selv har sat, hvilken slags browser du brugte, og et id, vi selv har lavet. Klikket kan også være det, du gjorde, da du tilmeldte dig vores webinar. Meta kan ikke se selve oplysningerne, men kan genkende dem, hvis du har en profil hos Meta med samme e-mail eller telefonnummer. Vi sender aldrig dit CVR-nummer eller dine svar. Vil du helst være fri, så skriv til kontakt@theboardroom.dk.",
      "Har du sagt ja til cookies på theboardroom.dk, fortæller vi også Google Analytics, at en ansøgning er påbegyndt, og at den er sendt. Vi sender det id, Google Analytics selv har givet din browser, og hvor du kom fra — aldrig dit navn, din e-mail, dit telefonnummer, dit CVR-nummer eller dine svar. Har du ikke sagt ja til cookies, sender vi ingenting.",
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
      "Vi sælger aldrig dine oplysninger. Ud over leverandørerne ovenfor, det vi fortæller Meta, og det vi fortæller Google Analytics, når du har sagt ja til cookies, videregiver vi dem ikke.",
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
 * 5. DET, DER ALLEREDE ER SENDT (22/9). Fravalget standser fremtidige afsendelser, men
 *    kalder ikke tilbage, hvad Meta og Google allerede har fået. Det skal afgøres, om
 *    teksten skal sige det, og hvad vi i givet fald gør ved en sletteanmodning — vejen er
 *    Metas og Googles egne sletteværktøjer, ikke vores database. Bemærk samtidig, at vi fra
 *    22/9 sender en hashet e-mail, et hashet telefonnummer og et hashet navn til Meta: det
 *    er stadig personoplysninger, og retsgrundlaget er den berettigede interesse i at måle
 *    markedsføringen, som står under «Hvorfor».
 *
 * Se også `SAMTYKKE_LINJE` i `spoergsmaal.ts`: den korte linje under «Send
 * ansøgningen» opsummerer kun 12 måneder og 30 dage og nævner hverken
 * femårsfristen på et underskrevet aftalegrundlag eller det uforanderlige
 * spor. Den er ikke rettet her, fordi dens ordlyd ikke er godkendt sammen
 * med denne tekst.
 * ─────────────────────────────────────────────────────────────────────────
 */
