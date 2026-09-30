# Prod hjem — skal The Boardroom flytte fra Lovable Cloud til eget Supabase-projekt?

Beslutningspapir, 30/9-2026 aften. **Kun målinger og opslag — ingen kode, intet kørt i prod.**
Udløst af Jonas 30/9 17:33: «Skal jeg oprette flere projekter i Supabase, for at vi tager ejerskabet hjem fra Lovable?» Claudes foreløbige svar: «nej, ikke nu — tomme projekter flytter intet; flytningen er et projekt i sig selv.» Papiret giver grundlaget for at beslutte **om, hvornår og hvordan**.

Læseregel: **MÅLT 30/9 18:05** = målt i prod af Claude gennem Lovables MCP (`query_database`, som `postgres`). **REPO** = talt i repoet på `origin/main` `97e0211e`. **OPSLAG** = dokumentation, kilde nederst. **Ikke målt** = ikke målt.

---

## 0. Kort

1. **Der findes ingen «frakobling».** Supabase: «Once Lovable Cloud is enabled for a project, it cannot be disconnected or switched to an external Supabase connection.» Lovable: «There is no one-click migration … export your Cloud data, connect a Supabase project to a **new** Lovable project, and rebuild the schema there.» (OPSLAG [1][2]) En flytning er en genopbygning plus en dataflytning plus et omlagt frontend-hjem.
2. **Det svære er ikke databasen** (ca. 150 MB brugsdata). Det svære er de fem ting, der i dag er *Lovable-tjenester*, ikke Supabase: Google-login (Lovables OAuth-mægler), auth-mails og transaktionsmails (Lovables mail-API og domænet `notify.theboardroom.dk`), AI (Lovables AI-gateway) og frontend-hostingen med Update-knappen.
3. **Anbefaling:** flyt — men ikke nu, og ikke i ét hug. Først lukkes `boardroom-2-prod`, og Lovable-afhængighederne skæres én ad gangen, mens prod bliver hvor den er (se §7). Selve databaseflytningen er sidste skridt og en planlagt aften med nedetid.
4. **Straks-fund:** 5,86 GB af databasens 6,0 GB er tom plads i `cron.job_run_details`. Uafhængigt af flytningen. Muligheder i §8 — ingen destruktiv handling uden Jonas.

---

## 1. Hvad vi vinder

| Gevinst | I dag (Lovable Cloud) | Eget projekt (Supabase Pro) |
|---|---|---|
| Deploy af edge functions | Kun via Lovables build-chat; to gange 21/9 skrev den «udruller nu» og stoppede (CLAUDE.md). CLI giver 403 | `supabase functions deploy <navn>` fra repoet/CI — bevisbart, gentageligt, uden credits |
| Migrationer | Paste i SQL editor; 409 filer i repoet mod 198 rækker i `schema_migrations` (REPO / MÅLT) — historikken i databasen er ikke repoets | `supabase db push` / `migration up`; `schema_migrations` bliver sand |
| Logs | Lovables Logs-flade; Supabase-dashboardet kan ikke åbnes (OPSLAG [1]) | Fuldt dashboard: function-logs, Postgres-logs, API-logs, advisors |
| Secrets | Sættes i Lovable; værdierne kan ikke læses ud (ikke målt, om de kan) | `supabase secrets set/list`; rotation vi selv styrer |
| Service role-nøgle / DB-URL | Ikke tilgængelig for os (OPSLAG [1]; `mcp/src/access/accessContext.ts` siger det samme) | Vores — MCP-serveren i `mcp/` kan bruge sin service-role-fabrik |
| Branching | Ikke tilgængelig (ikke målt i Lovable) | Preview-branches pr. PR, $0,01344 pr. branch-time (OPSLAG [5]) |
| Backups | «restore backups» nævnes (OPSLAG [2]); frekvens/opbevaring ikke dokumenteret, ikke målt | Pro: 7 dages daglige backups; PITR 7 dage ≈ $100/md og kræver mindst Small compute (OPSLAG [6]) |
| Ejerskab | Lovable ejer projektet (OPSLAG [1]) | Topix' egen organisation; egen databehandleraftale med Supabase |
| Ejerskab af tabelvedligehold | `postgres` ejer ikke `cron.job_run_details` — vi kan hverken indeksere eller rydde den (OVERLEVERING 10/9, §8 her) | Samme begrænsning for pg_cron-tabellen er ikke målt i et eget projekt; men vi kan kontakte Supabase som kunde |

