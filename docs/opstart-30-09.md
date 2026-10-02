# Morgenlisten — onsdag 30/9 (Claude, nat 29/9 → 30/9)

**Sådan læses den:**
- **Blok A** er dig alene. Tag den i rækkefølge. Det er ca. 20 min, og så kører alt, der blev bygget i nat.
- **Blok B** laver vi sammen, fordi den rører login og adgang.
- **Blok C** er Klaviyo og eWebinar. Den skal være færdig før 6/10.
- **Blok D** er beslutninger. Et ord pr. punkt er nok.
- **Blok E** er adgange til bogholderiet, når du har tid i dag.

---

## A. Dig alene, ca. 20 min (kl. 07:30)

**A1. Lovable build-chat.** Kopiér det hele:
```
Rør ingen kode, og commit intet. Kør deploy-værktøjet for disse syv edge functions ved navn, og vis mig værktøjets resultat ordret for hver: webinar-mail-cron, extract-annual-report, update-annual-report-revenue, notify-chat-reply, run-company-agent, stripe-webhook, calendly-webhook. Skriv ikke "udruller nu" uden at køre værktøjet — jeg skal se svaret fra deploy-værktøjet for alle syv.
```

**A2. Vent 10 min, og kør så dette i Lovable SQL editor.** Det er beviset for, at mailværnene kører:
```
SELECT id, status_code, (content::jsonb)->'budget'->>'job_timeout_ms' AS budget_nyt, (content::jsonb)->>'ukendte_foer' AS dubletvaern_nyt, (content::jsonb)->'loft'->>'maks' AS loft FROM net._http_response WHERE content LIKE '%"over_loft"%' ORDER BY id DESC LIMIT 1;
```
- **Rigtigt:** `budget_nyt` = 60000, `dubletvaern_nyt` er et tal (typisk 0), og `loft` = 1000.
- **Forkert:** er `budget_nyt` tom, er `webinar-mail-cron` ikke udrullet. Så gentag A1 kun for den.

**A3. Klik Update i Lovable.**

**A4. Tre hurtige tjek på app.theboardroom.dk** (2 min):
- **Log ind som dig selv.** Forsiden skal have et nyt kort, «Svartid». Det er rådgivernes fælles tal.
- **Åbn en chat med en video.** Den må ikke starte af sig selv.
- **Stripe** (efter første betaling eller fornyelse, ikke nu): Dashboard → Developers → Webhooks → leveringerne skal stå som 200. Signaturtjekket er strammet (konstant tid og et tidsvindue på 5 min).

---

## B. Sammen med mig (sig «Byg med mig: B1» når du er klar)

