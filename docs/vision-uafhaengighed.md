# Visionen: det selvkørende rådgivningshus

Skrevet af Claude 29/9-2026 kl. 23, på Jonas' bestilling. Kl. 22:32–22:48 skrev han: «Vi skal bygge den vildeste platform Danmark nogensinde har set», «Vi har en ambition om at gøre os mere eller mindre uafhængig af tredjeparts software. Vi skal presse tingene to the limit» og «du må gerne bidrage til at tænke stort og ambitiøst».

Grundlaget er syv analyser i `docs/analyser-30-09/`. Hver af dem skelner mellem fund og vurdering, og hver har kilder. Dette dokument samler dem og tager stilling.

**Status:** forslag. Intet af det nedenfor er bygget eller besluttet, og alt, der er nyt, venter på Jonas (regelsæt §4a).

---

---

## 0. Rettet 30/9 efter Jonas' dom (29/9 kl. 23:27)

Jonas: «Jeg er ikke tilfreds med dine recons … Du overestimere ekstremt meget altid … Ikke altid lyseslukker … Vi vil hæve barren, ikke sænke den.» Det, dokumentet nedenfor tog fejl af:

| Spor | Hvad jeg skrev | Hvad der gælder nu |
|---|---|---|
| 1 Bogholderi | «Kun forslag, et menneske bogfører» | **Fuld automatik:** agenten indhenter bilag, afstemmer og bogfører selv i e-conomic inden for værn (tillidsscore, beløbslofter, dagligt afstemningsbevis, nødstop, modpostering). Jonas har ansvaret og godkender procedure, kontoplan og lofter ÉN gang. Bank: Nordea via Enable Banking. Design: `analyser-30-09/bogholderi-agent-design.md`. |
| 3 Sunset | «Ikke klar» | Flowet er bygget. Afrundingen er få klik (`analyser-30-09/klaviyo-klik.md` §4). |
| 4 Webinarmotor | «6–9 uger, byg efter 13/10, gevinsten er ikke pengene» | **Bygges nu** som husets primære lead-motor, med alle data in-house og egen branding. Skive 1 (motor) #1158 og skive 2 (seerens flade) #1161 er bygget 30/9 om natten. Den kører ikke 13/10; derefter parallelkørsel. Spec: `analyser-30-09/webinarmotor-spec.md`. |
| 6 Gamification | En liste over, hvad vi ikke skal | **Idélisten** (Jonas: «Mange gode idéer»). Medlemmer: Boardroom Score 0–1000, niveauer låst op af rigtige resultater, tal-streak, anonyme kvartalsligaer, trofæskab, 30-dages udfordringer, forecast-duel, hjælper-karma, rejsekort, Boardroom Awards. Rådgivere: svartids-ur (bygget #1164), «Intet venter»-streak, kontaktdækning, én-klik-tommel, svartid live på medlemssiden, rådgiverens score = medlemmernes fremgang. |

Rammen fra 13/8 («ingen rangeringer») er ikke en grænse for idéerne. Den er en beslutning, Jonas kan tage om igen.

---

## 1. Ambitionen i én sætning

**The Boardroom driver sig selv: marketing, webinarer, bogføring og drift kører på platformens egne motorer og data, så husets mennesker bruger deres tid på medlemmerne og intet andet.**

Uafhængigheden er ikke målet i sig selv. Den er et middel til tre ting:

1. **Vi ejer dataene hele vejen**, fra annonce over webinar, ansøgning og medlem til fornyelse. Kun sådan kan vi regne den rigtige pris pr. medlem og værdien af et medlem, og kun sådan kan en motor optimere på medlemmer frem for klik.
2. **Oplevelsen er vores.** Medlemmet møder én platform, ikke seks leverandørers sider.
3. **Faste udgifter bliver til kode.** Det gælder bogholder, Meta-konsulent og eWebinar.

**Tommelfingerreglen for byg eller køb:**
- **Byg selv**, hvor data eller oplevelsen er kernen: webinar, community, referater, marketingmotoren og rådgiverens arbejdsflade.
- **Behold leverandøren**, hvor den er ren infrastruktur eller et lovkrav:
  - Mailgun (levering)
  - Bunny (video)
  - Stripe (betaling)
  - e-conomic (det registrerede bogføringssystem, som loven kræver)
- **Automatisér omkring dem**, i stedet for at erstatte dem.

---

## 2. De syv spor

Hvert spor har samme form: hvor vi står, hvad der vindes, den ærlige hage og det første skridt.

### Spor 1 — Bogholderiet kører selv (`analyser-30-09/bogholderi-automatisering.md`)

- **Hvor vi står:** der er ingen kode. Selskabet bogfører i e-conomic med en ekstern bogholder.
- **Gevinsten:** bogholderens honorar forsvinder, og der kommer en månedsrapport, der er klar den 3. i måneden, ikke den 20.

**Den ærlige hage:**
- **e-conomic kan selv mere, end vi troede.** Det har bankfeed, automatisk matching og en bilagsmail, og Smart-pakken (399 kr./md.) aflæser bilag og foreslår kontering. Første skridt er at slå det til og måle, før vi bygger.
- **Enable Banking er næppe nødvendig i fase 1.** Et selskab skal have en kontrakt, og prisen oplyses kun på forespørgsel. e-conomics eget bankfeed er gratis.
- **Loven:** e-conomic skal være det ENESTE sted, hvor posteringer og bilag gælder. Selskabet skal også have en skriftlig beskrivelse af sine bogføringsprocedurer. Vores motor laver derfor kun forslag, og et menneske trykker «bogfør». API'ets endepunkt til at bogføre en kladde spærres i koden.
- **Skøn kan ikke automatiseres:** periodisering, afskrivninger, skat og renten på ejerlån (sædvanlig markedsrente, jf. LL § 2) er revisors bord.
- **Et forældet fund i spørgsmålet:** selskabslovens forbud mod anpartshaverlån (§§ 210–212) blev ophævet 1/1-2025. Skattereglen i LL § 16 E gælder stadig.

**Rækkefølgen:**

| Fase | Hvad | Omfang |
|---|---|---|
| 0 | Slå e-conomics egne funktioner til, én bilag@-adresse, og mål hvor meget de klarer | 1 uge |
| 1 | En fejlfinder, der kun LÆSER den nuværende bogføring: dubletter, manglende bilag, momsfejl, saldo mod bank | 2–3 uger |
| 2 | Konteringsforslag i kladden (leverandør → konto og moms), målt på hvor tit forslaget bogføres uændret | 3–5 uger |
| 3 | Månedslukning, månedsrapport og revisorpakke | 2–3 uger |

- **Opsigelsen af bogholderen:** når tre måneder er lukket uden bemærkninger fra revisor, og revisor har godkendt procedurebeskrivelsen og kontoplanen.
- **Det skal Jonas tjekke NU:** bogholderens opsigelsesvarsel. Det sætter den reelle tidsplan.

**Mit eget forslag:** motoren skal bo i et eget, lille Supabase-projekt, ikke i The Boardroom-platformen. Selskabets regnskab og medlemmernes data må aldrig dele database eller nøgler.

### Spor 2 — Marketingmotoren: Meta 100 % selv (`analyser-30-09/meta-automatisering.md`)

- **Hvor vi står:** mere end man skulle tro.
  - Forbrug pr. annonce hentes dagligt.
  - Egne konverteringer (Lead, Kvalificeret, Schedule og Purchase) sendes tilbage til Meta.
  - Sporet fra annonce-id til tilmelding, ansøgning og betaling findes (581 af 597 tilmeldinger havde `fbclid`).
  - Statistikkoden med Wilson-intervaller findes.
  - Der er INGEN skrivevej til Meta.
- **Gevinsten:** konsulenthonoraret, og en motor der optimerer på ansøgere og medlemmer frem for på klik.

**Den ærlige hage:**
- **Statistikken er tynd.** En annonce giver forventet ca. 0,56 ansøgere pr. webinar. Motoren kan derfor kun styre på tilmelding og fremmøde, mens ansøgning og medlem bruges til kalibrering.
- **Kreativ strategi og eksperimentdesign er menneskeligt arbejde.** Motoren kan overtage driften, men den kan ikke finde på den næste gode vinkel.
- **Et løfte, vi har givet:** topix.dk lover «Selve din tilmelding deler vi ikke med Meta» (`docs/tracking.md:187`). Custom audiences af tilmeldte bryder det løfte, så de er ude, medmindre teksten og samtykket ændres først.

**Faser:**

| Fase | Hvad |
|---|---|
| 0 | Hent al historik, og få Ads Manager-tallene ind i repoet |
| 1 | Daglig rapport og forslag, kun læsning |
| 2 | Automatisk pause af dårlige annoncer inden for lofter, tidligst efter to webinarer med data |
| 3 | Budgetflytning mellem eksisterende adsæt (højst 20 % pr. skridt, mindst 3 dage imellem) |
| 4 | Kreativforslag som udkast til godkendelse |

**Sikkerhed:**
- Ingen budgetforhøjelse og ingen ny kampagne uden Jonas.
- `spend_cap` på annoncekontoen er den ydre bremse.
- Skrivelåsen er slukket som standard.

**Konsulenten** opsiges, når fase 2 har kørt to webinarer uden at motoren har taget en forkert beslutning. Det er mit forslag til kriteriet.

### Spor 3 — Email marketing og Klaviyo (`analyser-30-09/klaviyo-gennemgang.md`)

- **Hvor vi står:**
  - Hovedlisten har 3.122 profiler.
  - 3.807 profiler kan modtage markedsføring, men kun 1.743 har aktivt samtykke. 2.064 har aldrig sagt ja.
  - Velkomstserien er LIVE, så mangelliste-kortet om den er forældet.
- **Gevinsten:**
  - lovlig og ren liste
  - lavere Klaviyo-regning (417 døde profiler kan måles)
  - flows, der måles på ansøgninger frem for oppustede åbninger

**Sunset-flowet går live 14/10 og er ikke klar.** Det har tre fejl:
- Det udelukker ikke medlemmerne.
- Det udelukker ikke deltagerne fra 13/10.
- Mail 3 lover «Jeg tager dig af listen i morgen», men intet afmelder.

Rettelserne står i rapportens §0 punkt 5. De skal laves før 14/10, og Jonas skal sige ja først.

**Retningen på sigt:** Klaviyo bliver ved, så længe den er billigere end det, vi selv skal bygge. Platformen sender allerede webinarmails selv gennem Mailgun. Næste naturlige skridt er, at platformens egne hændelser styrer ALLE livscyklusmails. Så er Klaviyo et udsendelsesværktøj, vi kan skifte, og ikke hjernen.

### Spor 4 — Egen webinarmotor i stedet for eWebinar (`analyser-30-09/webinar-og-referater.md` del A)

- **Hvor vi står:** eWebinar er kilden til fremmøde, `set_procent`, kalenderfil og join-link. Påmindelsesmailene sender vi allerede selv.
- **Gevinsten:** ikke pengene. $99 om måneden er ca. 1.200 USD om året, og motoren er 6–9 ugers arbejde. Gevinsten er, at webinaret bliver en del af platformen:
  - CTA'en går direkte til ansøgningen med tilmeldingen udfyldt
  - spørgsmål går direkte til rådgiverens chat
  - fremmøde og sete minutter ligger i vores egen tabel
  - Meta-pixlen sidder på vores egen side

**Den ærlige hage:**
- **Bunny kan ikke slå spoling fra.** «Simuleret live» kan kun håndhæves blødt: serverstyret ur, offset og overlay.
- **Allerede tilmeldte har eWebinars links.** Derfor skal vi køre parallelt, og eWebinar kan tidligst opsiges efter den sidste session med dem.

**Mit forslag:** byg den EFTER 13/10, og kør den første egne session parallelt med en eWebinar-session. Den største værdi ligger i koblingen til ansøgningen og chatten, ikke i besparelsen.

### Spor 5 — Referater og optagelser automatisk (`analyser-30-09/webinar-og-referater.md` del B)

- **Hvor vi står:**
  - Live sessions holdes i Google Meet.
  - Optagelsen knyttes til eventet i hånden (`events.recording_item_id`).
  - Der findes ingen transskription og intet referat.
- **Gevinsten:** stor for medlemmerne. Hver live session bliver til et referat med bullets og en optagelse på eventet samme dag. Det bliver et bibliotek, der vokser af sig selv, og det er en grund til at forny.

**Den ærlige hage:**
- **Meets egne transskripter dækker ikke dansk.** Transskriptionen skal ske hos os.
- **Dansk tale er svært:** Whisper har ca. 27,5 % CER, og Røst (dansk fintunet) ca. 11,6 %.
- **GDPR:** deltagerne skal informeres om optagelse og AI-behandling.

**Første skridt:** en måling af transskriptionskvaliteten på tre rigtige optagelser. Derefter en MVP på 6–8 dage med manuel upload, LLM-udkast og rådgiverens godkendelse, før noget udgives. Automatisk hentning fra Meet koster 5–8 dage mere.

### Spor 6 — Gamification for medlemmer OG rådgivere (`analyser-30-09/gamification-analyse.md`)

- **Hvor vi står:**
  - Et point- og niveausystem blev seedet i februar og slettet 13/9, fordi ingen flade læste det.
  - Rammen fra 13/8 (`BACKLOG.md:1486-1505`) forbyder rangeringer og scoreboards. Den strider mod Jonas' «konkurrencemennesker», så **Jonas skal afgøre det først**.
  - Rådgivernes svartid kan beregnes fra `messages`. Chatten lover medlemmerne «Vi svarer typisk inden for 24 timer» (`MemberChatPane.tsx:998`), men intet måler det.
- **Gevinsten:** medlemmer, der har noget at jagte, og et hus, der kan se, om det holder sit løfte.

**Min anbefaling:**
- **Medlemmer:**
  - konkurrencen står mod sig selv først: rytme, rejse, holdte skridt
  - anonymt mod huset senere (kun ved mindst 5 i sammenligningen)
  - aldrig en navngiven rangliste mellem konkurrerende virksomheder
- **Rådgivere:** svartid og ældste ubesvarede som teammål, internt og synligt hver dag. Der er to rådgivere, så en personlig rangliste er en duel. Et fælles mål presser mere.

**Første skive:** et svartidskort på rådgiverforsiden. Det kræver ingen migration, og målingen skal vise, at der er nok spørgsmål.

### Spor 7 — Community og netværk (`analyser-30-09/community-analyse.md`)

- **Hvor vi står:**
  - Medlemmerne kan IKKE skrive til hinanden.
  - Et svar når kun trådens forfatter.
  - Senest målte brug var tynd: 3/9 var der seks tråde og to svar.
  - Circle har ingen kode tilbage.
- **Gevinsten:** det, et medlem ikke kan få andre steder, er de andre medlemmer. Det er det uforløste potentiale.

**Den ærlige hage:** et tomt rum dræber et community hurtigere end et manglende. At bygge funktioner før medlemmerne taler sammen, er at bygge et tomt rum med flere døre.

**Mit forslag:**
1. Mål først.
2. Kør derefter en **manuel pilot i 4 uger uden kode.** Jonas og Morten laver 4–6 introduktioner og ét matchet spørgsmål om ugen via `@`-nævnelse.
3. Viser piloten, at medlemmerne vil tale sammen, bygges «Bed om intro» (S) og «Spørg mig om / leder efter» i kataloget (S).

---

## 3. Det store greb: Boardroom-motoren

De syv spor hænger sammen. Kobles de, bliver platformen noget, ingen anden i Danmark har. **Hvert medlem får hver måned en færdig bestyrelsespakke, lavet af platformen og redigeret af rådgiveren på 10 minutter.** Pakken består af:

- **Tallene:** nøgletal, udvikling og afvigelser, fra månedstallene.
- **Det, der er sagt:** referatet og bullets fra de sessioner, medlemmet deltog i (spor 5), og de beslutninger, der står i chatten.
- **Det, der skal ske:** opgaver og milepæle, og hvad der er holdt siden sidst (spor 6).
- **Hvem de skal tale med:** den ene introduktion til et andet medlem, der har været igennem det samme (spor 7).

Det er ikke en funktion. Det er produktet, og det er grunden til at forny.

**Og for huset selv:** det samme greb vendt indad. Topix får et **daglig drift-kort**, samlet ét sted:
- banksaldo og månedens bogføringsstatus (spor 1)
- MRR og fornyelser fra Stripe
- tragten fra annonce til medlem med pris pr. led (spor 2–4)
- svartiden (spor 6)
- listehygiejnen (spor 3)

Jonas åbner én side om morgenen og ved, hvordan huset har det.

---

## 4. Rækkefølgen, jeg foreslår

Princippet er at måle før vi bygger, at datoerne kommer først, og at det, der sparer penge eller giver medlemmet mest, kommer derefter.

**Nu, i uge 40–41 (før og omkring 13/10):**
1. **Klaviyo Sunset rettes før 14/10**, efter Jonas' ja. Det har en dato og en lovside.
2. **Bogholderi fase 0:**
   - e-conomics egne funktioner slås til.
   - Jonas tjekker bogholderens opsigelsesvarsel.
   - Revisor får spørgsmålene fra rapportens tjekliste.
3. **Meta fase 0:** historikken hentes, og Ads Manager-tallene lægges ind.
4. **Målingerne i Lovable** for gamification og community (SQL står klar i rapporterne).

**Efter 13/10:**

5. Referat-MVP (spor 5), efter målingen af transskriptionen.
6. Svartidskortet til rådgiverne (spor 6).
7. Community-piloten, manuelt i 4 uger (spor 7).
8. Bogholderi fase 1, den læsende fejlfinder.

**Q4:**

9. Meta fase 1–2 og bogholderi fase 2–3.
10. Egen webinarmotor, med parallelkørsel mod eWebinar.
11. Boardroom-motoren: den første bestyrelsespakke til 3 pilotmedlemmer.

---

## 5. Beslutninger, der venter på Jonas

| # | Beslutning | Hvor |
|---|---|---|
| 1 | Konkurrence: kun mod sig selv, anonymt mod huset eller navngivet? Rammen fra 13/8 forbyder rangeringer. | spor 6 |
| 2 | Sunset: rettelserne før 14/10, og om afmeldingen skal være automatisk eller manuel | spor 3, Klaviyo §0 |
| 3 | De 2.064 profiler, der aldrig har sagt ja | spor 3, Klaviyo §0 punkt 2 |
| 4 | Én afsenderadresse | spor 3 |
| 5 | Bogholderen: opsigelsesvarsel, og om e-conomic Smart skal prøves | spor 1 |
| 6 | Meta: system user-token (oprettes af Jonas, direkte i Lovable Secrets), `spend_cap` og eksport fra Ads Manager | spor 2 |
| 7 | Community-pilot: hvem tager introduktionerne, og skal en intro have ja fra begge parter? | spor 7 |
| 8 | Webinarmotoren: efter 13/10 med parallelkørsel? | spor 4 |
| 9 | Referater: Workspace-edition, leverandørvalg og hvem der ser optagelserne | spor 5 |
