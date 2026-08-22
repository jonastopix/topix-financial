# Rækkefølge og produktoverblik

**Opgjort**: 2026-08-22
**Status**: Levende dokument. Rækkefølgen er beslutningen; resten er materialet den hviler på.

Dette dokument holder **rækkefølgen** og de **endnu ikke bogførte idéer**. Detaljerede tekniske fund bor andre steder og gentages ikke her:

- `BACKLOG.md` — P-punkter, fund fra recon, kendte fejl
- `docs/opgave-model-design.md` — beslutning B1-B11, datamodel
- `docs/opgave-model-kortlaegning.md` — kodekortlægning af milestones, actions, pulse, weekly focus
- `SECURITY_BASELINE.md` (i `supabase/`) — RLS-tilstand og deliberate breaks
- `OVERLEVERING-2026-08-12.md` — status før Hjemmebane-konverteringen blev færdig

En læsbar HTML-udgave findes uden for repoet. **Ved uenighed vinder denne fil.**

---

## Rækkefølgen

Medlemsfeedback modtaget 22. august flyttede den. Importen står forrest — ikke fordi den er størst, men fordi to tredjedele af medlemmerne ikke har friske tal, og alt andet bygger oven på tal der ikke er der.

### 1. Få tallene ind — denne uge

- Budget-importen rettet: parenteser som negative tal, tusindtalsseparatorer, subtotal-genkendelse, sektionsoverskrifter, to tabeller i samme fil
- Enhver linje skal kunne slettes og rettes
- Indsæt fra regneark: et gitter man kan paste tolv måneder ned i
- Rapport-uploaden der afviser og henviser til manuel indtastning
- De tre Stripe-beslutninger med Morten (koster ingen udviklingstid)
- Fejlovervågning (én time)

**Hvorfor her:** Kun 11 af 34 virksomheder har tal nyere end 60 dage. Det handler ikke om disciplin — importen virker ikke. Uden tal er der ingen KPI'er, ingen rapporter, intet at rådgive om, ingen anledninger, intet at gamificere.

### 2. Stop det der lækker — ugen efter

- Rådgiver-gaten `erAktivtRaadgiverforhold`, 18 kaldesteder
- Månedsdigesten der viser overskredne deadlines som kommende (kører den 22. hver måned)
- Rolletjek-bug i tre edge functions
- Velkomstbesked uden afsender
- Ugyldig `awaiting_reply_from` i `send-welcome-message`
- To virksomheder uden række i `companies`
- `Deno.cron` — tre funktioner har aldrig kørt

**Hvorfor her:** Alle er små, alle rammer i dag, ingen afhænger af noget. Ulæst-fejlene hører derimod ikke her — de er samme sygdom og løses i fase 3.

### 3. Fjern uploadproblemet i stedet for at gøre det mindre — næste måned

- Direkte integration til regnskabssystemer: e-conomic, Dinero, Billy

**Hvorfor her:** Det eneste greb hvor problemet holder op med at findes. e-conomic er allerede integreret på faktureringssiden. Virker det, går de 11 af 34 til næsten alle uden at nogen gør noget, og rapporteringsdisciplinen løser sig selv.

### 4. Opgave-modellen færdig, og tilstandslaget — fase 1 og 2

- Skrivevejen: edge functions der kalder motoren. Beslutning først: hvor skal motoren bo
- Medlemmets opgaveflade, refleksionens udgang, rådgiverens forslagsvej
- Migrering af de 102 milestones som modellens første anvendelse
- Tilstandslaget: ét sted der svarer hvor en virksomhed står

**Hvorfor her:** Tilstandslaget er forudsætningen for MCP, dagslisten, rådgiverdesignet og ærlig gamification. Bygges noget af det før, bygges det to gange. Og opgave-modellen er forudsætningen for tilstandslaget, fordi et lag uden aftaler kun kan rapportere stilhed og talfriskhed.

### 5. Rådgiverfladen som ét forløb — fase 3

- Splittet af `CompanyChatPane` i medlemsflade og rådgiverbord
- Rollen som eksplicit tilstand: én bruger skal kunne skifte mellem virksomhed og rådgiver
- Designkonvertering af AdvisorDashboard, medlemsliste og MemberDetail
- Ydeevne: dashboardet henter hele databasen og filtrerer i JavaScript
- Ulæst-begrebet samlet: to systemer, tre filtre, delt `read_at`
- Dagslisten som primær visning
- MCP-serveren oven på tilstandslaget

