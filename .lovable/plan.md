## Mørkt tema: spred flade-lagene mere

### src/index.css (.dark-blokken)
- `--background`: `170 30% 8%` → `170 30% 6%`
- `--card`: `170 22% 10%` → `170 22% 15%`
- `--border`: `170 18% 18%` → `170 18% 26%`

Alle andre tokens og `.glass-card`-utility røres ikke.

### src/components/GroupDashboardContent.tsx (~linje 349)
Skift containerens className fra:
`rounded-xl border border-border bg-card p-5`
til:
`glass-card rounded-xl p-5`

Ingen andre ændringer.