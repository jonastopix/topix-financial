

## Fix: "År til dato" skjuler grafen

**Problem**: Grafen (inkl. periodevalget) er wrapped i `trendData.length >= 2`. Tidligt på året har "År til dato" ofte kun 0-1 datapunkter → hele sektionen forsvinder, og man kan ikke skifte tilbage.

**Løsning** i `src/pages/Reports.tsx`:

1. Flyt rendering-betingelsen: Vis altid sektionen med titel + periodevalg, uanset antal datapunkter
2. Vis grafen hvis `trendData.length >= 1` (en enkelt datapunkt er fint for et søjle/punkt-overblik)
3. Hvis `trendData.length === 0`: vis en tom-tilstand med tekst "Ingen data i valgt periode" i stedet for grafen
4. Betingelsen `>= 2` bevares kun for M/M change-indicators (kræver to punkter for sammenligning)

**Sekundært**: Sørg for at sektionen altid er synlig så længe der er *nogen* rapporter i `reportsByMonth` (uanset periode-filter), så brugeren altid kan skifte periode.

**Fil**: `src/pages/Reports.tsx` (linje ~390)

