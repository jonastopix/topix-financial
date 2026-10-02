# Marketingmotoren — Nicklas' oplæg (1/10-2026) og hvad platformen gør ved det

> **Rettet 1/10 kl. 20:13 (Jonas):** (1) **Varme leads er fjernet** fra /webinar — «Jeg kommer ikke til at sidde og ringe til folk. Punktum.»; en liste med mails gør overblikket ligegyldigt, og segmentering hører til i Klaviyo. Alt herunder om at ringe til dem, der så færdigt, er derfor IKKE platformens. (2) **Målene er VORES**, ikke en persons — overskriften er «Vores mål», og ingen persons navn står på målene i platformen. (3) **Pris pr. nyt medlem: under 7.500 kr.** (var 15.000) = 3 × 2.500 kr., fordi vi lukker ca. hver tredje ansøger; målet gælder annoncekronerne — bureauets faste fee (4.000 kr./md.) og 8 % pr. medlem kommer OVENI og er ikke regnet med. (4) **Rækkefølgen på /webinar:** «Det næste webinar» øverst → «Vores mål» → «Afholdt» → tragten → resten. Detaljerne: `docs/webinaret-og-annoncerne.md` §7j.

**Kilde:** Nicklas' dokument «Min TED Talk om The Boardroom» (oaksmond.dk, fortroligt, delt med Jonas 1/10-2026). Dokumentet ligger ikke i repoet. Det følgende refererer det og vurderer det. Hvor der står «Nicklas», er det hans forslag; hvor der står «Claude», er det min vurdering. Skillelinjen holdes skarp, så måling og mening ikke blandes.

Relateret: `docs/webinaret-og-annoncerne.md` (tragt, annoncespor, målstreger §7j), `docs/mailplan-14-dage-og-sms.md` (14 dage + SMS), `docs/tracking.md` (hvad der sendes til Meta), `docs/marketingmotoren.md` (de seks lag), `docs/agentarkitektur.md` (agenterne).

---

## 1. Diagnosen (Nicklas) — og målingen bag den

**Nicklas:** «Tragten knækker efter webinaret, ikke før.» Annoncerne virker. Hullet ligger efter klikket.

Hans tal er Jonas' egne og tæller personer. De dækker sessionerne 25/8 og 22/9:

| Trin | Personer | Fald |
|---|---|---|
| Tilmeldt | 469 | |
| Mødte op | 189 | −59,7 % |
| Så det færdigt (≥ 75 %) | 132 | −30,2 % |
| Ansøgte | 6 | **−95,5 %** |
| Blev medlem | 0 | |

**Claude, regnet med husets Wilson:**
- fremmøde 189/469 = 40,3 % (95 %-interval ca. 36–45 %);
- ansøgere blandt dem, der så det færdigt: 6/132 = 4,5 % (ca. 2–10 %).

Diagnosen holder: det største relative fald er fra «så færdigt» til «ansøgte». Vær dog varsom med «0 medlemmer»: 5 af de 7 ansøgninger var stadig i gang, da han skrev.

## 2. Motoren i fem led (Nicklas)
1. **Morten bliver set:** Meta (volumen), LinkedIn (ejerlederne selv), YouTube (tillid før første klik), podcasts.
2. **Webinar hver 14. dag:** fast tidspunkt, påmindelse på mail og SMS, en kort video fra Morten dagen før.
3. **Én klar opfordring:** de sidste ti minutter skrives om; bonus ved ansøgning inden 72 timer (30 min. ekstra alene med Morten); «ét medlem pr. branche», sagt højt.
4. **Jonas ringer:** alle, der har set det færdigt og omsætter over 2 mio., inden for 24 timer. LinkedIn-besked, hvis de ikke tager telefonen.
5. **Nyt medlem:** en case på video efter 90 dage, som føder led 1.

## 3. Det styrer vi efter (Nicklas' fire mål ved start)

| Måltal | Mål | Hvor platformen viser det |
|---|---|---|
| Fremmøde på webinaret | over 55 % | /webinar «Målene» + den delte flade |
| Ansøgere blandt dem, der ser det færdigt | over 10 % | samme |
| Pris pr. ansøgning | under 2.500 kr. | samme |
| Pris pr. nyt medlem | under 15.000 kr. | samme |

