# Recon: "Slet" under Historiske årsrapporter som rådgiver i "Se som member"
> Skrevet 2026-08-27. Øjebliksmåling — linjenumre og tal gælder den dag, ikke i dag.

Ren recon, 2026-08-27, main. Kort dom over hypotesen:
**Mekanismen er bekræftet** (klient-side skrivning uden resultat-tjek → tavs
nul-række-udfald; commit virker fordi RPC'en er SECURITY DEFINER med
advisor-gren). **Præmissen er modsagt af repoet**: rådgiveren HAR
UPDATE/DELETE-politikker på begge tabeller i migrationsfilerne. Den målte
adfærd kan derfor kun forklares ved at prod ikke håndhæver de politikker som
repoet indeholder — detaljer i §6.

---

## 1. Slet-kontrollen og bekræftelsestrinnet

`src/components/hjemmebane/rapportering/RapporteringView.tsx`. Listen under
overskriften "Historiske årsrapporter" (1012) render pr. rapport en
Slet-kontrol med to-trins bekræftelse via `confirmDelete`-state (876):

```tsx
1061:  {confirmDelete === report.id ? (
1062:    <>
1063:      <span className="text-sm text-hb-ink">Slet årsrapport {report.year}?</span>
1064:      <button
1065:        type="button"
1066:        onClick={() => void handleDelete(report.id, report.year)}
1067:        className="shrink-0 rounded-full bg-hb-rust px-3 py-1 text-xs font-medium text-white hover:bg-hb-rust/90"
1068:      >
1069:        Slet
1070:      </button>
1071:      <button type="button" onClick={() => setConfirmDelete(null)} ...>
1072:        Fortryd
1073:      </button>
1074:    </>
```

Handleren, komplet (962-977):

```tsx
962:  const handleDelete = async (reportId: string, year: string) => {
963:    try {
964:      await supabase.from("financial_reports").update({ deleted_at: new Date().toISOString() } as any).eq("id", reportId);
965:      clearReportReviewNotification(reportId);
966:      await (supabase.from("financial_report_facts" as any) as any)
967:        .delete()
968:        .eq("company_id", companyId!)
969:        .eq("source_type", "annual_report")
970:        .like("period_key", `${year}-%`);
971:      queryClient.invalidateQueries({ queryKey: ["company-facts"] });
972:      setConfirmDelete(null);
973:      void annualQuery.refetch();
974:    } catch (err: any) {
975:      toast.error("Kunne ikke slette", { description: err.message });
976:    }
977:  };
```

`report.year` kommer fra `report_period.replace("Årsrapport ", "")` (890),
`companyId` er override-selskabet (PHILBERT) via useAuth.

## 2. Hvad kalder den?

To DIREKTE klient-kald — ingen RPC, ingen edge function:

1. `financial_reports`: UPDATE af `deleted_at` (linje 964, soft-delete).
2. `financial_report_facts`: DELETE på company_id + source_type
   `'annual_report'` + period_key LIKE `'<år>-%'` (linje 966-970).

Derimellem `clearReportReviewNotification` (best-effort på notifications).

## 3. Tjekkes berørte rækker? Vises fejl?

Nej og nej — og det er værre end "ingen tjek af antal": **resultatet
inspiceres slet ikke.** Linje 964 og 966 destrukturerer ikke engang
`{ error }` af svaret. supabase-js kaster ikke ved fejl (fejl returneres i
result-objektet), så `catch`-grenen (974-975) kan i praksis kun rammes af
netværksexceptions. Både en hård RLS-fejl og et 0-rækker-udfald er dermed
usynlige; handleren opdaterer UI-state og refetcher som ved succes. Den målte
"ingen synlig fejl" er garanteret af konstruktionen, uanset hvad databasen
gjorde. (Til sammenligning tjekker naboflowet handlePermanentDelete faktisk
`factsDeleteError`, linje 416-421 — men heller ikke dét tjekker rækkeantal.)

## 4. Sletter den også facts-rækkerne?

I koden: ja, begge dele — men ad TO uafhængige veje:

