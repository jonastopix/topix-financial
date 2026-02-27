

## Fix mobil-layout -- hele vejen rundt

### Problemet
Screenshottet viser at indhold klippes af pa venstre side pa mobil -- hilsen, sektionsoverskrifter og KPI-kort er alle forskudt. Hovedarsagen er **`App.css`** som indeholder Vite's standard-skabelon styles (`#root { max-width: 1280px; margin: 0 auto; padding: 2rem; }`) der konflikter med app-layoutet.

### Hvad der skal fikses

**1. Fjern Vite-skabelonens `App.css`**
- Hele filen er ubrugt arv fra Vite's starter-template
- `max-width`, `padding: 2rem` og `text-align: center` pa `#root` forarsager layout-forskydning pa alle skarmstorrelser
- Filen slettes helt (eller tommes), da ingen komponenter afhanger af dens klasser

**2. Forbedre mobil-padding i AppLayout**
- Ojg `pt-16` til `pt-14` for bedre plads under hamburger-knappen
- Sikre at `px-4` giver nok luft pa begge sider

**3. Forbedre dashboard-grid pa mobil**
- "Seneste maned" KPI-kortene: `grid-cols-2` er fint, men tekst og badges kan overflowe pa sma skarme -- reducer font-sizes og paddings yderligere
- "Ar til dato" sektionen: `grid-cols-1 sm:grid-cols-3` er korrekt, ingen andring nodvendig
- 4-kolonne snapshot grid (`grid-cols-2 lg:grid-cols-4`): OK
- Sektionsoverskriften "SENESTE MANED" og "AR TIL DATO" clippes pga. `App.css` padding -- fixes automatisk nar `App.css` fjernes

**4. KPICard mobil-optimering**
- Reducer padding yderligere pa sma skarme: `p-3` er allerede sat, men sikre at value-teksten ikke wrapper darligt
- Badges (`ChangeBadge` + budget-badge) kan overflowe i 2-kolonne grid -- tilf0j `text-[9px]` pa mobile og `overflow-hidden` / `truncate` pa badge-containeren

**5. Hamburger-knappens placering**
- Knappen sidder `fixed top-4 left-4` -- fint, men indholdet bag den overlappes delvist. Sikre at greeting-teksten har tilstrakkelig top-margin

### Tekniske detaljer

**Filer der andres:**

1. **`src/App.css`** -- Slet alt indhold (filen importeres muligvis i `main.tsx`, sa vi tomme den i stedet for at slette)
2. **`src/components/AppLayout.tsx`** -- Juster mobil-padding fra `px-4 py-6 pt-16` til `px-5 py-6 pt-16` for lidt mere sideluft
3. **`src/components/KPICard.tsx`** -- Tilf0j `min-w-0` pa badge-containeren for at forhindre overflow, reducer badge-tekst pa mobil
4. **`src/pages/Index.tsx`** -- Tilf0j `overflow-hidden` pa KPI-grid containere for at forhindre horisontal scroll

Alle andringer er rent CSS/className-baserede og paavirker ikke funktionalitet.
