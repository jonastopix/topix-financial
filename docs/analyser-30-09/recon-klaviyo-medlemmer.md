# Recon: «Medlemmer (ekskluderes)» `Xr6Pm9` holdes ikke opdateret

30/9-2026. Kun fund + ét anbefalet design. Intet ændret (Klaviyo kun læst; repo læst fra origin/main `bddf563` i worktree `/home/claude/wt-klaviyomedlem`). Prod-databasen kunne IKKE læses (Supabase MCP: «You do not have permission») — alt om platformens tal nedenfor er kodelæsning, ikke måling.

## 1. Fund — listen `Xr6Pm9` i dag

| | værdi | kilde |
|---|---|---|
| navn | «Medlemmer (ekskluderes)» | K: get_list |
| oprettet / updated | 2026-09-28 10:17:23Z / samme sekund | K: get_list |
| opt-in | single_opt_in | K: get_list |
| profiler | **25** (uændret siden 28/9 — gennemgangen og marketingmotoren §9.2 siger også 25) | K: get_list profile_count |
| flow udløst af listen | ingen (`flow-triggers: []`) | K: get_list include |
| bulk-importjobs i kontoen | **ingen** (`get_bulk_import_profiles_jobs` = tom) | K |
| hvem fylder den | **Intet i repoet** skriver til en liste (grep: ingen `Xr6Pm9`, ingen `/lists/…/relationships/profiles` i `supabase/`). Ingen bulk-job. Altså fyldt manuelt 28/9 (UI eller enkeltkald) — selve metoden er ikke målbar med de værktøjer, jeg har. |
| seneste tilføjelse | **ikke målbar** (intet værktøj lister listens profiler med tidspunkt). `updated` = oprettelsen. |

**Det nye medlem 29/9 er bevist uden for listen:** «Blev medlem» (`W9hzr9`) har præcis ÉN hændelse: 2026-09-29 13:39:23Z, `lh@greensolar.dk`, `prisniveau_kr` 50000, `$event_id` `01e54ef4-…:2027-09-29` (K: get_events). Profilen `01M39DC6DB3313D5ZMYP9FGTR5` er på **ingen lister** (hverken `Xr6Pm9` eller Hovedlisten) og i segmenterne `Tc3fFm` Har ansøgt, `XVQA7f` A1 Må kontaktes, `VsmTCA` A3 Kun webinar-relation, `V3JZ8D` ZZ gammel (K: get_profile include lists,segments). `properties` = `{}`.

Hertil (marketingmotoren §9.2): 3 af 28 betalende fandtes slet ikke i Klaviyo 28/9 (Bastant Design, Doggybed, Homie).

### Hvor `Xr6Pm9` bruges (målt 30/9)

Flows (K: get_flow, `definition.profile_filter`):

| flow | id | status | filter med `Xr6Pm9` |
|---|---|---|---|
| Velkomst — nye på Hovedlisten | `TGxxUc` | live | profilfilter `is_member:false Xr6Pm9` (eneste betingelse) |
| Jonas - Deltog i webinar | `Wq3MkG` | live | profilfilter: Hovedliste ∧ samtykke ∧ `not Xr6Pm9` |
| Jonas - Moedte ikke op | `SDVvCW` | live | profilfilter: Hovedliste ∧ samtykke ∧ `not Xr6Pm9` ∧ `tb_naeste_webinar` not-set ∧ 0 «Deltog» 14 d |
| Sunset — 180 dage uden åbning | `XCqPKg` | draft | profilfilter: `not Xr6Pm9` ∧ 0 Deltog 60 d ∧ 0 Mødte-ikke 60 d |
| Meta Ads \| Tilmelding til Webinar-link | `R3HF5H` | draft | ikke læst (draft siden 18/8) |

Mail-niveau-filtre (`additional_filters` på de enkelte flowmails) er IKKE gennemlæst.

