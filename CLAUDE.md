# CLAUDE.md

The Boardroom — finansiel rådgivnings-platform for SMV'er bygget på Supabase + Vite/React.

## Kommandoer

```sh
bun install
bun dev
bun run test
bun lint
```

## Deployment af migrationer

Dette projekt kører på Lovable Cloud — Lovable ejer Supabase-projektet (ref: `loiavmastgeieqyiwyyr`). Det betyder:

- `supabase db push` virker IKKE. CLI fejler med "necessary privileges"-fejl fordi udviklerens konto ikke ejer projektet.
- `supabase link --project-ref ...` fejler af samme årsag.
- Migrationer skrevet i `supabase/migrations/` deployes ved at køre SQL'en manuelt i Lovable → SQL editor.

Workflow ved nye migrationer:
1. Skriv migration-fil i `supabase/migrations/<timestamp>_<navn>.sql`.
2. Commit + PR + merge til main (almindeligt git-flow).
3. Efter merge: åbn Lovable → SQL editor, paste migrationens SQL-body (uden migration-kommentaren øverst hvis ønsket), kør Run.
4. Verificér med `SELECT pg_get_functiondef(...)` eller anden passende query.

Migrationsfilen i repoet er kanonisk historik — Lovable's SQL editor er den faktiske eksekverings-kanal.

## Deployment af edge functions

Edge functions auto-deployer fra git-merge til main. Bekræftet empirisk via canary-eksperimentet i PR #15/16 (2026-05-11): kommentar-ændring i `get-advisor-alerts` var live i prod-koden ("View code") efter merge, FØR "Update"-knap blev klikket. Frontend-canary samme PR krævede derimod Update-klik for at blive synlig.

CLI-kanalen (`supabase functions deploy <name>`, `supabase functions list`) fejler med 403/privileges, samme klasse af fejl som `supabase db push`. Lovable Cloud hoster Supabase-projektet, og udviklerens egen CLI-konto har ikke management-rettigheder. CLI er ikke deploy-kanalen.

Workflow ved nye eller ændrede functions:
1. Skriv/redigér function-fil under `supabase/functions/<name>/`.
2. Commit + PR + merge til main (almindeligt git-flow).
3. Hvis PR'en også rører `src/`-filer: klik "Update" i Lovable for at publish'e frontend-builden.
4. Verificér i Lovable → Edge functions → vælg function → "View code".

UI-quirk ved verifikation: feltet "Last updated" på function-listen er IKKE pålideligt — det kan vise forældet timestamp efter en fersk deploy. "Deployments"-tælleren eller den faktiske source-kode i "View code" viser, hvad Lovable HAR af kilde. Brug aldrig "Last updated" til at konkludere om en deploy er gået igennem.

