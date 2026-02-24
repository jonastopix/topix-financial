

# To Nye Features: AI Budget fra Regnskab + Chat med Emner

## Feature 1: AI-genereret Budget fra Resultatopgoerelse

### Idé
Upload et aarsregnskab (resultatopgoerelse), og AI'en laesser ALLE linjer, forstaar strukturen, og genererer automatisk et 12-maaneders budget for det kommende aar — med en valgfri vaekstprocent.

### Brugerflow

```text
Budget-side (ingen budget endnu)
        |
  [Upload resultatopgoerelse]  <-- ny knap ved siden af Excel-import
        |
  AI analyserer alle linjer
        |
  Bruger vaelger vaekst-scenarie:
  [ 0% flat ] [ +10% ] [ +20% ] [ Tilpas X% ]
        |
  Preview: maanedligt budget med saeson-fordeling
  (AI fordeler aarstal paa 12 maaneder baseret paa historisk moenster)
        |
  [Godkend og importér]
        |
  Budget fyldt ud, klar til redigering
```

### Teknisk Plan

**Ny edge function**: `supabase/functions/generate-budget-from-accounts/index.ts`
- Modtager PDF-filindhold (base64) eller allerede ekstraheret data fra en financial_report
- Bruger Lovable AI (gemini-2.5-flash) til at:
  1. Laesse ALLE linjer i resultatopgoerelen
  2. Mappe dem til budget-kategorier (omsaetning, loenninger, marketing, lokaler osv.)
  3. Fordele aarstotaler paa 12 maaneder (med saesonkorrektion baseret paa eventuelle maanedlige data)
  4. Applicere vaekstprocenten
- Returnerer struktureret budget i samme format som import-budget-excel

**Ny komponent**: `src/components/BudgetFromAccounts.tsx`
- Upload-zone specifikt til resultatopgoerelser (PDF)
- Vaekst-slider/selector: 0%, 5%, 10%, 15%, 20%, custom
- Preview af det genererede budget med sammenligning mod sidste aars tal
- Godkend-knap der gemmer til budget_targets

**Aendring**: `src/pages/Budget.tsx`
- Tilfoej BudgetFromAccounts som et alternativ i TemplatePicker (ved siden af BudgetImport)
- "Importer fra regnskab" som ny option med forklaring

**Aendring**: `src/components/BudgetImport.tsx`
- Tilfoej support for PDF-filer ud over Excel (send til den nye edge function i stedet)

### AI Prompt-strategi
- Systemet sender hele resultatopgoerelsen til AI'en
- AI'en returnerer: kategori-key, aarsbeloeb, foreslaaet maanedlig fordeling, og de originale linjer der er inkluderet
- Vaekstprocenten appliceres client-side paa hvert beloeb foer gemning

---

## Feature 2: Chat med Emne-baseret Organisering

### Problem
Én lang traad gør det svaert at finde specifikke samtaler om rapporter, handouts, milestones eller generel sparring.

### Loesning: Emne-tags og Filtrering

I stedet for at splitte i separate samtaler (som ville bryde den eksisterende 1:1 konversationsmodel), tilfoej **emne-tags** paa beskeder og **filtrering** i chat-viewet.

```text
+------------------------------------------+
| Chat med raadgivere                       |
|                                          |
| Filter: [Alle] [Rapporter] [Handouts]   |
|         [Milestones] [Sparring]          |
+------------------------------------------+
| [Rapport-ikon] Re: Januar 2026           |
| "Din omsaetning er steget 15%..."         |
|                                          |
| [Milestone-ikon] Re: Nyt CRM system     |
| "Godt gaaet med milestone..."             |
|                                          |
| [Chat-ikon] Generel sparring             |
| "Hej, jeg taenkte paa..."                |
+------------------------------------------+
| Skriv besked...  [Emne: v] [Send]        |
+------------------------------------------+
```

### Teknisk Plan

**Database**: Tabellen `messages` har allerede `context_type` og `context_meta` felter. Disse bruges allerede til system-beskeder. Vi udvider brugen til ogsaa at gaelde bruger-beskeder.

**Ingen migration noodvendig** — felterne eksisterer allerede.

**Aendring**: `src/pages/Chat.tsx`

1. **Emne-vaelger ved besked-input**: Tilfoej en dropdown ved siden af input-feltet hvor brugeren kan vaelge emne:
   - Generelt (default, ingen context_type)
   - Rapportering (context_type = "report")
   - Handouts (context_type = "handout")
   - Milestones (context_type = "milestone")
   - Budget (context_type = "budget")

2. **Emne-filter i besked-visningen**: Tilfoej filterknapper over besked-omraadet:
   - "Alle" — viser alt
   - "Rapporter" — kun context_type = "report" eller system-beskeder om rapporter
   - "Handouts" — context_type = "handout"
   - "Milestones" — context_type = "milestone"
   - "Budget" — context_type = "budget"
   - "Sparring" — beskeder UDEN context_type (generel snak)

3. **Visuel emne-markering**: Hver besked faar et lille farvet tag/ikon der viser emnet, saa man hurtigt kan skimme traaden.

4. **Gem context_type paa bruger-beskeder**: Naar brugeren sender en besked med et valgt emne, gemmes context_type og evt. context_meta.

### Visuelt Design
- Emne-tags bruger farvekodning: Rapporter (blaa), Handouts (groen), Milestones (lilla), Budget (orange), Sparring (graa)
- Filteret er en horisontal chip-raekke under chat-headeren
- Naar et filter er aktivt, vises kun relevante beskeder (men med en "Vis alle" knap)

---

## Opsummering af Filer

### Nye filer
| Fil | Beskrivelse |
|-----|-------------|
| `supabase/functions/generate-budget-from-accounts/index.ts` | Edge function der bruger AI til at generere budget fra regnskab |
| `src/components/BudgetFromAccounts.tsx` | UI-komponent til upload + vaekst-valg + preview |

### Filer der aendres
| Fil | Aendring |
|-----|----------|
| `src/pages/Budget.tsx` | Tilfoej BudgetFromAccounts i TemplatePicker |
| `src/pages/Chat.tsx` | Emne-vaelger, emne-filter, visuel emne-markering |
| `supabase/config.toml` | Tilfoej generate-budget-from-accounts function config |

### Ingen database-migrationer
- `messages.context_type` og `messages.context_meta` eksisterer allerede
- `budget_targets` bruges som-er

