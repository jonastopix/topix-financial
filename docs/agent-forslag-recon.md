# Recon: agentens skrive- og forslagsvej

Rå observationer, 2026-08-25. Ingen ændringer foretaget. Referencer er mod main
(a3175722). `run-company-agent/index.ts` forkortes herunder til `rca:`.
Prod-tal er ikke målt (Supabase MCP når ikke Lovable-prod); SELECTs til
Lovable SQL editor står hvor de er relevante.

---

## 1. Skrivevejene

Alle skrive-tools bor i `executeTool` i `supabase/functions/run-company-agent/index.ts`
og skriver med service-role-klienten (adminClient, rca:1001).

### write_chat_message (rca:474-543) — RAMMER MEDLEMMET
Insert i `messages`: conversation_id, sender_id, content, message_type,
context_type, context_meta.
- Default: system-besked — sender_id = medlemmets eget id, message_type='system',
  context_type='agent', context_meta={source:"run-company-agent", trigger, period_key}.
- `as_advisor=true` (rca:489-505): sender_id = conversations.assigned_advisor_id
  (fallback: FØRSTE bruger med advisor/admin-rolle, rca:492-498),
  message_type='user', context_type=null, context_meta=null — beskeden er i
  databasen **uskelnelig fra en menneskeskrevet rådgiverbesked**.
- Dedup (rca:512-527): kun én context_type='agent'-besked pr. (samtale, periode)
  for report_committed/anomaly_detected.

### write_session_prep (rca:660-711) — RAMMER KUN RÅDGIVEREN (UI-filter)
Insert/update i `messages`: content = "**Forbered til næste session:**\n1. …"
(maks 3 punkter), message_type='system', context_type='session_prep',
context_meta={source, points, period_key, generated_at}, sender_id = medlemmets
id (rca:702). Idempotent pr. (samtale, periode) — eksisterende række
OVERSKRIVES (rca:680-696). Rækken ligger i medlemmets egen samtale;
skjulningen er ren frontend: `CompanyChatPane.tsx:1368`
(`if (msg.context_type === "session_prep" && !isAdvisor) return null`).

### update_weekly_focus (rca:633-658) — RAMMER MEDLEMMET
Upsert i `weekly_focus` på (company_id, week_key): headline (maks 8 ord),
summary, status='active', triggers_fired=[trigger], trigger_data={trigger},
actions_generated=1, generated_at, expires_at=+8 dage. Vises på medlemmets
dashboard (BoardroomView.tsx / DashboardActionCenter.tsx) og i
rådgiveroverblikket (AdvisorCompanyOverview.tsx:313).

### write_company_action (rca:727-755) — RAMMER MEDLEMMET (som forslag)
Insert i `company_actions`: company_id, user_id (FØRSTE company_member,
rca:728-733), title (imperativ, maks 10 ord), context (maks 20 ord), priority
(high/medium/low), source_type='agent', **status='proposed'**,
expires_at=+14 dage (beregnUdloeb('agent'), `_shared/opgaveUdloeb.ts`).
Medlemmet ser forslaget og tager stilling (opgave-modellen, afsnit 6).

### notify_advisor (rca:592-631) — RAMMER KUN RÅDGIVEREN
Insert i `advisor_notifications`: type='agent_insight', title (trigger-afhængig
tabel rca:605-611), body=beskeden, company_id, member_id, advisor_id,
reference_type='agent'. Kun hvis der findes en assigned_advisor_id (rca:615).
Ingen Slack (rca:629-630: "Agent insight stays in-app only").

### create_milestone (rca:545-590) — RAMMER MEDLEMMET
Insert i `milestones`: company_id, user_id (første medlem), title, description,
category, deadline (+N dage), source='agent', progress=0, **status='active'** —
går direkte til aktiv, INGEN forslags-tilstand. Dedup på de første 3 ord af
titlen mod eksisterende aktive (rca:546-559).

### update_milestone_progress (rca:713-725) — RAMMER MEDLEMMET
Direkte update af milestones.progress (clamped 0-100) + status='completed' ved
100. `reason`-parameteren modtages (rca:276) men **skrives ingen steder**.

