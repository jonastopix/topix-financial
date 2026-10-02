# Prod hjem, med appen — planen

Udkast 1/10-2026. Jonas 30/9 20:57: «skriv en skarp, rolig plan for at tage prod hjem — og tag appen med i den. Ingen hast.»
Planen bygger på `docs/prod-hjem.md` (listen A1–F, §8 bloat) og `docs/app-beslutning.md` (vejene A–C, skiverne) og gentager dem ikke. Det nye her er **rækkefølgen, «færdig når» for hver fase og fire fund fra opslag, der ændrer papirerne** (markeret **NYT**). Ingen kode er skrevet, og intet er kørt.

---

## 1. Én skærm

**Målet:** Prod kører i Topix' egen Supabase-organisation under et navn, vi ejer (`api.theboardroom.dk`). Functions og migrationer deployes fra repoet. Den næste flytning, hvis den nogensinde kommer, er en DNS-ændring og ikke et projekt.

**Rækkefølgen:**
1. Ryd bordet.
2. Inventér.
3. Skær Lovable-afhængighederne én ad gangen, mens prod bliver hvor den er.
4. Generalprøve.
5. Prøveflytning med tidtagning.
6. Ét skiftevindue.
7. Efterløb.

Appens skive 1 (PWA + web push) ligger efter fase 3a og før generalprøven.

**Hvad der IKKE gøres:**
- Ingen tomme Supabase-projekter, intet skift omkring webinaret 13/10 eller en betalingsfrist.
- Ingen genafspilning af repoets 409 migrationsfiler. Skemaet tages fra prod (198 registrerede).
- Intet tredjepartsværktøj med adgang til medlemmers regnskaber, ingen Capacitor før flytningen er færdig.
- Lovable Cloud slettes tidligst 30 dage efter skiftet og efter et særskilt ja. Sletningen «cannot be undone» [L1].

**Hvorfor ingen hast:** Intet brænder (bloaten vokser ikke over 5,86 GB, `prod-hjem.md` §8). Gevinsten er ejerskab, ikke noget medlemmerne mærker, og den største risiko er at gøre det i ét hug. **Undtagelsen er fase 3a**, som har en ydre frist.

**NYT, og det vigtigste fund:** Supabase skriver: «New projects no longer have anon and service_role available for use». Legacy-nøglerne slettes også fra eksisterende projekter «Late 2026, TBC» [S1].
- Husets 30 Bucket B-functions (`authenticateServiceRole`) og `kald_edge` bygger på netop den legacy service_role-JWT. Cron sender den som `Bearer` fra vault, og gatewayen verificerer den med `verify_jwt = true` (`_shared/edgeFunctionAuth.ts`, filhovedet).
- **I et nyt projekt virker cron → functions derfor ikke uden en omlægning.** Den omlægning bliver formentlig også nødvendig i Lovables projekt inden årets udgang. Hvordan Lovable håndterer det: **ikke målt**.
- Derfor er det første tekniske skridt **ikke** flytningen. Det er at gøre huset uafhængigt af legacy-nøgler, mens vi står, hvor vi står.

---

## 2. Faserne

Hver fase er færdig, når målingen står i bogføringen (OVERLEVERING og det relevante kort). Fasen er ikke færdig, fordi koden er merget.

### Fase 0 — Ryd bordet (ingen nedetid)
- **0a:** `boardroom-2-prod` lukkes (`prod-hjem.md` F, B3).
  - *Færdig når:* nøglerne hos Stripe, e-conomic og Klaviyo er roteret, og et kald med en gammel nøgle er målt afvist. Projektet er pauset.
- **0b:** Bloaten. Målt 30/9: `postgres` har DELETE og TRUNCATE, men ikke VACUUM FULL (OVERLEVERING 7d). 8D kan kun Lovable køre; 8C kan vi selv. Pladsen behøver ikke tilbage før flytningen (en logisk dump tager kun levende rækker). Anbefaling: **8B** (dagligt oprydningsjob) nu, og samme job i det nye projekt fra dag ét.
  - *Færdig når:* `count(*)` på `cron.job_run_details` har ligget stabilt i 7 dage under det valgte loft.

