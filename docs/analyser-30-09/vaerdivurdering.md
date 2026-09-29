# Værdivurdering efter §4a — 13 kort fra opstart 30/9

Målt på `main` @ `2928d3d` (29/9 aften). Kun læst kode, docs og typer. INTET målt i prod: alt, der kun kan måles der, er markeret «ikke målt» og har en SELECT (ét resultatsæt, sektions-kolonne).
Baggrund for skalaen: 52 virksomheder i alt, ca. 27–28 betalende (opstart §16, §14). Det er en lille brugerbase, så «ofte» betyder her «nogle få gange om måneden».

Kortenes tal er flere steder forældede. Målt i dag:
- w14 siger 68 edge functions; mappen har 111 (113 poster minus `_shared` og `_test_fixtures`).
- m17-migrationer siger 20 (omskrevet 22/9: 35); `git grep "IKKE KØRT" supabase/migrations` giver nu 57 filer af i alt 399.
- L3671 siger «43 filer uden breakpoints»; 75 af 154 `.tsx` under `hjemmebane/` bruger breakpoints i dag.

---

## 1. a29-chat-video-huller (4 huller i chatvideoen)

1. **Stadig relevant?** Ja, alle fire. `MAKS_SEKUNDER = 180` (`src/lib/chatVideo.ts:18`) holdes kun af optageren og browserens længdetjek (`ChatVideoOptager.tsx:127-140,167`); serveren ser ikke længden. Ingen filstørrelsesgrænse i `chatVideoUpload.ts`, og ingen oprydning af forældreløse videoer hos Bunny. Fladen er 10 timer gammel (i drift 29/9 18:41).
2. **Hvem/hvor ofte/hvor meget?** Ingen kendt ramt. Hul 1 (forældreløs video) koster lagerplads hos Bunny (en video á ≤180 s, cent-beløb), ikke medlemmer. Hul 4 (2 GB-fil vælges fra telefonen) giver en langsom upload og en fejl, som «Prøv igen»-linjen (#1140) nu fanger. Brugen af chatvideo kan ikke måles herfra, den blev først åbnet i dag.
3. **Pris:** Lille til mellem. Filstørrelse: få linjer i klienten, kun Update. Serverhåndhævelse af 180 s og oprydning kræver ny logik i `chat-video` edge function og eksplicit deploy.
4. **Dom: FORESLÅ.** Ingen har rørt fladen længe nok til, at hullerne er set; vent på en uges brug og kør SELECT'en, så vi ser om nogen overhovedet sender video.

```sql
select 'chatvideoer_i_alt' as sektion, count(*)::text as vaerdi from public.messages where context_meta::jsonb ? 'video'
union all
select 'chatvideoer_sidste_14_dage', count(*)::text from public.messages where context_meta::jsonb ? 'video' and created_at > now() - interval '14 days'
union all
select 'forskellige_afsendere', count(distinct sender_id)::text from public.messages where context_meta::jsonb ? 'video';
```

## 2. a29-vedhaeftning-slettes-ikke

1. **Stadig relevant?** Ja. `useMessageActions.ts:78-100`: `deleteMessage` sletter videoen hos Bunny og derefter rækken (`.delete()` på :97), men rører aldrig `chat-attachments`. Filerne bor under `{userId}/…` (`chatAttachments.ts:18`) og bliver liggende til hard-delete af medlemmet.
2. **Hvem/hvor meget?** Et medlem, der sletter en besked med et regnskab eller kontrakt, tror, filen er væk. Den kan ikke længere åbnes (signeringen kræver beskeden), så det er lager og en løftefejl, ikke et læk. Antal ikke målt.
3. **Pris:** Lille. Klienten kan kalde `storage.from("chat-attachments").remove(paths)` før rækken slettes; migrationen `20260317133757…sql:22` har en ejer-politik på mappen (skal bekræftes i `pg_policy`, jf. §4a «pg_policy frem for migrationer»). Ingen migration, ingen deploy, kun Update. Risiko: slettes filen, og rækkesletningen så fejler, står beskeden uden fil, så rækkefølgen skal bindes som ved videoen.
4. **Dom: FORESLÅ.** Kør SELECT'en først; er der forældreløse filer med indhold, så bygges det (privatlivsløfte), ellers luk.

```sql
select 'filer_i_bucket' as sektion, count(*)::text as vaerdi from storage.objects where bucket_id = 'chat-attachments'
union all
select 'filer_uden_besked', count(*)::text from storage.objects o where o.bucket_id = 'chat-attachments'
  and not exists (select 1 from public.messages m where strpos(m.context_meta::text, o.name) > 0)
union all
select 'bytes_uden_besked', coalesce(sum((o.metadata->>'size')::bigint), 0)::text from storage.objects o where o.bucket_id = 'chat-attachments'
  and not exists (select 1 from public.messages m where strpos(m.context_meta::text, o.name) > 0)
union all
select 'delete_politik_paa_bucket', count(*)::text from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'DELETE' and qual ilike '%chat-attachments%';
```

## 3. w14 (edge functions har ingen fejllæser)

1. **Stadig relevant?** Ja, men målt forkert: kortet siger 68 functions, det er 111. Ingen `edge_fejl_log` findes i kode eller migrationer (`grep` i `supabase/`, `src/`: kun `mangelliste.html` nævner navnet). Sentry findes kun i browseren (`src/main.tsx:21`), ikke i functions. Vagten (`cron_vagt_log`) ser cron, ikke funktionsfejl.
2. **Hvem får det bedre?** Jonas som driftsansvarlig, indirekte medlemmer. Eneste dokumenterede tilfælde er Stripe, der gentog doggybeds event fem gange uden at nogen så det. Hvor mange stille fejl der er i dag er ikke målt.
3. **Pris:** (a) et try/catch-hylster i `_shared/` plus tabel er en delt fil, og «ændringer der trækker en ny delt fil ind ruller ikke med merge»: op til 111 functions skal deployes eksplicit. Stort. (b) Stripes «failed webhook»-mail i Dashboard er nul kode, men ikke målt slået til.
4. **Dom: FORESLÅ, kun (b).** Jonas tjekker i Stripe Dashboard → Developers → Webhooks, om fejlmail er slået til (5 minutter, ingen kode). (a) bygges ikke bredt; hvis det bygges, så kun i `stripe-webhook` og mail-functions, hvor en stille fejl koster penge eller mails. SELECT kan ikke måle det; målingen er Supabase-logs (`query_logs`, service edge-function, status ≥ 500 seneste 7 dage).

## 4. m28-invitationslink-raadgiver

1. **Stadig relevant?** Ja. `invitationer.ts:42` vælger `id, company_id, email, status, created_at, accepted_at`, ikke token; `HbInvitationer.tsx` har «Gensend» og slet (:69), men ingen «Kopiér link». Kun kunden selv kan kopiere linket (`CompanyInvitations.tsx:349-353`).
2. **Hvem?** Rådgivere (Jonas, Morten) og den inviterede, der ikke kommer ind. Konkret hændelse 28/9: Mads-sagen krævede SQL-editoren. Hyppighed: én kendt gang; åbne invitationer kan tælles (SELECT under 5).
3. **Pris:** Lille. Hent `invite_token` i `hentInvitationer` (rådgiverens `select` på tabellen; RLS skal bekræftes i `pg_policy`), en «Kopiér link»-knap ved den åbne invitation. Ingen migration, ingen deploy, kun Update. Sikkerhed: rådgiverne kan allerede udløse mailen med samme token; linket viser ikke mere, end mailen gør.
4. **Dom: BYG.** Det er en fejl, en rådgiver har ramt (28/9), og gevinsten er at Jonas ikke skal ind i SQL-editoren, når et medlem ikke finder mailen.

## 5. m28-invitationsopslag-haenger

1. **Stadig relevant?** Ja. `Auth.tsx:62` sætter «venter», `:222` tegner `HbSpinner`, indtil RPC'en `lookup_invite_company_info` (:113) svarer; ingen timeout eller afbrydelse (`grep` efter `AbortController|setTimeout` i `Auth.tsx`: 0 træf). `signupFejl.ts` kender kun gyldig/ukendt/fejl.
2. **Hvem?** Et medlem på et dårligt netværk, når de trykker på invitationslinket. Aldrig observeret: kortet er et FUND fra kodelæsning, «ikke målt som Mads' årsag». Hyppighed: ukendt, sandsynligvis sjælden.
3. **Pris:** Lille (Promise.race/timeout på ~10 s og en tekst med «prøv igen» eller kontakt@). Kun Update, ingen migration.
4. **Dom: FORESLÅ.** Uobserveret. Tag den med i samme PR som m28-signupfejl-en-linje, hvis Jonas vil, fordi filerne er de samme, men den er ikke en grund alene.

## 6. m28-signupfejl-en-linje

1. **Stadig relevant?** Ja. `signupFejl.ts:55` kender to tekster; alt andet får `ukendt` (:62). `Auth.tsx:153` lader en adgangskode passere klientens tjek med score 2 af 4 (`PasswordStrengthIndicator.tsx:7-12`: 8 tegn, stort bogstav, tal, specialtegn), så `abcdefgh1` slipper igennem klienten. Supabase-politikken (mindstelængde, «leaked password»-tjek) er umålt, `config.toml` har ingen `[auth]`-sektion. Rå fejltekst står kun i konsollen (`Auth.tsx:176`).
2. **Hvem?** Enhver ny inviteret, der vælger en adgangskode Supabase afviser. **Kortets afvisning af Mads' forklaring holder ikke:** en afvist adgangskode fejler FØR brugeren oprettes, så triggeren aldrig kører, og målingen (invitation pending, ingen auth-bruger, ingen fejlet mail) passer PRÆCIS på det. Det er den mest sandsynlige årsag, ikke den mindst sandsynlige. Kan bekræftes i auth-loggen for 15/9 og 28/9.
3. **Pris:** Lille. `signupFejl` tager i dag kun `message`; Supabase-fejlen har også `code` (`weak_password`, `over_email_send_rate_limit`, `signup_disabled`). Ren funktion plus tests, en tekst pr. kode. Kun Update, ingen migration.
4. **Dom: BYG.** Fejlen ramte en rigtig CFO 28/9, og med den rette tekst kan medlemmet selv løse den uden at Jonas skal spørge om et skærmbillede.

## 7. w5 («Send invitation» kan invitere en ubetalt virksomhed)

1. **Stadig relevant?** Ja i koden (`HbInvitationer.tsx:132`, ingen betalt-gate; `opretInvitation` i `invitationer.ts:96` tjekker hverken slutdato eller legat). Kortet siger selv «Rammer den første der kommer tilbage, ingen i dag», og «Døren er rettet» (#807).
2. **Hvem?** Kun to personer kan trykke (Jonas og Morten), og de kender selv, hvem der har betalt. Legat og manuelle aftaler går samme vej med vilje, så en advarsel ville være støj. Antal ramte: 0 kendt.
3. **Pris:** Lille (en bekræftelsesdialog), Update. Men risikoen for falsk alarm er høj, eftersom «betalt» hviler på ét felt.
4. **Dom: LUK.** Ingen ramt, to brugere der ved bedre, og Jonas 22/9: «senere». Del (2), at `RAADGIVER_MAIL_TIL` er sat, tjekker Jonas under Lovable → Cloud → Secrets på ét minut, og det er ikke kode.

Kontrol af, om der findes ubetalte åbne invitationer nu:

```sql
select 'aabne_invitationer' as sektion, count(*)::text as vaerdi from public.company_invitations where status = 'pending'
union all
select 'aabne_uden_gaeldende_slutdato', count(*)::text from public.company_invitations i join public.companies c on c.id = i.company_id
  where i.status = 'pending' and (c.contract_end_date is null or c.contract_end_date < current_date)
union all
select 'aabne_aeldre_end_14_dage', count(*)::text from public.company_invitations where status = 'pending' and created_at < now() - interval '14 days'
union all
select 'accepteret_median_timer', coalesce(round((percentile_cont(0.5) within group (order by extract(epoch from (accepted_at - created_at)) / 3600))::numeric, 1)::text, 'ingen') from public.company_invitations where status = 'accepted' and accepted_at is not null;
```

## 8. a19-betaling-uden-adgang

1. **Stadig relevant?** Ja i koden. `stripe-webhook/index.ts:943` skriver perioden, `:956` kontrakten; 13 linjer imellem, der kun kan afbrydes af en fejl eller et nedbrud. Gensendelsen (:923, :1484) selvhelbreder, så længe Stripe gensender (ca. 3 døgn). Ingen alarm findes (`grep` efter betaling-uden-adgang: 0 træf).
2. **Hvem?** En betalende virksomhed, der derefter ville få rykker dag 14/25 og lukning dag 60. Sandsynligheden er lav (kort vindue plus tre døgns gensendelser), skaden høj (betalende kunde behandlet som ikke-betalt). Aldrig set.
3. **Pris:** Måling: én SELECT, nul kode. Alarmen: en vagtregel plus en klokke (vagten findes: `cron_vagt_log`, `20260910120000_vagtens_join.sql`), en cron-migration og Update; Mellem.
4. **Dom: FORESLÅ.** Kør SELECT'en nu; bygges kun hvis den viser ≥ 1 række. Er den tom, er alarmen forsikring mod et hændelsesforløb, der ikke er indtruffet, og kortet kan parkeres.

```sql
select 'betaling_uden_slutdato' as sektion, count(*)::text as vaerdi, null::text as navn
  from public.company_perioder p join public.companies c on c.id = p.company_id where p.art = 'indgang' and c.contract_end_date is null
union all
select 'raekke', p.periode_start::text, c.name
  from public.company_perioder p join public.companies c on c.id = p.company_id where p.art = 'indgang' and c.contract_end_date is null;
```

## 9. m17-migrationer-ikke-koert

1. **Stadig relevant?** Ja, og værre end kortet siger: 57 filer bærer «IKKE KØRT» i dag (kortet: 20/35), de nyeste fra 19/9; mindst 20260917130000 blev senere kørt. `20260929150000…mappetjek.sql` er selv beviset på, at filens ord ikke er prods tilstand.
2. **Hvem?** Claude og Jonas, når de skal afgøre, om en migration er kørt (lærestreg (o), #1133). Ingen medlemmer direkte. Skade: en migration køres to gange, eller en antages kørt og er det ikke.
3. **Pris:** Skal ind i 57 filer med et kørselstidspunkt, som vi ikke har for de fleste; det ukendte skal stå «IKKE MÅLT». Kun kommentarer, ingen deploy, men risikoen er at skrive nye fejlagtige kvitteringer, og de forældes igen ved næste migration.
4. **Dom: FORESLÅ.** Bedre end at redigere 57 headere er ét målt kvitteringsdokument (én SELECT med `to_regclass`/`pg_proc` pr. objekt); det kræver Jonas' valg af form. Rent kommentararbejde uden måling giver et nyt sæt påstande.

## 10. L3671 (intet mobilmønster)

1. **Stadig relevant?** Delvist forældet. `useIsMobile` bruges stadig i 0 filer under `hjemmebane/`, men 75 af 154 `.tsx` bruger breakpoints (`sm:/md:/lg:`), og skallen har en mobil-drawer og mobil-topbar (`HbMemberShell.tsx:150,197`). Kortets «43 filer uden breakpoint» er ikke længere sandt. Kortet er en «designdom, kan kun dømmes på skærm».
2. **Hvem?** Alle medlemmer på telefon. Mobilandel er ikke målt; PWA-prompten (`AddToHomescreenPrompt.tsx`) tyder på, at det forventes. Dårligste tilfælde er en enkelt flade, ikke et generelt mønster.
3. **Pris:** Mellem, en ny primitiv plus omlægning af mange views, ingen migration, Update, men stor flade at regressionsteste uden en skærm.
4. **Dom: FORESLÅ.** Mål mobilandelen først (SELECT), og pege på de konkrete flader, der er i stykker, med et skærmbillede; «mønster» bygges ikke på forhånd.

Ansøgernes browser som proxy for kommende medlemmer (der findes ingen enhedsdata for medlemmer):

```sql
select case when user_agent is null then 'ukendt' when user_agent ~* 'iphone|android|mobile' then 'mobil' else 'desktop' end as sektion, count(*)::text as antal
from public.ansoegninger group by 1;
```

## 11. L3521 (events uden lokation)

1. **Stadig relevant?** Sandsynligvis forældet. Målt: `events`-tabellen har `kind` (`live_sparring`, `workshop`, `andet`; migration `20260804120000:293`), `meet_url`, `capacity`, men ingen adresse (`types.ts`); UI'et udleder «Online» af `meet_url` (`EventsView.tsx:30`, `EventDetailView.tsx:213`), og `.ics` bruger Meet-linket som LOCATION (`kalenderfil.ts:111`). Ingen seed, demo eller doc beskriver et fysisk Boardroom-event; kun de tre gamle prioriteringsdokumenter (`prioritering-1-september.md:104`, `status-1-september.md:479`) nævner «et fysisk event», som en teoretisk mangel.
2. **Hvem?** Ingen kendt. Findes der ét fysisk event, kan adressen stå i `description` i dag. Ikke målt: om nogen event nogensinde er oprettet uden `meet_url`.
3. **Pris:** Lille-mellem (migration + editorfelt + eventside + `.ics` + tests), migration og Update.
4. **Dom: LUK.** Ingen tegn på fysiske events; bygges kun, hvis Jonas siger, at der skal holdes ét. SELECT'en nedenfor er bevisbyrden.

```sql
select 'events_i_alt' as sektion, kind as art, count(*)::text as antal from public.events group by kind
union all
select 'events_uden_meet_url', kind, count(*)::text from public.events where meet_url is null group by kind;
```

## 12. a20-moedelink-egne-mails

1. **Stadig relevant?** Delvist løst. Målt: webhook-vejen henter allerede linket (`calendly-webhook/index.ts:232`) og sender det videre til `udfoerOvergang`; ansøgningsmails «i dag» og bekræftelsen bærer linket (`ansoegningRykkerMails.ts:287-288`); «i morgen»-mailen henviser til «Se din booking» (:279-281), hvor `AnsoegSamtale.tsx:71` viser linket. Tilbage: `session_bookings` har ingen `moede_link`-kolonne (grep i migrationer og `types.ts`: 0), og et fejlet `hentMoedeLink` logges kun som `console.error` (:234), ikke som klokke.
2. **Hvem?** Ansøgere (til afklaringssamtalen) og 1:1-medlemmer. Calendlys egen invitation bærer stadig linket, så ingen står uden. Antal ramte: 0 kendt.
3. **Pris:** Mellem (migration + to functions + tre mails), migration FØR Update og eksplicit deploy; risiko i webhook og betalingskæden.
4. **Dom: FORESLÅ.** Kortet er skrevet 20/9, og halvdelen er bygget siden; skriv det om til de to reelle rester (kolonnen for 1:1 og klokken ved fejl), og byg dem først, hvis en booking mangler linket.

```sql
select 'ansoegninger_booket_uden_link' as sektion, count(*)::text as antal from public.ansoegninger where trin = 'booket' and samtale_link is null
union all
select 'ansoegninger_booket_i_alt', count(*)::text from public.ansoegninger where trin = 'booket'
union all
select 'session_bookings_sidste_90_dage', count(*)::text from public.session_bookings where created_at > now() - interval '90 days';
```

## 13. L3313 («Spørg din rådgiver» på nøgletal, bygget i #1144)

1. **Stadig relevant?** Bygget: `noegletalChip.ts`, knappen i `NoegletalView.tsx`, chip i `MemberChatPane.tsx`. Merget 29/9 20:35, altså EFTER Update 18:22 (opstart §0). Den er ikke i drift før næste Update.
2. **Hvor fremtrædende er siden?** Nøgletal (`/kpis`) er andet punkt under «Dine tal» i menuen, forsidens «Din måned» linker dertil (`BoardroomView.tsx:2312`), og for abonnenter er den hjemmesiden (`HbMemberShell.tsx:142`). Fremtrædende, men besøgstal findes ikke i databasen (ingen sidevisningstabel; GA4 kan ikke læses herfra). Proxyer: hvor mange virksomheder har tal at se, hvor mange har kommenteret et tal, hvor mange har logget ind. Regnestykket for gevinsten er meget lavt: hvis 27 betalende hver skriver én chip om måneden, er det 27 beskeder.
3. **Pris:** Allerede betalt (17 tests, ingen migration). Rest: Update og et skærmbevis.
4. **Dom: LUK som kort (bygget); gevinsten måles efter Update.** Det var netop «valgt fordi den stod som Lille» (§4a); nu er der ingen ekstra pris, men efter en måned bør `noegletal_chip_beskeder` afgøre, om knappen fik brug.

```sql
select 'virksomheder_med_tal_sidste_90_dage' as sektion, count(distinct company_id)::text as vaerdi from public.financial_report_facts where committed_at > now() - interval '90 days'
union all
select 'kpi_kommentarer_sidste_90_dage', count(*)::text from public.kpi_chart_comments where created_at > now() - interval '90 days'
union all
select 'forskellige_indloggede_sidste_30_dage', count(distinct user_id)::text from public.user_login_log where logged_in_at > now() - interval '30 days'
union all
select 'noegletal_chip_beskeder_i_alt', count(*)::text from public.messages where context_meta::jsonb ? 'noegletal'
union all
select 'medlemsbeskeder_sidste_30_dage', count(*)::text from public.messages m where m.created_at > now() - interval '30 days' and exists (select 1 from public.company_members cm where cm.user_id = m.sender_id);
```

---

## Samlet oversigt

| Kort | Dom |
|---|---|
| a29-chat-video-huller | FORESLÅ |
| a29-vedhaeftning-slettes-ikke | FORESLÅ (SELECT først) |
| w14 | FORESLÅ (kun Stripe-mailen, nul kode) |
| m28-invitationslink-raadgiver | BYG |
| m28-invitationsopslag-haenger | FORESLÅ |
| m28-signupfejl-en-linje | BYG |
| w5 | LUK |
| a19-betaling-uden-adgang | FORESLÅ (SELECT først) |
| m17-migrationer-ikke-koert | FORESLÅ |
| L3671 | FORESLÅ |
| L3521 | LUK |
| a20-moedelink-egne-mails | FORESLÅ (skriv om) |
| L3313 | LUK (bygget) |

## Rangeret top 5, det bør gøres først

1. **m28-signupfejl-en-linje (BYG).** Rammer en rigtig ny bruger i det mest skrøbelige øjeblik, og den mest sandsynlige årsag til Mads-sagen (afvist adgangskode) forsvinder som gæt, når fejlen får sin egen tekst. Lille, kun Update, ren funktion der kan testes først. Kan tage m28-invitationsopslag med i samme PR, hvis Jonas vil.
2. **m28-invitationslink-raadgiver (BYG).** Konkret hændelse 28/9 kostede SQL-editoren; en «Kopiér link»-knap er lille, uden migration og gør rådgiveren selvhjulpen.
3. **a19-betaling-uden-adgang: kør SELECT'en (nul kode).** Ét minut i SQL-editoren afgør, om der findes en betalende virksomhed, der behandles som ubetalt; er svaret 0, er kortet parkeret, er det ≥ 1, er det straks nr. 1.
4. **w14 vej (b): Jonas tjekker Stripes «failed webhook»-mail (nul kode).** Fem minutter i Dashboard giver den fejllæser, vi mangler for de penge-bærende events, uden at deploye 111 functions.
5. **a29-vedhaeftning-slettes-ikke, efter SELECT'en.** Et privatlivsløfte til medlemmer (slettet besked, slettet fil), ti linjer i klienten uden migration, men først når SELECT'en viser, at der faktisk ligger forældreløse filer, og en `pg_policy`-måling har bekræftet ejer-slettepolitikken.

Bemærk: det, der står sidst, er ikke «lav værdi» men «uafklaret». Dem, der ikke er i top 5 (a29-chat-video, L3671, a20-moedelink, m17-migrationer), venter alle på én måling, som SELECT'erne ovenfor giver.
