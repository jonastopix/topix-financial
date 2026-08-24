# Spor 3 — budget mod realiseret

**Besluttet**: 2026-08-24
**Status**: Form besluttet. Implementering ikke påbegyndt.
**Grundlag**: `docs/spor3-recon.md`-fund og verifikation mod alle otte skabeloner 2026-08-24.
**Følger**: `docs/import-model-design.md` §3 (de tre lag) og §8 (spor 3).

---

## 1. Problemet

Efter import viser budget mod realiseret "ikke koblet til rapportfelt" på næsten hver linje. Sammenligningen er tom for ethvert importeret budget.

Årsagen er `getBudgetRowReportField` (`budgetEngine.ts:286-292`), der slår op på rækkens **nøgle** i `REPORT_FIELD_TO_BUDGET_KEYS`. Importerede linjer har nøgler på formen `import_{slug}_{raekkeIndex}`, som ikke står i mappingen.

### Men problemet er større end importen

Verificeret mod alle otte skabeloner 2026-08-24:

- **27 af 44 skabelon-nøgler står ikke i mappingen.** SaaS-skabelonens tre lønlinjer (`loenninger_admin`, `loenninger_dev`, `loenninger_salg`) viser "ikke koblet", selvom `loenninger`-feltet findes. Det samme gælder alle rejseposter, hosting, uddannelse, materialer og elleve driftsposter.
- **12 af mappingens 31 nøgler findes ikke i nogen skabelon.** Den kobler til kategorier der ikke eksisterer: `direkte_omk`, `produktions_omk`, `personale`, `konsulenter_freelance`, `rekruttering`, `personale_udvikling`, `reklame`, `leje_lokaler`, `el_vand_varme`, `admin`, `it_udstyr`, `revision_jura`, `kontorhold`, `andet`.

Broen er altså mangelfuld for jeres egne skabeloner, ikke kun for importerede budgetter. Den er kurateret i hånden og aldrig vedligeholdt.

---

## 2. Opdagelsen

De seks visningsgrupper og de seks rapportfelter er den samme opdeling under to navne.

| Visningsgruppe | Rapportfelt | Canonical |
|---|---|---|
| `indtaegter` | `omsaetning` | `revenue` |
| `variable` | `direkte_omkostninger` | `cogs` |
| `personale` | `loenninger` | `payroll` |
| `salg_marketing` | `salgsomkostninger` | `sales_costs` |
| `faste` | `lokaleomkostninger` | `facility_costs` |
| `drift` | `administrationsomkostninger` | `admin_costs` |

`REPORT_FIELD_TO_BUDGET_KEYS` er derfor en redundant genkodning af det `group` allerede siger — bare via nøgle i stedet for via gruppe, og derfor kun for de nøgler nogen huskede at skrive ind.

**Konsekvens:** slår `getBudgetRowReportField` op på `row.group` frem for `row.key`, kobles hver eneste budgetlinje — importeret som skabelon-baseret — uden ny datamodel og uden ekstra valg for medlemmet.

Gruppevalget gør to ting med ét klik: det bestemmer hvor linjen står, og hvad den sammenlignes med.

### Verifikationens undtagelser

Afbildningen rapportfelt → gruppe er entydig for fire af seks felter. To har undtagelser:

- `direkte_omkostninger` rummer `lager_logistik`, som har gruppen `drift`
- `administrationsomkostninger` rummer `tech_software` og `platform_tech` (gruppe `drift`) samt `admin_regnskab` og `forsikring` (gruppe `faste`)

Disse er uenigheder i den håndkuraterede mapping, ikke reelle tvetydigheder. Lager og logistik er regnskabsmæssigt en driftsomkostning, ikke en direkte omkostning.

**B1 — gruppen vinder.** Vælger medlemmet Faste for en linje, sammenlignes den med lokaleomkostninger. Forudsigeligt, og medlemmet kan flytte linjen til Drift hvis den hører til administration. Deres valg frem for en skjult tabel.

---

## 3. Granulariteten

`financial_report_facts` holder **ét `metrics`-jsonb pr. (company_id, period_key)** med UNIQUE-constraint (`20260316210844:18`). Der er ingen linjerækker. Regnskabssiden har seks sammenlignelige tal pr. måned, uanset hvor mange budgetlinjer medlemmet har.

Linjeniveau findes opstrøms i `financial_reports.normalized_data.raw_lines` og `normalized_lines`, men ingen læser dem (jf. `import-model-design.md` §7.2).

### Hvad det betyder for fladen

I dag sammenlignes hver budgetlinje mod HELE rapportfeltets realiserede tal, markeret "(delt felt)" (`HbBudgetBva.tsx:71-86`). Har man ti linjer under drift og de faktiske administrationsomkostninger er 100.000, viser alle ti "100.000 realiseret". Det er opfundet præcision.

Når hver linje kobles, bliver det værre — derfor skal fladen ændres samtidig.

**B2 — sammenlign pr. gruppe, ikke pr. linje.** Summen af medlemmets linjer i en gruppe stilles op mod gruppens ene realiserede tal. Linjerne foldes ud nedenunder med kun budgettal og andel af gruppen.

Det er ærligt: regnskabet kan ikke bryde finere ned, så sammenligningen skal ikke lade som om.

---

## 4. Hvad der bygges

1. **Linjeniveau-overstyring af gruppen i importgitteret.** Sektionen sætter alle sine linjer; medlemmet retter den enkelte hvor gættet ikke holder. Topix' resultatbudget har én sektion "OMKOSTNINGER" med fem forskellige kategorier i — sektionsvalg alene er for groft.

2. **`getBudgetRowReportField` slår op på gruppen.** Seks par, én retning. `REPORT_FIELD_TO_BUDGET_KEYS` og det nuværende opslag slettes.

3. **`HbBudgetBva` sammenligner pr. gruppe.** Gruppesum mod gruppens realiserede tal; linjer nedenunder uden opfundet realiseret tal.

---

## 5. Åbne spørgsmål

**5.1 `ebit` og to balancefelter når facts, men er usynlige.**
`ebit`, `trade_payables` og `unbilled_wip` står i SQL-whitelisten (18 nøgler) men har ingen dansk nøgle i `factsAdapter.ts:22-40`. De gemmes og kan ikke vises af nogen flade.

**5.2 To kopier af canonical→dansk der ikke er enige.**
`factsAdapter.ts` har 17 par inkl. `ebitda`; `reportOverrideHelpers.ts` har 16 uden `ebitda`/`ebit`. Én af dem burde være den eneste.

**5.3 KPI-siden og budgetsiden regner omkostninger forskelligt.**
`calcTotalExpenses` (`financialUtils.ts:186-194`) summerer seks bidrag **inklusive** afskrivninger. `HbBudgetBva.tsx:99-104` summerer fem **uden**. Samme virksomhed viser derfor forskellige totalomkostninger på KPI-fladen og budgetfladen. BvA'ens EBITDA er korrekt pr. definition; uenigheden ligger i hvad "omkostninger" betyder.

**5.4 De 27 ukoblede skabelon-nøgler.**
Løses automatisk af B1, da de alle har en gruppe. Bør verificeres efter implementering.

---

## 6. Hvad der ikke er besluttet

Om `financial_reports.normalized_data.normalized_lines` på sigt skal bruges til linje-mod-linje-sammenligning. Materialet findes, men linjenavne matcher sjældent ordret på tværs af budget og bogføring — se `import-model-design.md` §6.5.