**Claude, om hvordan målene dømmes:**
- **Procentmålene** står kun som «over målet» eller «under målet», når hele Wilson-intervallet ligger på den ene side. Ellers står der «kan ikke afgøres».
- **Priserne** vises ikke på under 5 personer («for få»).
- Det er husets regler fra lag 6 og annoncesporet, og de gælder også her. Et mål, der «er nået» på 3 personer, er ikke nået.
- Definitionerne (tæller, nævner, vindue) står i `docs/webinaret-og-annoncerne.md` §7j.

## 4. Hvad platformen gør — og hvad den ikke gør

| Nicklas foreslår | Status på platformen | Claude |
|---|---|---|
| Hårdere opfølgning: Jonas ringer til dem, der har set det færdigt | **«Varme leads» på /webinar** (kun rådgivere): har set ≥ 75 % inden for 14 dage, ingen ansøgning, flag «inden for 24 timer» | Godt. Omsætningen kendes ikke for tilmeldte (ingen CVR på tilmeldingen); se §5.1. En «ringet»-markering kræver en tabel og er næste skridt |
| Webinar hver 14. dag | Mailplanen tåler det (`docs/mailplan-14-dage-og-sms.md`): `fjorten_dage` ud efter 13/10, ellers uændret | Godt. Målt median tilmeldt før: 13,5 dage (22/9) |
| SMS-påmindelse | Findes ikke | Et frivilligt tilvalg med ét formål (fremmøde), testet med eWebinars egen Twilio-integration, før vi bygger noget (mailplan-papiret §3–§4) |
| Kort video fra Morten dagen før | **Bygget** (#1179): `en_dag` kan bære «Mortens hilsen» fra én række i `app_config`. Mangler kun videoen | Klar, når Morten optager |
| 72-timers bonus, «ét medlem pr. branche» | Afslutningens tekst (eWebinar), ikke platformen | Se §5.2 og §5.3 |
| Webinartilmeldinger fra serveren til Meta (CAPI, Lead med hashet mail/telefon/navn) | **Bevidst fravalgt 21/9** (CLAUDE.md «Metas Conversions API», «Webinarhændelser BYGGES IKKE») | Se §5.4 — kræver Jonas' beslutning |
| LinkedIn: CTA på Mortens opslag, Thought Leader Ads, 10.000 kr./md. | Uden for platformen | Annoncesporet måler LinkedIn som kilde (`utm_source=linkedin`), når linkene bærer det |
| Niche: e-handel først (oktober), rådgivning (nov.), byggeri (dec.), IT (jan.) | Uden for platformen | Se §5.3 |
| Henvisninger (ekstra session for at henvise) | Findes ikke | En henvisning kan spores med `?kilde=anbefaling` (findes som kilde i `KILDER`) |
| Partnere: revisorer, banker, e-conomic/Dinero affiliate | Findes ikke | |

## 5. Claudes indvendinger og forbedringer

### 5.1 «Omsætter over 2 mio.» kræver et opslag, vi ikke har på tilmeldingen
Tilmeldingen på topix.dk spørger kun om session, navn og mail (målt 1/10). eWebinars rå besked bærer intet firma og intet telefonnummer.

Platformen kan slå CVR op: `ansoegning-cvr-opslag` og `berig-virksomheder` mod DataCVR, men kun 25 opslag i døgnet. Vi kan ikke slå 132 personer op ud fra en mail.

**Forslag:** et frivilligt felt «Firma (valgfrit)» på tilmeldingen, med sit eget formål (`docs/mailplan-14-dage-og-sms.md` §3.3). Så kan de varme leads beriges med omsætning, når firmaet er kendt. Indtil da vurderes omsætningen i samtalen.

### 5.2 72-timers bonussen må ikke koste Morten tid, han ikke har
30 minutter ekstra alene med Morten pr. ansøger er en lovning om hans kalender. Ved 10 % ansøgere af ca. 150, der ser det færdigt pr. session, er det 15 × 30 min. hver 14. dag.

**Forslag:** sig ja til fristen (urgency virker), men lad bonussen være noget, der ikke skalerer i Mortens tid, eller sæt et loft («de første 5»), så løftet altid er sandt. Morten afgør det, og han er ved at drøfte præmien til gamification med Jonas, så de to bør ses samlet.

### 5.3 «Ét medlem pr. branche» kræver en branchedefinition, der kan håndhæves
Nicklas' brancher (Danmarks Statistik) er brede: «Handel, inkl. e-handel» har 24.412 virksomheder. Lover vi «ét medlem pr. branche», skal grænsen være så fin, at den er sand («ét VVS-firma i Region Midt», hans eget eksempel), og den skal tjekkes, før der siges ja.

**Forslag:** brug hans eksempel som form: branche plus region. Lad ansøgningsflowet vise rådgiveren «vi har allerede …» ved samme branche og region. Det kræver branchekode på `companies` (DB07 fra CVR findes ved berigelse) og en region. Det er ikke bygget.

### 5.4 Webinartilmeldinger til Metas Conversions API — en juridisk beslutning, ikke en teknisk
Nicklas har ret i, at Meta kun ser cirka hver femte tilmelding: samtykket starter som afvist, og Lead-hændelsen fyrer kun hos dem, der siger ja.

Men at sende alle tilmeldinger fra serveren med hashet mail og navn **omgår netop det nej**, som de fire ud af fem har givet i cookie-banneret. Huset fravalgte det 21/9, også fordi eWebinars besked ingen user agent bærer.

**Forslag, i rækkefølge:**
1. **Gør det, der er rent:** send en server-hændelse KUN for tilmeldinger med samtykke. Det kræver, at samtykket følger med fra siden til tilmeldingen, hvilket ikke er bygget.
2. **Lad Jonas beslutte resten med en jurist**, ikke med en marketingkonsulent eller en AI. Ansøgningernes CAPI er besluttet af Jonas uden jurist (21/9); for webinaret er argumentet svagere, fordi der ingen kundeaftale er.

### 5.5 Det, platformen kan tilføje, som ikke står i oplægget
- **Opfølgningsrækkefølgen målt pr. person:** en tilmeldt kan følges fra annonce, til tilmelding, til «så færdigt», til ansøgning, til medlem i ét spor. Nicklas' tal kom fra Jonas' egne opgørelser. /webinar kan vise dem løbende, og målstregerne gør det nu.
- **«Varme leads» som agentens første rigtige job:** når en «ringet»-markering findes, kan nyhedsagentens mønster (udkast → menneskets klik) give Jonas et kort pr. lead med sessionen, procenten og firmaet. Agenten ringer aldrig, og den skriver aldrig selv.
- **Feedbacken på 4,5 af 5 er en kilde:** de 40 svar kan sige, hvad der får folk til ikke at ansøge. Det er et datasæt, vi bør læse, før de sidste ti minutter skrives om.

## 6. Køreplanen (Nicklas) — med platformens del

| Hvornår | Nicklas | Platformens del |
|---|---|---|
| Nu → 13/10 | Test opfølgningen; Jonas ringer de ti største; påmindelser på mail og SMS; video dagen før | Varme leads (bygget 1/10); Mortens hilsen (bygget, mangler video); SMS: forsøg via eWebinar |
| Oktober | Webinar hver 14. dag; ny afslutning; tilmeldinger til Meta fra serveren; e-handel-annoncer | `fjorten_dage` ud efter 13/10; CAPI kun med samtykke (§5.4) |
| November | LinkedIn-CTA, Thought Leader Ads, «Ved bordet», podcasts, rådgivning som næste branche | Kildesporet (`kilde`/utm) |
| December → februar | YouTube, henvisninger, partnere, byggeri og IT | Henvisninger via `?kilde=anbefaling`; partner-affiliate er ikke designet |

## 7. Delingen med Nicklas
Jonas giver Nicklas et privat link til /webinar (`webinar-deling`, rådgiver-gate, vises én gang). Det viser alt på /webinar uden persondata, inklusive de fire målstreger, men **aldrig** de varme leads (persondata; kildeværn).

Beviset for, at den udrullede `webinar-delt` bærer målstregerne og koblingen: feltet `maalstreger` (og `koblinger_talt`) i et delt-svar.
