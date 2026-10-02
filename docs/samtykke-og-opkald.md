# Samtykke og opkald — højere samtykke-rate lovligt, og «må vi ringe til dig?» uden eWebinar

Beslutningspapir 2/10-2026. Grundlaget er Jonas' svar på aftenlisten 1/10:

> CAPI for webinartilmeldinger: **«Kun med samtykke»** — «Men tag et seriøst kig på hvordan vi opnår højere samtykke-rate».
>
> SMS: «Jeg synes ikke det giver mening at begynde at bruge SMS før vi tager webinaret ind i vores egen platform. Vi skal ikke putte mere på eWebinar, som vi alligevel gerne vil væk fra. Men kunne man i stedet bruge telefonnummer, til efter webinaret at spørge folk om de ønsker at blive ringet op ang. The Boardroom? Hvis de gerne vil det, så får vi deres nummer og Morten eller Jonas giver dem et kald.» og «Vi skal lige have tænkt tingene igennem inden vi bare retter ind efter Nicklas.»

Status: **Del 1 er forslag, intet bygget. Del 2 er BYGGET 2/10-2026 (gren `feat/ring-mig-op`, §2.10) — ikke kørt, ikke udrullet.** Målt: ca. 4 af 5 siger nej i cookie-banneret, og samtykket starter som afvist (`docs/tracking.md` §2.3, `docs/marketing-motoren-nicklas.md` §5.4).

Relateret: `docs/tracking.md` (det ENE dokument om, hvad der sendes til hvem), `docs/marketing-motoren-nicklas.md` §5.4 (CAPI for tilmeldinger), `docs/mailplan-14-dage-og-sms.md` (SMS som tilvalg, §3.3 «to kryds, to formål»), `docs/webinaret-og-annoncerne.md` §7e–7j (mailene, tragten, målene), `docs/marketingmotoren.md` §9 (hvem ejer hvilken mail).

Hvor der står «Claude», er det min vurdering; hvor der står «målt», er det en måling bogført i et af dokumenterne ovenfor; hvor der står «umålt», ved vi det ikke. **Ingen jurist er spurgt** (Jonas 21/9, `tracking.md` §1e) — opslagene nedenfor er myndighedernes egne tekster og offentliggjorte afgørelser, ikke rådgivning.

---

## 0. Konklusionen i fem linjer

1. **Loven sætter rammen, ikke loftet.** Afvis skal være lige så let som accept, intet må være forhåndsafkrydset, ingen nudging med farver — men inden for det er der mindst tre greb med evidens (§1.3) og ét greb, der rammer præcis de 4 af 5 (det kontekstuelle samtykke, greb 2).
2. **Det største målbare greb er at flytte kategorierne ned i andet lag på topix.dk** og have «Acceptér alle» og «Afvis alle» lige store i første lag: studier måler 8–20 procentpoint, når granulariteten ikke står i første lag.
3. **Nicklas' «send alle tilmeldinger fra serveren» siger vi nej til** — det omgår et nej, der er givet. Og ét af vores egne signaler ser ud til at gøre det samme allerede: eWebinars egen pixel (§1.5). Det skal måles først.
4. **«Må vi ringe til dig?» bygges som et frivilligt, enkeltstående samtykke med ét formål**, stillet dér, hvor personen allerede er (webinarets afslutning og Klaviyos første «Deltog»-mail) — **ingen ny mail**, ingen liste, en klokke pr. anmodning. Størrelse M (§2.8).
5. **SMS venter**, til webinaret bor i platformen; listen over, hvad der skal på plads først, står i §3.

---

## Del 1 — Højere samtykke-rate, lovligt

### 1.1 Reglerne, slået op

**Cookiebekendtgørelsen og Erhvervsstyrelsens vejledning** (bekendtgørelse nr. 1148 af 9/12-2011; vejledning opdateret december 2019 efter Planet49-dommen; tilsynet 2022):

- Samtykke er en «frivillig, specifik og informeret viljestilkendegivelse» (§ 2, stk. 1, nr. 8), og der skal være «en umiddelbart tilgængelig adgang for slutbrugeren til at afslå samtykke» (§ 3, stk. 2, nr. 4). Banneret skal i første lag oplyse formål og hvem der sætter cookies (§ 3, stk. 2, nr. 1–3, 5).
- **«Ved at gå videre accepterer du» er ugyldigt siden december 2019:** «EU-dommen fastslår, at der kræves en aktiv handling fra brugere for, at der foreligger et gyldigt samtykke» (Planet49, C-673/17, 1/10-2019).
- **Erhvervsstyrelsens tilsyn 2022** (326 sider, kun 107 i orden): «Hvis der er en 'accept alle' knap, skal der også være en 'afslå alle' knap. Knapperne skal være lige synlige.» · «Formålene bør ikke være forhåndsafkrydsede» · «Formålene med at sætte cookies, og at cookies sættes af 3. parter, skal oplyses i bannerets øverste lag.» De tre hyppigste fejl: manglende formål/tredjeparter i banneret, uklassificerede cookies, og at afvisning er sværere end accept.
- Bekendtgørelsen regulerer **«lagring af eller adgang til oplysninger i en slutbrugers terminaludstyr»** (§ 3, stk. 1) — altså også `localStorage` og **læsning** af en eksisterende cookie (`_fbp`/`_fbc`), ikke kun at sætte en. Det er vigtigt for greb 7.