1. Klient-DELETE'en på facts (linje 966-970, citeret ovenfor).
2. Den autoritative vej: soft-delete-triggeren på financial_reports,
   `cleanup_facts_on_report_delete()` (migration
   `20260326142338_...sql`) — SECURITY DEFINER, fyrer AFTER UPDATE OF
   deleted_at og sletter `WHERE source_report_id = NEW.id`:

```sql
CREATE OR REPLACE FUNCTION public.cleanup_facts_on_report_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
...
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    DELETE FROM public.financial_report_facts
    WHERE source_report_id = NEW.id;
  END IF;
```

Triggeren omgår RLS (SECURITY DEFINER) — men den fyrer kun hvis UPDATE'en på
rapport-rækken faktisk rammer rækken. Rammer soft-deleten 0 rækker, fyrer
intet, og facts består. Det målte udfald (deleted_at null OG 12 intakte
faktarækker) er konsistent med at BEGGE klient-kald ramte 0 rækker.

## 5. Hvad gør "Se som member"?

Ren UI-tilstand — ingen session-, JWT- eller auth-ændring.
`src/hooks/useAuth.tsx`:

```tsx
89:  const [overrideCompanyId, setOverrideCompanyId] = useState<string | null>(null);
92:  const companyId = overrideCompanyId ?? ownCompanyId;
94:  const isCompanyOverride = overrideCompanyId != null;
96:  const setCompanyOverride = useCallback((id: string, name: string) => {
97:    setOverrideCompanyId(id);
```

AppSidebar ("Se som member", linje 495/557) kalder `setCompanyOverride` med
det valgte selskab. `auth.uid()` er bagefter UÆNDRET rådgiverens eget
user-id; alle RLS-prædikater (`user_company_id(auth.uid())`,
`auth.uid() = user_id`, `has_role(...)`) evaluerer mod rådgiveren, ikke
medlemmet. Kun query-filtrene (`.eq("company_id", companyId)`) peger på
medlemmets selskab.

## 6. Alle klient-skrivninger uden SECURITY DEFINER-RPC — og hypotese-dommen

**⚠ HYPOTESEN MODSIGES AF REPOET på præmissen.** Migrationsfilerne
indeholder eksplicitte advisor-skrivepolitikker på BEGGE tabeller:

```sql
-- 20260227055124_...sql
CREATE POLICY "Advisors can update financial reports"
ON public.financial_reports FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'advisor'::app_role));
CREATE POLICY "Advisors can delete financial reports" ... FOR DELETE ...;
CREATE POLICY "Advisors can insert financial reports" ... FOR INSERT ...;

-- 20260327194528_...sql
CREATE POLICY "Advisors can delete facts" ON public.financial_report_facts
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'advisor'::app_role));
```

Var disse live og permissive, ville rådgiverens soft-delete have ramt
rapport-rækken (→ trigger → facts væk) OG klient-DELETE'en have ramt de 12
faktarækker. Målingen viser det modsatte. To forklaringsklasser er mulige,
og de kan ikke skelnes statisk:

- **Drift**: politikkerne er aldrig deployet i prod eller senere droppet
  manuelt (migrations deployes manuelt i Lovable SQL editor — CLAUDE.md).
  Dette understøttes af et ÆLDRE prod-fejlspor: `src/lib/reportCommit.ts:119`
  dokumenterer "fejlspor 2026-07-22: advisor-sletning af andres rapporter
  rammer 0 rækker" — observeret ~5 måneder EFTER migrationen fra 27/2 der
  skulle have givet rådgiveren delete-adgang.
- **RESTRICTIVE-stakning**: `supabase/SECURITY_BASELINE.md:206-208` påstår
  at ALLE public-politikker er RESTRICTIVE (AND-stak). Restriktive politikker
  uden mindst én permissiv giver 0 rækker uden fejl. Repoet tvivler selv på
  påstanden: migration `20260804120000...sql:10-14` beder om verifikation
  med netop denne query FØR deploy:

```sql
SELECT c.relname, p.polname, p.polpermissive
FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
ORDER BY c.relname, p.polname;
```

  Den query i Lovable SQL editor afgør sagen (polpermissive = false på
  advisor-politikkerne, eller fravær af dem, forklarer målingen).