**Hvorfor samlet:** Syv punkter, ét stykke arbejde. De deler samme rod — rollen udledes af datastrukturen (`isAdvisor && !companyId`) i stedet for at være en tilstand. Laves de hver for sig, røres samme fil tre gange.

### 6. Fastholdelse — når fundamentet bærer

- Gamification: selv-rettet progression, dig mod gennemsnittet, aggregeret social proof
- Interaktiv onboarding — de første 30 dage
- Top posts og highlights i Community, rating efter modul, ugens nyheder med auto-tråd
- Delings-miljø og affiliate-programmet

**Hvorfor her:** Gamification kræver et ærligt grundlag. Først når opgave-modellen kan skelne gjort, droppet og ikke nået, er der noget rigtigt at måle. Bygges det før, måler man på milestones med 8 % fuldførelse.

### Løbende — uafhængigt af alt andet

- Loginsiden (lille, det første nogen ser)
- Indstillinger: både udtryk og en naturlig inddeling af sektioner
- Admin for bruger og virksomhed
- Søgning på tværs, mobiloplevelsen, kursusbeskrivelser
- Feedback- og idébank i produktet

---

## Medlemsfeedback 2026-08-22

To mails samme dag fra betalende medlemmer der forsøger at bruge kerneproduktet og ikke kan.

### Fem parse-fælder i budget-CSV'en

Verificeret mod en rigtig medlemsfil (Remm ApS, driftsbudget 2026):