---

## 2. Hvad det kræver — den fulde liste

Risiko: **H** = kan give datatab, udelukkelse eller dobbeltafsendelse · **M** = kan give nedetid eller fejl, der ses · **L** = mekanisk.

### A. Data og skema

| # | Element | Omfang (kilde) | Hvordan flyttes det | Risiko |
|---|---|---|---|---|
| A1 | Skema i `public` | 104 tabeller, 93 funktioner, 198 registrerede migrationer (MÅLT 30/9 18:05); 409 migrationsfiler (REPO) | **Tages fra prod, ikke genafspilles fra repoet** — de to stemmer ikke. Supabase' vej er `supabase db dump` (roller, skema, data) mod en forbindelsesstreng (OPSLAG [4]); den streng har vi ikke (OPSLAG [1]). Alternativ: en midlertidig eksport-function i prod (sådan gør tredjepartsværktøjet [8]) eller en dump udleveret af Lovable (ikke spurgt) | H |
| A2 | Data i `public` | Ca. 150 MB (6006 − 5856 MB; alt uden for `cron.job_run_details` under 100 MB pr. tabel, MÅLT) | Samme kanal som A1. `session_replication_role = replica` under indlæsning, så triggers (fx immutability, `handle_new_user`) ikke fyrer igen (OPSLAG [4]) | H |
| A3 | SECURITY DEFINER-funktioner, triggers, RLS | Indgår i A1; `has_role`, `user_company_id`, `handle_new_user`, `protect_*` står på FORBIDDEN-listen | Flyttes ordret; efter indlæsning måles `pg_policy`, `pg_trigger`, `pg_get_functiondef` side om side med prod | H |
| A4 | Tabeller ejet af `supabase_admin` / systemskemaer | Ikke målt | Supabase: ALTER-linjer mod `supabase_admin`-objekter må ofte kommenteres ud i skemafilen (OPSLAG [4]) | M |
| A5 | Rene nøgle-/tokenkolonner | Ti tabeller (claude-regelsaet §6a) | Flyttes med data; ingen omhashning nødvendig (`webinar_delinger` gemmer SHA-256-aftryk) | L |

### B. Brugere og login

| # | Element | Omfang | Hvordan | Risiko |
|---|---|---|---|---|
| B1 | `auth.users` med adgangskode-hashes | 37 brugere (MÅLT) | Supabase: hashes bevares ved flytning mellem projekter — «Users do not need to reset or recreate their passwords» (OPSLAG [3]). Om `postgres` kan læse `auth.users.encrypted_password` i Lovables prod: **ikke målt** | H |
| B2 | `auth.identities` | email 36, google 4 (MÅLT) | Flyttes med B1 | M |
| B3 | Sessioner / JWT | Alle aktive | Nyt projekt = nye nøgler → **alle logges ud én gang** (OPSLAG [3]). Med 37 brugere er det acceptabelt; det kræver en mail | L |
| B4 | **Google-login** | 4 identiteter (MÅLT); login går gennem `@lovable.dev/cloud-auth-js` i `src/integrations/lovable/index.ts` («auto-generated by Lovable»), kaldt fra `src/pages/Auth.tsx:231` (REPO) | Det er **Lovables OAuth-mægler**, ikke Supabase' Google-provider. Kræver egen OAuth-klient i Google Cloud, Google-provider i det nye projekt og `supabase.auth.signInWithOAuth` i koden. At Googles `sub` er det samme på tværs af OAuth-klienter, så de 4 identiteter matcher: **ikke slået op** | H |
| B5 | Auth-mails (bekræft, magisk link, nulstil) | `auth-email-hook` bruger `createAuthEmailHandler` fra `@lovable.dev/email-js` med `LOVABLE_API_KEY` og `LOVABLE_SEND_URL` (REPO) | Ny transport (Mailgun EU findes i huset: `_shared/mailgunAfsendelse.ts`) og hooket sat i det nye projekts Auth-indstillinger | H |
| B6 | Auth-indstillinger | Site URL, redirect-URL'er, OTP-levetid, rate limits — **ikke målt** | Aflæses i Lovable Cloud (hvis muligt) og sættes i hånden | M |

