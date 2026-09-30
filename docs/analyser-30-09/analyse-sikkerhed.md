# Sikkerhedsanalyse — The Boardroom (app.theboardroom.dk)

**Udført 29/9-2026** mod `origin/main` = `84323f3` (worktree `/home/claude/wt-sikkerhed`, kun læst).
Grundlag: CLAUDE.md, `supabase/SECURITY_BASELINE.md`, `docs/adgangsdomme.md`, 399 migrationer,
113 edge functions, `src/`, `bun.lock` (`bun audit`).

**Mål, påstå ikke.** Hvert fund er mærket:
- **MÅLT i kode** — læst i filen på `84323f3`, linje angivet.
- **UMÅLT i prod** — det kræver en måling i Lovable (SQL'en sidst i dokumentet), fordi prod kan
  afvige fra repoet. Det er sket før: 29/9 viste `pg_policies`, at chat-attachments allerede havde
  mappetjekket, som repoet manglede (SECURITY_BASELINE §9). Omvendt kan prod altså også have en
  beskyttelse, repoet ikke kender — eller mangle en, repoet tror findes.

Den effektive RLS-tilstand er udledt af alle migrationer i rækkefølge (seneste CREATE/DROP/ALTER
POLICY pr. tabel, også dem inde i `DO $$ … $$`-blokke): **95 tabeller i `public`, 375 policies,
0 tabeller uden RLS, 3 med RLS og ingen policy** (`email_send_log_legacy`, `cvr_opslag_cache`,
`ansoegning_visninger` — alle bevidst lukkede). Det er migrationshistorik, ikke bevis.

---

## TOP 10 — prioriteret, med konkret rettelse

### 1. KRITISK — Et medlem kan skrive ALLE kolonner i sin egen virksomhed (selv-tildelt adgang, gratis sessioner, pris)

- **Hvor:** `supabase/migrations/20260224222456_cf8f2d1f-f8c7-422a-88c1-8d65677c636c.sql:51-53`
  — `"Members can update own company" ON public.companies FOR UPDATE USING (id = user_company_id(auth.uid()))`,
  ingen WITH CHECK, ingen kolonnebegrænsning. Grep over alle migrationer: **ingen trigger på
  `companies`, ingen `GRANT/REVOKE UPDATE (kolonne)`**. MÅLT i kode, UMÅLT i prod (sektion 06–08 i SQL'en).
- **Hvad et medlem kan gøre med én `supabase.from("companies").update({...})` fra browserkonsollen:**
  - `contract_end_date = '2099-01-01'`, `is_legat = false` → `har_aktivt_medlemskab` bliver sand
    (`20260811160000_community_adgang.sql:26-41` læser KUN de to felter) → community, alt indhold,
    events, `content-assets`-bucket. En udløbet eller legat-bruger giver sig selv fuldt medlemskab.
    `computeMembershipTier` (useAuth, `create-stripe-checkout/index.ts:70-80`) giver `full`.
  - `intro_session_used_at = null` / `jonas_session_used_at = null` → porten i
    `create-free-intro-booking` (`UPDATE … WHERE <ret> IS NULL`, SECURITY_BASELINE §5) åbner igen:
    ubegrænsede gratis sessioner hos Morten og Jonas.
  - `fornyelsespris_oere` / `indgangspris_oere` → `opret-fornyelse-checkout/index.ts:83,161-165`
    læser dem som grundlag for prisen (begrænset til eksisterende Stripe-`lookup_key`s, men et medlem
    kan vælge et billigere niveau).
  - `stripe_customer_id` → `opret-fornyelse-checkout/index.ts:230-231` og
    `create-subscription-checkout/index.ts:89-90` sætter den som `customer` på Checkout.
  - `name` → indsættes i invitationsmailen fra vores domæne (`send-invitation-email/index.ts:106-140`),
    og medlemmet kan selv oprette invitationen (`company_invitations` INSERT-policy,
    `20260225103844…sql`). Det er et phishing-relæ med vores afsender og en tekst, medlemmet vælger.
  - `status`, `er_kunde`, `certificate_eligible`, `cvr_number`, `advisor_id`, `slack_channel` —
    alle skrivbare.
- **Rettelse (ny migration, IKKE rørt SECURITY DEFINER-funktioner):** en BEFORE UPDATE-trigger på
  `companies` med en **hvidliste** over de kolonner, et medlem må ændre. Hvidlisten er MÅLT i `src/`
  (alle `.from("companies").update(...)`-kald): `name, cvr_number, contact_email, website,
  contact_phone, industry_code, industry_label, logo_url, weekly_focus_enabled,
  offboarding_requested_at` plus de medlemsskrevne profilfelter fra `20260909150000`
  (`description`) — **mål `vis_i_netvaerk`, `city` og øvrige før listen låses**. Formen:
  ```sql
  create or replace function public.protect_company_member_fields() returns trigger
  language plpgsql set search_path = public as $$
  declare
    tilladte text[] := array['name','cvr_number','contact_email','website','contact_phone',
      'industry_code','industry_label','logo_url','weekly_focus_enabled',
      'offboarding_requested_at','description','updated_at'];
  begin
    if auth.role() = 'service_role' or public.has_role(auth.uid(), 'advisor'::app_role) then
      return new;
    end if;
    if (to_jsonb(new) - tilladte) is distinct from (to_jsonb(old) - tilladte) then
      raise exception 'Medlemmer må ikke ændre disse felter på virksomheden' using errcode = '42501';
    end if;
    return new;
  end $$;
  create trigger protect_company_member_fields before update on public.companies
    for each row execute function public.protect_company_member_fields();
  ```
  Hvidlisten er fail-closed: en ny kolonne er beskyttet, indtil nogen bevidst åbner den. Tilføj en
  WITH CHECK (`id = user_company_id(auth.uid())`) på policyen i samme migration (DROP + CREATE,
  med begrundelse i kommentaren). Kolonne-GRANTs duer ikke her: rådgivere bruger samme rolle
  (`authenticated`) og skal kunne skrive alt. Opdatér SECURITY_BASELINE §3/§5 i samme PR.
  **Kildeværn:** en `.guard`-test, der fælder hvis hvidlisten indeholder `contract_end_date`,
  `is_legat`, `subscription_*`, `*_session_used_at`, `*pris_oere`, `stripe_*`.

### 2. HØJ — `extract-annual-report`: læs en anden virksomheds årsrapport og overskriv dens rapport (IDOR)

- **Hvor:** `supabase/functions/extract-annual-report/index.ts:16` tager `report_id, file_path,
  year, company_id, user_id` fra body. Adgangstjekket (`:23-41`) dækker KUN `company_id`. Derefter:
  `:56-62` `failReport` opdaterer `financial_reports … .eq("id", report_id)` med service role —
  uden `company_id`; `:88-90` `adminClient.storage.from("financial-documents").download(file_path)`
  — en vilkårlig sti i den private bucket; `:321` `committed_by: user_id` fra body. MÅLT i kode.
- **Angreb:** medlem af A sender `company_id = A`, `file_path = "<B's company_id>/…/aarsrapport.pdf"`.
  Service role henter B's fil, AI'en udtrækker tallene, og de skrives som A's facts — synlige for A.
  Med `report_id` = B's rapport sættes B's rapport til `status: 'error'` med fejlloggen.
  Stierne kræver kendskab til uuid'er (company_id og report_id), hvilket sænker sandsynligheden, ikke alvoren.
- **Rettelse:** slå rapporten op med **kalderens klient** (`callerClient.from("financial_reports")
  .select("id, company_id, file_path").eq("id", report_id).maybeSingle()`), kræv
  `rapport.company_id === company_id`, brug `rapport.file_path` fra databasen — aldrig body'ens — og
  kræv at den begynder med `${company_id}/`. `committed_by = callerId`, ignorér body'ens `user_id`.

### 3. HØJ (UMÅLT i prod) — Hele Bucket B hviler på, at Lovable faktisk håndhæver `verify_jwt = true`

- **Hvor:** `supabase/functions/_shared/edgeFunctionAuth.ts:128-173` — `authenticateServiceRole`
  **dekoder** JWT'en uden at verificere signaturen og stoler på `role: "service_role"`. Det er kun
  sikkert, hvis gatewayen har afvist en forfalsket signatur først. Samme mønster i
  `send-notification-email/index.ts:181-190` og `generate-weekly-focus/index.ts:33-35`.
  CI-værnet (`check-verify-jwt-invariant.ts`) tjekker `config.toml` — ikke hvad Lovable har udrullet.
  CLAUDE.md dokumenterer, at udrulning sker gennem build-chatten pr. function; om hver function er
  udrullet MED sin `verify_jwt`-indstilling er ikke målt pr. function.
- **Konsekvens hvis én er forkert udrullet:** enhver på internettet kan kalde fx
  `slet-medlemsdata-cron`, `webinar-mail-cron`, `meta-send-cron` med en hjemmelavet token.
- **Måling (Terminal) — kun mod de to functions, der er tørkørsel som standard:**
  ```
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://loiavmastgeieqyiwyyr.supabase.co/functions/v1/meta-send-cron -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.x" -H "Content-Type: application/json" -d '{"dry_run":true}'
  ```
  Forventet `401` (gatewayen). `200` = hullet findes. Gentag med `ga-send-cron`.
  Kør den IKKE mod functions, der sender som standard.
- **Rettelse (varig):** lad `authenticateServiceRole` verificere signaturen selv, så sikkerheden ikke
  afhænger af udrulningen — fx `authClient.auth.getClaims(token)` (verificerer mod projektets JWKS)
  og kræv `claims.role === 'service_role'`. Skal prøves mod både legacy-JWT fra cron og
  `sb_secret`-nøglen (filhovedets egen advarsel om de to formater) — tørkør før udrulning.

### 4. HØJ — Åben redirect efter login (`/auth?returnUrl=…`)

- **Hvor:** `src/pages/Auth.tsx:32` (`returnUrl = searchParams.get("returnUrl")`), `:72-73` og
  `:99-101`: `if (returnUrl.startsWith("https://")) window.location.href = returnUrl`. MÅLT i kode.
- **Angreb:** link til `https://app.theboardroom.dk/auth?returnUrl=https://falsk-boardroom.dk/login`
  — medlemmet logger ind på den ægte side og lander på en falsk «din session udløb»-side.
  `bun audit` melder desuden `react-router 6.30.1`/`@remix-run/router 1.23.0` med to
  open-redirect-advisories (GHSA-2j2x-hqr9-3h42, GHSA-wrjc-x8rr-h8h6) for `navigate(returnUrl)` på `:89`.
- **Rettelse:** én ren funktion (`src/lib/sikkerReturUrl.ts` + test): absolutte URL'er kun hvis
  `new URL(x).hostname` er i en hvidliste (`app.theboardroom.dk`, `theboardroom.dk`, `topix.dk` —
  mål hvilke kaldere der faktisk sender `returnUrl`); relative kun hvis de starter med `/` og hverken
  med `//` eller indeholder `\`. Alt andet → `/`. Opgradér `react-router-dom` til ≥ 6.30.2.

### 5. MELLEM — `update-annual-report-revenue`: overskriv en anden virksomheds rapport (IDOR)

- **Hvor:** `supabase/functions/update-annual-report-revenue/index.ts:12` (`report_id`, `company_id`
  fra body); tjekket (`:17-34`) gælder kun `company_id`; `:86-103` læser og opdaterer
  `financial_reports.extracted_data` med `.eq("id", report_id)` alene, med service role. MÅLT i kode.
- **Rettelse:** `.eq("id", report_id).eq("company_id", company_id)` på BÅDE select og update, og 404
  hvis rapporten ikke findes i den virksomhed.

### 6. MELLEM — «Own»-policies uden virksomhedsprædikat: et medlem kan skrive rækker ind i en ANDEN virksomhed

- **Hvor (effektiv tilstand ifølge migrationerne):**
  - `financial_reports` «Users can insert own reports» — WITH CHECK `auth.uid() = user_id` alene
    (`20260223141214_…sql`); «Users can update own reports» uden WITH CHECK.
  - `milestones` «Users can insert/update own milestones» (`20260223155456_…sql`) — samme form.
  - `kpi_targets`, `kpi_benchmarks` «Users can insert own …» — allerede bogført som BACKLOG [P4]
    i SECURITY_BASELINE §5 («Addendum 2026-08-05»), stadig åbent.
  Permissive policies OR-stakker (SECURITY_BASELINE §5): den løse vinder over «Company members can
  insert company …». MÅLT i migrationer, UMÅLT i prod (sektion 13 i SQL'en).
- **Konsekvens:** A kan indsætte en rapport eller milepæl med `company_id = B`. Den dukker op i B's
  lister og hos rådgiverne. Facts'ene er beskyttet: `commit_report_facts`
  (`20260826120000_data_basis_paa_facts.sql:100-102`) kræver virksomhedsmedlemskab.
- **Rettelse:** én migration, `ALTER POLICY` (ingen DROP-vindue, samme greb som `20260831131200`):
  `WITH CHECK (auth.uid() = user_id AND company_id = public.user_company_id(auth.uid()))` på alle
  INSERT-policies, og samme WITH CHECK tilføjet på UPDATE-policies.

### 7. MELLEM — Medlemmer kan indsætte vilkårlige rådgiverklokker — som bliver til mails

- **Hvor:** `20260226070339_a8523a0b-…sql:5-8` — `advisor_notifications` INSERT for `authenticated`
  med WITH CHECK `member_id = auth.uid()` alene. `type`, `advisor_id`, `title`, `body`,
  `reference_*` er frie. `klokke-mail-cron` mailer rækker med `advisor_id`: en ALARM-type
  (`drift`, `traek_fejlet` …) går straks til `driftModtager()`, resten i morgenmailen til rådgiverne
  (`_shared/klokkeMail.ts:122`, `klokke-mail-cron/index.ts:75`). Teksten escapes
  (`indgangsMail.ts:83`), så det er social engineering og falske alarmer — ikke XSS. MÅLT i kode.
- **Ingen klient bruger policyen:** grep i `src/` finder INGEN insert i `advisor_notifications`
  (kun select/delete/realtime). Alle skrivere er edge functions med service role.
- **Rettelse:** `DROP POLICY "Members can insert own notifications" ON public.advisor_notifications;`
  med begrundelsen i kommentaren (ingen klientskriver målt 29/9).

### 8. MELLEM — `notify-chat-reply`: intet adgangstjek — alle kan sende «Ny besked fra din rådgiver» til alle virksomheder

- **Hvor:** `supabase/functions/notify-chat-reply/index.ts:13-55` — `authenticateUser`, så service
  role direkte på `conversation_id` fra body. Hverken rolletjek eller RLS-opslag. Svaret afslører
  antallet af medlemmer (`sent`). MÅLT i kode.
- **Rettelse:** slå samtalen op med `callerClient` (RLS afgør synligheden) og kræv
  `has_role(callerId, 'advisor')` — notifikationen hedder «fra din rådgiver».

### 9. MELLEM — `run-company-agent`: et medlem kan starte en LIVE agentkørsel uden om godkendelseslaget

- **Hvor:** `supabase/functions/run-company-agent/index.ts:976` (`dryRun = body.dry_run !== false`)
  og `:1065-1077`: for et bruger-JWT er eneste tjek, at kalderen kan SE virksomheden. Et medlem kan
  sende `{"dry_run": false, "trigger": "company_review", "company_id": <egen>}`, og agentens
  skrivekald (bl.a. `write_company_action`) udføres live. Det omgår både `agent_proposals`
  (design §7) og beslutningen om, at `company_actions` kun skrives af motoren
  (SECURITY_BASELINE «Opgave-modellens skrivevej»). Koster desuden AI-kredit uden loft. MÅLT i kode.
- **Rettelse:** efter `authenticateUser`: kræv `has_role(callerId, 'advisor')` for ALLE
  ikke-service-kald (eller mindst for `dry_run === false`).

### 10. MELLEM — Afhængigheder med kendte sårbarheder (`bun audit`: 3 critical, 45 high)

- **`xlsx 0.18.5`** — `package.json:91` OG `npm:xlsx@0.18.5` i edge (`extract-financial-data`,
  `genkoer-rapport`, `_shared/xlsxRawParser.ts`, `_shared/templateRegistry.ts`): prototype pollution
  (GHSA-4r6h-8v6p-xvw6) og ReDoS (GHSA-5pgg-2g8v-p4x9) — **server-side parsing af filer, medlemmer
  uploader**. npm-registret stopper ved 0.18.5; rettelsen er SheetJS' egen CDN
  (`https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs` i Deno, tarball-URL i `package.json`) —
  slå den aktuelle version op hos SheetJS før skiftet.
- **`jspdf 2.5.2`** (direkte, `src/lib/exportPdf.ts`, `certifikat/exportCertificate.ts`): 2 critical
  (GHSA-f8cm-6447-x5h2 path traversal — Node-build; GHSA-wfv2-pwc8-crg5 HTML-injektion i
  «new window»-stier) + en række high. Drager `dompurify 2.5.9` med (GHSA-vhxf-7vqr-mrjg).
- **`react-router 6.30.1`** — se fund 4. **`ws < 8.20.1`** (realtime-js), **`lodash ≤ 4.17.22`**
  (recharts), **`vite 5.4.19`**, **`vitest 3.2.4`** (critical GHSA-5xrq-8626-4rwp, kun når Vitest UI
  kører), `rollup`, `picomatch`, `glob` — primært dev/bygge-tid.
- **Rettelse:** én PR pr. lag: (a) xlsx i edge + frontend, (b) jspdf ≥ 3 (API'et er ændret —
  prøv certifikat og PDF-eksport), (c) `bun update` for resten, `bun run test` + `tsc` grøn.
  Lockfilen er to (`bun.lock` og `bun.lockb`) + `package-lock.json` — hold dem i takt, eller slet
  den ubrugte.

---

## ALLE FUND

Alvor: Kritisk / Høj / Mellem / Lav. «Kode» = MÅLT i kode. «Prod» = kræver prod-måling.

### A. RLS og tabeller

| # | Alvor | Fund | Hvor | Status |
|---|---|---|---|---|
| A1 | **Kritisk** | `companies`: medlem kan UPDATE alle kolonner (fund 1) | `20260224222456_…sql:51-53` | Kode · Prod |
| A2 | Mellem | `financial_reports`/`milestones`/`kpi_*` INSERT uden virksomhedsprædikat (fund 6) | `20260223141214`, `20260223155456` | Kode · Prod |
| A3 | Mellem | `advisor_notifications` medlems-INSERT, ubrugt, fører til mails (fund 7) | `20260226070339_…sql:5-8` | Kode |
| A4 | Mellem | `company_invitations`: et medlem kan invitere enhver mail ind i sin virksomhed og (via `send-invitation-email`) få den mailet fra vores domæne; sammen med A1 bestemmer medlemmet også virksomhedsnavnet i mailen | `20260225103844_…sql`; `send-invitation-email/index.ts:106-140` | Kode |
| A5 | Lav | `weekly_focus` «Members set seen_at …» tillader UPDATE af HELE rækken, ikke kun `seen_at` | `20260911060000_…sql` | Kode |
| A6 | Lav | `app_config`: læsbar for alle `authenticated` (`USING (true)`), skrivbar for alle rådgivere — baseline §5 siger «Admin-only». Låsene `meta_send_aktiv`, `ga_send_aktiv`, `webinar_mail_aktiv`, `klaviyo_afmeld_aktiv` bor her. Ingen hemmeligheder fundet i migrationernes nøgler; prod umålt (sektion 15) | `20260224095552_…sql` | Kode · Prod |
| A7 | Lav | `profiles.email` kan ændres af brugeren selv (UPDATE uden WITH CHECK/kolonnebegrænsning) — den bruges som modtager i flere mails; ikke en adgangsnøgle efter det målte | `profiles`-policies | Kode |
| A8 | Lav | Medlemmer bevarer `user_id`-baseret adgang (SELECT/UPDATE/DELETE) til egne `financial_reports`/`milestones` efter at være fjernet fra virksomheden | «Users can … own reports/milestones» | Kode |
| A9 | Info | `industry_benchmarks`, `kanoniske_noegler`: `USING (true)` for authenticated — fælles referencedata, bevidst | — | Kode |
| A10 | Info | Service-role-policies med `USING (true)` scoped `TO service_role` (webinar_*, klaviyo_*, meta_*) — korrekt, men afhænger af at `roles` faktisk er `{service_role}` i prod (sektion 03) | `20260919*`–`20260922*` | Prod |
| A11 | Info | Views: ingen `CREATE VIEW` i `public` fundet i migrationerne; et view uden `security_invoker` omgår RLS — sektion 11 måler det | — | Prod |

### B. Storage

| # | Alvor | Fund | Hvor | Status |
|---|---|---|---|---|
| B1 | Lav | `company-logos` og `avatars` er offentlige med SELECT `TO public` → anon kan LISTE objekterne og dermed se company-id'er og user-id'er (mappenavne) | `20260225124103`, `20260227191148` | Kode · Prod |
| B2 | Lav | `company-logos`, `avatars`, `financial-documents`, `chat-attachments`: ingen `allowed_mime_types`/størrelsesloft i migrationerne — en SVG/HTML i en offentlig bucket serveres fra supabase-domænet | buckets | Prod (sektion 09) |
| B3 | Lav | `financial-documents`: medlem kan UPDATE `financial_reports.file_path` på egne rapporter; `extract-financial-data:588-595` henter `report.file_path` med service role (kun hash-tjek målt, ikke udlæsning) — samme klasse som fund 2, lavere fordi indholdet ikke synes at blive returneret | `extract-financial-data/index.ts:588-595` | Kode, delvist |
| B4 | Info | `community-billeder`/`-filer`, `aftaler`, `chat-attachments`, `content-assets`: private, mappetjek/adgangsdom som baseline §9 beskriver | — | Kode |

### C. Edge functions

| # | Alvor | Fund | Hvor | Status |
|---|---|---|---|---|
| C1 | Høj | `extract-annual-report` IDOR (fund 2) | `extract-annual-report/index.ts:16,56-62,88-90,321` | Kode |
| C2 | Høj | Bucket B stoler på gatewayens `verify_jwt` (fund 3) | `_shared/edgeFunctionAuth.ts:128-173` | Prod |
| C3 | Mellem | `update-annual-report-revenue` IDOR (fund 5) | `:12,86-103` | Kode |
| C4 | Mellem | `notify-chat-reply` uden adgangs-/rolletjek (fund 8) | `:13-55` | Kode |
| C5 | Mellem | `run-company-agent` live-kørsel fra medlem (fund 9) | `:976,1065-1077` | Kode |
| C6 | Mellem | `ansoegning-gem` (anonym): loftet pr. IP bruger første led af `x-forwarded-for`, som klienten selv kan sætte, hvis gatewayen tilføjer i stedet for at erstatte. Så er kun totalloftet (300/t) tilbage → (a) en angriber kan brænde totalloftet af og lukke ansøgningen for rigtige ansøgere en webinaraften, (b) «opret» + «gem» med en vilkårlig mail sender `Ansoegning paabegyndt` til Klaviyo (`:387`) og kan dermed starte marketingflows mod fremmede adresser (samtykke) | `ansoegning-gem/index.ts:115,266-272,387` | Kode · Prod (XFF-adfærd) |
| C7 | Lav | `stripe-webhook` og `calendly-webhook`: ingen tidsvindue på `t=` (replay af en gammel, gyldig signatur) og almindelig `===` i stedet for konstant-tid. Forretningslogikken er idempotent på `stripe_reference`/session-id, så en replay rammer primært allerede behandlede hændelser | `stripe-webhook/index.ts:58-77`; `calendly-webhook/index.ts:~34-48` | Kode |
| C8 | Lav | `webinar-afmeld` GET udfører afmeldingen (inkl. global Klaviyo-afmelding). Mailsikkerhedsscannere (Outlook Safe Links m.fl.) forhåndshenter links → folk kan blive afmeldt uden at klikke. Overvej GET = bekræftelsesside, POST = handling (One-Click er allerede POST) | `webinar-afmeld/index.ts:53-117` | Kode |
| C9 | Lav | `notify-kpi-comment`: et medlem kan udløse «Din rådgiver har kommenteret …» til sin egen virksomhed, med fri `kpi_key`/`period_label` i teksten; mangler rolletjek | `notify-kpi-comment/index.ts:16-60` | Kode |
| C10 | Lav | AI-proxies uden loft: `generate-budget-from-accounts`, `generate-budget-scenarios`, `import-budget-excel`, `ai-financial-feedback` (uden `companyId`) — enhver gyldig konto (også udløbet/legat) kan bruge Lovable-AI-kreditten; ingen rate-limit | respektive `index.ts` | Kode |
| C11 | Lav | Logning af hemmeligheder/data: `import-application/index.ts:232` logger invitationstokenet (en bearer-nøgle til signup); `extract-financial-data` logger de første 300 tegn af regnskabsfilen; `send-invitation-email` bruger `.ilike('email', …)` med brugerens input som mønster (`%`/`_`) | angivne linjer | Kode |
| C12 | Lav | Fejlbeskeder med rå databasefejl i svaret (`error.message`) i bl.a. `attach-user-to-company`, `update-annual-report-revenue`, `send-template-email`, `extract-annual-report` — lækker skema-navne | — | Kode |
| C13 | Lav | `send-template-email`, `get-advisor-alerts`, `create-legat-enrollment`, `upgrade-legat-to-member` slår rollen op med service role i stedet for `callerClient` — korrekt udfald, men afviger fra Bucket A-mønstret | — | Kode |
| C14 | Lav | `send-pulse-reminder` og `run-company-agent`/`send-invitation-email` (service-grenen) sammenligner `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` som streng — ifølge `edgeFunctionAuth.ts:13-17` kan det aldrig lykkes (sb_secret vs. legacy-JWT). Sikkert (fail-closed), men død kode, der kan vildlede | — | Kode |
| C15 | Info | CORS `Access-Control-Allow-Origin: *` på alle functions. Ingen cookies bruges (bearer i header), så ingen CSRF-vej fundet | `_shared/edgeFunctionAuth.ts:57-61` | Kode |
| C16 | Info | `preview-transactional-email` importerer `npm:@supabase/supabase-js@2/cors` — upinnet version, mod CLAUDE.md-reglen | `preview-transactional-email/index.ts:3` | Kode |
| C17 | Info | Token-endpoints (`aftale-underskrift`, `webinar-delt`, `ansoegning-link/-samtale/-gem`, `opret-indgangs-checkout`, `webinar-afmeld`): prædikatet før service role, konstant-tid hvor det gælder, kodeforsøg talt atomisk (5), sporet append-only. Ansøgnings- og betalingstokens er uuid'er uden udløb — acceptabelt, men værd at skrive ned | — | Kode |

### D. SECURITY DEFINER-funktioner

56 SECURITY DEFINER-funktioner fundet i migrationerne; **alle har `SET search_path`**. Følgende er
ifølge migrationerne kaldbare af **anon** (ingen `REVOKE … FROM anon/PUBLIC`; Supabase giver som
standard EXECUTE til anon):

| # | Alvor | Funktion | Hvad anon kan | Status |
|---|---|---|---|---|
| D1 | Lav | `has_role(uuid, app_role)`, `user_company_id(uuid)`, `is_legat_user`, `legat_day`, `legat_unlocked_modules` | Givet et bruger-uuid: se om personen er admin/rådgiver, hvilken virksomhed de hører til, legatstatus. Kræver uuid'et | Prod (sektion 10) |
| D2 | Lav | `get_all_advisor_profiles()` | Navne og avatarer på alle rådgivere — offentligt kendt i forvejen | Prod |
| D3 | Info | `get_users_last_login`, `get_siden_sidst`, `get_conversation_sender_profiles`, `mark_*` | Gatet i kroppen (`has_role`/`auth.uid()`), returnerer 0 rækker/fejl for anon | Kode |
| D4 | Info | `lookup_invite_company(_info)` | Bevidst anon (signup), tokenet er argumentet | Kode |

Rettelse D1/D2: `REVOKE EXECUTE … FROM anon, PUBLIC; GRANT EXECUTE … TO authenticated, service_role;`
— **men `has_role` og `user_company_id` står på FORBIDDEN-listen** («Ændring af … SECURITY DEFINER-
funktioner»). En REVOKE ændrer ikke kroppen, men kræver alligevel eksplicit grønt lys. Og RLS
kalder dem i anon-kontekst for policies `TO public` — mål først (sektion 10), prøv bagefter.

### E. Frontend

| # | Alvor | Fund | Hvor | Status |
|---|---|---|---|---|
| E1 | Høj | Åben redirect efter login (fund 4) | `src/pages/Auth.tsx:32,72-73,99-101` | Kode |
| E2 | Lav | `dangerouslySetInnerHTML` UDEN DOMPurify på rådgiverskrevet HTML: `RabataftalerView.tsx:234` (`aftale.indhold`), `akademi/views/ElementView.tsx:277` (`item.body`), `boardroom/BoardroomView.tsx:402` (`push.body`). Skribenter er rådgivere (RLS på `content_items`/`partners`), så det er defense in depth — men én kompromitteret rådgiverkonto giver stored XSS mod alle medlemmer | angivne linjer | Kode |
| E3 | Info | Chat: DOMPurify med hvidliste (`MemberChatPane.tsx:638`, `CompanyChatPane.tsx:1808`, `ChatBeskedTekst.tsx:85`). Community: ingen `dangerouslySetInnerHTML`; links hærdet til http(s) (`components/henvisninger.ts:96-110,215`), `rel="noopener noreferrer nofollow"` | — | Kode |
| E4 | Info | Sessionen ligger i `localStorage` (Supabase-standard, `previewAuthStorage.ts`). En XSS (E2) kan derfor læse tokenet — det er grunden til, at E2 ikke er ren kosmetik | `src/integrations/supabase/previewAuthStorage.ts` | Kode |
| E5 | Info | Sentry: ingen `sendDefaultPii`, ingen `setUser`, ingen replay — ingen persondata sendt bevidst | `src/main.tsx:21-27` | Kode |

### F. Stripe-webhook, e-underskrift, delingstokens

| # | Alvor | Fund | Status |
|---|---|---|---|
| F1 | Lav | Stripe: signatur verificeres over rå body FØR parsing, men uden tidsvindue og ikke i konstant tid; kun første `v1=` prøves (et problem ved nøglerotation). Mangler `STRIPE_WEBHOOK_SECRET`, fejler `importKey` sandsynligvis (umålt) | Kode |
| F2 | Info | Idempotens: pr. session (`:1611-1620`), pr. `stripe_reference` (`:1186-1212`, `:1480`) og `idempotencyKey` på mails — ingen ny fejl fundet | Kode |
| F3 | Info | `aftale-underskrift`: token → service role, kode som `sha256(aftale_id:kode)`, `registrer_kodeforsoeg` atomisk, sporet append-only og trigger-låst; replay af «underskriv» afvises af `brugt_at`-låsen (`:210-217`) | Kode |
| F4 | Info | `webinar-delt`: SHA-256-aftryk, konstant tid, ét 403-svar, `findForbudteNoegler` på svaret | Kode |

### G. Afhængigheder

Se fund 10. `bun audit` på `84323f3`: **100 sårbarheder (3 critical, 45 high, 45 moderate, 7 low)**.
Edge-imports er pinnede (`@supabase/supabase-js@2.97.0` ×122) — undtagelse C16.
`pdfjs-dist 4.9.155` er efter CVE-2024-4367 (rettet i 4.2.67).

---

## PROD-SQL (Lovable → SQL editor)

Ét resultatsæt (UNION ALL med sektionskolonne), så eksporten får det hele. Kun læsning.
Afslører ikke hemmeligheder: cron-kommandoer og app_config-værdier vises kun som ja/nej og længde.

Lovable SQL editor

```sql
with
tabeller as (
  select c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p')
),
pol as (
  select schemaname, tablename, policyname, permissive, roles, cmd,
         coalesce(qual, '') as q, coalesce(with_check, '') as c
  from pg_policies
  where schemaname in ('public','storage','realtime')
)
select * from (
  select '01_rls_slaaet_fra' as sektion, relname::text as objekt,
         'anon_select=' || has_table_privilege('anon', oid, 'SELECT')
         || ' auth_select=' || has_table_privilege('authenticated', oid, 'SELECT') as detalje
  from tabeller where not relrowsecurity
  union all
  select '02_rls_uden_policy', t.relname::text, 'lukket for klienter (ingen policy)'
  from tabeller t where t.relrowsecurity and not exists (select 1 from pg_policy p where p.polrelid = t.oid)
  union all
  select '03_policy_true_ikke_service', schemaname || '.' || tablename,
         policyname || ' | ' || cmd || ' | roles=' || array_to_string(roles, ',') || ' | using=' || q || ' | check=' || c
  from pol
  where (btrim(q) = 'true' or btrim(c) = 'true') and not roles @> array['service_role']::name[]
  union all
  select '04_policy_anon_eller_public_uden_auth', schemaname || '.' || tablename,
         policyname || ' | ' || cmd || ' | roles=' || array_to_string(roles, ',') || ' | using=' || q || ' | check=' || c
  from pol
  where roles && array['anon','public']::name[]
    and (q || c) not ilike '%auth.uid()%' and (q || c) not ilike '%service_role%'
    and (q || c) not ilike '%has_role%' and (q || c) not ilike '%auth.role()%'
  union all
  select '05_restrictive', schemaname || '.' || tablename, policyname || ' | ' || cmd
  from pol where permissive = 'RESTRICTIVE'
  union all
  select '06_skrivepolicies_kernetabeller', tablename,
         policyname || ' | ' || cmd || ' | ' || permissive || ' | roles=' || array_to_string(roles, ',') || ' | using=' || q || ' | check=' || c
  from pol
  where schemaname = 'public' and cmd in ('INSERT','UPDATE','ALL','DELETE')
    and tablename in ('companies','company_members','user_roles','company_invitations','advisor_notifications',
                      'financial_reports','milestones','kpi_targets','kpi_benchmarks','profiles','app_config','weekly_focus')
  union all
  select '07_companies_kolonne_update', column_name::text,
         'authenticated_UPDATE=' || has_column_privilege('authenticated', 'public.companies', column_name, 'UPDATE')
  from information_schema.columns
  where table_schema = 'public' and table_name = 'companies'
    and column_name in ('contract_end_date','contract_start_date','is_legat','subscription_status',
      'subscription_current_period_end','stripe_customer_id','stripe_subscription_id','indgangspris_oere',
      'fornyelsespris_oere','intro_session_used_at','jonas_session_used_at','status','er_kunde',
      'certificate_eligible','is_demo','slack_channel','advisor_id','name','cvr_number')
  union all
  select '08_triggere_companies', t.tgname::text, pg_get_triggerdef(t.oid)
  from pg_trigger t where t.tgrelid = 'public.companies'::regclass and not t.tgisinternal
  union all
  select '09_bucket', b.id,
         'public=' || b.public || ' | loft=' || coalesce(b.file_size_limit::text, 'intet')
         || ' | mime=' || coalesce(array_to_string(b.allowed_mime_types, ','), 'alle')
  from storage.buckets b
  union all
  select '10_secdef', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'search_path=' || coalesce((select string_agg(x, ',') from unnest(p.proconfig) x where x ilike 'search_path%'), 'MANGLER')
         || ' | anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')
         || ' | authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
  union all
  select '11_views', c.relname::text,
         'kind=' || c.relkind || ' | options=' || coalesce(array_to_string(c.reloptions, ','), 'ingen (security_invoker=false)')
         || ' | anon_select=' || has_table_privilege('anon', c.oid, 'SELECT')
         || ' | auth_select=' || has_table_privilege('authenticated', c.oid, 'SELECT')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v','m')
  union all
  select '12_storage_policy', policyname,
         cmd || ' | roles=' || array_to_string(roles, ',') || ' | using=' || q || ' | check=' || c
  from pol where schemaname = 'storage'
  union all
  select '13_medlemsskrivning_uden_virksomhedsprædikat', tablename,
         policyname || ' | ' || cmd || ' | using=' || q || ' | check=' || c
  from pol
  where schemaname = 'public' and cmd in ('INSERT','UPDATE','ALL')
    and (q || c) not ilike '%has_role%' and (q || c) not ilike '%service_role%'
    and (q || c) not ilike '%user_company_id%'
  union all
  select '14_cron_med_noegle_i_klartekst', j.jobname::text,
         case when j.command ~ 'eyJ[A-Za-z0-9_-]{20,}|sb_secret_' then 'JA — nøgle i klartekst' else 'nej' end
  from cron.job j
  union all
  select '15_app_config_noegler', a.config_key::text, 'laengde=' || length(a.config_value::text)
  from public.app_config a
  union all
  select '16_antal_policies', schemaname, count(*)::text
  from pol group by schemaname
) samlet
order by sektion, objekt;
```

**Hvad der skal se sådan ud, hvis repoet og prod er enige:**
01 tom · 02 = de tre tabeller ovenfor (+ evt. prod-only) · 05 = præcis de fire demo-policies ·
07 = `true` på alle kolonner (= fund 1 bekræftet, fordi der ingen kolonne-GRANT er) · 08 tom
(= ingen beskyttelse; findes en række, har prod noget, repoet ikke kender — bogfør det) ·
10 = alle med search_path, `anon=true` kun på de funktioner, der står i D1/D2/D4 ·
13 = rækkerne fra fund 6 og A4/A5/A7 · 14 = «nej» på alle.

**Bevis for fund 1 som medlemmet selv** (separat kørsel; en no-op-UPDATE, rulles tilbage — erstat
`<MEDLEMMETS_USER_ID>` med et rigtigt medlems uuid, ikke en rådgiver):

Lovable SQL editor

```sql
begin;
select set_config('request.jwt.claims', '{"sub":"<MEDLEMMETS_USER_ID>","role":"authenticated"}', true);
set local role authenticated;
update public.companies
   set contract_end_date = contract_end_date,
       intro_session_used_at = intro_session_used_at
 where id = public.user_company_id('<MEDLEMMETS_USER_ID>'::uuid)
returning id, 'medlemmet MÅ skrive kontraktdatoen' as dom;
rollback;
```
Én række = hullet findes i prod. Nul rækker eller en fejl = prod har en beskyttelse, repoet ikke
kender (bogfør den). Ændrer intet: værdien sættes til sig selv, og transaktionen rulles tilbage.

---

## Ikke gennemgået linje for linje (åbent)

- ~40 af de 113 functions er kun kortlagt (auth-mønster og body-id'er), ikke læst i fuld længde —
  især `stripe-webhook` (1.730 linjer), `send-notification-email`, `extract-financial-data`
  (1.917 linjer), `monday-webhook`, cron-functions.
- `handle_new_user()` er ikke læst i prod-versionen (FORBIDDEN at ændre; baseline og CLAUDE.md
  er uenige om email-grenens `email_confirmed_at`-krav — CLAUDE.md siger målt 2/9: intet krav).
- Kæden `companies.cvr_number` (skrivbar, fund 1) → «CVR-genbrug» i `opretEllerGenbrugVirksomhed`
  ved en ansøgers underskrift er ikke fulgt til ende: kan et medlem sætte en ansøgers CVR og få
  ansøgeren hægtet på sin virksomhed? UMÅLT.
- Om Supabase-gatewayen erstatter eller forlænger en klient-sendt `x-forwarded-for` (C6) — UMÅLT.
