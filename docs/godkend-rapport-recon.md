# Recon: "Godkend rapport" på MemberDetail gør ingenting i databasen
> Skrevet 2026-08-27. Øjebliksmåling — linjenumre og tal gælder den dag, ikke i dag.

Ren recon, 2026-08-27, main. Målt adfærd (tre klik på PHILBERTs rapporter →
browser på /admin/review-queue, nul DB-ændringer) er fuldt forklaret af koden:
**elementet er ikke en knap med en handler — det er et rent navigationslink.**

---

## 1. Knappen og dens "handler"

`src/pages/MemberDetail.tsx:1587-1594`, inde i det udfoldede rapportkort
(badges sættes 1517-1522):

```tsx
1587:  {isProcessed && !isCommitted && (
1588:    <a
1589:      href={`/admin/review-queue`}
1590:      className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
1591:    >
1592:      Godkend rapport →
1593:    </a>
1594:  )}
```

Der ER ingen onClick-handler at citere. Elementet er et `<a href>` stylet som
en primærknap. Betingelserne (1517-1518): `isCommitted` = findes der en
faktarække med `source_report_id === report.id`; `isProcessed` =
`status === "processed" || "committed"`.

## 2. Hvad gør den præcist?

Den navigerer. Ingen RPC, ingen edge function, ingen skrivning — og dermed
heller ingen fejl at vise eller sluge. Det målte udfald (browser på
/admin/review-queue, intet i databasen) er elementets fulde, tilsigtede
funktion som kodet. Teksten "Godkend rapport" lover en handling som
elementet ikke udfører.

Destinationen indfrier heller ikke løftet: `/admin/review-queue`
(`src/pages/ReportReviewQueue.tsx`) er en ren læseflade — query + filtre
(85-115), tabel, og pr. række én handling: et link til
`/admin/report-debug/:id` (235-238). Der findes ingen godkend/commit-knap på
siden. Rådgiveren sendes altså fra et løfte om godkendelse til en
diagnostikliste hvor godkendelse heller ikke findes.

## 3. Kodestien der FAKTISK skaber facts-rækker

Den eneste skaber af rækker i `financial_report_facts` fra en rapport er
RPC'en **`public.commit_report_facts(p_report_id)`** (seneste definition:
`supabase/migrations/20260826120000_data_basis_paa_facts.sql`). SECURITY
DEFINER; den opløser kandidaten via `resolve_report_commit_candidate` og
INSERT'er/UPDATE'r én faktarække med `data_basis = 'measured'`.

Kaldesteder i frontend (alle tre):

