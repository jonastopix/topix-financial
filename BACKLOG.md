# BACKLOG.md

Prioriteret arbejdsplan over de 10 røde flag fra recon-pass'et 2026-05-07.
Dokumentet er ikke en idé-liste — det er konkrete punkter forankret i
faktiske filer og linjer i kodebasen. Vedligeholdes ved at fjerne punkter
når de er løst (med reference til merged PR), og tilføje nye fund med
prioritet når de opdages. Prioritering følger rækkefølgen P0 (aktive huller),
P1 (supply chain / disciplinære lukker), P2 (inkonsistenser), P3 (bevidst
udskudt strukturel gæld).

---

### [P0] `get_users_last_login` lækker auth-metadata til alle authenticated

**Risiko**: SECURITY DEFINER-funktionen `get_users_last_login(uuid[])` er `GRANT EXECUTE TO authenticated` uden adgangstjek på input-listen (migration `20260421071533`). Enhver authenticated bruger kan kalde den med vilkårlige UUIDs og får `last_sign_in_at` + `email_confirmed_at` retur for de UUIDs der findes. UUIDs lækker fra UI'et — rådgivere ser member-IDs, gruppe-medlemmer ser hinandens. Sandsynlighed for utilsigtet aggregering høj; sandsynlighed for ondsindet probing lav i et lukket B2B-produkt, men ikke nul. Eneste aktive informationslæk i recon'en.

**Indsats**: S–M. Ny migration der wrapper SQL'en med en WHERE-klausul: `WHERE id = ANY(user_ids) AND (has_role(auth.uid(), 'advisor') OR id IN (SELECT user_id FROM company_members WHERE company_id = user_company_id(auth.uid())))`. SECURITY DEFINER bevares.

**Afhængigheder**: Rører kun `public`-skemaet (læser fra `auth.users` men ændrer ingen trigger eller policy der). Ikke i FORBIDDEN-zonen — det er en ny migration der strammer en eksisterende RPC. Skal noteres i `SECURITY_BASELINE.md` afsnit 1 fordi funktionen ikke er listet der i dag.

**Verifikation**: pgTAP- eller Deno-test: member-A kalder funktionen med member-B's UUID (anden company) → 0 rækker. Advisor kalder med samme UUID → 1 række. Manuel verifikation via Supabase SQL editor med rolle-skifte.

---

### [P1] `esm.sh`-imports uden version-pinning

**Risiko**: Alle 55 edge functions importerer fra `https://esm.sh/@supabase/supabase-js@2` (og lignende `@2`-pinning andre steder). Hvis esm.sh kompromitteres, eller hvis en patch-version udgives med malware, kører den i alle edge functions ved næste cold start. Blast radius: total — service-role-adgang til hele databasen. Sandsynlighed lav, men ikke spekulativ (esm.sh-incidenter er sket før).