### Fase 1 — Inventar (kun læsning)
`docs/prod-hjem.md` udvides med lister over: **secrets** (navn → hvor værdien hentes uden for Lovable → ejer → roteres ja/nej) · **`verify_jwt`** for alle functions (14 står ikke i `config.toml`) · **`cron.job`** fra prod · **auth-indstillinger** · **realtime-tabellerne** · **rækker med fulde storage-URL'er** på `loiavmastgeieqyiwyyr` · **indgående kald** (`stripe`/`calendly`/`ewebinar`-webhook, `auth-email-hook`; `monday-webhook` og `MONDAY_*`-secrets er NEDLAGT 2/10-2026 — 410 på alt, intet at flytte, `docs/OVERLEVERING.md` «2. oktober nat — Monday væk»).

*Færdig når:* hvert navn i `Deno.env.get` (og i konstanter) har en række med en kilde uden for Lovable, og hvert punkt under «Ikke målt» i `prod-hjem.md` §9 er målt eller begrundet udskudt.

### Fase 2 — Beslutningerne i §5 tages
Her vælger Jonas frontend-hjem (D3), før der bygges noget, der afhænger af valget.

### Fase 3 — Skær Lovable-afhængighederne, mens prod bliver
Hver del er et selvstændigt kort med beviset bygget ind, og delene tages i denne rækkefølge:

- **3a. Bucket B og `kald_edge` uden legacy-JWT (NYT).**
  - Supabase anviser følgende: med de nye nøgler fejler `verify_jwt` med «Invalid JWT», fordi «the keys aren't JWTs». Functions sættes til `verify_jwt = false` og autoriserer i koden. pg_net sender `sb_secret_…` i `apikey`-headeren fra vault [S2].
  - Prod har allerede en `sb_secret`-nøgle i runtimen (41 tegn, `edgeFunctionAuth.ts`). Omlægningen kan derfor bygges og bevises nu: konstant-tids-sammenligning mod runtimens nøgle, én function ad gangen, med værnet `check-verify-jwt-invariant` skrevet om.
  - Området er **FORBIDDEN uden grønt lys** (`verify_jwt`, CLAUDE.md), så det er D1.
  - *Færdig når:* alle cron-jobs kører 200 med den nye header i 48 timer, og et kald med den gamle Bearer-JWT er målt afvist af mindst én omlagt function.
  - **Målt i prod 1/10 ~03:20 (hovedsessionen, kun SELECT; vault ikke læst):** 32 cron-jobs, 24 HTTP-jobs (alle aktive) går ALLE gennem `public.kald_edge`, og 8 er ren SQL. Ingen anden funktion i `public` kalder `net.http_post`. `kald_edge` (SECURITY DEFINER) henter én nøgle fra vault, `email_queue_service_role_key`, og sender den som `Authorization: Bearer …`. **Omlægningen af afsenderen er derfor ét sted:** én ny vault-post med `sb_secret_…` (Jonas lægger den ind; Claude læser aldrig vault) og `kald_edge` sender den i `apikey`-headeren. `kald_edge` er SECURITY DEFINER, så ændringen står på FORBIDDEN-listen to gange: SECURITY DEFINER og `verify_jwt`. Modtagersiden er `authenticateServiceRole` (`_shared/edgeFunctionAuth.ts`), som i dag lader gatewayen bære signaturtjekket og læser role-claimet; den skal i stedet sammenligne `apikey` med runtimens `SUPABASE_SERVICE_ROLE_KEY` (sb_secret, 41 tegn) i konstant tid, og hver Bucket B-function flyttes til `verify_jwt = false` sammen med sin nye kontrol. Overgang: `authenticateServiceRole` godtager BEGGE former i en periode, og `kald_edge` skifter først, når alle Bucket B-functions er udrullet med den nye kode (beviset: et svar med en markør, CLAUDE.md «Deployment af edge functions»).
- **3b. Transaktionsmails over på Mailgun EU bag `managedEmail.ts`.**
  - *Færdig når:* en rigtig mail har Mailguns id i `email_send_log`.
- **3c. Auth-mails (`auth-email-hook`) over på samme transport.**
  - *Færdig når:* en nulstillingsmail er modtaget og logget.
- **3d. AI på egen udbydernøgle.**
  - *Færdig når:* et kald pr. AI-function er logget med den nye udbyder.
  - **NYT:** `LOVABLE_API_KEY` læses i 16 filer. Det er ikke kun AI: `managedEmail.ts`, `auth-email-hook`, `send-email`, `handle-email-events` og `preview-transactional-email` bruger den også. Lovable skriver, at nøglen «automatically generates and manages … for each project» [L2], og ingen kilde siger, at den følger med ud. **Antag, at den dør ved skiftet.** Derfor skal 3b–3d være færdige først.
