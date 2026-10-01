# Marketingkanaler: LinkedIn-agenten, Instagram og navnet

**Beslutningspapir, udkast 1/10-2026.** Grundlaget er Jonas' ønske fra 30/9 kl. 22:02. Papiret bygger kun på læsning af repoet og opslag på nettet. Intet er målt i prod, og ingen konti er åbnet. Hvor jeg ikke har målt noget, står der «ikke målt».

---

## 1. Anbefalingen på én skærm

**Det bygges, i denne rækkefølge:**

0. **Slides ind i grundlaget, før der bygges noget.** Det er en forudsætning, ikke et skridt man kan springe over. Jeg har søgt i repoet efter slides, pptx, pdf, «optagelse» og «webinar». Der ligger **ingen webinar-slides**. `grundlag.ts` nævner «de to områder» og «de fem spørgsmål» som overskrifter, men **hvilke** områder og spørgsmål det er, står ingen steder. En agent, der skal skrive «informative opslag bygget på Mortens webinar», har derfor intet at stå på. Det er præcis den fejl, der skete med de seks mails 19/9 (`marketingmotoren.md` §1). Slides skal ind som fakta med kilde pr. slide (`WEBINAR.indhold`), før agenten skriver et ord.
1. **Værnet udvides til kanalen LinkedIn** (`udkastVaern.ts`). Reglerne står i §2.
2. **En udkastflade efter nyhedsagentens mønster** (udkast → «tag»/«publiceret»/«slip»): to udkast om ugen.
3. **Fire ugers skyggekørsel uden API.** Mennesket kopierer det godkendte udkast ind i LinkedIn selv, med et `utm`-link pr. opslag. Når et menneske alligevel skal klikke, sparer API'et kun selve kopieringen, og det er ikke flaskehalsen.
4. **Posts API kommer først, når to ting er målt:** at udkastene godkendes uændret (husets kriterium er ≥ 30 udkast, `agentarkitektur.md` §1.3), og at kopieringen faktisk er det, der bremser.

**Det bygges ikke:** automatisk publicering (N1 permanent), organisk Instagram (nu), AI-billeder af mennesker, AI-video og omdøbning nu.

**Hvor der sige fra:** ønsket blander tre ting, der hver især er fine, men som tilsammen er en dårlig start. Det er en agent uden kilde (slides mangler), en ny kanal (Instagram) og et navneskifte, alt sammen på én gang. Hvis alle tre flytter samtidig, kan ingen bagefter sige, hvad der virkede. Husets egen regel er «én ændring pr. runde» (`marketingdom`/`minde`).

---

## 2. LinkedIn-agenten i husets mønster

### 2.1 Formen: udkast → dom → menneskets klik

Agenten er lag 4's **copywriter** for én kanal (`agentarkitektur.md` §3.2). Den har samme form som nyhedsagenten: den skriver et udkast, deterministiske domme kører før mennesket, og intet forlader huset uden et klik. Niveauet er **N1 permanent**. Tekst, der går ud af huset, «godkendes altid», og hvis opslagene står i Mortens navn, er det hans stemme. Får agenten ikke svar i to runder, holder den op med at foreslå og eskalerer i stedet (boardroom-2, fejl 9).

### 2.2 Kilder, agenten må skrive ud fra

| Kilde | Status i dag | Bemærkning |
|---|---|---|
| `grundlag.ts`: produkt, pris (begge tal), Morten, «broen», medlemsudtalelser | findes | Jonas' historik er `MANGLER`, og R11 fælder en præsentation af ham |
| Webinarets slides | **findes ikke i repoet** | Trin 0 |
| Nyhedsagentens **publicerede** opslag (ikke udkastene) | koden er udkast 30/9, og jeg har ikke målt, om den kører i drift | «Blandet med nyheder» afhænger af, at den kører. Kilderne er i dag Høringsportalen ×3, Nemhandel og Version2 |
| «Nyt fra platformen» | **ingen kilde** | Git-loggen er intern og må ikke være kilden. Den skal være en kurateret liste (`PLATFORM_NYT` i grundlaget), som Jonas skriver |
| Billeder | `docs/delingskreativ/assets` (morten-hi.png, jonas-hi.png) og godkendte eksporter 1a–2b | Biblioteket er tyndt. Fotoshootet er stadig Jonas' beslutning (§3.5) |

### 2.3 Domme, før mennesket ser udkastet

Alle dommene er rene funktioner med tests:

- **Tal kun fra kilden.** R1 og R3 gælder. Nyhedsagentens talværn genbruges: hele tal-tokens skal stå ordret i kildens tekst. **I hook-linjen skal et ukendt tal give `fejl`, ikke `tjek`**, for det er i hooket, «9 ud af 10 ejere …» sniger sig ind.
- **Ingen persondata og ingen medlemstal.** Der må hverken stå et medlems navn, en virksomhed eller et tal, medmindre det er en udtalelse med `maa_bruges_som_medlemsbevis`. Beslutningen fra 9/9 siger, at der ikke vises tal mellem medlemmer. Offentligt gælder det så meget desto mere.
- **Ingen optagelse.** Ordet og linket fældes allerede af R5, og reglen udvides til ordet selv. Der må heller ingen frister stå, som ikke findes (FORBUD).
- **Rammen.** R7 (webinaret er ikke «regnskab og nøgletal») og R9 (en Morten-udtalelse er aldrig bevis for medlemskabet) gælder uændret.
- **Links** kun fra `KENDTE_LINKS`, med `utm_source=linkedin&utm_content=<udkast-id>`.
- **Kommerciel hensigt.** Markedsføringsloven § 6, stk. 4 kræver, at den kommercielle hensigt oplyses klart. Et opslag, der peger på The Boardroom, skal derfor vise afsenderens forbindelse («vi», «vores forløb» eller en tydelig titel). Værnet kan kun antyde det, så det giver `tjek`.
- **Sproget.** Husets regler gælder (ingen udråbstegn, ingen superlativer). Et «skarpt hook» er her et spørgsmål eller en konkret påstand fra kilden, aldrig clickbait.

### 2.4 Kadence og formater

- **To om ugen på faste dage.** Det ene opslag er indhold (en slide eller pointe fra webinaret/grundlaget). Det andet skifter mellem nyhed, nyt fra platformen og medlemsudtalelse. Ugen før en webinarsession peger det ene opslag på tilmeldingen. Hvilket klokkeslæt der virker bedst, er ikke målt, og det skal ikke gættes.
- **«Karrusel af slides»** laves som et **dokumentopslag (PDF)**. LinkedIns Posts API understøtter organiske dokumenter, billeder, multiImage og video, men *ikke* organisk «Carousel»: «Only create sponsored carousel post. Organic carousel is currently not supported.» Slidebillederne skal **renderes deterministisk ud fra kilden**, ikke genereres af en AI (se §5).
- **Billede:** rigtige fotos fra biblioteket.
- **Kort video:** klip af rigtigt materiale (`agentarkitektur.md` §3.6). Klip-pipelinen er ikke bygget, optagelsen er taget ned, og dansk transskription kræver menneskelig korrektur. Video er derfor fase 3, ikke uge 1. Mortens video til «dagen før»-mailen (Bunny) kan genbruges, hvis han siger ja.

### 2.5 Måling: lag 6-tankegangen, hvor for få er for få

- **Forretningsmålet:** tilmeldinger og ansøgninger pr. opslag gennem `utm_content`. `KILDER` har allerede ordet `linkedin`, og `afgoerKilde` læser `utm_source`. Likes og visninger er ikke målet.
- **Realistisk:** med to opslag om ugen bliver det højst en håndfuld tilmeldinger pr. opslag. Det er ikke målt, men det er den rigtige forventning. **«For få» vil stå i ugevis**, og det er korrekt. Formater (dokument mod billede) sammenlignes kun, når begge grupper har ≥ 5 af hvert udfald (`HAENDELSER_FOR_SAMMENLIGNING`). Ellers er dommen «kan ikke afgøres».
- **Agentens egen måling** er andelen af udkast, der godkendes uændret, og tiden, til et menneske tager stilling. Det er grundlaget for et eventuelt API-skridt.
- **Visninger fra API'et** (`r_organization_social`) kræver Community Management API. Indtil da må tallene eksporteres i hånden, hvis de overhovedet skal bruges.

### 2.6 API-fakta (slået op)

- **Personlig profil:** `w_member_social` gennem produktet «Share on LinkedIn» er self-serve. Loftet er 150 kald pr. medlem pr. døgn. Det kræver et OAuth-token fra Mortens egen konto.
- **Firmaside:** `w_organization_social` kræver **Community Management API**. Adgangen kræver ansøgning fra en «registered legal organization» med verificeret mail, domæne og side, og sidens super admin skal verificere appen. Først er man i Development tier. Standard tier kræver en fuld integration og en screencast pr. use case. Den, der poster, skal have rollen ADMINISTRATOR, CONTENT_ADMIN eller DIRECT_SPONSORED_CONTENT_POSTER.
- **Vedligehold:** alle kald kræver headeren `Linkedin-Version: YYYYMM`, og version 202510 udløber 15/10-2026. Versionsskift er en løbende driftsopgave.
- **Grænsen:** brugeraftalens §8.2 forbyder scripts og robotter, der skraber eller kopierer tjenesten. Agenten læser derfor aldrig LinkedIn uden om det officielle API, heller ikke for at finde ud af «hvad virker hos andre».