Kampagner med `Xr6Pm9` som ekskludering (K: get_campaigns):

| kampagne | id | status | send |
|---|---|---|---|
| Så webinaret 22/9 → ansøgning | `01M3KSWX5GSH4QV5EMMYS18S9G` | Scheduled | 1/10 08:00Z |
| Morten skriver #5 | `01M0ZW08CHD8VE94BFM1S4F9VX` | Scheduled | 7/10 08:15Z |
| Morten skriver #6 | `01M0ZW20VT98XYW721VYAX2KEV` | Scheduled | 15/10 08:15Z |
| Morten skriver #4 | `01M0ZVYKADBY41AX9FMT3PDAJQ` | **Draft** (ikke planlagt — §9.3 sagde 30/9) | — |
| Ikke mødt op 22/9 → invitation | `01M3KRQM8NPRK7M3VD037SZC76` | Sent 29/9 | (afsluttet) |

`Morten skriver #3` (Draft) ekskluderer IKKE `Xr6Pm9`. Segmenterne: ingen af de 10 nyeste (alle ≤ 28/9 14:05) bruger `Xr6Pm9` i definitionen; ældre segmenter er ældre end listen.

**Konsekvens nu:** `lh@greensolar.dk` er ikke på Hovedlisten og har ikke fået samtykke-grenen, så de live flows rammer ham næppe i dag — men han står i intet ekskluderingsværn, og kampagnen 1/10 og «Morten skriver» vælger på segmenter (`Su9sJq`, `QQsbKZ`), ikke på Hovedlisten. Om han rammes, afhænger af segmentindholdet (ikke målt).

## 2. Fund — hvad platformen skriver til Klaviyo i dag

**Profilfelter** (`klaviyo-profil-cron`, hver time, migration `20260921200000`; `_shared/klaviyoProfil.ts`, `_shared/klaviyoDato.ts`):
- KUN to felter, altid sammen: `tb_naeste_webinar` («2026-10-13 11:00:00», dansk tid) og `tb_naeste_webinar_tekst`.
- Hvem: alle mails i `webinar_tilmeldinger` med en kommende `session_tid`, minus afmeldte; felterne `unset` når der ingen kommende session er.
- Hvordan: `POST /api/profile-import/` (profiles:write) med `KLAVIYO_API_KEY` (læst ét sted: `klaviyoAfsendelse.skrivProfilHvisNoegle`). Tilstand + spor i `klaviyo_profil` (én række pr. mail; kolonnerne `tb_naeste_webinar`, `tb_naeste_webinar_tekst`, `udfald`, `status`, `svar`, `grund`, `forsoegt_at`, `skrevet_at`). Kun afvigelser skrives (`afviger`). Tørkørsel som standard; `email` begrænser til én mail (beviset). Budget 45 s; resten «udsat». Alarm til `driftModtager()` én gang pr. døgn.
- Profile-import OPRETTER profilen, hvis den ikke findes (Klaviyos reference, citeret i filhovedet).

**Hændelser** (`_shared/klaviyoHaendelser.ts`, `HAENDELSE`): `Ansoegning paabegyndt`, `Ansoegning sendt` (`XWaVxK`), `Blev medlem` (`W9hzr9`, oprettet 29/9 13:39 ved første hændelse), `Deltog i webinar` (`Y9rrmF`), `Moedte ikke op` (`WJ8PrD`).
- «Blev medlem» sendes fra `stripe-webhook` (`meldBlevMedlem`, linje ~841–861) EFTER kontraktdatoerne er skrevet ved indgangsbetaling; mail = `companies.contact_email` (kan være tom → sporets `ingen_mail`); unikt id `company_id:periode_slut`. Kun kontaktmailen — ikke teammedlemmerne. Intet «ophørte»-signal findes.

