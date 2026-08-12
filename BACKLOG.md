# BACKLOG.md

Prioriteret arbejdsplan over de 10 røde flag fra recon-pass'et 2026-05-07.
Dokumentet er ikke en idé-liste — det er konkrete punkter forankret i
faktiske filer og linjer i kodebasen. Vedligeholdes ved at fjerne punkter
når de er løst (med reference til merged PR), og tilføje nye fund med
prioritet når de opdages. Prioritering følger rækkefølgen P0 (aktive huller),
P1 (supply chain / disciplinære lukker), P2 (inkonsistenser), P3 (bevidst
udskudt strukturel gæld).

---

### [P0] ✅ Løst i PR #4 — `get_users_last_login` lækkede auth-metadata til alle authenticated

**Status**: Løst. Bodyen gater nu på `has_role(auth.uid(), 'advisor'::app_role)` — non-advisor callers får 0 rækker. EXECUTE-grant til `authenticated` bevaret; sikkerheden ligger i bodyen. Hardened i `supabase/migrations/20260507120000_harden_get_users_last_login.sql`. Funktionen er tilføjet til `SECURITY_BASELINE.md` afsnit 1 og 8.

**Note om timestamp**: BACKLOG'ens oprindelige reference til migration `20260421071533` var en typo i recon-rapporten. Den faktiske migration der oprettede funktionen er `20260421212827_015bcc8b-edd0-4031-bf7c-cb5a6732b8f6.sql`.

**Oprindelig risiko**: SECURITY DEFINER-funktionen `get_users_last_login(uuid[])` var `GRANT EXECUTE TO authenticated` uden adgangstjek på input-listen. Enhver authenticated bruger kunne kalde den med vilkårlige UUIDs og få `last_sign_in_at` + `email_confirmed_at` retur for de UUIDs der findes. UUIDs lækker fra UI'et — rådgivere ser member-IDs, gruppe-medlemmer ser hinandens.

**Verifikation (manuel)**: Authenticated test-bruger uden advisor-rolle kalder `supabase.rpc("get_users_last_login", { user_ids: [<vilkårligt UUID>] })` → 0 rækker. Advisor kalder med samme UUID → 1 række. Members-siden i UI'et viser fortsat last-login-data for advisor som før.

**Verificeret 2026-05-07**: Funktionen blev deployet manuelt via Lovable SQL editor (CLI-push var ikke muligt pga. Lovable Cloud-ejerskab). Post-deploy `SELECT pg_get_functiondef(...)` bekræfter `STABLE` + advisor-gate i prod-funktionen.

---

### [P1] ✅ Løst i PR #11 — `esm.sh`-imports uden version-pinning

**Status**: Løst. Alle 54 imports af `@supabase/supabase-js` på tværs af edge functions er nu pinnet til eksakt `@2.97.0` (matcher `package.json`). Dækker både esm.sh-imports (52 linjer, statiske + dynamiske, single- og double-quote) og `npm:@supabase/supabase-js@2`-imports i `auth-email-hook` og `process-email-queue` (2 linjer). Ingen funktionel ændring — pinning-only.