**Datatilsynets praksis** (afgørelser; se lovguiden.dk's praksisoversigt):

- **Alstrøm (2021-431-0125, oktober 2021):** «ACCEPTÉR ALLE» i orange på orange mod «Acceptér» i orange på hvid = ulovlig nudging.
- **JP/Politikens Hus (2021-41-0149, oktober 2022):** trafiklys-design (rød/grå/grøn), der nudger mod «acceptér alle», kritiseret; præference-cookies gemt i andet lag opfyldte ikke oplysningspligten.
- **Jysk Fynske Medier (2021-31-5553, februar 2023):** cookie wall underkendt, fordi «gratis + samtykke» gav mindre indhold end betaling; **Gul og Gratis (2021-31-4871, februar 2023):** «betal eller samtyk» godkendt ved 29 kr./md., fordi indholdet var det samme. Cookie walls er altså ikke forbudt pr. definition — men det er ikke en vej for et gratis webinar (§1.4).
- **Leadwise (2021-31-5282, december 2022) og DMI (2018-32-0357, februar 2020):** cookies sat FØR samtykke = alvorlig kritik.

**EDPB's retningslinjer 03/2022 om vildledende design** (version 2.0, februar 2023) er skrevet om sociale medier, men bruges af tilsynene som katalog: *overloading* (vedvarende prompts, labyrint, for mange valg), *skipping* (bedragerisk hygge, «se derovre»), *stirring* (følelsesmæssig styring, gemt i fuldt dagslys), *obstructing* (blindgyde, længere end nødvendigt, vildledende handling), *fickle* og *left in the dark* (uklart sprog, modstridende oplysninger). Et banner, der spørger IGEN ved hvert besøg efter et nej, er «continuous prompting» — forbudt, ikke et greb.

**Markedsføringslovens § 10 og Forbrugerombudsmandens spamvejledning (2021)** gælder MAILS og SMS, ikke cookies — men kravene til et samtykke er de samme ord: «frivilligt, informeret, utvetydigt og specificeret»; «Et samtykke indhentet ved et forhåndsafkrydset felt er derfor ikke et informeret og utvetydigt samtykke» (kap. 7.3); bevisbyrden ligger hos virksomheden (kap. 12). Det bærer også Del 2.

**Datatilsynets vejledning om samtykke (september 2019):** ét samtykke pr. formål (ingen bundling), den dataansvarlige skal kunne BEVISE samtykket, tilbagetrækning skal være lige så let som afgivelse.

### 1.2 Hvad vi har i dag — og hvad vi ikke ved

Siderne ligger i to andre repoer (`~/Projekter/theboardroom-topix`, `~/Projekter/topix-reimagined` — `tracking.md` §7); de er **ikke** i denne worktree, så det følgende er det, `docs/tracking.md` har målt 21/9 og 28/9, ikke en frisk læsning af koden.

| | theboardroom.dk | topix.dk (hvor annoncerne lander, `/webinar`) |
|---|---|---|
| Banner | to knapper «Afvis»/«Acceptér» (`CookieBanner.tsx`), `localStorage["tbr_cookie_consent"]` | **kategorier** (nødvendige/analytics/marketing), `localStorage["topix_cookie_consent"]` |
| Default | Consent Mode `denied` fra 21/9, `wait_for_update: 500` | `denied`, `wait_for_update: 500` |
| Tekst | «Vi bruger cookies til analyse, videoafspilning og til at måle vores annoncer (Meta og LinkedIn).» | umålt ordret |
| Placering, timing, farver | umålt | umålt |
| Hvad der måles om banneret selv | **intet** — ingen hændelse for vist/accept/afvis/ignoreret | intet |

**Tilmeldingen** sker i eWebinars widget på `topix.dk/webinar` (session, navn, mail — målt 1/10) med `gdprBannerMode: "Off"`, `showConsentCheckbox: false`, og eWebinars **egen Meta-pixel** (samme datasæt 858180112996496) inde i widget'en (`tracking.md` §2 række 17). Takkesiden `/webinar/tak` bygger en `webinar_signup`-hændelse med SHA-256 af mailen og utm fra `localStorage["topix_utm_params"]` (30 dage) — den går ingen steder (række 13, §6.8).

**«4 af 5 siger nej»** er Jonas' tal; det er ikke bogført, hvordan det er målt (Stapes 102 server-Leads mod 356 i alt tyder på samme størrelsesorden). **Vi ved ikke, hvor mange der slet ikke rører banneret.** Det er greb 1.

### 1.3 Grebene, rangeret

Rangeringen vægter (evidens × forventet effekt) ÷ hvad det kræver. Målingen for alle: andelen «accepteret» af «banner vist», Wilson 95 % (lag 6's `wilson`/`sammenlign`), **«for få» under 5 personer i en gruppe**, og «kan ikke afgøres», når intervallerne overlapper (`src/lib/marketing/statistik.ts`). Én ændring pr. runde — ellers ved vi ikke, hvad der virkede.

#### Greb 1 — Mål banneret, før noget ændres (forudsætning, ikke løft)

- **Hvad:** fire hændelser pr. sideindlæsning — `banner_vist`, `banner_accept` (alle/kategori), `banner_afvis`, `banner_ignoreret` (siden forladt uden valg) — med side, enhed og om der var `fbclid`/`utm` i URL'en. Sendes som cookieløse pings til vores egen platform (`ansoegning-gem`s «spor»-mønster: ingen persondata, IP-dagshash-loft, fail-closed tælling — `_shared/ansoegningVisning.ts`) eller som GA4-hændelser uden `analytics_storage` (Consent Mode sender cookieløse pings, se greb 6).
- **Lovligt fordi:** der lagres intet på enheden, og intet identificerer personen; det er en tælling af vores egen flade. Bekendtgørelsen gælder «lagring af eller adgang til» terminaludstyr — en ping uden cookie er uden for den; GDPR gælder stadig, og en IP-dagshash uden persondata er husets etablerede form (`tracking.md` §2 række 26).
- **Forventet effekt:** 0 i sig selv. Uden den kan intet af det følgende dømmes med Wilson.
- **Kræver:** S i sitet (hændelserne), S i platformen (en tabel + «spor»-gren). Alternativt GA4 alene (ingen platformkode), men så er tallet ikke vores.

#### Greb 2 — Kontekstuelt samtykke: «Må vi fortælle Meta, at annoncen virkede?» på selve tilmeldingen

- **Hvad:** et SEPARAT, tomt kryds på tilmeldingen (eller på `/webinar/tak`, indtil tilmeldingen bor hos os) med ét formål: «Må vi fortælle Meta, at annoncen virkede? Vi sender en krypteret udgave af din e-mail og dit navn — ikke din tilmelding. [Læs mere]». Krydset gemmes med ordlyd og tidspunkt på tilmeldingen (`webinar_tilmeldinger.meta_samtykke_at`, `_tekst`), og **kun** rækker med det får en server-hændelse (`Lead`, `content_name: webinar_registration`) — præcis det, `marketing-motoren-nicklas.md` §5.4 punkt 1 kalder «det, der er rent».
- **Lovligt fordi:** det er samtykke efter GDPR art. 6(1)(a) og art. 7 til én specifik behandling, givet aktivt, ikke bundtet med tilmeldingen (Datatilsynets vejledning 2019: ét samtykke pr. formål), dokumenteret med ordlyd og tidspunkt (bevisbyrden). Det er IKKE et cookie-samtykke: hændelsen sendes fra serveren uden at læse `_fbp`/`_fbc` (greb 7 om det), så bekendtgørelsen rammer ikke. Persondatateksten på topix.dk siger allerede sætningen (PR #3 `8b36731`, `tracking.md` §3) — men kun om ANSØGERE; den skal udvides, FØR krydset går i luften.
- **Forventet effekt:** ukendt — **jeg har ikke fundet et studie af samtykke-kryds på en tilmeldingsformular**. Argumentet er, at personen i tilmeldingsøjeblikket allerede har sagt ja til Morten; et «nej» i banneret er et nej til cookies generelt, ikke til den annonce, de klikkede på. Det kan lige så vel ende på 30 % som 70 %. Derfor måles det som alt andet: andel ja af tilmeldte, pr. session, Wilson.
- **Kræver:** (a) så længe eWebinar ejer formularen: **umålt, om eWebinar kan have et brugerdefineret kryds**, hvis værdi kommer med i webhook'en — slås op hos eWebinar FØR noget bygges; kan det ikke, lægges krydset på `/webinar/tak` (sitet har mailen i `?data=`), og sitet kalder en ny, offentlig platformfunction `webinar-samtykke` (token-form som `webinar-afmeld`? nej — der er intet token på tak-siden; så IP-dagshash-loft + mailens SHA-256 som nøgle, fletning på `lower(email)` i platformen). (b) En migration (to kolonner + CHECK på teksten), (c) en `webinar-meta-cron` efter `meta-send-cron`s mønster (Bucket B, tørkørsel, lås, spor `meta_haendelser` med art `webinar_registration`, `action_source: "website"` kræver user agent — som vi har på tak-siden, ikke i eWebinars besked). Størrelse M. **Det bliver meget mindre, når tilmeldingen bor i platformen (§3) — derfor er min anbefaling at bygge krydset som en del af DEN flytning, og kun tak-side-varianten hvis flytningen ligger mere end to sessioner væk.**
- **Jonas' «kun med samtykke» er dette greb.** Bannerets ja er ikke nødvendigt for det.

#### Greb 3 — Kategorierne ned i andet lag på topix.dk; «Acceptér alle» og «Afvis alle» lige store i første lag

- **Hvad:** første lag: én sætning med formål og tredjeparter, to lige store knapper «Acceptér alle» · «Afvis alle», og et link «Vælg selv». Kategorierne (analyse/marketing) i andet lag med «Gem valg».
- **Lovligt fordi:** Erhvervsstyrelsen 2022 kræver netop «accept alle» OG «afslå alle», lige synlige, og formål + tredjeparter i øverste lag. Kategorier må ligge i andet lag, så længe formålene står i første (JP/Politiken-sagen: oplysningen må ikke gemmes, valget må godt). Ingen forhåndsafkrydsning i andet lag.
- **Forventet effekt:** **den bedst dokumenterede:** Nouwens et al. 2020 (CHI, felteksperiment, 40 deltagere, 8 designs): «Offering detailed preference settings on the initial page … decreasing consent by 8–20 percentage points»; Utz et al. 2019 (CCS, 82.890 besøgende): flere accepterer ved binært valg end ved valg pr. kategori eller pr. leverandør. Hvis topix.dk's første lag i dag viser kategorierne (umålt — det skal læses i `topix-reimagined`), er dette det første, der ændres. Rammer ikke theboardroom.dk (allerede binært).
- **Kræver:** S i sitet. Måles mod greb 1's baseline, mindst én hel session (≥ 300 bannervisninger), før dommen.

#### Greb 4 — Teksten: sig præcist hvad og hvorfor, og sig det som Morten

- **Hvad:** i stedet for «Vi bruger cookies til analyse og markedsføring»: «Vi bruger cookies til to ting: at se, om vores annoncer virker (Meta, LinkedIn), og at se, hvad der bliver læst (Google Analytics). Vi sælger ikke data.» Kort, konkret, sandt. Eventuelt med Mortens navn, fordi det er ham, de kom for.
- **Lovligt fordi:** oplysningspligten KRÆVER formål og tredjeparter i første lag; en præcis tekst er mere lovlig, ikke mindre. Grænsen er EDPB's «emotional steering» (skyld, frygt, «vi kan ikke drive siden uden dig») og «ambiguous wording» — teksten må ikke få et nej til at føles forkert. «Vi sælger ikke data» er kun lovligt, hvis det er sandt — og det er det (vi deler aftryk med Meta for måling; det er ikke salg, men ordet «deler» er ærligere end «sælger ikke» alene: skriv begge).
- **Forventet effekt:** **svag evidens.** Utz 2019 fandt, at tekstens ordlyd («… for at forbedre din oplevelse» mod neutral) ændrede lidt; Nouwens: «notification style (banner or barrier) has no effect». Forvent få procentpoint; det er billigt og kan måles.
- **Kræver:** XS i begge sites. Jonas godkender teksten (`tracking.md` §1f).

#### Greb 5 — Placering og timing: banneret skal nå frem FØR eWebinars widget tager blikket

- **Hvad:** på `topix.dk/webinar` konkurrerer banneret med tilmeldingswidget'en. Vis banneret med det samme (ikke 1.500 ms efter `load`, som theboardroom.dk's GTM-indlæsning — om topix.dk har samme forsinkelse er umålt), nederst (ikke som overlay midt på), og lad det ikke dække «Tilmeld»-knappen. Alternativt som en barriere FØR siden — Nouwens: ingen forskel i samtykke, men Utz: «users are more likely to interact with a notice shown in the lower (left) part of the screen». Interaktion er forudsætningen for et ja.
- **Lovligt fordi:** placering er neutral, så længe afvis og accept står sammen og lige store. En barriere, der IKKE kan lukkes uden valg, er lovlig (den afviser ikke indhold, den beder om et valg) — en barriere, der SKJULER afvis-knappen bag «Vælg selv», er ikke.
- **Forventet effekt:** ukendt for samtykke-raten; flere interaktioner er sikkert (Utz), og «ignoreret» tæller i dag som nej, fordi default er `denied`.
- **Kræver:** S i sitet; kun efter greb 1, og kun én variabel ad gangen.

#### Greb 6 — Googles Consent Mode «advanced» og modellerede konverteringer: lille værdi for os, og en gråzone

- **Hvad:** i «advanced» indlæses Google-taggene FØR samtykke og sender cookieløse pings (tidsstempel, browsertype, henviser, samtykketilstand) ved nej; Google modellerer så konverteringer for de afviste.
- **Lovligt?** Cookie Information kalder det selv «somewhat of a grey area»; Datatilsynet har ikke taget stilling (umålt — jeg fandt ingen afgørelse). Pings uden lagring på enheden er uden for bekendtgørelsens ordlyd, men GDPR gælder, og Google er modtager.
- **Forventet effekt for os: nær nul.** GA4's adfærdsmodellering kræver «at least 1,000 events per day with analytics_storage='denied' for at least 7 days» OG «at least 1,000 daily users sending events with analytics_storage='granted' for at least 7 of the previous 28 days» — topix.dk når ikke det. Google Ads' konverteringsmodellering kræver 700 annonceklik pr. 7 dage pr. land/domæne — vi annoncerer ikke på Google. **Meta har ingen tilsvarende «consent mode»:** Metas egen GDPR-side kender kun `fbq('consent','revoke')`/`grant` (pause pixlen til samtykket kommer) — ingen modellering af de afviste. Markedsføringsudbydernes «Meta Consent Mode» er deres eget ord for den samme pause.
- **Anbefaling:** bliv på basic. Det er ikke her, de 4 af 5 hentes.

#### Greb 7 — Server-side måling UDEN persondata: vores egen attribution i stedet for Metas, for alt det, banneret ikke giver

- **Hvad:** platformen ser allerede hele kæden pr. tilmelding — `utm_content` (annonce), `fbclid`, fremmøde, ansøgning, medlem (`webinaret-og-annoncerne.md` §1, «Hvor kom de fra» med Wilson §2a). Det kræver intet samtykke, fordi utm'erne står i URL'en, personen selv klikkede på, og tilmeldingen er grundlaget (aftale/legitim interesse for at måle egne kanaler) — så længe intet læses fra enheden. **Det, vi ikke kan uden samtykke, er at FODRE Metas algoritme** med den enkelte persons hændelse; det er dét, Nicklas vil, og det er dét, greb 2 løser rent.
- **Lovligt fordi:** ingen lagring/adgang på terminaludstyr; data, vi allerede har til tilmeldingen; aggregerede tal (≥ 5) på fladen.
- **Forventet effekt:** 0 på samtykke-raten — men det gør Metas tal mindre vigtige, fordi vi selv ved, hvilken annonce der gav medlemmer. Det er allerede bygget; grebet er at BRUGE det i annoncebeslutningerne frem for Metas 1-af-5-billede.
- **Kræver:** intet nyt. Fjerde linje i målstregerne (pris pr. nyt medlem) regnes allerede her.

#### Greb 8 (afvist) — hyppigere spørgen, mørkere afvis-knap, «vi har brug for din hjælp», forhåndsafkrydset «marketing»

Alle fire er dokumenteret ulovlige eller EDPB-mønstre (continuous prompting, Alstrøm/JP-farverne, emotional steering, Planet49). Nouwens måler, at at fjerne afvis-knappen fra første lag giver +22–23 procentpoint — det er præcis det tal, Erhvervsstyrelsens 2022-tilsyn er bygget til at fjerne. Står her, så det ikke foreslås igen.

### 1.4 Rækkefølgen

1. Greb 1 (mål) → 2. læs topix.dk's banner i `topix-reimagined` og bogfør første lag ordret her → 3. greb 3 hvis kategorierne står i første lag, ellers greb 4 → 4. én session mellem hver ændring, Wilson → 5. greb 2 som del af tilmeldingens flytning (§3), eller tak-side-varianten.

### 1.5 Det, vi siger fra over for — Nicklas' forslag og vores egne rester

1. **«Send alle webinartilmeldinger fra serveren med hashet mail og navn»** (Nicklas, §5.4): nej. Et samtykke, der er afvist i banneret, er et nej til at få sin adfærd delt med Meta; at sende den samme person fra serveren i stedet er at omgå nej'et med en anden kanal. Hashing ændrer ikke, at Meta matcher aftrykket mod en profil — det er formålet. Det er ikke en gråzone; det er det, Leadwise/DMI-sagerne handler om, blot flyttet fra browseren til serveren.
2. **eWebinars egen pixel i widget'en ser ud til at fyre uden samtykke** — det er VORES rest, ikke Nicklas': Events Manager målte 21/9 «Fuldfør registrering» 587 og «Visit Registration» 3,3 tusind for eWebinars pixel (`tracking.md` §5.5), mod 597 importerede tilmeldinger 19/9. 587 af ~597 er ikke «1 af 5». **Umålt, om widget'ens `fbq` respekterer vores `revoke`** (samme pixel-id — om eWebinars script kalder `init`/`track` uden om vores consent-kald, afgør det). Måles med Test events i et privat vindue med «Afvis»: kommer «CompleteRegistration», er det en pixel, der sættes uden samtykke, og den skal slukkes i eWebinar (indstillingen `setSettings.meta.pixelId`) — uanset at det koster Metas billede af tilmeldinger. Det er også grunden til, at vi 21/9 fravalgte webinar-hændelser fra serveren «for at undgå dobbelttælling» — den begrundelse holder kun, hvis pixlens tal er lovlige.
3. **`localStorage["topix_utm_params"]` (30 dage)** sættes af sitet — **umålt, om det sker før samtykke.** Lagring i terminaludstyr er bekendtgørelsens kerne; utm til egen attribution kan argumenteres som nødvendig for den tjeneste, personen bad om (tilmeldingen), men kun hvis den IKKE bruges til Meta. Læses i `topix-reimagined`.
4. **IP-adresse til Meta** (Metas anbefaling, `tracking.md` §4c): ikke uden samtykke; med greb 2's samtykke er den dækket af samme tekst, hvis teksten nævner den. Beslutning udskydes til greb 2.
5. **Stape sender GA4-hændelser videre til Meta som API-hændelser** (`email_added`, `ewebinar`, EMQ 7,7 — `tracking.md` §5.6). Taggene kræver `ad_storage` i GTM (§3), så det er bag samtykket. Men det er en tredje vej til det samme datasæt uden `event_id`-dedup mod greb 2 — når greb 2 bygges, slukkes Stapes `ewebinar`/`email_added` mod Meta, eller de får samme `event_id`.

---

## Del 2 — «Må vi ringe til dig?» efter webinaret, uden eWebinar

### 2.1 Princippet

Dette er ikke «varme leads» (fjernet 1/10, `webinaret-og-annoncerne.md` §7j): ingen liste, ingen, der skal ringes til. **Personen beder selv om opkaldet.** Hver anmodning er én klokke, og den forsvinder, når den er håndteret. Jonas ringer ikke til lister; han ringer til dem, der bad om det.

Juridisk er det det lette tilfælde: et opkald til en, der selv har bedt om det, er hverken uanmodet (markedsføringslovens § 10, stk. 4; forbrugeraftalelovens § 4) eller spam. Det, der skal være i orden, er GDPR-samtykket til at GEMME nummeret til det formål: frivilligt, specifikt, informeret, dokumenteret (Datatilsynet 2019; spamvejledningens ord om forhåndsafkrydsning og bevisbyrde gælder tilsvarende). Og formålet er ÉT: «Morten eller Jonas ringer dig op om The Boardroom». Nummeret bruges ikke til SMS, ikke til Klaviyo, ikke til Meta (`mailplan-14-dage-og-sms.md` §3.3: «Et nummer givet til en påmindelse må ikke bruges til et opkald» — og omvendt).

### 2.2 Hvor spørges der — ingen ny mail

Klagen 22/9 og mailprogrammet (`marketingmotoren.md` §9) sætter rammen: platformen sender alt FØR webinaret, Klaviyo alt EFTER, og ingen får en mail mere, end de får i dag. **Derfor ingen «platformens egen opfølgningsmail».** Spørgsmålet stilles dér, hvor personen allerede er:

| Sted | Hvornår | Hvordan | Status |
|---|---|---|---|
| **A. Webinarets afslutning** (eWebinars CTA-knapper) | de sidste minutter; i dag «Ansøg til The Boardroom» (17 klik 22/9) og «Ikke klar til at ansøge endnu» (17 klik — **hvad knappen fører til i dag, er umålt**) | «Ikke klar» → `app.theboardroom.dk/ring-mig-op?kilde=webinar` — en knap, der allerede findes, får et mål, der giver mening. Det er et LINK, ikke mere eWebinar-funktion; det flytter med, når webinaret flytter. **Umålt, om eWebinar kan flette mailen ind i knappens URL** (så siden kan bære et token); ellers uden token (§2.4). | kræver kun eWebinar-indstilling + siden |
| **B. Klaviyos «Deltog»-flow `Wq3MkG`, mail 1** (sendes allerede) | timer efter | ét afsnit: «Vil du hellere tage den over telefonen? Så ring mig op → `/ring-mig-op?t={{ person.tb_ring_token }}`». Tokenet skrives på profilen af `klaviyo-profil-cron` (den skriver allerede `tb_naeste_webinar` og `tb_medlem`) — HMAC over mailen med `WEBINAR_AFMELD_SECRET`s søster `RING_SECRET`. | én profilegenskab mere i profil-cronen (S); Klaviyo-teksten er Mortens |
| **C. Når webinaret bor i platformen** (§3) | efter sessionen, på vores egen «tak fordi du så med»-side | krydset står på siden, logget ind via tilmeldingens token — intet link at flette | fremtid |

**Ikke** i platformens før-webinar-mails (de handler om at komme), **ikke** i «Mødte ikke op»-flowet (de har ikke hørt Morten; et opkald uden webinar er et salgsopkald, de ikke bad om i samme forstand) — med mindre Jonas vil (spørgsmål 2).

### 2.3 Siden `/ring-mig-op` — teksten

Uguardet rute som `/ansoeg` (`App.tsx`), uden konto. Én skærm:

> **Skal Morten eller Jonas ringe dig op?**
> Vi ringer én gang, om The Boardroom — om det er noget for dig, og hvad du vil have ud af det. Ingen salgstrappe, ingen SMS, ingen nyhedsbreve ud af det her.
>
> Navn · E-mail (forudfyldt og låst, når tokenet findes) · Telefon · Hvornår passer det? (formiddag · eftermiddag · lige meget) · Et par ord om, hvad du vil tale om (valgfrit, 280 tegn)
>
> ☐ **Ja, I må ringe mig op.** Jeg giver samtykke til, at Topix.dk ApS gemmer mit telefonnummer, så Morten Larsen eller Jonas Herlev kan ringe mig op én gang om The Boardroom. Nummeret bruges ikke til andet og slettes senest 90 dage efter. Jeg kan trække samtykket tilbage ved at skrive til kontakt@topix.dk. [Persondata]
>
> [Ring mig op]

Krydset er tomt. Knappen er inaktiv, til krydset er sat og nummeret har form. Kvitteringen er på siden («Tak — du hører fra os på hverdage inden for et par dage»), **ingen kvitteringsmail** (overmailing; og mailen ville være et løfte om et tidspunkt, vi ikke har sat). Ordlyden låses af et kildeværn (som persondatateksten), fordi den ER samtykket.

### 2.4 Hvad gemmes — `opkaldsanmodninger`

| kolonne | hvorfor |
|---|---|
| `id uuid` | |
| `email text` (lower) · `email_bekraeftet boolean` | `true` når tokenet bar mailen (B/C); `false` fra A uden token — rådgiveren ser det, og en falsk mail kan ikke skade: det er et NUMMER, nogen bad om at få ringet op på |
| `navn text` | |
| `telefon text` | E.164 (`+45…` som standard), dømt af en ren funktion `telefonForm.ts` (8 cifre dansk; `+` og landekode ellers) — aldrig gemt rå |
| `tidsrum text` CHECK (`formiddag`/`eftermiddag`/`lige_meget`) | |
| `besked text` (≤ 280) | |
| `samtykke_tekst text NOT NULL` · `samtykke_at timestamptz NOT NULL` | bevisbyrden: ordlyden ORDRET, som den stod |
| `kilde text` CHECK (`webinar`/`klaviyo`/`direkte`) · `session_tid timestamptz null` | fra `?kilde=` + den seneste afholdte session på mailen (opslag ved oprettelsen, som webinarkoblingen) |
| `ip_hash text` · `user_agent text` | som `ansoegning_visninger`; aldrig rå IP |
| `status text` CHECK (`ny`/`ringet`/`ikke_truffet`/`lukket`) · `status_at` · `status_af uuid` · `notat text` | rådgiverens ene klik; `ikke_truffet` giver ét forsøg mere, så `lukket` |
| `slettes_at timestamptz NOT NULL` | = `samtykke_at + 90 dage`; se §2.5 |
| `trukket_tilbage_at timestamptz null` | tilbagetrækning: nummeret nulles STRAKS, rækken står til `slettes_at` som bevis for, at vi stoppede |

RLS: INSERT kun via service role (functionen), SELECT/UPDATE kun rådgivere (`has_role(auth.uid(), 'advisor')`), ingen medlem. `telefon` og `besked` er i `FORBUDTE_NOEGLER` for enhver deling (`webinar-delt` må aldrig bære dem — den gør det ikke i dag, og værnet `findMailVaerdier` fælder mails; et tilsvarende `findTelefonVaerdier` lægges ved siden af).

### 2.5 Opbevaring og sletning (forslag)

- **90 dage efter samtykket, uanset udfald** — langt nok til to opkaldsforsøg og en betænkningstid, kort nok til, at et nummer ikke ligger og venter på et formål, der er opfyldt. Et cron-job `opkald-opbevaring` (ren SQL, som `webinar-delinger-opbevaring`, migration-mønster `20260922021000`) sletter rækker med `slettes_at < now()`.
- **Blev personen ansøger** (mail-match i `ansoegninger` efter `samtykke_at`), lever telefonen videre på ANSØGNINGEN under dens eget grundlag — anmodningen slettes stadig efter 90 dage. Intet kopieres automatisk: rådgiveren opretter ansøgningen i det flow, der findes (`/ansoeg?kilde=webinar` sendt til personen), eller personen gør det selv.
- **Tilbagetrækning:** en mail til kontakt@ → rådgiveren trykker «Træk tilbage» på kortet → `telefon = null`, `trukket_tilbage_at = now()`. Ingen offentlig «træk tilbage»-side (den ville kræve endnu et token-link, og mail til kontakt@ er «lige så let», som krydset var).
- **Spor:** `status`-skift skrives i rækken, ikke i en spor-tabel — der er ét objekt og højst tre skift.

### 2.6 Hvordan rådgiveren får besked

- **Én klokke pr. anmodning** (`advisor_notifications`, ny type `opkald_oensket`, til HVER rådgiver — ingen tildeling, Jonas 1/10 «Rådgiverne er sammen om alle medlemmer»), skrevet af functionen i samme kald. Teksten: «Mette Hansen bad om et opkald (formiddag) — så webinaret 22/9». Ingen telefon i klokketeksten; den står på kortet.
- **Typen går på `MORGEN_TYPER`** i `_shared/klokkeMail.ts` — rådgiverens morgenmail kl. 07 på hverdage, aldrig straks. Begrundelse: personen er lovet «inden for et par dage», ikke «inden for en time», og en straks-mail pr. anmodning er præcis den overmailing, der blev klaget over. Kildeværnet `klokkeMail.guard` fælder typen, hvis den ikke står på en liste.
- **Kortet:** `/opkald` (AdvisorRoute, intet menupunkt — nås fra klokken, som `/nyheder`): én række pr. åben anmodning, nyeste først, med «Ringet» · «Ikke truffet» · «Luk» · «Træk tilbage». Når listen er tom, er siden tom. **Det er ikke en liste over leads; det er en kø af løfter.** På virksomhedschatten/ansøgningen vises intet — anmodningen lever, til den er lukket, og så er den væk (sletning §2.5).
- **Dublet:** én åben anmodning pr. mail (partielt unikt indeks `WHERE status = 'ny'`); en ny anmodning på samme mail inden for 90 dage opdaterer tidsrum/besked og giver ingen ny klokke.

### 2.7 Samspillet med webinarmails og Klaviyo

- **Ingen ny mail nogen steder** — hverken til personen (kvittering på siden) eller straks til rådgiveren (morgenmailen).
- **Klaviyo får intet** om anmodningen (ingen hændelse, ingen egenskab) — nummeret og ønsket er platformens. Hvis Jonas vil ekskludere dem, der har bedt om et opkald, fra «Morten skriver»-kampagnerne, er det én hændelse («Bad om opkald», uden nummer) til Klaviyo — spørgsmål 4.
- **Meta får intet.** En anmodning om opkald er ikke en `Lead`-hændelse, før Jonas beslutter det, og så kun med greb 2's samtykke.
- **Rykkerkøen rører den ikke:** anmodningen er ikke en ansøgning. Bliver den til én, overtager motoren.

### 2.8 Hvad der skal bygges

| del | hvad | størrelse |
|---|---|---|
| Migration `opkaldsanmodninger` + RLS + partielt unikt indeks + `opkald-opbevaring`-cron (sidst) | se §2.4–2.5; filhovedets første linje «IKKE KØRT …» | **S** |
| `_shared/ringToken.ts` | HMAC over mailen, egen secret `RING_SECRET`, konstant tid — kopi af `webinarAfmeldToken.ts` med andet navn og andet job (én secret, ét job) | **S** |
| `_shared/telefonForm.ts` + `opkaldDom.ts` (ren) | nummerets form, samtykketekstens ordlyd (konstant, kildeværn), status-overgange | **S** |
| Edge function `ring-mig-op` (offentlig, `verify_jwt = false` med begrundelse, Bucket C-klasse) | token FØRST hvis det findes (`laesRingToken`, registreret som prædikat i `scripts/check-edge-function-auth.ts`); uden token: IP-dagshash-loft (`SPOR_PR_IP_PR_TIME`-mønstret) + STRIKS body (kun kendte felter) + krydset skal være `true` og teksten tegn for tegn den kendte; skriver rækken, klokken (`writeNotificationToMany` til rådgiverne), svarer uden at røbe, om mailen findes | **M** |
| Flade `/ring-mig-op` (offentlig) | én skærm, §2.3; `sporVisning`-mønstret for vist/sendt (greb 1's tælling) | **S** |
| Flade `/opkald` (AdvisorRoute) + klokketype | kort med fire knapper; `MORGEN_TYPER` + guard | **S** |
| `klaviyo-profil-cron`: egenskaben `tb_ring_token` | kun for mails med en afholdt session de sidste 30 dage; skrives i webinarpasset (ikke bag `klaviyo_medlem_aktiv`) | **S** |
| Persondatateksten + topix.dk's privatlivspolitik | «opkald på anmodning», 90 dage | **XS** (Jonas godkender) |
| eWebinar: «Ikke klar»-knappen peger på `/ring-mig-op?kilde=webinar` | indstilling, ingen kode | **XS** |

**I alt M.** Rækkefølgen: migration KØRT og målt (`GET /rest/v1/opkaldsanmodninger?select=id&limit=0` med anon → 200, selv om RLS giver 0 rækker) → function udrullet (beviset: et kald uden body → 400 med listen af kendte felter, hvor `samtykke` står) → Update → eWebinar-knappen → Klaviyo-afsnittet. Alt bag tørkørsel/lås, som huset gør.

### 2.9 Spørgsmål til Jonas (højst 5) — med anbefalet svar

1. **Hvor skal spørgsmålet stå nu?** (a) eWebinars «Ikke klar»-knap + Klaviyos «Deltog»-mail 1, ingen ny mail — eller (b) en ny platform-mail efter webinaret. **Anbefalet: (a).** (b) er én mail mere til alle, der deltog, for at nå dem, der vil ringes op.
2. **Også til dem, der IKKE mødte op** (Klaviyos `SDVvCW`)? **Anbefalet: nej** i første omgang — de har ikke hørt Morten, og vi måler først, hvor mange deltagere der beder om det. Kan tændes med ét afsnit senere.
3. **Sletning 90 dage efter samtykket, uanset udfald?** **Anbefalet: ja.** Alternativet (30 dage) er for kort til «ikke truffet» og ferie; 180 er et nummer, der ligger uden formål.
4. **Skal Klaviyo få en hændelse «Bad om opkald» (uden nummer), så personen kan holdes ude af kampagner, mens vi ringer?** **Anbefalet: ja** — det er den eneste måde at undgå, at «Morten skriver» lander samme dag som Mortens opkald; hændelsen bærer kun mailen, som Klaviyo allerede har.
5. **Morgenmail (kl. 07 på hverdage) eller straks?** **Anbefalet: morgenmail** + klokken straks. Siden lover «et par dage»; og det er den regel, resten af klokkerne følger.

### 2.10 Jonas' svar 2/10-2026 kl. 07:38–07:39 — og hvad der er bygget (gren `feat/ring-mig-op`)

**Svarene, ordret valg:** «Kun dem, der deltog i webinaret — ja» · «Slet nummeret efter 90 dage — ja» · «Klaviyo får hændelsen «Bad om opkald» uden nummer — ja» · «Besked i morgenmailen, ikke straks — ja» · «Både Morten og Jonas får klokken — ja». På morgenlisten: «Ja, efter papiret». Grundtanken (1/10): «efter webinaret spørge folk om de ønsker at blive ringet op ang. The Boardroom … så får vi deres nummer og Morten eller Jonas giver dem et kald.» Ingen SMS, ingen ny mail, ingen liste over «varme leads».

**Vejen, Jonas 2/10 kl. 08:17:** NU spørges deltagerne gennem **en knap i Klaviyos EKSISTERENDE «Deltog»-mail** med et personligt link — en **profilegenskab** (fx `ring_op_url`), skrevet KUN for deltagere. SENERE: i platformens eget webinarrum, når webinaret er flyttet ind (del 3). Ingen ny mail, ingen SMS, ingen «varme leads»-liste.

**Hvad der afviger fra §2.3–§2.8, og hvorfor:**

- **Tokenet peger på TILMELDINGEN, ikke mailen** (`_shared/ringToken.ts`: HMAC over `ewebinar_id`, secret `RING_SECRET`). «Kun dem, der deltog» dømmes af rækken i `webinar_tilmeldinger` (`doemSetGrad` → `opkaldDom.harDeltaget`: kun `set`/`delvist`). Et HMAC over mailen ville åbne for ALLE tilmeldinger på den mail, også dem, der ikke mødte op.
- **Profilegenskaben `ring_op_url` skrives i SAMME kald som hændelsen «Deltog i webinar»** — ikke i `klaviyo-profil-cron` (§2.3 B foreslog `tb_ring_token` dér). Klaviyos Events API sætter profilegenskaber med hændelsen («You can create a new profile or update a profile's properties when creating an event» — `profile.data.attributes.properties`; SLÅET OP 2/10 i Events API overview rev. 2026-01-15 og Create Event-skemaet, IKKE målt i drift). `byggHaendelse` har fået `profilEgenskaber` (tomt sæt = kroppen byte-ens med før), og `byggFremmoede` sætter `ring_op_url` bag SAMME dom som hændelsesegenskaben: KUN «deltog» (set/delvist), aldrig «mødte ikke op». **Hvorfor ikke profil-cronen:** (a) den kører hver time, og «Deltog»-mail 1 går en time efter hændelsen — et kapløb, hvor mailen kan gå uden link; (b) profilpasset er bygget om felter, der sættes/fjernes sammen (`PROFIL_FELTER`), og har sin egen tilstand i `klaviyo_profil` — et tredje felt ville kræve migration og et nyt pas for noget, hændelseskaldet allerede bærer. Linket står OGSÅ som hændelsesegenskab (`{{ event.ring_op_url }}` = altid den session, der udløste flowet). `ewebinar-import` giver samme link videre (ellers bliver en «deltog», importen når først, uden link, og webhookens senere hændelse kasseres som dublet på samme `unique_id`). Profilen bærer linket, til en ny deltagelse overskriver det; linket åbner kun for en anmodning på den tilmelding.
- **eWebinars «Ikke klar»-knap bruges IKKE** (Jonas 08:17: knappen i «Deltog»-mailen nu, webinarrummet senere). Den kunne alligevel ikke bære et token (knappen kan ikke regne et HMAC), og «kun deltagere» udelukker en tokenløs vej.
- **Uden tidsrum, uden besked, uden status-trappe, uden «træk tilbage»-knap:** tabellen er navn, nummer (E.164), ordlyd, samtykke_at og rådgiverens ene klik (`ringet_at`/`ringet_af`). Tilbagetrækning = en mail til kontakt@ og en rådgiver, der sletter rækken i SQL editor (ingen klient-DELETE). Kan udvides, når der er målt et behov.
- **Sletning, ikke anonymisering:** rækken bærer intet andet end nummeret, navnet og samtykket til dem; «hvor mange bad om det» overlever i klokkerne og cron-loggens «DELETE n».
- **Klokken dedupper pr. tilmelding** (reference_id = rækkens id): et nyt «indsend» på samme tilmelding opdaterer nummer og samtykke_at og åbner anmodningen igen, men ringer ikke igen.

**Bygget (ikke kørt, ikke udrullet):** migration `20261002270000_opkaldsanmodninger.sql` (tabel, kolonneværn-trigger, RLS, cron `opkald-opbevaring` 05:33 UTC) · `_shared/opkaldDom.ts` ⇄ `src/lib/opkald/dom.ts` (paritet) · `_shared/ringToken.ts` · edge function `ring-mig-op` (verify_jwt = false, `laesRingToken` registreret i CI-værnet, STRIKS body, IP-dagsloft 10/time, bevis `"ring_mig_op": "skive-1"`) · `HAENDELSE.badOmOpkald` · `MORGEN_TYPER` + `opkald_anmodet` · `klokke.ts` «opkald» → `/opkald` · fladerne `/ring-mig-op` (offentlig) og `/opkald` (AdvisorRoute, intet menupunkt) · værn `ringMigOp.guard.test.ts` (7 domme) + `opkaldDom.test.ts` + `opkaldDom.paritet.test.ts`. Rækkefølgen i drift: `docs/OVERLEVERING.md` «2. oktober — Må vi ringe til dig?».

**Hvad Jonas sætter op udenfor repoet:** (1) secret `RING_SECRET` i Lovable (FØR deploy); (2) Klaviyo, «Deltog»-flowet `Wq3MkG`, mail 1 (EKSISTERENDE mail, ingen ny): en knap «Ring mig op» med linket `{{ person.ring_op_url }}`, pakket i `{% if person.ring_op_url %} … {% endif %}`, så en profil uden linket (mødte ikke op, før udrulningen, uden secret) ikke ser en død knap. `{{ event.ring_op_url }}` virker også i den mail og peger altid på den session, der udløste flowet — begge er sat i samme kald; (3) persondatateksten (§2.8 «XS, Jonas godkender»): «opkald på anmodning», 90 dage — IKKE rørt i koden. **Grænse at kende:** «Deltog»-flowet kræver Hovedlisten OG samtykke (`docs/tracking.md` §6 punkt 13) — en deltager uden for den får profilegenskaben, men ingen mail og dermed ingen knap.

---

## Del 3 — Hvad der skal være på plads, før webinaret flyttes ind i platformen, for at SMS giver mening senere

Én liste. SMS er sidst på den med vilje.

1. **Egen tilmeldingsformular** på platformen (`/webinar/tilmeld`), ikke eWebinars widget: session, navn, mail — og tre ADSKILTE, tomme kryds med hver sin ordlyd og hvert sit formål: «mål min annonce» (greb 2), «SMS en time før» (`mailplan` §3.2), «må vi ringe efter webinaret» (Del 2). Hvert kryds gemmes med ordlyd og tidspunkt. Telefonfeltet vises først, når et af de to telefon-kryds er sat, og nummeret gemmes med en FORMÅLS-markering (`telefon_formaal`), så et SMS-nummer aldrig bliver et opkaldsnummer.
2. **Sessionsmodellen hos os** (`webinar_sessioner`: tid, titel, kapacitet, afspilningskilde) — i dag udledes sessionerne af eWebinars `session_tid` på tilmeldingerne (en observation, ikke en nøgle — `webinaret-og-annoncerne.md` §8).
3. **Afspilningen og det personlige link**: Bunny Stream er allerede i huset (`webinar-video`, `bunnyAfspilUrl`); det personlige link bliver `/webinar/se?t=<token>` med samme token-klasse som afmeldingen. eWebinars 10-minutters-mail og `join_link` forsvinder — platformens `en_time` og «10 minutter før» overtager (én art mere i `PLANEN` + CHECK'en, migration FØR udrulning).
4. **Fremmødemålingen fra vores egen afspiller** (`set_procent` skrevet af os, aldrig af en hændelsestype — dommen i `_shared/webinarDom.ts` er allerede klar til tal fra en anden kilde), inklusive «så færdigt» ≥ 75 %. Uden den kan SMS'ens eneste formål (fremmøde) ikke måles.
5. **Baseline FØR SMS:** mindst to sessioner i platformen uden SMS, så «fremmøde med SMS mod uden» (Wilson, samme session, `sammenlign`) har et grundlag, og «for få» (< 5) ikke dømmer alt.
6. **Afmeldingen ét sted:** `webinar-afmeld` afmelder i dag platformens mails + Klaviyo; den skal også slukke SMS-krydset og opkalds-samtykket for den mail (ét klik, én betydning — samme regel som 22/9).
7. **STOP-håndtering** for SMS (indgående svar → `sms_afmeldt_at` på mailen, gælder alle fremtidige sessioner) — det kræver en udbyder med indgående beskeder, se 9.
8. **Sporet `webinar_sms`** med databasens dom «én pr. (nummer, session)» (`WHERE udfald = 'ok'`), tørkørsel som standard, lås i `app_config`, loft og tidsbudget som `webinar-mail-cron` — hele mønstret findes og kopieres.
9. **SMS-udbyder valgt og slået op** (EU-datacenter, pris pr. SMS, API med leveringskvittering og indgående STOP, ingen idempotensnøgle = vores spor er nøglen). Ikke slået op endnu (`mailplan` §4).
10. **Persondatateksten** opdateret med alle tre formål og opbevaringen (telefon slettes 7 dage efter sessionen for SMS, 90 dage efter samtykket for opkald).
11. **Klaviyo-hændelserne uændrede** («Deltog»/«Moedte ikke op», `tb_naeste_webinar`), så mailprogrammet efter webinaret ikke knækker, når kilden skifter fra eWebinar til os.
12. **Først derefter SMS** — og KUN som erstatning for `en_time` for dem med kryds (anbefalingen i `mailplan` §3.1), målt mod baseline i punkt 5.

Rækkefølgen 1–4 er flytningen; 5–11 er det, SMS forudsætter; 12 er SMS.

---

## Bogføring

- **Hvorfor «kun med samtykke» ikke betyder «bannerets ja»:** bannerets samtykke dækker cookies på topix.dk; Metas server-hændelse for en tilmelding kan bæres af et eget, specifikt samtykke på tilmeldingen (greb 2), som er renere og rammer flere. Det er ikke en omvej — det er det samtykke, GDPR faktisk beder om til den behandling.
- **Hvorfor opkaldet ikke er en ny mail:** klagen 22/9 og mailprogrammets «én ejer pr. mail». Spørgsmålet lægges i to steder, der allerede findes.
- **Hvorfor ingen tildeling og ingen liste:** Jonas 1/10 (begge). En klokke pr. anmodning, til alle rådgivere, væk når den er lukket.
- **Åbent efter 2/10 (del 2 bygget):** (e) spørgsmålet i platformens eget webinarrum (Jonas 08:17 «senere») — bygges med flytningen; (f) knappen med `{{ person.ring_op_url }}` i Klaviyos «Deltog»-mail skal ses i en rigtig mail, og profilegenskaben MÅLES på en rigtig deltagers profil efter første «Deltog i webinar» (slået op, ikke målt); (g) persondatateksten.
- **Åbent, der skal MÅLES før noget bygges:** (a) eWebinars pixel ved «Afvis» (§1.5.2); (b) om eWebinar kan flette mailen i CTA-knappens URL og om formularen kan bære et kryds; (c) topix.dk's banner — første lag ordret, timing, farver, `localStorage`-utm før samtykke; (d) hvad «Ikke klar til at ansøge endnu» fører til i dag.
- **Fejl at huske:** opslaget i Erhvervsstyrelsens PDF (`vejledning-cookiebekendtgorelse.pdf`, 2019-mappen) viste sig at indeholde den ÆLDRE tekst, der stadig tillod «klik videre»-samtykke; den gældende linje (aktiv handling, afvis lige så let) står i Dansk Erhvervs referat af december 2019-opdateringen og i 2022-tilsynet. Citér derfor tilsynet, ikke PDF'en, for «lige synlige».

## Sources

- Erhvervsstyrelsen — [Vejledning om cookiebekendtgørelsen (PDF, ældre tekst)](https://erhvervsstyrelsen.dk/sites/default/files/2019-10/vejledning-cookiebekendtgorelse.pdf)
- Dansk Erhverv — [Opdateret cookievejledning fra Erhvervsstyrelsen (december 2019)](https://www.danskerhverv.dk/presse-og-nyheder/nyheder/2019/december/opdateret-cookievejledning-fra-erhvervsstyrelsen/)
- Dansk Erhverv — [Erhvervsstyrelsens tilsyn med cookiebannere afslører problemer (juni 2022)](https://www.danskerhverv.dk/presse-og-nyheder/nyheder/2022/juni/erhvervsstyrelsens-tilsyn-med-cookiebannere-afslorer-problemer/)
- Lovguiden — [Datatilsynets og EU-Domstolens praksis om gyldigt samtykke, dark patterns, cookie walls](https://www.lovguiden.dk/praksisoversigt/cookies-samtykke)
- IAPP — [Denmark's DPA decides cookie walls that block content violates user consent](https://iapp.org/news/b/denmarks-dpa-decides-cookie-walls-that-block-content-violates-user-consent) · [Danish DPA issues cookie wall guidance](https://iapp.org/news/b/danish-dpa-issues-cookie-wall-guidance)
- EDPB — [Guidelines 03/2022 on deceptive design patterns in social media platform interfaces (v2.0)](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-032022-deceptive-design-patterns-social-media_en)
- Nouwens et al. 2020 — [Dark Patterns after the GDPR: Scraping Consent Pop-ups and Demonstrating their Influence (CHI)](https://arxiv.org/abs/2001.02479v1)
- Utz et al. 2019 — [(Un)informed Consent: Studying GDPR Consent Notices in the Field (CCS)](https://deceptive.design/articles/un-informed-consent-studying-gdpr-consent-notices-in-the-field)
- CNIL LINC — [A survey of user studies as evidence for dark patterns in consent banners](https://linc.cnil.fr/node/817)
- Forbrugerombudsmanden — [Vejledning om spamforbuddet (2021)](https://forbrugerombudsmanden.dk/media/bjajzdv1/vejledning-om-spamforbuddet-2021-a.pdf) · [Hvornår må erhvervsdrivende henvende sig](https://forbrugerombudsmanden.dk/media/02odpcge/hvornå-må-erhvervsdrivende-henvende-sig_2.pdf) · [Oversigt over reglerne for telefonsalg](https://forbrugerombudsmanden.dk/media/56664/oversigt-over-reglerne-for-telefonsalg.pdf)
- Dansk Erhverv — [Ny vejledning om samtykke fra Datatilsynet (september 2019)](https://www.danskerhverv.dk/presse-og-nyheder/nyheder/2019/september/ny-vejledning-om-samtykke-fra-datatilsynet/)
- Google — [GA4: Behavioral modeling for consent mode](https://support.google.com/analytics/answer/11161109?hl=en)
- Cookie Information — [Basic vs. Advanced Consent Mode v2](https://cookieinformation.com/?p=102082)
- Meta — [Meta Pixel: GDPR (consent revoke/grant)](https://developers.facebook.com/docs/meta-pixel/implementation/gdpr)