**Nøgler og scopes:**
- `KLAVIYO_API_KEY`: bevist i drift til `/events` og `/profile-import` (profiles:write). Om den har `lists:write`: **ikke målt**. Klaviyo tillader ikke at tilføje et scope til en eksisterende nøgle (citeret i `klaviyoAfsendelse.ts` og `klaviyoAfmelding.ts:41–44`).
- `KLAVIYO_AFMELD_KEY`: præcis `profiles:write`, `lists:write`, `subscriptions:write` (`klaviyoAfmelding.ts:41`) — men må KUN læses i `afmeldHvisNoegle` (CLAUDE.md, `metaTokenAdskillelse`-mønstret).

## 3. Fund — hvad «medlem» er i platformen

- Rod: `companies`; personer via `company_members (company_id, user_id, role)`; personens mail i `profiles.email` (nullable) eller `auth.users`. Virksomhedens `contact_email` (nullable) er en tredje mail, der ikke nødvendigvis er en bruger.
- Fem adgangsdomme (`docs/adgangsdomme.md` §1). Relevant for «må ikke have salgsmails»:
  - Dom 4 `har_aktivt_medlemskab`: bruger i ≥1 virksomhed med `is_legat = false` ∧ `contract_end_date > now()` (fail-closed). = fuldt betalende medlem + teammedlemmer.
  - Dom 5 `har_aktivt_abonnement`: `subscription_status = 'active'` ∧ fremtidig `subscription_current_period_end` (exit-abonnent på «Dine tal»).
  - Dom 1 `computeMembershipTier`: `no_date · full · subscriber · expired` (`no_date` = ingen dato; fail-open i dom 3).
- Særtilfælde: **legat** (`companies.is_legat`, eget miljø), **gæster** (`companies.vis_i_netvaerk = false`, fuld adgang, ikke medlemmer — migration `20260902110000`), **udløbne** (`contract_end_date` passeret → tier `expired`).
- Mellemfasen: underskrevet, men ikke betalt → ansøgningens `trin = underskrevet` uden slutdato; `blevMedlem()` er falsk til betaling.

Hvem skal ekskluderes fra markedsføring (min anbefaling til afgørelse — Jonas skal bekræfte legat og udløbne):
- JA: alle brugere + kontaktmail i virksomheder med `contract_end_date > now()` (også legat og gæster — de er i huset og skal ikke have «ansøg nu»), samt aktive exit-abonnenter.
- NEJ (tilbage i markedsføringen): udløbne (`expired`) — det er genvindingsmålgruppen. Samtykket afgør stadig, om de kan modtage.
- Ansøgere i gang (underskrevet, ikke betalt) er IKKE medlemmer — de styres af rykkerkøen og `Har ansøgt`.

## 4. Anbefalet design: profilfelt `tb_medlem` + segment «Medlemmer (auto)»

**Valg: platformen skriver et profilfelt; Klaviyo danner segmentet.** Ikke listeskrivning via API.

Begrundelse:
1. **Samme vej som i drift.** `profile-import` + `KLAVIYO_API_KEY` + `klaviyo_profil` + alarmen er bevist siden 21/9. Listeskrivning kræver `lists:write`, som `KLAVIYO_API_KEY` ikke er målt at have og ikke kan få tilføjet; `KLAVIYO_AFMELD_KEY` har det, men må kun læses ét sted. Det ville kræve en TREDJE nøgle.
2. **Absolut tilstand, ikke diff.** Et felt sættes til sin værdi (idempotent; en gentagelse er harmløs). En liste kræver tilføj OG fjern pr. profil-id — to endepunkter, profil-id-opslag, og en glemt fjernelse er usynlig.
3. **Opretter manglende profiler.** profile-import opretter profilen, hvis den ikke findes → de 3 betalende uden profil (og nye) kan nu ekskluderes. Profilen får intet samtykke og ingen liste — den modtager intet.
4. **Segmenter opdateres løbende af Klaviyo** og kan bruges både som flow-profilfilter og kampagne-ekskludering — præcis dér, hvor `Xr6Pm9` står i dag.
5. **Feltet er vores nøgle, sat af os** (princip 2: et felt vi selv sætter). Det kan også bruges af fremtidige medlemsflows.