- `src/components/ReportReviewDialog.tsx:251` — `handleCommit` ("Godkend
  data" / "Opdater committed data").
- `src/components/ReportReviewDialog.tsx:390` — Erstat-flowet (soft-delete
  af gammel ejer + overtagelse).
- `src/components/hjemmebane/rapportering/RapporteringView.tsx:240` —
  "Gem og anvend" i Ret data-flowet (manual override → commit med det samme).

`ReportReviewDialog` er KUN monteret i `RapporteringView`
(medlemmets Hjemmebane-rapporteringsflade) — grep over src/ finder ingen
andre brugssteder. MemberDetail importerer den ikke.

Betingelser, håndhævet i SQL (migration 20260722130000 for resolve;
20260826120000 for commit):

- Autentificeret kalder; `company_id = user_company_id(caller)` ELLER
  `has_role(caller, 'advisor')` — rådgivere MÅ committe via RPC'en.
- Rapporten ikke soft-slettet; `status = 'processed'` (resolve, linje 65-70).
- Én af tre metric-grene: manual override applied med manual_normalized_data
  (→ 'manual-approved'), v2-kontrakt, eller `validation_status = 'PASS'`
  (v1-grenen, linje 151-157). Ellers "No canonical PASS or manual-approved
  metrics".
- Mindst én mappebar metric-nøgle; opløselig period_key.
- Perioden skal være afsluttet: `period_key >= to_char(now(),'YYYY-MM')`
  blokerer (linje 207).

Alle brud RAISE EXCEPTION — stien kan ikke fejle tavst. Bemærk desuden:
`report_type = 'annual_report'` committes slet ikke ad denne vej;
årsrapport-vejen skriver sine 12 rækker direkte med service-role i
`extract-annual-report` (index.ts:254-288).

## 4. Skrives reviewed_at nogensinde?

Ja — men kun ét sted, og det har intet med godkendelse at gøre.
`src/components/CompanyChatPane.tsx`:

```
762:    await supabase
763:      .from("financial_reports")
764:      .update({ reviewed_at: now } as any)
765:      .in("id", reportIds);
```

(og identisk i `handleMarkReportsAsRead`, linje 784-787). Det er rådgiverens
"markér som læst"-flag i chat-fladen — dokumenteret som netop dét i
`supabase/functions/_shared/notificationEmailSelection.ts:18-19`
("financial_reports.reviewed_at er advisorens læst-flag"). Ingen commit-sti,
ingen MemberDetail-kode og ingen Review Queue-kode skriver feltet. At
`reviewed_at` stadig er null efter klikkene er derfor forventeligt — ingen
kode på den fulgte sti rører det.

## 5. Kan en skrivning ramme nul rækker uden at fejle?

Ja, på `financial_reports` — men ikke på commit-stien. Tabellens
UPDATE-politikker er:

```sql
-- 20260223141214_...sql:44-46
CREATE POLICY "Users can update own reports"
ON public.financial_reports FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

-- 20260224222456_...sql:162-164
CREATE POLICY "Company members can update company reports"
  ON public.financial_reports FOR UPDATE
  USING (company_id = public.user_company_id(auth.uid()));
```

Der findes INGEN advisor-UPDATE-politik på financial_reports (rådgivere har
kun SELECT, 20260223154218:3-7). En rådgivers klient-side update på et andet
selskabs rapporter rammer derfor 0 rækker uden fejl — et kendt mønster,
dokumenteret i `src/lib/reportCommit.ts:117-121` ("fejlspor 2026-07-22:
advisor-sletning af andres rapporter rammer 0 rækker"). Det ville ramme
CompanyChatPanes reviewed_at-skrivning, hvis en rådgiver brugte den mod et
selskab de ikke selv er medlem af.

Men i DENNE hændelse er RLS ikke forklaringen: der blev aldrig forsøgt
nogen skrivning. Selve commit-stien kan ikke ramme tavse nul rækker — den er
en SECURITY DEFINER-RPC der kaster ved hvert brud (afsnit 3).

## 6. Andre flader hvor en rapport kan committes

| Flade | Fil | Kan |
|---|---|---|
| Hjemmebane → Rapportering (medlem) | `RapporteringView.tsx` + `ReportReviewDialog.tsx` | Fuldt commit: "Godkend data", "Opdater committed data", "Erstat" (390), inline-redigering + "Gem og anvend" via manual override (240) |
| Ret data-flowet | `ReportManualOverride.tsx` / `reportOverrideHelpers.ts` | "Godkend = commit" ved anvend (ReportManualOverride.tsx:107) — samme RPC |
| Review Queue | `ReportReviewQueue.tsx` | KUN læsning: filtre + link til report-debug. Ingen godkendelse |
| Report-debug | `ReportDebug.tsx` | Diagnostik (correction_log, provenance, checks) + tør agent-kørsel (dry_run, 395-420). Ingen commit |
| Chat-fladen | `CompanyChatPane.tsx` | Kun reviewed_at-læst-flag (764, 786). Ingen commit |
| MemberDetail | `MemberDetail.tsx` | Intet — kun linket i afsnit 1 |

**Samlet fund:** Rådgiveren har i dag INGEN flade der kan committe en
rapport, selvom `commit_report_facts` udtrykkeligt tillader rådgiver-kald.
Den eneste committende UI er medlemmets egen Hjemmebane-rapportering.
"Godkend rapport →" på MemberDetail er et dødt link med en handlingslabel:
det navigerer til en læseflade og efterlader både facts, status og
reviewed_at urørt — præcis som målt.
