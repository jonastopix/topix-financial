# Mangellisten — domme over alle åbne fejl-kort (30/9-2026)

Grundlag: `docs/mangelliste.html` på `origin/main` `49d5218` (#1156). 21 elementer med `data-status="fejl"`; det ene (L1014) er skabelonen i «SÅDAN TILFØJER MAN ET KORT» og tæller ikke. **20 kort** er dømt nedenfor. Alt er målt i KODEN i dag (fil:linje på `49d5218`); intet er målt i prod — hvor prod afgør det, står SELECT'en.

Rettet på den lokale gren `fix/mangelliste-fejl-30-09-b` (ikke pushet; `fix/mangelliste-fejl-30-09` fandtes allerede og er checket ud i en anden worktree, `agent-a332026f49c366923`, så navnet fik et `-b`): se «Rettet» under hvert kort.

---

## 1. `m28-invitationsopslag-haenger` — STADIG FEJL → RETTET
- **Fundet:** `src/pages/Auth.tsx:111-139` kaldte `lookup_invite_company_info` uden frist og uden `.catch`; `:224-225` tegnede `HbSpinner` så længe `opslag === "venter"`. Andet sted på vejen ind: `src/hooks/useAuth.tsx:285-288` awaitede `process-pending-invitation` uden frist.
- **Rammer:** medlemmer (og rådgivere, andet sted), der åbner et invitationslink / logger ind, NÅR svaret udebliver. Hyppighed: kun ved hængende net/blokeret domæne — sjældent, men ved et udfald ALLE på vejen ind samtidig.
- **Rettet:** `8b44f44` (Auth: `medFrist`, 10 s → dommen «fejl» = signup-formen som ved et fejlet svar; `.catch` → «fejl») og `9cf9e06` (useAuth: `timeout: PPI_FRIST_MS` = 15 s → `markerFejl` → `CompanyLinkFailedGate` med «Prøv igen»; rådgiveren går videre).

## 2. `m28-nyhedsbrev-utm-felter` — KAN IKKE AFGØRES HER (sitet, ikke repoet)
- Formularen bor på topix.dk (site-repo #4/#5), ikke i `topix-financial`. Grep i dette repo efter Klaviyos `client/subscriptions` fra en formular: intet. Rammer ingen medlem/rådgiver (profilfelter i Klaviyo).
- Måling (Klaviyo, ikke SQL): profiler oprettet af `$source = "topix.dk footer"` med `utm_source` sat — Klaviyo-segment/eksport.

## 3. `m16-invitation-spaerret` — ALLEREDE RETTET I KODE (#915), bevis i drift udestår
- `supabase/functions/send-invitation-email/index.ts:198-208` svarer `spaerret: true/false`. Rammer rådgiveren (klokke/tekst), sjældent (kun spærrede adresser).
- SELECT: `SELECT created_at, recipient_email, status, template_name, error_message FROM email_send_log WHERE template_name ILIKE '%invit%' AND status IN ('suppressed','bounced','complained','failed') AND created_at > '2026-09-16 11:37+00' ORDER BY created_at DESC LIMIT 20;` — og for hver: `SELECT type, title, created_at FROM advisor_notifications WHERE type = 'invitation_fejlet' AND created_at > '2026-09-16 11:37+00' ORDER BY created_at DESC LIMIT 20;`

## 4. `m16-invitation-tak` — ALLEREDE RETTET I KODE (#917), bevis udestår
- `send-invitation-email/index.ts:37-38, :87-92, :164` + `_shared/sikrIndgangsInvitation.ts:230-239` (kun Stripe-vejen sender `efter_betaling: true`, og kun service role kan sige det).
- SELECT: `SELECT created_at, recipient_email, subject, template_name, metadata FROM email_send_log WHERE template_name ILIKE '%invit%' AND created_at > '2026-09-16 12:04+00' ORDER BY created_at DESC LIMIT 30;` (tekstens «Tak for din betaling.» står ikke i loggen — beviset er mailen selv i indbakken for én import- og én Stripe-invitation).

## 5. `n14-4` (#883, `contact_person` fra importen) — RETTET I KODE, udrullet 22/9; bevis = næste rigtige import
- `supabase/functions/_shared/virksomhedsraekke.ts:113-116, :223-227` (`contact_person: bygKontaktperson(input.contact_name)`).
- SELECT: `SELECT id, name, contact_person, created_at FROM companies WHERE created_at > '2026-09-22 14:20+00' ORDER BY created_at DESC LIMIT 20;` — `contact_person` skal være udfyldt for import-rækker.

## 6. `m16-economic-doed` — BESLUTNING (penge/bogføring), ikke kode
- Uden for §2c (penge/Stripe). Ingen kode i repoet at rette; rammer bogholderi, ikke medlem/rådgiver på fladen.

## 7. `m16-download-uden-tal` — STADIG (kosmetisk), ikke rettet
- `src/components/hjemmebane/noegletal/NoegletalView.tsx:597, :606` — knapperne er `disabled` ved `monthlyData.length === 0`, men vises. Rammer nye medlemmer uden tal på /kpis (hver ny konto indtil første rapport). Ingen funktionsfejl. Jonas 22/9: «senere».

## 8. Budgettets tre skjulte fejl (uden id) — (2) løst; (1) kræver prod; (3) STADIG, rammer ingen flade
- (2) løst: `get_my_group_budget_summary` droppet i `20260805224500_drop_koncern_objects.sql:44`.
- (3) stadig: `supabase/functions/run-company-agent/index.ts:~483-509` matcher `metrics`-nøgler (engelske) mod `budget_targets.category` (danske) → tomt svar. Rammer agentens forslag (tør kørsel), ikke en flade.
- (1) SELECT: `SELECT company_id, category, period, count(DISTINCT user_id) AS brugere, count(*) FROM budget_targets GROUP BY 1,2,3 HAVING count(DISTINCT user_id) > 1 ORDER BY 5 DESC LIMIT 50;`

## 9. `a29-vedhaeftning-slettes-ikke` — STADIG FEJL, ikke rettet (§3)
- `src/hooks/useMessageActions.ts:78-106` sletter rækken (og en chatvideo hos Bunny), aldrig filerne i `chat-attachments`. Repoets DELETE-politik tillader afsenderen at slette egne filer (`20260317133757_…sql:19-22`), men prods politik er IKKE målt (29/9-lærestregen: repo ≠ prod).
- Ikke rettet: at lade en sletning også slette filer er «ændring af en eksisterende funktions opførsel over for rigtige data» og kan ikke rulles tilbage → §3, Jonas først.
- SELECT (hvor mange filer står uden besked): `SELECT count(*) AS forladte, pg_size_pretty(sum((o.metadata->>'size')::bigint)) AS stoerrelse FROM storage.objects o WHERE o.bucket_id = 'chat-attachments' AND NOT EXISTS (SELECT 1 FROM public.messages m, jsonb_array_elements(COALESCE(m.context_meta->'attachments','[]'::jsonb)) a WHERE a->>'path' = o.name OR a->>'url' LIKE '%/chat-attachments/' || o.name);` og politikken: `SELECT policyname, cmd, qual FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname ILIKE '%chat attach%';`

## 10. `w13` (gæst i Community) — STADIG, ikke rettet (to læsninger)
- Kortet siger både «gæster ser Community» (Jonas 14/9) og «i dag ser de en tom liste» (RLS `har_aktivt_medlemskab` er fail-closed på NULL `contract_end_date`). At de SER kræver en ændring i en SQL-dom (migration, adgang bredere → §3); at de kun møder en grænse i composeren er en anden læsning. Rammer to gæster (kortets tal).
- SELECT: `SELECT c.id, c.name, c.contract_end_date, c.is_legat, count(cm.user_id) AS medlemmer FROM companies c JOIN company_members cm ON cm.company_id = c.id WHERE c.contract_end_date IS NULL AND c.is_legat IS NOT TRUE AND c.status = 'active' GROUP BY 1,2,3,4;`

## 11. `m16-brugbar-er-kunde` — (#916-delen) rettet, bevis på skærm udestår; legat-delen STADIG FEJL → RETTET
- `src/lib/hjemmebane/adminContentApi.ts:474` filtrerede legat-medlemskaber fra FØR `udelukFraBrugbar` så dem → en ren legatmodtagers svar talte med. Rammer rådgivernes tal på Fremdrift-fanen; hyppighed ukendt.
- **Rettet:** `53709b0` (`companyErLegat` i stedet for filteret; `erKundeMedlemskab`; listen uændret via `synligeMedlemmer`).
- SELECT (har nogen legatmodtager svaret?): `SELECT count(*) FROM member_progress mp WHERE mp.brugbar IS NOT NULL AND mp.acknowledged_at IS NOT NULL AND EXISTS (SELECT 1 FROM company_members cm JOIN companies c ON c.id = cm.company_id WHERE cm.user_id = mp.user_id AND c.is_legat) AND NOT EXISTS (SELECT 1 FROM company_members cm JOIN companies c ON c.id = cm.company_id WHERE cm.user_id = mp.user_id AND NOT c.is_legat);`

## 12. To mails for samme 1:1-betaling (uden id) — STADIG, ikke rettet (Stripe + mail til medlem)
- `supabase/functions/stripe-webhook/index.ts:1668-1677` indsætter `session_booked` uden `email_sent_at`; `:1680-1709` mailer direkte. Rammer medlemmer, der køber en session (to mails). Uden for rammen (Stripe, mails til medlemmer). Jonas 22/9: «senere».
- SELECT: `SELECT n.user_id, n.created_at, n.email_sent_at FROM notifications n WHERE n.type = 'session_booked' ORDER BY n.created_at DESC LIMIT 20;`

## 13. Seks gamle komponenter på Hjemmebane-flader (uden id) — STADIG (design/konvergens), ikke rettet
- Designgæld (`index.html` bærer `class="dark"`; #685 som nødhjælp). Ikke en fejl med en afgrænset rettelse; kræver valg af rækkefølge (kortet selv).

## 14. `a22-forside-langsom` — DELVIST: led 4's frist rettet med m28 (`9cf9e06`); resten på hylden
- `src/hooks/useAuth.tsx:264` (`getUser`) og PPI-kaldet for rådgivere findes stadig; `AdvisorDashboard.tsx:195` 18 kald; `budgetEngine.ts:520-533` sideløkker. Jonas 22/9: «på hylden». At springe PPI over for rådgivere er ikke gjort.

## 15. `m17-migrationer-ikke-koert` — STADIG (bogføring), kan kun afgøres i prod
- `git grep -l "IKKE KØRT" -- supabase/migrations` = 57 filer (46 med linjen først). Rammer den, der kører migrationer (risiko for dobbeltkørsel). Hver skal måles: fx for en tabel `SELECT to_regclass('public.<tabel>');`, for en kolonne `SELECT 1 FROM information_schema.columns WHERE table_name='<t>' AND column_name='<k>';`, for en funktion `SELECT pg_get_functiondef('public.<fn>'::regproc);`, for et cron-job `SELECT jobname, schedule FROM cron.job;`.

## 16. `m16e-monday-body-foer-noegle` — STADIG, rammer ingen
- `supabase/functions/monday-webhook/index.ts:153` `await req.json()` før værnet (`:164-187`). Tom body → 500 i stedet for 401. Monday sender altid JSON. Ikke rettet (rammer hverken medlem eller rådgiver; kræver deploy).

## 17. `w14` (edge functions uden fejllæser) — STADIG (feature), ikke rettet
- Ingen `edge_fejl_log`; Stripe-mailen i Dashboard er umålt. Mellem-stor byggeopgave (migration + delt hylster), ikke en afgrænset fejl.

## 18. Tavse queryFn'er (uden id) — handouts/klokke (#928) + rabataftaler (#1126) i kode; admin-views STADIG → RETTET (tre af dem)
- `EventsView.tsx:153-157`, `ContentView.tsx:394-398` læste kun `isLoading` → en fejlet hentning = «Ingen events endnu» / «Området er tomt»; `HbMaterials.tsx:145` viste en tom liste. Rammer admin/rådgiver ved hentefejl (sjældent), og så opretter man dubletter.
- **Rettet:** `094b7a1` (`adminListeTekst`/`adminHentefejlTekst`). Tilbage med samme form (ikke nævnt på kortet): `PartnersView.tsx:165-169`, `EmailTemplatesView.tsx:1162`.
- #928/#1126 bevis: Update-status for #1126 er ikke målt herfra.

## 19. `n14-11` (mailloftet) — DRIFT/BOGFØRING, kan ikke afgøres i kode
- 429-grenen kan kun bevises af et rigtigt 429. SELECT: `SELECT date_trunc('hour', created_at) AS time, count(*) FILTER (WHERE status='rate_limited') AS rate_limited, count(*) AS i_alt FROM email_send_log WHERE created_at > now() - interval '14 days' GROUP BY 1 HAVING count(*) FILTER (WHERE status='rate_limited') > 0 ORDER BY 1 DESC;`

## 20. (L1014) — skabelonen, ikke et kort.

---

## Rettet (lokal gren `fix/mangelliste-fejl-30-09-b`, ikke pushet)
| sha | kort | én linje |
|---|---|---|
| `8b44f44` | m28-invitationsopslag-haenger | /auth: invitationsopslaget får 10 s frist og `.catch` — aldrig en evig spinner |
| `9cf9e06` | m28-invitationsopslag-haenger (andet sted) | useAuth: process-pending-invitation får 15 s frist → «Prøv igen»-gaten |
| `094b7a1` | Tavse queryFn'er (admin-views) | EventsView/ContentView/HbMaterials siger «kunne ikke hentes» i stedet for «tom» |
| `53709b0` | m16-brugbar-er-kunde | legatmodtageres svar tæller ikke i «Svar pr. lektion» |

Alle fire er `src/` → **Update i Lovable** efter merge. Ingen migration, ingen edge function, intet på FORBIDDEN-listen, intet om penge eller mails.