### C. Filer

| # | Element | Omfang | Hvordan | Risiko |
|---|---|---|---|---|
| C1 | Storage-objekter | 10 buckets, 713 objekter, ca. 457 MB (MÅLT); `company-logos` og `avatars` offentlige | Backups og dumps indeholder IKKE filerne — kun metadata (OPSLAG [4][6]). Kopieres bucket for bucket med service role på begge sider og tjekkes med antal + størrelse | M |
| C2 | Storage-politikker | Ligger i `storage`-skemaet, ikke målt | Med skemadumpen; måles bagefter | M |
| C3 | **Gemte fulde storage-URL'er** | Offentlige URL'er bærer `loiavmastgeieqyiwyyr.supabase.co` (fx avatar i opslagsmails, `src/lib/__tests__/opslagsMail.test.ts`). Hvor mange rækker der gemmer den fulde URL: **ikke målt** | Omskrives i data ved flytningen; allerede afsendte mails med gamle billed-URL'er dør, når det gamle projekt slettes | M |

### D. Kode og drift

| # | Element | Omfang | Hvordan | Risiko |
|---|---|---|---|---|
| D1 | Edge functions | 113 mapper + `_shared` (REPO) | `supabase functions deploy`. Én ad gangen med bevis, eller alle og derefter tørkørsler | M |
| D2 | `verify_jwt` pr. function | 99 afsnit i `config.toml`: 55 `true`, 44 `false`; **14 functions står ikke i filen** (REPO) | Ved CLI-deploy gælder filen + Supabase' standard (`true`) for de 14. Hvad Lovable i dag kører dem med: **ikke målt**. Skal gås igennem én for én, før deploy — ellers afvises webhooks eller åbnes endpoints | H |
| D3 | Secrets | Mindst 40 navne læst af functions, heraf 3 `SUPABASE_*`, som platformen selv sætter (REPO: `Deno.env.get` direkte + navne i konstanter: fx `KLAVIYO_API_KEY`, `KLAVIYO_AFMELD_KEY`, `META_SEND_TOKEN`, `META_ADS_TOKEN`, `META_CAPI_TOKEN`, `GA4_SEND_SECRET`, `MAILGUN_SENDING_KEY`, `MONDAY_WEBHOOK_SECRET`, `WEBINAR_AFMELD_SECRET`, `ANSOEGNING_CVR_DAGSLOFT`, `EWEBINAR_API_KEY`, `EWEBINAR_API_BASE`, `BUNNY_CHAT_*`, `BUNNY_STREAM_*`, `STRIPE_*`, `CALENDLY_*`, `SLACK_*`, `DATACVR_API_KEY`, `LOVABLE_API_KEY`, `LOVABLE_SEND_URL`, …) | Værdierne hentes fra kilderne (Stripe, Klaviyo, Meta …) — at de kan læses ud af Lovable: **ikke målt**. Anbefaling: rotér ved flytningen, så gamle kopier dør | M |
| D4 | **Transaktionsmails** | `_shared/managedEmail.ts` sender gennem `sendLovableEmail` fra domænet `notify.theboardroom.dk`, «delegeret til Lovable»; 20 functions bruger den (REPO) | Ny transport bag samme funktion (Mailgun EU), DNS for afsenderdomænet om. Skal være i drift og bevist FØR flytningen — ellers er flytningen også et mailskift | H |
| D5 | **AI** | 10 filer kalder `https://ai.gateway.lovable.dev/v1/chat/completions` med `LOVABLE_API_KEY` (REPO) | Egen udbyder-nøgle og endpoint. Om `LOVABLE_API_KEY` virker uden for Lovable Cloud: **ikke slået op** | M |
| D6 | pg_cron | 30 jobs (MÅLT); `kald_edge` har URL-roden `https://loiavmastgeieqyiwyyr.supabase.co/functions/v1/` og vault-nøglen `email_queue_service_role_key` hårdkodet (REPO: `20260910180000_kald_edge.sql`) | Jobbene eksporteres fra `cron.job` (ikke fra migrationerne), `kald_edge` rettes til ny rod, vault-nøglen oprettes igen. **Jobbene tændes først, når functions er bevist** — ellers kører to prod'er samtidig (dobbelte mails) | H |
| D7 | Vault | 1 secret (MÅLT) | Rodnøglen følger aldrig med en backup (OPSLAG [4]); secret oprettes på ny | L |
| D8 | Extensions | plpgsql, pg_stat_statements, uuid-ossp, pgcrypto, supabase_vault, pgmq, pg_cron, pg_net (MÅLT) | Slås til før skemaet indlæses | L |
| D9 | Realtime | 8 filer i `src` bruger `.channel(`; 9 migrationer nævner `supabase_realtime` (REPO) | Publikationens tabeller måles i prod og sættes igen (OPSLAG [4]: publikationer flyttes ikke) | M |
| D10 | **Webhooks udefra** | `stripe-webhook`, `calendly-webhook` (to signeringsnøgler), `ewebinar-webhook` (trigger «All»), `monday-webhook` (REPO) | Ny URL hos hver tredjepart; nye signeringshemmeligheder (Stripe-endpoint får nyt `whsec`). Hændelser i skiftevinduet skal kunne indhentes (Stripe kan gensende; eWebinar har `ewebinar-import`; Calendly og Monday: ikke slået op) | H |
| D11 | Hårdkodede refs | `ewebinar-proeve` (`WEBHOOK_URL`), kommentarer i 4 functions, 5 migrationer, 2 tests, `config.toml` `project_id`, `mcp/src/env.ts` (REPO) | Rettes i én PR | L |
| D12 | `types.ts` | Committes i dag af Lovable på `main` efter migrationer (CLAUDE.md) | `supabase gen types typescript` i vores eget flow | L |

