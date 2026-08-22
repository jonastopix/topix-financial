# Opgave-model — kortlægning af eksisterende flader

**Kortlagt**: 2026-08-22, kode-evidens fra main (efter PR #379).
**Metode**: recon af `src/`, `supabase/functions/` og `supabase/migrations/` for de fire tabeller `milestones`, `company_actions`, `weekly_focus` og `pulse_checkins` — alle skrive- og læsesteder, med verifikation af to spørgsmål: ser et medlem overskredne milestones, og kan en rådgiver se ubesvarede AI-forslag. Rå observationer med fil:linje-referencer. Ingen konklusioner, anbefalinger eller designforslag — de hører til fase 1-designet.

> **Forbehold**: linjenumre er fra arbejdstræet 2026-08-22 og drifter ved fremtidige ændringer. "Død kode" betyder her: komponenten refereres ingen steder uden for sig selv (verificeret ved grep), eller importeres men renderes aldrig.

---

## 1. `milestones`

### Skema
- Basistabel: `supabase/migrations/20260223155456_9a5f9640-5da3-44db-8b83-675c55ad9280.sql:3-16` — `deadline DATE`, `progress`, `status`, `source`, `source_report`.
- `company_id uuid REFERENCES public.companies(id)` **uden `ON DELETE CASCADE`**: `20260224222456_cf8f2d1f-f8c7-422a-88c1-8d65677c636c.sql:104` (senere `SET NOT NULL` i `20260225215412…:12`). Company-scoped RLS (SELECT/INSERT/UPDATE/DELETE via `user_company_id`): samme migration `:188-201`.
- Senere kolonner: `category` (`20260225231545…:1`), `baseline` (`20260225233433…:1`), status-CHECK `active|completed|parked|…` (`20260330180111…:2-3`), `target_value`/`current_value`/`unit` (`20260331180849…:1`), `progress_updated_at` + trigger (`20260407172908…:4-22`).
- TS-typer: `src/integrations/supabase/types.ts:2141-2210`.

### Skrivesteder (oprettelse)

| Sted | Aktør | `source` |
|---|---|---|
| `src/pages/Milestones.tsx:99-112` | Medlem/rådgiver, manuel oprettelse | `manual` |
| `src/lib/handoutEngine.ts:163-185` (`createLeverMilestone`); UI i `src/components/hjemmebane/handouts/HbHandoutDetail.tsx:295-319` | Medlem, løftestang→milestone | `handout` |
| `supabase/functions/run-company-agent/index.ts:544-587` (`create_milestone`-tool; deadline = i dag + `deadline_days ?? 30`; fuzzy dedup på titel) | AI-agent | `agent` |
| `supabase/functions/create-legat-enrollment/index.ts:169-179` | Legat-onboarding, auto | `legat` |

Opdatering/sletning: `src/components/MilestonesList.tsx:626,668,699,734`; `run-company-agent/index.ts:715-728` (`update_milestone_progress`); `src/components/LegatDashboard.tsx:84-88`; slettes ved rapport-fjernelse i `src/components/hjemmebane/rapportering/RapporteringView.tsx:397` og `supabase/functions/extract-financial-data/index.ts:1416`; company-merge i `src/pages/Members.tsx:748`.

### Visningssteder

**Medlem (levende):**
- `/milestones` (`src/App.tsx:226` → `src/pages/Milestones.tsx` → `src/components/MilestonesList.tsx`). Nås i navigationen kun som under-punkt under "Dine tal": `src/components/hjemmebane/HbMemberShell.tsx:60`.
- Forsiden `/`: `src/pages/Index.tsx:118-121` → `BoardroomView` → `FocusCard`. Milestones indgår kun som fokus-items via `deriveFocus` (query `src/components/hjemmebane/boardroom/BoardroomView.tsx:1293-1303`; udvælgelse `src/components/hjemmebane/boardroom/nextStep.ts:195-217`).
- `src/components/PulseCheckinModal.tsx:101-118` (gennemsnitlig progress → `milestone_progress`).
- `src/components/LegatDashboard.tsx:61-74` (den ene legat-milestone).

**Rådgiver (levende):**
- `src/components/AdvisorDashboard.tsx:357-361, 369-375` (aktive + nyligt fuldførte), renderet som rækker på company-kortet `:255-275`.
- `src/pages/MemberDetail.tsx:412, 1351-1460` (route `/members/:userId`, rådgiver-only).

**Død kode** (verificeret ved grep — ingen referencer uden for filen selv): `DashboardMilestones.tsx`, `DashboardActionCenter.tsx`, `DashboardActivity.tsx`, `ActivityFeed.tsx`, `CommunityProgress.tsx`, `AdvisorCompanyOverview.tsx`. Særtilfælde: `AdvisorAlertsPanel.tsx` **importeres i `AdvisorDashboard.tsx:17` men renderes aldrig** (eneste forekomst i filen er import-linjen).

---

## 2. `company_actions`

### Skema — `supabase/migrations/20260329190316_f82fcbf0-129b-465e-bf10-dcfb141e00c2.sql:46-95`

```sql
source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('ai_weekly','milestone','handout','manual')),
priority    TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
status      TEXT NOT NULL DEFAULT 'open'   CHECK (status IN ('open','done','parked','dismissed')),
week_key, generated_at, completed_at, dismissed_at
```

`company_id … ON DELETE CASCADE`. RLS: medlemmer read/insert/update på egen company (`:69-83`); **rådgivere har SELECT på alle** (`:85-87`). TS-typer: `types.ts:639-698`.

### Skrivesteder
- **AI-genereret**: `supabase/functions/generate-weekly-focus/index.ts:539-562` — LLM'en returnerer op til 3 `actions`, persisteret med `source_type: "ai_weekly"`, `status: "open"`, `week_key`, `generated_at`. Cron mandage 06:00 UTC (`supabase/migrations/20260329192545…:6-10`).
- **AI-agent-tool**: `supabase/functions/run-company-agent/index.ts:736-756` (`write_company_action`) skriver `source_type: "agent"` — værdien **findes ikke i CHECK-constraintens liste** (`ai_weekly|milestone|handout|manual`), så insertet ville violere `company_actions_source_type_check`. Observeret i kode; ikke verificeret mod prod.
- Manuel insert findes kun i død kode: `src/components/DashboardActionCenter.tsx:214`.

### Visningssteder
- **Medlem (levende)**: `src/components/hjemmebane/boardroom/BoardroomView.tsx:1345-1358` (kun `status = "open"`, limit 10, sorteret high→medium→low, dernæst ældste først) → `deriveFocus` `:1473` → fokus-item prioritet (f) i `nextStep.ts:222-236`. Renderes med `ctaHref: "/"` — som udfoldelige tekstlinjer i `FocusCard` (`BoardroomView.tsx:1027-1047`), uden knap eller link videre.
- **Rådgiver**: ingen steder. Grep over `src/` giver kun `DashboardActionCenter.tsx` (død) og `BoardroomView.tsx` som læsere.

### Kan et medlem forholde sig til dem?
Datamodellen har felterne (`status` open/done/parked/dismissed, `completed_at`, `dismissed_at`), men de eneste accept/afvis-kontroller ligger i den døde `DashboardActionCenter.tsx`:
- `:321` → `status: "done"` + `completed_at`
- `:335` → `status: "dismissed"` + `dismissed_at`

`BoardroomView.tsx` indeholder **ingen mutation på `company_actions`** — grep efter `completed_at|dismissed_at|"dismissed"` i filen giver nul hits. Alle AI-genererede handlinger forbliver derfor `status = 'open'`; der er i den levende UI ingen vej fra `open` til nogen anden status.

---

## 3. `pulse_checkins`

### Skema — `supabase/migrations/20260326140242_ea0ba180-33d9-4216-9d2a-ad695a45f5af.sql:1-11` + `20260330103223…:1`

```
company_id (FK companies ON DELETE CASCADE), user_id, period_key,
went_well, biggest_challenge, help_needed, milestone_progress (0-100 CHECK),
created_at, UNIQUE(company_id, period_key)
```

TS-typer: `types.ts:2371-2412`. RLS: oprindeligt own-row (`:15-19`), udvidet til company-delt i `20260601120000_pulse_checkins_shared_company_rls.sql`, rådgiver-read tilføjet i `20260611140000_advisor_read_pulse_checkins.sql`.

### Felternes karakter (observation, ikke vurdering)
- `went_well`, `biggest_challenge`: fritekst om den forgangne periode.
- `help_needed`: fritekst rettet mod rådgiveren; det er feltet chat-banneret viser (`src/components/CompanyChatPane.tsx:691-698`) og rådgiverlisten bygger på (`AdvisorDashboard.tsx:339-343`).
- `milestone_progress`: auto-beregnet som gennemsnit af aktive milestones' progress (`PulseCheckinModal.tsx:116-118`, skrevet `:206`) — medlemmet indtaster den ikke.
- Der findes intet "næste skridt"-, forpligtelses- eller dato-felt i tabellen.

### Skrivesteder og udløsere
- Skrives i `src/components/PulseCheckinModal.tsx:174-209` (upsert på `company_id,period_key`; eksisterende række prefilles `:158-193`; perioden er *forrige* måned `:157-159`).
- Indgange: route `/pulse` (`src/App.tsx:243` → `src/pages/PulseCheckin.tsx:32`) og `src/components/hjemmebane/rapportering/RapporteringView.tsx:823`.
- Udløsere/nudges: fokus-item på `/` gated bag committet rapport (`BoardroomView.tsx:1305-1321` → `nextStep.ts:240-250`); mobil-badge `src/components/AppLayout.tsx:70-87`; chat-nudge fra `supabase/functions/nudge-report-no-reflection/index.ts:137-144` (jf. `docs/email-flows.md` §1.4). `send-pulse-reminder` er unscheduled (`supabase/migrations/20260612090000_retire_pulse_reminder_cron.sql`).

### Visnings-/forbrugssteder
- Medlem: historikliste i modal'en (`PulseCheckinModal.tsx:122-136`).
- Rådgiver: `AdvisorDashboard.tsx:339-343` + `:474-496, 652-714` (per-company `report_no_reflection`-tilstand), `MemberDetail.tsx:253-258, 1045-1049`, `CompanyChatPane.tsx:691-698`.
- Backend: `run-company-agent/index.ts:387-397` (`get_pulse_checkins`-tool), `generate-weekly-focus/index.ts:425`, `send-slack-report-notification/index.ts:243`.

---

## 4. `weekly_focus`

### Skema — `20260329190316…:100-135`
`UNIQUE(company_id, week_key)`, `status IN ('no_data','quiet','active')`, `headline`, `summary`, `triggers_fired`/`trigger_data` JSONB, `actions_generated`, `data_freshness_days`, `seen_at`, `expires_at` (now + 8 dage). `ON DELETE CASCADE`. Rådgiver-SELECT på alle (`:119+`). Feature-flag `companies.weekly_focus_enabled` (`:139`; default `true` fra `20260329203807…:1`). TS-typer: `types.ts:2709-2765`.

### Genereringssteder
- `supabase/functions/generate-weekly-focus/index.ts`: skip-hvis-eksisterer `:114-124`; `no_data`-række `:141-152`; triggers T1-T4 `:160-260`; LLM-kald + `active`-upsert `:525-538`; actions `:539-562`; notifikation "Ugens fokus er klar" (`deep_link: "/"`, `priority: "info"` — mailes bevidst ikke) `:565-591`. Cron mandage 06:00 UTC (jf. `docs/email-flows.md` §1.5: også on-commit via `propagateReportCommit`).
- `supabase/functions/run-company-agent/index.ts:632-657` (`update_weekly_focus`-tool, upsert på `company_id,week_key`).

### Visningssteder
- **Medlem (levende)**: `BoardroomView.tsx:1324-1341` (indeværende ISO-uge, `status IN ('active','quiet','no_data')`) → fokus-item prioritet (d) `nextStep.ts:183-193`; headline som titel, `summary` inline (`BoardroomView.tsx:970-971, 1002-1004`). `seen_at` stemples `BoardroomView.tsx:1480-1485`. Uge-nøgle: `src/lib/hjemmebane/week.ts`.
- **Rådgiver (levende)**: `AdvisorDashboard.tsx:376-381` — kun en boolean `hasWeeklyFocus` per company (`:562-563, 714`); headline/summary vises ikke.
- Død kode: `DashboardActionCenter.tsx:67-85`, `AdvisorCompanyOverview.tsx:305-327`.

---

## 5. VERIFICERET: ser et medlem overskredne milestones?

**Nej. Ingen medlemsflade viser en overskredet milestone som overskredet, og forsiden filtrerer dem aktivt ud.**

**(a) Forsiden `/` ekskluderer overskredne eksplicit.** `src/components/hjemmebane/boardroom/nextStep.ts:198-205`:

```ts
const candidates = inputs.milestones
  .filter((m) => m.deadline && m.progress < 100 && m.status !== "parked")
  .map((m) => ({ milestone: m,
    daysLeft: Math.ceil((new Date(m.deadline as string).getTime() - now.getTime()) / 86400000) }))
  .filter(({ daysLeft }) => daysLeft > 0 && daysLeft <= 14)
```

`daysLeft > 0` udelukker alt forbi deadline. Adfærden er låst af test, `src/components/hjemmebane/boardroom/__tests__/nextStep.test.ts:58-70` ("3b) deadlines uden for 14-dages-vinduet (eller overskredet) ignoreres" — en milestone med `deadline: daysFromNow(-9)` forventes at give `null`). En milestone forsvinder altså fra fokus-kortet dagen efter sin deadline.

**(b) `/milestones`-siden har ingen overdue-markering.** Sorteringens "urgent"-begreb kræver fremtidig deadline — `src/components/MilestonesList.tsx:596`: `const aUrgent = a.deadline && (a.deadline.getTime() - now) <= URGENT_MS && a.deadline.getTime() > now;` — en overskredet milestone er ikke "urgent" og falder ned i den almindelige deadline-stigende sortering (`:606-608`). Deadlinen renderes som almindelig grå tekst uden betinget styling (`:171`: `<p className="text-xs text-muted-foreground">{formatDeadline(ms.deadline)}</p>`; `formatDeadline` `:57-60` printer blot datoen). Der findes ingen `isOverdue`-variabel i filen.

**(c) Deadline-påmindelser fyrer kun før deadline.** `MilestonesList.tsx:562-575`: `const checkDays = [3, 7]; … if (checkDays.includes(daysUntil))` — `daysUntil` bliver negativ efter deadline og matcher aldrig.

**(d) Weekly-focus-generatoren ekskluderer også overskredne.** `supabase/functions/generate-weekly-focus/index.ts:222-231` — T3 `MILESTONE_DUE_SOON` bruger `.lte("deadline", fourteenDaysFromNow).gte("deadline", now…)`. Kun T4 `MILESTONE_STALLED` (`:243-251`) kan tilfældigt fange en gammel milestone, og den keyer på `updated_at`, ikke deadline.

**(e) Al overdue-logik i `src/` ligger i rådgiverfiler.** Samtlige forekomster af `overdue`/`Overskredet`/deadline-fortids-sammenligning:
- `src/components/AdvisorAlertsPanel.tsx:106-114, 237-249` (`.lt("deadline", now)` → "Overskredet deadline: …", `text-destructive`) — **renderes aldrig** (jf. §1).
- `src/components/AdvisorCompanyOverview.tsx:265-267, 512` — død kode.
- `src/components/AdvisorDashboard.tsx:260-264` — levende: rød prik på company-kortets top-2 milestones.
- `src/pages/MemberDetail.tsx:799-808, 1351-1360, 1415-1430` — levende: "Overskredte milestones"-blok, "N overskredet"-badge, `isOverdue` per række.

**(f) Den eneste kanal hvor en overskredet milestone når et medlem, er månedsdigesten — umarkeret.** `supabase/functions/send-monthly-digest/index.ts:201-211` bruger `.lte("deadline", in30Days)` **uden nedre grænse**, så forbigangne rækker medtages — renderet under overskriften "Milestones med deadline snart:" (`:267`) med den passerede dato printet som var den kommende. Cron d. 22. kl. 08:00 (`supabase/migrations/20260810230000_cron_oprydning.sql:74-79`).

---

## 6. VERIFICERET: kan en rådgiver se ubesvarede `company_actions`?

**Nej. Ingen rådgiverflade læser `company_actions` overhovedet.**

- Grep over `src/` giver præcis to læsere af tabellen: `BoardroomView.tsx:1348` (medlemsforsiden) og `DashboardActionCenter.tsx:195` (død kode). Ingen rådgiverkomponent er iblandt.
- RLS-policyen giver ellers rådgivere SELECT på alle rækker (`20260329190316…:85-87`) — adgangen findes, fladen gør ikke.
- `supabase/functions/get-advisor-alerts/index.ts` (102 linjer) læser kun `notifications` (`:28`), `advisor_financial_actions` (`:54`) og `companies` (`:83`) — hverken `company_actions`, `milestones`, `weekly_focus` eller `pulse_checkins`.
- Dertil (jf. §2): da den levende UI ingen statusmutation har, er "ubesvaret" og "besvaret" i praksis samme tilstand (`open`) i data.

Rådgiver-synlighed for de fire tabeller samlet:

| Signal | Rådgiverflade i dag | Fil:linje |
|---|---|---|
| Milestones (aktive, per company) | Levende, company-kort | `AdvisorDashboard.tsx:357-361` (render `:255-275`) |
| Milestones, overskredne | Kun rød prik på de top-2 viste | `AdvisorDashboard.tsx:260-264` |
| Milestones, overskredne+stalled som alertliste med snooze | Bygget, renderes aldrig | `AdvisorAlertsPanel.tsx:104-131, 237-263` (import `AdvisorDashboard.tsx:17`) |
| Milestones, overskredne per medlem | Levende | `MemberDetail.tsx:799-808, 1351-1360, 1415-1430` |
| `company_actions` (status/ubesvarede) | Findes ikke | — |
| `weekly_focus` | Kun boolean "har én denne uge" | `AdvisorDashboard.tsx:376-381, 562-563, 714` |
| Pulse / manglende refleksion | Levende | `AdvisorDashboard.tsx:652-714`, `MemberDetail.tsx:1045-1049` |

---

## 7. Alle læsesteder for de fire tabeller

### `milestones`
| Fil:linje | Flade |
|---|---|
| `src/components/MilestonesList.tsx:626,668,699,734` (+ query i `src/pages/Milestones.tsx`) | Medlem/rådgiver, `/milestones` |
| `src/components/hjemmebane/boardroom/BoardroomView.tsx:1293-1303` | Medlem, forsiden `/` |
| `src/components/PulseCheckinModal.tsx:101-118` | Medlem, pulse-modal |
| `src/components/LegatDashboard.tsx:61-74` | Medlem, legat |
| `src/components/AdvisorDashboard.tsx:357-375` | Rådgiver, dashboard |
| `src/pages/MemberDetail.tsx:412, 1351-1460` | Rådgiver, medlemsdetalje |
| `src/pages/Members.tsx:748` | Rådgiver, company-merge |
| `src/components/AdvisorAlertsPanel.tsx:104-131` | Død (renderes aldrig) |
| `src/components/AdvisorCompanyOverview.tsx:265-267, 512` | Død |
| `src/components/DashboardMilestones.tsx`, `DashboardActionCenter.tsx`, `DashboardActivity.tsx`, `ActivityFeed.tsx`, `CommunityProgress.tsx` | Død |
| `supabase/functions/run-company-agent/index.ts:544-587, 715-728` | AI-agent (tools) |
| `supabase/functions/generate-weekly-focus/index.ts:222-231, 243-251` | Weekly-focus-triggers T3/T4 |
| `supabase/functions/send-monthly-digest/index.ts:201-211` | Månedsdigest |
| `supabase/functions/extract-financial-data/index.ts:1416` | Rapport-sletning |
| `supabase/functions/create-legat-enrollment/index.ts:169-179` | Legat-onboarding |

### `company_actions`
| Fil:linje | Flade |
|---|---|
| `src/components/hjemmebane/boardroom/BoardroomView.tsx:1345-1358` | Medlem, forsiden `/` |
| `src/components/DashboardActionCenter.tsx:195, 207, 214` | Død |
| `supabase/functions/generate-weekly-focus/index.ts:539-562` | AI-generering (skrive) |
| `supabase/functions/run-company-agent/index.ts:736-756` | AI-agent-tool (skrive) |

### `weekly_focus`
| Fil:linje | Flade |
|---|---|
| `src/components/hjemmebane/boardroom/BoardroomView.tsx:1324-1341, 1480-1485` | Medlem, forsiden `/` (+ `seen_at`-stempling) |
| `src/components/AdvisorDashboard.tsx:376-381, 562-563, 714` | Rådgiver, boolean per company |
| `src/components/DashboardActionCenter.tsx:67-85` | Død |
| `src/components/AdvisorCompanyOverview.tsx:305-327` | Død |
| `supabase/functions/generate-weekly-focus/index.ts:114-124, 525-538` | Generering (skip-tjek + upsert) |
| `supabase/functions/run-company-agent/index.ts:632-657` | AI-agent-tool (upsert) |

### `pulse_checkins`
| Fil:linje | Flade |
|---|---|
| `src/components/PulseCheckinModal.tsx:122-136, 158-193, 174-209` | Medlem, modal (historik + prefill + upsert) |
| `src/components/hjemmebane/boardroom/BoardroomView.tsx:1305-1321` | Medlem, forsiden `/` (nudge-gate) |
| `src/components/AppLayout.tsx:70-87` | Medlem, mobil-badge |
| `src/components/AdvisorDashboard.tsx:339-343, 474-496, 652-714` | Rådgiver, dashboard |
| `src/pages/MemberDetail.tsx:253-258, 1045-1049` | Rådgiver, medlemsdetalje |
| `src/components/CompanyChatPane.tsx:691-698` | Rådgiver, chat-banner (`help_needed`) |
| `supabase/functions/run-company-agent/index.ts:387-397` | AI-agent (tool) |
| `supabase/functions/generate-weekly-focus/index.ts:425` | Weekly-focus-kontekst |
| `supabase/functions/send-slack-report-notification/index.ts:243` | Slack-notifikation |
| `supabase/functions/nudge-report-no-reflection/index.ts:137-144` | Refleksions-nudge |

---

## Bilag: livscyklus ved company-afgang (observeret ifm. pkt. 7)

- Ingen soft-delete eller offboarding-livscyklus på `companies` — kun hard delete: `supabase/functions/_shared/companyHardDelete.ts:12-112` (manuel, ordnet kaskade; `company_actions` `:66`, `weekly_focus` `:68`, `milestones` `:73`, `pulse_checkins` `:79`, til sidst `companies` `:109`).
- Kaldere: `supabase/functions/manage-advisor/index.ts:223, 256`; `supabase/functions/admin-cleanup-test-data/index.ts:103`. UI: `src/pages/Members.tsx:781` + bekræftelsesdialog `:1363`.
- FK-tilstand er blandet: `pulse_checkins`, `company_actions` og `weekly_focus` har `ON DELETE CASCADE`; **`milestones.company_id` har ikke** (`20260224222456…:104`) — en rå `DELETE FROM companies` blokeres af den FK; kun den eksplicitte sletning i `companyHardDelete.ts:73` gør hard delete mulig.
- Medlemskabs-udløb er beregnet, ikke lagret: `src/lib/membershipTier.ts:22-33` (spejlet i `supabase/functions/_shared/membershipTier.ts`); gate i `src/pages/Index.tsx:81-83`. Fornyelsesbeslutning: `supabase/migrations/20260811120000_fornyelsesbeslutning.sql:27-63` (`company_fornyelse`) — registrerer hensigt, udløser ingen datahåndtering.
