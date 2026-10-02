# Community og Netværk — recon og værdianalyse

Skrevet 29/9-2026 aften til opstart 30/9. Grundlag: `main` @ `e83cfcc` (29/9). Repoet er kun læst; intet er ændret, committet eller kørt mod prod.

**Regel i dokumentet:** DEL 1 er kun fund (fil:linje, eller dokument og dato). Det, der ikke er målt, står som «ikke målt». DEL 2 er min vurdering og er mærket som sådan. Tal fra prod er ikke målt af mig. De er hentet fra docs og har dato og kilde.

---

# DEL 1 — FUND

## 1.1 Hvad findes i dag

| Del | Hvor | Hvad det er (målt i koden) |
|---|---|---|
| Feed | `/community` → `CommunityView.tsx` (route `App.tsx:303`) | Ét feed, `hentFeed(30)` (`:198`). Ingen paginering, ingen søgning, ingen kategorier eller emner. Sorteret fastgjorte først, derefter seneste aktivitet. Like-knap i rækken (`:164`, bygget #880 14/9). |
| Tråd | `/community/:id` → `CommunityTraadView.tsx` (`App.tsx:304`) | Ét niveau svar, like på tråd og svar, redigér/slet eget, rådgiver kan skjule. Svar kalder `notificerSvar` (`:211`). |
| Composer | `CommunityComposer.tsx` | Tiptap: tekst, billeder, filer, `@`-nævnelse af medlem, `#`-henvisning til lektion, event, rabataftale og andet opslag. Tekstversionen (`indhold`) udledes ved skrivning af SQL (`community_json_til_tekst`). |
| `OMRAADE_LABELS` (`CommunityComposer.tsx:294`) | | Er IKKE community-områder. Det er Akademiets områder (classroom, academy, rabataftaler, quick_wins, start_her — quick_wins skjult for medlemmer 1/10 og taget ud af listen) til `#`-henvisninger. Feedet har ingen områder. |
| Præsentation | `/community?praesentation=1`, `praesentation.ts`, migration `20260911120000` | Opslag med `kilde_type = 'praesentation'`. Tjeklistepunkt (`onboardingTjekliste.ts:21,47`). Composeren starter tom (Jonas 16/9). |
| Kilde-tags | `CommunityView.tsx:73-80` | Tags «Fra ugens push» og «Fra en live session» findes. Jeg fandt intet kaldested i `src/` eller `supabase/functions/`, der opretter tråde med `content_item` eller `event` som kilde (`kildeType` sendes kun som `praesentation`). Ikke målt: om prod har sådanne tråde. |
| Medlemssporet i Community | `CommunityMedlemmer.tsx`, `communityMedlemmer.ts` (#579) | Alle medlemmer (ikke rådgivere) i en 288 px kolonne ved siden af feedet, dem med `ask_me_about` først. Links til `/medlemmer/{id}`. |
| Forsiden «Fra fællesskabet» | `BoardroomView.tsx:2621`, `forsideOpslag.ts:40` | Det nyeste opslag fremhævet plus to rækker. |
| Netværket (kataloget) | `/medlemmer` → `MemberDirectoryView.tsx` (`App.tsx:286`) | Kort-grid. Klientside-søgning på navn, virksomhed, branche, by, «det laver vi», «det har jeg været igennem», «leder efter» og tags (`:13-27`). Ingen filtre, ingen «match». |
| Profil | `/medlemmer/:userId` → `MemberProfileView.tsx` (`App.tsx:287`) | Faktalinje (branche · by · stiftet · medlem siden), tre tekstfelter, tags. Eneste udgående handlinger er Website og LinkedIn (`:98-108`, `:178-195`). |
| Profildata | `member_profiles` (`20260810120000`, `20260810200000`), `companies.description/city/industry_label` | «Det laver vi» 160 tegn, «Det har jeg været igennem» 300 (`ask_me_about`), «Det leder jeg efter» 200 (`working_on`), `expertise text[]`, `linkedin_url`. Beslutning 9/9: ingen tal mellem medlemmer, «vi skal IKKE vise tal mellem medlemmer, som de ikke selv har valgt at skrive» (`netvaerksprofil.ts`). |
| Adgangsdom, Community | `har_aktivt_medlemskab` (`20260811160000:26-42`), fail-closed | Aktivt, ikke-legat, `contract_end_date` i fremtiden. Bærer RLS på alle fire community-tabeller. |
| Adgangsdom, Netværket | `get_member_directory` (`20260902110000`): `is_membership_active` (fail-open) plus `vis_i_netvaerk` | De to mængder er forskellige. Se `docs/adgangsdomme.md` §1 (dom 3 mod dom 4). To gæster er skjult i Netværket, men ser en tom Community og får «Ingen adgang» ved skrivning (kort #162). |
| Notifikationer | `notify-community-opslag`, `-svar`, `-naevnelse` (Bucket A) | Nyt opslag: `important` til alle med adgang (`notify-community-opslag/index.ts:122-129`), mail efter 15 min hvis uset, samlemail kl. 17. Svar: KUN trådens forfatter, `info`, aldrig mail (`notify-community-svar/index.ts:119`). `@`-nævnelse: `important` plus mail. |
| Rådgiverne | `advisor_notifications` (#920), «Ubesvarede opslag» (`ubesvaredeOpslag.ts`, 14 dage, `RaadgiverForsideView.tsx:473`) | Klokke pr. nyt medlemsopslag. Forsidekort med medlemmers opslag uden rådgiversvar. Rådgivere kan læse og skjule alt. |
| Events | `/events`, `/events/:id`, `events`, `event_registrations`, `event_vaerter` | Typerne `live_sparring`, `workshop`, `event` (`EventsView.tsx:21`). `meet_url` (online). Deltagerlisten på eventet linker til profilerne (`EventDetailView.tsx:391-410`). `events` har INGEN lokationskolonne (`types.ts`, kort #169). |
| Chat | `/chat`, `conversations` + `messages` | Kun medlem ↔ rådgiver. Medlemmer kan ikke skrive til hinanden i chatten (se 1.2). |
| Circle | Se nedenfor | Ingen aktiv kode. |
| Slack | `send-slack-chat/feedback/handout/report-notification` | Ingen Slack-reference i de tre `notify-community-*`-funktioner. Community er ikke koblet til Slack. |
| Dødt lag | `group_conversations` / `group_messages` (`20260315201705`) | Ingen læser i `src/` (OVERLEVERING linje 8308-8313, recon 16/9). Står som kandidat til sletning i kort #241. |

**Circle, hvad der er målt:**
- Ingen edge function nævner Circle. `grep -i circle supabase/functions` giver kun to binære XLSX-testfiler.
- Tabellerne `circle_oauth_codes` og `circle_oauth_tokens` (`20260328062602`) findes og har ingen læser i koden.
- `Community.tsx:6` siger, at feedet «erstatter den tidligere linkside til den eksterne Circle-platform». `community-design.md` (3/9): «Community flyttes fra Circle».
- `CLAUDE.md:67` nævner stadig «Circle (community)» under integrationer. Det er forældet.
- Den gamle Stripe-konto er stadig Circle-opsat (Connect, 0,5 % application fee). Den havde 15 aktive abonnementer 14/9 (OVERLEVERING 7927).
- **Ikke målt:** om Circle-fællesskabet stadig er åbent for medlemmer, hvad det koster, og hvad der ligger af aktivitet dér.

## 1.2 Hvordan finder et medlem andre? Kan de skrive til hinanden?

- **Finde:** `/medlemmer` (søgning og kort), sidebaren i Community, deltagerlisten på et event, `@` i composeren og profilnavne i opslag. Feedets forfatternavn er ikke et link (`CommunityView.tsx`, `TraadRaekke`). Målt: `/medlemmer/` linkes fra `CommunityDokument.tsx:231` (nævnelser), `CommunityMedlemmer.tsx:52` og `EventDetailView.tsx:394`.
- **Direkte besked medlem til medlem: nej.**
  - Profilen har ingen «skriv til» og ingen kontaktoplysninger. `MemberProfile`-typen (`memberProfile.ts:15-36`) har hverken e-mail eller telefon, og RPC'erne udleverer dem aldrig.
  - Chatten kan ikke bære det. Recon 16/9 talte 26 steder, der antager en rådgiver som modpart (OVERLEVERING 8308-8313).
  - Det eneste sted, hvor to medlemmer taler i samme tråd, er Community.
  - Sitets løfte om at «skrive direkte til de andre medlemmer» blev fjernet 17/8. Kortet er flettet ind i #158.
- **Det nærmeste, der findes:** `@`-nævnelsen. Den giver den nævnte en `important`-notifikation og en mail efter 15 min. Den bruges i dag kun inde i et offentligt opslag.

## 1.3 Data om brug og tidsstempler

| Hvad | Tabel og kolonne | Tidsstempel | Bemærkning |
|---|---|---|---|
| Opslag | `community_traade` | `created_at`, `updated_at`, `sidste_svar_at` | Status aktiv, skjult eller slettet. `antal_svar` og `antal_visninger` er triggerede caches. `kilde_type` skelner præsentationer. |
| Svar | `community_svar` | `created_at`, `updated_at` | Et niveau. Status som opslag. |
| Reaktioner | `community_reaktioner` (`type` er kun `like`) | `created_at` | Ét like pr. bruger pr. objekt. Ved fortryd slettes rækken (DELETE), så fortrudte likes kan ikke måles. |
| Visninger | `community_visninger` | `set_at` (første visning) | Én række pr. (bruger, tråd). Antal gange, tidspunkter efter første gang og læsetid findes ikke. |
| Notifikationer | `notifications` (`type` er `community_opslag`, `community_svar` eller `community_naevnelse`) | `created_at`, `seen_at`, `read_at`, `email_sent_at` | Måler nåede-frem og åbnet-i-app. Mail-åbning er ikke målt. |
| Rådgiverklokke | `advisor_notifications` | `created_at`, `read_at`, `mailet_at` | |
| Login | `user_login_log` | `logged_in_at` | Kun loginhændelser. Ikke sidevisninger. |
| Profilaktivitet | `member_profiles` | `updated_at`, `working_on_updated_at` | Friskhed af «leder efter». |
| Forsiden | `forside_sidst_set` | `set_at` | |
| Events | `event_registrations` | `registered_at`, `cancelled_at`, `response` (attending/declined) | Tilmelding, ikke fremmøde. Jeg fandt ingen fremmødekolonne for medlemsevents. |
| Chat med rådgiver | `messages` | `created_at`, `sender_id`, `message_type` | Til sammenligning. |

## 1.4 Tidligere målinger, som docs bærer (ikke mine)

- **3/9 (`community-design.md` §2):** seks tråde, alle inden for 30 dage. To svar. 26 med community-adgang, 3 rådgivere. Jonas skrev fire af de seks. Opslagene blev set af 3–4 ud af 26.
  - Konklusion dengang: folk svarer ikke, fordi de ikke ser opslagene. Det blev løst med opslagsmailen (#576) og forsidesektionen (#577).
- **11/9:** «10 tråde i tabellen, alle uden kilde» (`20260911120000`, filhoved).
- **16/9 (OVERLEVERING ~8300):** kohorte på 23 nye medlemmer: `community inden dag 30: 0/23`. Forbehold i dokumentet: Community fandtes først fra midt august, og ingen af de 23 havde haft rytmen.
- **16/9:** 25 `community_opslag`-notifikationer fra 10:06 og samlemailen «1 nyt medlem har præsenteret sig» til 23 modtagere.
- **10/9:** nul af 31 havde slået «Opdateringer» fra (kort #243).
- **Efter 16/9:** jeg fandt ingen måling af Community-brug i docs. Effekten af opslagsmail, forsidevægt, like fra feedet og rådgiverklokke er ikke målt.

## 1.5 Kendte mangler og kort om Community (`docs/mangelliste-gennemgang-22-09.md`, `mangelliste.html`)

`docs/opstart-30-09.md` nævner kun w13 (linje 109), L3536 (video, linje 222), L3970 (mailnøgle, linje 222) og `w18`-familien ved ID. Status er fra gennemgangen 22/9 (kolonnen «Anbefaling»).

| Kort | Indhold | Status 22/9 | Indsats |
|---|---|---|---|
| **#158** | Medlem-til-medlem, form C: privat tråd i Community (to deltagere), og «Foreslå intro» som rådgiverhandling. Jonas 16/9: «Vi vil ikke gå på kompromis. Men det haster ikke lige nu.» Game changer 3/5. | mangler, Byg | M privat tråd, S foreslå intro |
| #161 | Ugens nyheder som én ugentlig auto-tråd | idé, Beslut | S |
| #162 / `w13` | En gæst skal møde en grænse, ikke en fejl (fem adgangsdomme uenige om NULL) | fejl, Byg | S |
| #165 | Profilens faktalinje mangler i prod, om `20260909150000` er kørt (én SELECT) | mangler, Mål | XS |
| #166 | Profilredigering på egen profilside. Rådgivere kan ikke rette deres egen netværksprofil. | mangler, Byg | S |
| #168 | Ingen søgning på tværs (Community, Akademiet, chat) | mangler, Byg | S |
| #169 | Events har ingen lokation | mangler, Byg | S |
| #170 / `w18` | Top posts, svar-mails til alle i tråden. «Lav værdi, kan vente til der er trafik.» | idé, Arkivér | — |
| #171 | Affiliate: 10.000 kr. for at henvise et nyt medlem | idé, Beslut | L |
| #173 (L3536) | Video i Community: huset eller ethvert medlem? Efter Circle-exit. | beslutning | Stor |
| #240 | Slettefunktionen nævner ikke `community_reaktioner`, `community_visninger` | mangler, Mål | XS |
| #241 | Døde tabeller, herunder `group_conversations` og `group_messages` | mangler, Byg | S |
| #243 (L3970) | Sjette mailnøgle for Community, udsat til nogen slår «Opdateringer» fra | beslutning, Vent | — |
| Flettet | «Peer-matching i Netværket» er flettet ind i #158 (manuelt: Morten vælger to medlemmer, begge får besked; «ingen algoritme før der er 100») | — | — |

**Forældede punkter i docs (målt mod koden):**
- `community-design.md` §9 «Reaktionsknappen findes kun inde i tråden» er forældet. Like fra feedet er bygget (`CommunityView.tsx:164`, #880).
- `CLAUDE.md:67` (Circle som integration) er forældet.

## 1.6 Hvad kan IKKE måles herfra

- Alt prod-data: antal opslag, svar, skribenter, visninger og likes. Målingen i 2.3 er skrevet til at afklare det.
- Om migrationerne bag de nyeste community-funktioner er kørt i prod (bl.a. `20260929180000_community_tekst_rabathenvisning`). Prods RLS og RPC-kroppe blev sidst målt mod migrationerne 16/9 (OVERLEVERING 8308).
- Om Circle stadig er åbent og bruges, og hvad det koster.
- Sidevisninger på `/community` og `/medlemmer`, hvem der har set hvilken profil, hvad medlemmer søger efter i Netværket (søgningen er klientside og logges ikke), og mail-åbninger for opslagsmailen. `community_visninger` og `user_login_log` er de nærmeste proxier.
- Medlemmernes ønsker og behov. Der findes ingen survey eller interview i repoet. Alt i DEL 2 om behov er hypotese, til det er spurgt.
- Kontakt medlemmer imellem uden om platformen (LinkedIn, telefon, events). Findes ingen steder som data.
- Fremmøde til events (kun tilmelding).
- Hvor mange af de 26 der har en udfyldt netværksprofil. Målingen sektion 6 tæller det.

---

# DEL 2 — VÆRDIANALYSE (min vurdering, ikke fund)

## 2.0 Udgangspunkt

1. **Skalaen er ca. 26 betalende medlemmer** (22/9, `erIGrundmaengden`), tre rådgivere og Netværket på 28 rækker (2/9). Det er en lille mængde. Et åbent forum har brug for hundredvis for at bære sig selv. Kun retninger, der virker med små tal og med rådgivere som motor, giver mening nu.
2. **De eneste målte tal (3/9) peger på opdagelse, ikke indhold.** Opslagene var gode (495–824 tegn), men blev set af 3–4 ud af 26. Opdagelsen blev derefter fikset (mail, forside, rådgiverklokke), uden at det er målt, om det virkede. Den første ting at finde ud af er derfor, om der er puls efter 3/9. Det tager en SELECT.
3. **Der mangler et verbum.** Netværket viser, hvem der har været igennem hvad (fint designet, 9/9). En profil har ingen måde at handle på. Kun website og LinkedIn. Løftet om «skriv direkte» blev fjernet 17/8. Kataloget er en udstilling uden dør.
4. **Fortrolighed er allerede afgjort i tone:** ingen tal mellem medlemmer (9/9), RPC'erne udleverer aldrig mail eller telefon, gæster er skjult. Ny funktion skal holde samme linje: kontaktoplysninger afsløres kun ved samtykke.
5. **To adgangsdomme.** Alt nyt, der ender i Community, bør bruge `har_aktivt_medlemskab`-dommen. Alt nyt, der ender i Netværket, bruger directory-dommen. Blandes de, kan man vise en person, der ikke kan åbne det, han bliver vist i (`get_community_medlemmer` er lavet netop af den grund).

## 2.1 Seks retninger

Størrelse: **S** en halv dag, **M** en til tre dage, **L** en uge eller mere. Kolonnerne følger «Værdi før byg» (`claude-regelsaet.md` §4a).

### A. «Bed om intro», rådgiverfaciliteret introduktion (kort #158, del 2)
- **Behov:** «Hvem kan jeg spørge om det her?» Kataloget svarer hvem, men ikke hvordan.
- **Idé:** Knap på en anden persons profil, ét fritekstfelt, en anmodning til rådgiverne. Rådgiveren spørger modparten og introducerer, eller afviser. Ingen kontaktoplysninger afsløres af platformen.
- **Genbrug:** profiltekster (`ask_me_about`, `working_on`), `advisor_notifications` og klokken, `skrivRaadgiverBesked`, samlemail og klokke-mail-lister, `notifications` (fri typestreng).
- **Risiko:**
  - Rådgivertid (kø). Afgrænset til det, der bedes om.
  - Fortrolighed lav: intet afsløres uden samtykke.
  - Konkurrenter: rådgiveren filtrerer.
  - Tomt rum: ingen.
  - Nyt klokke-type kræver plads i `klokkeMail.guard`-listerne (CLAUDE.md), ellers fælder værnet.
- **Størrelse:** S (anmodning plus klokke, rådgiveren gør resten i chatten). M hvis samtykke-håndtrykket bygges ind.

### B. Kataloget som «spørg mig om» / «leder efter»
- **Behov:** Finde den rigtige uden at scrolle 26 kort.
- **Idé:** filtre på branche, by og tag. «Leder efter» som egen synlig liste. «Nyt i netværket» (nye eller opdaterede profiler). En linje på forsiden: «N har været igennem det, du leder efter».
- **Genbrug:** `listMemberDirectory`, `matchesQuery`, `expertise`, `companies.industry_label/city`, `CommunityMedlemmer`, forsidens «Fra fællesskabet».
- **Risiko:**
  - Afhænger af udfyldning. Er `ask_me_about` og `working_on` tomme for de fleste, er kataloget et tomt rum i en anden form. Måles i sektion 6.
  - Uden A eller D er det stadig en udstilling.
  - Konkurrenter: branchefilter gør det lettere at finde en konkurrent. Det er en bevidst afvejning.
- **Størrelse:** S. Datamodellen findes.

### C. Efterlysninger, målrettede hjælpeopslag
- **Behov:** «Jeg leder efter én, der har prøvet X.» Det er det, «Det leder jeg efter» beder om, men i dag ender det som statisk tekst.
- **Idé:** en opslagstype (som `praesentation`) med kort spørgsmål, sendt til de 3–5 medlemmer hvis «har været igennem»/tags matcher, i stedet for til alle 26.
- **Genbrug:** composer, `community_traade.kilde_type` (CHECK-migration som `20260911120000`), `@`-nævnelsens notifikation og mail, `notify-community-opslag`, «Ubesvarede opslag» til rådgiverne.
- **Risiko:**
  - Fortrolighed: et spørgsmål afslører et forretningsproblem. Kun til medlemmer (som i dag), og valgmulighed «via rådgiver».
  - Målretning kræver en matchregel. Start manuel (rådgiveren vælger).
  - Tomt rum afbødes af målretningen.
  - Rådgivertid: lille, hvis rådgiveren tager 3–5 tags pr. spørgsmål.
- **Størrelse:** M.

### D. Små peer-grupper (4–6 medlemmer, fast rytme)
- **Behov:** sparring på tværs af samme fase, tillid, ansvarlighed. Navnet «The Boardroom» lover netop det.
- **Idé:** pilotgruppe på 5–6 udvalgte medlemmer, én facilitator, kadence (fx månedligt), lukket rum.
- **Genbrug:** `events` (`live_sparring`, `meet_url`), `event_registrations`, `event_vaerter` (flere værter), Google Meet. Et lukket tråd-rum ville kræve ny model. Lad være med at genoplive `group_conversations`.
- **Risiko:**
  - Rådgivertid: størst. Hver gruppe kræver en facilitator.
  - Sammensætning: undgå konkurrenter, og par dem på fase, ikke branche.
  - Lukkethed: gruppen skal kunne stole på, hvad der siges. Aftal en norm.
  - Tomt rum er mindst her (få personer, fast tidspunkt).
- **Størrelse:** L som produkt. Som manuel pilot ingen kode: Kalender, Meet, invitation fra rådgiveren.

### E. Lokale eller fælles events
- **Behov:** mødes fysisk. Tillid opstår hurtigere ansigt til ansigt.
- **Idé:** 1–2 «Boardroom-dage» om året, evt. hos Floor1 i Silkeborg (Jonas' eget coworking). Regionale træffe først, når der er tæthed nok.
- **Genbrug:** `events`, tilmelding, deltagerliste (den eneste flade, hvor medlemmer i dag ser hinanden med virksomhed), event-mails og -påmindelser, `companies.city`.
- **Risiko:**
  - Mangler `lokation` på events (kort #169, S).
  - Geografisk spredning: 26 medlemmer fordelt på hele Danmark giver 3–5 pr. region, dvs. tomt rum på lokale træf.
  - Rådgivertid og omkostning.
- **Størrelse:** S i platformen, L i drift.

### F. Succeshistorier («det har vi været igennem»)
- **Behov:** anerkendelse, social proof for medlemmet, materiale til ansøgere og webinaret.
- **Idé:** korte, godkendte historier fra medlemmer. Iværksætterlivet-podcasten er allerede formatet.
- **Genbrug:** «Fra fællesskabet», `content_items`, podcasten og Klaviyo-sporet, `praesentation`-formen.
- **Risiko:**
  - Fortrolighed: historier skal godkendes, og tal er udelukket (9/9-reglen).
  - Rådgivertid: redaktionelt arbejde.
  - Det er envejs. Det giver ikke medlemmer hinanden.
- **Størrelse:** S–M. Mest en redaktionel proces.

**Ikke anbefalet nu:** et beskedsystem i chatten (26 steder antager en rådgiver; `docs/OVERLEVERING.md` 8308-8313). Top posts og svar-mails (#170/`w18`, lav værdi uden trafik). Video fra medlemmer (#173, kræver moderation og opbevaring).

## 2.2 Anbefalet rækkefølge og første skive

**Rækkefølge:**
1. **Mål** (2.3). Én SELECT, ca. fem minutter. Den afgør, om problemet er opdagelse (feedet har puls, men få ser det) eller motivation (ingen svarer, selv når de ser det).
2. **Manuel pilot, ingen kode, 4 uger** (fire til seks introduktioner og ét ugentligt matchet spørgsmål via `@`-nævnelse). Det koster rådgivertid, men viser, om medlemmer vil tale med hinanden. Se «Første skive».
3. **Første bygning: A, «Bed om intro» (S).** Kun hvis piloten viser efterspørgsel.
4. **B, kataloget** (S), når sektion 6 viser, at nok profiler er udfyldt.
5. **C, efterlysninger** (M), hvis målingen viser, at feedet har puls men sjældne svar.
6. **E, lokation på events** (#169, S) kan bygges når som helst. Den er billig og kendt.
7. **D, peer-gruppe** som manuel pilot parallelt med 3–4. Det er den retning med størst potentiale og størst rådgivertid.
8. **F** følger podcasten og webinaret og behøver ikke platformen.

**Første skive (foreslået):**
- **Uge 0:** kør målingen. Læs den efter reglen i 2.3.
- **Uge 1–4, manuelt:**
  - Jonas og Morten laver 4–6 introduktioner mellem medlemmer ud fra profilteksterne («det har jeg været igennem» mod «leder efter»). De bruger chatten eller `@`-nævnelse.
  - Én gang om ugen stilles ét spørgsmål i Community, hvor to medlemmer, der har været igennem det, er nævnt. Det koster ca. 15 minutter pr. uge.
  - Log hvert forsøg: hvem, om modparten sagde ja, om de talte sammen (spørg bagefter).
- **Derefter, hvis det virker:** «Bed om intro» på profilsiden (retning A) med en `intro_anmodninger`-tabel (status: bedt, sendt, afvist) for at kunne måle, en klokke til rådgiverne, og ingen kontaktoplysninger i platformen. Migration køres i Lovable SQL editor før Update.
- **Afgrænsning:** privat tråd mellem to medlemmer (form C) venter til introer har vist, at samtaler opstår. Det er `#158`s M-del.
- Dette følger Jonas' egne ord: «vi vil ikke gå på kompromis, men det haster ikke» (16/9) og «ingen algoritme før der er 100». Det udskyder ikke den rigtige vej. Det tester den først.

## 2.3 Målingen, som Jonas kører først

Lovable SQL editor. Ét resultatsæt, sektion-kolonne, kun læsning. Lovable eksporterer kun sidste resultatsæt, og derfor er alt samlet i én `UNION ALL`.

**Teknisk status:** Syntaksen er kørt mod et lokalt stub-skema (Postgres 16, kolonnenavne fra `src/integrations/supabase/types.ts` og migrationerne). Den er IKKE kørt mod prod. Kør den, og send fejlmeddelelsen ved første fejl (kolonnenavne er strenge; det er forskellen mellem stub og prod).

```sql
WITH
raadgivere AS (
  SELECT DISTINCT ur.user_id
  FROM public.user_roles ur
  WHERE ur.role IN ('advisor', 'admin')
),
medlemmer AS (
  SELECT p.user_id
  FROM public.profiles p
  WHERE EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = p.user_id)
    AND public.har_aktivt_medlemskab(p.user_id)
    AND p.user_id NOT IN (SELECT user_id FROM raadgivere)
),
uger AS (
  SELECT (date_trunc('week', now() AT TIME ZONE 'Europe/Copenhagen') - (n * interval '1 week'))::date AS uge_start
  FROM generate_series(0, 11) AS n
),
haend AS (
  SELECT 'traad'::text AS art, t.forfatter_id AS bruger_id, t.created_at AS tid
  FROM public.community_traade t WHERE t.status = 'aktiv'
  UNION ALL
  SELECT 'svar', s.forfatter_id, s.created_at
  FROM public.community_svar s
  JOIN public.community_traade t ON t.id = s.traad_id
  WHERE s.status = 'aktiv' AND t.status = 'aktiv'
  UNION ALL
  SELECT 'peer_svar', s.forfatter_id, s.created_at
  FROM public.community_svar s
  JOIN public.community_traade t ON t.id = s.traad_id
  WHERE s.status = 'aktiv' AND t.status = 'aktiv'
    AND s.forfatter_id <> t.forfatter_id
    AND s.forfatter_id NOT IN (SELECT user_id FROM raadgivere)
    AND t.forfatter_id NOT IN (SELECT user_id FROM raadgivere)
  UNION ALL
  SELECT 'like', r.bruger_id, r.created_at FROM public.community_reaktioner r
  UNION ALL
  SELECT 'set', v.bruger_id, v.set_at FROM public.community_visninger v
),
haend2 AS (
  SELECT h.art, h.bruger_id, h.tid,
         (h.bruger_id IN (SELECT user_id FROM raadgivere)) AS er_raadgiver,
         date_trunc('week', h.tid AT TIME ZONE 'Europe/Copenhagen')::date AS uge
  FROM haend h
),
tal AS (
  SELECT
    (SELECT count(*) FROM medlemmer) AS n,
    (SELECT count(DISTINCT m.user_id) FROM medlemmer m
       WHERE EXISTS (SELECT 1 FROM haend2 h WHERE h.bruger_id = m.user_id AND h.art IN ('traad', 'svar'))) AS skrevet_alle,
    (SELECT count(DISTINCT m.user_id) FROM medlemmer m
       WHERE EXISTS (SELECT 1 FROM haend2 h WHERE h.bruger_id = m.user_id AND h.art IN ('traad', 'svar')
                       AND h.tid >= now() - interval '90 days')) AS skrevet_90d,
    (SELECT count(DISTINCT m.user_id) FROM medlemmer m
       WHERE EXISTS (SELECT 1 FROM haend2 h WHERE h.bruger_id = m.user_id AND h.art IN ('traad', 'svar')
                       AND h.tid >= now() - interval '30 days')) AS skrevet_30d,
    (SELECT count(DISTINCT m.user_id) FROM medlemmer m
       WHERE (SELECT count(*) FROM haend2 h WHERE h.bruger_id = m.user_id AND h.art IN ('traad', 'svar')) >= 2) AS skrevet_mindst_2,
    (SELECT count(DISTINCT m.user_id) FROM medlemmer m
       WHERE EXISTS (SELECT 1 FROM haend2 h WHERE h.bruger_id = m.user_id AND h.art = 'peer_svar')) AS peer_svar_nogensinde,
    (SELECT count(DISTINCT m.user_id) FROM medlemmer m
       WHERE EXISTS (SELECT 1 FROM haend2 h WHERE h.bruger_id = m.user_id AND h.art = 'like')) AS liket_nogensinde,
    (SELECT count(DISTINCT m.user_id) FROM medlemmer m
       WHERE EXISTS (SELECT 1 FROM haend2 h WHERE h.bruger_id = m.user_id AND h.art = 'set')) AS set_mindst_en,
    (SELECT count(DISTINCT m.user_id) FROM medlemmer m
       WHERE EXISTS (SELECT 1 FROM public.community_traade t WHERE t.forfatter_id = m.user_id
                       AND t.kilde_type = 'praesentation' AND t.status = 'aktiv')) AS praesenteret,
    (SELECT count(DISTINCT l.user_id) FROM public.user_login_log l
       WHERE l.user_id IN (SELECT user_id FROM medlemmer) AND l.logged_in_at >= now() - interval '30 days') AS login_30d,
    (SELECT count(DISTINCT l.user_id) FROM public.user_login_log l
       WHERE l.user_id IN (SELECT user_id FROM medlemmer) AND l.logged_in_at >= now() - interval '90 days') AS login_90d
),
pr_forfatter AS (
  SELECT h.bruger_id, count(*) AS antal,
         row_number() OVER (ORDER BY count(*) DESC, h.bruger_id) AS rk
  FROM haend2 h
  WHERE h.art IN ('traad', 'svar')
  GROUP BY h.bruger_id
),
profiler AS (
  SELECT m.user_id,
         p.avatar_url,
         mp.ask_me_about, mp.working_on, mp.working_on_updated_at, mp.expertise, mp.linkedin_url, mp.updated_at AS profil_opdateret,
         (SELECT c.description FROM public.company_members cm JOIN public.companies c ON c.id = cm.company_id
            WHERE cm.user_id = m.user_id ORDER BY cm.created_at, c.id LIMIT 1) AS virksomhed_beskrivelse,
         (SELECT c.industry_label FROM public.company_members cm JOIN public.companies c ON c.id = cm.company_id
            WHERE cm.user_id = m.user_id ORDER BY cm.created_at, c.id LIMIT 1) AS branche,
         (SELECT c.city FROM public.company_members cm JOIN public.companies c ON c.id = cm.company_id
            WHERE cm.user_id = m.user_id ORDER BY cm.created_at, c.id LIMIT 1) AS bynavn
  FROM medlemmer m
  JOIN public.profiles p ON p.user_id = m.user_id
  LEFT JOIN public.member_profiles mp ON mp.user_id = m.user_id
),
pr AS (
  SELECT count(*) AS n,
    count(*) FILTER (WHERE nullif(trim(avatar_url), '') IS NOT NULL) AS med_billede,
    count(*) FILTER (WHERE nullif(trim(ask_me_about), '') IS NOT NULL) AS med_vaeret_igennem,
    count(*) FILTER (WHERE nullif(trim(working_on), '') IS NOT NULL) AS med_leder_efter,
    count(*) FILTER (WHERE working_on_updated_at >= now() - interval '60 days' AND nullif(trim(working_on), '') IS NOT NULL) AS leder_efter_frisk_60d,
    count(*) FILTER (WHERE coalesce(array_length(expertise, 1), 0) >= 1) AS med_kompetencetags,
    count(*) FILTER (WHERE nullif(trim(linkedin_url), '') IS NOT NULL) AS med_linkedin,
    count(*) FILTER (WHERE nullif(trim(virksomhed_beskrivelse), '') IS NOT NULL) AS med_det_laver_vi,
    count(*) FILTER (WHERE nullif(trim(branche), '') IS NOT NULL) AS med_branche,
    count(DISTINCT branche) AS forskellige_brancher,
    count(*) FILTER (WHERE nullif(trim(bynavn), '') IS NOT NULL) AS med_by,
    count(DISTINCT bynavn) AS forskellige_byer,
    count(*) FILTER (WHERE profil_opdateret >= now() - interval '90 days') AS profil_opdateret_90d
  FROM profiler
),
ev AS (
  SELECT e.id, e.kind, e.starts_at, e.status,
         (SELECT count(*) FROM public.event_registrations r
            WHERE r.event_id = e.id AND r.response = 'attending' AND r.cancelled_at IS NULL
              AND r.user_id IN (SELECT user_id FROM medlemmer)) AS tilmeldte
  FROM public.events e
  WHERE e.status IN ('published', 'completed')
    AND e.starts_at >= now() - interval '12 months'
)

SELECT '0_grundlag' AS sektion, 'tidspunkt_dansk' AS noegle, to_char(now() AT TIME ZONE 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI') AS vaerdi
UNION ALL SELECT '0_grundlag', 'medlemmer_med_community_adgang', n::text FROM tal
UNION ALL SELECT '0_grundlag', 'raadgivere', (SELECT count(*)::text FROM raadgivere)
UNION ALL SELECT '0_grundlag', 'medlemmer_logget_ind_seneste_30_dage', login_30d || ' af ' || n FROM tal
UNION ALL SELECT '0_grundlag', 'medlemmer_logget_ind_seneste_90_dage', login_90d || ' af ' || n FROM tal

UNION ALL SELECT '1_totaler', 'aktive_traade', count(*)::text FROM public.community_traade WHERE status = 'aktiv'
UNION ALL SELECT '1_totaler', 'skjulte_eller_slettede_traade', count(*)::text FROM public.community_traade WHERE status <> 'aktiv'
UNION ALL SELECT '1_totaler', 'aktive_svar', count(*)::text FROM public.community_svar WHERE status = 'aktiv'
UNION ALL SELECT '1_totaler', 'likes_paa_traade', count(*)::text FROM public.community_reaktioner WHERE traad_id IS NOT NULL
UNION ALL SELECT '1_totaler', 'likes_paa_svar', count(*)::text FROM public.community_reaktioner WHERE svar_id IS NOT NULL
UNION ALL SELECT '1_totaler', 'foerste_visning_raekker', count(*)::text FROM public.community_visninger
UNION ALL SELECT '1_totaler', 'foerste_opslag', to_char(min(created_at) AT TIME ZONE 'Europe/Copenhagen', 'YYYY-MM-DD') FROM public.community_traade
UNION ALL SELECT '1_totaler', 'seneste_opslag', to_char(max(created_at) AT TIME ZONE 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI') FROM public.community_traade WHERE status = 'aktiv'
UNION ALL SELECT '1_totaler', 'seneste_svar', to_char(max(created_at) AT TIME ZONE 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI') FROM public.community_svar WHERE status = 'aktiv'
UNION ALL SELECT '1_totaler', 'opslag_af_raadgivere_pct', coalesce(round(100.0 * count(*) FILTER (WHERE forfatter_id IN (SELECT user_id FROM raadgivere)) / nullif(count(*), 0), 1)::text, 'ingen opslag') FROM public.community_traade WHERE status = 'aktiv'

UNION ALL
SELECT '2_pr_uge_seneste_12',
       to_char(u.uge_start, 'YYYY-MM-DD') || ' ' || a.art,
       'medlem=' || count(h.bruger_id) FILTER (WHERE NOT h.er_raadgiver)
         || ' unikke_medlemmer=' || count(DISTINCT h.bruger_id) FILTER (WHERE NOT h.er_raadgiver)
         || ' raadgiver=' || count(h.bruger_id) FILTER (WHERE h.er_raadgiver)
FROM uger u
CROSS JOIN (VALUES ('traad'), ('svar'), ('peer_svar'), ('like'), ('set')) AS a(art)
LEFT JOIN haend2 h ON h.uge = u.uge_start AND h.art = a.art
GROUP BY u.uge_start, a.art

UNION ALL SELECT '3_medlemmer_der_har_gjort_noget', 'har_skrevet_opslag_eller_svar_nogensinde', skrevet_alle || ' af ' || n || ' (' || round(100.0 * skrevet_alle / nullif(n, 0), 1) || ' %)' FROM tal
UNION ALL SELECT '3_medlemmer_der_har_gjort_noget', 'har_skrevet_seneste_90_dage', skrevet_90d || ' af ' || n || ' (' || round(100.0 * skrevet_90d / nullif(n, 0), 1) || ' %)' FROM tal
UNION ALL SELECT '3_medlemmer_der_har_gjort_noget', 'har_skrevet_seneste_30_dage', skrevet_30d || ' af ' || n || ' (' || round(100.0 * skrevet_30d / nullif(n, 0), 1) || ' %)' FROM tal
UNION ALL SELECT '3_medlemmer_der_har_gjort_noget', 'har_skrevet_mindst_2_gange', skrevet_mindst_2 || ' af ' || n FROM tal
UNION ALL SELECT '3_medlemmer_der_har_gjort_noget', 'har_svaret_paa_et_andet_medlems_opslag', peer_svar_nogensinde || ' af ' || n FROM tal
UNION ALL SELECT '3_medlemmer_der_har_gjort_noget', 'har_liket_noget', liket_nogensinde || ' af ' || n FROM tal
UNION ALL SELECT '3_medlemmer_der_har_gjort_noget', 'har_set_mindst_en_traad', set_mindst_en || ' af ' || n FROM tal
UNION ALL SELECT '3_medlemmer_der_har_gjort_noget', 'har_praesenteret_sig', praesenteret || ' af ' || n FROM tal
UNION ALL SELECT '3_medlemmer_der_har_gjort_noget', 'skribent_nr_' || rk || '_andel_af_alle_opslag_og_svar',
       round(100.0 * antal / nullif((SELECT sum(antal) FROM pr_forfatter), 0), 1) || ' % (' || antal || ' stk, '
         || CASE WHEN bruger_id IN (SELECT user_id FROM raadgivere) THEN 'raadgiver' ELSE 'medlem' END || ')'
FROM pr_forfatter WHERE rk <= 3

UNION ALL
SELECT '4_traade_seneste_90_dage',
       to_char(t.created_at AT TIME ZONE 'Europe/Copenhagen', 'YYYY-MM-DD') || ' ' || left(t.titel, 45),
       'forfatter=' || CASE WHEN t.forfatter_id IN (SELECT user_id FROM raadgivere) THEN 'raadgiver' ELSE 'medlem' END
         || ' kilde=' || coalesce(t.kilde_type, 'fri')
         || ' set_af=' || (SELECT count(*) FROM public.community_visninger v WHERE v.traad_id = t.id)
         || ' svar=' || (SELECT count(*) FROM public.community_svar s WHERE s.traad_id = t.id AND s.status = 'aktiv')
         || ' svar_fra_medlemmer=' || (SELECT count(*) FROM public.community_svar s WHERE s.traad_id = t.id AND s.status = 'aktiv'
                                         AND s.forfatter_id NOT IN (SELECT user_id FROM raadgivere) AND s.forfatter_id <> t.forfatter_id)
         || ' likes=' || (SELECT count(*) FROM public.community_reaktioner r WHERE r.traad_id = t.id)
FROM public.community_traade t
WHERE t.status = 'aktiv' AND t.created_at >= now() - interval '90 days'

UNION ALL
SELECT '5_notifikationer_til_medlemmer', nt.type,
       'i_alt=' || count(*) || ' set_i_appen=' || count(*) FILTER (WHERE nt.seen_at IS NOT NULL)
         || ' mailet=' || count(*) FILTER (WHERE nt.email_sent_at IS NOT NULL)
         || ' unikke_modtagere=' || count(DISTINCT nt.user_id)
FROM public.notifications nt
WHERE nt.type IN ('community_opslag', 'community_svar', 'community_naevnelse')
  AND nt.user_id IN (SELECT user_id FROM medlemmer)
GROUP BY nt.type

UNION ALL SELECT '6_profiler_hos_medlemmerne', 'har_billede', med_billede || ' af ' || n FROM pr
UNION ALL SELECT '6_profiler_hos_medlemmerne', 'har_skrevet_det_har_jeg_vaeret_igennem', med_vaeret_igennem || ' af ' || n FROM pr
UNION ALL SELECT '6_profiler_hos_medlemmerne', 'har_skrevet_det_leder_jeg_efter', med_leder_efter || ' af ' || n FROM pr
UNION ALL SELECT '6_profiler_hos_medlemmerne', 'det_leder_jeg_efter_opdateret_seneste_60_dage', leder_efter_frisk_60d || ' af ' || n FROM pr
UNION ALL SELECT '6_profiler_hos_medlemmerne', 'har_kompetencetags', med_kompetencetags || ' af ' || n FROM pr
UNION ALL SELECT '6_profiler_hos_medlemmerne', 'har_linkedin', med_linkedin || ' af ' || n FROM pr
UNION ALL SELECT '6_profiler_hos_medlemmerne', 'virksomheden_har_det_laver_vi', med_det_laver_vi || ' af ' || n FROM pr
UNION ALL SELECT '6_profiler_hos_medlemmerne', 'virksomheden_har_branche_forskellige', med_branche || ' af ' || n || ', ' || forskellige_brancher || ' forskellige' FROM pr
UNION ALL SELECT '6_profiler_hos_medlemmerne', 'virksomheden_har_by_forskellige', med_by || ' af ' || n || ', ' || forskellige_byer || ' forskellige' FROM pr
UNION ALL SELECT '6_profiler_hos_medlemmerne', 'netvaerksprofil_opdateret_seneste_90_dage', profil_opdateret_90d || ' af ' || n FROM pr

UNION ALL
SELECT '7_events_seneste_12_maaneder', ev.kind || ' ' || ev.status,
       'antal=' || count(*) || ' gns_tilmeldte_medlemmer=' || round(avg(ev.tilmeldte), 1)
FROM ev GROUP BY ev.kind, ev.status
UNION ALL
SELECT '7_events_seneste_12_maaneder', 'medlemmer_tilmeldt_mindst_et_event_seneste_180_dage',
       count(DISTINCT r.user_id) || ' af ' || (SELECT n FROM tal)
FROM public.event_registrations r
JOIN public.events e ON e.id = r.event_id
WHERE r.response = 'attending' AND r.cancelled_at IS NULL
  AND e.status IN ('published', 'completed') AND e.starts_at >= now() - interval '180 days' AND e.starts_at <= now()
  AND r.user_id IN (SELECT user_id FROM medlemmer)

UNION ALL
SELECT '8_sammenligning_chat_med_raadgiver_pr_uge',
       to_char(u.uge_start, 'YYYY-MM-DD'),
       'beskeder_fra_medlemmer=' || count(ms.id) || ' unikke_medlemmer=' || count(DISTINCT ms.sender_id)
FROM uger u
LEFT JOIN public.messages ms
  ON date_trunc('week', ms.created_at AT TIME ZONE 'Europe/Copenhagen')::date = u.uge_start
 AND ms.message_type = 'user'
 AND ms.sender_id IN (SELECT user_id FROM medlemmer)
GROUP BY u.uge_start

ORDER BY 1, 2;
```

**Hvad sektionerne svarer på:**

| Sektion | Spørgsmål |
|---|---|
| 0 | Hvor mange medlemmer har adgang, og hvor mange var inde de sidste 30 og 90 dage? Det er nævneren for alt andet. |
| 1 | Hvor meget findes i alt, og hvor stor en del er skrevet af rådgivere? |
| 2 | Opslag, svar, svar mellem medlemmer (`peer_svar`), likes og første visninger pr. uge, seneste 12 uger, delt i medlem og rådgiver. Har det haft puls efter 3/9? |
| 3 | Hvor stor en andel af medlemmerne har skrevet, svaret et andet medlem, liket, set noget, præsenteret sig? Hvor koncentreret er skrivningen (top 3)? |
| 4 | Opslag seneste 90 dage: hvem skrev (medlem/rådgiver), hvor mange har set, svaret, liket? |
| 5 | Nåede notifikationerne frem, og blev de set i appen? Det er proxy for, om opdagelsen virker. |
| 6 | Hvor mange af medlemmerne har udfyldt profilfelterne, og hvor mange forskellige brancher og byer findes? Afgør, om kataloget (B) kan bære. |
| 7 | Hvor mange events, og hvor mange medlemmer har tilmeldt sig mindst ét? Grundlag for E og D. |
| 8 | Hvor meget skriver medlemmerne til rådgiverne pr. uge? Benchmark: appetit på 1:1 mod fællesskab. |

**Foreslået læseregel (min vurdering, ikke en målt norm):**
- Sektion 3 `har_svaret_paa_et_andet_medlems_opslag` er nøgletallet for Netværket.
  - **Tæt på nul over 12 uger, selv når sektion 5 viser, at notifikationerne er set:** problemet er motivation, ikke opdagelse. Så prioriteres rådgiverfaciliteret kontakt (A, D) frem for mere åbent forum (C, feedet).
  - **Peer-svar findes, men få ser opslagene (lav `set_af`, sektion 4):** problemet er stadig opdagelse. Så giver målrettede opslag (C) mening.
- Er sektion 6 mager (færre end ca. halvdelen har «det har jeg været igennem»), går B efter at profilerne er udfyldt.
- Er sektion 1 `opslag_af_raadgivere_pct` høj, og sektion 3 viser, at top 3 skriver størstedelen, så er det i praksis en rådgiverkanal, ikke et netværk. Retning A og D er da det rigtige første skridt.

## 2.4 Åbne beslutninger til Jonas (dom pr. punkt: læg frem)

1. Er 4-ugers manuel pilot (2.2) det rigtige første skridt, eller vil du have «Bed om intro» bygget først? Min anbefaling er piloten, fordi den koster rådgivertid frem for kode, og fordi «Værdi før byg» kræver, at efterspørgslen er målt.
2. Hvem tager introduktionerne? Rådgivertid er den knappeste ressource i A, C og D.
3. Skal en introduktion kræve udtrykkeligt ja fra begge parter, før navne og kontakt deles? Min anbefaling er ja. Jeg har ikke vurderet det juridisk, og Jonas 21/9 har tidligere afgjort et lignende spørgsmål om Meta uden jurist. Det er dit valg.
4. Skal Circle lukkes helt, og hvornår? Ikke målt herfra, men det afgør, om historisk aktivitet dér skal med i målingen.
5. Skal `CLAUDE.md:67` rettes (Circle er ikke længere en integration)?

## 2.5 Beslutningen 2/10-2026 — rådgivernes «Spørgsmål», «Ubesvarede» og «Hvem kan hjælpe» (bygget på gren `feat/community-spoergsmaal`)

**Målt 2/10 (Jonas' tal):** 16 af 29 læser Community; 2 opslag og 2 svar fra medlemmer på 30 dage; 3 af 29 har «Spørg mig om» (`ask_me_about`). Mockuppen «Ny struktur» (ia-forslag, Community-fanen) foreslog et ugentligt spørgsmål fra rådgiverne.

**Jonas 2/10 kl. 07:26 (ordret):** «Vi vil ikke tvinges til at stille et nyt spørgsmål hver mandag, og det ville også gå ud over de opslag der kommer fra medlemmerne, da de drukner. Vi skal opnå større aktivitet blandt medlemmer, ikke kun større interaktion på rådgiveres spørgsmål. Men rådgivere skal i stedet kunne lave et opslag og markere det, så det lægger sig i toppen som et Spørgsmål. Det giver os større fleksibilitet.»

**Det, der blev besluttet og bygget (kun inde i Community-siden; Netværkets fanebjælke er en anden grens ærinde):**

1. **Markeringen, ikke pligten.** `community_traade.spoergsmaal_markeret_at` (migration `20261002243000`, KRÆVER JONAS' GRØNNE LYS: SECURITY DEFINER-RPC'er droppes og genskabes). Rådgiveren markerer sit opslag i composeren (afkrydsning under den) eller på trådsiden («Markér som Spørgsmål»); det ligger ØVERST, uden for strømmen, til markeringen fjernes. **Højst ét ad gangen** — en ny markering afløser den gamle (RPC'en `marker_community_spoergsmaal` rydder før den sætter; det delvist unikke indeks `community_traade_et_spoergsmaal_uidx` er databasens dom). **Kun rådgivere** kan sætte den, håndhævet i databasen (triggeren `community_traade_spoergsmaal_vaern` på INSERT og UPDATE — medlemmer har egen UPDATE-politik på tabellen) og i RPC'en (kalderen rådgiver og ikke tjenestekonto, opslaget aktivt, forfatteren rådgiver — et medlems opslag bliver aldrig «Spørgsmål fra rådgiverne»); triggeren dømmer en rådgivers direkte PATCH med de samme regler, og et skjult/slettet opslag mister markeringen (rådets fund 2/10). «N har svaret» tæller forskellige personer (`antal_svarere`), ikke svar. **Foldet** til én linje for den, der har svaret (`jeg_har_svaret` fra læse-RPC'erne), udfoldet for forfatteren.
2. **Filtret «Ubesvarede»** (chips «Alle / Ubesvarede (N)»): et medlems aktive opslag uden ét aktivt svar (`antal_svar = 0`, forfatteren ikke rådgiver efter Netværkets `is_advisor`). Rådgiverens egne opslag er aldrig «ubesvarede» her — forsidens kort (`ubesvaredeOpslag.ts`) dømmer rådgiverens side. Mærket «ubesvaret» står i rækkens metalinje.
3. **«Hvem kan hjælpe med …»** under feedet: højst tre medlemmer med udfyldt `ask_me_about` som «Spørg mig om: …»-kort (vinduet flytter én plads pr. dansk dag, så alle kommer forbi), plus læserens eget kort — tomt med «Skriv én linje» → profilfanen (`PROFIL_STI`). Netværkets egne rækker (hooken `useNetvaerketsRaekker` → `listMemberDirectory`, tjenestekonti filtreret) — ingen ny RPC.
4. **Medlemmernes opslag drukner ikke:** rådgivernes opslag uden markering ligger i strømmen som alle andre; **intet andet fastgøres** (`fastgjort` har fortsat ingen flade og røres ikke). Kildeværnet `communitySpoergsmaal.guard` låser det.

**Ikke bygget (bevidst, afventer):** mockuppens «Nogen venter på dig» (svar-forslag matchet på «Spørg mig om» — kræver en matchregel og en «ikke mig»-tilstand), «mest læst denne uge», «N fandt det nyttigt», chips «Spørgsmål / Præsentationer / Fra rådgiverne». Retning A–F ovenfor står uændrede; dette er en syvende, lille skive, der svarer på de målte tal (medlemmerne skriver ikke; ingen ser hvem man kan spørge).

**Dommene:** `src/lib/hjemmebane/communitySpoergsmaal.ts` (feedet delt, ubesvaret, filtret, knappen) og `src/lib/hjemmebane/communityHjaelpere.ts` (kortene). **Fladen:** `CommunityView.tsx` (kort, chips, afkrydsning), `SpoergsmaalKort.tsx`, `HvemKanHjaelpe.tsx`, `CommunityTraadView.tsx` (mærke + markér/fjern). **Rækkefølgen:** grønt lys → FØR-SQL (gæstens `20261002242000` KØRT først; sammenlign `pg_get_functiondef` med `20261002242000` — porten `kan_laese_community`; afviger én, STOP) → migrationen i SQL editor → EFTER-SQL → Update. Klienten er fail-soft før kørslen (ingen markering i svaret → feedet som i dag; markér-knappen fejler med en toast, opslaget er delt).

## Filer

Kode og migrationer: `src/components/hjemmebane/community/*`, `src/components/hjemmebane/members/*`, `src/lib/hjemmebane/{communityApi,communityMedlemmer,memberProfile,netvaerksprofil,praesentation,ubesvaredeOpslag}.ts`, `supabase/functions/notify-community-{opslag,svar,naevnelse}/index.ts`, `supabase/migrations/{20260811140000_community,20260811160000_community_adgang,20260812150000_community_naevnelse_rpc,20260810120000_member_profiles,20260810200000_profil_struktur,20260902110000_gaest_i_netvaerk,20260911120000_praesentation_kilde,20260315201705_*}.sql`.

Docs: `docs/community-design.md`, `docs/adgangsdomme.md`, `docs/mangelliste-gennemgang-22-09.md`, `docs/mangelliste.html` (linje 3461-3540 og 4139-4165), `docs/OVERLEVERING.md` (7765, 8300-8320, 8650), `docs/claude-regelsaet.md` §4a, `docs/opstart-30-09.md`.