**Værdien: boolean `true`/`false` — aldrig unset for en, der har været medlem.** `false` gør det synligt, at personen VAR medlem og er ophørt (genvinding). Altid boolean fra første skrivning (Klaviyo typer feltet efter første værdi — samme risiko som §1.2 for datoen). Segmentet defineres som `tb_medlem equals true`.

Valgfrit andet felt `tb_medlem_status` (`aktiv · abonnent · legat · gaest · udloebet`) til senere segmentering — ikke nødvendigt for ekskluderingen; anbefales udeladt i første PR (én ændring pr. runde).

### Kode (motor før flade)

1. **Ny ren dom** `supabase/functions/_shared/klaviyoMedlem.ts` (+ spejl kun hvis fladen skal vise det — ikke nødvendigt): `medlemsmailPrMail(virksomheder, medlemmer, profiler, nu) → Map<mail, boolean>`. Regler med hver sin test: aktiv kontrakt (`contract_end_date > nu`) → true for ALLE `company_members` + `contact_email`; aktivt abonnement → true; legat/gæst → true (afventer Jonas); ellers false KUN hvis mailen tidligere er skrevet true (ellers skrives den aldrig — vi opretter ikke profiler for folk, der aldrig var medlemmer). En mail i to virksomheder: true vinder. `lower(trim())`. Dommen genbruger `computeMembershipTier` fra `_shared/membershipTier.ts` — ingen sjette kopi af udløbslogikken (adgangsdomme §1).
2. **`_shared/klaviyoProfil.ts`**: ny `bygMedlemKrop(email, medlem: boolean)` → `attributes.properties.tb_medlem`, og `skrivMedlem(...)` med tilstand i `klaviyo_profil` (egne kolonner — rører aldrig webinarfelterne). Filhovedets «TO FELTER, ALTID SAMMEN» gælder stadig kun webinarparret.
3. **`_shared/klaviyoAfsendelse.ts`**: `skrivMedlemHvisNoegle` — samme `KLAVIYO_API_KEY`, samme kontrakt (kaster aldrig).
4. **`klaviyo-profil-cron/index.ts`**: et andet pas efter webinarpasset, inden for samme `BUDGET_MS`: læs `companies` (id, contract_end_date, subscription_status, subscription_current_period_end, is_legat, vis_i_netvaerk, contact_email), `company_members` (company_id, user_id), `profiles` (user_id, email) i sider; døm; skriv kun afvigelser. Svaret får `medlem: { laest, sat_true, sat_false, uaendret, udsat, fejlede }`. Alarmen genbruges (teksten skal nævne medlemsfeltet).
5. **Kildeværn**: `klaviyoMedlem.guard` — feltnavnet står ét sted; værdien er altid boolean; afmeldte-porten gælder IKKE her (et afmeldt medlem skal stadig markeres, så det aldrig kommer tilbage i en kampagne).
6. **(Valgfrit, trin 2)** `stripe-webhook.meldBlevMedlem`: skriv `tb_medlem = true` straks for kontaktmailen (fail-soft) — lukker den op til 60 min., hvor en ny betaler står uden mærke. Anbefales først, når cronen er bevist.

### Migration: JA

`<ts>_klaviyo_profil_medlem.sql` — første linje `-- IKKE KØRT. DEPLOY: …`: `alter table public.klaviyo_profil add column tb_medlem boolean, add column tb_medlem_skrevet_at timestamptz, add column medlem_udfald text, add column medlem_forsoegt_at timestamptz;` Skal køres OG måles (`GET /rest/v1/klaviyo_profil?select=tb_medlem&limit=0` → 200) FØR functionen udrulles — `upsert` med en ukendt kolonne vælter hver sporskrivning (samme fælde som `klaviyo_spor_afveg`). Cron-jobbet ændres ikke (samme function, samme timeplan).

