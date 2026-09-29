# Værdivurdering: de fire kort med frist før webinaret 13/10
Målt 30/9 fra origin/main (fetch kl. nu). Kun læst i kode og docs. Prod ikke målt. Regel: docs/claude-regelsaet.md:61 (§4a). Kortene: docs/mangelliste.html:2473 (a22-mailsporing), :2580 (a21), :2614 (a20-optakt), :2619 (a20-tilmeldt). Listen: docs/opstart-30-09.md:117-121.
Udkastmapperne (~/Downloads/udkast-tilmeldt-haendelse, recon-mailsporing.md, koereplan-13-10.md, koereplan-webinar-tidspunkt.md) findes ikke i sandkassen. Deres indhold er kun set som citater i mangellisten.

## Hovedfund, der ændrer tre af kortene
Arbejdsdelingen blev flyttet 22/9 19:29, EFTER at kortene blev skrevet (docs/marketingmotoren.md:194-215). Platformen sender selv alle før-webinar-mails til alle tilmeldte via Mailgun (bekræftelse, 14, 7, 3, 1 dag, dagen, 1 time: webinarMailDom.ts ARTER). Klaviyo beholder kun efter-webinaret. Klaviyo-flowene WFzxH9 og UiECQS, som a21 og a20 handler om, er slukket (marketingmotoren.md:202,214). Klaviyo svarer nu 404 på dem, så de er slettet (klaviyo-gennemgang-30-09.md:160-162, målt 29-30/9).
Platformens mails bærer selv tidspunktet: webinarMailTekster.ts:30-32 (`Vi ses <tid>`) og :342 («en mail uden tidspunkt findes ikke»).

## 1. a21-webinar-tidspunkt
1) Relevans: halvt forældet. Feltet er bygget og bevist. klaviyo-profil-cron skriver tb_naeste_webinar og tb_naeste_webinar_tekst (klaviyoProfil.ts:18-19,65). Skrivning 22/9 kald 14306, job 571, læst tilbage «tirsdag 13. oktober kl. 11.00» (mangelliste:1939, webinaret-og-annoncerne.md:257-263). Restkravet var taggen i WFzxH9 og UiECQS. De findes ikke mere, så de kan ikke previewes. Feltet har fået en ny opgave: det er ekskluderingsnøglen i seks Klaviyo-segmenter (marketingmotoren.md:421, mangelliste:1760), og den opgave er en anden end kortets.
2) Hvem og hvad: medlemmer og tilmeldte ser tiden allerede i alle syv platformsmails. Taggen giver kun værdi i de Klaviyo-kampagner til 13/10, der stadig planlægges, og de findes ikke som beslutning (se punkt 2). Hvis ikke lavet: intet tabes i platformsmailene. Kun en evt. Klaviyo-kampagne mangler tid, og den kan bare have «kl. 11» i teksten, for det er én session.
3) Pris: ingen kode. 1 tag i en kampagneskabelon + 1 Preview (Jonas, ca. 5 min), hvis der overhovedet sendes en kampagne.
4) Manglende svar: ingen. Kortet lukkes «FØRST efter en Preview» (mangelliste:1939).
5) Dom: luk som forældet for flowene. Behold feltet, fordi segmenterne bruger det. Hvis Jonas sender en kampagne til 13/10, sæt tiden direkte i teksten og drop Preview-kravet.

## 2. a20-optakt-13-10
1) Relevans: forældet. Kortets præmis, «ingen optakt af sig selv, UiECQS slukket» (mangelliste:2616), er blevet dækket af platformen, som sender 14-dages-, 7-, 3-, 1-dags-, dagens og 1-times-mail til ALLE tilmeldte til 13/10. 14-dagsmailen blev sendt 29/9 til 319 (mangelliste:1939 «a22-webinarmail-foerste-hold»). 7-dagsholdet går 6/10 kl. 08:00 til ~217. Kortets dato «senest 6/10» er derfor bare dagen for 7-dagsmailen. Tilbage i Klaviyo før 13/10: «Morten skriver #5» 7/10 og «#6» 15/10 (klaviyo-gennemgang:206-212). Ingen optakt-kampagne til 13/10 er set i Klaviyo, og koereplan-13-10.md kan jeg ikke læse.
2) Hvem og hvad: de 179 (nu ~319 på hold) får nu platformens seks påmindelser. En ekstra Klaviyo-optakt oven i ville give ni mails på 14 dage, og desuden markedsføring til folk uden Hovedliste-samtykke (marketingmotoren.md:194-198 skiller dem bevidst ad).
3) Pris ved at bygge: kampagner i Klaviyos flade (Jonas), import af liste, smart sending fra. Ingen kode. Risikoen er kollision (klaviyo-gennemgang:190,204).
4) Manglende svar: intet, men køreplanens beslutninger A–D i koereplan-13-10.md §0 er ikke læsbare. De er formentlig forældede.
5) Dom: luk som forældet. Behold 6/10 som drift-tjek af 7-dagsholdet: Mailgun-loftet 90 → 1000 (#1152, opstart:7) skal være deployet før, ellers rammer de ~217 samme probation som 29/9. Det er kortet med værdi, ikke dette.

## 3. a22-mailsporing (levering + klik)
1) Relevans: stadig relevant, men kortets omfang er for stort. Intet bygget: ingen Mailgun-webhook i supabase/functions, og webinar_mails har kun mailgun_id (migration 20260922171000:60-61). Sporing slås bevidst FRA i alle sendinger: o:tracking / -clicks / -opens = no (mailgunAfsendelse.ts:122-124,165-167). Dagens spor siger kun «Mailgun tog imod», ikke «kom frem».
2) Hvem og hvad: rådgivere. De kan i dag ikke se, om en person har fået mailen, før de ringer. 29/9 viste, at Mailgun kan tage imod og afvise i klumper (420/429, 112 manglede). Men alarmen (webinarMailAlarm, #1115) og loftet (#1112-1114, #1152) dækker allerede den fejl. Hard bounces og spamklager ses kun i Mailguns panel. Størrelsen er umålt (SELECT nedenfor). Hvis den ikke bygges før 13/10: intet går tabt for medlemmer. Man mister synet på leveringen til den ene session og kan ikke skille en hård bounce fra en, der ikke læste.
3) Pris (hele kortet): ny funktion (Bucket C, signaturcheck), 1-2 migrationer (hændelsestabel + evt. lås), 3 skærme, 7 målinger, 4 beslutninger, Mailgun-webhook sat op af Jonas, deploy af funktion + Update. Stort. Mellem-til-stor.
   Skåret ned: KUN levering/afvisning (delivered, permanent_fail, temporary_fail, complained) kræver hverken tracking eller omskrevne links. Så forsvinder måling 4 og beslutning A–C, og afmeldingslinket røres ikke. Klik er det, der gør ondt og ikke kan gøres om. Skær det fra nu.