- **3e. Google-login.** Kan næppe sættes op i Lovable Cloud (ikke målt). Det bygges i generalprøven: egen OAuth-klient og Supabase' provider. Med 4 identiteter er faldnettet «glemt adgangskode».

### Fase 3a, trin 1–3 (udkast 1/10-2026)
Jonas 1/10 08:06: «Ja 3a» — grønt lys til at **bygge**. Intet er rullet ud, ingen migration er kørt, og intet er målt i prod ud over det, der står under «Målt i prod 1/10» ovenfor. Overgangen er lagt i tre trin, så der aldrig er nedetid og aldrig et vindue, hvor role-claimet kan forfalskes.

**Trin 1 — bygget på grenen `feat/fase-3a-nye-noegler` (ikke merget, ikke udrullet).**
- *Afsenderen:* migration `20261002200000_kald_edge_apikey.sql` erstatter `public.kald_edge`. Den sender `Authorization: Bearer <legacy>` UÆNDRET og derudover `apikey: <sb_secret>` fra en NY vault-post, `kald_edge_sb_secret`, når posten findes og har formen `sb_secret_…`. Mangler posten, sendes præcis som i dag; har den en anden form, sendes den ikke (WARNING, aldrig en fejl). Alt andet er ordret (navnevalidering, timeout-grænser, RAISE når legacy-nøglen mangler). Ingen GRANT/REVOKE — `CREATE OR REPLACE` bevarer ejer og ACL, og filhovedets FØR/EFTER-SQL måler det. **Kontakten er vault-posten:** migrationen kan køres før nøglen findes, og tilbagerulningen er at slette posten.
- *Modtageren:* `authenticateServiceRole` dømmer nu med den rene `domServiceRole` (`_shared/serviceNoegle.ts`, 37 vitest-domme i `src/lib/__tests__/serviceNoegle.test.ts`). Vej 1: `apikey` (eller `Bearer sb_secret_…`), konstant-tids-lig runtimens `SUPABASE_SERVICE_ROLE_KEY`, sb_secret-form på begge sider. Vej 2: role-claimet, uændret. En forkert nøgle falder igennem til vej 2 — trin 1 ændrer intet svar for en kalder, der virker i dag. Alle functions står stadig med `verify_jwt = true`, og `check-verify-jwt-invariant` er uændret og grøn.
- *Udrulningen af modtageren:* en ændring i en delt fil ruller kun ud med hver functions næste eksplicitte deploy (CLAUDE.md «Deployment af edge functions»). Trin 1 kræver ikke, at alle 29 udrulles — uden den nye kode ignoreres `apikey`, og role-claimet bærer som i dag.
- *Rækkefølgen i drift:* merge → kør migrationen (FØR/EFTER i filhovedet; **SECURITY DEFINER = Jonas' ja i øjeblikket**) → E2-tørkørsel (uden posten: som i dag) → Jonas lægger posten i vault → **straks** E2 igen. 200 = videre; alt andet = slet posten (R1).

**Trin 2 — KUN beskrevet, ikke bygget. Pr. Bucket B-function, i ÉN udrulning:**
1. `supabase/config.toml`: `[functions.<navn>] verify_jwt = false`.
2. Functionen kalder en «kun nøgle»-tilstand (fx `authenticateServiceRole(req, { kunNoegle: true })` eller en særskilt `authenticateServiceKey(req)`), hvor dommen KUN godtager vej 1. Role-claimet må ikke godtages, for uden gatewayens signaturtjek kan enhver skrive `{"role":"service_role"}` i en usigneret JWT.
3. Svaret bærer en markør, kun den nye kode kan give, fx `"bucket_b": "noegle"`.
4. **Invariant-scriptet skrives om** (samme PR som den første omlagte function): `verify_jwt = false` ⇒ index.ts kalder «kun nøgle»-tilstanden og hverken `parseJwtClaims` eller den role-claim-bærende `authenticateServiceRole(req)`; `verify_jwt = true` ⇒ som i dag. Scriptet skal dømme på KALD, ikke på tekst: i dag tæller det `saet-indgangs-prisniveau` med, fordi ordet `authenticateServiceRole` står i en kommentar (index.ts:14).
- *Rækkefølgen pr. function:* forudsætningen er trin 1 i drift (posten i vault, E2 = 200) — ellers får en omlagt function 401 fra første cron-kørsel. PR → merge → **eksplicit deploy fra build-chatten** (beder den KØRE deploy-værktøjet og vise resultatet) → `SELECT public.kald_edge('<navn>');` (tørkørsel) → `net._http_response` = 200 med markøren → negativprøve: et håndskrevet `net.http_post` med KUN den gamle Bearer (ingen `apikey`) = 401. Først derefter næste function.
- *Pilot:* én function med tørkørsel og lav frekvens (eller uden cron-job). Hvilke af de 29 har cron-job og hvilket interval, skal læses fra `cron.job` — det har jeg ikke målt.
- *Ikke målt, og afgørende for trin 2:* (a) om Lovables deploy anvender `verify_jwt` fra `config.toml` ved en ændring fra true til false; (b) om gatewayen sender `apikey`-headeren videre til functionen. Begge bevises af pilotens 200 + markør; giver piloten 401, rulles den tilbage (ny deploy med `verify_jwt = true` og den gamle kode).
- *Uden for `authenticateServiceRole` — skal med i trin 2:* `send-notification-email` (egen kopi af `parseJwtClaims`, index.ts:71 og :186; `verify_jwt = true`; cron `process-notification-emails`) og `generate-weekly-focus` (`parseJwtClaims` :35 ELLER admin-bruger via `getClaims`; kaldes også fra fladen, `ConfigView.tsx:122`; `verify_jwt = true`). For den sidste: «kun nøgle» for service-vejen og `authenticateUser` + admin-tjek for brugervejen.

**Trin 3 — KUN beskrevet.** Når alle Bucket B-functions (de 29 + de to ovenfor) er på trin 2 og bevist med markøren, sender `kald_edge` ikke længere legacy-Bearer (ny migration; RAISE flyttes fra legacy-posten til `kald_edge_sb_secret`, så en manglende nøgle stadig er en høj fejl — 9/9-lærestregen). Først derefter kan `email_queue_service_role_key` fjernes fra vault. Fasens «færdig når» (48 timer med 200, den gamle Bearer målt afvist) gælder.

**Recon 1/10 — andre kaldere af Bucket B end `kald_edge` (kun læsning af repoet):**
- **Ingen function kalder en Bucket B-function.** `grep` efter `functions.invoke(` og `/functions/v1/` i `supabase/functions` giver seks steder, og intet af dem rammer en af de 29 (+2). Det stemmer med målingen 2/9 i `_shared/indgangsBetalingsmail.ts:5–10`, som også var grunden til, at den nu nedlagte `monday-webhook` (410 siden 2/10-2026) delte logikken i stedet for at kalde `send-indgangs-betalingsmail`; i dag deler ansøgningsmotoren og `aftale-underskrift` den af samme grund.
- De seks: (1) `import-application/index.ts:207` → `send-invitation-email` og (2) `_shared/sikrIndgangsInvitation.ts:234` (fra `stripe-webhook` :914, :925, :960, :1473, :1488) → `send-invitation-email`, begge med service-role-klienten (`adminClient.functions.invoke`). Målet står `verify_jwt = false` og sammenligner selv `token === serviceRoleKey` (`send-invitation-email/index.ts:62`, ikke konstant tid). Det bruger ikke legacy-nøglen, så trin 2/3 rører det ikke. Om supabase-js 2.97.0 sender sb_secret-nøglen som `Bearer` i `functions.invoke`, så service-vejen faktisk rammes i dag: **skal måles** (fx `email_send_log` for en invitation efter betaling med `efter_betaling`). (3) `generate-financial-commentary/index.ts:166` → `ai-financial-feedback` og (4) `genkoer-rapport/index.ts:325` → `extract-financial-data` videresender kalderens bruger-JWT til mål med `verify_jwt = false` — ikke service-role, ikke berørt. (5) `ewebinar-proeve/index.ts:94` → `ewebinar-webhook` (Bucket C, signaturheadere) — ikke berørt. (6) `webinar-mail-cron/index.ts:571/573` bygger kun link-URL'er.
- **Modtagere med egen nøgle-sammenligning:** `run-company-agent/index.ts:966` (`authHeader === \`Bearer ${serviceRoleKey}\``, `verify_jwt = false`; kommentaren nævner «weekly cron or other edge functions», men intet kald i repoet) og `send-pulse-reminder/index.ts:43` (samme form; cron-jobbet trukket tilbage i `20260612090000`). Kalder et af de 24 cron-jobs `run-company-agent` gennem `kald_edge`, kan service-vejen aldrig bestå (legacy-JWT ≠ sb_secret) — **skal måles mod `cron.job`**. Sender `kald_edge` efter trin 3 nøglen som `Bearer` (i stedet for kun som `apikey`), giver det pludselig et match og dermed fuld tillid i `run-company-agent`. Det er en ændring af adfærd og skal besluttes før trin 3.
- **Fladen** kalder ingen Bucket B-function. Undtagelsen er `generate-weekly-focus` (admin-vejen), se trin 2.

**Usikkerheder (U):**
- **U1:** Hvor Jonas kan aflæse runtimens `sb_secret`-nøgle i Lovable Cloud, er ikke målt (Supabase-dashboardet er utilgængeligt, [S7]). Findes den ikke, er alternativet en ny nøgle eller en engangs-function, der selv lægger runtimens nøgle i vault uden at vise den — begge kræver deres egen beslutning.
- **U2:** Om gatewayen (`verify_jwt = true`) tåler et kald med BÅDE gyldig legacy-Bearer OG `apikey: sb_secret_…`, er ikke målt. Derfor E2 straks efter posten og R1 som tilbagerulning (migrationens filhoved).
- **U3:** At modtagerne godtager nøglen, kan i trin 1 ikke ses i svaret (`authenticateServiceRole` returnerer stadig kun `true`). Det første bevis er trin 2's pilot.
- **U4:** Prods `kald_edge` er målt til at sende Bearer fra `email_queue_service_role_key`, men definitionen er ikke sammenlignet tegn for tegn med repoets. FØR-SQL'en gør det; afviger den: STOP.
- **U5:** Kollisionstjekket på migrationsnavnet er gjort mod `origin/main` og de lokale grene, ikke mod åbne PR'er på GitHub (intet netværk).

### Fase 4 — Det nye projekt og generalprøven (ingen nedetid)
- Eget projekt i EU på Pro med custom domain `api.theboardroom.dk`. Det er et betalt tillæg, og «the Supabase project domain continues to work» [S3] (D4).
- **Eksportkanalen er fundet (NYT, retter `prod-hjem.md` B7):**
  - Lovable: «request a full database export from More → Cloud → Overview → Advanced settings».
  - Brugerkonti følger med «together with their password hashes» [L3].
  - Lovables påstand «Database schema | Automatic via SQL migrations» passer **ikke** på os. Skemaet tages fra eksporten.
- Indlæsning sker med `session_replication_role = replica` [S4]. Storage flyttes med Supabase' script, fordi dumps ikke bærer filerne [S4]. Functions deployes med CLI. **Cron står slukket, alle låse er false, og der er ingen rigtige secrets til Mailgun, Stripe, Meta, Klaviyo eller GA.** En generalprøve, der sender én mail til et medlem, er en hændelse.
- *Færdig når:* rækketal pr. tabel = eksportens · diff på `pg_policy`, `pg_trigger`, `pg_get_functiondef` mod prod = 0 · objekter og bytes pr. bucket = prod (713 / 457 MB) · testkontoen logger ind med sin gamle adgangskode · hver cron-function har givet 200 på en manuel tørkørsel med den nye nøgle.

### Fase 5 — Prøveflytning med læsetest
- Gentag fase 4 fra en frisk eksport og tag tid på hvert trin. **Summen sætter vinduet.** De 2–4 timer i `prod-hjem.md` §3 er et skøn.
- Læsetest: Jonas og en rådgiver åbner staging-frontenden, læser tre virksomheder og ser, at tallene, Score og chatten svarer til prod.
- *Færdig når:* prøven er kørt to gange med tider, der ligger inden for 20 % af hinanden, og læsetesten har ingen afvigelser.

### Fase 6 — Skiftevinduet (nedetid)
Trinene i `prod-hjem.md` §3 fase 3 gælder. Skærpet på fire punkter:
1. **Den gamle database gøres skrivebeskyttet, før den endelige eksport.** Åbne faner med den gamle bundle skriver ellers videre i den gamle database efter eksporten, og de data går tabt. Midlet er `REVOKE INSERT, UPDATE, DELETE` på `public` fra `authenticated` og `anon` samt `cron.unschedule` pr. job. FØR-listen gemmes. Tilbagerulning er `GRANT` og `cron.schedule` fra listen. Det er en §3-handling, så den kræver Jonas' ja i vinduet.
2. **Webhooks peges om, før de nye functions er åbne.** Hos Stripe oprettes et nyt endpoint med en ny `whsec`, og det gamle slås fra. Svarer det nye endpoint ikke-2xx, til data er indlæst, gensender Stripe. Hvor længe Stripe gensender, skal slås op før vinduet. eWebinar indhentes med `ewebinar-import`. Calendly stemmes af mod sit API efter vinduet (Monday er nedlagt 2/10-2026).
3. **Point of no return er den første rigtige skrivning i det nye projekt.** Det sker, når frontenden er peget om og cron er tændt. Indtil da er tilbagerulning: GRANT, cron og webhook-URL'er tilbage.
4. *Færdig når:* målingerne fra fase 4 er gentaget mod den endelige eksport, ét rigtigt cron-job har kørt 200, en Stripe-testhændelse er modtaget, og ét medlem har logget ind.

### Fase 7 — DNS og efterløb
- `app.theboardroom.dk` og `notify.theboardroom.dk` peges om. Domænet `api.theboardroom.dk` står allerede.
- Det gamle projekt står skrivebeskyttet i 30 dage.
- CLAUDE.md, regelsættets §6/§6a og deploy-afsnittene skrives om i samme PR.
- *Færdig når:* intet kald har ramt `loiavmastgeieqyiwyyr` i 7 dage. Målt hvordan: **skal afgøres**. Lovables logflade er eneste kilde.

---

## 3. Risici og modtræk

| Risiko | Modtræk |
|---|---|
| **Alle logges ud** | For at bevare sessioner skal den oprindelige JWT-hemmelighed genbruges [S5]. Den har vi ikke. Det accepteres: 37 brugere, én mail før og én efter. Adgangskoderne virker uændret [S5][L3] |
| **Signing keys / legacy-nøgler** | Fase 3a før alt andet. Nye projekter har ingen legacy-nøgler [S1]. Bucket A's `getClaims` læser JWKS og bør tåle de nye nøgler. Om `verify_jwt = true` virker med asymmetriske bruger-JWT'er: **skal prøves i generalprøven** |
| **Webhooks hos Stripe, eWebinar og Calendly** (Monday nedlagt 2/10-2026) | Registreres på `api.theboardroom.dk`, ikke på `*.supabase.co`. Så rammer en senere flytning ikke tredjeparterne igen. Nye signeringshemmeligheder. Indhentning pr. kilde (fase 6.2). Klaviyo sender ikke webhooks ind (der findes ingen klaviyo-webhook-function). Afmeldingen kommer via eWebinar |
| **To prod'er samtidig** (dobbelte mails, dobbelt Meta/GA) | Cron og låse er slukket i det nye projekt, indtil det gamle er unscheduled. `kald_edge` peger på `api.theboardroom.dk` fra start |
| **Anon-nøglen i bundlen** | Den nye er en `sb_publishable`-nøgle i `.env`. Gamle bundles i åbne faner rammer den skrivebeskyttede gamle database (fase 6.1) |
| **`LOVABLE_API_KEY`** | Bærer både mail og AI (16 filer, herunder nyhedsagenten og `run-company-agent`). Fase 3b–3d i drift før skiftet |
| **Migrationshistorikken** | Ny baseline fra prod-dumpen. Det er reelt en squash, som står på FORBIDDEN-listen, og derfor er det D5. De gamle filer arkiveres og slettes ikke |
| **Lovable-agenten skriver i det egne Supabase** | Vælges Lovable som editor (D3), kan dens Supabase-integration selv køre migrationer, og så er der to skrivere. Reglen skal skrives før forbindelsen, ikke efter |

---

## 4. Appen i rækkefølgen

- **Skive 1** (PWA: service worker kun med `push`/`notificationclick`, ikoner, `push_abonnementer`, afsender-function) ligger **efter fase 3a og før fase 4**. Skiven er beskrevet i `app-beslutning.md` §4.
- **Hvorfor efter 3a:** Afsenderen er en Bucket B-function. Bygges den før 3a, bygges den på den auth-model, der dør, og skal laves om.
- **Hvorfor før flytningen:** Skiven er lille og fuldt Lovable-kompatibel, og effektmålingen (4–6 uger) kan løbe, mens fase 3b–5 bygges. Web push på iOS kræver kun «added to the Home Screen» og en tilladelse ved et tryk, intet Apple-udviklermedlemskab [W1]. `app.theboardroom.dk` er samme domæne før og efter, så service workeren overlever skiftet.
- **Én skærpning (NYT):** Et web push-abonnement er bundet til VAPID-nøglens offentlige del (`applicationServerKey`). Nøgleparret genereres af os, gemmes uden for Lovable og flyttes **uændret**. Et nyt par ved skiftet gør hvert abonnement dødt.
- **Capacitor / App Store** kommer først efter fase 7, og kun hvis skive 1 har flyttet tallene (`app-beslutning.md` A4). Guideline 4.2 kræver, at appen er «elevate[d] … beyond a repackaged website» [A1]. Gratis login uden køb kan stå på 3.1.3(f), «provided there is no purchasing inside the app» [A1].

---

## 5. Hvad Jonas skal beslutte

| # | Beslutning | Claudes anbefaling |
|---|---|---|
| **D1** | Grønt lys til fase 3a: Bucket B og `kald_edge` på de nye nøgler. Det rører `verify_jwt`, der står på FORBIDDEN-listen | **Ja, som det første tekniske skridt.** Det er nødvendigt både ved flytningen og formentlig også i Lovables projekt inden årets udgang [S1] |
| **D2** | Bloaten: 8B nu. Ønskes pladsen tilbage før flytningen, også 8C | **8B ja.** 8C kun hvis de 6 GB koster penge. Det er ikke målt |
| **D3** | Frontend-hjem efter flytningen | **Uden for Lovable**, med deploy fra GitHub bag en manuel godkendelse, så Jonas' «Update»-port bevares som et klik. Lovable som editor kun med en skriftlig regel om, at den aldrig kører migrationer |
| **D4** | Custom domain `api.theboardroom.dk` (betalt tillæg, prisen ikke slået op) | **Ja.** Det gør næste flytning til DNS |
| **D5** | Ny migrationsbaseline fra prod-dumpen (squash) | **Ja, ved skiftet.** De 409 filer kan alligevel ikke genskabe prod |
| **D6** | App skive 1 efter fase 3a og før generalprøven, og prisstigningen knyttes ikke til «app» | **Ja** (`app-beslutning.md` A1–A3) |

Region, PITR og hybrid står i `prod-hjem.md` B8–B9 og er ikke gentaget.

---

## 6. Kilder

- **[S1]** Supabase, «Upcoming changes to Supabase API Keys»: https://supabase.com/changelog/29260-upcoming-changes-to-supabase-api-keys
- **[S2]** Supabase, «Migrating to publishable and secret API keys»: https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
- **[S3]** Supabase, «Custom Domains»: https://supabase.com/docs/guides/platform/custom-domains
- **[S4]** Supabase, «Backup and Restore using the CLI»: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- **[S5]** Supabase, «Migrating Auth Users Between Projects»: https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects
- **[S6]** Supabase, «JWT Signing Keys» («Non-expired access tokens will remain to be accepted» ved rotation inden for ét projekt, og egne nøgler kan importeres): https://supabase.com/docs/guides/auth/signing-keys
- **[S7]** Supabase, «Can't Access Supabase Project When Using Lovable Cloud»: https://supabase.com/docs/guides/troubleshooting/cant-access-supabase-project-lovable-cloud
- **[L1]** Lovable, «Cloud»: https://docs.lovable.dev/features/cloud
- **[L2]** Lovable, «AI»: https://docs.lovable.dev/integrations/ai
- **[L3]** Lovable, «Deploying and hosting outside Lovable»: https://docs.lovable.dev/tips-tricks/external-deployment-hosting
- **[W1]** WebKit, «Web Push for Web Apps on iOS and iPadOS»: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- **[A1]** Apple, App Review Guidelines 4.2, 3.1.3(f): https://developer.apple.com/app-store/review/guidelines/
- Repo: `supabase/functions/_shared/edgeFunctionAuth.ts` (filhovedet), `supabase/migrations/20260910180000_kald_edge.sql`, `grep -l LOVABLE_API_KEY` (16 filer), `grep -l authenticateServiceRole` (30 functions). Målingerne fra 30/9 står i `docs/OVERLEVERING.md` 7d.