**B1. Hurtigere login (#1159).** Medlemmets login bliver én rundtur i stedet for fire, og appens første indlæsning er 45 % mindre. Jeg merger, du klikker Update, og vi tester fire ting på 5 min. Går noget galt, ruller vi tilbage med det samme.

**B2. Kritisk sikkerhedshul (#1157).** Et medlem kan i dag rette ALLE felter på sin egen virksomhed fra browserens konsol, bl.a. kontraktdato, legat, gratis sessioner og priser. Rettelsen er en trigger med en hvidliste over felter. Vi kører SQL'en i fire trin sammen, og jeg giver dig hvert trin her i chatten.

---

## C. Klaviyo og eWebinar: mails (ca. 1 time, senest 5/10)

**Hvorfor:** deltageren fik «Det er i dag» to gange 22/9. Årsagen var, at en kampagne og et flow sendte samme mail til 324 personer. Det er lukket nu. Rettelserne her skærer det værste tilfælde for én tilmeldt fra 18–27 mails til 11–13.

**C1. eWebinar (5 min).** Webinars → Mortens webinar → Edit → Notifications/Emails. Tjek, for hver session, også 13/10:
- «Registration confirmation» er FRA.
- Kun «10 minutes before» er TIL. «1 hour before», «1 day» og «starting now» er FRA.
- Follow-ups («Thank you for attending», «Sorry we missed you» og replay) er FRA.
- SMS/WhatsApp er FRA. Ingen integration sender selv mails.

**C2. Kampagner 6/10–15/10 (5 min, kun kontrol).** Åbn #5 (7/10), #6 (15/10) og «Så webinaret 22/9 → ansøgning» (1/10). Under Recipients → Excluded skal der stå «Tilmeldt kommende webinar». Det gør der allerede.

**C3. Velkomstflowet (10 min).** https://www.klaviyo.com/flow/TGxxUc/edit
- For mail 2, 3 og 4, én ad gangen: Additional filters → Add filter → Properties about someone → `tb_naeste_webinar` → is not set.
- Slå Smart Sending TIL, og tryk Save.
- Rør ikke mail 1.

**C4. «Deltog i webinar» (15 min).** https://www.klaviyo.com/flow/Wq3MkG/edit
- **Triggeren:** Flow filters → Add filter → «is not in» → Medlemmer (ekskluderes) → Save.
- **Mail 01, 02 og 03:** Additional filters → Add filter → `tb_naeste_webinar` → is not set → Save. Rør ikke de filtre, der står der i forvejen.

**C5. «Moedte ikke op» (10 min).** https://www.klaviyo.com/flow/SDVvCW/edit. Under triggeren → Flow filters tilføjes tre filtre:
- is not in Medlemmer (ekskluderes)
- `tb_naeste_webinar` is not set
- «Deltog i webinar» zero times over the last 14 days

Tryk Save.

**C6. Sunset (20 min, forbliver DRAFT).** https://www.klaviyo.com/flow/XCqPKg/edit

Under triggeren → Flow filters tilføjes tre filtre:
- is not in Medlemmer (ekskluderes)
- «Deltog i webinar» zero times last 60 days
- «Moedte ikke op» zero times last 60 days

Derefter en betinget afslutning:
1. Træk et **Conditional split** ind mellem «Wait 1 day» og «Update profile property».
2. Betingelsen er: Opened Email zero times since starting this flow OG Clicked Email zero times since starting this flow.
3. Yes → Update profile property. No → slut.
4. Save.

**Tænding 14/10:** hvert kort og selve flowet sættes Live, plus «Add past profiles» (ca. 417). Den 29/10 laver du segmentet «Sunset — afmeldes», og jeg kører afmeldingen med tørkørsel først.

---

## D. Beslutninger (et ord pr. punkt)

**D1. Platformens påmindelser.** Skal «om tre dage» og «det er i dag» (07:30) droppes? Så får en deltager 14 dage, 7 dage, 1 dag, 1 time og eWebinars 10 min. **Min anbefaling: ja.** Svar: ja/nej.

**D2. Webinarmotorens syv valg.** Min anbefaling er ja til alle syv:
- Ærlighed: «optaget, Morten svarer live i chatten», ingen falsk chat og ingen oppustede tal.
- Tilmeldingen sker på topix.dk.
- Pixel og Conversions API på tilmeldingen, men først efter privatlivsteksten er rettet.
- Ingen spoling. Pause er tilladt med «Tilbage til live».
- Intet replay. Efter 25 % tilbydes næste session.
- JIT og SMS kommer senere.
- `ewebinar_id = 'P-…'` i parallelperioden.

Svar: «ja til alle» eller nummeret på det, du er uenig i.

**D3. Gamification for medlemmerne, første skive.** Min anbefaling er **Boardroom Score (0–1000) plus tal-streak**, fordi de bygger på tal, vi allerede har. Svar med et nummer fra idélisten.

**D4. #1146 (lokation på events).** Byg eller luk?

**D5. «Intet menneske taster», bogholderiet.** Hvilke selskaber skal med: Topix.dk ApS, The Boardroom, SnowWaves? Og er startlofterne OK? De er 25.000 kr. pr. postering, 3.000 kr. for en ny leverandør og 100.000 kr. pr. dag.

---

## E. Adgange til bogholder-agenten (når du har en time i dag)

Nøgler lægger du selv i secrets, aldrig i chatten.

1. **Supabase:** nyt projekt i DIN egen organisation (ikke Lovables), navn `topix-bogholderi`, EU, Pro.
2. **e-conomic:** tjek, at pakken er Plus eller højere. Tilmeld udvikleraftale på e-conomic.com/developer. Opret appen «Topix bogholderi-agent» med rollen Bookkeeping. Gem AppSecretToken (vises én gang), og godkend appens Installation URL som administrator for at få AgreementGrantToken.
3. **Nordea via Enable Banking:** konto og applikation på enablebanking.com (restricted mode). Link Nordea med MitID. Skriv samme dag til dem om produktionsaftale.
4. **bilag@topix.dk:** ny bruger i Google Workspace. Gmail API og OAuth (Internal) i et nyt Cloud-projekt.
5. **Stripe:** restricted key, kun læs.
6. **Claude API-nøgle:** med månedligt forbrugsloft.
7. **Leverandørernes faktura-mail** ændres til bilag@. Det gælder Google, Meta, Lovable, Klaviyo, Mailgun, eWebinar, Bunny, Calendly, Stripe, telefoni, forsikring og revisor.
8. **Revisor, én samtale på en time:** kontoplan og moms, forsystemet og renten på ejerlån.

Tjek også bogholderens opsigelsesvarsel.

---

## Det blev lavet i nat

**Merget, med grøn CI på alle kørsler:**

| PR | Hvad |
|---|---|
| #1152 | Mailgun-loftet er 1000 i timen. Bevist i drift 23:39 (`maks` = 1000). |
| #1155 | Webinarmail-dubletværn. Er man tilmeldt flere sessioner, får man kun påmindelser til den nærmeste. Et ukendt udfald (timeout) sendes aldrig igen. |
| #1162 | Webinarmail: et forsøg starter kun, hvis det kan nå at slutte før cron-timeouten. Før kunne en afbrudt kørsel give dubletter: 45 + 8 + 10 = 63 s > 60 s. Skal være udrullet før 7-dagsholdet 6/10. |
| #1156 | Sikkerhed: ejertjek på årsrapporter, kun rådgivere kan udløse chat-klokken, et medlem kan ikke køre agenten live, returnUrl er altid intern, og webhook-signaturer tjekkes i konstant tid. |
| #1160 | /auth hænger ikke længere på en evig spinner. Admin-lister skelner tom fra fejlet. Legatsvar tæller ikke som kundesvar. |
| #1163 | Medlemmets budget kan ikke længere overskrives ved en fejlet hentning. En chatbesked, der ikke blev sendt, går ikke tabt. Booking hænger ikke. Notifikationen siger «juli 2026». |
| #1164 | Svartids-uret: rådgivernes fælles svartid, trend, ældste ubesvarede og streak på forsiden. |
| #1165 | Ingen stille lofter i rykker- og rytme-cron. Rådgiverens chat viser nu en besked, der ikke blev sendt. **Deploy af `send-report-reminder` og `onboarding-rytme` venter** til vi har målt, om tabellerne har passeret 1.000 rækker; ellers kan mange få en rytmemail på én gang. |
| #1153, #1154 | Bogføringen, visionen og mangellisten. |

**Åbne, der venter på noget:**
- #1157: sikkerhedstriggeren (B2).
- #1158: webinarmotorens skive 1, der er motoren.
- #1161: skive 2, seerens flade.
- #1159: hurtigere login (B1).
- #1146: lokation på events (D4).

**Analyserne** ligger i `docs/analyser-30-09/`. Det er sikkerhed, hastighed, drift, medlemsrejse, mail-worst-case, bogholder-agent og webinarmotor-spec. Du behøver ikke læse dem. Det, der skal handles på, står ovenfor.

**Modeller:** den store model (opus) tog webinarmotoren, sikkerheden, mailværnene, bogholderi-designet og medlemsfejlene. Den mellemste (sonnet) tog Klaviyo-klikvejledningen og driftsrettelserne.

**Rettet undervejs:**
- Jeg skrev, at jeg kunne lave Sunset i Klaviyo. Det kan jeg ikke, fordi mine værktøjer kun kan læse flows.
- Mit første bevis-SQL for loftet var for løst. Det i A2 læser den seneste cron-kørsel direkte.


---

> **Den tidligere morgenrapport herunder (skrevet 29/9 ~23:00) er afløst af listen ovenfor.** Den bevares som historik.

# Morgenrapport — natten til 30/9 (Claude, «Kør selv» fra 29/9 19:50)

## A. Det, Jonas skal gøre (i denne rækkefølge)

1. **Update i Lovable.** Den bringer #1135, #1138, #1140, #1143, #1144, #1148, #1150 og #1151 ud. Main er Update-sikker (regelsæt §1a).
2. **Deploy `chat-video`** fra build-chatten (#1142: videoer starter ikke af sig selv og hentes ikke på forhånd).
3. **Deploy `webinar-mail-cron`** (#1152: Mailgun-loftet 90 → 1000 i timen). Nået før 7-dagsholdet 6/10.
4. **Beslut Sunset før 14/10.** Det er ikke klar. Se `docs/analyser-30-09/klaviyo-gennemgang.md` §0. Jeg har ikke rørt Klaviyo.
5. **Læs `docs/vision-uafhaengighed.md`.** Den samler bogholderi, Meta, webinarmotor, referater, gamification og community, og §5 har ni beslutninger.
6. **Tjek bogholderens opsigelsesvarsel.** Det sætter tidsplanen for spor 1.
7. **Valgfrit: tre målinger i SQL editor.** De står klar i `docs/analyser-30-09/vaerdivurdering.md` (a19 betaling uden adgang, a29-vedhaeftning og `company_invitations`' policies). Gamification- og community-målingerne står i deres rapporter.
8. **Afgør #1146** (lokation på events). Den står åben med en migration, der ikke er kørt. Byg den, eller luk den.
9. **Slet grenen `claude-adgangstest`** på GitHub. Slå også «Automatically delete head branches» til under Settings → General; proxyen lader mig ikke slette grene.

## B. Merget i nat (alle med grøn CI på alle kørsler)

| PR | Hvad | Venter på |
|---|---|---|
| #1142 | Chatvideo uden autostart og forhåndshentning | deploy `chat-video` |
| #1143 | #-forslag tilbyder Community-opslag og viser lektionens område | Update |
| #1144 | «Spørg din rådgiver» ved hvert nøgletal | Update. NB: valgt FØR regel §4a. Kan beholdes, men værdien er ikke målt. |
| #1148 | Mobil-chat: header, ingen onboarding-pille over sendefeltet, 16 px felter (ingen iOS-zoom), død pil væk | Update + skærmbevis på telefon |
| #1150 | Signup-fejl dømmes på Supabases `code` (svag adgangskode, rate limit m.fl.) | Update |
| #1151 | Rådgiveren kan kopiere invitationslinket | Update |
| #1152 | Mailgun-loftet 1000 i timen. Én kørsel når realistisk ~80–150 mails (BUDGET_MS 45 s); de elleve kørsler i timen tager resten. | deploy `webinar-mail-cron` |
| #1141, #1147, #1149 | Regelsættet (tre kommandoer, «Værdi før byg», main altid Update-sikker) | — |

- **Lukket uden merge:** #1145 (systembeskeder ud af chatten). Den ramte kun én type og blev lukket efter reglen «Værdi før byg».

## C. Analyser i nat (kun læst, intet ændret)

Alle ligger i `docs/analyser-30-09/`:

- `klaviyo-gennemgang.md`:
  - 1.743 har aktivt samtykke, men 3.807 kan modtage markedsføring.
  - Sunset-flowet har tre fejl.
  - Velkomstserien er LIVE, så `m28-velkomstserie` er forældet.
  - 417 døde profiler.
- `gamification-analyse.md`:
  - Rammen fra 13/8 forbyder ranglister, og det skal Jonas afgøre.
  - Svartiden kan måles, men chatten lover «24 timer» uden at nogen måler det.
- `community-analyse.md`: medlemmerne kan ikke skrive til hinanden. Forslaget er en manuel intro-pilot før kode.
- `bogholderi-automatisering.md`: e-conomics egne funktioner først, og kun forslag, aldrig autobogføring. Anpartshaverlån-forbuddet er ophævet 1/1-2025.
- `meta-automatisering.md`: fem faser. Tilmeldinger må ikke deles med Meta (vores eget løfte).
- `webinar-og-referater.md`:
  - En egen webinarmotor er 6–9 uger, og gevinsten er koblingen, ikke de 99 $.
  - Referater er en MVP på 6–8 dage efter en måling af dansk transskription.
- `vaerdivurdering.md`: 13 kort værdivurderet (bygget: signupfejl, invitationslink).
- `mobil-chat-fejl.md`: målingen bag #1148.

## D. Modeller

| Opgave | Model |
|---|---|
| Recon, Klaviyo-gennemgang, gamification-, community-, Meta- og webinaranalyser, signup, invitationslink, mobil-chat | mellem (sonnet) |
| Mailgun-loftet | mellem (sonnet) |
| Bogholderi-analysen (penge og lov) | stor (opus) |
| Syntesen `vision-uafhaengighed.md`, gennemsyn af alle diffs og merges | hovedsessionen |

## E. Lærestreg

**(x) En mangelliste-status kan være forældet i den modsatte retning.** `m28-velkomstserie` sagde «pladsholdere», men Klaviyo viser flowet LIVE. Mål i kilden (Klaviyo), før et kort bygges.

---

# Opstart — onsdag 30. september 2026

**Rækkefølgen er et FORSLAG — Jonas godkender den, før der bygges.**

Skrevet 29/9 aften på `main` @ `477662d0`. Jonas 29/9: «I morgen skal vi tilbage til mangellisten og de ting der hænger.»

Grundlaget er hele `docs/mangelliste.html` (alle kort, der ikke er lukket) og `docs/OVERLEVERING.md` DEL 3 («30/9 og frem» og de ældre blokke). Dagen 29/9 står i DEL 2 «29. september» §0–§11, og lærestregerne (a)–(w) står i §6.

**Tal:** 277 kort, 103 lukkede og 198 åbne. 7 af de åbne er fra i dag (`a29-*`), og **191 er ældre**.

**Rækkefølgens princip:**
- datoer og frister først
- derefter det, der rammer **medlemmer**
- så det, der rammer **penge**
- så **drift**

Inden for hver gruppe kommer det ældste først. Beslutninger uden kode, idéer og forældede kort står sidst.

**Om henvisningerne:** hvert kort er nævnt ved sit `id`. Et kort uden id er nævnt ved sin linje i `mangelliste.html` (fx L3313), målt 29/9 aften; linjerne flytter sig, når listen redigeres.

---

## 0. Tilstanden ved dagens slut (29/9 ~18:50)

**I drift:**
- webinarmailens loft, indhentning og alarm (#1112–#1115, #1130)
- rådgiverens svar på refleksioner (#1117)
- chatvideo på eget bibliotek. Jonas 18:41: «Videon fungerer hurtigt nu».
- «Dit certifikat» trin 1 (#1133, Update 18:22)
- certifikat trin 2. Klokken: cron job 574, `15 6 * * *`.

**I den udrullede bundle fra Update 18:22 (målt: `index-D04bwATF.js` har certifikatet, og alt merget før #1133 er med), men skærmbeviset udestår:**
- «Mangler at booke» (#1129)
- rabataftalens adresse (#1120)
- chatvideoens startknap (#1134)
- #-henvisninger (#1125) — Jonas 29/9 eftermiddag: «Labels i chat virker».

**Merget EFTER 18:22 — kræver et nyt Update (tilføjet af Claude 29/9 19:10):**
- forhåndsvisningen (#1135) og dens menupunkt (#1138)
- chatvideoens forbedringer (#1140, merget 19:01): 2 s-takten det første minut, 0-bytes-tjekket og sendelinjen med «Prøv igen»

---

## 1. Den prioriterede liste

### 1. 14-dagsmailen — færdig? (frist 5/10 23:59)
- `a22-webinarmail-foerste-hold` — 134 af 319 ude kl. 10:45; 112 manglede kl. 14:00, forventet færdig ~18:30. Tjek `select art, udfald, count(*) from public.webinar_mails where art = 'fjorten_dage' group by 1,2;`. Lukkes, når alle 319 er ude. (DEL 2 «29. september» §3.)

### 2. Mailgun business verification / 1000 ad gangen
- `a29-mailgun-verificering` — probationen (100/time) ophæves kun ved business verification. Jonas svarede i ticketen ~14:12, og banneret skal tjekkes. Loftet `MAILGUN_LOFT_PR_TIME = 90` ændres først ved skriftlig grænse. Står højt, fordi næste hold (7-dagsmailen 6/10 til ~217) ellers kører med samme loft. (§3.)

### 3. Webinaret 13/10 — det, der har en dato før sessionen
- `a21-webinar-tidspunkt` — **Står her, fordi** kortet lukkes først efter en Preview, og fristen er 6/10. Påmindelserne nævner ikke tiden.
- `a20-optakt-13-10` — **Står her, fordi** tilmeldte til 13/10 ingen optakt får af sig selv, og kampagnerne skal være planlagt senest 6/10.
- `a22-mailsporing` — **Står her, fordi** den skal bygges i uge 40 og før 13/10. Fire svar fra Jonas udestår, og måling 4 (afmeldingslinket) kan ikke gøres om.
- `a20-tilmeldt-haendelse` — **Står her, fordi** kortet sagde «merges onsdag 23/9». Den dato er passeret, så det skal måles, om hændelsen er i drift.

### 4. Drift-bevis efter Update (kort og billige, samme session)
- `a29-overblik-bevis` — «Mangler at booke»: N (Morten) og M (Jonas) skal ses på forsiden i drift.
- `m28-hash-i-chatten` — **Står her, fordi** det er bygget (#1118/#1120/#1125), og kun skærmen efter Update mangler.
- Forhåndsvisningen `/certifikat/forhaandsvisning` og rådgiverens menupunkt (#1135, #1138) — **Står her, fordi** de ikke var i Lovables spejl 18:20 (§7).
- `m17-refleksionslinjerne` — **Står her, fordi** det er «I DRIFT — BEVIS UDESTÅR: forsiden efter Update» siden 17/9. Samme skærm som #1129.
- `m17-virksomhedssiden-pr1` — **Står her, fordi** det er et skærmbevis på Floren Engros siden 17/9, som ses i samme runde.
- `m17-virksomhedssiden-pr2` — **Står her, fordi** det er næste skridt efter PR 1's bevis (Jonas: «Ja på alle»; 22/9: «gør det»): forberedelsen læser planen, og køen viser skridt-titler.
- `m16-svar-paa-besked` — **Står her, fordi** det er ni trin på skærm, bevis udestår siden 16/9, og chatten åbnes alligevel for #-beviset.
- `m16-klokke-chat` — **Står her, fordi** det kræver ét klik i klokken (siden 16/9), og chatten er åben i samme runde.
- `m16-fortsaet-forloeb` — **Står her, fordi** det er et skærmbevis med en ny konto; der logges alligevel ind som medlem for certifikatet.
- `m16-de-foerste-30-dage` — **Står her, fordi** «næste aflæsning 29/9» er passeret, og det er kohortelinjen på samme forside.
- `m17-en-plan-fase1` og `m17-en-plan-fase3` — **Står her, fordi** begge er I DRIFT, bevis udestår siden 17/9, og kræver én medlemsskærm.
- `m16-maaske-relevant` — **Står her, fordi** det er merget #932 og bevis udestår på medlemmets forside.
- `m16e-online-realtime` — **Står her, fordi** det kræver, at et kundemedlem dukker op på rådgiverens forside, og det kan ses i samme runde.
- `m16-brugbar-er-kunde` og `m16-fremdrift-hentefejl` — **Står her, fordi** det er rådgiverens Fremdrift-fane (#916/#926), ubevist på skærm.
- `L3876` (tavse queryFn'er, #928) — **Står her, fordi** handouts/klokken er ubevist, og RabataftalerView blev delvist rettet i dag (#1126).

### 5. Bunny-saldo $7,55 og automatisk genopfyldning
- Intet kort endnu. Punktet står i DEL 2 «29. september» §8. **Står her, fordi** Premium Encoding trækkes løbende. Tømmes saldoen, stopper afspilningen for BÅDE chatten og Akademiet (c0-bunny.md §1.4: «afspilning stopper»).

### 6. Pengene på den gamle Stripe-konto og penge uden kobling (ældre, rammer penge)
- `m15-gamle-fakturaer` — **Står her, fordi** 24 åbne fakturaer (219.892,50 kr.) skal afgøres FØR den gamle konto lukkes, og bogholderen mangler besked om UVXL7LPI-0003.
- `m16-economic-doed` — **Står her, fordi** 0 af 160 betalte 2026-fakturaer er bogført fra Stripe. Integrationen har været død siden 26/7-2025, og den nye konto har ingen.
- `m16e-traek-uden-kobling` — **Står her, fordi** syv Stripe-kunder (55 fakturaer, 240.625 kr.) har ingen virksomhed, og det skal gøres før den gamle konto lukkes.
- `m17-ykrg-juni` — **Står her, fordi** junibetalingen er udestående (e-conomic, ikke Stripe).
- `a19-betaling-uden-adgang` — **Står her, fordi** der ingen alarm er, hvis pengene er bogført, mens `contract_end_date` er tom. Jonas 22/9: «gør det».
- `n14-5` — **Står her, fordi** betaling uden om platformen har ingen flade, og fornyelsen regner af `indgangspris_oere`.
- `L3066` (stripe_customer_id tom for de 13 flyttede) — **Står her, fordi** det skulle være SQL i hånden efter 22/9, og Customer Portal venter på den.
- `m14-mails` — **Står her, fordi** tre flyttede har en anden mail i platformen end i Stripe; en regel, der beskytter mod forkert kobling.
- `m16-traek-grund` — **Står her, fordi** det rammer penge, men venter kun på næste fejlede træk (bevis).
- `m17-nordic-rate-2` — **Står her, fordi** den forfalder 1/11; der er intet at gøre før.
- `m16e-tbr-0008-slettet-kunde` — **Står her, fordi** det er en køreplan, ikke kode: TBR-0008 står under en slettet Stripe-kunde.

### 7. Chatvideo — A's forbedringer, gammel testvideo, forældreløse videoer
- A's forbedringer (poll hvert 2. s det første minut, 0-bytes-tjek, uploadlinje med «Prøv igen») — merget #1140 29/9 19:01; kræver Update og et skærmbevis.
- Gammel testvideo `5c9d71b9` i det gamle bibliotek 720547 — ryddes op.
- `a29-chat-video-huller` — forældreløse videoer hos Bunny, «behandles» kun i 10 min, 180 s håndhæves ikke af serveren, og filstørrelsen tjekkes ikke før upload.

### 8. Vedhæftninger slettes ikke med beskeden
- `a29-vedhaeftning-slettes-ikke` — filerne i `chat-attachments` bliver liggende, til medlemmet hard-slettes (`useMessageActions.ts:78-106`).

### 9. Indgangen — medlemmer, der ikke kommer ind (ældre, rammer medlemmer)
- `m28-invitationslink-raadgiver` — **Står her, fordi** rådgiveren ikke kan hjælpe et medlem med linket; Mads-sagen 28/9 krævede SQL-editoren.
- `m28-invitationsopslag-haenger` — **Står her, fordi** /auth kan hænge i en uendelig spinner uden besked.
- `m28-signupfejl-en-linje` — **Står her, fordi** «Kontoen kunne ikke oprettes» dækker over alt, og medlemmet kan ikke se hvorfor.
- `w2` — **Står her, fordi** det er ankomstens løse ender (indlogget browser, bekræftelseslinket, to «opret»-veje). Jonas 22/9: «gør det».
- `w5` — **Står her, fordi** «Send invitation» kan invitere en ubetalt virksomhed uden advarsel.
- `m16-invitation-spaerret` og `m16-invitation-tak` — **Står her, fordi** de er rettet i kode (#915/#917) og ubeviste til næste spærrede adresse eller invitation.
- `L2847` (sikrIndgangsInvitation «allerede accepteret», #902) — **Står her, fordi** grenene er ubeviste til en tilbagevendende kunde.
- `n14-4` — **Står her, fordi** #883 (contact_person fra importen) er udrullet 22/9, og beviset er næste import.
- `L2880` (fem nedarvede parserfejl) — **Står her, fordi** de er låst i test som «NEDARVET FEJL», og (A) ramte 16/9.
- `w13` — **Står her, fordi** en gæst møder en fejl i stedet for en grænse i Community; adgangsdommene er uenige om NULL.
- `m16e-alarmer-seneste-maaned-bevis` — **Står her, fordi** medlemmets alarmer er i drift ifølge Lovable, og beviset er næste godkendte måned.
- `a22-afmelding-webhook-bevis` — **Står her, fordi** den levende afmeldingsvej er kode, ikke drift, indtil næste Unsubscribed.

### 10. Mortens 12 retter uden booking — og sessionernes familie
- `a29-morten-retter-uden-booking` — årsagen er ikke målt (håndafkrydsning, fejlet rollback eller slettet række).
- `L3376` (Jonas-sessionen: 11 af 38 med begge rettigheder åbne) — **Står her, fordi** det er samme kolonner og samme beslutning om rettighederne.
- `w11` — **Står her, fordi** beviset for sessionssporet er én rigtig booking gennem et id-bærende link.
- `a20-calendly-no-show` — **Står her, fordi** no-show aldrig er markeret (0 af 33), og abonnementet ikke sender hændelsen. Jonas 22/9: «senere».
- `a20-moedelink-egne-mails` — **Står her, fordi** mødelinket i vores egne mails er fire punkter i rækkefølge. Jonas 22/9: «gør det».

### 11. Tallene — genkørsler og udtræk (ældre, rammer medlemmer)
- `m17-brick-works-balance` — **Står her, fordi** balancen er tom, til #978 er udrullet og genkørt; resultatet er rigtigt.
- `m17-saldobalance-pdf-uden-i-alt` — **Står her, fordi** #982 er merget, men udrulning og genkørsel af seks medlemmer udestår.
- `m17-koerelisten` — **Står her, fordi** PDF-/AI-rapporter, ANLA, Warburg og BR Roset ikke er genkørt. Jonas 22/9: «senere».
- `m17-ai-skema-grupper` — **Står her, fordi** AI-læste rapporter får udækkede grupper. Jonas 22/9: «gør det».
- `m17-xlsx-combined-navne` — **Står her, fordi** udkastet er klart og parkeret, til Jonas er til stede (rører den delte læsemotor).
- `m17-kontrolsum-forside-snapshot` — **Står her, fordi** kontrolsummen ikke vises på forsiden, og der intet før-billede er.
- `m17-uden-fil-og-fem-procent` — **Står her, fordi** rapporter uden fil ikke kan genkøres.
- `L3208` (tre PASS-uploads uden facts) — **Står her, fordi** de venter i køen, og beslutningen om automatisk commit er Jonas'.
- `m16-download-uden-tal` — **Står her, fordi** Nøgletal viser download på en tom side; set på skærm 16/9.
- `L3203` (indsæt fra regneark i budgettet) — **Står her, fordi** importen har det, redigeringen ikke. Jonas 22/9: «senere».
- `L3171` (budgettets tre skjulte fejl) — **Står her, fordi** det kræver prod.
- `m17-ebitda-margin-navn` — **Står her, fordi** det er en note, ikke en fejl i tallet.

### 12. Løfter uden dækning (ældre, rammer medlemmer og jura)
- `a18-sletteloefte` — **Står her, fordi** formularen lover sletning efter 30 dage og 12 måneder, og ingen cron holder det.
- `a20-afmeld-platform` — **Står her, fordi** ingen af platformens mails kan afmeldes. «Byg uanset»; Jonas 22/9: «senere».
- `a18-jurist` — **Står her, fordi** aftaleteksten og persondatateksten læses selv (der kommer ingen jurist).

### 13. Marketing og tekster (ældre, rammer kommende medlemmer)
- `m28-tragten-foer-skemaet` — **Står her, fordi** frafaldet ligger før skemaet (17 → 6 → 4). Kortet skrives efter Mortens indspilning.
- `m28-velkomstserie` — **Står her, fordi** en ny abonnent i dag intet får fra Klaviyo, og Claude skriver teksterne.
- `m28-flows-uden-optagelse` — **Står her, fordi** `Wq3MkG` mail 1+3 afventer indsættelse.
- `m28-pris-to-tal` — **Står her, fordi** Klaviyo mail 01, aftaleskabelonen og slides mangler begge betalingsformer.
- `m28-nyhedsbrev-utm-felter` — **Står her, fordi** formularen på sitet sender fremmede utm'er som profilfelter.
- `a20-kilde-direkte-utm` — **Står her, fordi** et klik-id uden utm_source stadig bliver «direkte».
- `a21-afholdt-rykker-tekst` og `a21-redigerbare-mails` — **Står her, fordi** det er tekster i ansøgningskøen. Jonas 22/9: «senere».
- `a20-genganger-bekraeftelse` og `a20-bot-klik` — **Står her, fordi** begge kan først efterprøves efter 13/10.
- `a22-kampagnernes-maal` — **Står her, fordi** det er Nicklas' opgave i egen timing.

### 14. Betalingskædens hjørner (ældre, rammer penge; har datoer længere ude)
- `w17` — **Står her, fordi** beslutningen om rykker efter dag 31 skal træffes før 20/10.
- `L3061` (retries opbrugt → faktura automatisk) — **Står her, fordi** der er fem forudsætninger før det bygges.
- `a19-dag31-doedvande` og `a19-paamindelser-hverdage` — **Står her, fordi** de rammer få og kræver en beslutning om tidsvindue først.
- `L2984` (fornyelsesabonnementets tekst i Stripe) — **Står her, fordi** det beskytter mod en fejl i god tro. Jonas 22/9: «senere».
- `L3071` (exit-abonnenter kan ikke opsige selv) — **Står her, fordi** det venter på `stripe_customer_id` (punkt 6).
- `a18-aftale-visning` — **Står her, fordi** aftalens tilstand kun står i tabellen. Jonas 22/9: «senere».
- `a20-bevis-slettes-dag-45` — **Står her, fordi** «havde bruger» skal bogføres, før dag 45 sletter det; ellers kan klokkernes virkning aldrig måles.

### 15. Døde grene og #-hullerne (2) og (4)
- `a29-statusmail-grene` — `feat/statusmail-cron` og `feat/statusmail-motor` slettes.
- `L3897` (274 grene på origin) — **Står her, fordi** det er samme oprydning i én omgang. Jonas 22/9: «senere».
- `a29-hash-huller` — (2) chatten tilbyder ikke opslag, (4) lektioner vises uden områdenavne. (1) og (3) er løst.

### 16. Drift — det, der beskytter mod stille fejl (ældre)
- `w14` — **Står her, fordi** edge functions ingen fejllæser har (chattens altafgørende nr. 6). Jonas 22/9: «gør det».
- `L3927` (restore aldrig afprøvet) — **Står her, fordi** det er chattens altafgørende nr. 1; ikke målt, om Lovable Cloud har backups.
- `m17-migrationer-ikke-koert` — **Står her, fordi** 20 filhoveder siger «IKKE KØRT», og i dag fældede netop det #1133 (lærestreg (o)).
- `L3907` (fem domme om medlemsadgang) — **Står her, fordi** tre SQL-domme ikke har paritetstest, og det ikke er målt, om `20260911050000` er kørt.
- `n14-11` — **Står her, fordi** Lovables mailloft er 300/time, og 429-grenen er ubevist.
- `a22-forside-langsom` — **Står her, fordi** det er en live fejl, men «på hylden» (Jonas 22/9); #1132 skar forsiden fra 13 til 3 kilder.
- `L3912` (hentAdvisorDashboard holder til ~60 kunder) — **Står her, fordi** det blokerer ved ~60, og i dag er der 52 virksomheder i alt.
- `m16-auto-deploy-canary` — **Står her, fordi** «merge udruller ikke» er målt flere gange; canary'en ville gøre det synligt.
- `m16e-monday-body-foer-noegle` — **Står her, fordi** monday-webhook læser body'en før nøglen.
- `a22-ga4-secret-skift` — **Står her, fordi** en secret har stået i chatten 21/9.
- `m16-datacvr-vilkaar` — **Står her, fordi** DataCVR-vilkårene ikke er afklaret; det er Jonas', ikke kode.
- `a22-rls-initplan` — **Står her, fordi** Jonas 22/9 sagde «senere — basen er ikke flaskehalsen».
- `a21-princip-1-klokker` — **Står her, fordi** stille-klokkerne og Meta-vagten skal nå mail. Jonas 22/9: «senere».
- `a21-stille-klokker-27` — **Står her, fordi** tallet 27 mod 28 betalende skal afstemmes.
- `a20-ingen-noegle-warn` — **Står her, fordi** et tabt API-nøglespor ellers er stille. Jonas 22/9: «senere».
- `a22-cron-vagt-tidsjoin` — **Står her, fordi** manuelle prøvekald tælles som cron-fejl.
- `L3922` (invarianter i vagten) — **Står her, fordi** rammen findes, og to tjek mangler.
- `L3917` (Sentry og bundlen aldrig målt) — **Står her, fordi** første greb er nul kode.
- `a21-email-send-log-unikt-indeks` — **Står her, fordi** et påstået indeks skal måles i prod.
- `a20-set-procent-vaern` — **Står her, fordi** «procenten går aldrig ned» kun hviler på koden.
- `a20-url-tags-vaern` — **Står her, fordi** en annonce uden `{{ad.id}}` først opdages senere.
- `a21-import-hentning` — **Står her, fordi** importen tager ~70 s.
- `L2832` (process-pending-invitation ved hvert load) — **Står her, fordi** det ikke er målt siden 4/9.
- `L3333` (samtalelistens 500-vindue) — **Står her, fordi** det ikke er ramt (målt 11/9), men vokser.
- `L4003` (rådgivernes info-notifikationer hober sig op) — **Står her, fordi** det kræver en beslutning: skrives de, eller ryddes de.
- `L3937` (verify_jwt = false på 37 ældre functions) — **Står her, fordi** de migreres én ad gangen.
- `L3952` (slettelisten nævner ikke fire tabeller) — **Står her, fordi** kun prod kan vise kaskaden.
- `L3932` (to skrivere på ugekortet) — **Står her, fordi** det hører til «Én plan» fase 5.
- `m16-skrivevaern`, `L3942` (kr() i fire kopier), `L3892` (lektionsstien syv steder) — **Står her, fordi** det er samling af kode uden kendt fejl.
- `a22-migration-dublet`, `a21-ad-id-kommentar`, `a20-cta-etiket`, `a19-tekstudgaven-dobbelt-knap` — **Står her, fordi** det er kosmetik eller en kommentar uden virkning.
- `L3887` (oprydningens rester efter #836), `L3947` (sletteliste), `L3957` (døde kolonner), `L3666` (ni døde mails), `L3218` («Standardmål» død kode), `L3902` (Vercel-appen), `m17-gamle-members-links` — **Står her, fordi** det er død kode eller rester uden brugervirkning.
- `L3856` (self-host fonte) — **Står her, fordi** det handler om ydeevne og GDPR, men uden kendt skade.
- `w16` — **Står her, fordi** kun «Nulstil din adgangskode» mangler i loggen.
- `L3656` (to mails for samme 1:1-betaling) — **Står her, fordi** det er én linje at rette. Jonas 22/9: «senere».
- `L3691` (seks gamle komponenter) og `L3686` (former der skal løftes) — **Står her, fordi** det er designgæld.
- `L3671` (intet mobilmønster) — **Står her, fordi** det er et Mellem-stort greb. Jonas 22/9: «gør det».
- `L3617` (adresse kan ikke rettes) og `L3506` (rådgivere kan ikke rette egen netværksprofil) — **Står her, fordi** de rammer få.
- `L3521` (events uden lokation) og `L3343` (systembeskeder ud af chatstrømmen) — **Står her, fordi** det er små flader. Jonas 22/9 sagde «gør det» til det sidste.
- `L3637` (sletning af en person har ingen vej) — **Står her, fordi** efterladenskaberne skal måles først.
- `L3632` (forsidens dom mangler to slags) — **Står her, fordi** målingen skal ske før dommen.
- `L3338` (blok 3 — emnerne) — **Står her, fordi** klassificeringen af 588 beskeder skal ske før fladen.
- `a20-replay-deltog` — **Står her, fordi** det er en beslutning om én Klaviyo-hændelse.
- `L3861` (data-drevne Akademi-områder) — **Står her, fordi** det bevidst er udskudt, til nogen vil oprette et område.

### 17. Beslutninger, der venter på Jonas (ingen kode før svaret)
- `L3193` (19 af 27 faldet ud) — **Står her, fordi** det er en samtale mellem Jonas og Morten; næste måling 8/10.
- `L3188` (rapportpåmindelsen rykker de 19) — **Står her, fordi** den hænger på samme samtale.
- `m17-manuelle-rettelser`, `m17-brroset-ykrg`, `m17-brroset-runde-tusinder`, `m17-rallysupport-to-eksporter`, `m17-fail-kraever-raadgiver` — **Står her, fordi** det er Jonas' afgørelser om tallene fra 17/9.
- `L3198` (årsrapporten: skabelon eller manuel) — **Står her, fordi** beslutningen (a)/(b) skal træffes før byg.
- `L3223` (BENCHMARK_BELOW) — **Står her, fordi** det er blive, lægges om eller dø.
- `a18-virksomhed-efter-dag60` — **Står her, fordi** Jonas vælger vejen for rækker uden slutdato.
- `L3371` (en afholdt session efterlader intet spor) — **Står her, fordi** Jonas 22/9 sagde «senere».
- `L3323` (AI-fanen) — **Står her, fordi** brugen skal måles før en flytning.
- `L3975` (ingen opbevaringspolitik) — **Står her, fordi** det er en beslutning før kode; sletteløftet (punkt 12) hænger på den.
- `L3986` (to admin-veje sletter uden spor) og `L3882` (advisor og admin ikke skilt ad) — **Står her, fordi** det er adgangsbeslutninger, gate for gate.
- `L3622` (mailoverblikket som side) og `L3627` (admin-menuens navn) — **Står her, fordi** design eller navn skal besluttes først.
- `L3866` (Boardroom-MCP) — **Står her, fordi** det er valget (a)/(b)/(c).
- `L3465` (lektioner på topix.dk), `L3536` (video på Community-opslag), `L3970` (sjette mailnøgle) — **Står her, fordi** det er produktvalg uden hast.
- `a20-kollision-ni-mails`, `a20-profilmodel` — **Står her, fordi** det er modeller, ikke kode.
- `L4030` (to rådgivere til hundrede virksomheder) — **Står her, fordi** det er et produktspørgsmål før et værktøjsspørgsmål.

### 18. Idéer og senere
- `L3516` (søgning), `L3460` (medlem-til-medlem), `L3239` (e-conomic-integration), `L3526` (affiliate) — **Står her, fordi** de er «game changers», men store. Jonas 22/9 sagde «gør det» til søgningen, som er den mindste (tsvector).
- `L3313` («Spørg din rådgiver» på nøgletal) — **Står her, fordi** Jonas 22/9 sagde «gør det», og det er lille.
- `w-brugbar` — **Står her, fordi** det venter kun på det første rigtige svar.
- `w15` — **Står her, fordi** kursusbeskrivelserne er indhold for Jonas og Morten.
- `m17-gennemgangen-af-de-8` — **Står her, fordi** det er rådgiverarbejde (otte samtaler), ingen kode.
- `n14-10` — **Står her, fordi** berigelsen skal stemple rækken; Lille, efter 22/9.
- `a20-kreativbibliotek` — **Står her, fordi** opgaven aldrig blev skrevet.
- `a20-kampagne-spor` — **Står her, fordi** det er skitseret og venter på data.
- `a22-spf-topix` — **Står her, fordi** det skal måles, om nogen sender som @topix.dk via Google.
- `a22-ewebinar-ics-aaben` — **Står her, fordi** det skal meldes til eWebinar; vi kan ikke rette det selv.
- `a18-kontakt-spaerret` — **Står her, fordi** kontakt@ skal kontrolleres 19/10, efter at spærringen udløber 18/10 20:47.
- `L3166`, `L3183` (budgetidéer), `L3328` (aktivitetslog), `L3366` (rådgiver som medlem), `L3475` (ugens auto-tråd), `L3496` (push med partneraftale), `L3531` («Din måned»), `L3651` (idébanken), `L4020` (à la carte) — **Står her, fordi** det er idéer uden beslutning.

### 19. Forældede — foreslås arkiveret (Jonas afgør; slettes ikke)
- `a18-carma-25-9` — **Står her, fordi** CARMAs vindue sluttede 25/9, og CARMA er ude af platformen (slut 11/9).
- `L3000` (CARMAs slutdato flyttet i hånden) — **Står her, fordi** CARMA er ude; data og kontrakt betyder ikke længere noget.
- `L2989` (datogaten) — **Står her, fordi** kortet selv siger «udløber 24/9 og slettes 25/9, hvis intet er sket».
- `m15-vinduet` — **Står her, fordi** vindue 2 er bevist 22/9; kun #896 står, og det bør flyttes til et eget kort eller lukkes.

---

## 2. Hvor det står
- **Dagen 29/9:** `docs/OVERLEVERING.md` DEL 2 «29. september» §0–§11. Lærestreger (a)–(w) i §6.
- **Rækkefølgen før i dag:** DEL 3 «30/9 og frem» og de ældre blokke («29/9 og frem», «22/9 og frem», «20/9 og frem»).
- **Kortene:** `docs/mangelliste.html` (`#<id>`, eller linjen ved et kort uden id).
