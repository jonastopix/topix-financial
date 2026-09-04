# Rådgiverens forside — design

**Besluttet 4. september 2026, middag, af Jonas i samtale med Claude,
efter at den første Hjemmebane-forside (#630, `/forside`) var set på
skærm og fundet ubrugelig.** Dette er en designbeslutning, ikke en
recon. Den er skrevet så nogen kan bygge fra den om tre uger uden at
have været med i samtalen. Hvad den IKKE afgør står i §12, og
rækkefølgen for det der skal ske står i §13.

Dokumentet **erstatter** tankegangen i `docs/raadgiverfladen-design.md`
§3.5 og §11 punkt 6, som beskriver forsiden som syv KØER. Det der står
her, står over det. Resten af rådgiverfladen-designet (virksomhedssiden,
listen, menuen, swappet) er uændret.

Grundlaget er to målinger i prod 4/9 (kl. 11:48 og 11:52, Lovable SQL
editor) og reconen `~/Downloads/recon-forsiden.md` (uden for repoet,
genskabes hvis den bruges). Hver påstand nedenfor er enten målt med
kilde, eller mærket som ikke målt.

---

## 0. Baggrunden — hvorfor dette dokument findes

Forsiden blev bygget 4/9 som syv køer under hinanden (#630, ruten
`/forside`), efter §3.5's liste, og set på skærm kl. 11:35. Den viste
**38 rækker**, hvoraf **16 sagde «ingen dialog i N dage» og intet
andet**.

Jonas' dom, ordret: «ekstremt lang, mega uoverskuelig, tæt på ubrugelig
— der er jo faktisk ingen oplysninger».

Fejlen var ikke mængden af data. Fejlen var at en **kø viser alt der
matcher en betingelse**, mens en rådgiver om morgenen har brug for at
vide **hvad han skal gøre**. En kø svarer på «hvem opfylder X?»; en
morgen svarer på «hvad tager jeg fat i først?». De er ikke det samme
spørgsmål, og den første er ikke en flade — det er et SQL-resultat med
en overskrift.

`/forside` (#630) står som råmateriale: datalaget er ét sted, køerne
findes, og motoren dømmer. Det der skal bygges om er dommen over hvad
der VISES, ikke hentningen.

---

## Målt i prod 4/9 — tallene der bærer beslutningerne

**Kl. 11:48, hændelser pr. måned de sidste seks måneder:**

| hændelse | pr. måned |
|---|---|
| refleksioner (`pulse_checkins`) | 1–7, gennemsnit ~3,4 |
| rapporter committet (`financial_report_facts`) | 20–91 |
| beskeder fra medlemmer (`messages`) | 17–87 |
| handouts gemt (`handouts`) | 2–12, og **nul i juli og september** |

**`company_actions`:** 64 `proposed`, 63 `expired`, 10 `done`, 7
`dismissed`, 1 `active`. Opgave-modellen kører, men bruges ikke — 63
udløbne mod 10 gjorte.

**`agent_proposals`:** 8 uden afgørelse.

**Kl. 11:52, refleksion i forhold til rapportering:** af dem der
rapporterer i en måned, reflekterer 12 % (marts), 36 % (april), 50 %
(maj), 67 % (juni), 50 % (juli). **Andelen stiger.** Men antallet der
rapporterer **falder**: 17, 14, 12, 9, 8 ud af tredive.

**Refleksionens form er IKKE problemet:** 20 af 24 refleksioner har alle
tre felter udfyldt; kun 1 er tom.

Hvad tallene siger for forsiden: hændelserne er FÅ — nogle få
refleksioner, en håndfuld handouts, et par snese beskeder om måneden.
Det der fyldte skærmen 4/9 var ikke hændelser; det var tilstande (§3).

---

## §1 Hvad en opgave er

**Besluttet:** en opgave er **en virksomhed, en grund og en handling**.
Ikke en observation.

«Ingen dialog i 87 dage» er en observation. «Skriv til CARMA — I har
ikke talt sammen siden juni, og de har ikke rapporteret siden juni 2025»
er en opgave: den siger hvem, hvorfor og hvad.

**Begrundelse:** det er handlingen der gør linjen værd at læse. En
observation kræver at rådgiveren selv oversætter til handling, hver
gang, for hver linje — og med 38 linjer sker det ikke. En opgave er
oversat på forhånd.

**Ordvalg (Jonas, 4/9):** vi RINGER ikke. Handlingen hedder «skriv til»
eller «tag fat i». Aldrig «ring til».

---

## §2 De otte slags

**Besluttet:** forsiden kender otte slags opgaver, med hver sin kilde.
Der er ikke flere i denne omgang; kommer der en niende, er det en
designændring, ikke en tilføjelse.

**Fra aftalen** (`companies`, `company_fornyelse`, `company_betalingslink`):
1. **Fornyelse der skal besluttes** — kontrakten udløber i vinduet, og
   der er ingen beslutning (samme dom som `FornyelsesSektion`,
   `afgoerFornyelsestilstand`).
2. **Indgang der ikke er betalt** — betalingsmail sendt, ingen betaling;
   eller prisniveau mangler (samme dom som `IndgangsSektion`,
   `afgoerBetalingsfrist`).

**Fra samtalen** (`conversations`, `messages`):
3. **Noget venter i samtalen** — medlemmet har skrevet sidst, og det de
   skrev, venter på noget. Signalet hedder reelt «hvad venter der i
   samtalen», ikke «hvem skrev sidst»: `awaiting_reply_from = 'advisor'`
   måler kun det sidste, og «tak for hjælpen» ser dér ud som en ubesvaret
   besked. Hvad der venter, læses af AI'en og vægtes af motoren — se §8.
4. **Tavshed der er blevet for lang** — ingen beskeder i lang tid, ELLER
   aldrig skrevet. Reglen fra 3/9 står: ingen må glemmes, og «aldrig
   skrevet» er den stærkeste grund.

**Fra tallene** (`financial_report_facts`, `budget_targets`):
5. **Noget stikker ud** — bankovertræk, omsætnings- eller resultatfald
   måned over måned, budgetafvigelse (motoren
   `afgoerVirksomhedsSignaler`, #589, med friskhedsgate og `momErGyldig`).
6. **Tal der stikker SÅ meget ud at det ligner en fejl i
   rapporteringen** frem for i virksomheden — en omsætning der er ti
   gange sidste måned, et fortegn der er vendt. Handlingen er en anden
   end ved 5: ikke «tag det op», men «spørg om tallet er rigtigt».

**Fra deres arbejde** (`company_actions`, `handouts`, `pulse_checkins`):
7. **En accepteret opgave der nærmer sig deadline** — vær proaktiv FØR
   den udløber, ikke efter. Målt: 63 udløbne mod 10 gjorte; i dag ser
   ingen dem før de er udløbet.
8. **Et handout der ligger halvt udfyldt, eller siger noget vi bør
   reagere på**; og **en refleksion hvor de beder om hjælp med noget der
   ikke kan vente**. De to er én slags, fordi de har samme form: et
   medlem har skrevet noget, og nogen skal læse det (§8).

**Begrundelse for kilderne:** alle otte kan læses company-nøglet af en
rådgiver i dag (målt 4/9, `~/Downloads/recon-virksomhedssidens-datalag.md`
§4), og syv af dem hentes allerede i forsidens ene datalag
(`hentAdvisorDashboard`, #630). Det der mangler er dommen, ikke data.

---

## §3 Hændelse mod tilstand — den fejl der gjorde forsiden ubrugelig

**Besluttet:** forsiden skelner mellem **hændelser**, **tilstande** og
**pukler**, og viser dem forskelligt.

- En **hændelse** sker én gang: en ny refleksion, en ny besked, en
  rapport committet, et handout gemt. Du reagerer, og den er væk.
  Hændelser står **hver for sig**, som opgaver (§1).
- En **tilstand** er sand igen i morgen: en tavshed, en manglende
  beslutning, en ubetalt indgang. Tilstande **samles til én linje**:
  «tre virksomheder har du ikke skrevet med i over to måneder».
- En **pukkel** er en ophobning, der har samlet sig over tid, fordi
  noget bliver foreslået og aldrig afgjort. **Målt i prod 4/9 kl.
  12:13:** otte agentforslag uden afgørelse, og `company_actions` med 64
  `proposed` og 63 `expired`. Det er ikke en daglig strøm. **Besluttet:
  en pukkel vises som ÉN pukkel, ikke som otte opgaver** — «otte
  agentforslag venter på din afgørelse» er én linje. Samme princip som
  tilstande, anvendt på en ophobning.

**Kendetegnet der adskiller en pukkel fra en hændelse:** puklen er
ældre end den daglige rytme, og den vokser, hvis ingen gør noget. En ny
refleksion fra i går er en hændelse; otte agentforslag fra de sidste
tre måneder er en pukkel. Det er alderen og væksten der afgør det, ikke
slagsen: ét agentforslag fra i morges er en hændelse.

**En pukkel der vokser er et signal i sig selv.** Den siger, at noget
bliver foreslået, som ingen vil bruge — 63 udløbne opgaver mod 10 gjorte
er ikke 63 forsømmelser, det er én besked om opgave-modellen (§12's
åbne punkt). Forsiden viser tallet; den skjuler det ikke ved at
gruppere det væk.

**Begrundelse, målt:** de 16 tavse fyldte forsiden 4/9, fordi ÉN
tilstand («tavs») blev vist som 16 hændelser. Ingen af de 16 linjer
sagde noget de andre 15 ikke sagde. Samlet til én linje siger den det
samme, og den siger det på ét sekund. De otte agentforslag ville have
gjort det samme som otte linjer, hvis køen havde været fyldt den dag.

En tilstand kan stadig BLIVE en opgave (§4): tavsheden hos den ene
virksomhed, der også har holdt op med at rapportere, er en opgave med
en handling — «skriv til CARMA». Det er porten der afgør det, ikke
slagsen.

---

## §4 Udvælgelsen — to porte og en sortering

**Besluttet:** en opgave kommer med på forsiden hvis den går gennem én
af **to uafhængige porte**:

- **Alvorsporten:** opgaven overstiger en alvorstærskel.
- **Vinduesporten:** opgaven har et vindue der lukker inden for **syv
  dage** — en fornyelse der skal besluttes inden slutdatoen, en
  betalingsfrist, en opgave-deadline.

To porte, fordi de to slags ikke kan måles på samme skala: et
omsætningsfald har alvor men ingen frist; en fornyelse har en frist men
ingen alvor i tallene. Med én port ville den ene slags altid tabe.

**Sorteringen** er efter alvor, faldende, med **to undtagelser der SKAL
stå i koden**:

1. **Noget der lukker inden for tre dage løftes øverst** uanset alvor.
   En frist der passerer i overmorgen kan ikke vente på at et
   omsætningsfald bliver håndteret.
2. **Flere opgaver fra samme virksomhed samles til én linje.** CARMA
   står én gang med to grunde, ikke to gange.

**Uafgjort brydes af indsats:** kan to opgaver ikke skelnes på alvor,
vinder den korteste. Indsats bryder uafgjort; den bærer ikke
rækkefølgen alene.

**Princippet bag:** alvor, hast og indsats svarer på hver sit spørgsmål
— hvor slemt, hvor snart, hvor stort. Ingen af dem må skjules af de to
andre. Derfor to porte (alvor og hast hver sin vej ind), én sortering
(alvor) med hastundtagelse, og indsats kun som sidste udvej.

**Målt 4/9 (§12):** alvorstærsklen er 70; hvad «lukker inden for syv
dage» betyder pr. slags er delvist afgjort — tre slags bærer et dagtal,
resten går gennem alvorsporten alene.

---

## §5 Hvor mange

**Besluttet:** **ingen hård grænse.** En tærskel, ikke et antal. Er der
syv alvorlige ting, står der syv; er der tre, står der tre; er der nul,
står der nul (§10).

**Rammer det tyve, er tærsklen forkert** — og fladen SIGER det
(«usædvanligt mange kræver noget i dag») frem for at skjule det bag et
loft. Et loft på ti ville gemme den ellevte, og den ellevte kunne være
den der betyder noget.

**Det der gør det skalerbart er grupperingen på virksomhed** (§4,
undtagelse 2). Ved tredive virksomheder er forskellen mellem grupperet
og ugrupperet lille; ved halvtreds er det forskellen mellem femten
linjer og femogtredive.

**Under stregen:** ikke en liste, men **to tal**:
- «ni andre virksomheder har noget mindre presserende»
- «tre du ikke har skrevet med i over to måneder»

Tallene er links til `/virksomheder` (listen kan sorteres på det).
Begrundelse: det der ikke gik gennem porten skal stadig kunne findes,
men det skal ikke fylde. Et tal fylder én linje uanset om det er tre
eller tredive.

---

## §6 Linjen og handlingen

**Besluttet:** **hele linjen er ét link** til `/virksomhed/:companyId`.
Ikke knapper pr. grund, ikke «Åbn chat» ved siden af «Se virksomhed».

**Begrundelse:** virksomhedssiden kan nu alt — chatten i fuld højde
(#614), tallene (#611, #624), rapporterne (#616), aftalen (#607) — så
der er ét sted at lande, og det er dét. To knapper pr. linje var
nødvendige da chatten lå på `/chat` og tallene på MemberDetail. Det er
de ikke længere.

**Kravet det stiller til virksomhedssiden:** grunden skal følge med i
klikket og lande **øverst i blok 1** som «derfor er du her», med sin
handling — «Skriv til CARMA: I har ikke talt sammen siden juni». Samme
mekanik som `?reportId`, `?handout` og `?section` (#619): en parameter i
URL'en, læst én gang ved mount, ryddet bagefter. Siden **skifter ikke
form** efter hvor man kom fra — kun toppen af blok 1 gør.

**Ikke afgjort:** parameterens navn og form (§12 nævner det ikke; det er
en byggedetalje der afgøres når dommen findes).

---

## §7 Når noget er gjort

**Besluttet:** forsiden er et **spejl**. En linje forsvinder fordi
grunden er væk — beskeden er besvaret, beslutningen er truffet,
rapporten er committet — ikke fordi nogen kvitterede. **Ingen
«klaret»-knap.**

**Begrundelse:** en «klaret»-knap ville skabe en tilstand der ikke
findes i data («rådgiveren siger det er klaret») ved siden af den der
gør («beskeden er besvaret»). De to ville drive fra hinanden, og
forsiden ville lyve den dag nogen klikkede «klaret» uden at svare.

**Undtagelsen:** **«Ikke relevant»** skjuler en linje man er uenig i.
Den findes, fordi en dom kan være forkert for netop denne virksomhed i
netop denne uge, og rådgiveren skal kunne sige det uden at handle.

**Læringen — en regel der SKAL stå:** et fravalg gemmes med
**signaltype, virksomhed, tidspunkt og valgfri note**, og bruges til
præcis TO ting:

1. at skjule den ene linje nu;
2. at **måle om en signaltype systematisk fravælges**.

**Læring på SIGNALTYPE gør motoren klogere. Læring på VIRKSOMHED gør
den blind.** En motor der lærer at tie om en bestemt virksomhed, bliver
stille om præcis det der er ubehageligt — og reglen fra 3/9 er at ingen
må glemmes. Derfor bruges fravalget ALDRIG til at dæmpe den enkelte
virksomhed fremadrettet.

En signaltype der fravælges i fx 80 % af tilfældene er **en fejl i
dommen** og rettes **i koden med en begrundelse** — ikke af en model
der stille skruer ned. Det er målingen der driver rettelsen; den
skrives ind i dommen af et menneske, som en beslutning med dato.

**Ikke målt:** hvor mange fravalg der skal til, før et mønster tæller.
Med 3–7 refleksioner om måneden er tallene små; det afgøres når der er
data.

---

## §8 AI'ens rolle

**Besluttet:** **fire af de otte slags afgøres med en regel alene** —
datoer og tal: fornyelse, indgang, tavshed, tal der stikker ud. Der
skal ingen model til; dommen er deterministisk og testes som ren
funktion.

**Fire kan ikke afgøres med en regel alene:** en rapporteringsfejl (§2
slags 6), en refleksion der beder om akut hjælp, et handout der siger
noget vi bør reagere på (§2 slags 8) — og **det der venter i samtalen**
(§2 slags 3, rettet 4/9, nedenfor). Her læser AI'en teksten og siger
**hvad der står** — «medlemmet skriver at de ikke kan betale løn næste
måned» — så motoren kan dømme på det. AI'en dømmer ikke selv; den
oversætter tekst til noget dommen kan læse.

**Samtalen — rettelsen 4/9, og hvorfor.** Jonas: et medlem der skriver
«tak for hjælpen» ser i data ud som en ubesvaret besked.
`awaiting_reply_from = 'advisor'` måler **hvem der skrev sidst**, ikke
om der venter noget. Den første idé var at lade AI'en **nedgradere**
«venter på svar», når beskeden er en afslutning. Den blev **forkastet**
af to grunde:

1. Den løser kun den ene halvdel. Det modsatte tilfælde — en lang, rolig
   besked der i virkeligheden er et råb om hjælp — skal **løftes**, ikke
   sænkes, og en nedgradering kan ikke løfte.
2. En model der lærer at genkende afslutninger, lærer også at slukke
   for de øjeblikke hvor en samtale kunne være fortsat. Det er præcis
   den tavshed §7 forbyder.

**Besluttet i stedet:** AI'en dømmer ikke om samtalen er slut, men om
**hvad der venter**. Den læser den sidste besked og siger hvad den er —
**et spørgsmål, en bekræftelse, en afslutning, eller noget der beder om
hjælp**. Den vurdering afgør vægten i **begge** retninger: en afslutning
falder under tærsklen, et spørgsmål bliver stående, noget der beder om
hjælp løftes øverst uanset alder.

Det bryder ikke reglen nedenfor: modellen tilføjer stadig kun
information — den fortæller hvad der står, og motoren dømmer. Den
fjerner ingenting; det er tærsklen (§4) der lader en afslutning falde
igennem, ikke modellen.

**Sidegevinst:** samme vurdering hører hjemme på virksomhedssiden.
«Sidste besked: Flemming spørger om likviditet» er mere værd end «1
ulæst besked» — i blok 1 og over chatten i blok 4.

**Hvornår den læser — to jobs, ikke ét:**
- **Ved hændelsen**, for det akutte: en ny refleksion skal ses samme
  dag. Udløses når rækken skrives, ikke når nogen kigger.
- **Om natten**, for mønstrene: «de har skrevet om likviditet tre
  måneder i træk». Et batchjob over det der er kommet til.
- **Aldrig ved sidevisning.** Samme regel som sessionsforberedelsen
  (#612): et AI-kald pr. visning er dyrt og uventet, og resultatet ville
  være forskelligt fra gang til gang.

**Reglen der står fast: en AI-analyse må TILFØJE en opgave, aldrig
FJERNE en.** En ny refleksion giver ALTID en opgave («læs Bastants
refleksion»); AI'en afgør kun om den står øverst med et resumé, eller
under stregen som «tre refleksioner venter». Den kan løfte; den kan ikke
sænke under grunden.

**Begrundelse:** en model kan fejle på to måder. Den kan råbe op om
noget harmløst — det ser rådgiveren og fravælger (§7). Eller den kan tie
om noget alvorligt — det ser rådgiveren **aldrig**. Den dag en model
overser «jeg kan ikke betale løn næste måned» fordi det var roligt
formuleret, er skaden ikke en dårlig flade; det er et medlem der bad om
hjælp og ikke fik den. **Målt:** refleksioner koster 3–7 linjer om
MÅNEDEN, så reglen er gratis. Prisen for at vise dem alle er en linje
hver anden uge; prisen for at overse én er ikke til at måle.

---

## §9 Flere rådgivere

**Besluttet (Jonas, 4/9):** tildeling af **OPGAVER, ikke af
virksomheder**. «Den her tager mig af, den skal du ikke røre ved» er
ikke måden vi arbejder. En opgave har en afslutning; en virksomhed har
ikke.

**Mekanikken — og den er vigtig:** en udledt opgave har **ingen
identitet**. Den findes kun så længe grunden gør (§7, spejlet). Tildelingen
må derfor ikke gøre den til en ting med eget liv. Løsningen: hver
opgave har en **stabil nøgle — virksomhed + signaltype** — og
tildelingen er **en lille række** med den nøgle, en rådgiver og et
tidspunkt. Forsvinder grunden, ryddes rækken; ingen har en opgave der
ikke findes.

**Det giver tre ting:**
- **Tag en opgave** — linjen markeres «Jonas er i gang», så to ikke gør
  det samme.
- **Giv den videre** — «Morten er bedre til det her»; rækken skifter
  rådgiver.
- **Løs den** — grunden forsvinder, linjen forsvinder hos begge, af sig
  selv.

**Utagne opgaver er alles (Jonas, 4/9).** Der er ingen «mine» og
«dine» før nogen har taget. Det skalerer til fem rådgivere, fordi alle
kan se hinandens hænder — hvem der er i gang med hvad — uden at nogen
ejer en virksomhed.

**Forskellen til i dag:** `conversations.assigned_advisor_id` tildeler
en SAMTALE (og dermed i praksis en virksomhed) varigt. Det rører
designet ikke ved nu; det står som åbent punkt om det skal bestå ved
siden af opgavetildelingen, eller afløses (§12).

---

## §10 Toppen

**Besluttet:** toppen siger **antallet af opgaver**, ikke signaler:
«Syv ting kræver dig i dag.» Syv opgaver, efter gruppering på
virksomhed (§4) — ikke syv signaler, som kan være tre virksomheder.

**Og på en god dag:** «Der er ikke noget der haster i dag.»

**Begrundelse:** **en forside der aldrig kan være tom, bliver aldrig
troet.** Hvis der altid står noget, læser man det ikke. Hvis der en dag
står nul, ved man at de andre dage betød noget. Det er derfor tilstande
samles og porten er en tærskel (§3–§5): så nul er et muligt svar.

Under stregen står de to tal (§5), også på den gode dag — «ni andre har
noget mindre presserende» er ikke en opgave, det er et overblik.

---

## §11 Hvad der ikke kommer på

- **«Positive muligheder» som liste.** «Omsætningen steg 11 %» er ikke
  noget en rådgiver skal kommentere; det er ikke en opgave (§1). Det
  gode nyt hører til på virksomhedssiden i blok 5, hvor tallene står
  med kontekst. Bunken findes i datalaget (#630) og skæres ikke i koden
  før dommen er bygget, men den vises ikke på forsiden.
- **«Alle virksomheder»-tabellen.** Den er `/virksomheder` (#605), med
  de syv felter og søgning. To lister over de samme tredive er én for
  meget, og forsidens udgave havde egen sorteringslogik (ulæste 100 +
  needsAttention 50 + …) som ingen andre steder findes.
- **Rådgiver-chips** («Jonas 12 · Morten 9 · 3 uden ejer»). De tæller
  samtaletildelinger, ikke opgaver, og §9 vender tildelingen om. Når
  opgavetildelingen findes, viser linjerne selv hvem der er i gang.
- **`activityFeed`** («rapport uploadet · tal godkendt», 14 dage). Bygges
  i datalaget, læses ingen steder (målt 4/9, `recon-forsiden.md` §1).
  En feed er en kø af hændelser uden handling — præcis det §3 tager
  afstand fra. Rapporter committet er allerede slags 5/7's grundlag.
- **`AdvisorBroadcast`.** Importeres, rendres ikke i dag (målt 4/9), og
  kan ikke nås fra nogen flade. Det er et selvstændigt åbent punkt om
  hvor broadcast hører til — ikke forsidens, og ikke dette dokuments.

---

## §12 Det der ikke er afgjort

- **Rapporteringen falder** (17 → 8 der rapporterer, marts–juli, ud af
  tredive). **Undersøges IKKE nu.** Circle-exit, nye medlemmer og en
  samlet platform ændrer forudsætningerne, så en analyse af juni ville
  beskrive en verden der forsvinder. Tages efter flytningen — med
  tallene fra §«Målt» som nulpunkt.
- **Refleksionens tre spørgsmål.** Formen er ikke akut (20 af 24
  udfylder alt), men bør gentænkes **sammen med opgave-modellen**: 63
  udløbne opgaver og en refleksion der ikke fører til noget er
  formentlig samme problem set fra to sider — medlemmet skriver, og der
  kommer ikke noget tilbage.
- **Hvordan «ligner en rapporteringsfejl» afgøres** (§2 slags 6) — en
  tærskel på forholdet mellem to måneder, et fortegnsskift, eller
  AI-læsning (§8). Ikke målt hvor ofte det sker.
- **Hvad «lukker inden for syv dage» dækker for hver slags** (§4) —
  DELVIST afgjort, målt 4/9 (`~/Downloads/recon-forsidens-dom.md` §3,
  uden for repoet — genskabes hvis den bruges). Det de rene funktioner
  bærer ud i dag:
  - *Fornyelse:* `afgoerFornyelsestilstand` giver `dage_til_udloeb`
    (hele UTC-kalenderdage til `contract_end_date`, negativ efter).
    Vinduet åbner ved ≤ 60 dage (`FORNYELSES_VINDUE_DAGE`); «lukker inden
    for syv» er ikke en tilstand i funktionen, kun et tal kalderen kan
    læse. **Kan bruges direkte.**
  - *Indgang:* `afgoerBetalingsfrist` giver `dage_siden_underskrift`;
    fristen er `underskrevet_at + 30` (`BETALINGSFRIST_DAGE`), dag 31 er
    `frist_overskredet`. Dage TILBAGE regnes ikke af motoren —
    `IndgangsSektion` regner selv `30 − dage_siden`. **Kan bruges, men
    dommen skal selv vende tallet.**
  - *Opgave nær deadline:* to ure. `due_date` (date, kun aktive) —
    `opgaveEngine` kender KUN «forfalden» (dagen efter), ikke «nærmer
    sig»; ingen funktion svarer på «dage til due_date». `expires_at`
    (timestamptz, kun forslag) er sat ved oprettelse. **Mangler: et
    dagtal for aktive opgaver — dommen skal regne det selv af `due_date`.**
  - *Tavshed:* «vinduet» er `dage > 21` og åbent for evigt derefter;
    ingen øvre grænse. Ingen «lukker om N dage» — slagsen går kun
    gennem alvorsporten.
  - *Noget stikker ud:* friskhedsgaten (`isFiguresFresh`, tre
    kalendermåneder) er en åbning, ikke en lukning. Kun alvorsporten.
  - *Ulæst besked:* intet — `ulaeste_beskeder` er et antal uden alder på
    den ubesvarede besked (`senesteBeskedAt` bruges kun i
    tavshedsgrenen). **Mangler: alderen på det der venter.**
  - *Rapporteringsfejl* og *handout/refleksion:* intet vindue, for
    signalerne findes ikke (nedenfor). Refleksionens `created_at` måles
    i dag kun mod 30 og 60 dage som «har afleveret puls»; `help_needed`
    læses ingen steder i en dom.
  Dommen (§13) skal derfor definere vinduesporten pr. slags ud fra tre
  eksisterende dagtal (fornyelse, indgang, opgave) og lade de øvrige gå
  gennem alvorsporten alene.
- **Samtaletildelingen** (`assigned_advisor_id`) ved siden af
  opgavetildelingen (§9): består, afløses, eller bliver en standard for
  «hvem tager først».
- **Parameterens form** for «derfor er du her» på virksomhedssiden (§6).

### Afgjort 4/9 — målt i koden (`~/Downloads/recon-forsidens-dom.md`)

- **Alvorstærsklen er 70.** Ikke et nyt tal — huset bruger det
  allerede: både `VirksomhedView.tsx:176` og
  `RaadgiverForsideView.tsx:70` farver et signal rust ved `alvor >= 70`
  og dæmpet under 50. Fladen sagde altså «vigtigt» ved 70, før dommen
  fandtes; dommen gør den eksisterende visningsgrænse til porten.
  Regnet på dagens data giver 70 omkring syv til ni linjer: én for de
  tavse (samlet), fire ulæste, to virksomheder der stikker ud, én
  opgave nær deadline, én pukkel. Måles mod de 38 rækker fra 4/9 når
  dommen står (§13 pkt. 2).
- **Motoren har alvor for kun to og en halv af de otte slags — og det
  ændrer omfanget.** Tavshed (`aldrig_skrevet` 95, `ingen_dialog` en
  kurve mod 95) og «stikker ud» (bankovertræk 90, omsætningsfald 80,
  resultatfald 70, budget 50/40) er fuldt dækket. Ulæste beskeder
  findes som et ANTAL (70 + antal, loft 20), ikke som «hvad der
  venter». Fem slags har INGEN alvor: fornyelse og indgang har egne
  motorer, men de giver en TILSTAND og et DAGTAL —
  `afgoerFornyelsestilstand` returnerer `{status, dage_til_udloeb,
  tier}`, `afgoerBetalingsfrist` returnerer `{status,
  dage_siden_underskrift, paamindelse_forfalden}`. Rapporteringsfejl,
  opgave nær deadline og handout/refleksion har ingenting overhovedet.
  **Konsekvens:** dommen kan ikke bare samle det der findes — den skal
  tildele alvor til nye slags. Første bud står som navngivne konstanter
  i `src/lib/forsidensDom.ts` med begrundelse, sat mod den eksisterende
  skala, og justeres når fladen er set.
- **Afgrænsning, som beslutning:** dommen bygges for SEKS af de otte —
  tavshed, stikker ud, ulæst besked, fornyelse, indgang, opgave nær
  deadline. De to AI-baserede (rapporteringsfejl, handout/refleksion)
  får plads i typen, men ingen implementering; de hægtes på når §8's
  AI-læsning findes. Grunden: de kan ikke bygges uden en model, og de
  øvrige seks kan bygges nu.

### Noter, målt 4/9 — skal have et svar før dommen er færdig

- **Motoren har to signaler §2 ikke nævner:** `agentforslag_venter`
  (alvor 55) og `friske_tal` (30). De skal enten have en plads i §2 —
  som en slags eller som del af en — eller en begrundelse for at stå
  udenfor. Uafgjort.
- **Budget-signalerne kan ikke opstå på forsiden i dag:** på forsiden
  er `budgetOmsaetning: null`, fordi `hentAdvisorDashboard`s `queryFn`
  ikke henter `budget_targets`. Det er allerede et åbent punkt i
  OVERLEVERING, men det rammer §2 slags 5 direkte — «budgetafvigelse»
  står der som del af slagsen, og dommen får aldrig inputtet, før
  datalaget henter det.

---

## §13 Rækkefølgen

1. **Designet først** — dette dokument. Det er gjort.
2. **Dommen som ren funktion med tests** — motor før flade, som
   `afgoerVirksomhedsSignaler` (#589). Funktionen tager alle otte slags
   som input (de fem regelbaserede fra data, de tre AI-læste som
   tekst-udsagn) og giver de valgte opgaver: gennem porterne (§4),
   grupperet på virksomhed, sorteret, med tilstandene samlet (§3) og de
   to tal under stregen (§5). Testene låser porterne, de to
   sorteringsundtagelser, grupperingen og reglen om at AI kun tilføjer
   (§8). **Dommen måles mod 4/9's 38 rækker før fladen bygges.**
3. **Fladen** — først derefter. `/forside` (#630) står som råmateriale
   indtil da: datalaget (`hentAdvisorDashboard`, ét sted for begge
   forsider) genbruges; det er visningen der skiftes ud.
4. **Fravalg og tildeling** (§7, §9) er hver sin lille tabel og hver sin
   PR, efter fladen — de har ingen værdi før der er linjer at fravælge
   og tage.

Rækkefølgen følger de tre principper fra rådgiverfladen-designets §11:
motor før flade, én kilde før to aftagere, de billige forudsætninger
før de dyre ombygninger.
