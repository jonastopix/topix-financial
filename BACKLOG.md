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

### [P3] Float-artefakter i `financial_report_facts.metrics`-jsonb (udskudt fra ×100-fix, PR fix/ret-data-x100)

**Status**: Bevidst ikke fixet i ×100-PR'en. Committede nøgletal i `metrics`-jsonb indeholder flydende-komma-artefakter, fx `16984.829999999998` i stedet for `16984.83` (observeret i Topix' produktionsdata 2026-07-21). ×100-fixet **bevarer** disse værdier eksakt (round-trip uden korruption) — det renser dem ikke.

**Hvorfor ikke fixet her**: Artefakterne stammer fra et andet lag (parse/normalisering før commit), ikke fra visning→gem-round-trippet som ×100-buggen. Anden rodårsag ⇒ andet fix. En oprydning ville kræve enten en normaliserings-/afrundingsbeslutning (hvor mange decimaler er kanoniske for øre?) eller en migration af eksisterende committede facts — begge udenfor scope for en målrettet korruptions-fix.

**Revurder**: sammen med et review af parse-/commit-laget (`commit_report_facts` + normaliseringen der producerer `metrics`). Afklar kanonisk decimalpræcision og om historiske facts skal migreres.

---

### [P3] Varierende metrics-nøglesæt pr. `source_type` (udskudt fra ×100-fix)

**Status**: Noteret, ikke adresseret. `source_type = 'manual'` mangler nøgler som `ebit`/`ebitda` i `metrics`-jsonb, hvor `canonical`/`canonical_v2` har dem (observeret 2026-07-21). Konsumenter må ikke antage et fast nøglesæt.

**Hvorfor ikke fixet her**: Uafhængigt af ×100-buggen (ingen delt rodårsag). Kræver en beslutning om et kanonisk nøgle-skema på tværs af `source_type` — en datakontrakt-opgave, ikke en konverterings-fix.

**Revurder**: ved næste arbejde på metrics-kontrakten (fx MCP Tool 3 `get_financial_metrics`, som læser `metrics` direkte og vil eksponere inkonsistensen).

---

### [P3] Inline-validerings-dublet i `ReportReviewDialog.tsx:201` (udskudt fra ×100-fix)

**Status**: Noteret, ikke konsolideret. `handleSaveEdits` har en egen inline-parse (`trimmed.replace(/\./g, "").replace(",", ".")` + `isNaN`-tjek) der dublerer `parseMetricValue`s dansk-logik, brugt **kun** til validering før gem. Den påvirker ikke den gemte værdi (som går gennem `saveManualOverride` → `parseMetricValue`), så den var ikke en del af ×100-rodårsagen.

**Hvorfor ikke fixet her**: ×100-fixet var målrettet serializer/parser-mismatchen; at rydde en validerings-dublet er en separat, ikke-adfærdsændrende oprydning. Holdt ude for at bevare et minimalt, review-bart diff.

**Revurder**: erstat inline-parsen med et kald til `parseMetricValue` (og behandl `undefined` som valideringsfejl), så der er én kilde til parse-sandhed. Lav, isoleret oprydning.

---

## Anbefalet rækkefølge

1. **[P0] `get_users_last_login`** først. Eneste aktive læk; lav indsats; ingen FORBIDDEN-overlap.
2. **[P1] `esm.sh`-pinning** og **[P1] CI-håndhævelse af auth-buckets** kan tages i samme hardening-sprint — begge skalerer på tværs af de 55 functions, og en CI-pipeline-PR kan introducere infrastrukturen til begge tjek (pinning som regex, auth-mønster som ESLint-regel).
3. **[P2] `Auth.tsx` rå fetch** og **[P2] password-floor** sidder begge i `src/pages/Auth.tsx` og kan kombineres i én lille PR.
4. **[P2] README** og **[P2] onboarding-flag** er uafhængige småfix og kan tages når der er kapacitet.
5. **[P3]-punkterne** afventer eksplicit grønt lys — `migration-squash` er bundet til tidsvinduet i `SECURITY_BASELINE.md` afsnit 8, og `tsconfig strict` skal være en dedikeret refactor-track.
