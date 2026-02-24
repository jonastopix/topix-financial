

# Handouts -- Interaktiv Udviklingsplan for Medlemmer

## Overblik

En ny underside (`/handouts`) hvor medlemmer udfylder, gemmer og udvikler deres handouts for hvert forretningsmodul. Systemet kobler svar til milestones, giver AI-sparring, og lader radgivere folge med i realtid.

## Struktur i de 5 handouts

Alle 5 handouts folger samme monster med 3 sektioner:

```text
+---------------------------------------------+
|  HANDOUT (fx "Salg")                        |
+---------------------------------------------+
|  Sektion 1: Nuvaerende situation            |
|    - 4-5 aabne sporgsmal (textarea)         |
+---------------------------------------------+
|  Sektion 2: Mal                             |
|    - 1-2 aabne sporgsmal (textarea)         |
|    - Tjekliste (checkboxes)                 |
+---------------------------------------------+
|  Sektion 3: Loftstaenger & refleksioner     |
|    - 2-4 loftstaenger (nummereret)          |
|    - Vigtigste naeste skridt (textarea)     |
|    - Vaneanndringer (nummereret)            |
+---------------------------------------------+
```

Det overordnede handout ("Maalsaetning 12 mdr.") har en lidt anden struktur: Nuvaerende situation, Mal for forretningen, Motivationsark.

## Database-design

### Ny tabel: `handouts`

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| id | uuid PK | |
| user_id | uuid | Ejer |
| module | text | 'overordnet', 'bogholderi', 'administration', 'salg', 'marketing' |
| responses | jsonb | Alle svar som struktureret JSON |
| checklist | jsonb | Tjekliste-status som `{"item_key": true/false}` |
| levers | jsonb | Array af loftstaenger med titel + status |
| status | text | 'not_started', 'in_progress', 'completed' |
| ai_feedback | jsonb | Seneste AI-feedback (sparring) |
| ai_feedback_at | timestamptz | Hvornaar AI sidst gav feedback |
| completed_at | timestamptz | Hvornaar handoutet blev markeret faerdigt |
| created_at | timestamptz | |
| updated_at | timestamptz | |

RLS: Medlemmer ser egne, radgivere ser alle. CRUD for ejere.

### Ny tabel: `handout_lever_milestones`

Kobling mellem en loftestang i et handout og en milestone:

| Kolonne | Type |
|---------|------|
| id | uuid PK |
| handout_id | uuid FK -> handouts |
| lever_index | int | Hvilken loftestang (0-baseret) |
| milestone_id | uuid FK -> milestones |
| created_at | timestamptz |

## Frontend-arkitektur

### Ny side: `/handouts`

Oversigt med 5 kort (et pr. modul) der viser:
- Modulnavn + ikon
- Status-badge (Ikke startet / I gang / Udfyldt)
- Progress-bar baseret paa antal udfyldte felter
- Klik aabner det paagaeldende handout

### Handout-detailvisning (samme side, som panel/dialog eller nested route)

- Tabs eller accordion for de 3 sektioner
- Auto-save med debounce (gemmer efter 1.5 sek inaktivitet)
- Visuelt "gem"-indikator (som Google Docs: "Gemt" / "Gemmer...")
- Tjekliste-items som interaktive checkboxes
- Loftstaenger med mulighed for at oprette/linke milestones direkte

### AI Sparring-knap

- "Faa AI-sparring" knap paa hvert handout
- Kalder en edge function der sender handout-svar + modul-kontekst til Lovable AI
- AI'en giver konkret, konstruktiv feedback paa svarene
- Feedback vises i en dedikeret sektion under handoutet
- Radgivere kan ogsaa trigge AI-sparring for et medlem

### Milestone-integration

- Naar et medlem skriver en loftestang, kan de klikke "Opret som milestone"
- Dette opretter en milestone i `milestones`-tabellen og linker den via `handout_lever_milestones`
- Progress paa linkede milestones vises direkte ved loftestangen
- Naar en milestone faerdiggoeres, opdateres visningen automatisk

## Edge Function: `handout-ai-feedback`

- Modtager: `handout_id` + `module`
- Henter handout-svar fra databasen
- Sender til Lovable AI med modul-specifik system-prompt
- Gemmer feedback i `handouts.ai_feedback`
- Returnerer feedback til klienten

System-prompten vil vaere skraeeddersyet til hvert modul og instruere AI'en i at:
1. Anerkende det medlemmet har skrevet
2. Stille opfolgende sporgsmal der driver dybere refleksion
3. Foresla konkrete naeste skridt
4. Paapege blinde vinkler eller muligheder

## Sidebar-navigation

Tilfoej "Handouts" som nyt nav-item med `ClipboardList`-ikon, placeret efter "Milestones".

## Raadgiver-visning

Naar en raadgiver ser et medlems profil (`/members/:userId`), vises en oversigt over medlemmets handout-status med mulighed for at klikke ind og se svarene.

## Implementeringsrakkefolge

1. Database-migration (2 tabeller + RLS)
2. Handout-konfiguration (sporgsmal, tjeklister pr. modul -- som TypeScript-konstanter)
3. Handouts oversigtsside + routing
4. Handout-detailvisning med auto-save
5. Milestone-kobling (opret fra loftestang)
6. Edge function til AI-sparring
7. AI-feedback UI
8. Raadgiver-adgang i MemberDetail
9. Sidebar-opdatering

## Filer der oprettes/aendres

| Fil | Aendring |
|-----|----------|
| Migration SQL | Ny tabel `handouts` + `handout_lever_milestones` + RLS |
| `src/lib/handoutConfig.ts` | Ny -- sporgsmal og tjekliste-definitioner for alle 5 moduler |
| `src/pages/Handouts.tsx` | Ny -- oversigtsside |
| `src/components/HandoutDetail.tsx` | Ny -- detail/udfyldning med auto-save |
| `src/components/HandoutCard.tsx` | Ny -- kort paa oversigtssiden |
| `src/components/HandoutAIFeedback.tsx` | Ny -- AI feedback-visning |
| `src/components/HandoutLeverItem.tsx` | Ny -- loftestang med milestone-kobling |
| `supabase/functions/handout-ai-feedback/index.ts` | Ny edge function |
| `src/App.tsx` | Tilfoej `/handouts` route |
| `src/components/AppSidebar.tsx` | Tilfoej "Handouts" nav-item |
| `src/pages/MemberDetail.tsx` | Tilfoej handout-oversigt for raadgivere |