### E. Frontend

| # | Element | Omfang | Hvordan | Risiko |
|---|---|---|---|---|
| E1 | Supabase-URL og anon-nøgle | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` i `.env`, som er committet (REPO) | Nye værdier | L |
| E2 | **Hostingen af app.theboardroom.dk** | Lovable-projektet «Boardroom Compass»; kan ikke skifte backend (OPSLAG [1]) | To veje: (a) et NYT Lovable-projekt forbundet til det egne Supabase-projekt (Lovables egen anvisning [2]) og domænet flyttet dertil; (b) hosting uden for Lovable (Vercel/Netlify/Cloudflare) direkte fra GitHub — så ruller frontend ved merge, og Update-knappen forsvinder | M |
| E3 | Dokumentation og værn | CLAUDE.md (deploy-afsnittene), `docs/claude-regelsaet.md` §6/§6a, værn der læser `config.toml` | Omskrives i samme PR som skiftet | L |

### F. Forudsætninger uden for platformen

- **`boardroom-2-prod` skal lukkes FØRST:** levende nøgler i klartekst og 11 åbne SECURITY DEFINER-funktioner (`docs/analyser-30-09/recon-boardroom-2-prod.md` §0 pkt. 6). Et nyt prod-projekt i samme organisation må ikke oprettes ved siden af et åbent.
- **Region:** Lovable Clouds region for prod er **ikke målt**. Nyt projekt bør ligge i EU (eksisterende: `topix-bogholderi` eu-west-3, `boardroom-2-prod` eu-west-1).
- **Organisationens plan:** om Topix' Supabase-organisation er på Pro, og hvad de to eksisterende projekter koster i compute: **ikke målt**.

---

## 3. Nedetid og rækkefølge

Anslået nedetid for selve skiftet: **2–4 timer om aftenen** (skøn, ikke målt — det afhænger af A1/A2-kanalen). Brugerne logges ud én gang (B3). Alt forarbejde sker med prod i drift.

**Fase 0 — ryd bordet (ingen nedetid)**
1. Rotér og luk `boardroom-2-prod` (F).
2. Straks-fundet (§8) afgjort.

**Fase 1 — skær Lovable-tjenesterne, mens prod bliver (ingen nedetid, hver for sig bevisbar)**
3. D4: transaktionsmails over på Mailgun bag `managedEmail.ts`. Bevis: en rigtig mail med Mailguns id i `email_send_log`.
4. B5: auth-mails over på samme transport. Bevis: en nulstillingsmail.
5. D5: AI over på egen nøgle. Bevis: ét kald pr. AI-function.
6. B4: Google-login gennem Supabase' egen provider. Kan bygges i dag, hvis Lovable Cloud tillader at sætte egen Google-klient (**ikke målt**); ellers ved skiftet.

**Fase 2 — generalprøve (ingen nedetid)**
7. Nyt projekt i Topix' organisation (EU, Pro, Small hvis PITR ønskes).
8. Eksport fra prod gennem den valgte kanal (A1): skema + data + `auth` + storage + `cron.job`-udtræk.
9. Indlæs, deploy alle functions, sæt secrets — **cron slukket**. Kør hele listen igennem i generalprøven og mål: tabeltal pr. tabel, `pg_policy`, `pg_trigger`, funktionsdefinitioner, objekter pr. bucket, login med adgangskode og Google.
10. Slet generalprøven, eller behold den som staging.

**Fase 3 — skiftet (nedetid)**
11. Vedligeholdelsesside på app.theboardroom.dk; cron i det gamle projekt slukkes (`cron.unschedule` pr. job — FØR-listen gemmes).
12. Endelig eksport → indlæsning → målinger side om side.
13. Webhooks (D10) peget om; frontend (E1/E2) peget om.
14. Tørkørsel af hvert cron-job i det nye projekt; derefter tændes jobbene.
15. Vedligeholdelsessiden fjernes; mail til de 37 om nyt login.

**Fase 4 — efterløb**
16. Det gamle projekt står **skrivebeskyttet** i mindst 30 dage (tilbagerulning). Lovable: «Remove Lovable Cloud … permanently deletes your Cloud instance and cannot be undone» (OPSLAG [2]) — kun efter Jonas' særskilte ja.
17. Indhentning af webhook-hændelser fra skiftevinduet (Stripe-gensendelse, `ewebinar-import`).

**Tilbagerulning:** indtil trin 13 er det gamle projekt stadig prod — stop og tænd cron igen. Efter trin 14 skrives der nye data i det nye projekt; en tilbagerulning kræver da, at de data føres tilbage i hånden.

---

## 4. Hvad der går tabt eller bliver sværere

- **Lovable-editoren på den nuværende app.** «Boardroom Compass» kan ikke skifte backend (OPSLAG [1]). Enten et nyt Lovable-projekt (E2a), eller Lovable forlades som editor (E2b). Om build-chatten i et Lovable-projekt forbundet til et *eget* Supabase-projekt deployer functions og migrationer direkte dér: **ikke slået op**.
- **Update-knappen.** Med E2b forsvinder den; frontend ruller ved merge (hurtigere, men uden den manuelle port, `claude-regelsaet.md` §1a bygger på).
- **`types.ts` fra Lovable.** Vi genererer den selv (D12) — én kommando, men en ny pligt.
- **Lovables mail, AI og OAuth-mægler.** Tre tjenester, vi i dag får med i prisen, bliver egne leverandører med egne aftaler og regninger (Mailgun har vi; AI og Google-klient er nye).
- **Lovables MCP-forbindelse til prod** (`query_database`, `deploy_project`) peger på det gamle projekt. Den erstattes af Supabase-forbindelsen, som allerede er koblet til Topix' organisation (claude-regelsaet §6).
- **Enkelthed for Jonas.** I dag er der ét sted at klikke. Bagefter er der Supabase-dashboardet, GitHub og evt. en hostingudbyder.

---

## 5. Pris

**I dag (Lovable Cloud): ikke målt.** Regningen for Cloud-forbruget ses i Lovable (workspace-indstillinger → forbrug). Lovables dokumentation angiver ingen kronebeløb: Cloud og AI-gateway måles som «Run credits» med månedlige tildelinger på Free, Pro og Business (OPSLAG [2]). En tredjepartsartikel (3/6-2026) angiver $25/md i gratis Cloud-hosting og $1/md i gratis AI pr. workspace (OPSLAG [7]) — ikke bekræftet af Lovable.

**Eget projekt (Supabase Pro, OPSLAG [5][6]):**

| Post | Pris | Denne størrelse |
|---|---|---|
| Pro-plan | $25/md inkl. $10 compute-kredit (dækker én Micro) | $25 |
| Compute | Micro $10 · Small $15 · Medium $60 pr. md | Micro dækket; Small +$5 netto |
| Disk | 8 GB inkl., derefter $0,125/GB | Ca. 0,15 GB efter flytningen (bloaten følger ikke med en dump) → $0 |
| Storage | 100 GB inkl. | 0,46 GB → $0 |
| Egress | 250 GB inkl. | Ikke målt, forventet under |
| Daglige backups | 7 dage inkl. | $0 |
| PITR 7 dage | ≈ $100/md, kræver mindst Small | valgfrit |
| Branching | $0,01344 pr. branch-time | ≈ $10/md for én branch hele måneden (0,01344 × 730 t = $9,81) |

**Regnestykket:** uden PITR ≈ **$25/md**; med Small + PITR 7 dage: 25 + (15 − 10) + 100 = **≈ $130/md**. Hertil kommer AI-forbruget (i dag i Lovable-regningen, bagefter hos en udbyder — ikke målt) og hvad de to eksisterende projekter i organisationen koster (ikke målt; `boardroom-2-prod` bør pauses/slettes efter F).

---

## 6. Alternativer

**6a. Blive og skærpe (lav indsats, beholder låsen).** Behold Lovable Cloud; ret de konkrete smerter: straks-fundet (§8), det faste deploy-script i build-chatten (claude-regelsaet §6a), og bogfør backup-forholdene ved at spørge Lovable. Vi ejer stadig ikke projektet, får ikke service role, og deploy går stadig gennem en chat.

**6b. Hybrid: nye tunge ting i eget projekt.** Det mønster, `topix-bogholderi` allerede følger. Nyt, der ikke deler brugere med platformen (bogholderi, agent-arbejde, analyser), bygges i Topix' egen organisation med CLI, logs og branching. Platformen bliver på Lovable. Risiko: to databaser med hver sin sandhed — enhver kobling (fx at bogholderiet læser medlemmer) kræver en API mellem dem og en klar ejer af hvert felt («hvor kommer feltet fra»).

**6c. Fase 1 først, flytning senere (anbefalet, §7).** Skær Lovable-tjenesterne (mail, auth-mail, AI, Google) mens vi bliver. Hver af dem er en selvstændig forbedring, og når de er væk, er selve flytningen «kun» database, filer, functions og webhooks.

**6d. Fuld flytning nu.** Mulig, men den samler fire tjenesteskift, et skemaskift og et hostingskift i ét vindue. Det bryder «ét skridt ad gangen».

---

## 7. BESLUTNINGER TIL JONAS

**Anbefaling:** Opret **ingen** nye Supabase-projekter nu. Vælg 6c: luk `boardroom-2-prod` først, skær derefter Lovable-tjenesterne én ad gangen, og tag selve flytningen som et planlagt projekt med generalprøve, når fase 1 er bevist i drift.

| # | Beslutning | Claudes anbefaling |
|---|---|---|
| **B1** | Skal prod flyttes til Topix' egen Supabase-organisation på sigt? | **Ja.** Ejerskab, CLI-deploy, logs, backups og service role vejer tungere end Lovable-editoren for en platform, der bærer betalinger og medlemmers regnskaber. |
| **B2** | Hvornår? | **Ikke i oktober.** Tidligst efter webinaret 13/10 og efter fase 1. Flytningen lægges på en aften uden webinar og uden betalingsfrist. |
| **B3** | Lukning af `boardroom-2-prod` (rotér nøglerne hos Stripe, e-conomic og Klaviyo; luk de 11 åbne funktioner; pause projektet) | **Ja, som det første** — uanset B1. |
| **B4** | Straks-fundet `cron.job_run_details` (§8) | Mål rettighederne først (§8, SELECT). Derefter vælger Jonas mellem 8B og 8D. |
| **B5** | Fase 1-rækkefølgen: transaktionsmails → auth-mails → AI → Google-login | **Ja**, hver som sit eget kort med bevis i drift. |
| **B6** | Frontend-hjem efter flytningen: nyt Lovable-projekt (E2a) eller hosting uden for Lovable (E2b)? | **Udskyd** til efter fase 1; slå først op, om et Lovable-projekt på eget Supabase stadig deployer functions fra build-chatten. |
| **B7** | Eksportkanal for data (A1): egen midlertidig eksport-function, dump udleveret af Lovable, eller tredjepartsværktøj | **Egen function eller Lovables dump — aldrig et tredjepartsværktøj** med adgang til medlemmers regnskaber. Spørg Lovable først. |
| **B8** | PITR (≈ $100/md) på det nye projekt? | **Ja**, når platformen bærer betalinger; ellers daglige backups. |
| **B9** | Hybrid (6b) for NYE tunge ting, fx bogholderiet, i `topix-bogholderi` | **Ja**, med regel: ingen tabel, der dubleres fra platformen; kobling kun gennem en API med én ejer pr. felt. |

---

## 8. Straks-fund — `cron.job_run_details` fylder 97 % af databasen

**MÅLT 30/9-2026 18:05:** databasen er 6006 MB; heraf er `cron.job_run_details` **5856 MB heap** med ≈ **41.000 rækker** (runid 1.878.375–1.919.702). Tabellen ejes af `supabase_admin`. Sidste autovacuum 10/9. Resten af databasen er under 100 MB pr. tabel.

**Hvad det er (OVERLEVERING, 10/9):** mailkøens gamle afsender planlagde ét engangs-cron-job pr. afsendelse; 1.895.419 rækker. Lovable ryddede **1.892.693** rækker 10/9. En `DELETE` frigiver ikke plads til styresystemet — rækkerne markeres døde, og autovacuum gør pladsen genbrugelig *inde i tabellen* (OPSLAG [9]). Derfor fylder 41.000 rækker stadig 5,86 GB. Kun `VACUUM FULL` (eller `TRUNCATE`) giver pladsen tilbage (OPSLAG [9]).

**Hvad det betyder nu:**
- Tabellen vokser ikke over 5,86 GB, før den døde plads er genbrugt (41.000 rækker bruger en lille brøkdel). pg_cron rydder aldrig selv: «The records in cron.job_run_details are not cleaned automatically» (OPSLAG [10]). Rækketallet vokser med ca. 2.000 om dagen (41.327 runid på 20 dage siden oprydningen — regnestykket: 1.919.702 − 1.878.375 = 41.327; ÷ 20 ≈ 2.066; skøn).
- **Om de 5,86 GB tæller på Lovable-regningen eller mod en diskgrænse: ikke målt og ikke dokumenteret** (Lovables docs nævner kun, at instansstørrelse og lager kan ændres i Advanced settings, OPSLAG [2]). I Supabase tæller død plads med i databasestørrelsen; på Pro vokser disken automatisk ved 90 % og skrumper ikke af sig selv (OPSLAG [9]).
- For en flytning er den ligegyldig: en logisk dump tager kun de levende rækker med.

**Rettighederne er ikke målt.** `postgres` er ikke superuser og ejer ikke tabellen. Før noget vælges, måles (kun læsning, Lovable SQL editor eller MCP):

Lovable SQL editor
```sql
SELECT 'truncate' AS ret, has_table_privilege('postgres','cron.job_run_details','TRUNCATE')::text AS svar
UNION ALL SELECT 'delete', has_table_privilege('postgres','cron.job_run_details','DELETE')::text
UNION ALL SELECT 'insert', has_table_privilege('postgres','cron.job_run_details','INSERT')::text
UNION ALL SELECT 'maintain', has_table_privilege('postgres','cron.job_run_details','MAINTAIN')::text
UNION ALL SELECT 'pg_maintain_medlem', pg_has_role('postgres','pg_maintain','MEMBER')::text
UNION ALL SELECT 'job_ejere', string_agg(DISTINCT username, ',') FROM cron.job
UNION ALL SELECT 'raekker_25t', count(*)::text FROM cron.job_run_details WHERE runid > (SELECT max(runid) - 3000 FROM cron.job_run_details) AND start_time > now() - interval '25 hours';
```
(`MAINTAIN`-privilegiet og rollen `pg_maintain` findes fra Postgres 17, som prod kører. Den sidste linje læser kun de nyeste 3.000 runid gennem primærnøglen — tabellen må ikke skannes med `WHERE start_time` alene, OVERLEVERING 10/9.)

**Muligheder (ingen vælges uden Jonas — alle sletter historik eller låser en systemtabel):**

| | Handling | Frigiver plads? | Forudsætning | Risiko |
|---|---|---|---|---|
| **8A** | Gør intet nu | Nej | — | Ingen ny; disken forbliver 6 GB; ukendt pris |
| **8B** | Et dagligt oprydnings-job: `DELETE … WHERE runid < max(runid) − N` (pg_cron's eget eksempel er en daglig DELETE, OPSLAG [10]) | Nej — men forhindrer ny vækst, og den døde plads genbruges | DELETE-ret (målt ovenfor); jobbets ejer må slette egne rækker (OPSLAG [10]) | Historik ældre end N forsvinder; vagten læser kun de nyeste 2.000 runid |
| **8C** | TRUNCATE med bevarelse af de seneste 25 t: kopiér de seneste rækker til en midlertidig tabel → `TRUNCATE cron.job_run_details` → sæt dem ind igen | **Ja, straks** | TRUNCATE- og INSERT-ret (ikke målt) | Kortvarig lås; en cron-kørsel netop dér kan miste sin logrække; kan ikke rulles tilbage |
| **8D** | Henvendelse til Lovable (eller gennem Lovable til Supabase): «kør `VACUUM FULL cron.job_run_details`» | **Ja** | Ejer eller MAINTAIN (ikke målt) — ellers kun Lovable | Tabellen låses under kørslen (OPSLAG [9]); med 41.000 levende rækker forventes sekunder (skøn) |
| **8E** | Lad flytningen løse det | Ja, ved flytningen | B1/B2 | Løser intet før flytningen |

**Claudes vurdering (ikke en beslutning):** 8B forhindrer, at fejlen gentager sig, uden at frigive plads, og 8D frigiver pladsen uden en TRUNCATE fra vores side. Hvad der er rigtigt, afhænger af rettighedsmålingen og af, om de 6 GB faktisk koster noget. Begge dele måles først.

---

## 9. Ikke målt / ikke slået op (samlet)

- Lovable Clouds region for prod; prisen på Lovable-regningen; om død plads tæller der.
- Om `postgres` kan læse `auth.users.encrypted_password` i prod.
- Rettighederne på `cron.job_run_details` (SELECT i §8).
- `verify_jwt` for de 14 functions uden afsnit i `config.toml`, som Lovable kører dem i dag.
- Om secrets-værdier kan læses ud af Lovable; auth-indstillingerne (site URL, redirects).
- Hvor mange rækker gemmer fulde storage-URL'er med prod-ref'en.
- Realtime-publikationens tabeller.
- Om Lovable udleverer en dump; om build-chatten deployer til et eget Supabase-projekt.
- Om `LOVABLE_API_KEY` (AI-gateway) virker uden for Lovable Cloud; om Googles `sub` følger med til en ny OAuth-klient.
- Topix' Supabase-organisations plan og de to eksisterende projekters pris.

## Kilder

1. Supabase, «Can't Access Supabase Project When Using Lovable Cloud»: https://supabase.com/docs/guides/troubleshooting/cant-access-supabase-project-lovable-cloud
2. Lovable, «Cloud»: https://docs.lovable.dev/features/cloud · «Self-hosting»: https://docs.lovable.dev/tips-tricks/self-hosting
3. Supabase, «Migrating Auth Users Between Supabase Projects»: https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects
4. Supabase, «Backup and Restore using the CLI»: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
5. Supabase, «Pricing»: https://supabase.com/pricing
6. Supabase, «Database Backups»: https://supabase.com/docs/guides/platform/backups
7. vp0.com, «How Much Does Lovable AI Cost? (2026)», 3/6-2026 (tredjepart): https://vp0.com/blogs/how-much-does-lovable-ai-cost
8. Dreamlit, «Lovable Cloud to Supabase Exporter» (tredjepart; bruger en midlertidig edge function i Lovable Cloud): https://dreamlit.ai/tools/lovable-cloud-to-supabase-exporter · WZ-IT, «Migrate Lovable Cloud to Supabase», 25/8-2026 (tredjepart): https://wz-it.com/en/knowledge/supabase/migrate-lovable-cloud-to-supabase/
9. Supabase, «Understanding Database and Disk Size»: https://supabase.com/docs/guides/platform/database-size
10. pg_cron 1.6.2-dokumentationen (Crunchy Data): https://access.crunchydata.com/documentation/pg_cron/1.6.2/pdf/pg_cron.pdf