1. **Negative tal i parentes.** `(17,000)` betyder minus 17.000. Læses det som tekst, bliver det NaN eller et positivt tal.
2. **Tusindtalsseparator er komma, decimaltegn punktum.** `2,700,000` i en dansk fil. Samme klasse som ×100-fejlen (PR #150).
3. **Subtotaler står side om side med detaljelinjer.** "Subtotal Personale & konsulentydelser" står under de tre poster den summerer. Tages begge, dobbelttælles der — samme klasse som `tech_software`-fejlen (PR #151).
4. **Bindestreg og tom celle betyder begge nul.** To notationer for det samme.
5. **Filen indeholder to tabeller.** Linje 4-15 er et KPI-resumé med værdi i kolonne B og kommentar i kolonne C. Linje 17 starter forfra med månedsoverskrifter. Læses de som én tabel, bliver kolonne B til januar.

Medlemmet gør intet forkert. Filen er velbygget.

### Øvrige fund

- **Poster kan ikke slettes.** Har parseren opfundet en post, kan medlemmet kun rette tal i en linje der ikke burde findes.
- **Ingen indsæt-fra-regneark.** Manuel indtastning felt for felt i et budget med ~90 linjer og 12 måneder.
- **Rapport-uploaden afviser** og henviser til manuel indtastning. Andet medlem, samme dag.

### Målingen

**11 af 34 virksomheder har tal nyere end 60 dage.** Det er ikke en statistik om medlemmernes disciplin — det er målingen af om produktets forreste dør virker. Bør følges løbende.

**Konsekvens:** de 15 aktiverings-sager (otte har aldrig committet et tal) bør genbesøges når importen er rettet. Nogle af dem er formentlig ikke frafald, men blokerede.

---

## Idébank

Endnu ikke sekvenseret. Skal prioriteres, ikke glemmes.

### Affiliate — medlemmer der anbefaler medlemmer

Besluttet retning 2026-08-22: **5.000-10.000 kr. pr. medlem der optages** på baggrund af et lead fra et eksisterende medlem. Ikke pr. ansøger — der skal stadig være et match.

Fire ting der skal afklares før noget bygges:

**Attributionen skal overleve Monday.** Henvisningen opstår i platformen, men optagelsen sker i ansøgningsflowet på Monday. Kæden lead → ansøgning → samtale → optaget → betalt krydser to systemer. Tabes referencen undervejs, kan der ikke udbetales. Det er den svære del — ikke knappen.

**Udbetaling på første betaling, ikke på optagelse.** Bliver nogen optaget og betaler aldrig, er der udbetalt for ingenting. Optagelse er beslutningen; betaling er begivenheden.

**Overvej kredit som alternativ til kontant.** Fx 5.000 kontant eller 10.000 i rabat på egen fornyelse. Koster mindre i likviditet, binder henviseren et år mere, og gør akkvisitionskanalen til en fastholdelsesmekanik. Timingen passer med fornyelserne for de første kohorter.

**Skat og fakturering.** 5.000-10.000 til en privatperson eller deres selskab er skattepligtigt og kræver enten faktura eller indberetning. Afklares med revisor før første udbetaling.

Hænger sammen med delings-miljøet (idé 8 i `BACKLOG.md`).

### Rådgiver med egen virksomhed

I dag kræver den dobbelte rolle to logins, fordi rollen udledes af datastrukturen: `isAdvisor && !companyId` er rådgiverhjemmet. Der findes ingen eksplicit tilstand at skifte mellem. Samme rod som `CompanyChatPane`, der forgrener på `isAdvisor` gennem hele filen.

**Hører i fase 3**, i samme greb som splittet — ikke som selvstændigt spor.

### Interaktiv onboarding — de første 30 dage

Hvad gør et nyt medlem i uge ét? Lige nu: prøver at uploade, fejler, og hører ikke fra nogen. Sekvensmotoren står som ikke påbegyndt, men det egentlige er oplevelsen, ikke maskineriet.

### Præsentation af sig selv i Community

Klassisk ritual i et netværk, stærkt for tilhørsforholdet. **Bør ikke være sit eget spor** — det er dag 1-3 i onboardingen. Kræver en skabelon og en tråd der tager imod, ellers poster folk i tomrummet.

### Idébank og feedback i produktet

Begge medlemsmails 22. august gik til Jonas' personlige indbakke. Ved 100 virksomheder overlever hverken han eller signalet. En knap i produktet, og en idébank hvor medlemmer kan foreslå og se hvad andre har foreslået — både support og engagement.

### Aktivitetslog pr. virksomhed

Adskilt fra fejllogning. Hvad har virksomheden gjort: uploads, opgaver, refleksioner, deltagelse. Fodrer tilstandslaget og giver rådgiveren en tidslinje i stedet for et øjebliksbillede.

### Tom-tilstande overalt

Med to tredjedele uden friske tal ser de fleste medlemmer flader der ikke kan vise dem noget. Hvad siger produktet så? Lige nu formentlig ingenting — hvilket læses som at platformen ikke virker.

### To rådgivere til hundrede virksomheder

Femogtyve gange mere pr. person end i dag. Selv med et perfekt arbejdsbord er det et produktspørgsmål før det er et værktøjsspørgsmål. Bliver svaret at I skal være flere, skal rådgiver-onboarding, rettigheder og fordeling tænkes ind nu — ikke bagefter.

**Beslutning påkrævet.**

### Peer-matching i Netværket

Brancher, størrelser, tal og udfordringer findes allerede. "Du burde tale med X" er den slags værdi et netværk kan levere som ingen enkelt rådgiver kan skalere.

### Notifikationspræferencer

Efterhånden som push, nyheder, opgaver og Community vokser, skal medlemmet kunne skrue ned. Ellers slår de det hele fra, og kanalen mistes.

### Dataeksport for medlemmet

Deres tal er deres. Både tillid og lovkrav. Lille opgave.

### Offboarding findes ikke

Ingen livscyklus når en virksomhed forlader platformen — kun hard delete. Fornyelsesbeslutningen registrerer hensigt, men udløser ingen datahåndtering.

---

## Nye spor identificeret 2026-08-22

### I ved ikke, når noget går i stykker

Ingen fejlovervågning, hverken i frontend eller i 55 edge functions. Eneste måde at opdage en fejl på er at en bruger skriver eller at nogen læser koden. To fund fra recon står som "må fejle i produktion, ikke verificeret" — netop fordi det ikke kan ses.

Dertil: ingen struktureret logning af edge functions, og restore fra backup er aldrig afprøvet.

### Platformen er for langsom

Mønsteret går igen: hent alt, filtrer i JavaScript.

- `AdvisorDashboard` henter alle samtaler, alle virksomheder og alle rapporter i én omgang
- Ulæst-tælling bygger på de seneste 500 beskeder på tværs af alle samtaler
- Ingen ydeevne-måling overhovedet — uden tal optimeres på fornemmelse
- Bundle og indlæsningstid ikke undersøgt
- Indeks ikke gennemgået systematisk (Supabase kan selv pege på det)

---

## Den ene ting, hvis alt andet glider

Få tallene ind.

To tredjedele af medlemmerne sidder i en platform der ikke kan se dem, og indtil det er løst, bygger alt andet på et fundament der ikke findes. Rådgivning uden tal er samtale. Gamification uden tal er pynt. Et tilstandslag uden tal kan kun rapportere stilhed.

De to mails 22. august er ikke supportsager. De er målingen.