**«View code» er heller ikke beviset for DRIFTEN (målt 21/9-2026, #1045):** efter merget viste «View code» den nye kilde med markøren, men den KØRENDE bundle var den gamle — kørslen skrev 371 annoncer og 93 dagsrækker, men ingen række i den nye tabel `meta_hentning`, og `konto.tidszone` (nyt felt) var null. Kilden i editoren og bundlen i drift er to ting. **Beviset for en udrulning er en kørsel, der svarer med noget, KUN den nye kode kan svare** — et nyt felt i svaret, en række i en ny tabel, en ny markør i responsen. Byg det ind fra starten: en function-ændring, der ikke kan ses i sit eget svar, kan ikke bevises udrullet. Skub ved behov: en kommentarlinje i `index.ts` → merge igen.

**Asymmetri-note** (bekræftet 2026-05-11): De tre deploy-lag har forskellige kanaler:
- **Edge functions** (`supabase/functions/`): auto fra git-merge til main. Ingen manuel handling påkrævet.
- **Frontend** (`src/`): manuel via Lovable "Update"-knap. Et merge alene aktiverer Update-knappen men ændrer ikke prod-builden på `app.theboardroom.dk` før klikket.
- **Migrationer** (`supabase/migrations/`): manuel via Lovable → SQL editor. Hverken merge eller Update trigger migrations-deploy.

## Deployment af frontend

Frontend-koden under `src/` (Vite-build til `app.theboardroom.dk`) deployes IKKE automatisk fra git-merge. Lovable's UI viser en "Update"-knap når der er en ny version klar — klik den for at re-builde og publish'e den nye frontend-build.

"Update"-knappen er den eneste kanal for frontend-ændringer. Et merge til main lægger koden i repoet, men prod-builden på `app.theboardroom.dk` opdateres først efter klikket.

Update udgiver EDITORENS tilstand — efter frisk merge: giv Lovable-synken et øjeblik og verificér, at den nye commit er synket ind, før klik (lærdom 2026-08-05).

## Stack

Vite + React 18 + TypeScript + shadcn-ui + Tailwind på frontend.
Supabase (Postgres + Auth + Edge Functions/Deno) på backend.
Bootstrappet via Lovable (`@lovable.dev/cloud-auth-js`, `lovable-tagger`, `@lovable.dev/webhooks-js`).
Sentry, TanStack Query, React Router v6, react-hook-form + zod, Tiptap.
Integrationer: Stripe, Slack, Circle (community), Monday.com webhook, pdfjs-dist + xlsx (regnskabsparsing).

## Arkitektur

**Tenant-model**: `companies` er rod-entiteten. Brugere knyttes via `company_members`. Helper-funktionen `user_company_id(uid)` (SECURITY DEFINER) returnerer brugerens company_id og bruges i alle company-scoped RLS-policies.

**Roller**: enum `app_role` med værdier `member` | `advisor` | `admin`. Tjekkes via `has_role(uid, role)` (SECURITY DEFINER). Admin arver advisor — `has_role(x, 'advisor')` returnerer true hvis x har `admin`.

**RLS-mønstre** (policies er PERMISSIVE som default og stakker med OR — en række slipper igennem hvis BARE ÉN policy siger ja; kun `AS RESTRICTIVE` indskrænker. En policy der skal NÆGTE noget («hide», «skjul», «kun») er forkert hvis den er permissive. Målt 3/9: fire demo-policies var det, og ethvert medlem kunne læse alle virksomheders tal. Se `supabase/SECURITY_BASELINE.md` §5):
- Company-scoped: `company_id = user_company_id(auth.uid())`.
- Advisor-bred: `has_role(auth.uid(), 'advisor')` — fuld read, scoped write.
- Admin-only: `has_role(auth.uid(), 'admin')` — for `app_config`, `user_roles`.
- Self-only: `auth.uid() = user_id` — for `profiles`, ejer-ops på `handouts` og `financial_reports`.
- Service-role-only tabeller (ingen klient-mutation): `slack_*_log`, `email_send_*`, `*_oauth_*`.

**Edge function-buckets**. Functions har `verify_jwt = false` i `supabase/config.toml` (to undtagelser står `true`: `process-email-queue`, `send-notification-email`) — det er bevidst pga. Supabases signing-keys-system, og konsekvensen er at hver function SKAL validere selv før første service-role-handling.
- **Bucket A — bruger-trigget**: kald `authenticateUser(req)` FØRST. Brug derefter `callerClient` (JWT-scoped) til RLS-tjek af target-ressourcen, før service-role-klienten konstrueres.
- **Bucket B — service-role/cron**: kald `authenticateServiceRole(req)` FØRST. Afvis alt der ikke bærer service-role-nøglen.
- **Bucket C — eksterne webhooks**: per-funktion signaturverifikation FØR parsing (Monday.com: HMAC-SHA256-JWT når Authorization-header findes, ellers delt hemmelighed `?noegle=` i URL'en mod `MONDAY_WEBHOOK_SECRET` — se `_shared/mondayVaern.ts`; `verifyWebhookRequest` for auth-hook; Stripe-signature for Stripe).

**Immutability-triggers** (BEFORE UPDATE) blokerer ændring af identitets-/audit-felter, selv hvis RLS-policies skulle slække:
- `protect_message_immutable_fields` på `messages`: `sender_id`, `conversation_id`, `created_at`.
- `protect_handout_immutable_fields` på `handouts`: `user_id`, `company_id`, `created_at`.

**Adgangsdomme** (målt 3/9): adgang og tier afgøres FEM steder, ikke tre — `computeMembershipTier` i `src/lib/membershipTier.ts` og `supabase/functions/_shared/membershipTier.ts`, plus SQL-funktionerne `is_membership_active` (fail-open, Netværk/events), `har_aktivt_medlemskab` (fail-closed, community/indhold/events/storage) og `har_aktivt_abonnement` (exit-abonnentens Podcast & Talks). Kun de to TypeScript-kopier er dækket af en paritetstest; de tre SQL-domme rettes i hånden med en migration. Læs `docs/adgangsdomme.md` FØR nogen ændring i tier- eller adgangslogik.

**Signup**: `handle_new_user()` AFTER INSERT på `auth.users` orkestrerer fire grene (målt i prod 2/9 via pg_proc — rækkefølgen er den faktiske):
1. Advisor-invite (matcher `advisor_invitations.email`) — FØRST, og returnerer før medlemsgrenene. Det er vejen for `mode=signup` uden token.
2. Token-baseret invite (matcher `company_invitations.token`).
3. Email-baseret invite (matcher `company_invitations.email`). IKKE fail-closed på `email_confirmed_at` — en tidligere version af denne linje påstod det; målt 2/9 er der ingen sådan betingelse.
4. Intet invite-match → signup AFVISES med `RAISE EXCEPTION` (P0001). «Kun adgang via invitation» er håndhævet i databasen. En ny virksomhed oprettes kun når en matchet invitation har `company_id IS NULL`.

**Omkostningsnøgler** (17/9-2026): ÉN definition af omkostningsnøglerne og de tre regnestykker (`omkostningerIAlt`, `ebitdaRegnet`, `ebtRegnet`) i `src/lib/omkostningsnoegler.ts` og spejlet `supabase/functions/_shared/omkostningsnoegler.ts` (byte-ens krop, paritetstest). Enhver læser der summerer omkostninger (calcTotalExpenses, BVA, budget, ugefokus, motorens ebitda-afledning, rimelighed) går gennem den — ingen lokale lister. Nye kanoniske nøgler `other_costs` (resultatkonti uden for de navngivne grupper) og `other_operating_income` (en omkostningsgruppe hvis netto er en indtægt, positiv). Omkostninger er POSITIVE (7/9). Saldobalance-XLSX'ens resultat er `−Σ Perioden` over alle konti 1000–4999 med kontrolsum (`pnl_coverage`).

**Ansøgningsmotoren** (udkast 18/9-2026): ansøgningsflowet bor i platformen, ikke i Monday. Fem trin + lukket (`_shared/ansoegningTrin.ts`, spejlet i `src/lib`): ny → indkaldt → booket → afholdt → aftalegrundlag_sendt → underskrevet; DIREKTE TILBUD FINDES IKKE. Mondays statusfelt er delt i fire: `trin` · `lukkeaarsag` · `rykkere_sendt` · næste handling = en række i `planlagte_haendelser`. Rykkerkøen er ÉN mekanisme (`_shared/rykkerkoe.ts` + `ansoegning-rykker-cron`): reglerne (reaktion annullerer, hverdage 07–16, én mail pr. person pr. dag, «ikke nu» = 3 mdr. pause) står i filhovedet og har hver sin test. Rådgiveren rykkes også (20/9): trappen «ny» (dag 3 og 7 til kontakt@, så længe ingen har trykket) og «afholdt» (dag 2 til kontakt@, så længe tilbud/afslag udestår); «kom ikke» (`ikke_moedt`) fører afholdt → indkaldt med rykkerne fra trin 1. Et trin, der venter på os, får en trappe til kontakt@, som et trin, der venter på dem, får en trappe til ansøgeren. Trinnet skrives kun af `_shared/ansoegningMotor.ts:udfoerOvergang`. Ved underskrift BLIVER ansøgningen virksomheden med samme id, og det eksisterende betalingsforløb (`company_betalingslink`, `indgangs-paamindelser-cron`) overtager. Fra «underskrevet» tillader motoren KUN betalingsforløbets to dødsdomme på dag 60, og `company_betalingslink.faktura_sendt_at` afgør hvilken (19/9): `betalte_ikke` når fakturaen FAKTISK blev sendt, `udloeb` → «udloebet» når der aldrig blev bedt om pengene (pris aldrig sat, tom kontaktmail, faktura fejlet) — «betalte ikke» må aldrig stå på en, der ikke er blevet spurgt. **E-underskriften** (udkast 18/9): `send-til-underskrift` (Bucket A) fastfryser aftaleteksten med SHA-256-aftryk i `aftale_underskrift` (ejer: `ansoegning_id` XOR `company_id`) og sender linket `/aftale?token=…`; `aftale-underskrift` (token som legitimation, `verifyAftaletoken`, `verify_jwt = false`) tager navn + kryds + mailkode, skriver revisionssporet (`aftale_spor`) og kalder derefter `udfoerOvergang({art:"underskrevet"}, via "e_signatur")`. Adgang gives stadig ved BETALING. Aftaleteksten i `aftale_skabelon` er en PLADSHOLDER, som `send-til-underskrift` nægter at sende. Læs `~/Downloads/udkast-ansoegning-motor/README.md` (indtil den lander i `docs/`) før nogen ændring.

**Webinaret (eWebinar)** (udkast 19/9-2026): `ewebinar-webhook` (Bucket C — `verifyEwebinarSignature` i `_shared/ewebinarSignatur.ts` over den RÅ body, `verify_jwt = false`, trigger «All» i eWebinar) gemmer hver besked rå i `webinar_haendelser` (idempotent på SHA-256 af body) og én aktuel række pr. tilmelding i `webinar_tilmeldinger` (procenten går aldrig ned). Dommen «har set (≥ 75 %) / delvist set / mødte ikke op» UDLEDES af `set_procent` i `_shared/webinarDom.ts` (spejlet i `src/lib`, paritetstest) — aldrig gemt, aldrig af hændelsestypen; uden tal falder den tilbage på eWebinars `state`. Koblingen til ansøgninger er email alene (begge `lower`), læst i ét opslag (`hooks/webinar.ts`). Anbefalingen (`ansoegningAnbefaling`) læser stadig KUN ansøgerens eget svar — målingen vises ved siden af. Læs `~/Downloads/udkast-ewebinar-webhook/README.md` før nogen ændring.

**Klaviyo-motoren** (lag 3, 19/9-2026): `klaviyo-motor` (Bucket A, rådgiver-gate) er det eneste, der skriver til Klaviyo; alt spores i `klaviyo_spor` (FØR/sendt/EFTER — også tørkørsler, som er standard). Seks regler i `~/Downloads/udkast-klaviyo-motor/README.md`; de to, der IKKE kan udledes af koden: **(5)** en feltfiltreret læsning (`fields[flow-action]=…`) taber `definition.id` og duer aldrig som grundlag for en PATCH — læs ufiltreret. **(6)** Klaviyo KLONER en skabelon, når den kobles på en flowmail (målt: `TVbT4b → SYKyM6`); originalen er frakoblet fra det øjeblik, og klonen er usynlig i `GET /api/templates`. Find altid en flowmails skabelon GENNEM FLOWET. Motoren sammenligner derfor det sendte med svaret (`doemAfvigelse`/`doemFlowAfvigelse`) og lægger afvigelser i `klaviyo_spor.klaviyo_afveg` — Klaviyo har også ombyttet `trigger_time` uden at sige det. `ret_flowmail` tager `betingelser` (`additional_filters`; objekt = sæt, `null` = ryd, udeladt = rør ikke), dømt fail-closed af `doemBetingelser`. Migrationen `20260919230000_klaviyo_spor_afveg.sql` skal køres FØR functionen udrulles — `skrivSpor` indsætter hele objektet, så en manglende kolonne vælter hver sporskrivning.

**Marketingmotoren i seks lag** (19.–20/9-2026, `docs/marketingmotoren.md` — læs den FØR nogen ændring under `src/lib/marketing/` eller `_shared/klaviyo*.ts`): lag 1 grundlaget (`src/lib/marketing/grundlag.ts` + `udkastVaern.ts`, #1031: det en agent må skrive ud fra; `MANGLER` er en værdi) · lag 2 hændelserne til Klaviyo (`_shared/klaviyo.ts` som fundament, `klaviyoHaendelser.ts`, spor `klaviyo_haendelser`; fail-soft, aldrig en stoppet ansøgning eller betaling; «Ansoegning paabegyndt» fra kontaktskærmen, ikke oprettelsen; fremmøde «deltog / mødte ikke op» fra `ewebinar-webhook`, #1034 — bevist i drift 20/9 08:41 af `ewebinar-proeve`, #1036: Bucket A, signerer indefra, bygger registranten selv med id `PROEVE-`, aldrig et signerings-orakel) · lag 3 motoren (ovenfor) · **lag 4 agenten: IKKE BYGGET** · **lag 5 retur-data: SKITSERET** (`~/Downloads/udkast-klaviyo-retur/`; `$message` er IKKE flow-trinnet; kladder `indsendt_at IS NULL` filtreres væk) · lag 6 dommen (`src/lib/marketing/{statistik,maalingsdom,minde,marketingdom}.ts`, #1033: Wilson; overlap = «kan ikke afgøres», aldrig «ens»; tre niveauer dømt af BÅDE sessioner og mindste gruppe; «for få» ERSTATTER procenten; ÉN ændring pr. runde; skriver ikke, er ikke agenten — kildeværn). En agent kalder `maaForeslaas(felter, dom)` før ethvert forslag.

**Webinaret og annoncerne** (19/9-2026, `docs/webinaret-og-annoncerne.md`): `ewebinar-import` (tre tilstande) ved siden af webhooken; annoncesporet i egne kolonner (`utm_*`, `fbclid`, migration `20260919150000`); Meta hentes KUN læsende (`meta-annonce-opslag`, `meta-annoncer-cron` → `meta_annonce`, `meta_annonce_dag`; historik kan ikke hentes bagud; token pt. under nødnavnet `META_CAPI_TOKEN`); prisen pr. led i `src/lib/webinar/annoncepriser.ts` — aldrig en pris på < 5 personer, tæller og nævner over SAMME vindue (`afkort`), én tilmelding i højst én række. **Mønstret, målt to gange på to dage (#1024, #1033):** tæller og nævner skal dække samme periode, og en periode, der ikke er gået, er ikke en periode — tiden gives ind som `nu`.

Se `supabase/SECURITY_BASELINE.md` for den autoritative checklist.

## FORBIDDEN uden eksplicit grønt lys

- Ændring af `has_role()`, `user_company_id()` eller andre SECURITY DEFINER-funktioner.
- Ændring af `handle_new_user()` eller andre triggers på `auth.users`.
- Ændring af `protect_*_immutable_fields`-triggers.
- Migration-squash. Afvent 2–4 ugers prod-validering iht. SECURITY_BASELINE.md afsnit 8.
- Forsøg på `supabase db push` eller `supabase link` (vil fejle pga. Lovable Cloud-ejerskab).
- Sætte `verify_jwt = true` på edge functions uden verificering af alle kald-stier.
- Ændre tsconfig strict-flags i denne PR. Skal være dedikeret refactor.

## Nye edge functions — påkrævet mønster

- **Bucket A**: `authenticateUser(req)` FØR nogen service-role-handling. Brug `callerClient` til RLS-tjek af target-ressourcen før service-role-klienten oprettes.
- **Bucket B**: `authenticateServiceRole(req)` først.
- **Bucket C**: signaturverifikation før parsing af payload.
- Pinn altid versioner i `esm.sh`-imports. Ingen `@2` — brug `@2.97.0`.

**CI-værn**: GitHub Actions kører `scripts/check-edge-function-auth.ts` på alle PR'er mod main OG direkte push til main (Lovable-deploys). Værnet kræver at functions med HTTP-overflade + service-role-konstruktion indeholder mindst ét auth-prædikat fra unionen (helpers, `.getClaims`, `.getUser`, `parseJwtClaims`, webhook-signaturer, `Bearer ${...}`-compare). Cron-only functions skippes. Kør lokalt før push: `bun run check:edge-auth`.

## Nye migrations

- Filnavn: `<YYYYMMDDHHMMSS>_<beskrivelse>.sql`.
- **Filhovedets FØRSTE linje er `-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).`** — forklaringen kommer derunder. Den, der kører migrationer, scanner mappen efter den linje: `20260919090000_ventepladser_tidligst.sql` startede med forklaringen, blev sprunget over, og forsiden var nede for alle rådgivere i tolv timer (19/9 ca. 19:20 → 20/9 08:15; `docs/OVERLEVERING.md` «19.–20. september» §5).
- En frontend eller function, der læser en ny kolonne, når ikke Update/udrulning, før kolonnen er MÅLT i prod: `GET /rest/v1/<tabel>?select=<kolonne>&limit=0` med anon-nøglen → 200 (42703 = mangler; RLS afgør ikke, om kolonnen findes). tsc og suiten kan ikke se det — kolonnenavne er strenge bag `as any`.
- Hvis migrationen rører noget der står i `supabase/SECURITY_BASELINE.md`, opdater baseline-dokumentet i samme PR.
- Ingen `DROP POLICY` uden begrundelse i migration-kommentar.

## Git-flow

- Lovable skriver til `main`. Claude Code arbejder altid på feature-branches → PR → merge.
- Pull før hver session: `git pull origin main`.
- Lovable og Claude Code skriver ALDRIG samtidig.

## Test

- `bun run test` skal være grøn før commit (IKKE `bun test` — den rammer Buns egen test-runner uden om vitest-scriptet).
- Coverage er pt. minimal (3 filer: `src/test/example.test.ts`, `src/hooks/__tests__/useScrollToHash.test.tsx`, `src/lib/__tests__/pdfStructuralExtractor.test.ts`).
- Nye security-kritiske stier (RLS, triggers, RPC, edge function-auth) bør have test før merge.

## React-regler

- Nye hooks placeres i komponentens TOPBLOK før enhver betinget return. Linjelæsning af en hook-tilføjelse spørger altid: "står der en `return` over denne hook?" (React #310-lærdommen, 2026-08-05).

## Dokumentations-disciplin

- Ved arkitektur-ændring: opdater `CLAUDE.md` i samme PR.
- Ved baseline-relevant ændring: opdater `supabase/SECURITY_BASELINE.md` i samme PR.
