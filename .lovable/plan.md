

# Komplet kodegennemgang: Fejl, mangler og optimeringer

## Kritisk: Ting der ikke fungerer

### 1. Dashboard (Index.tsx) -- ALT er hardkodet
Hele dashboardet viser statiske, opdigtede tal. Intet er forbundet til databasen:
- KPI-kort: "MRR 115.000 DKK", "87 kunder", "Burn Rate 75.000 DKK", "Runway 14 mdr." -- alt er hardkodet
- `RevenueChart.tsx`: Hardkodet dataset med 6 måneder
- `BudgetOverview.tsx`: Hardkodet budgetkategorier
- `RecentReports.tsx`: Hardkodet rapportliste (ikke fra DB)
- `PerformanceScore.tsx`: Hardkodet metrics og scores
- `AttentionNeeded.tsx`: Hardkodet notifikationer med faste datoer
- `ActivityFeed.tsx`: Hardkodet hændelser, ingen realtime data
- **Fix**: Forbind alle dashboard-widgets til rigtige data fra `financial_reports`, `milestones`, `budget_targets` og `messages`

### 2. KPIs-siden (KPIs.tsx) -- 100% hardkodet
Alle 6 KPI-metrikker (MRR, kunder, churn, LTV, burn, runway) med history-arrays er statiske. Bruger kan hverken redigere targets eller se reelle data.
- **Fix**: Enten forbind til faktiske rapportdata, eller giv bruger mulighed for manuelt at indtaste KPI-værdier

### 3. Financials-siden (Financials.tsx) -- Helt statisk mock
Identisk problem: 4 hardkodede KPI-kort + en statisk transaktionsliste med hardkodede data. Hele siden er en demo.
- **Fix**: Fjern denne side eller forbind den til reelle data

### 4. Group-siden (Group.tsx) -- Hardkodet advisor-data
4 hardkodede advisors med hardkodet aktivitet, kommentartæller og meetings. Intet fra databasen.
- **Fix**: Forbind til `profiles`, `user_roles`, `messages` for rigtige advisor-data

### 5. Budget-siden (Budget.tsx) -- Ikke persisteret
Budget-data gemmes kun i React state (`useState`). Når brugeren forlader siden, forsvinder alle ændringer. Databasetabellen `budget_targets` bruges ALDRIG til at loade eller gemme data.
- Konsolfejl: `ScenarioKPI` modtager ref som function component (forwardRef mangler)
- **Fix**: Load/gem scenarie-data til `budget_targets`-tabellen

### 6. Settings-siden -- Ingen funktionalitet
Kun statiske kort uden onClick-handlere. Intet sker når man klikker.

---

## Vigtige fejl og problemer

### 7. Chat (Chat.tsx) -- N+1 query problem
Linje 56-86: For HVER samtale laver koden 2 individuelle database-kald (lastMsg + unread count). Med 50 samtaler = 100 ekstra queries.
- `activeConvId` mangler i `useEffect`-dependency for loadConversations (linje 97), risikerer stale data
- Realtime mark-as-read (linje 140-145) `.update().eq("id", ...)` afventer aldrig resultatet og har ingen fejlhåndtering

### 8. Members (Members.tsx) -- Samme N+1 problem
Linje 92-133: For HVER profil udføres et individuelt `messages.select()` count-kald. Med 30 medlemmer = 30 ekstra roundtrips.

### 9. useAuth -- Race condition
Linje 40-55: `setTimeout(async () => {...}, 0)` bruges til at hente profil + rolle. Loading sættes til `false` INDEN profil/rolle er hentet. Betyder at `isAdvisor` og `profile` er `null/false` i den første render, hvilket kan vise forkert UI momentant.

### 10. FileUploadZone -- Ingen filvalidering
Filen sendes direkte til processing uden at tjekke:
- Filstørrelse (brugere kan uploade 100MB+ filer)
- Om det faktisk er en støttet filtype (accept-attribut kan omgås)
- Duplikatdetektion (samme fil kan uploades mange gange)

### 11. FinancialOverview -- Duplikerede KPI-labels
Linje 107-133: To KPI-kort har begge label "DB Margin" (linje 116 og 122). Det ene burde hedde "Netto Margin" eller lignende.

### 12. chatActivity.ts -- Systemmeddelelser sendt som bruger
Linje 26: `sender_id: senderId` sættes til den aktuelle bruger, men `message_type: "system"`. Det betyder systemmeddelelser kommer fra brugeren selv, hvilket kan forvirre i chat-visningen.

---

## Optimeringer

### 13. Duplikeret kode
- `parseReportPeriodToKey` / `parseKey` / `DANISH_MONTHS` er kopieret i mindst 4 filer (Reports.tsx, FinancialOverview.tsx, PerformanceOverview.tsx, AIFinancialAnalysis.tsx)
- `formatDKK` er kopieret i mindst 5 filer med variationer
- `getKeyFigures` / `getKF` er kopieret i 3 filer
- `statusConfig` er kopieret i Reports.tsx og MemberDetail.tsx
- **Fix**: Opret en `src/lib/financialUtils.ts` med fælles funktioner

### 14. MemberDetail.tsx -- Duplikerer Reports.tsx logik
`renderExtractedData` i MemberDetail (linje 178-234) viser data helt anderledes end Reports.tsx (linje 259-288). Inkonsistent UX for advisors vs. members.

### 15. `as any` typecast overalt
Mange steder bruges `as any` til at omgå TypeScript, specielt i:
- `chatActivity.ts` linje 25-33
- `AIFinancialAnalysis.tsx` linje 157, 194
- `FileUploadZone.tsx` linje 241
- `Reports.tsx` linje 134, 241

### 16. Financials-siden er overflødig
`Financials.tsx` overlapper fuldstændig med dashboardet + Reports-siden, men med andre (hardkodede) tal. Den skaber forvirring.

---

## Teknisk plan: Prioriteret implementering

### Fase 1: Kritiske database-forbindelser
1. **Budget persistence**: Forbind Budget.tsx til `budget_targets`-tabellen -- load ved mount, gem ved save
2. **Dashboard data**: Erstat hardkodede KPI'er med queries til `financial_reports` (seneste tal) og `milestones` (status)
3. **Fix useAuth race condition**: Vent med `setLoading(false)` til profil og rolle er hentet

### Fase 2: Performance og kvalitet
4. **Fjern N+1 queries** i Chat.tsx og Members.tsx ved at bruge batch-kald eller database-funktioner
5. **Udtrk fælles utilities** til `src/lib/financialUtils.ts`
6. **Fix FinancialOverview** duplikerede labels
7. **Fix ScenarioKPI** forwardRef-fejl

### Fase 3: Overflødig kode
8. **Fjern eller ombyg Financials.tsx** -- enten redirect til /reports eller forbind til reelle data
9. **Forbind Group.tsx** til reelle advisor-data
10. **Tilføj filvalidering** i FileUploadZone (maxstørrelse, duplikatcheck)
11. **Gør Settings-siden funktionel** eller markér tydligt at den er under opbygning