4) Manglende svar (mangelliste:2473-2480):
   - A «htmlonly eller yes?»
   - B «Skal afmeldingslinket spores overhovedet?»
   - C «Skal personlige links stå i Mailguns klik-log?» (joinLink og .ics bærer attendee-id)
   - D «Skal der være en lås?» (webinar_mail_sporing_aktiv)
   Ved kun levering: A, B og C bortfalder. D kan klares med dry_run. Jonas' eget svar 22/9 «levering JA · klik JA · åbninger NEJ» står. Ny afklaring: klik-delen er ikke haster og rører links, så den kan udskydes til efter 13/10.
5) Dom: læg frem for Jonas som forslag i to trin: (a) levering+afvisning før 13/10, hvis han vil have det, ca. 1 PR + 1 migration + webhook-opsætning; (b) klik efter 13/10. Byg ikke selv (§4a: ny funktion, gevinst ikke målt).

## 4. a20-tilmeldt-haendelse
1) Relevans: forældet. Ikke bygget: intet i supabase/ eller src/ sender «Tilmeldt webinar» eller `:tilmeldt` (git grep, kun en testfixture src/lib/__tests__/klaviyoMailhaendelser.test.ts:52). Kortets dato «merges onsdag 23/9» er passeret. Formålet er væk: hændelsen skulle måle sene tilmeldinger, så man kunne afgøre, om et før-flow er værd at bygge (mangelliste:2621-2622). Før-flowet blev bygget i platformen 22/9 (marketingmotoren.md:194-215), og webinar_tilmeldinger.registreret_at (migration 20260919130000:88) måler allerede sene tilmeldinger direkte. Ingen Klaviyo-flow lytter, og de gamle er slettede.
2) Hvem og hvad: ingen får det bedre. En backfill er med vilje umulig, så de 319 får den aldrig.
3) Pris: 1 hændelse i ewebinar-webhook + fresh-mærke + test + deploy. Nul gevinst.
4) Manglende svar: intet.
5) Dom: luk som forældet. Fravalget er begrundet: målingen er allerede SQL på webinar_tilmeldinger.

## Samlet
- Luk som forældet: a20-optakt-13-10, a20-tilmeldt-haendelse, a21-webinar-tidspunkt (behold feltet).
- Læg frem: a22-mailsporing, delt i levering nu / klik efter 13/10.
- Vigtigere end de fire, med frist før 13/10: deploy af webinar-mail-cron (#1152, loft 1000) FØR 7-dagsmailen 6/10 08:00 (opstart:7), og at Mailgun-verificeringen (a29) er løst. Ellers gentager 29/9 sig for ~217.

## Måling i prod (Lovable SQL editor, ét resultatsæt, kolonner er antagelser: bekræft mod pg_proc/information_schema først, jeg har kun set migrationerne)
```sql
select 'A_tilmeldte_13_10' as sektion, count(*)::text as vaerdi, '' as note
  from public.webinar_tilmeldinger where session_tid = '2026-10-13 11:00:00+02'
union all
select 'B_sene_tilmeldinger_efter_7_dage_foer', count(*)::text, 'tilmeldt inden for 7 dage før sessionen (det tilmeldt-hændelsen skulle måle)'
  from public.webinar_tilmeldinger
  where session_tid = '2026-10-13 11:00:00+02' and registreret_at > session_tid - interval '7 days'
union all
select 'C_mails_pr_art_udfald', count(*)::text, art || ' / ' || udfald
  from public.webinar_mails where session_tid = '2026-10-13 11:00:00+02' group by art, udfald
union all
select 'D_klaviyo_profil_tekst_sat', count(*)::text, 'tb_naeste_webinar_tekst ikke null'
  from public.klaviyo_profil where tb_naeste_webinar_tekst is not null
union all
select 'E_mailgun_id_mangler_paa_ok', count(*)::text, 'ok-rækker uden mailgun_id (sporing af levering kan ikke kobles)'
  from public.webinar_mails where udfald = 'ok' and mailgun_id is null;
```
Det, der IKKE kan måles her, og derfor kun kan siges som «ikke målt»: hvor mange af de ~319 der faktisk fik 14-dagsmailen leveret (kræver Mailguns panel/events-API), og om nogen Klaviyo-kampagne til 13/10 er oprettet (kræver Klaviyo-læsning).
