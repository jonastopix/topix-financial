

## Kompakt rapport-notifikation i chatten

### Problem
Når et medlem uploader en rapport, postes den fulde AI-analyse (overview, alle nøglefund, næste skridt, milestones) som en lang chatbesked. Det er uoverskueligt for advisors der bare vil have et hurtigt overblik.

### Løsning

#### 1. Forenkl chat-beskeden ved upload (`src/components/FileUploadZone.tsx`)

Erstat den lange AI-analyse-besked (linje 434-467) med en **kompakt rapport-kort** besked der kun indeholder:
- Rapporttype + periode (f.eks. "Resultatopgørelse · Januar 2026")
- 3-4 nøgletal på én linje: Omsætning, Udgifter, Resultat (formateret kort)
- Max 1-2 linjer "nøglefund" (kun titler, ikke hele anbefalinger)
- Ingen "Næste skridt", ingen "overview"-tekst, ingen milestone-info

Eksempel på ny besked:
```
📊 Resultatopgørelse · Januar 2026
Omsætning: 302.523 kr. | Udgifter: 292.211 kr. | Resultat: 14.414 kr.
🔴 Kritisk erosion af bruttomarginen · ⚠️ Ubalance mellem løn og værdiskabelse
```

Den eksisterende "📄 Ny rapport uploadet"-besked (linje 336-346) beholdes — den er allerede kort og fin.

AI-analysen gemmes stadig i DB (`ai_analysis` på `financial_reports`) og er tilgængelig via Rapporter-tab i MemberDetail. Den fjernes bare fra chat-beskeden.

#### 2. Tilføj link til original fil i rapport-beskeden

I `context_meta` tilføjes `file_path` så chat-UI kan vise en "Se original fil"-knap direkte i beskeden.

#### 3. Redesign system-besked rendering for rapporter (`src/pages/Chat.tsx`)

For system/AI-beskeder med `context_type === "report"`: render et kompakt kort i stedet for plain text:
- Rapport-titel som header
- Nøgletal i et lille grid (2x2)
- Nøglefund som korte badges/chips
- "Se original fil"-knap (bruger `context_meta.file_path` + `openReportFile()`)
- "Markér som læst"-knap der kalder `handleMarkSingleReportRead`

#### 4. Markér som læst på besked-niveau

Tilføj en "Markér som læst" knap/action direkte på rapport-kortet i chatten (ikke kun i sidebar-listen). Denne kalder den eksisterende `handleMarkSingleReportRead` med rapport-id'et fra `context_id`.

### Filer der ændres
1. `src/components/FileUploadZone.tsx` — forenkl AI-analyse chat-besked, tilføj file_path til context_meta
2. `src/pages/Chat.tsx` — redesign rendering af rapport-system-beskeder til kompakt kort med nøgletal, original-fil link og markér-som-læst

### Bemærkninger
- AI-analysen gemmes stadig i DB — den fjernes kun fra chat
- Eksisterende lange beskeder i chatten forbliver som de er (kun nye uploads påvirkes)
- Ingen database-ændringer nødvendige