**Det bekræftede i hypotesen:** (a) sletningen er klient-side
UPDATE + DELETE (§2); (b) et 0-række-udfald er tavst (§3); (c) RLS-denial
i Postgres filtrerer rækker frem for at fejle, så tavs nul er den
forventelige form for "nej"; (d) "Gennemgå og godkend" virkede fordi
`commit_report_facts` er SECURITY DEFINER med eksplicit advisor-tilladelse
(`IF _candidate.company_id != user_company_id(_caller) AND NOT
has_role(_caller,'advisor') THEN RAISE`, migration 20260826120000).

### Kataloget: klient-skrivninger uden SECURITY DEFINER-RPC

Udfaldskolonnen angiver rådgiver mod ET ANDET selskabs data, GIVET den
prod-adfærd målingen og fejlsporet 22/7 viser (advisor-skrivninger rammer
0 rækker); med repoets politikker live ville de fleste i stedet lykkes.

`financial_reports`:

| Sted | Operation | Resultat-tjek | Rådgiver-udfald (målt prod-adfærd) |
|---|---|---|---|
| RapporteringView:964 (årsrapport-slet) | UPDATE deleted_at | Intet — end ikke error | 0 rækker, tavst — DENNE hændelse |
| RapporteringView:317 (fortrydUpload) | UPDATE deleted_at | Intet | 0 rækker, tavst |
| RapporteringView:333 (handleDeleteReport) | UPDATE deleted_at | error tjekkes, antal ikke | 0 rækker, tavs succes-toast |
| RapporteringView:378 (gendan fra papirkurv) | UPDATE deleted_at=null | error, ikke antal | 0 rækker, tavs succes-toast |
| RapporteringView:423 (permanent delete) | DELETE | error, ikke antal | 0 rækker, tavs succes |
| RapporteringView:912 (upload-oprydning) | UPDATE deleted_at | Intet | 0 rækker, tavst |
| ReportReviewDialog:379-383 (Erstat: soft-delete gammel ejer) | UPDATE deleted_at | error, ikke antal | 0 rækker — og RPC'ens overtagelses-guard fejler så HØJT bagefter ("already owned", ejer ikke soft-slettet) |
| CompanyChatPane:762-765, 784-787 (reviewed_at læst-flag) | UPDATE | Intet | 0 rækker, tavst — flaget sættes reelt aldrig af rådgivere |
| FileUploadZone:118/134/139/159/210/229 + HbReportUploadZone:92/112/115/127/165/179 + RapporteringView:920 (upload-flows) | INSERT/UPDATE/DELETE egen frisk række | blandet | INSERT passerer "Users can insert own reports" (user_id = rådgiveren selv, intet company-prædikat) — derfor KAN rådgiver-upload lykkes; efterfølgende UPDATE af egen række passerer self-only-politikken |
| reportOverrideHelpers:338/365 (Ret data gem/nulstil) | UPDATE manual_* | error tjekkes | 0 rækker, tavst (error er null ved RLS-filtrering) |
| reportUploadEngine:134 | UPDATE status/quality_signals | Intet | 0 rækker, tavst |
| reportFileAccess:105-108 (file_path-heal) | UPDATE | Intet | 0 rækker, tavst |
| Members.tsx:776 (merge-flow) | UPDATE company_id | Promise.all, ubehandlet | 0 rækker, tavst |

`financial_report_facts`:

| Sted | Operation | Resultat-tjek | Udfald |
|---|---|---|---|
| RapporteringView:966-970 (årsrapport-slet) | DELETE | Intet | Målt: 0 rækker, tavst — trods repoets "Advisors can delete facts" |
| RapporteringView:416-418 (permanent delete) | DELETE på source_report_id | error, ikke antal | Samme klasse |
| Members.tsx:782 (merge-flow) | UPDATE company_id | Ubehandlet | **Ingen UPDATE-politik på facts findes i NOGEN migration** — rammer 0 rækker for ALLE roller, altid tavst. Merge-flowet flytter reelt aldrig faktarækker |

Bemærk til sidste række: medlemmers egen årsrapport-sletning virker i prod
udelukkende fordi rapport-UPDATE'en rammer (company-politikken) og
SECURITY DEFINER-triggeren rydder facts — medlemmet har heller ingen egen
DELETE-politik på facts i migrationerne. Klient-DELETE'en på linje 966-970
er efter alt at dømme dødt kode for medlemmer og (målt) også for rådgivere.
