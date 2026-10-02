# Hastighedsanalyse — The Boardroom (app.theboardroom.dk)

Grundlag: `origin/main` @ `84323f3` (29/9-2026), worktree `/home/claude/wt-hastighed`, `bunx vite build` (Vite, uden egen `build`-konfig).
Målt her: bundle-størrelser, chunk-indhold (sourcemap-opgørelse), kode-stier, indekser i `supabase/migrations/`.
**IKKE målt:** noget i prod (indekser i `pg_indexes`, tabelstørrelser, kolde starter, vandfaldet i en rigtig browser). Hvor et fund bygger på migrationer og ikke på prod, står det.
Forudgående viden brugt: kortet `a22-forside-langsom` (32 forespørgsler = 785 ms i basen; REST ≈ 0,37 s pr. rundtur, EDGE ≈ 0,22 s, målt af Jonas 22/9) — ventetiden ligger FORAN basen. Denne analyse bekræfter det og peger på hvor.

---

## Top 10 (prioriteret)

| # | Fund | Forventet gevinst | Indsats | Konkret rettelse |
|---|------|------------------|---------|------------------|
| 1 | **Medlemmets login er 4 sekventielle rundture** før `loading=false`: `Promise.all(roles, profiles, company_members)` → `legat_enrollments` → `afgoerMedlemsTier` (companies) → `companies.onboarding_completed` | ≈ 3 × 0,37 s ≈ **1,1 s** af hvert medlems første billede (og hvert faneskift, se #3) | S | `src/hooks/useAuth.tsx:184-243`: læg legat-opslaget ind i `Promise.all` (det koster intet for rådgivere at hente det og smide det væk), og udvid joinet i `company_members` til `companies:company_id(id, name, contract_end_date, subscription_status, subscription_current_period_end, onboarding_completed, application_context)`. Så er `afgoerMedlemsTier` (`:228`) og meta-opslaget (`:236-240`) ren beregning på det allerede hentede. Én rundtur i stedet for fire. |
| 2 | **Rådgiverens login: `getUser()` + `process-pending-invitation` awaites uden timeout** før forsiden må tegne | 0,37 s (getUser) + 0,4–0,8 s (PPI, 3–4 interne opslag + `getClaims` + `admin.getUserById`) + evt. koldstart ≈ **0,8–1,5 s** pr. rådgiver-load | S | `useAuth.tsx:262-321`: (a) spring PPI over når `isAdv` (rådgiveren har rettelig ingen virksomhed — svaret er altid `no_pending_invitation`), sæt `companyResolution="none"` direkte; (b) brug `session.user` i stedet for `await supabase.auth.getUser()` (`:265`) — email og `user_metadata.invite_token` står allerede i sessionen; (c) giv PPI en timeout (AbortController, fx 8 s → `markerFejl("timeout")`). Kortene `a22-forside-langsom` og «process-pending-invitation kaldes ved hvert load». |
| 3 | **`fetchUserData` kører ved HVER auth-hændelse med session** — også `SIGNED_IN` ved hvert faneskift tilbage og `TOKEN_REFRESHED` (dokumenteret i kommentaren `useAuth.tsx:344-356`). Samme sted kaldes `log_user_login` ved hvert `SIGNED_IN` | Hele login-kæden (#1/#2, inkl. PPI-edge-kaldet for rådgivere) gentages ved hvert faneskift; alle `useAuth`-forbrugere re-rendrer (ny context-værdi). Login-loggen tæller faneskift som logins. | S | `useAuth.tsx:363-378`: kør `fetchUserData` kun når `!havdeSessionRef.current` eller `session.user.id` har skiftet (ref med sidste user_id); `log_user_login` kun på overgangen ingen-session → session. |
| 4 | **Hoved-chunken er 1.317 kB (400 kB gzip)** og hentes af ALLE — også den offentlige ansøgningsflade `/ansoeg`, `/betal`, `/aftale`, `/auth`. Den indeholder både medlemsforsiden (`BoardroomView` 49 kB), rådgiverforsiden (`RaadgiverForsideView`, `forsidensDom`, `AdvisorDashboard` ≈ 51 kB), `budgetTemplates`/`budgetEngine`/`importEngine`/`importGitterModel` (≈ 38 kB), `react-day-picker`+`date-fns` (≈ 60 kB), Sentry (≈ 140 kB) | Ansøgeren fra webinaret (tragten, kortet `m28-tragten-foer-skemaet`) venter på ≈ 400 kB gzip JS + parse, som skemaet ikke bruger. Forventet: `/ansoeg` ned til ca. 200–230 kB gzip (react-dom + supabase + sentry + skemaet). | M | `src/App.tsx:16-24`: gør `Index`, `Auth`, `Betal`, `Ansoeg`, `AnsoegPersondata`, `AnsoegStatus`, `Aftale`, `ResetPassword` til `lazy(...)`. I `src/pages/Index.tsx:8-10`: `lazy` for `BoardroomView` og `RaadgiverForsideView` hver for sig, så medlemmet ikke henter rådgiverens dom og omvendt. |
| 5 | **Rådgiverforsiden henter hele huset i browseren**: 18 kald i ét `Promise.all` (`AdvisorDashboard.tsx:195`), heraf seks `hentAlleSider`-løkker der henter 1.000 rækker ad gangen i SERIE (`budgetEngine.ts:520-533`) — `budget_targets` (4.808 rækker → 5 sekventielle sider, `:393`), `financial_report_facts` med hele `metrics`-jsonb for alle virksomheder og alle perioder (`:253`), `conversations`, `companies`, `milestones`, `company_members` | Den langsomste gren i `Promise.all` bestemmer skelettet: 5 sider × 0,37 s ≈ **1,9 s** alene for budget_targets. Nyttelasten vokser hver måned. | M | Kort sigt (S): budget_targets-hentningen skal kun bruge «budgetteret omsætning pr. virksomhed pr. periode» — filtrér på indeværende/relevante perioder, eller hent side 2..n parallelt når `count` kendes (`select(..., {count:'exact'})` på første side). Rigtigt (M): én `SECURITY DEFINER`-RPC `hent_raadgiver_forside()` der returnerer de aggregerede tal (seneste facts pr. virksomhed, budget-sum pr. virksomhed/periode, tællinger) — én rundtur, lille svar. Dommen (`forsidensDom.ts`) bliver hvor den er. |
| 6 | **Google Fonts via `@import` inde i den bundtede CSS** — tre kæde-importer, fem familier (`src/index.css:1-2`, `src/styles/hjemmebane.css:6`), ingen `preconnect` i `index.html` | Render-blokerende kæde: HTML → CSS (128 kB / 21,7 kB gzip) → fonts.googleapis.com (ny forbindelse) → fonts.gstatic.com (ny forbindelse). Typisk 200–600 ms på første tekst. | S | Flyt til `<link rel="preconnect" href="https://fonts.googleapis.com">` + `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` + ÉN `<link rel="stylesheet">` i `index.html`. Drop `Space Grotesk` og `Inter` fra importen (kun fallback i `tailwind.config.ts:17-18` — Space Grotesk bruges kun i mail-HTML i `EmailTemplatesView.tsx:175-221`, som mailklienten selv renderer). Skær vægte til de brugte (Manrope 300–700 ×5 er sandsynligvis for mange — skal tælles). |
| 7 | **Skallen (`HbMemberShell`) monteres pr. side** (39 sider rendrer `<HbMemberShell>` selv) → ved hver navigation: klokkens `notifications`/`advisor_notifications` hentes igen (useState, ikke TanStack — `useNotifications.ts:36`, `useAdvisorNotifications.ts:22`), realtime-kanalen lukkes og åbnes, presence-kanalen `untrack`/`join` (`onlineTracking.ts:40-55`), og `useTjeklisteLukket` henter `profiles` igen (`useTjeklisteLukket.ts:66-85`) | 3 kald + 2 kanal-joins pr. navigation; presence-flimmer (leave/join) på rådgiverens «online»-visning | M | Kort sigt (S): flyt klokkens to hooks og tjekliste-flaget til `useQuery` med staleTime (cachen overlever afmontering), og realtime-handleren til `queryClient.invalidateQueries`. Rigtigt (M): gør skallen til en layout-route (`<Route element={<HbMemberShellLayout/>}>` med `<Outlet/>`), så den monteres én gang. |
| 8 | **Manglende indekser (ifølge migrationerne) på varme filtre**: `messages(conversation_id, created_at)` — kun `svar_paa_id` er indekseret; chatten henter `eq(conversation_id).order(created_at).limit(500)` (`MemberChatPane.tsx:295-299`), forsiden tæller ulæste pr. samtale (`BoardroomView.tsx:1755-1760`). Også: `conversations(company_id)`, `milestones(company_id, status)`, `advisor_notifications(advisor_id/created_at)` generelt, `pulse_checkins(company_id, created_at)` | Afhænger af tabelstørrelse — umålt. Vokser lineært med antal beskeder. | S | Én migration med `CREATE INDEX IF NOT EXISTS` for de fire — men FØRST `pg_indexes` + `pg_stat_user_tables` i prod (se «Måling» nedenfor); Lovable kan have oprettet dem uden migration. |
| 9 | **Store billeder på hver side**: `src/assets/topix-icon-green.png` er **2000×1805 px / 69 kB** og vises som lille logo i `HbSidebar.tsx:4` (alle medlems-/rådgiversider). `public/morten-larsen.jpg` **1035×830 / 222 kB** og `jonas-herlev.png` 131 kB i rådgiverportrætterne (`HbRaadgiverPortraetter.tsx:17-18`, `BookSessionView.tsx:208`). Kun 8 af 72 `<img>` har `loading`/`decoding` | ≈ 350–400 kB billeder, der kan være ≈ 30 kB | S | Eksportér logoet i 2× visningsstørrelse (fx 96×87) som webp/png; portrætter i 2× visningsstørrelse som webp (`<picture>`), `loading="lazy" decoding="async"` under folden, `width`/`height` sat. `jonas-hi.png` (1,5 MB)/`morten-hi.png` (0,8 MB) bruges kun til certifikateksporten — lad dem være. |
| 10 | **Ingen vendor-opdeling af hoved-chunken** — hver deploy (Lovable «Update») skifter hash på hele 400 kB gzip, så hvert medlem henter react-dom/supabase/sentry igen | Genbesøg efter deploy: ≈ 250 kB gzip der kunne ligge i browser-cachen | S | `vite.config.ts`: `build.rollupOptions.output.manualChunks` med `react` (react, react-dom, react-router-dom), `supabase` (@supabase/*), `sentry` (@sentry/*), `query` (@tanstack/*). Kombinér med #4. Overvej `Sentry.lazyLoadIntegration("browserTracingIntegration")` i `src/main.tsx:21-27`. |

---

## 1. Bundle (målt: `bunx vite build`, 34,9 s, 146 filer)

**Hoved-chunk** `index-*.js`: **1.317,47 kB / 400,09 kB gzip**. `index.html` har ingen `modulepreload` — entry-chunken har ingen statiske imports, alt eager-kode ligger i den ene fil. CSS `index-*.css`: 127,9 kB / 21,7 kB gzip.

Største chunks (kB / gzip kB):

| Chunk | Størrelse | Gzip | Indhold | Lazy? |
|---|---|---|---|---|
| index (entry) | 1.317 | 400 | se nedenfor | NEJ |
| xlsx | 429 | 143 | xlsx 0.18.5 | ja |
| AreaChart | 376 | 104 | recharts 230, lodash 27, d3 | ja |
| pdf | 361 | 106 | pdfjs-dist | ja (+ `pdf.worker` 2,2 MB, kun ved PDF-upload) |
| jspdf | 357 | 118 | jspdf | ja |
| index-DSS4 | 329 | 105 | tiptap/prosemirror | ja |
| html2canvas | 201 | 48 | html2canvas | ja |
| Virksomhed | 160 | 47 | virksomhedssiden (+ lidt recharts) | ja |
| index.es | 151 | 52 | canvg + core-js (jspdf-afhængighed) | ja |
| CompanyChatPane | 151 | 46 | chatten + dompurify | ja |
| Rapportering | 108 | 31 | | ja |
| AdminContent | 98 | 24 | | ja |
| Budgettering | 93 | 26 | | ja |

→ pdfjs-dist, xlsx, tiptap, recharts, jspdf, html2canvas ligger **IKKE** i hoved-chunken. Godt.

**Hoved-chunkens indhold** (sourcemap-opgørelse, 1.279 kB kildebytes): egen kode 533 kB, biblioteker ≈ 750 kB.
- react-dom 127 · @supabase/auth-js 86 · realtime-js 35 · storage-js 19 · postgrest-js 14 · supabase-js 7
- **Sentry ≈ 138** (@sentry/core 83, browser 27, browser-utils 28)
- @tanstack/query-core 36 · sonner 32 · date-fns 31 · react-day-picker 30 · lucide-react 23 · tailwind-merge 20 · @radix-ui/react-toast 11 · player.js (Vimeo) 13 · floating-ui 15
- Egen kode, største: `BoardroomView.tsx` 49 · `RaadgiverForsideView.tsx` 20 · `forsidensDom.ts` 16 · `AdvisorDashboard.tsx` 15 · `App.tsx` 12,5 · `budgetTemplates.ts` 12 · `budgetEngine.ts` 11 · `Auth.tsx` 10 · `handoutConfig.ts` 9 · `OpgavelisteView.tsx` 9 · `HbMaalRaekke.tsx` 8,5 · `MembershipExpiredGate.tsx` 8,4 · `Betal.tsx` 8,3 · `importEngine.ts` 7,9 · `importGitterModel.ts` 7,7 · `Aftale.tsx` 7,7 · `lib/ansoegning/*` ≈ 29 · `adminContentApi.ts` 7,3

**Ruter der IKKE er lazy** (`src/App.tsx:16-24`): `Index` (`/` — trækker begge forsider med), `Auth`, `ResetPassword`, `Betal`, `Ansoeg`, `AnsoegPersondata`, `AnsoegStatus`, `Aftale`, `NotFound`, samt `InvitationTilLoggetInd` (`:13`). Alle øvrige ~60 ruter er `lazy`.

`react-day-picker`/`date-fns` trækkes eager ind af `BoardroomView.tsx:34` (`import { Calendar }`) — kalenderen bruges i en overlejring og kan lazy-loades.

## 2. Data

**N+1 / sekventielle kald**
- `src/components/AppLayout.tsx:47-63` — ÆGTE N+1: op til 10 `count`-kald i en `for`-løkke, én samtale ad gangen, hvert 60. s (`refetchInterval`), for mobile medlemmer. AppLayout bruges kun af `AnnualBaseline`, `LegatDashboard`, `PulseCheckin` (lav rækkevidde). Rettelse: ét kald `.in("conversation_id", ids)` (som `AppSidebar.tsx:207-216` allerede gør).
- `BoardroomView.tsx:1751-1760` — tre kald i serie (samtale → brugerbeskeder → agentbeskeder); de to tællinger kan køre i `Promise.all`. Sparer én rundtur (≈ 0,37 s) på ulæst-mærket.
- `BoardroomView.tsx:2110-2123` og `:2134-2193` — to små vandfald: events → værter, community-feed → medlemsregister (`enabled` afhænger af forrige). Acceptabelt; værter kan joines i events-forespørgslen.
- `budgetEngine.ts:520-533` `hentAlleSider` — sider i serie (se top-10 #5). Bruges også i medlemmets budgetflade.
- `budgetEngine.ts:538-541` — sletning i bidder à 200 i serie (skrivevej, ikke load).
- `useAuth.tsx` — se top-10 #1–#3.

**`select("*")`** — 33 forekomster i `src/`. De der rammer load-stier: `akademiApi.ts:178-186` `listAllUpcomingEvents` (`events` med `*`, ALLE publicerede events inkl. fortid, filtreret i klienten — tilføj `.gte("starts_at", <nu − varighed>)` og kolonneliste; kaldes af skallen på hver side, `HbMemberShell.tsx:186-192`), `useNotifications.ts:38-44`, `useAdvisorNotifications.ts:25-29`, `useMessageReactions.ts:37`, `useCompanyCommentary.ts:37`, `hooks/ansoegninger.ts:165`, `useMilestones.ts:103`, `BookSessionView.tsx:125`. Øvrige er admin-flader (`adminContentApi.ts` ×5, `EmailTemplatesView.tsx:787/897`, `EmailLogView.tsx:144`, `ReportDebugView.tsx:189`, `VirksomhedMailLog.tsx:76`). `count`/`head: true`-kald med `*` (`BoardroomView.tsx:1755/1758`, `AppLayout.tsx:56`) er harmløse.

**Manglende `.limit`** på voksende tabeller i load-stier: `listAllUpcomingEvents` (ovenfor); `AdvisorDashboard` facts/budget/conversations/companies/milestones/company_members (bevidst uden loft, pagineret — se #5); `FeedbackView.tsx:187` (admin). Chatten har `limit(500)` (`MemberChatPane.tsx:198/299`, `CompanyChatPane.tsx:446`) — 500 beskeder pr. åbning er meget; overvej 100 + «hent ældre».

**Hent-alt hvor et aggregat ville gøre**: `AdvisorDashboard.tsx:253` (hele `financial_report_facts.metrics` for at finde seneste periode pr. virksomhed + «findes der nogen»), `:393` (alle `budget_targets`-omsætningsrækker for at summere), `:376-386` (`company_actions` limit 5000 og `financial_reports` limit 5000 for at tælle). Alle er kandidater til den ene RPC i #5.

**Indekser** (138 `CREATE INDEX` på 62 tabeller i migrationerne, parset; PK/UNIQUE talt med):
- `messages`: KUN `svar_paa_id` + PK. Mangler `(conversation_id, created_at desc)`; filtre på `read_at`/`message_type` → evt. partielt indeks `WHERE read_at IS NULL`.
- `conversations`: `member_id UNIQUE`, intet på `company_id` (filtreres i `BoardroomView.tsx:1751`, `useVirksomhed.ts`).
- `milestones`: kun PK. Filtreres på `company_id` + `status` (`BoardroomView.tsx:1597`, `AdvisorDashboard`).
- `advisor_notifications`: kun et partielt indeks til klokke-mail-cronen. Klokken læser `order(created_at desc).limit(30)` under RLS.
- `pulse_checkins`: `UNIQUE(company_id, period_key)` dækker `company_id`-filtre.
- `company_members`: `UNIQUE(company_id, user_id)` — `user_company_id(uid)` filtrerer på `user_id` alene → seq scan (kortet om RLS-initplan: 28 rækker, billigt; løftestangen er antal kald).
- `budget_targets`: `UNIQUE(company_id, user_id, category, period)` dækker medlemmets opslag; rådgiverens `eq(category)` på tværs har intet — ligegyldigt ved 4.808 rækker, hvis #5 laves.
- `events(status, starts_at)` findes.
**Alt ovenfor er migrationshistorik, ikke prod.** Se måling nedenfor.

**TanStack Query**: global `staleTime: 60_000` er sat (`App.tsx:106-109`, 20/9) — fokus-stormen er løst. Tilbage: `RapporteringView.tsx:92,135,169` lægger `refreshKey` i query-nøglen og tæller den op hvert 5. s mens en rapport er «processing» → en ny cache-post hvert 5. s (op til 60 levende poster i gcTime), og en rapport der hænger i «processing» poller for evigt. Rettelse: `refetchInterval: (q) => harProcessing(q.state.data) ? 5000 : false` på én fast nøgle.

**Realtime**: alle 10 `.channel(...)` ryddes op (`removeChannel`/`unsubscribe` i cleanup) — ingen lækage. Men:
- `useAdvisorNotifications.ts:39` og `AdvisorNotifications.tsx:45`: INSERT på `advisor_notifications` UDEN filter → hver ny klokke til en hvilken som helst rådgiver udløser en fuld genhentning hos alle rådgivere (RLS afgør levering — hvis rådgivere kan se hinandens rækker, rammer det alle). Tilføj `filter: advisor_id=eq.${user.id}`, hvis tabellens semantik tillader det.
- `AppSidebar.tsx:230-236` (legacy-skal): `event: "*"` på hele `messages` (medlem) eller `conversations` (rådgiver) uden filter → hver besked i huset udløser `fetchUnread` (2 kald). Effekten afhænger igen af RLS på realtime-leveringen.
- `CompanyChatPane.tsx:564`: UPDATE på `conversations` uden filter — lokal state-opdatering, billigt.
- Skallens remount-effekt på kanaler: top-10 #7.

## 3. Første indlæsning

**Fælles (før noget kald):** HTML → `index-*.js` (400 kB gzip, parse) + CSS → Google Fonts-kæden (#6). `Sentry.init` med `browserTracingIntegration` synkront i `main.tsx:21-27`.

**Medlem** (`/`), målt i koden:
1. `getSession()` (lokal) + `onAuthStateChange(INITIAL_SESSION)` → `setTimeout(0)` → `fetchUserData`.
2. Rundtur 1: `user_roles` ∥ `profiles` ∥ `company_members+companies(id,name)` (`useAuth.tsx:184`).
3. Rundtur 2: `legat_enrollments` (`:201-207`).
4. Rundtur 3: `companies` (tier) (`:228` → `afgoerMedlemsTier`).
5. Rundtur 4: `companies` (onboarding_completed) (`:236-240`).
6. `loading=false` → `MemberRoute` → `Index` → `HbMemberShell` + `BoardroomView`: parallelt ≈ 21 `useQuery` i BoardroomView + `useOnboardingTjekliste` (≈ 10 opslag i ét `Promise.all`, `useOnboardingTjekliste.ts:91-140`) + skallen (`events`, `useCertificate`, `profiles` for tjekliste-flag, `notifications` + realtime, presence-join) + `app_config` (session-timeout, `useAuth.tsx:76-90`) + fire-and-forget `log_user_login`. To små vandfald bagefter (værter, medlemsregister) og tre-leds-kæden for ulæste.
→ **Kritisk sti ≈ 4 rundture auth + 1–3 rundture forside ≈ 5–7 × 0,37 s ≈ 1,9–2,6 s** efter JS er parset. Med #1: ≈ 2–4 rundture.

**Rådgiver** (`/`):
1–2. Som ovenfor, rundtur 1.
3. Ingen `company_members` → `await supabase.auth.getUser()` (netværk, `:265`).
4. `await functions.invoke("process-pending-invitation")` uden timeout (`:285-288`) — internt `getClaims` → `admin.getUserById` → `company_members` → `company_invitations` (token) → `company_invitations` (email) i serie (`supabase/functions/process-pending-invitation/index.ts:32-115`) + mulig koldstart.
5. `loading=false` → `RaadgiverForsideView`: hovedqueryen `hentAdvisorDashboard` (18 kald, heraf seks sideløkker; skelettet venter KUN på den, `RaadgiverForsideView.tsx:450-455`) ∥ syv mindre queries (`:459-530`) + klokke + skallen.
→ Uden koldstart ≈ 0,37 + 0,37 + 0,5–0,8 + (0,37 × 5 sider budget_targets) ≈ **3,1–3,4 s**. Det er MERE end kortets regnestykke (1,7–2,1 s), fordi sideløkken i budget_targets er serie — 4.808 rækker = 5 sider. **Skal bekræftes i browseren** (se nedenfor).

## 4. Edge functions

- 113 functions; næsten alle importerer kun `esm.sh/@supabase/supabase-js@2.97.0` — lette. Tunge imports: `npm:xlsx` — `genkoer-rapport/index.ts:48` statisk (hele xlsx ved hver koldstart), `extract-financial-data/index.ts:471` dynamisk (godt — kun ved XLSX). `auth-email-hook/index.ts:1-3` trækker `npm:react` + `npm:@react-email/components` + `email-js` — auth-mails (login-link, nulstilling) betaler React-rendering ved koldstart. `npm:pdf-lib` i `_shared/underskriftPdf.ts`. `npm:@lovable.dev/email-js` via `_shared/managedEmail.ts`/`mailFejl.ts` m.fl. — importeret af 19 functions; hver af dem betaler email-js' opstart, også når der ikke sendes mail.
- **`process-pending-invitation`**: 5–6 sekventielle kald; `admin.getUserById` (`:57`) kan erstattes af `email` fra JWT-claims (`getClaims` giver `email`), og token-/email-opslaget i `company_invitations` (`:88-115`) kan være én `.or(...)`. Vigtigst er dog at rådgivere ikke kalder den (top-10 #2).
- **Kolde starter**: to edge-kald ligger på load-stier — `process-pending-invitation` (rådgiver, hver load) og `get-community-billed-url` (medlemsforsidens fremhævede opslag, `BoardroomView.tsx:177-185`; community-feedet ét kald pr. billede). `get-video-embed` ved velkomst-/ugevideo. Koldstarttid er IKKE målt.
- Community-billeder: ét edge-kald pr. billede (`communityApi.ts:262`). Et batch-endepunkt (liste af stier → liste af signerede URL'er) ville samle dem.

## 5. Billeder, video, fonte

- `src/assets/topix-icon-green.png` 2000×1805 / 69 kB (sidebar-logo, hver side) og `topix-icon-white.png` 66 kB.
- `public/morten-larsen.jpg` 1035×830 / 222 kB, `public/morten-hesselholt.jpg` 222 kB (byte-ens kopi, se nederst), `jonas-herlev.png` 300×283 / 131 kB (PNG til et foto).
- `jonas-hi.png` 1,5 MB / `morten-hi.png` 0,8 MB: kun certifikateksporten (`certifikat/parts.tsx:11-12`) — fint, men certifikatsiden bør ikke vise dem i fuld størrelse på skærm.
- `pdf.worker-*.mjs` 2,2 MB: hentes kun ved PDF-upload (godt).
- Fonte: 5 familier via 3 `@import` i CSS; ingen `preconnect`; `display=swap` er sat (godt). Parkinsans bruges 8 steder (`font-brand`), Fraunces 206 (`font-editorial`), Manrope er `display`/`body`. Space Grotesk og Inter er kun fallback → fjern fra importen.
- `<img>`: 72 i `src/`, 8 med `loading`/`decoding`. Vimeo `player.js` (13 kB) ligger i hoved-chunken via velkomstvideoen.

---

## Kræver måling (præcist hvad)

**A. Browser — Chrome DevTools, Network (Disable cache, «Fast 4G»-throttling og uden), Performance-panelet:**
1. `/ansoeg` i privat vindue: tid til første skema-felt (LCP) og overførte JS-bytes. Før/efter #4.
2. Medlem, hard reload på `/`: Network-vandfaldet fra `index-*.js` til sidste `rest/v1`-kald. Notér: tiden fra `/rest/v1/user_roles` til første `BoardroomView`-kald (= auth-kæden, forventet 4 rundture), og antal kald i alt.
3. Rådgiver, hard reload på `/`: samme, plus (a) varighed af `functions/v1/process-pending-invitation` (to målinger: første load efter 10 min pause = koldstart, og straks efter = varm), (b) antal og tidsforløb af `budget_targets?...offset=`/`Range`-kald — står de i trappe (serie)? (c) tid til skelettet forsvinder.
4. Faneskift: stå på `/`, skift til en anden fane i > 30 s, kom tilbage. Tæl kald i Network. Forventet (ifølge koden): `user_roles`, `profiles`, `company_members`, … og for rådgiver `process-pending-invitation` + `log_user_login`. Det bekræfter/afkræfter #3.
5. Navigation medlem `/` → `/kpis` → `/`: tæl `notifications`, `profiles?select=notification_email_prefs` og websocket-frames `phx_join`/`presence` pr. skift (#7).
6. Performance-panelet på `/` (medlem og rådgiver): «Evaluate Script» for `index-*.js` (parse/compile ms) og Long Tasks > 50 ms.
7. Lighthouse (mobil) på `/auth` og `/ansoeg`: LCP, TBT, «Eliminate render-blocking resources» (fontkæden).

**B. Lovable SQL editor (ét resultatsæt, UNION ALL):**
- Indekser der findes i prod på de nævnte tabeller: `select tablename, indexdef from pg_indexes where schemaname='public' and tablename in ('messages','conversations','milestones','advisor_notifications','pulse_checkins','budget_targets','financial_report_facts','events')`.
- Størrelser: `select relname, n_live_tup, pg_size_pretty(pg_total_relation_size(relid)), seq_scan, idx_scan from pg_stat_user_tables where relname in (...samme...)`.
- Svarstørrelse af forsidens facts-hentning: `select count(*), pg_size_pretty(sum(pg_column_size(metrics))::bigint) from financial_report_facts`.
- `pg_stat_statements` top 20 efter `total_exec_time` og efter `calls` (afgør om `messages`-tællingerne og `user_company_id` er værd at indeksere).

**C. Edge-log (Lovable → Functions → process-pending-invitation → Logs):** «boot time»/cold start-linjerne og execution time for de sidste 50 kald.

---

## Øvrige fund (kort)

- `useAuth.tsx:400-404`: `getSession().then(...)` sætter session/user oven i `INITIAL_SESSION`-handleren → dobbelt render ved start (ufarligt, men unødigt).
- `AuthContext`-værdien er et nyt objekt ved hver render (`useAuth.tsx:419+`) → alle `useAuth()`-forbrugere re-rendrer ved hver state-ændring i provideren. `useMemo` på værdien.
- `HbSidebar` (desktop) er monteret også på mobil (CSS-skjult) og draweren monterer en anden `HbKlokke` når den åbnes → to instanser, to kanaler med samme navn (`notifications-v2`) mens draweren er åben.
- `useOnboardingTjekliste.ts:91-140`: ≈ 10 opslag for tjeklisten på hver forside-load for medlemmer (parallelle, staleTime 60 s) — overvej én RPC, når tjeklisten er stabil.
- `CompanyChatPane.tsx:443-446` / `MemberChatPane.tsx:195-198`: `messages` `order(created_at).limit(500)` UDEN samtalefilter (indbakke-oversigten) — kræver indeks på `created_at` for ikke at sortere hele tabellen under RLS.
- `public/morten-hesselholt.jpg` er byte-ens med `morten-larsen.jpg` (målt med `cmp`) og refereres ikke fra `src/`, `supabase/` eller `index.html` — kan være linket udefra (mails, theboardroom.dk); tjek før sletning.
- `xlsx` 0.18.5 (npm-versionen) — ikke ydeevne, men den er forældet; SheetJS udgiver nyere versioner fra eget CDN.
