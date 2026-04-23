

## Problem

Når du indtaster omsætning manuelt på årsrapporten, opdateres `financial_report_facts` korrekt i databasen — men dashboardet, KPI-grafer og branche-sammenligning viser stadig de gamle tal (eller 0). Årsagen: `queryClient.invalidateQueries` matcher ikke alle de cache-keys, som de forskellige sider faktisk bruger.

I dag invalideres kun:

```text
["company-facts"]
["dashboard-kpis"]
```

Men `useCompanyFacts` cacher med `["company-facts", companyId]`, og flere widgets bruger nøgler som `["dashboard-budgets", companyId]`, `["financial-reports-chart"]` og `["company-commentaries", companyId]`. React Query matcher kun præfiks når key-arrayet er nøjagtigt det samme præfiks — derfor rammer `["company-facts"]` ikke `["company-facts", "<uuid>"]` på alle versioner / med strict matching i visse hooks.

## Løsning

Udvid invaliderings-blokken i `handleSaveManualRevenue` (linje 424-425 i `src/pages/Reports.tsx`) til at busta alle relevante caches — både med og uden `companyId` — så den manuelt indtastede omsætning slår igennem på Dashboard, KPI-siden og kommentarer med det samme.

## Tekniske detaljer

**Fil der ændres:**

```text
src/pages/Reports.tsx  (kun linje 424-425 i handleSaveManualRevenue)
```

**Diff:**

```text
-      queryClient.invalidateQueries({ queryKey: ["company-facts"] });
-      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
+      // Invalidate with and without companyId to catch all cache variants
+      queryClient.invalidateQueries({ queryKey: ["company-facts"] });
+      queryClient.invalidateQueries({ queryKey: ["company-facts", companyId] });
+      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
+      queryClient.invalidateQueries({ queryKey: ["dashboard-budgets", companyId] });
+      queryClient.invalidateQueries({ queryKey: ["financial-reports-chart"] });
+      queryClient.invalidateQueries({ queryKey: ["company-commentaries", companyId] });
```

**Effektkæde efter fix:**

```text
Indtast omsætning → Gem
   → financial_report_facts opdateres (allerede OK)
   → ALLE relevante React Query caches invalideres
   → useCompanyFacts re-fetcher → Dashboard-tal opdateres
   → KPI Trend-graf re-renderer med nye tal
   → Brancheammenligning og resultatmargin opdateres
   → Eventuelle AI-kommentarer markeres som stale
```

**Ingen DB-ændringer. Ingen logik-ændringer. Kun ekstra cache-invaliderings-kald.**

