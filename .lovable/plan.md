

# Platform Review: The Boardroom — Klar til lancering?

## 1. Sikkerhed — Fortrolige data

**Status: Solid fundament, men et par huller**

RLS-politikkerne er generelt velstrukturerede med `user_company_id()` og `has_role()` security definer-funktioner. Hver tabel er korrekt isoleret, så virksomheder kun kan se egne data, og advisors har adgang til alt.

**Fundne problemer:**

- **Manglende input-validering i Settings**: Virksomhedsdata (CVR, telefon, website) gemmes uden sanitering eller længdebegrænsninger. En bruger kan i princippet indsætte meget lange strenge eller specialtegn.
- **Chat: Ingen længdebegrænsning server-side**: Kommentarer på rapporter begrænses til 2000 tegn client-side, men chat-beskeder har ingen begrænsning.
- **`company_invitations` mangler RLS for advisors INSERT**: Advisors kan se og opdatere invitationer, men kan ikke oprette dem. Skal de kunne det?
- **`handleOverwrite` i FileUploadZone opretter rapport uden `company_id`**: Ved overwrite sættes `company_id` ikke eksplicit i insert-objektet, hvilket potentielt giver en rapport uden virksomhedstilknytning.
- **`financial-documents` storage bucket er privat** (korrekt), men der er ingen upload til bucketen — filer sendes kun som tekst til Edge Functions. Bucketen bruges ikke.

**Anbefaling:**
- Tilføj Zod-validering til Settings-formularer (CVR-format, max-længder)
- Tilføj max-længde på chat-beskeder (f.eks. 5000 tegn)
- Fix overwrite-flowet til at inkludere `company_id`
- Overvej at fjerne `financial-documents` bucketen hvis den ikke bruges

---

## 2. Bugs i uploads, links og sammenfletninger

**Fundne problemer:**

- **Overwrite-bug**: I `handleOverwrite` i `FileUploadZone.tsx` indsættes en ny rapport-record UDEN `company_id`, så den nye rapport ikke knyttes til virksomheden. Dette betyder overskrevne rapporter potentielt "forsvinder" fra virksomhedens data.
- **Delete company fjerner IKKE tilknyttede rapporter, handouts, milestones eller budget_targets**: Når en advisor sletter en virksomhed, slettes kun `conversations` og `company_members`, men resterende data (rapporter, handouts, milestones, budgets) bliver "forældreløs" i databasen.
- **Merge-flow mangler `kpi_targets` og `kpi_benchmarks`**: Ved flytning af en bruger til en anden virksomhed flyttes rapporter, handouts, milestones og budgets — men KPI-targets og benchmarks følger ikke med.
- **Chat: Ingen markering af egne automatiske beskeder**: Aktivitetsbeskeder postes med brugerens `sender_id`, men vises som om brugeren selv skrev dem. Det kan forvirre.

---

## 3. Funktioner der er "fyld" og ikke giver værdi

**Kandidater til forenkling:**

- **`circle_course_progress` tabel og alt relateret kode**: Vi har netop bekræftet at data ikke kan hentes. Tabellen, queries i Members.tsx, og det hele med `courses_completed`/`courses_total` er dead code.
- **`profiles.company_name` felt**: Bruges i Settings men er redundant med `companies.name`. Skaber forvirring om hvilken der er "den rigtige".
- **`BudgetImport` (Excel-import af budget)**: Kræver at en Edge Function kører — men giver den faktisk medlemmerne værdi vs. manuelt budget-input?

---

## 4. Visuelle grafer og widgets — forvirring vs. værdi

**Vurdering af dashboard-widgets:**

| Widget | Værdi | Vurdering |
|--------|-------|-----------|
| 4x KPI-kort (Omsætning, Udgifter, Resultat, Bank) | Hoej | Klar og direkte — behold |
| AttentionNeeded | Hoej | Handlingsorienteret — behold |
| PerformanceScore (cirkel med 4 delscores) | Medium | Giver overblik, men "score" kan forvirre. Vaegt-beregningen er ikke transparent for brugeren |
| RevenueChart | Hoej | Behold |
| AIProgressWidget (compact) | Lav-Medium | Viser % af AI-anbefalinger fulgt op. Kan forvirre nye brugere der ikke forstaar hvad "AI Progress" betyder |
| BudgetOverview (compact) | Medium | Fine |
| DashboardMilestones (compact) | Medium | Fine |
| DashboardHandouts (compact) | Medium | Fine |

**Anbefaling:**
- **PerformanceScore**: Overvej at gøre den mere forklarende eller simplificere til 1-2 nøgletal i stedet for 4 subscores
- **AIProgressWidget**: Overvej at omdøbe til noget mere forståeligt, f.eks. "Handlingsplan" eller "Anbefalinger"

---

## 5. Gamification

**Nuvaerende tilstand:**

- Medlemmer ser personlig fremgang med point, niveauer (Starter, Aktiv, Mester) og progress-bar
- Advisors ser Top 5 leaderboard med fulde navne og initialer
- Point: 10 per rapport, 25 per milestone

**Problemer og risici:**

- **Leaderboardet viser fulde navne til advisors**: Det er fint internt, men advisors bør ikke utilsigtet dele denne info
- **Medlemmer ser KUN egen score — ingen benchmark**: De har ingen idé om de klarer sig godt relativt til andre. Det fjerner en del af motivationen
- **Forslag**: Tilføj et anonymiseret "gennemsnit for fællesskabet" eller en percentil-indikator (f.eks. "Du er i top 30%") uden at udstille individuelle navne
- **Manglende gamification for handouts**: Handout-udfyldelse giver ingen point, selvom det er en kærneopgave

---

## 6. Andre anbefalinger for en high-end Advisory Board platform

**Onboarding:**
- Der er ingen guided onboarding for nye medlemmer. Første gang en bruger logger ind, ser de et tomt dashboard uden vejledning. Overvej en "Kom i gang"-guide eller checklist.

**Branding og professionalisme:**
- Platformens navn styres via `app_config` (godt!), men sidebar viser "Founder Platform" / "Advisor Panel" — sørg for det matcher "The Boardroom" branding.

**Mobile oplevelse:**
- Sidebar er responsiv, men chat-layoutet (fast højde, todelt visning) fungerer sandsynligvis ikke godt på mobil.

**Notifikationer:**
- Ingen email-notifikationer. Når en advisor sender en besked, ser medlemmet det kun næste gang de logger ind. For et high-end advisory board er det kritisk at have email-notifikationer ved nye beskeder.

**Data-export:**
- Ingen mulighed for at eksportere data (rapporter, KPI-historik). High-end klienter forventer at kunne trække data ud.

---

## Anbefalet handlingsplan (prioriteret)

### Must-fix for lancering:
1. Fix overwrite-bug i FileUploadZone (manglende `company_id`)
2. Fix delete company flow (slet al tilknyttet data)
3. Fix merge flow (inkludér `kpi_targets` og `kpi_benchmarks`)
4. Tilføj input-validering i Settings
5. Tilføj max-længde på chat-beskeder
6. Ryd op i dead code fra `circle_course_progress`

### Nice-to-have for lancering:
7. Omdøb "AI Progress" til noget mere forståeligt
8. Tilføj anonym fællesskabs-benchmark i gamification
9. Tilføj gamification-point for handout-udfyldelse
10. Simpel onboarding for nye medlemmer
11. Email-notifikationer (kræver email-service)