### Secret / scope

Ingen ny. `KLAVIYO_API_KEY` (profiles:write, bevist). Ingen `lists:write` nødvendig.

### Bevis i drift (efter migration + eksplicit deploy fra build-chat)

1. Tørkørsel: `SELECT public.kald_edge('klaviyo-profil-cron');` → svaret bærer det NYE felt `medlem` (kun ny kode kan svare det); forvent `sat_true` ≈ antal medlemsmails (≥ 28 + teammedlemmer), `sat_false` = 0 første gang.
2. Én rigtig: `{"dry_run": false, "email": "lh@greensolar.dk"}` → læs profilen tilbage i Klaviyo: `properties.tb_medlem = true`, og profilen står i segmentet «Medlemmer (auto)».
3. Fuld rigtig kørsel; derefter: segmentets antal ≥ 25 og ALLE 25 profiler i `Xr6Pm9` findes også i segmentet (sammenligning læst i Klaviyo). En i listen, men ikke i segmentet = en regel, der mangler — stop før udskiftningen.
4. Én time senere: `sat_true` = 0, `uaendret` = alle (kun afvigelser skrives).

### Klik i Klaviyo bagefter (Jonas) — først når bevis 3 holder

0. Opret segment «Medlemmer (auto)»: Properties about someone → `tb_medlem` equals `true`. (Kan også oprettes via API af os, men segment-oprettelse er ikke et skrivescope, vi har i dag — manuelt er enklest.)
1. Flow `TGxxUc` Velkomst → Flow filters: «is not in list Medlemmer (ekskluderes)» → «is not in segment Medlemmer (auto)».
2. Flow `Wq3MkG` Deltog → samme udskiftning i flowfiltret.
3. Flow `SDVvCW` Mødte ikke op → samme.
4. Flow `XCqPKg` Sunset (draft) → samme.
5. Kampagne «Så webinaret 22/9 → ansøgning» (1/10 kl. 10:00) → Recipients: Don't send to: fjern listen, tilføj segmentet. **Før 1/10 08:00Z** — ellers går den med den gamle liste (som i sig selv er OK for de 25; kun lh@greensolar.dk mangler).
6. Kampagne «Morten skriver #5» (7/10) → samme.
7. Kampagne «Morten skriver #6» (15/10) → samme.
8. Kampagne «Morten skriver #4» (draft) → samme, før den planlægges.
9. Kampagne «Morten skriver #3» (draft) → TILFØJ segmentet (har ingen ekskludering af medlemmer i dag).
10. Tjek `R3HF5H` (draft) og flowmailenes egne filtre (ikke læst).
11. Behold `Xr6Pm9` (omdøb evt. «ZZ gammel - Medlemmer (manuel)») til alle ovenstående er skiftet; slet ikke før.

Kort nødhjælp indtil PR'en er i drift: tilføj `lh@greensolar.dk` manuelt til `Xr6Pm9` (ét klik) — ellers står han uden værn i kampagnen 1/10.

## 5. Åbent / ikke målt

- Antal medlemsmails i prod (companies/company_members/profiles) — Supabase-adgang nægtet.
- Om `KLAVIYO_API_KEY` har `lists:write` (irrelevant for det anbefalede design).
- Hvordan `Xr6Pm9` blev fyldt 28/9 (ingen bulk-job; metoden ikke synlig).
- Mail-niveau `additional_filters` i flowene og `R3HF5H`.
- Afgørelse: skal legat, gæster og exit-abonnenter ekskluderes (anbefalet: ja), og skal udløbne tilbage i markedsføringen (anbefalet: ja, med samtykke)?
- `Morten skriver #4` står som Draft, ikke planlagt 30/9 som §9.3 siger.
