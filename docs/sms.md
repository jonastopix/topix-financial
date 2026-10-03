# SMS på platformen — recon: udbydere, jura og hvordan den bygges

Recon 3/10-2026.

Status: **Recon 3/10-2026 — intet bygget; beslutninger hos Jonas.** Ingen migration, ingen function, ingen lås, ingen udbyder-konto.

Relateret:
- `docs/samtykke-og-opkald.md` — del 2 er «Må vi ringe til dig?» (`ring-mig-op`, `opkaldsanmodninger`); del 3 er listen over, hvad der skal være på plads, før SMS giver mening («SMS er sidst på den med vilje»). Findes på main.
- `docs/mailplan-14-dage-og-sms.md` — §3 «SMS: formålet først» (formål = fremmøde, samtykke, `en_time`-erstatning, opbevaring) og §4 «To veje til SMS'en» (A: eWebinars Twilio-integration; B: platformen sender selv). Findes på main. Dette papir erstatter ikke §3, men indfrier dets «udbyderen er ikke slået op» (§4, række «Uafhængighed»).
- `CLAUDE.md` «Platformens webinarmails» — mønstret, SMS-vejen spejler.

---

## 0. Beslutningsændringen

| Hvornår | Hvad | Kilde |
|---|---|---|
| 1/10-2026 kl. 14:28 | «Nej, vi har ikke SMS. Men det kan da sættes op som en frivillig ting … vi gør intet blindt.» | `docs/mailplan-14-dage-og-sms.md`, indledningen |
| 1/10-2026 (aftenlisten) | «Jeg synes ikke det giver mening at begynde at bruge SMS før vi tager webinaret ind i vores egen platform. Vi skal ikke putte mere på eWebinar, som vi alligevel gerne vil væk fra.» | `docs/samtykke-og-opkald.md`, indledningen |
| 30/9-2026, D2.6 | «SMS: ikke nu.» | Opgivet af hovedsessionen. **D2.6: 0 træf i repoet (søgt med grep i git).** `docs/analyser-30-09/webinarmotor-spec.md:657-658` har den nærmeste linje: SMS «udenfor v1». |
| **3/10-2026** | **«Der skal også opsættes SMS system på platformen. Det kan bruges til både medlemmer og webinardeltagere.»** | Jonas' ord 3/10 kl. 06:08, sendt i hovedsessionen (ikke set i repoet) |

Jonas' ord 3/10 kl. 06:08 (sendt i hovedsessionen) peger på en omstødelse af «SMS: ikke nu» (30/9) og af forbeholdet 1/10 («før webinaret er i vores egen platform»); den bekræftes i §8.1. Forbeholdet er ikke opfyldt endnu (webinaret ligger stadig hos eWebinar). Beslutningen skal bogføres, ikke gå i glemmebogen.

Ejerens formulering har to målgrupper: **medlemmer** og **webinardeltagere**. Det er to forskellige samtykke-, data- og formålsspørgsmål; de behandles hver for sig i §4 og §6.

---

## 1. Udbydere

Mærkning: **[målt]** = hentet 3/10 fra udbyderens egen side i denne session. **[recon]** = hovedsessionens recon-rapport 3/10, ikke genhentet her. Ingen af tallene er forhandlede priser.

### 1.1 GatewayAPI (anbefalet, med forbehold)