**Verificeret 2026-05-07**: `grep -rE "esm\.sh/[^@]+@[0-9]+(\"|')" supabase/functions/ | grep -v "@2\.97\.0"` returnerer 0 hits efter merge. Edge functions auto-deployer fra git-merge (bekræftet i PR #15/16, se P3), så fixet er live i prod-runtime. (Frontend-ændringer kræver fortsat "Update"-klik i Lovable.)

**Oprindelig risiko**: Alle 55 edge functions importerede fra `https://esm.sh/@supabase/supabase-js@2` (og lignende `@2`-pinning andre steder). Hvis esm.sh kompromitteredes, eller hvis en patch-version udgaves med malware, ville den køre i alle edge functions ved næste cold start. Blast radius: total — service-role-adgang til hele databasen. Sandsynlighed lav, men ikke spekulativ (esm.sh-incidenter er sket før).

---

### [P1] ✅ Løst i PR #14 — @lovable.dev npm-imports uden version-pinning

**Status**: Løst. De 3 imports af `npm:@lovable.dev/*` uden version-streng er nu pinnet: `@lovable.dev/email-js@0.0.4` (2 linjer i `auth-email-hook` og `process-email-queue`) og `@lovable.dev/webhooks-js@0.0.1` (1 linje i `auth-email-hook`). Versioner valgt som "latest" fra npm registry per 2026-05-11. Ingen funktionel ændring — pinning-only.

**Verificeret 2026-05-11**: `grep -rE 'npm:@lovable\.dev/[^@]+(\s|$|"|'"'"')' supabase/functions/` returnerer 0 hits efter merge. Edge functions auto-deployer fra git-merge (bekræftet i PR #15/16, se P3), så fixet er live i prod-runtime. (Frontend-ændringer kræver fortsat "Update"-klik i Lovable.)

**Accepterede caveats**: Begge pakker er pre-1.0 (`0.0.x`), så fremtidige patch-fixes kræver bevidst version-bump. `webhooks-js` har kun én udgivet version (`0.0.1`) — hvis Lovable upublicerer, bryder vores edge functions. Risiko lav men ikke nul; afvejet mod den supply-chain-eksponering pinningen lukker.

**Oprindelig risiko**: `auth-email-hook` og `process-email-queue` importerede `npm:@lovable.dev/email-js` og `npm:@lovable.dev/webhooks-js` uden version-strenge. Samme supply-chain-risiko som esm.sh-pinningen adresserede, men på en anden specifier-form.

---

### [P1] ✅ Løst i PR #22 — CI-håndhævelse af edge function-auth-buckets

**Status**: Løst i to skridt. PR #21 (2026-05-22) lukkede det konkrete hul i `auto-create-baseline-budget` (manglende `authenticateUser` + company-membership-tjek før service-role-handling). PR #22 (denne) tilføjer det permanente CI-værn: `scripts/check-edge-function-auth.ts` håndhævet via GitHub Actions (`.github/workflows/edge-function-auth.yml`) på både `pull_request` mod main OG `push` direkte til main, med path-filter på `supabase/functions/**` + scriptet selv + workflow-filen. Bun pinnet til `1.3.13` for reproducerbarhed. Værnet bruger en EKSISTENS-invariant uden exit-kobling: triggered functions (HTTP-overflade + `createClient(..., SUPABASE_SERVICE_ROLE_KEY)`) skal indeholde mindst ét auth-prædikat fra union: `authenticateUser`, `authenticateServiceRole`, `.getClaims`, `.getUser`, `parseJwtClaims`, `verifyStripeSignature`, `verifyMondayJwt`, `verifyWebhookRequest`, samt shape-baseret `Bearer ${...}`-compare. Cron-only functions skippes. Push-til-main-triggeren er specifikt designet til Lovable-deploys: en PR-only workflow ville misse direkte writes til main, som er præcis hvor et fremtidigt hul mest sandsynligt opstår.

**Verifikation (2026-05-22)**: Sanity-kørsel viser 0 fails: 54 scannet, 44 triggered, 8 skip-no-sr, 2 skip-no-http (`legat-reminder-cron`, `run-weekly-agent`). Verbose mode bekræfter at shape-diskriminatoren skelner inbound auth-compares fra outbound fetch-headers korrekt — `run-company-agent` med både inbound (linje 819) og outbound (linjer 568, 960) Bearer-templates matcher via 819, ikke via 568/960. Lokal kørsel: `bun run check:edge-auth`. Negativ-test: hvis auth-prædikatet fjernes fra en triggered function, fejler scriptet med eksplicit fil:linje for SR-konstruktionen og listen af accepterede prædikater. Workflow vises i PR-checks som "Edge Function Auth Guardrail".

**Oprindelig risiko**: CLAUDE.md og `_shared/edgeFunctionAuth.ts` krævede `authenticateUser` eller `authenticateServiceRole` FØR første service-role-handling, men intet i CI/lint stoppede en udvikler i at glemme det. Da `verify_jwt = false` på alle 54 functions, betød en glemsel = åben service-role endpoint. Privilegieeskalering uden auth-gate. Materialiseret én gang i `auto-create-baseline-budget` (lukket af PR #21) — dette værn forhindrer gentagelse.

---

### [P2] ✅ Løst i PR #19 — README er Lovable-default-placeholder

**Status**: Løst. Lovable-template-README erstattet med projekt-specifik indhold på dansk. Peger nu til `CLAUDE.md` (arkitektur/deploy), `BACKLOG.md` (arbejdsliste) og `supabase/SECURITY_BASELINE.md` (security-checklist). Setup-instruktioner bruger Bun (matcher CLAUDE.md). Lovable-URL'er fjernet (terminal-fokuseret onboarding). Tre-lags deploy-asymmetri kort opsummeret med henvisning til CLAUDE.md for fulde detaljer.

**Verifikation**: README læses ende-til-ende og giver nok til at klone, installere og starte dev-serveren. Bun-kommandoer matcher CLAUDE.md's "Kommandoer"-afsnit.

**Oprindelig risiko**: `REPLACE_WITH_PROJECT_ID` stod på linje 5, 13 og 65 i `README.md`. Ny udvikler fik ingen projekt-specifik onboarding fra README og skulle gætte sig frem til CLAUDE.md og `SECURITY_BASELINE.md`. Ingen sikkerhedseffekt; rent dokumentations-gæld.

---

### [P2] ✅ Løst i PR #20 — Klient-side onboarding-flag kan drifte fra server-state

**Status**: Løst. localStorage-flag'et fungerer nu rent som optimistisk cache for pre-React redirects (`main.tsx` + `App.tsx` resume-handler) og er IKKE længere tie-breaker i `computedNeedsOnboarding`. Server-state (`profiles.onboarded_at`) er nu eneste sandhedskilde for React-routing-beslutninger. Stale flag invalideres automatisk i `fetchUserData` ved divergens med server.

**Verifikation**: Manuel test. (a) Sæt `onboarded_at = NULL` på server (SQL editor) mens bruger har localStorage = "1". Reload app → bruger redirectes til `/onboarding` inden for 1-2 sek, localStorage fjernes. (b) Normal iOS PWA-resume-flow virker fortsat: backgroundet på `/`, resume → ingen flash.

**Oprindelig risiko**: localStorage var tie-breaker i `computedNeedsOnboarding`, hvilket betød at en stale "1"-flag kunne overskrive server-state'n inden for samme session — ikke kun ved iOS PWA-resume. En utilstrækkeligt onboarded bruger med stale flag kunne komme ind på fx `/reports` og møde en delvist-konfigureret konto-state. Forvirrende men ikke destruktivt. iOS PWA-standalone "last route restore"-scenariet var den oprindelige motivation for flag'et (`App.tsx:115-132` + `main.tsx:21-34` pre-React redirect).

---

### [P2] ✅ Løst i PR #18 — `Auth.tsx` omgår den genererede Supabase-klient

**Status**: Løst. Rå fetch mod `/rest/v1/legat_enrollments` erstattet med `supabase.from("legat_enrollments")...maybeSingle()` — matcher eksisterende usages i `LegatDashboard`, `AdminLegat`, `Handouts` og `useAuth`.

**Verifikation**: Manuel test. Login som legat-bruger → redirect til `/legat`. Login som almindelig bruger → redirect til `/` eller `returnUrl`.

**Oprindelig risiko**: `Auth.tsx:46-55` lavede rå `fetch` mod `${VITE_SUPABASE_URL}/rest/v1/legat_enrollments?...` med apikey + Bearer for at detektere legat-brugere. Fungerede under RLS, men var typesvag, havde ingen retry/fejlhåndtering, og duplikerede adgangsvej der allerede er løst af `supabase.from()`. Vedligeholdelses-gæld.

---

### [P2] ✅ Løst i PR #18 — Inkonsistent password-floor

**Status**: Løst. HTML `minLength` bumpet fra 6 til 8 så den matcher den eksisterende `ResetPassword.tsx`-floor. JS-validering `getPasswordScore < 2` bevaret. Komplementær validering — HTML enforcer længde, JS enforcer kompleksitet.

**Verifikation**: Manuel test. 6-tegns-password afvises ved HTML-gate. 8-tegns trivielt password (kun små bogstaver) afvises ved JS-gate med besked om at vælge stærkere kode. 8-tegns kompleks accepteres.

**Oprindelig risiko**: `Auth.tsx:376` havde `minLength={6}` (HTML), men `handleSignup` afviste med `getPasswordScore(password) < 2` (linje 109). To forskellige sandheder. Lille sikkerhedseffekt; primært UX-inkonsistens — brugeren fik forskellige fejlbeskeder afhængigt af hvilken vej de stødte på.

---

### [P2] Branchetals-kuratering (noteret 2026-08-05)

Jonas' røde pen på hb-branchetal-review.md; derefter migration:
industry_benchmarks-UPDATE'er m. FØR-optælling, skema-default →
'Estimat, The Boardroom 2026', [P3]-nøgleoversættelse/sletning
(jf. [P3] Usynlige seedede benchmarks), OG Settings-brancheskiftets
benchmark→default-MÅL-adfærd fjernes (strid m. model A: mål er
aktivt valg). Ærligheds-forarbejdet (source-strenge renset for falsk
attribution i frontend) er taget i PR fix/branchetal-aerlighed.

---

### [P3] Migration-squash

**Risiko**: 193 migrationsfiler. `supabase db reset` langsom, drift-overflade voksende. Eksplicit udskudt iht. `SECURITY_BASELINE.md` afsnit 8 ("Only perform after the hardening sequence has been validated in production for at least 2–4 weeks").

**Indsats**: L. Følg hele baseline-proceduren: `pg_dump --schema-only`, diff mod ny baseline (zero drift), checklist-walk gennem `SECURITY_BASELINE.md`, fresh-DB-test, arkivér gamle filer i `supabase/migrations/_archive/`.

**Afhængigheder**: FORBIDDEN-zone i CLAUDE.md indtil tids-condition (2–4 ugers prod-validering af hardening-sekvensen) er opfyldt. Kræver eksplicit grønt lys.

**Verifikation**: `supabase db reset` mod ny baseline producerer identisk schema som dump af nuværende prod.

---

### [P3] TypeScript er reelt utypet

**Risiko**: `tsconfig.json` og `tsconfig.app.json` har `strict: false`, `noImplicitAny: false`, `strictNullChecks: false`, `noUnusedLocals: false`. Compiler fanger næsten ingenting på et 3000-linjers genereret `types.ts`-skema. Klassiske null-deref og typo-bugs slipper igennem.

**Indsats**: L. Kaskade af type-fejl forventes på tværs af stort antal filer. Skal være dedikeret refactor-PR — eller en serie af mindre PRs der gradvist låser delkataloger i strict-mode (`src/lib/` først, derefter `src/hooks/`, til sidst `src/pages/`).

**Afhængigheder**: FORBIDDEN-zone i CLAUDE.md ("Ændre tsconfig strict-flags i denne PR. Skal være dedikeret refactor"). Kræver eksplicit grønt lys.

**Verifikation**: `tsc --noEmit` grøn med strict-flags på hele kodebasen.

---

### [P3] `lovable-tagger` i dev-mode

**Risiko**: `vite.config.ts:15` injicerer `componentTagger()` i dev-mode. Hver komponent får dev-tags. Ikke i prod-bundlen, ikke skadeligt — kun en fingeraftryksflade hvis dev-builds deles. Grænse-flag; reelt mere en observation end et problem.

**Indsats**: S, hvis det fjernes: drop import + plugin-array-entry. Men Lovable bruger sandsynligvis tagger til at mappe komponenter i sit dashboard.

**Afhængigheder**: At fjerne det kan bryde Lovable-integrationen. Vurdér først om Lovable stadig kan redigere komponenter uden tagger.

**Verifikation**: Hvis fjernet — bekræft at Lovable-dashboardet stadig fungerer på en testkonto. Hvis ikke, rul tilbage.

---

### [P3] Tilføj test-infrastruktur for form-validering

**Risiko**: `Auth.tsx` (og lignende form-tunge sider) har ingen automatiseret regression-guard. Password-floor og validerings-logik kan brydes utilsigtet ved fremtidige refactors. CLAUDE.md kræver test for security-kritiske stier, men test-infrastruktur (React Testing Library + form-rendering) findes ikke i repo'et endnu.

**Indsats**: M. Setup vitest + React Testing Library, skriv første test-suite for `Auth.tsx` password-validering og legat-redirect. Bagefter kan flere komponenter teste tilsvarende.

**Afhængigheder**: Ingen FORBIDDEN-overlap.

**Verifikation**: `bun test` viser nye `Auth.tsx`-tests passere; tests fanger en bevidst regression-test af `minLength`.

---

### [P3] ✅ Løst i PR #15/16 — Bekræft "Update"-knappens scope ved empirisk test

**Status**: Løst. Canary-eksperimentet bekræftede Scenario A: edge functions auto-deployer fra git-merge til main, frontend kræver Lovable "Update"-klik for at publish'es, migrationer kræver fortsat SQL editor. CLAUDE.md's edge functions-afsnit og asymmetri-note opdateret med bekræftet model.

**Bevis** (2026-05-11):
- Trin 1 (efter merge, FØR Update-klik): canary-kommentar i `get-advisor-alerts` var synlig i "View code". Frontend-canary i `NotFound.tsx` var IKKE i DOM på `app.theboardroom.dk/canary-2026-05-11`. Update-knap aktiv (blå).
- Trin 3 (efter Update-klik): begge canaries live. Update-knap tilbage til "Up to date".

**Cleanup**: Canary-markører fjernet via PR #16 (revert). Ingen testartefakter tilbage i prod efter merge + Update-klik.

**Oprindelig risiko**: CLAUDE.md's afsnit "Deployment af frontend" antog at Lovable's "Update"-knap kun re-byggede frontend (Vite-build til `app.theboardroom.dk`). Hvis knappen i virkeligheden også genimplementerede edge functions eller kørte migrationer, kunne en frontend-only-deploy utilsigtet rulle backend-ændringer ud — eller omvendt: en backend-only-flow kunne blive blokeret af frontend-builden. Indtil testet var antagelsen ubekræftet.

---

### [P4] Accepteret — `log_user_login` NULL-guard (vurderet 2026-05-28, ikke fixet)

**Status**: Vurderet og bevidst ikke fixet. SECURITY DEFINER-funktionen `public.log_user_login()` (defineret i `supabase/migrations/20260302213733_*.sql`) har Postgres-default `EXECUTE TO PUBLIC` — dvs. både `anon` og `authenticated` kan kalde den. Bodyen er `INSERT INTO public.user_login_log (user_id) VALUES (auth.uid())`. En anon-kalder giver `auth.uid() = NULL`, men `user_login_log.user_id` er `NOT NULL` — Postgres afviser INSERT på constraint. **Ingen NULL-rækker lander, ingen data-konsekvens, ingen escalation.** Eneste tilbageværende effekt er potentiel Postgres error-log-støj ved RPC-spam udefra. Constraint'en er forsvaret.

**Hvorfor ikke fixet**: En fix (body-gate: `INSERT ... SELECT auth.uid() WHERE auth.uid() IS NOT NULL`) ville være en SECDEF-migration (FORBIDDEN-zone iht. CLAUDE.md) + irreversibel manuel SQL i Lovable, alt sammen for ren log-hygiejne på et angreb der allerede fejler ved constraint-laget. Omkostning/gevinst er forkert. Triagens oprindelige formulering "anon kan indsætte NULL-rækker" var teknisk forkert — constraint'en blokerer det.

**Revurder hvis**: `user_id NOT NULL`-constraint nogensinde fjernes fra `user_login_log` (fx ved tabel-refactor eller hvis nogen tilføjer en `DEFAULT`). Så ville NULL-rækker reelt kunne lande, og denne risikovurdering vendes om. Constraint-ændring → genåbn denne post.

**Legitime kalder**: kun `src/hooks/useAuth.tsx:332` på `SIGNED_IN`-event, hvor `auth.uid()` altid har værdi. Ingen edge functions kalder den.

---

### [P4] Accepteret — sen-aftens-notifikation ved opbrugt kvote kan stadig maile om natten (vurderet 2026-07-22, ikke fixet)

**Status**: Accepteret randcase i afsendelsesvinduet fra PR #152 (`_shared/notificationEmailSelection.ts`). Vindues-guarden holder kun **udskudte** kandidater (> `DEFER_THRESHOLD_MS` = 6 timer gamle) tilbage til kl. 07-20 dansk. En notifikation oprettet efter ca. **kl. 21 dansk** hos en bruger med **opbrugt dagskvote** (5 sends) er stadig "frisk" (<6t) ved kvote-nulstillingen kl. 02 dansk (UTC-midnat) og sendes derfor ved første cron-kørsel efter reset — om natten.

**Hvorfor ikke fixet**: Kræver sammenfald af to sjældne betingelser (kvote opbrugt samme dag OG notifikation oprettet sent på aftenen). En lavere friskheds-tærskel ville forsinke legitime aftenmails (upload kl. 23 → mail 23:15 er ønsket adfærd), og en hårdere regel ("alle sends kun i vinduet") var eksplicit fravalgt i fixdesignet. Omkostning/gevinst er forkert for et hjørne der i praksis forudsætter en usædvanligt mail-aktiv dag.

**Revurder hvis**: dagskvoten sænkes, `DEFER_THRESHOLD_MS` ændres, eller kvote-vinduet flyttes væk fra UTC-midnat (fx til dansk midnat eller rullende 24t) — enhver af de tre ændrer randcasens hyppighed. Genåbn også hvis natlige sends observeres i `email_send_log` med denne signatur (created_at aften, sent 00:00-02:00 UTC).

---

### [P4] Udskudt — cash-reglens matching aggregerer ikke flere likvidkonti (udskudt fra balance=ÅTD-fixet, PR fix/balance-column-selection)

**Status**: Noteret, bevidst ikke adresseret i balance=ÅTD-fixet. Cash-håndhævelsen i `canonicalEngine.ts` (`cash_balance_ytd_enforced`) bruger uændret matching-semantik fra den gamle regel: FØRSTE line item hvis navn indeholder "bank"/"likvid" bliver autoritativ. Konti som Pleo og Stripe matcher ikke mønstret og indgår ikke, selv når de reelt er likvide midler. Prod-evidens 21/7-2026 (rapport f53ee049): AI'ens key_figure aggregerede Bankkonto+Pleo+Stripe til 157.290,98, mens håndhævelsen følger Bankkonto-linjens ÅTD 128.984,64 — som er det facit Jonas har fastlagt for sagen.

**Hvorfor ikke fixet her**: Fixets scope var kolonnevalget (Perioden vs. ÅTD), ikke kontoafgrænsningen af "likvider". En aggregeringsregel kræver en selvstændig definition af hvilke konti der tæller som likvide (kontonummer-interval? klasse? navneliste?) og har sin egen fejlflade — den skal designes og testes separat, ikke smugles med i et kolonnefix.

**Revurder hvis**: en kunde med flere likvidkonti (fx Pleo/Stripe/valutakonti) rapporterer at platformens likviditet afviger fra deres samlede bankindestående — eller når likviditetstal skal bruges til rådgivning på tværs af konti. Design-input: den deterministiske template (`dkEconomicSaldobalancePdfV1.ts`) har samme enkelt-linje-semantik for `likvider`; en løsning bør dække begge stier.

---

### [P3] Float-artefakter i `financial_report_facts.metrics`-jsonb (udskudt fra ×100-fix, PR fix/ret-data-x100)

**Status**: Bevidst ikke fixet i ×100-PR'en. Committede nøgletal i `metrics`-jsonb indeholder flydende-komma-artefakter, fx `16984.829999999998` i stedet for `16984.83` (observeret i Topix' produktionsdata 2026-07-21). ×100-fixet **bevarer** disse værdier eksakt (round-trip uden korruption) — det renser dem ikke.

**Hvorfor ikke fixet her**: Artefakterne stammer fra et andet lag (parse/normalisering før commit), ikke fra visning→gem-round-trippet som ×100-buggen. Anden rodårsag ⇒ andet fix. En oprydning ville kræve enten en normaliserings-/afrundingsbeslutning (hvor mange decimaler er kanoniske for øre?) eller en migration af eksisterende committede facts — begge udenfor scope for en målrettet korruptions-fix.

**Revurder**: sammen med et review af parse-/commit-laget (`commit_report_facts` + normaliseringen der producerer `metrics`). Afklar kanonisk decimalpræcision og om historiske facts skal migreres.

**Delvis afgrænsning 2026-07-22** (PR `fix/ret-data-ebitda-loss`): manual-stiens AFLEDTE nøgler (`ebitda`/`ebit`) beregnes nu med 2-decimals afrunding i `computeDerivedMetrics` — dén delmængde kan ikke længere bære artefakter. Parse-sidens artefakter (JS-derivering i `canonicalEngine.ts:468-480` og øvrige beregnede felter) består uændret og er fortsat denne posts scope.

---

### [P3] Varierende metrics-nøglesæt pr. `source_type` (udskudt fra ×100-fix)

**Status — opdateret 2026-07-22**: Det konkrete `ebit`/`ebitda`-hul er rodårsagsforklaret og fixet i PR `fix/ret-data-ebitda-loss`: manual-gemmestien BEREGNER nu begge nøgler fra grundfelterne (Mulighed A, `computeDerivedMetrics` i `reportOverrideHelpers.ts`), og migration `20260722130000` udvider resolver-CASEn så nøglerne bærer igennem til facts. Symptomet fra 2026-07-21 (manual mangler ebit/ebitda) var netop dette tab. **Restproblemet består**: der findes stadig intet håndhævet kanonisk nøgle-skema på tværs af `source_type` (fx kan manual mangle nøgler når komponent-guarden udelader dem ærligt, og canonical har nøgler som `gross_margin_pct` uden manual-modstykke). Konsumenter må fortsat ikke antage et fast nøglesæt.

**Hvorfor ikke fixet fuldt her**: Uafhængigt af ×100-buggen (ingen delt rodårsag). Kræver en beslutning om et kanonisk nøgle-skema på tværs af `source_type` — en datakontrakt-opgave, ikke en konverterings-fix.

**Revurder**: ved næste arbejde på metrics-kontrakten (fx MCP Tool 3 `get_financial_metrics`, som læser `metrics` direkte og vil eksponere inkonsistensen).

---

### [P3] Kandidat — `equity_total` skifter fortegn mellem historiske committede perioder (fund fra MCP Tool 3-verifikation)

**Status**: Noteret 2026-08-04 under live-verifikationen af MCP Tool 3 (`get_financial_metrics`). Topix' committede facts viser `equity_total` = **-293865.63** i 2026-04 og **+267650.77** i 2026-05 — fortegnsskift med sammenlignelig størrelse, hvilket ligner inkonsistent fortegns-normalisering på tværs af historiske commits snarere end en reel egenkapitalbevægelse. Samme familie som PR #154's balance-regler (kolonnevalg/fortegn på AI-stien). Toolet returnerer værdierne råt som designet — ingen handling i MCP-laget.

**Revurder**: ved parse-/commit-lags-reviewet (samme anledning som float-artefakt-posten ovenfor). Afklar kanonisk fortegnskonvention for balanceposter og om historiske facts skal re-committes.

---

### [P3] Inline-validerings-dublet i `ReportReviewDialog.tsx:201` (udskudt fra ×100-fix)

**Status**: Noteret, ikke konsolideret. `handleSaveEdits` har en egen inline-parse (`trimmed.replace(/\./g, "").replace(",", ".")` + `isNaN`-tjek) der dublerer `parseMetricValue`s dansk-logik, brugt **kun** til validering før gem. Den påvirker ikke den gemte værdi (som går gennem `saveManualOverride` → `parseMetricValue`), så den var ikke en del af ×100-rodårsagen.

**Hvorfor ikke fixet her**: ×100-fixet var målrettet serializer/parser-mismatchen; at rydde en validerings-dublet er en separat, ikke-adfærdsændrende oprydning. Holdt ude for at bevare et minimalt, review-bart diff.

**Revurder**: erstat inline-parsen med et kald til `parseMetricValue` (og behandl `undefined` som valideringsfejl), så der er én kilde til parse-sandhed. Lav, isoleret oprydning.

---

### [P3] Self-host fonte frem for Google Fonts-@import (noteret 2026-08-04, Hjemmebane V0)

Alle fonte (Manrope, Space Grotesk, Inter, Parkinsans i `src/index.css` samt Fraunces i `src/styles/hjemmebane.css`) loades via Google Fonts-`@import`. Skal på sigt self-hostes (woff2 i `public/fonts/` + `@font-face`) af hensyn til hastighed (ingen tredjeparts-roundtrip, ingen FOUT-kaskade) og GDPR (ingen IP-videregivelse til Google ved sideload). Tages som samlet, isoleret PR for alle fem familier.

---

### [P4] Accepteret — dryp (`drip_after_days`) håndhæves i app-laget, ikke i RLS (B6-afgørelse 2026-08-04, Hjemmebane C1)

**Status**: Bevidst accepteret i C0-datamodellen (B6, godkendt af Jonas 2026-08-04) og committet med migrationen `20260804120000_hjemmebane_content_layer.sql`. Medlemslæsning af `content_collections`/`content_items` gater i RLS kun på `status = 'published'` — dryp-filtreringen (`drip_after_days` relativt til medlemmets `company_members.created_at`) sker i app-laget. Konsekvens: et medlem der kalder PostgREST-API'et direkte kan se ikke-dryppet published indhold tidligere end forløbet tilsiger.

**Hvorfor ikke fixet**: Dryp er pædagogisk pacing, ikke sikkerhed — alt indhold er allerede betalt medlemsindhold, så omgåelse viser kun indhold medlemmet har betalt for. RLS-håndhævelse ville kræve en ny SECURITY DEFINER-helper (fx `user_joined_at()`), og nye SECURITY DEFINER-funktioner er FORBIDDEN-zone uden eksplicit grønt lys. Omkostning/gevinst er forkert for V1.

**Hardening-kandidat**: SECURITY DEFINER-helper `user_joined_at()` + dryp-prædikat i medlems-SELECT-policies på indholdstabellerne. Se `docs/hjemmebane/c0-datamodel.md` B6.

**Revurder hvis**: indhold indføres med reel eksklusivitet ud over medlemskabet (fx betalte tiers via `tier_visibility`, hvor tidlig adgang har økonomisk værdi), eller hvis systematisk omgåelse af dryp observeres og underminerer forløbspædagogikken.

---

### Beslutningsnote — fremdriftsmodel i Akademiet (2026-08-04)

**Fremdriftsmodel Akademiet: Model B1-video** (besluttet af Jonas 2026-08-04, efter
korrigeret status quo — auto-kvittering fandtes allerede i trin 3):

1. Fremdrift spores KUN på video-items; øvrige items er bibliotek uden sporing
   (UI-afgrænsning; evt. tekst-lektioner som pensum genåbner med rolle-markering
   pr. item — backlog).
2. Auto-kvittering ved ≥90 %/ended bevares som bekvemmelighed, med
   krydsnings-spærre så fortryd ikke overskrives uden reel afspilning hen over
   grænsen.
3. Den manuelle Gennemført-knap er FRI (ingen %-gate) — fremdriften bærer kun
   medlemmets eget overblik.
4. Fortryd er en toggle.

Tidligere note (Model A) annulleret — den byggede på en forkert beskrivelse af
status quo.

---

### [P3] Data-drevne områder i Akademiet — bevidst udskudt (noteret 2026-08-04, C3-forberedelse)

**Status**: De seks områder (Start her, Grundforløbet, Kurser, Skabeloner, Talks,
Quick Wins) er i dag kode: en hardcoded `AREAS`-konstant i
`src/lib/hjemmebane/adminContentApi.ts` + TEXT-CHECK-constraints på
`content_collections.area` (6 værdier) og `content_items.area` (8 værdier, inkl.
fremtidssikringerne `rabataftaler`/`push`). Bevidst udskudt — forløb/moduler UNDER
områderne er allerede fuldt data-drevne i admin, og C3-migreringen kan gennemføres
med de faste flader.

**Opskrift når det tages op** (fra hb-c3-model-recon.txt pkt. 2e): ny tabel
`content_areas` (key PK, label, hint, position, status) + migration der erstatter de
to CHECK-constraints med FK'er; `AREAS`-konstanten erstattes af ét query (+ cache) og
`AreaKey`-typen af string; admin får et lille område-panel (omdøb/rækkefølge/hint —
genbrug af eksisterende editor-mønstre); routes (`/akademiet/:area`) virker uændret,
da key'en består. Størrelse: én migration + ~6 filers letvægts-refactor — et lille,
selvstændigt sprint-trin.

**Bemærk**: område-LABELS er ren frontend (bevist i PR #166, hvor
"Classroom"→"Grundforløbet" og "Academy"→"Kurser" blev ændret uden migration) — de
kan ændres på anmodning når som helst. Det er NYE/FJERNEDE områder, der kræver
migration.

---

### [P4] PDF-strukturtestens 5s-timeout er load-følsom (noteret 2026-08-04)

**Fund**: `src/lib/__tests__/pdfStructuralExtractor.test.ts` (de to binærtests mod
Resultat_6.pdf) ramte sin default-timeout på 5000 ms i tre fulde suite-kørsler,
mens maskinen kørte video-download med load average 42; grøn ved load 5.
Testens reelle arbejde er ~2,2 s normalt (1,3-2,4 s observeret) — under høj
belastning og med 13 testfiler i parallel når den ikke i mål. Standalone var den
grøn i SAMTLIGE kørsler, også under load. Ren falsk-negativ-flakiness; ingen
produktrisiko.

**Kandidat-fix** (ikke implementeret): eksplicit hævet `testTimeout` på de to
tests (fx 30 000 ms — de tester korrekthed, ikke hastighed) eller en
load-agnostisk gate (skip/warn ved ekstrem load). Lille, isoleret testfil-ændring.

---

### [P4] CI-install-flake: bun install fejler på xlsx-tarball (noteret 2026-08-04)

**Fund**: GitHub Actions-jobbet "Tests" fejlede to gange samme aften i "Install
dependencies"-steppet — `bun install --frozen-lockfile` → `error: Fail extracting
tarball for "xlsx"` — på PR #166 (run 30941610047) og PR #167 (run 30949047881).
Begge PRs rørte ingen dependencies; begge blev grønne ved simpelt re-run
(`gh run rerun <id> --failed`). Testene nås aldrig — ren infra-støj i
download/ekstraktion.

**Kandidat-fix** (ikke implementeret): bun-cache i workflowet
(actions/cache på `~/.bun/install/cache`) eller retry på install-steppet.
Genåbn med prioritet hvis tredje forekomst rammer.

---

### [P3] Handout-kobling fase 2: omvendt link (noteret 2026-08-05)

**Fund**: Lektion→handout-koblingen (`content_items.handout_module`) er envejs.
Handout-siden (/handouts) kender ikke tilhørende modul/lektion — medlemmet
kan ikke hoppe fra et handout tilbage til lektionen, der introducerede det.

**Kandidat-fix** (ikke implementeret): opslag fra handout-fladen på
`content_items WHERE handout_module = <modul> AND status = 'published'`
(member-RLS gater i forvejen) og render af "Hører til"-links. Ingen
skemaændring nødvendig — koblingen findes allerede i kolonnen.

---

### [P3] Data-drevne handout-definitioner — bevidst udskudt (noteret 2026-08-05)

**Fund**: Handout-definitionerne er ~239 linjer hardcodet TS
(`src/lib/handoutConfig.ts`) uden admin-flade og uden versionering —
ordlyds-ændringer kræver kode + deploy, og omdøbte spørgsmåls-nøgler
orphaner stille medlemssvar (`handoutUtils.ts:50-55` filtrerer på kendte
nøgler; data slettes aldrig, men vises ikke, og medlemmets viste fremdrift
kan falde uden forklaring).

**Kandidat-fix** (ikke implementeret): definitions-tabel + versioneringsdesign
som eget sprint — orphan-problemet skal LØSES, ikke arves ind i en
data-drevet model. Vigtigt: lektion→handout-koblingen
(`content_items.handout_module`) peger på modul-NØGLEN og overlever en
senere ombygning uændret.

---

### [P4] /handouts?module= læses kun on mount (noteret 2026-08-05)

**Fund**: Deep-linket `?module=<key>` læses i en on-mount-effekt med tomt
dependency-array og ryddes med replace (`Handouts.tsx:77-85`). Navigation fra
en allerede monteret /handouts-side til samme route med ny param genåbner
derfor IKKE det ønskede modul. Rammer ikke fase 1 (refleksionskortet linker
altid fra /akademiet, så /handouts friskmonteres), men bliver relevant hvis
der senere linkes handout→handout eller fra en anden flade, der deler layout.

**Kandidat-fix** (ikke implementeret): flyt param-læsningen til en effekt på
searchParams (og behold replace-rydningen), eller styr aktivt modul via URL i
stedet for lokal state.

---

### [P3] Usynlige seedede benchmarks (noteret 2026-08-05)

Service-seeden 20260329212047 kopierede industry_benchmarks-nøgler
(gross_margin_pct/ebitda_margin_pct) råt ind i kpi_benchmarks for 37
CVR — rækkerne matcher aldrig panelets def.key-opslag og har været
usynlige siden. Kandidat: engangs-datamigrering der oversætter nøglerne
(INDUSTRY_TO_DEF_KEY) el. sletter de døde rækker; kræver FØR-optælling
(jf. hb-benchmark-kilde-recon.txt §b).

---

### [P4] Baseline-stramning: self-insert uden company-tjek på kpi_targets/kpi_benchmarks (noteret 2026-08-05)

**Fund** (hb-ai-maal-recon.txt §1e): de oprindelige self-insert-policies
("Users can insert own kpi targets" / "Users can insert own benchmarks",
20260223) tjekker KUN `auth.uid() = user_id` — INGEN company-prædikat.
En autentificeret bruger kan derfor indsætte rækker med et fremmed
`company_id`, så længe user_id er brugerens eget. Praktisk konsekvens i
dag er begrænset (unikhedsankeret company_id+kpi_key og UPDATE-policies
begrænser overskrivning; advisors har nu egne policies via
20260805220000), men hullet er et afvig fra company-scoped-mønstret.

**Kandidat-stramning** (noteret, IKKE besluttet): tilføj
`AND company_id = user_company_id(auth.uid())` i de to self-insert-
policies WITH CHECK — kræver verifikation af at ingen legitim self-flow
skriver på tværs (advisor-flows bruger nu egne policies). Baseline-
relevant: opdater SECURITY_BASELINE i samme PR hvis den gennemføres.

---

### [P2·EPIC] Platform-onboarding — førstegangs-oplevelsen (besluttet 2026-08-05)

Produktbeslutning (Jonas): platformens onboarding hører til UDEN FOR
Akademiet — som interaktiv førstegangs-oplevelse ved første login, ikke
som indholdsområde. Vision: velkomstvideo(er) fra Morten (hostes i Bunny —
signeret embed-infrastruktur findes, jf. get-video-embed), derefter
interaktiv rundtur med spotlight-/infobokse og Næste-knap gennem fladerne
(tal-upload, rapportering, rådgiver, Akademiet, Community), spring-over,
gennemført-tilstand pr. medlem, genstart fra Guiden. Eget sprint med egen
recon (first-login-detektion, profil-flags), design-blok og gates.
Epic-reconnen SKAL omfatte den eksisterende tekst-onboarding (Guiden,
/guide): den afløses eller integreres i førstegangs-oplevelsen — der må
ALDRIG eksistere to onboardings side om side.

SEKVENS: bygges EFTER C3-indflytningen (rundturen skal vise et fyldt
produkt; Circle-exit har deadline). KONSEKVENS for "Start her"-området:
platformens onboarding bor IKKE der — og områdets rolle er nu BESLUTTET
(2026-08-05, klik-valg A): Start her ER Akademiets introduktion; indholdet
(samlingen "Kom godt i gang med vores Akademi", 3 videoer inkl.
målsætnings-lektion m. overordnet handout-kobling) er blivende, og
"fyldes ikke endnu"-reglen er ophævet. Epicen er uændret i øvrigt.
Princip: ikke flere indholdsbokse end højst nødvendigt.

DESIGN-INPUT (Jonas' observation 2026-08-05 under koncern-sluttest):
virksomhedsnavn sættes i dag EFTER oprettelse via Indstillinger —
bør ind i selve onboardingen (handle_new_user falder i dag tilbage til
"{navn}s virksomhed" når company_name mangler i signup-metadata).
Tages med i epic-designet.

---

### [P1] Akademiet-lancering — medlems-synligt nav-punkt afventer GO fra Jonas (noteret 2026-08-05)

**Fund**: Akademiet-broen i navigationen (PR #172) gjorde et halvfærdigt
Akademi synligt for alle medlemmer, mens Circle stadig kører og
indflytningen er i gang. Korrigeret samme dag: punktet er advisor-gated
(advisorOnly-flag i AppSidebars baseNavItems; fjernet fra mobil-"Mere"-
menuen, som kun renderes for medlemmer). URL-adgang til /akademiet har
eksisteret siden C1 trin 3 og er uændret (RLS/published-gate + dryp
beskytter indholdet).

**Aktivering** (kræver eksplicit GO fra Jonas) forudsætter: (i) indhold
klar, (ii) testindhold ryddet fra Start her, (iii) medlemskommunikation,
(iv) Circle-plan og (v) hele medlemsrejsen redesignet til Hb
(konvergens.md §1-skæbnerne). Selve aktiveringen er triviel: fjern
advisorOnly-flaget, genindsæt 🎓-punktet i Mere-menuen, og luk
konvergens.md §2.8 i samme PR.

---

### [P1] C3: Medlemsfremdrift — manuel migrering via fremdriftsværktøjet (omskrevet 2026-08-05)

API-SPORET ER LUKKET: Admin v2-probe 2026-08-05 gav 404 på alle
fremdrifts-endpoints — per-lektion completion findes ikke i API'et (jf.
også den historiske sync-kodes egen kommentar: "We can't get individual
lesson completion from this API"). Eksport-kandidaten fra den oprindelige
note udgår.

AFLØSER: advisor-fremdriftsværktøjet (/admin/indhold/fremdrift): batch-
markering pr. modul + enkelt-toggles skriver ægte member_progress
(acknowledged_at) via advisor-write-policies (migration 20260805200000).
Manuel migrering: ~35 kursister aflæses i Circle-modal (fremdrift pr.
kursist) og markeres via batch. TIDSKRITISK: aflæsningen skal ske FØR
Circle-lukningen — dataene forsvinder med platformen. Handout-svar bor
allerede på platformen — ingen migrering dér.

Historik (reference): fuld Circle-integration eksisterede og er fjernet
(36b617e5/PR #34; tabeller droppet 20260528045148). Sidefund fortsat åbne:
stale 'Circle-status'-tip i Guide.tsx:116; CLAUDE.md nævner stadig
droppede circle_*-tabeller.

---

### [P1] Forside-GO = swap-PR (noteret 2026-08-05)

Hb-forsiden "Dit Boardroom" (/boardroom) er bygget route-parallelt bag
AdvisorRoute; gamle Index ("/") er frosset. GO'ets indhold (én lille PR):
fjern AdvisorRoute-gaten; "/"-MEDLEMSGRENEN renderer Boardroom
(advisor-grenen/AdvisorDashboard bevares uændret); HbMemberShells
"Dit Boardroom"-mål → "/" for alle; gammel medlems-Index + previewen
(/preview/hjemmebane) pensioneres; konvergens.md §2.3 lukkes.
Guard-arv ved swap (bogført i forside-design-blokkens §d-tabel):
?subscription-toast + stille tour-markering flyttes 1:1; expired-gate
arves som bevidst bro (gammelt udtryk); legat dækkes af MemberRoute.

FORUDSÆTNINGER for GO: (i) push-indhold klar (mindst ét published
indslag), (ii) advisor-gennemgang af /boardroom på rigtige data,
(iii) UDGÅET 2026-08-05 (koncern-banner-afklaringen — koncern fjernet,
GroupWelcomeBanner pensioneret), (iv) expired-gate-broen accepteret el.
konverteret, (v) princip 8-rammen: forside-swappen er IKKE den samlede
lancering af medlemsrejsen — den styres fortsat af konvergens.md
§2.8/[P1] Akademiet-lancering.

---

### [P3] Events-tilmelding på forsiden (noteret 2026-08-05)

Forsidens "Kommende events"-kort vises UDEN CTA (HbEventCard ctaLabel=null)
— der findes ingen medlems-events-flade, og tilmeldingsflowet
(event_registrations: kapacitet, afmelding, bekræftelse) er sin egen
leverance. Når den bygges: genindsæt CTA'en og afgør detalje-visning.

---

### [P1] Rapportering-GO = swap på /reports (noteret 2026-08-05)

STATUS 2026-08-06: TEKNISK KLAR — swap-PR'en (feat/rapportering-go-swap)
er bygget og verificeret; AFVENTER ADVISOR-GO før merge. Alle fire
forudsætninger opfyldt 2026-08-06 m. bevis:
- (i) papirkurven: LØST i forberedelses-PR'en (PR #206) — porteret 1:1
  ind i RapporteringView som advisor-gated sektion (gendan + permanent
  slet m. fuld oprydningskæde kopieret ordret fra gamle Reports
  :720-760). Slette-PARITETEN fulgt op i PR #207 (ubetinget "Slet
  rapport" + dialog). "Drift-gruppen"-planen bortfaldt — papirkurven
  følger fladen.
- (ii) trend/AI's hjem: OPFYLDT — KPI-GO er gennemført (PR #203),
  GO-koordineringen (KPI-GO før Rapportering-GO) er dermed indfriet.
- (iii) email-link-kontrakten: kontrakt-facit fra hb-rapgo-recon
  GAP-tabellen — elementerne 1-7 JA (3× /reports?reportId= fra
  extract-financial-data arvet i RapporteringView; ren /reports +
  email-CTA; #upload/#annual-reports-ankrene m. robust useScrollToHash).
  De to ?reportId-nuancer (param-rydning + re-trigger ved nyt id på åben
  flade) arvet 1:1 i PR #206. Manuel byggerute-test GENNEMFØRT
  2026-08-06 (dagens GO-tjek).
- (iv) advisor-m.-override-flowet: mønstret til stede 1:1
  (HbAdvisorCompanyPrompt ved isAdvisor && !companyId, override-aware
  companyId i alle queries — identisk m. NoegletalView, prod-bevist af
  KPI-GO). Gennemprøvning via broerne GENNEMFØRT 2026-08-06 (dagens
  GO-tjek).

GO'ets indhold (implementeret i swap-PR'en): /reports bærer den nye
flade via MemberRoute (advisors passerer som på gammel /reports —
company-override-mønstret uændret); /rapportering er redirect m.
bevaret hash/query (?reportId= er email-kontrakt, #upload/
#annual-reports er Guide-kontrakt); HbMemberShells Rapportering-mål →
/reports for alle; gamle Reports.tsx pensioneret (nul resterende
importører; alle delte komponenter — AdvisorCompanyPrompt,
ReportReviewDialog, FileUploadZone, AIFinancialAnalysis,
DeliveryOverview, PeriodSelector, ReportManualOverride,
PulseCheckinModal — har andre brugere og består). Medlemsnote shippet
i samme PR jf. proces-reglen (nyt announcement-id
"v2026-08-hjemmebane-rapportering" i DashboardActionCenter + AppLayout).

Oprindeligt punkt (historik): Hb-rapporteringen (/rapportering) er
bygget route-parallelt bag AdvisorRoute; gamle /reports er frosset.
URL'EN ER EMAIL-KONTRAKT (extract-financial-data + email-flows §1.1
skriver /reports?reportId=…; #upload/#annual-reports-ankrene skal virke
identisk); /rapportering bliver redirect (§3.6-mønstret).

UX-FLOW-FIX (fix/rapportering-ux-flow-main, 2026-08-06): medlemstest
satte swap-GO'et (PR #208) i HOLD på tre fund (passivt godkendelses-
flow, mørk dialog i lys flade, ventetid uden feedback — recon:
hb-rapport-ux-recon.txt). B1/B2/B4/B5 lukker flow-delen og SHIPPES PÅ
MAIN FØR SWAPPET (ufarligt: gamle Reports har selv auto-åbning, og
deep-links håndteres af begge flader) så byggeruten kan gentestes;
B3 (Hb-restyling af review-dialog + pulse-modal) IMPLEMENTERET
2026-08-06 i feat/rapportering-b3-dialoger — stacked på
feat/rapportering-go-swap, shipper i swap-merget (theme-hjemmebane på
DialogContent-roden jf. recon §3 vej i; pulse-modalens inline-gren på
/pulse beholder appens tokens via stil-indirektion — den lyse stil
rammer ikke gamle flade):
- B1 auto-åbning: RP-1-affyringen portet 1:1 fra Reports:611-641 ind i
  RapporteringView (handlePipelineComplete → pendingReviewReportId →
  effekt åbner review-dialogen ved ready/update_available/blocked,
  manuel override ved not_ready) — pariteten genoprettet.
- B2 reminder-godkend-variant: send-report-reminder skelner nu
  upload/godkend/manuel pr. virksomhed via tragt-kriterierne (processed,
  ikke slettet/aarsrapport/_sentinel, ingen facts-række); godkend/manuel
  deep-linker /reports?reportId=<nyeste ucommittede>; egne dedup_keys
  (report_reminder_approve/_manual); email-varianterne (inkl.
  variant-styret hint-boks via {{hint_text}}) går uden om
  DB-upload-templaterne.
- B4 ventetids-feedback: Hb-upload-zonen viser "Læser dokumentet…"
  (processing) → "Trækker tallene ud — tager normalt under ét minut"
  (analyzing — status-værdien var død og sættes nu før extract-kaldet;
  ren UI-status, A1 urørt).
- B5 toast-CTA: succes-toasten slutter "gennemgangen åbner automatisk"
  (gamle CTA-tekst 'tryk "Klar til godkendelse"' matchede ingen knap).
Tragt-facit (målt i prod 2026-08-06): 152 processed / 145 committet /
5 ugodkendte (parse ok) / 2 manuel-indtastning aldrig udfyldt.
Parse-ventetid (processed_at - uploaded_at): median 5 s, p90 76 s.

---

### [P3] Hb-restyling af ReportManualOverride + slette-AlertDialog (noteret 2026-08-06)

Portal-dialogerne på Hb-rapporteringsfladen lander uden for
.theme-hjemmebane-scopet og arver appens mørke tokens (strukturelt
vilkår — jf. hb-rapport-ux-recon.txt §3 og HbSidebars Sheet-fravalg).
Review-dialogen og pulse-modalen ER taget i B3-PR'en
(feat/rapportering-b3-dialoger, 2026-08-06); tilbage står
ReportManualOverride (inkl. delte OverrideFormFields, som B3 bevidst
ikke rører — den deles med ManualOverride) og slette-AlertDialog'en på
samme flade.

---

### [P2] Periode-hallucination: resterende værn efter års-guard-PR'en (noteret 2026-08-06)

PROD-FACIT (rapport f5293b79, "Saldobalance juni + ÅTD.pdf", uploadet
2026-08-06): klientens PDF-tekstudtræk var degraderet → source_fingerprint
unknown/LOW ("No known source fingerprint matched") → det_result no_match
→ branch ai_fallback_no_match → AI gættede "Juni 2020" → server-overriden
extractPeriodFromText fandt INTET (raw_ai_period == report_period) →
persisteret m. validation_status PASS. Samme fil tidligere læst korrekt.
RODÅRSAG: 15.000-tegns-loftet i extractTextFromFile klippede dokument-
halen (m. e-conomic-footeren, eneste PDF-fingerprint-markør) + pdfjs-
tokensplit; fuld kortlægning i hb-periode-2020-recon.txt +
hb-periode-fix-forslag.txt.

SHIPPET i fix/periode-aars-guard (PR 1): (a) års-guard i
extract-financial-data (udledt år < uploadår−2 → ingen auto-periode,
needs_manual_entry + quality_signals.period_rejected_reason/
suspected_period, log [PeriodGuard]); (b) AI-dato-anker (TRIN 5 +
tool-beskrivelse + user-besked: dags dato + årsvindue [år−2 .. år],
ellers UNSURE); (c3) tekstudtræks-loft hævet 15k → 60k m. sikker
hoved(40k)+hale(10k)-trunkering og klip-markør.

RESTERENDE LED (denne backlog-post):
- (c1) Whitespace-normaliseret footer-match i sourceFingerprint.ts
  (`secure.e-conomic.com` skal overleve tokensplit midt i URL'en) —
  lille, lav risiko.
- (c2) Flere uafhængige markører/2-af-3 for e-conomic-SALDOBALANCE
  (i dag KUN footer-URL'en; range-detektoren er eksplicit udelukket
  for saldobalancer). OBS adfærdsændring: mere aggressiv genkendelse
  flytter filer fra AI-fallback til FAIL LOUD/needs_manual_entry —
  kør m. dry-run-belæg først.
- (d) PASS-degradering ved uverificeret AI-periode: branch ==
  ai_fallback_no_match OG extractPeriodFromText bekræftede intet →
  quality_signals.period_unverified + validation UNSURE (dagens PASS
  er falsk tryghed, jf. prod-facittet). Evt. UI-opfølgning: markér
  Periode-boksen i ReportReviewDialog til bekræftelse.
- OPRYDNING: kør forekomst-query'en (hb-periode-2020-recon.txt §5) og
  ret ramte rapporter manuelt; f5293b79 skal have periode-override el.
  re-upload.

---

### [P1] Handouts-GO = swap på /handouts (noteret 2026-08-06)

GENNEMFØRT 2026-08-06 (swap-PR'en feat/handouts-go-swap; flade:
PR #214, motor: PR #213 m. 18 write-path-tests; recon/byggeplan:
hb-handouts-recon.txt + hb-handouts-byggeplan.txt): /handouts bærer
Hb-fladen via PROTECTEDROUTE — IKKE MemberRoute (forudsætning ii:
Legat-brugere skal kunne stå her; samme gating som gamle Handouts.tsx).
/handout redirecter m. bevaret query/hash (?module= er Akademi-broens
kontrakt, forudsætning i — HandoutRedirect efter §3.6-mønstret).
HbMemberShells Handouts-mål → /handouts for alle. Medlemsnote shippet
i samme PR (id "v2026-08-hjemmebane-handouts", forudsætning v).

PENSIONERINGS-FACIT (afveg fra planen — grep-reglen afgjorde):
- PENSIONERET: pages/Handouts.tsx (nul importører efter swap) +
  HandoutCard.tsx (kun brugt af Handouts.tsx).
- BEVARET SOM ADVISOR-BRO: HandoutDetail.tsx + HandoutLeverItem.tsx +
  HandoutAIFeedback.tsx — MemberDetail.tsx:661 renderer HandoutDetail
  (advisor-visningen bag /members/:id?handout=-notifikations-linket,
  send-slack-handout-notification:194). Kan først pensioneres når
  MemberDetail-brugen konverteres/omlægges (eget punkt).
- DELTE BEVARET: AdvisorCompanyPrompt (AppSidebar/Milestones/Budget),
  handoutConfig (DashboardHandouts/ItemEditor/ElementView/engine m.fl.),
  handoutUtils (ElementView/MemberDetail), handoutEngine + handoutNotify
  (begge flader + tests).

ÆRLIG RISIKO-NOTE: skrivevejene (autosave, løftestang→milestone,
AI-sparring) er IKKE afprøvet af en ægte EJER på den nye flade før
swappet — advisor-byggeruten er skrivebeskyttet (isOwner-gaten). De
hviler på motor-pariteten (PR #213: samme H1-H6-kald, 18 write-path-
tests) og gamle flades prod-brug af selvsamme motor siden PR #213.
Første medlems-autosave på ny flade bør observeres efter deploy.
ROLLBACK-PLAN: revert af swap-PR'en + Lovable "Update" bringer
medlemmerne tilbage på gammel flade; ingen data-migrering er
involveret (samme tabeller/motor), så rollback er ren visning.

SEKVENS-NOTE (banner): medlemsnoten her er skrevet OVEN PÅ
rapportering-banneret og nævner Budget som "i nyt design" — Budget-GO-
swappen (feat/budget-go-swap, afventer advisor-GO) SKAL derfor merges
FØR eller SAMMEN MED denne PR, ellers lover banneret et Budget-design
der ikke er live, og de to PR'er konflikter i banner-blokkene
(DashboardActionCenter/AppLayout — løses ved at denne PR's
handouts-banner vinder).

Oprindelige GO-forudsætninger (historik): (i) ?module=-kontrakten,
(ii) ProtectedRoute-gatingen, (iii) Legat-verifikation m. legat-konto,
(iv) advisor-gennemgang på rigtige data, (v) medlemsnote. (iii)+(iv)
indgår i GO-beslutningens manuelle tjek på byggeruten.

---

### [P1] KPI-GO = swap på /kpis (noteret 2026-08-05)

STATUS 2026-08-06: TEKNISK KLAR — swap-PR'en (feat/kpi-go-swap) er
bygget og verificeret; AFVENTER ADVISOR-GO før merge. Forudsætning
(i)+(ii)+(iii) verificeret 2026-08-06 m. bevis:
- (i) Link-kontrakten: hb-kpigo-recon.txt — alle 6 edge-skrevne links
  er rene "/kpis"-stier (ingen params/ankre); #goals honoreres af
  NoegletalView (useScrollToHash + id="goals" m. scroll-mt-24).
  Redirectet /noegletal → /kpis bevarer hash/query.
- (ii) Advisor-kommentar-flowet: gennemprøvet ende-til-ende på
  byggeruten (popover → kpi_chart_comments → notifikation hos medlem).
- (iii) PDF-eksport: gennemprøvet på ny flade (Hb-baggrund +
  hb-graffarver). To kendte skavanker accepteret og noteret som [P4]
  (sektionsoverskrifter klippes i venstre kant; kommentar-pins
  medtages ikke).
(iv) GO-koordinering består som merge-betingelse: KPI-GO SKAL ligge FØR
(el. samtidig med) Rapportering-GO.

GO'ets indhold (implementeret i swap-PR'en): /kpis bærer den nye flade
via MemberRoute (advisors passerer som på gammel /kpis — company-
override-mønstret uændret); /noegletal er redirect m. bevaret
hash/query; HbMemberShells KPI'er-mål → /kpis for alle; gamle
KPIs.tsx pensioneret (nul resterende importører; exportKPIReport
lever videre i lib og bruges af NoegletalView).

Oprindeligt punkt (historik): Hb-KPI-fladen (/noegletal) er bygget
route-parallelt bag AdvisorRoute (fuld paritet + trend/AI); gamle
/kpis er frosset. URL'en er NOTIFIKATIONS-/EMAIL-KONTRAKT
(notify-kpi-comment, detect-financial-alerts og send-monthly-digest
skriver /kpis-deep-links; #goals er Guide-kontrakt).

MEDLEMSNOTE shippet 2026-08-06: opgraderings-banner i
DashboardActionCenter + AppLayout (nyt announcement-id
"v2026-08-hjemmebane-kpi" så tidligere dismissere ser den).
PROCES-REGEL: hver kommende GO (Rapportering, Budget, Forside) shipper
m. opdateret medlemsnote i samme PR. Ved Forside-GO flytter
opgraderings-kommunikationen til push-laget — bannerne her dør med
gamle Index/AppLayout.

---

### [P3] ✅ Løst i PR feat/hjemmebane-ai-analyse — AI-analysens Hb-konvertering

**Status**: Løst (2026-08-05). Maskinen udskilt til useFinancialAnalysis som
ren flytning (én sandhed for messages-idempotensen — skrivevejen findes kun
i hook'en); gamle AIFinancialAnalysis omlagt til hook'en m. nul
adfærdsændring (JSX/toasts/collapse 1:1 via callbacks); HbFinancialAnalysis
på /noegletal m. eget periodevalg og stille kvitteringer — broens toasts
afviklet på Hb-fladen. Rene domme (sortFindings/deriveEffectivePeriod/
deriveDataSufficiency/deriveDefaultExpanded) i src/lib/financialAnalysis.ts
m. vitest. CompanyChatPane's AnalysisData-import bevaret via re-eksport.
Gamle udtryk består KUN på frosne /reports indtil dens swap.

**Oprindelig plan**: AIFinancialAnalysis (589 linjer) embeddes som BEVIDST
BRO i gammelt udtryk på /noegletal (og bruges fortsat af CompanyChatPane).
En Hb-konvertering er sit eget sprint og skal dække BEGGE kaldesteder +
generér-flowet (generate-financial-commentary) og periodevalgs-kontrakten
(selectedPeriodKey/onSelectPeriod).

---

### [P1] Koncern-RPC månedsindeks-fejl — januar tabes, måneder forskydes (recon §7.1, noteret 2026-08-05) — EGET spor

STATUS: BORTFALDET 2026-08-05 — koncern fjernet (produktbeslutning;
kode-PR feat/koncern-fjernelse, DB-drop følger i SPOR 3, jf.
hb-koncern-recon.txt). RPC'en get_my_group_budget_summary droppes i
stedet for at fixes.

Frontend skriver monthIdx 0-11 i alle budget-skriveveje (fx
`${year}-${scenario}-${monthIdx}` med monthIdx fra values.map);
RPC'en `get_my_group_budget_summary` accepterer kun 1-12
(20260316113038:229: `IF _agg.month_idx >= 1 AND _agg.month_idx <= 12`)
og placerer på month_idx−1. KONSEKVENS for rigtige data: januar (idx 0)
udelades, og feb-dec (1-11) forskydes én måned frem i
/group/budget-totalerne; årstotaler mangler januar. QA-fixturen
(20260316115536:51-59) skriver 1-12 via generate_series(1,12) og
validerede derfor falsk grønt.

**Fix-skitse**: (1) verificér mod prod-data (SELECT på rå
budget_targets-perioder for en koncern-virksomhed); (2) migration der
ændrer RPC'ens vindue til 0-11 og placerer på month_idx (ikke −1) —
frontenden er de facto-kontrakten; (3) omskriv QA-fixturen til
generate_series(0,11); (4) deploy via Lovable SQL editor +
pg_get_functiondef-verifikation. Rører SECURITY DEFINER-RPC ⇒ kræver
eksplicit grønt lys (FORBIDDEN-zonen).

---

### [P1] Budget-GO = swap på /budget (noteret 2026-08-05)

STATUS 2026-08-06: TEKNISK KLAR — swap-PR'en (feat/budget-go-swap) er
bygget og verificeret; AFVENTER ADVISOR-GO før merge. Recon-bevis:
hb-budgetgo-recon.txt — NUL paritets-gap (alle 13 handlinger H1-H13
findes på ny flade m. linjecitater; ingen forberedelses-PR nødvendig).
Status pr. forudsætning:
- (i) #forecast fra kold navigering: STRUKTURELT INDFRIET AF SWAPPET —
  ankeret sidder på gamle flade på en Radix-fane der ikke er i DOM
  (Guide-linket var de facto dødt); ny flades sektion er ALTID i DOM
  (recon §2/§4). Manuel byggerute-test udestår som GO-tjek.
- (ii) notifikations-deep_link: kontrakten er ren "/budget" (ét
  skrivested: detect-financial-alerts:159) + Guide-hash — redirect m.
  bevaret hash/query dækker alt (recon §1). Manuel efterprøvning
  udestår som GO-tjek.
- (iii) koncern-drill-down: BORTFALDET m. KODE-FACIT — nul
  koncern/group-RPC-referencer i src, drop-migration
  20260805224500_drop_koncern_objects.sql findes (recon §5).
- (iv) advisor-gennemgang på rigtige data: UDESTÅR som GO-tjek (fladen
  ligger klar på byggeruten til gennemgang før merge).
- (v) W6-company-filteret: i koden på begge flader (budgetEngine:743-747)
  + W6-integrationstestet; prod-levetid dog kun siden 2026-08-05 —
  kalender-vilkår, advisor-GO'et tager stilling.
- (vi) princip 8-rammen: uændret gældende (konvergens.md §2.8).

GO'ets indhold (implementeret i swap-PR'en): /budget bærer den nye
flade via MemberRoute (advisors passerer som på gammel /budget —
company-override-mønstret uændret, HbAdvisorCompanyPrompt + scoped
queries jf. recon §6); /budgettering er redirect m. bevaret hash/query
(#forecast er Guide-kontrakt, "/budget" er notifikations-kontrakt);
HbMemberShells Budget-mål → /budget for alle; gamle Budget.tsx
pensioneret SAMT ni forældreløse komponenter (grep-belæg pr. komponent
i hb-budgetgo-swap.txt): BudgetTemplatePicker, BudgetOverviewTab,
BudgetScenariosTab, BudgetVsActualTab, BudgetForecastTab,
BudgetCashflowTab, BudgetHelpers, BudgetImport, BudgetFromAccounts —
alle m. nul resterende kode-brugere. BEVARET: budget/types.ts
(hjemmebane+engine), AdvisorCompanyPrompt (Milestones/Handouts),
budgetEngine/budgetTemplates (én sandhed, W1-W7-testet). Medlemsnote
shippet i samme PR jf. proces-reglen (nyt announcement-id
"v2026-08-hjemmebane-budget" i DashboardActionCenter + AppLayout).

Oprindeligt punkt (historik): Hb-budgetfladen (/budgettering) er bygget
route-parallelt bag AdvisorRoute (fuld paritet: oversigt,
scenarier/redigering, BvA, import ×2, hvad-hvis, cashflow); gamle
/budget er omlagt til budgetEngine men ellers frosset. URL'en er
NOTIFIKATIONS-KONTRAKT (detect-financial-alerts skriver
/budget-deep-links) og GUIDE-KONTRAKT (/budget#forecast).

---

### [P2] Dobbelt kategori→gruppe-sandhed for budget (recon §7.2, noteret 2026-08-05)

STATUS: BORTFALDET 2026-08-05 — koncern fjernet (produktbeslutning).
DB-spejlet budget_category_group_map var kun koncern-RPC'ens sandhed og
droppes i SPOR 3; lib/budgetTemplates.ts er herefter eneste sandhed.

lib/budgetTemplates.ts (frontend) og budget_category_group_map (DB,
seedet 20260316113038:16-103 — "80 rows (7 templates)") er to sandheder;
restaurant_cafe MANGLER i DB-mappen men findes i frontend-skabelonerne ⇒
restaurant-virksomheder ekskluderes altid af koncern-RPC'en som
unmapped/no-template-match, og nye skabelon-kategorier kræver opdatering
begge steder. Kandidat: kuratering + seed-migration af de manglende
rækker; naturlig nabo til [P1]-RPC-sporet ovenfor.

---

### [P3] "Fra budget"-mål-kilde på /noegletal (recon §7.5, noteret 2026-08-05)

KPIs.tsx:692-706 (frosset) henter månedligt budgetgennemsnit ind i
målsætningen ("Fra budget"-knappen); /noegletal har ingen
budget-reference — reelt paritetshul i dag. Beslutning fra
budget-design §e(ii): koblingen hører hjemme på KPI-fladen —
/noegletal's mål-panel får en "Fra budget"-kilde (læser motorens
loadBudget) som lille eget spor efter budget-GO. Den omvendte kobling
("gør til KPI-mål" fra budgetfladen) er fravalgt som primær vej
(én dør til mål).

---

### [P3] Prompt-hærdning af generate-budget-scenarios — keys/enum i prompten (noteret 2026-08-05)

STATUS: INDFRIET 2026-08-05 — deployet og serversidigt bevist (Matched
categories x/y m. x=y i prod-loggen); klient-værnet U3 består som
defense-in-depth. (PR #193; punktet står som historik.)

Fund fra hb-ai-merge-recon §a: edge-funktionens baseSummary viser
modellen KUN labels (`${r.label} (${r.group}): […]`), mens tool-schemaet
beder om "key" retur ("samme som base" — en base modellen aldrig har set
nøglerne på). Modellen kan kun gætte, og valideringens
`!baseRow → false`-gren lader helt umatchede svar passere. Klient-værnet
(U3 i budgetEngine: normaliseret match + ærlig nul-match-fejl) er landet
i fix/budget-ai-merge og SKAL bestå uanset — dette punkt er den
komplementære server-hærdning: send keys med i prompten (fx
"key: label (group): […]"-form) og/eller enum over gyldige keys i
tool-schemaet, plus stram valideringen så umatchede keys tæller som
fejl, ikke som "ændrede". Edge auto-deployer fra merge — eget lille
spor m. manuel prod-verifikation ("View code").

---

### [P3] ✅ Løst 2026-08-06 — Chat-attachments PR 5 — upload-vejens restpunkter (noteret 2026-08-06)

STATUS: LØST 2026-08-06. Bevis, punkt for punkt:
1. **Path-skrivning**: PR #201 — uploadChatAttachments skriver
   `{ name, path, type, size }`; getPublicUrl fjernet.
2. **INSERT-stramning**: eksekveret manuelt i prod 2026-08-06 08:55 —
   `with_check` på "Authenticated users can upload chat attachments" er
   nu bucket + eget `{userId}/`-præfiks (samme mønster som
   DELETE-policyen fra 20260317133757). BEVIDST ingen migrationsfil —
   ALTER POLICY-statementen står dokumenteret her som kanonisk historik:
   ```sql
   alter policy "Authenticated users can upload chat attachments"
     on storage.objects
     with check (
       bucket_id = 'chat-attachments'
       and (storage.foldername(name))[1] = auth.uid()::text
     );
   ```
   Rollback: `with check (bucket_id = 'chat-attachments')` (bucket-only).
3. **Levende sandbox-bevis** (Uploadtest ApS): upload passerede den
   strammede policy; context_meta indeholdt path-formen UDEN url-nøgle;
   signeret rendering bevist i både medlems- og advisor-visning; fuld
   oprydning bevist 0.

Oprindeligt punkt (historik):

Bucketen blev privat 2026-08-06 (PR 4,
`20260806082800_chat_attachments_private.sql`); læsning går nu
udelukkende via get-chat-attachment-url (RLS-gatet, signeret 600 s).
Tre restpunkter samlet som PR 5:
1. **INSERT-stramning**: policyen "Authenticated users can upload chat
   attachments" tjekker kun bucket_id — stram til eget
   `{userId}/`-præfiks (`(storage.foldername(name))[1] =
   auth.uid()::text`, samme mønster som DELETE-policyen fra
   20260317133757).
2. **uploadChatAttachments skriver path i stedet for public-URL**:
   `getPublicUrl`-strengen i `context_meta.attachments[].url` er død
   som direkte link efter flippet; edge-parseren understøtter allerede
   `att.path` (index.ts:114-115), så skift skrivningen til
   `{ path }`-formen og behold url-parseren for historiske rækker.
3. **Levende sandbox-bevis for upload-vejen**: upload → besked →
   rendering via frisk signering, efter både 1 og 2.

Konsekvens noteret (besluttet 2026-08-06): historiske
public-URL-kopier UDEN FOR appen (fx delte links) er døde pr.
flippet — app-visningen er upåvirket, da edge-parseren håndterer den
lagrede url-form.

---

### [P4] Chat-analysekortets tidsstempel bumper ikke ved genanalyse (noteret 2026-08-05)

Fund fra AI-analysens idempotens-bevis: useFinancialAnalysis' UPDATE af
det eksisterende ai_analysis-kort (én pr. periode) opdaterer content,
men kortet viser fortsat oprindelig created_at — som ikke KAN bumpes
(protect_message_immutable_fields blokerer created_at-ændring, bevidst).
To muligheder når det tages op: (a) stemp `context_meta.updated_at` ved
UPDATE og vis "opdateret {tid}" i kort-rendereren; (b) acceptér
nuværende adfærd (kortet er en levende artefakt pr. periode —
oprettelsestiden er ærlig nok). Ingen hast; afgøres ved
chat-konverteringen.

---

### [P4] companyHardDelete efterlader storage- og notifikations-orfaner (set 2026-08-05/06; samler tidligere notifikations-orfan-punkt)

`hardDeleteCompany` (supabase/functions/_shared/companyHardDelete.ts)
efterlader to klasser af orfaner — begge set og manuelt ryddet:

1. **Storage-orfaner** (set 2026-08-06, chat-attachments-sluttest):
   chat-attachments-objekter under slettede brugeres
   `{userId}/`-præfiks ryddes ikke. Fix-krav: oprydningen SKAL ske via
   `adminClient.storage.from(...).remove()` i edge-laget — direkte
   DELETE på storage.objects blokeres af
   `storage.protect_delete()`-triggeren (lærdom 2026-08-06).
2. **Notifikations-orfaner** (set 2026-08-05, koncern-sluttest):
   rækker med NULL company_id til de slettede brugere overlever,
   fordi der ryddes pr. company_id (chat_reply-vejen i
   notify-chat-reply sætter ingen company_id på notifikationen).
   Fix-idé: slet også pr. user_id for de slettede brugere
   (userIds-listen findes allerede i hardDeleteCompany).

---

### [P4] KPI-PDF-eksport: to kendte skavanker på Hb-fladen (noteret 2026-08-06, KPI-GO-forudsætning iii)

Fra PDF-gennemprøvningen af NoegletalView før KPI-GO:
1. **Sektionsoverskrifter klippes i venstre kant** af det eksporterede
   PDF (exportKPIReport på "kpi-export-area").
2. **Kommentar-pins medtages ikke i eksporten** — accepteret indtil
   videre (pins er popover-lag, ikke del af eksport-DOM'en).
Begge accepteret som ikke-blokerende for GO; tages op hvis eksporten
får klager eller ved næste eksport-arbejde.

---

### [P4] 4 præeksisterende tsc-fejl på main — kendt baseline (noteret 2026-08-05)

`bunx tsc --noEmit -p tsconfig.app.json` (det RIGTIGE typecheck — root-
tsconfig er solution-style m. `"files": []`, så `tsc --noEmit` uden -p
tjekker ingenting) giver 4 kendte fejl på main: CompanyChatPane
(AnalysisData-cast), PushView:136, RapporteringView:431+520. Kendt
baseline — ryddes samlet i én lille oprydnings-PR; indtil da er facittet
for enhver branch "præcis de 4 kendte fejl, ingen nye".

---

### [P3] Dialogernes konvertering (review + Ret data) — eget sprint m. testarv (noteret 2026-08-05)

ReportReviewDialog + ReportManualOverride (+ PulseCheckinModal) åbnes som
BEVIDST BRO i gammelt udtryk over Hb-rapporteringen. RP-1-flowet er hærdet
gennem PR #150-155 — en Hb-konvertering skal arve/genetablere hele
testdækningen og de tre commit-veje (Godkend / Opdater committed data /
Erstat) samt handleAppliedCommit-semantikken ("Gem og anvend" committer
straks; 'draft' committer aldrig). Broens toasts består indtil da.

---

### [P2] Bucket A-funktioner med verify_jwt = false bør migreres til true (noteret 2026-08-12)

Fundet fra 10. august (PR #267) beviste, at gatewayen MED `verify_jwt =
true` afviser forfalskede signaturer før koden kører (fem funktioner gav
UNAUTHORIZED_LEGACY_JWT; ægte vault-nøgle gav 200), mens den uden blok —
eller med `false` — intet validerer. `get-community-billed-url` er den
første Bucket A-funktion født med `true` (PR #296). `get-chat-attachment-url`
og de øvrige Bucket A-funktioner med `verify_jwt = false` i
`supabase/config.toml` er ældre end fundet og bør gennemgås og migreres til
`true` i et dedikeret spor — én funktion ad gangen med verificering af alle
kald-stier (FORBIDDEN-reglen i CLAUDE.md: aldrig `true` uden den
verificering; auth-hook/webhooks med egne signaturordninger er undtaget).

---

### Bogføringsnote — deploy-re-baseline af edge functions (2026-08-06)

Serverside-fejning af alle 55 repo-funktioner + kontrolgruppe af 5 kendte
slettede (POST m. ugyldig Bearer + tom body): **55/55 svarer (ikke-404) ·
5/5 slettede er 404 — ingen drift mellem repo og server.** Fire afvigere
fra 401-mønstret er recon'et godartede (hb-gate-recon.txt):
send-engagement-nudge svarede 200 fordi den er en afblændet stub uden
handlinger (pensioneret i PR chore/audit-oprydning);
intro-reminder-cron/legat-reminder-cron/run-weekly-agent svarede 500 fordi
de er Deno.cron-only uden HTTP-handler — runtime-500 før nogen kodelinje,
ingen sideeffekter.

**Sweep-svarklasse-lærdom** (til fremtidige fejninger): forventningen ved
ugyldig Bearer er IKKE uniform 401 — auth-gatede giver 401, webhooks/
payload-validering 400, cron-only-moduler 500, og en statisk stub kan give
200. Kun 404 beviser "findes ikke serverside"; alle andre koder beviser
"deployet", og en 200 skal altid følges af kode-recon før konklusion.

---

## Anbefalet rækkefølge

1. **[P0] `get_users_last_login`** først. Eneste aktive læk; lav indsats; ingen FORBIDDEN-overlap.
2. **[P1] `esm.sh`-pinning** og **[P1] CI-håndhævelse af auth-buckets** kan tages i samme hardening-sprint — begge skalerer på tværs af de 55 functions, og en CI-pipeline-PR kan introducere infrastrukturen til begge tjek (pinning som regex, auth-mønster som ESLint-regel).
3. **[P2] `Auth.tsx` rå fetch** og **[P2] password-floor** sidder begge i `src/pages/Auth.tsx` og kan kombineres i én lille PR.
4. **[P2] README** og **[P2] onboarding-flag** er uafhængige småfix og kan tages når der er kapacitet.
5. **[P3]-punkterne** afventer eksplicit grønt lys — `migration-squash` er bundet til tidsvinduet i `SECURITY_BASELINE.md` afsnit 8, og `tsconfig strict` skal være en dedikeret refactor-track.
