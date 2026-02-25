

# Begrans Handlingsplan til seneste 3 rapporter

## Problemet
Handlingsplan-widgetten henter alle rapporter med AI-analyse, hvilket betyder at procenten udvandes over tid efterhaanden som nye rapporter tilfojer nye anbefalinger. Aeldte, irrelevante punkter traekker procenten ned.

## Loesning
En simpel aendring i query-funktionen: Begrans rapporterne til de seneste 3 (de er allerede sorteret med `uploaded_at DESC`). Rapporterne hentes med `.limit(12)` i dag — vi aendrer til `.limit(3)`.

## Teknisk aendring

**Fil:** `src/components/AIProgressWidget.tsx`

Linje 39: Aendr `.order("uploaded_at", { ascending: false })` query til ogsaa at have `.limit(3)` i stedet for at hente alle rapporter.

Konkret tilfojes `.limit(3)` efter `.order(...)` linjen paa rapporter-queryen (der er ingen eksisterende limit paa denne query i modsaetning til dashboard-queryen).

Derudover tilfojes en lille tekst-indikation i widgetten saa brugeren kan se at det er baseret paa de seneste 3 rapporter, f.eks. "Baseret paa seneste 3 rapporter" som subtitle under titlen.