**Vurdering (ikke målt):** den kendte afsender er Morten. Han står som afsender på alle webinarmails, og han er kendt fra Løvens Hule. Hans profil er formentlig kanalen, og firmasiden er arkivet. Det er Mortens beslutning (spørgsmål 2).

---

## 3. Instagram: anbefalingen er «ikke nu»

**Begrundelse:**
1. **Instagram bruges allerede**, som annonceplacering. Målt 20/9 kom `utm_source` fra fb 358 gange og fra ig 60 gange (`meta-automatisering.md`). Den betalte placering kører videre. Det er organisk Instagram, der er spørgsmålet.
2. **Citater er det svageste format.** Et citatkort er tekst uden kontekst, og husets citatregler (R4, R8, R9) gør, at materialet er tyndt: to medlemsudtalelser og Mortens løfte. Nyheder om høringer og bogføringsregler hører hjemme i community og på LinkedIn, ikke på Instagram.
3. **Prisen er Jonas' tid.** Hvert billede og hver Reel er N1. Agentarkitekturen peger selv på, at den reelle flaskehals er Jonas' godkendelser (§5.3). En kanal mere halverer opmærksomheden på den kanal, der passer til målgruppen (ejerledere med 2 mio.+ i omsætning).
4. **Ingen målt efterspørgsel.** Jeg har ikke målt, om der i dag findes en Instagram-konto, hvor mange der følger den, eller hvor meget den bliver brugt.

**Hvis den tages op senere:** formatet skal være **Reels af rigtige klip af Morten** fra samme klip-pipeline som LinkedIn, én om ugen og kryds-postet. Det skal ikke være citater. Kriteriet for at tage den op er, at klip-pipelinen kører, og at LinkedIn har otte ugers måling.
**API'et, hvis det bliver aktuelt:** det kræver en professionel konto og `instagram_business_content_publish` eller (via Facebook Login) `instagram_content_publish` og `pages_read_engagement`. Grænsen er 100 opslag via API'et pr. 24 timer (en karrusel tæller som ét), billeder skal være JPEG, en karrusel har højst 10 elementer, og mediet skal ligge på en offentlig URL.

---

## 4. Navnet: anbefalingen er «omdøb ikke nu»

**Det, jeg kunne måle:**
- topix.dk har titlen «Topix — Viden fra Morten Larsen og Jonas Herlev til iværksættere» (hentet 1/10). Webinaret og nyhedsbrevet bor dér.
- Afsenderne er Klaviyo (`noreply@send.topix.dk`, «Morten Larsen»), Mailgun (`morten@webinar.topix.dk`) og platformen («The Boardroom», notify.theboardroom.dk). Selskabet hedder Topix.dk ApS. Ansøgningen ligger på app.theboardroom.dk.
- **Ikke målt:** navne, URL'er og følgertal på LinkedIn-, Instagram- og Facebook-siderne. Der står ingen sociale URL'er i repoet, topix.dk viser ingen links uden JavaScript, og LinkedIns hjælpesider er blokeret af robots.txt.

**Anbefaling:** Lad Topix være det gratis lag (webinar, nyhedsbrev, podcast), hvor afsenderen alligevel er Morten. Lad The Boardroom være produktet, som opslagene peger på. Det, en kold læser møder, er «Morten Larsen» og ikke et sidenavn. En omdøbning flytter derfor mindre, end den koster. Tag beslutningen **én gang, samlet**, når webinaret flytter fra eWebinar/topix.dk ind i platformen (webinarmotoren). Så flytter hele tragten samtidig. Undgå halve løsninger som «The Boardroom by Topix»: det giver tre navne i stedet for to.

| | Fordel | Ulempe og pris |
|---|---|---|
| Omdøb nu | Ét navn, og firmasiden peger direkte på produktet | LinkedIn: navneændring sker på anmodning, og jeg har ikke målt, om følgere og den gamle URL overføres. Facebook-siden: navneskift er begrænset (kilden er fra 2014 og forældet, så det skal måles). Meta: sidenavnet står på alle annoncer. Mail: `send.topix.dk` og `webinar.topix.dk` har opbygget omdømme, og et nyt domæne betyder ny opvarmning (Mailgun-probationen 29/9 viste, hvad det koster). Derudover DNS/DKIM, to GTM-containere, privatlivstekster, `KENDTE_LINKS`, gamle links i mails og opslag, og Stripe-footere |
| Vent og samle | Ingen risiko for leverbarheden, og måling på `kilde` før beslutningen | To navne en tid endnu |

---

## 5. AI-billeder og video: hvad er forsvarligt