**Indsats**: M. Find/replace alle `esm.sh`-imports på tværs af `_shared/` og 55 function-mapper, pinn til eksakt version (matchende `package.json`'s `@supabase/supabase-js` på `2.97.0`). Én PR uden funktionel ændring.

**Afhængigheder**: Ingen FORBIDDEN-overlap. CLAUDE.md kræver allerede pinning for nye functions — dette retro-fitter de eksisterende.

**Verifikation**: `grep -rE "esm\.sh/[^@]+@[0-9]+(\"|$)" supabase/functions` returnerer 0 hits. Deploy én function og smoke-test at den stadig svarer.

---

### [P1] Ingen håndhævelse af edge function-auth-buckets

**Risiko**: CLAUDE.md og `_shared/edgeFunctionAuth.ts` kræver `authenticateUser` eller `authenticateServiceRole` FØR første service-role-handling, men intet i CI/lint stopper en udvikler i at glemme det. Da `verify_jwt = false` på alle functions, betyder en glemsel = åben service-role endpoint. Privilegieeskalering uden auth-gate.

**Indsats**: M. Custom ESLint-regel eller regex-baseret CI-tjek på `supabase/functions/*/index.ts`: hvis `createClient(..., SUPABASE_SERVICE_ROLE_KEY)` forekommer, skal `authenticateUser(` eller `authenticateServiceRole(` forekomme tidligere i filen. Webhook-functions (Bucket C) flagges manuelt via en kort allowlist eller en kommentar-marker.

**Afhængigheder**: Bygger oven på eksisterende `_shared/edgeFunctionAuth.ts`. Ingen FORBIDDEN-overlap.

**Verifikation**: Negativ-test: bevidst dårlig function fejler CI. Positiv-test: alle 55 eksisterende functions passerer.

---

### [P2] README er Lovable-default-placeholder

**Risiko**: `REPLACE_WITH_PROJECT_ID` står på linje 5, 13 og 65 i `README.md`. Ny udvikler får ingen projekt-specifik onboarding fra README og skal gætte sig frem til CLAUDE.md og `SECURITY_BASELINE.md`. Ingen sikkerhedseffekt; rent dokumentations-gæld.

**Indsats**: S. Erstat med kort projekt-beskrivelse, peger til CLAUDE.md (arkitektur), `SECURITY_BASELINE.md` (security-checklist), og dokumenter Bun + Supabase CLI-setup.

**Afhængigheder**: Ingen.

**Verifikation**: README læses ende-til-ende og giver nok til at klone, installere og starte dev-serveren.

---

### [P2] Klient-side onboarding-flag kan drifte fra server-state

**Risiko**: `App.tsx:121` læser `localStorage.getItem("tbr.onboarded")` for at force-redirecte væk fra `/onboarding` ved iOS-PWA-resume. Hvis localStorage og server-side `needsOnboarding` divergerer (ny enhed, server-reset, support-handling), kan brugeren havne i forkert state. Ikke sikkerhed; UX-bug for kantsager.

**Indsats**: S–M. Erstat localStorage-tjekket med en frisk query mod onboarding-state ved resume, eller invalidér localStorage-flag når server-state modsiger det.

**Afhængigheder**: Ingen FORBIDDEN-overlap.

**Verifikation**: Manuel test på iOS-PWA: ryd onboarding-state server-side, resume app — skal lande på `/onboarding`, ikke `/`.

---

### [P2] `Auth.tsx` omgår den genererede Supabase-klient

**Risiko**: `Auth.tsx:46-55` laver rå `fetch` mod `${VITE_SUPABASE_URL}/rest/v1/legat_enrollments?...` med apikey + Bearer for at detektere legat-brugere. Fungerer under RLS, men er typesvag, har ingen retry/fejlhåndtering, og duplikerer adgangsvej der allerede er løst af `supabase.from()`. Vedligeholdelses-gæld.

**Indsats**: S. Erstat med `supabase.from("legat_enrollments").select("id").eq("user_id", userId).eq("status", "active").limit(1).maybeSingle()`.

**Afhængigheder**: Ingen.

**Verifikation**: Login som legat-bruger redirectes til `/legat`. Login som almindelig bruger redirectes til `/` eller `returnUrl`.

---

### [P2] Inkonsistent password-floor

**Risiko**: `Auth.tsx:376` har `minLength={6}` (HTML), men `handleSignup` afviser med `getPasswordScore(password) < 2` (linje 109). To forskellige sandheder. Lille sikkerhedseffekt; primært UX-inkonsistens — brugeren får forskellige fejlbeskeder afhængigt af hvilken vej de støder på.

**Indsats**: S. Vælg én floor (sandsynligvis JS-score-baseret), opdater både HTML-attribut og JS-validering så de matcher. Afstem evt. med Supabase Auth-dashboardets egne password-krav.

**Afhængigheder**: Ingen.

**Verifikation**: Trivielt 6-tegns password afvises med samme begrundelse fra både HTML og JS.

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

## Anbefalet rækkefølge

1. **[P0] `get_users_last_login`** først. Eneste aktive læk; lav indsats; ingen FORBIDDEN-overlap.
2. **[P1] `esm.sh`-pinning** og **[P1] CI-håndhævelse af auth-buckets** kan tages i samme hardening-sprint — begge skalerer på tværs af de 55 functions, og en CI-pipeline-PR kan introducere infrastrukturen til begge tjek (pinning som regex, auth-mønster som ESLint-regel).
3. **[P2] `Auth.tsx` rå fetch** og **[P2] password-floor** sidder begge i `src/pages/Auth.tsx` og kan kombineres i én lille PR.
4. **[P2] README** og **[P2] onboarding-flag** er uafhængige småfix og kan tages når der er kapacitet.
5. **[P3]-punkterne** afventer eksplicit grønt lys — `migration-squash` er bundet til tidsvinduet i `SECURITY_BASELINE.md` afsnit 8, og `tsconfig strict` skal være en dedikeret refactor-track.