- Dansk virksomhed, EU-hosting «hosting, ownership and routing entirely within the EU», «annual ISAE 3000 and 3402 audit reporting» **[målt]** — [gatewayapi.com/pricing](https://gatewayapi.com/pricing/). DPA: siden henviser til «Legal DPAs, policies and agreements»; **vilkårene er ikke læst** **[målt: kun linket set]**. Databehandleren er ONLINECITY.IO **[recon]**.
- Pris: siden viser prisen i EUR eller DKK pr. land, men det danske tal stod ikke i det hentede indhold (skal hentes via «Download all SMS prices») **[målt: IKKE læst]**. Sekundær kilde: ca. EUR 0,033 pr. SMS **[recon]**. **Danske kroner pr. SMS er derfor ikke afgjort.**
- Afsender: «Up to 11 alphanumeric characters, or 15 digits» — [gatewayapi.com/docs/apis/rest](https://gatewayapi.com/docs/apis/rest/) **[målt]**. Det er den gamle REST-API's dokumentation.
- Det nye API på `messaging.gatewayapi.eu` **[recon]**: `reference` ekkoes i leveringskvitteringen (DLR). **Ikke genlæst her:** den gamle REST-API kalder feltet `userref` og siger: «Returned to you when you receive Delivery Statuses» **[målt]**. Om det nye API's felt hedder `reference` er derfor kun recon.
- Webhook: «within 5 seconds so GatewayAPI does not treat the event as failed»; signatur som JWT i headeren `X-Gwapi-Signature`; EU-domænet er `gatewayapi.eu` — [Lovable: GatewayAPI](https://docs.lovable.dev/integrations/gatewayapi) **[målt]**. Den gamle REST-API: 2xx = leveret, ≥ 300 = nyt forsøg senere **[målt]**.
- Lovable har en færdig GatewayAPI-forbindelse (API-token, valgfri webhook-signaturnøgle; «cannot call GatewayAPI's legacy REST API. Only the messaging API host is reachable») **[målt]**. Den er ikke nødvendig: huset kalder allerede Mailgun og Klaviyo direkte med `fetch` fra edge functions (`_shared/mailgunAfsendelse.ts`).

### 1.2 Twilio

- $0,0592 pr. SMS til Danmark; carrier fees kommer oveni; alfanumerisk afsender gratis, lejet nummer $15/md.; fejlede beskeder $0,001 — [twilio.com/en-us/sms/pricing/dk](https://www.twilio.com/en-us/sms/pricing/dk) **[målt]**.
- EU data residency for SMS (Irland, IE1) er GA: «SMS message personal data is stored and processed in the EU up to the point it reaches Twilio's connections with telecommunications providers» — [Twilio changelog](https://www.twilio.com/en-us/changelog/data-residency-for-sms--eu--is-now-generally-available--ga-) **[målt]**. **Rettelse til recon-rapporten:** rapporten sagde GA 30/6-2026; changelog'en er dateret **9/6-2026**. Datoen er ikke afgørende, men tallet står som målt.
- GatewayAPI er formentlig billigere end Twilio (sekundær kilde); kroneprisen er ikke læst; SureSMS' recon-tal (DKK 0,18) er lavere og ikke efterprøvet.

### 1.3 Øvrige **[recon — ikke genhentet]**

| Udbyder | Hvad der er noteret |
|---|---|
| Bird | `Idempotency-Key` holdes i 3 timer |
| Sinch | EU-endpoint; `client_reference` |
| Vonage | — |
| CPSMS | dansk |
| SureSMS | DKK 0,18 pr. SMS |
| SMS2GO | dansk |
| LINK Mobility | nordisk |

Kun Bird er noteret med en idempotensnøgle, og kun i 3 timer. **Ingen af dem fjerner behovet for vores eget spor** (§5): huset har ved Mailgun målt, at «ingen idempotensnøgle» er reglen (`CLAUDE.md`, «Platformens webinarmails»: Mailgun har ingen).

### 1.4 Afsender: alfanumerisk er envejs

- Et alfanumerisk afsendernavn (≤ 11 tegn) kan ikke besvares. Dermed er «svar STOP» (som `docs/mailplan-14-dage-og-sms.md` §3 foreslår som tekst) **ikke tilgængeligt** med alfanumerisk afsender. Afmelding sker i stedet via **et link i SMS'en** til samme `webinar-afmeld`-vej som mailen (`supabase/functions/webinar-afmeld`).
- Numerisk international afsender: +0,235 DKK pr. SMS hos Telenor DK **[recon]**. Et dansk/lokalt nummer, der kan svares på, er en dyrere og mere omstændelig vej og kræver en indgående kanal (§8, spørgsmål 6).

---

## 2. Jura

Kilde: Forbrugerombudsmandens vejledning om spamforbuddet 2021 — [vejledning-om-spamforbuddet-2021-a.pdf](https://forbrugerombudsmanden.dk/media/bjajzdv1/vejledning-om-spamforbuddet-2021-a.pdf) **[målt 3/10]**, kapitlerne nedenfor. Markedsføringslovens § 10 **[recon]**: `retsinformation.dk` kunne ikke hentes i denne session (URL'en var ikke i provenance-sættet), så lovteksten er ikke læst her.

| Krav | Kilde | Citat / indhold |
|---|---|---|
| Forudgående samtykke til elektronisk markedsføring, også til B2B | mfl. § 10 **[recon]**; vejledningen kap. 3: forbuddet gælder «i forhold til alle modtagere» **[målt]** | Samtykke er ikke kun et forbrugerkrav. |
| Samtykket skal være specifikt for SMS | kap. 7.2 **[målt]** | «Det skal fremgå, om virksomheden vil sende mail, sms eller anden elektronisk post.» Et mail-samtykke dækker ikke SMS. |
| Bevisbyrden er virksomhedens | kap. 11.1 **[målt]** | «Det er virksomheden, der skal kunne dokumentere, at personen har givet et samtykke.» |
| Opbevaring af dokumentationen | kap. 11.3 **[målt]** | «… så længe virksomheden anvender samtykket og indtil to år efter.» |
| Afmelding i hver henvendelse | kap. 9.1 **[målt]** | «… ved hver efterfølgende henvendelse … oplyses om muligheden for at frabede sig fremtidig markedsføring.» |
| Servicemeddelelser | kap. 6.2 **[målt]** | Servicebeskeder (fx prisændring, vilkår) kræver ikke samtykke, hvis de kun indeholder relevant information uden at reklamere. En påmindelse, der opfordrer til et køb, «er ikke en servicemeddelelse, men markedsføring» (kurv-eksemplet). |

### Hvad der IKKE kunne afgøres

- **Er en webinarpåmindelse («starter om en time, her er linket») en servicebesked eller markedsføring?** Vejledningens servicekapitel (6.2) nævner prisændringer og vilkår og dets eksempel på markedsføring er kurv-påmindelsen; en påmindelse om et arrangement, man selv har tilmeldt sig, er ikke dækket af et eksempel, jeg har set. **Uafgjort, og ingen jurist har vurderet det** (Jonas 21/9: ingen jurist, `CLAUDE.md` om Meta-låsen). Samtykke-krydset omgår spørgsmålet: hvis der er et specifikt SMS-samtykke, behøver vi ikke afgøre det. Samme sikre side som `docs/mailplan-14-dage-og-sms.md` §3.2.
- **Medlems-SMS** er et andet spørgsmål end webinar-SMS: er et medlems driftsbesked («din rapport er forfalden») en servicebesked? Det afhænger af indholdet, besked for besked. Ikke vurderet.
- Hvor længe selve **samtykke-beviset** skal gemmes, når telefonnummeret slettes efter 7 dage (kap. 11.3 siger to år efter, at samtykket ikke længere bruges), er et åbent punkt i §5.

---

## 3. Det repoet allerede har (kodelæst på main 3/10)

**Telefonnumre i dag:**
- `webinar_tilmeldinger` har **ingen telefonkolonne** (`supabase/migrations/20260919130000_webinar_tilmeldinger.sql`, tabellen fra linje 75; kolonnerne er plukkede felter + `raa` jsonb). `ewebinar-webhook` gemmer den rå payload; om eWebinars `raa` bærer et nummer er **umålt**.
- `profiles` har **ingen telefon** (ingen migration nævner telefon sammen med `profiles`).
- `ansoegninger.telefon` — `supabase/migrations/20260918200000_ansoegninger.sql:137` (ansøgerens, ikke deltagerens).
- `companies.contact_phone` — `supabase/migrations/20260225104718_3f655686-b552-45c2-8d38-39d51c72dd8a.sql:6` (virksomhedens kontakt; på `companies_medlem_kolonnevaern`s hvidliste, `supabase/migrations/20260930090000_companies_kolonnevaern.sql:222`).
- `opkaldsanmodninger.telefon` — `supabase/migrations/20261002270000_opkaldsanmodninger.sql:108`, E.164 med CHECK `^\+45[2-9][0-9]{7}$` (linje 126) og kommentaren på linje 140: «Bruges KUN til dette opkald — **aldrig SMS**, aldrig Klaviyo, aldrig Meta.» Samtykke-ordlyden er «Ja, Morten eller Jonas må ringe til mig om The Boardroom» (`supabase/functions/_shared/opkaldDom.ts:43`), opbevaring 90 dage (`opkaldDom.ts:46`). **Et SMS-nummer må derfor ikke hentes fra `opkaldsanmodninger`**: det er givet til et andet formål (`docs/mailplan-14-dage-og-sms.md` §3.3: «Et nummer givet til en påmindelse må ikke bruges til et opkald», og omvendt).

**Mønstre der kan spejles** (webinarmailvejen, `CLAUDE.md` «Platformens webinarmails»):
- **Dommen** — ren og spejlet: `supabase/functions/_shared/webinarMailDom.ts` (`PLANEN` fra linje 96, `en_time` med `minutterFoer: 60` på linje 125, `AKTIVE_ARTER` på linje 147).
- **Spor med unikt indeks** — `webinar_mails_en_pr_person_uidx WHERE udfald = 'ok'` (`supabase/migrations/20260922171000_webinar_mails.sql:86`), sporet skrives EFTER afsendelsen.
- **Lås** — `app_config['webinar_mail_aktiv']`, standard false, fail-closed (`supabase/migrations/20260922171000_webinar_mails.sql:19`; `supabase/functions/webinar-mail-cron/index.ts:10`).
- **Loft** — `MAILGUN_LOFT_PR_TIME = 1000` i `supabase/functions/_shared/webinarMailLoft.ts:48`.
- **Tidsbudget** — `JOB_TIMEOUT_MS = 60_000` i `supabase/functions/_shared/webinarMailBudget.ts:52`.
- **Alarm** — `_shared/webinarMailAlarm.ts` (mail til `driftModtager()` + `drift`-klokke).
- **Afmelding** — `supabase/functions/webinar-afmeld` (config i `supabase/config.toml:385`).
- **Token-side til samtykke** — `ring-mig-op` + `_shared/ringToken.ts` (`byggRingToken` linje 55, `laesRingToken` linje 62): HMAC over `ewebinar_id`, kun for deltagere, ét svar for ukendt/udløbet. En SMS-samtykkeside kan spejle den; for **tilmeldte** (ikke kun deltagere) skal «kun deltagere»-grenen (`harDeltaget`, `opkaldDom.ts:69`) ikke med.

**Hvad der ikke findes:** en SMS-udbyder, en `*_SMS_*`-secret, en SMS-tabel, en indgående kanal.

---

## 4. To målgrupper, to samtykker

### 4.1 Webinardeltagere (første skive)

Formål: **fremmøde** (`docs/mailplan-14-dage-og-sms.md` §3). Én SMS pr. tilmelding, **1 time før** sessionen. Tilmelding sker i eWebinar, så huset har **intet nummer** — det skal indsamles med et eget, tomt samtykke på en tokenside (spejl af `ring-mig-op`), linket fra en eksisterende mail (bekræftelsen eller `syv_dage`). Samtykkets ordlyd gemmes ordret med tidspunkt, som `opkaldsanmodninger.samtykke_ordlyd`.

### 4.2 Medlemmer (egen senere skive)

Et medlem har en konto og en virksomhed, men **ingen telefon på `profiles`**; `companies.contact_phone` er virksomhedens, ikke personens, og er sat til andre formål. Et medlems-SMS-system kræver: et nyt felt med nyt samtykke, et formål pr. beskedtype (hvilke beskeder?), og en afgrænsning til «overmailing»-reglen (Jonas har været meget tydelig om, at vi ikke må overkontakte; `CLAUDE.md`, nyhedsagenten, fund 4). Der er ingen liste over medlems-SMS-typer endnu. **Anbefaling: ikke i første skive** (§8, spørgsmål 5).

---

## 5. Anbefaling

**Udbyder: GatewayAPI.** Dansk, EU, ISAE, formentlig billigere end Twilio (kroneprisen ikke læst; SureSMS' recon-tal på DKK 0,18 er lavere og ikke efterprøvet), og et færdigt Lovable-integrationsspor findes (men bruges ikke). **Forbehold, der skal lukkes før beslutning:** DPA'en er ikke læst, og det danske kronebeløb pr. SMS er ikke læst.

**Første skive — webinarpåmindelse 1 time før:**
- **Samtykke:** eget, tomt kryds på en tokenside (spejl af `ring-mig-op`: token over `ewebinar_id`, STRIKS body, ét svar for ukendt/udløbet). Ordlyd i stil med `docs/mailplan-14-dage-og-sms.md` §3.2: «Send mig en SMS 1 time før webinaret starter (valgfrit)». Gemmes ordret, i E.164, som opkaldsrækken.
- **Spor:** `webinar_sms` med databasens dom «én pr. (nummer, session)» (`WHERE udfald = 'ok'`), skrevet EFTER afsendelsen. Udbyderens `reference` = sporets række-id, så leveringskvitteringen kan kobles; **vores spor er idempotensen** (udbyderne er ikke garanti nok, jf. §1.3).
- **Lås:** `app_config.webinar_sms_aktiv`, standard false, fail-closed; rigtig afsendelse kræver `dry_run: false` OG (lås ELLER prøve til én adresse), som `webinar_mail_aktiv`.
- **Loft og tidsbudget:** som mailvejen; tallene (pr. time, resttid for ét kald) sættes, når udbyderens grænser er læst.
- **Alarm:** samme form som `webinarMailAlarm.ts`; `webinar_sms` skal på `SELVMAILENDE_REFERENCER` i `_shared/klokkeMail.ts`, ellers fælder `klokkeMail.guard`.
- **Afmelding:** link i SMS'en til `webinar-afmeld`-vejen; «afmeldt» gælder alle fremtidige SMS. (Alfanumerisk afsender er envejs, §1.4.)
- **Opbevaring:** slet nummeret **7 dage** efter sessionen (`docs/mailplan-14-dage-og-sms.md` §3.2). **Åbent:** vejledningens to år (kap. 11.3) gælder *dokumentationen for samtykket*; hvad der gemmes uden nummeret (ordlyd, tidspunkt, en hash?) er ikke afgjort.
- **Måling:** holdout. Fremmøde (`set_procent` ≥ 75 %) med SMS mod uden, Wilson/`sammenlign` (lag 6). Under 5 i en gruppe = «for få». Uden en baseline er SMS ikke bevist (`docs/samtykke-og-opkald.md` del 3, punkt 5 og 12).
- **Rækkefølge:** som alt andet: motor og tests først → migration (FØR-SQL, kørsel, EFTER-SQL) → secret → eksplicit deploy → bevis (et felt kun den nye kode kan svare med) → lås.

**Medlems-SMS:** egen skive efter denne, når der findes en liste over beskedtyper og et samtykke.

---

## 6. Hvad der ikke kunne afgøres i recon

- GatewayAPI: DPA-vilkår, pris i kroner pr. dansk SMS, det nye API's præcise feltnavne (`reference`) og indgående beskeder/STOP.
- Om eWebinars `raa` bærer et telefonnummer (umålt).
- Om en webinarpåmindelse er en servicebesked (§2).
- De seks øvrige udbyderes oplysninger (§1.3) er hovedsessionens, ikke genlæst.
- Markedsføringslovens § 10-tekst: ikke hentet (retsinformation.dk blev afvist af værktøjet).
- Telenor DK's +0,235 DKK for numerisk afsender: recon.
- Beslutningen D2.6 af 30/9: 0 træf i repoet (søgt med grep i git).

---

## 7. Fund fra verifikationen af henvisningerne (3/10)

Rettet i forhold til hovedsessionens opsummering:
1. Twilio-GA dateret **9/6-2026** på Twilios egen changelog (rapporten: 30/6).
2. GatewayAPI's gamle REST-API kalder referencefeltet **`userref`**; rapportens `reference` hører til det nye API og er ikke genlæst.
3. «Intet gemmer telefonnummer på `webinar_tilmeldinger`/`profiles`» er kodelæst i migrationerne; ikke målt i prod (`information_schema`).
4. D2.6: 0 træf i repoet (søgt med grep i git).

---

## 8. Beslutninger for Jonas

1. **Bekræft omstødelsen af «SMS: ikke nu» (30/9, D2.6)** — ja/nej, og skal forbeholdet fra 1/10 («før webinaret bor i platformen») droppes?
2. **Skal SMS'en ERSTATTE `en_time`-mailen** for dem, der har sagt ja? Anbefaling: ja (`docs/mailplan-14-dage-og-sms.md` §3.1).
3. **Opbevaring:** nummeret slettes 7 dage efter sessionen (anbefaling) — og hvad gemmes som samtykkebevis efter sletningen?
4. **Afsendernavn** (≤ 11 tegn, alfanumerisk): fx «Boardroom» (10 tegn)? Valget er envejs (§1.4).
5. **Medlemmer nu ja/nej.** Anbefaling: nej; webinarpåmindelsen først, medlems-SMS som egen skive med egen beskedliste og eget samtykke.
6. **STOP-kanal:** afmelding kun via link (anbefaling, alfanumerisk afsender) — eller en svarbar afsender med indgående STOP (dyrere, mere drift)?
7. **Udbyder:** GatewayAPI, når DPA og kronepris er læst — ja/nej.