**Forsvarligt:**
- Slides og diagrammer **renderet af kode ud fra kilden**. Det er ikke AI, og det er det bedste materiale, fordi tallene på billedet så har bestået værnet.
- Abstrakte illustrationer uden mennesker.
- Klip af rigtig video og rigtige fotos.

**Ikke forsvarligt:**
- Syntetiske mennesker, en syntetisk Morten eller Jonas (ansigt eller stemme), «medlemmer», der ikke findes, og AI-video.
- Skærmbilleder af platformen med opdigtede tal. Brug kun demo-data.
- **Tal eller tekst genereret inde i et AI-billede.** Det går uden om værnet. Tekst skal ligge som et overlay fra kilden.

**Mærkning:**
- EU AI Act art. 50 gælder fra 2/8-2026. Deep fakes skal oplyses af os, og udbyderne skal markere maskinlæsbart.
- Meta kræver, at man selv oplyser fotorealistisk video og realistisk lyd («we may apply penalties»). Meta læser C2PA og IPTC og sætter selv et «AI info»-mærke.
- LinkedIn viser et C2PA-mærke på billeder med herkomstdata.

**Husets regel:** C2PA-markeringen fjernes aldrig. AI-illustration logges i `medie` (`ai_genereret`, model og `prompt_hash`). Fotorealistisk materiale laves ikke. Udbydernes vilkår for kommerciel brug er ikke målt og læses, før første udbyder vælges.

---

## 6. Åbne spørgsmål til Jonas

1. **Må webinarets indhold gives væk** på LinkedIn (de to områder, de fem spørgsmål), eller er det det, der får folk til at tilmelde sig? Og hvem leverer slides som fil?
2. **Hvis profil skal bruges:** Mortens, firmasiden eller begge? Godkender Morten selv hvert opslag, eller gør Jonas det på hans vegne?
3. **Hvilke sider og konti findes i dag** (LinkedIn og Instagram, for Topix og for The Boardroom), og hvem er super admin?
4. **«Nyt fra platformen»:** skriver du en kurateret liste, og må der vises skærmbilleder med demo-data?
5. **Navnet:** står en samlet omdøbning på bordet, når webinaret flytter ind i platformen, eller er Topix som mediehus et mål i sig selv?

---

## 7. Kilder

**Repo (læst 1/10):** `CLAUDE.md`, `docs/marketingmotoren.md` §0–2.3, `docs/agentarkitektur.md` §1.3, §3.2–3.7 og §4.2, `docs/tracking.md` §1c og §3, `docs/claude-regelsaet.md` §3–4a, `docs/analyser-30-09/{meta-automatisering,klaviyo-gennemgang,webinar-og-referater,webinarmotor-spec}.md`, `src/lib/marketing/{grundlag,udkastVaern,marketingdom}.ts`, `supabase/functions/_shared/{nyhedAgent,webinarMailTekster}.ts` og `docs/delingskreativ/`.

**Net:**
- LinkedIn Posts API (indholdstyper, scopes, headere): https://learn.microsoft.com/de-ch/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2024-07
- LinkedIn Organic Posts (sideroller, udløb af 202510): https://learn.microsoft.com/en-us/linkedin/marketing/usecases/page-management/organic-posts-usecase?view=li-lms-2023-08
- Community Management App Review (tiers, krav): https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review?view=li-lms-2023-11
- Share on LinkedIn (`w_member_social`, self-serve, loft): https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin
- LinkedIn User Agreement §8.2: https://conductatlas.com/platform/linkedin/linkedin-user-agreement/prohibition-on-scraping-and-automated-data-collection/
- LinkedIn C2PA-mærkning: https://www.mediapost.com/publications/article/396225/linkedin-begins-labeling-ai-generated-content.html
- Instagram Content Publishing: https://developers.facebook.com/docs/instagram-platform/content-publishing
- Meta om AI-mærkning og egen oplysning: https://about.fb.com/news/2024/02/labeling-ai-generated-images-on-facebook-instagram-and-threads/
- C2PA på tværs af platforme (Meta «AI info», metadata fjernes ved upload): https://www.makeinfluence.com/en/academy/content-credentials-c2pa-how-platforms-label-ai-assisted-content
- Markedsføringsloven § 6, stk. 4: https://www.danskerhverv.dk/presse-og-nyheder/nyheder/2018/maj/laver-dine-medarbejdere-skjult-reklame-pa-facebook/
- EU AI Act art. 50 (citeret fra `agentarkitektur.md` §3.3): https://www.cooley.com/news/insight/2026/2026-08-03-eu-ai-act-transparency-obligations-take-effect-2-august-2026
- Navneskift på sociale medier (kun en gammel kilde fundet, forældet): https://www.hivedigital.com/blog/rebranding-without-fuss/
- topix.dk (titel, hentet 1/10): https://topix.dk