### finish (rca:757-759)
Skriver intet. `summary` returneres kun ind i tool-loopet og kasseres (afsnit 4).

**Opsummering af retning:** medlem direkte = write_chat_message,
create_milestone, update_milestone_progress, update_weekly_focus,
write_company_action (som forslag). Kun rådgiver = notify_advisor,
write_session_prep (skjult for medlem via UI-filter alene).

---

## 2. Triggerne

POOL_BLOCKLIST (rca:965-970) — håndhæves DOBBELT: filtreret ud af
tool-annonceringen (rca:971-974) OG afvist ved eksekvering (rca:1142-1151,
indført fordi "prompt-forbud alene virkede ikke — Gemini kaldte blokerede
tools alligevel, PR #63"):

| Trigger | Blokerede tools | Kaldes af |
|---|---|---|
| report_committed | write_chat_message, notify_advisor | ReportReviewDialog.tsx:306 + :443 (rådgiver committer rapport); reportCommit.ts:202; MemberDetail.tsx:1672 ("Kør agent"-knap); ReportDebug.tsx:402 (manuel test) |
| anomaly_detected | write_chat_message, notify_advisor | ReportReviewDialog.tsx:351 + :487 og reportCommit.ts:248 — kun hvis detect-financial-alerts returnerer alerts_written > 0 |
| pulse_submitted | write_chat_message, notify_advisor, write_company_action, create_milestone | **INGEN kaldere i repoet.** Kaldet blev fjernet i commit c912c1bf "fix(pulse): never invoke the agent on a reflection". Blocklist-rækken og prompt-grenen (rca:1052-1053) står tilbage |
| weekly_cron | write_chat_message, notify_advisor | run-weekly-agent (service-role fetch, run-weekly-agent/index.ts:66-79) |
| onboarding | (ingen — fuld pool) | useAuth.tsx:214-227 og Onboarding.tsx:94-104 — begge sætter companies.onboarding_completed=true FØR kaldet mod dublet-kørsler |

**run-weekly-agent** kører via `Deno.cron("weekly-company-agent", "0 7 * * 1", …)`
— selvplanlagt INDE i edge-funktionen (run-weekly-agent/index.ts:7), ikke
pg_cron (ingen migration nævner den). Ingen manuel HTTP-vej i koden: hele
kroppen ligger i cron-callbacken. Den looper aktive virksomheder (membership
ikke expired via computeMembershipTier, :19-21), springer virksomheder uden
committede facts over (:39-42), og "allerede kørt denne uge"-tjekket (:44-64)
tæller `messages` med context_type='agent' siden mandag — se afsnit 8 for
hvorfor det tjek aldrig kan finde noget længere. 2 sek. pause mellem
virksomheder (:84).

Begge functions har `verify_jwt = false` (config.toml:26-29);
run-company-agent validerer selv: service-role-nøgle-sammenligning (rca:906-908)
ELLER authenticateUser + RLS-tjek af company-adgang (rca:916-921, 979-993).

---

## 3. Kan den køres for én virksomhed?

To eksisterende manuelle enkelt-virksomheds-veje, begge med trigger
report_committed:

1. **MemberDetail.tsx:1655-1700** — "Kør agent"-knap pr. committet rapport i
   rådgiverens medlemsdetalje. Slår period_key op via facts og kalder
   run-company-agent. Toast: "Agent kørt ✓ — Tjek chatten for analysen."
2. **ReportDebug.tsx:388-427** — "Kør agent manuelt"-knap på
   `/admin/report-debug/:reportId` (AdminRoute, App.tsx:274). Egen tekst:
   "Kør agenten manuelt for denne rapport — nyttigt til test og fejlfinding."

Begge kører den **rigtige skrivevej**. Request-body'en parser kun company_id,
trigger, period_key, period_label (rca:923-924) — der findes ingen
dry_run-/preview-/no-write-parameter i funktionen. POOL_BLOCKLIST for
report_committed stopper chat-beskeden og advisor-klokken, men
update_weekly_focus, write_company_action, create_milestone og
update_milestone_progress er IKKE blokeret — en manuel kørsel kan altså
opdatere medlemmets fokus-kort, lægge et opgave-forslag på medlemmets
dashboard og oprette aktive milestones. Det eneste output der ikke når
medlemmet er write_session_prep (UI-filtreret) og notify_advisor (blokeret).

---

## 4. Hvad sker der med outputtet

Vejen fra model til række (rca:1073-1182):

1. `messages`-arrayet bygges i hukommelsen: SYSTEM_PROMPT + trigger-specifik
   user-besked (rca:1039-1063).
2. Loop, maks 12 iterationer (rca:1065): kald til Lovable AI-gateway, model
   `google/gemini-2.5-flash`, tool_choice auto (rca:1081-1093). Timeout 60 s,
   BEVIDST ingen retry ("a naive retry … could double-write", rca:1076-1078).
3. Assistant-svaret pushes på arrayet (rca:1118). Tekst-indhold uden tool-kald
   afslutter loopet (stopReason "no_tool_calls", rca:1120-1123) — **teksten
   gemmes ingen steder**.
4. Pr. tool-kald: JSON-parse af argumenter (fejl → {}), company_id
   TVANGSOVERSKRIVES med requestens verificerede id (rca:1136-1139), blokerede
   tools afvises med et resultat modellen kan læse (rca:1142-1151), ellers
   `executeTool` → rækken skrives MIDT i loopet. Tool-fejl returneres til
   modellen som {error} (rca:1152-1157).
5. `finish` sætter done; summary ender i toolResult (rca:757-759) og
   **forsvinder** — success-svaret (rca:1205-1207) indeholder kun
   {ok, iterations, done, produced_output, message_written}.
6. Succes-gate: `producedOutput` = mindst én ok write_chat_message ELLER
   write_session_prep (rca:1160-1168); ellers ok:false med stop_reason
   (rca:1184-1195).

**Ræsonnement gemmes ingen steder.** Hele messages-arrayet (overvejelser,
afviste tool-kald, tool-resultater) er kun i hukommelsen. Der findes ingen
agent_runs-/log-tabel (tabellisten i types.ts:16-2790 har ingen). Det eneste
der persisteres er selve de skrevne rækker plus deres
context_meta-brødkrummer. console.log/error (fx blokerede kald rca:1149,
gateway-fejl rca:1103) lander kun i Lovables edge-function-logs.
aiGatewayFetch logger intet (aiGatewayFetch.ts). En log over "hvad den
overvejede men ikke gjorde" findes ikke.

---

## 5. Rådgiverens nuværende indblik

- **notify_advisor** → `advisor_notifications`-rækker vises i klokken:
  AdvisorNotifications.tsx (mountet i AppSidebar.tsx:303, kun for advisors og
  kun når useNewNotifications er slået fra). Komponentens deep-link-grene
  dækker reference_type report/handout/chat/feedback
  (AdvisorNotifications.tsx:86-127) — reference_type='agent' har ingen gren.
  Bemærk: notify_advisor er blokeret for alle fire rutine-triggers og
  pulse_submitted kaldes ikke — kun onboarding kan producere disse rækker i dag.
- **write_session_prep** → vises i virksomhedens chat (CompanyChatPane.tsx),
  kun for advisors (:1368), med badge "Session-dagsorden" (:1415) og footer
  "Forberedelse til næste session med founder" (:1585-1590).
- **Agent-chatbeskeder** (context_type='agent', historiske) vises med
  "Var dette nyttigt?" Ja/Nej-knapper (CompanyChatPane.tsx:1558-1584) — se
  afsnit 6.
- **weekly_focus** vises også for rådgiveren i AdvisorCompanyOverview.tsx:313.
- Adskilt mekanisme med samme navn: MemberDetail.tsx:344-365 genererer
  session-punkter ON DEMAND via `ai-financial-feedback` med
  request_type='session_prep' — et andet kald end agentens write_session_prep,
  uden persistering i messages.

---

## 6. Godkendelsesmønstre der allerede findes

1. **Rapport-godkendelse (preview → menneske → commit).**
   `/admin/review-queue` (App.tsx:264, AdvisorRoute) = ReportReviewQueue.tsx:
   liste over behandlede rapporter med kvalitetsflag (Manual override,
   Validation fail, AI blocked m.fl., :37-73). Selve godkendelsen bor i
   ReportReviewDialog.tsx: RPC `get_report_commit_preview` (:122) viser
   præcis hvad der committes, mennesket godkender, RPC `commit_report_facts`
   (:251, :388) skriver. MemberDetail.tsx:1643-1649 linker "Godkend rapport →"
   dertil. Agent-kørslen affyres FØRST EFTER commit (:306).

2. **Opgave-modellen (maskinforslag → medlemsbeslutning).** Agentens
   write_company_action opretter status='proposed' med 14-dages expires_at.
   Medlemmet beslutter via tre Bucket A-edge-functions (PR #423):
   - `opgave-accepter`: medlemmet vælger selv dato; motoren
     (`_shared/opgaveEngine.ts`) dømmer overgangen; optimistisk lås på status.
   - `opgave-udskyd`: udskydelse ved forfald, maks 2 (B7), anden gang med
     valgt dato (B11).
   - `opgave-luk`: udfald ∈ {done, not_done, dropped, **dismissed**}
     (opgave-luk/index.ts:43-49; dismissed kræver status proposed,
     opgaveEngine.ts:167-172). **Der gemmes intet fritekst-felt med grunden**
     — kun udfalds-enum + closed_at. 'expired' er cronens tavsheds-udfald.
   Motorens `grund`-streng (OpgaveResultat, opgaveEngine.ts:78) bruges KUN
   til at afvise ulovlige overgange i svaret (409) — den persisteres ikke.

3. **Rådgiver-kvittering med note.** AdvisorAlertsPanel.tsx (mountet i
   AdvisorDashboard.tsx:18) skriver tre 1:1-tabeller, alle med
   `snoozed_until` + frit `note`-felt:
   - `advisor_milestone_actions` (note, snooze, actioned_by_advisor_id;
     UNIQUE på milestone_id — types.ts:156-193)
   - `advisor_financial_actions` (samme form, UNIQUE på notification_id —
     types.ts:94-128)
   - `advisor_company_acknowledgments` (note, snoozed_until, basis_at —
     types.ts:53-92)
   "Afvis"-knappen skriver en HARDCODED note: "Afvist — ingen handling
   nødvendig" + 365 dages snooze (AdvisorAlertsPanel.tsx:166-172); den
   almindelige håndtering gemmer fritekst-noten (:139-146).

4. **Binær feedback på agent-beskeder uden grund.** Ja/Nej på
   context_type='agent'-beskeder skriver context_meta.feedback='up'/'down'
   direkte på messages-rækken (CompanyChatPane.tsx:1558-1584). Ingen
   grund-tekst, ingen separat tabel.

5. **Manual override på rapportperiode.** financial_reports har
   manual_report_period_key/-label + manual_override_status; vises som flag i
   review-køen (ReportReviewQueue.tsx:38, :55) — mønstret "AI'ens dom kan
   tilsidesættes manuelt, og tilsidesættelsen er markeret".

---

## 7. Branche

`companies` har TRE branche-kolonner (types.ts, companies-Row):
`industry` (ældre, fri tekst), `industry_code`, `industry_label`.

Hvor de sættes:
- **Settings.tsx** (medlemmets selvbetjening): struktureret to-niveau-vælger
  `INDUSTRY_OPTIONS` (Settings.tsx:25-108) — 13 hovedkategorier med
  underkoder (fx consulting_finance, food_restaurant, trades_electrical).
  Gemmer industry_code + industry_label (:575-583) og auto-synker
  kpi_benchmarks fra industry_benchmarks når koden ÆNDRES (:592-600ff).
- **EditCompanyDialog.tsx** (rådgiver): industry_label er et FRIT
  tekstfelt (:161-162) — ingen vælger, ingen validering mod kodelisten.

`industry_benchmarks` (statisk tabel, migration 20260329190316:143-268):
**61 distinkte industry_codes**, hver med 2 kpi_keys (gross_margin_pct,
ebitda_margin_pct) og benchmark_value/min/max + dansk label. Håndskrevne
brancheintervaller, ingen kilde-reference ud over source_label-kolonnen.
Bruges af NoegletalView.tsx:347-359 (via companies.industry_code).

Agentens `get_industry_benchmark` (rca:784-853) bruger **IKKE** den tabel.
Den beregner live peer-gennemsnit:
- peers = companies med SAMME industry_label (eksakt streng-lighed, rca:797)
  og status='active'; minimum 3 peers, ellers {available:false} (rca:800-802).
- Seneste facts-række pr. peer; minimum 3 peers MED data (rca:812-821).
- Gennemsnit af RATIOER (gross_margin_pct, ebt_margin_pct, payroll_pct af
  revenue), hver ratio kræver ≥3 datapunkter (rca:824-844).
Da industry_label kan være fri tekst (EditCompanyDialog) og eksakt lighed
kræves, er matchet følsomt for stavning. Antal distinkte brancher blandt de
34 virksomheder kan ikke måles herfra — query til Lovable SQL editor:

```sql
SELECT count(DISTINCT industry_label) AS distinkte_labels,
       count(DISTINCT industry_code)  AS distinkte_koder,
       count(*) FILTER (WHERE industry_label IS NULL) AS uden_label
FROM companies WHERE status = 'active';

SELECT industry_label, industry_code, count(*)
FROM companies WHERE status = 'active'
GROUP BY 1, 2 ORDER BY count(*) DESC, 1;
```

---

## 8. Kørselshistorik

**Der findes ingen kørselslog.** Ingen agent_runs-tabel (tabellisten
types.ts:16-2790), ingen INSERT af run-metadata nogen steder i rca. Svaret
{ok, iterations, done, produced_output, message_written} returneres til
kalderen og smides væk (kaldstederne console.warn'er kun ved fejl, fx
reportCommit.ts:209-217).

Det der FINDES af spor, spredt over output-tabellerne:
- `messages` med context_type='agent'/'session_prep' og
  context_meta={source:"run-company-agent", trigger, period_key(, points,
  generated_at)} (rca:487, :674) + evt. feedback up/down.
- `weekly_focus.triggers_fired` + trigger_data={trigger} + generated_at
  (rca:649-653).
- `company_actions` med source_type='agent' + created_at/expires_at (rca:741-751).
- `milestones` med source='agent' (rca:582).
- `advisor_notifications` med reference_type='agent' (rca:625).
- Edge-function-console-logs i Lovable (eneste sted stop_reason, blokerede
  kald og iterationer kan ses — flygtigt, uden struktur).
- Versions-endpoint `?meta=version` returnerer kun DEPLOY_STAMP (rca:899-904).

To observationer om sporenes konsistens:
- run-weekly-agents "allerede kørt denne uge"-tjek (run-weekly-agent/index.ts:53-64)
  tæller messages med context_type='agent' siden mandag. write_chat_message er
  blokeret for ALLE fire rutine-triggers (rca:965-970), og onboarding skriver
  as_advisor (context_type=null, rca:503-504). Ingen nuværende kodevej
  producerer altså nye context_type='agent'-rækker — tjekket kan kun matche
  historiske rækker.
- Agentens egen hukommelse, get_previous_agent_messages (rca:761-782), læser
  samme context_type='agent'-rækker — dvs. den kigger på beskeder som de
  nuværende triggers ikke længere skriver; session_prep-rækkerne
  (context_type='session_prep') læses ikke af noget agent-tool.

Query til at se de faktiske spor i Lovable SQL editor:

```sql
-- Agent-skrevne chatrækker og forberedelser, nyeste først
SELECT m.created_at, m.context_type, m.context_meta->>'trigger' AS trigger,
       m.context_meta->>'period_key' AS periode, c.company_id,
       left(m.content, 80) AS uddrag
FROM messages m JOIN conversations c ON c.id = m.conversation_id
WHERE m.context_type IN ('agent', 'session_prep')
ORDER BY m.created_at DESC LIMIT 50;

-- Agent-forslag og -milestones
SELECT 'action' AS kilde, company_id, title, status, created_at
FROM company_actions WHERE source_type = 'agent'
UNION ALL
SELECT 'milestone', company_id, title, status, created_at
FROM milestones WHERE source = 'agent'
ORDER BY created_at DESC LIMIT 50;
```
