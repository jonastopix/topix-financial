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

### [P1] Ingen håndhævelse af edge function-auth-buckets

**Risiko**: CLAUDE.md og `_shared/edgeFunctionAuth.ts` kræver `authenticateUser` eller `authenticateServiceRole` FØR første service-role-handling, men intet i CI/lint stopper en udvikler i at glemme det. Da `verify_jwt = false` på alle functions, betyder en glemsel = åben service-role endpoint. Privilegieeskalering uden auth-gate.

**Indsats**: M. Custom ESLint-regel eller regex-baseret CI-tjek på `supabase/functions/*/index.ts`: hvis `createClient(..., SUPABASE_SERVICE_ROLE_KEY)` forekommer, skal `authenticateUser(` eller `authenticateServiceRole(` forekomme tidligere i filen. Webhook-functions (Bucket C) flagges manuelt via en kort allowlist eller en kommentar-marker.

**Afhængigheder**: Bygger oven på eksisterende `_shared/edgeFunctionAuth.ts`. Ingen FORBIDDEN-overlap.

**Verifikation**: Negativ-test: bevidst dårlig function fejler CI. Positiv-test: alle 55 eksisterende functions passerer.

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

## Anbefalet rækkefølge

1. **[P0] `get_users_last_login`** først. Eneste aktive læk; lav indsats; ingen FORBIDDEN-overlap.
2. **[P1] `esm.sh`-pinning** og **[P1] CI-håndhævelse af auth-buckets** kan tages i samme hardening-sprint — begge skalerer på tværs af de 55 functions, og en CI-pipeline-PR kan introducere infrastrukturen til begge tjek (pinning som regex, auth-mønster som ESLint-regel).
3. **[P2] `Auth.tsx` rå fetch** og **[P2] password-floor** sidder begge i `src/pages/Auth.tsx` og kan kombineres i én lille PR.
4. **[P2] README** og **[P2] onboarding-flag** er uafhængige småfix og kan tages når der er kapacitet.
5. **[P3]-punkterne** afventer eksplicit grønt lys — `migration-squash` er bundet til tidsvinduet i `SECURITY_BASELINE.md` afsnit 8, og `tsconfig strict` skal være en dedikeret refactor-track.
