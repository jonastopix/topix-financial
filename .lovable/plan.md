

## Tilføj virksomhedsvalg for rådgivere på Dashboard, Rapportering og Milestones

### Problem
Dashboard (`/`), Rapportering (`/reports`) og Milestones (`/milestones`) viser tomt indhold eller loader uendeligt for rådgivere uden valgt virksomhed -- samme problem som allerede er løst for Budget, KPI'er og Handouts.

### Løsning
Tilføj samme mønster som på de tre andre sider: importér `isAdvisor` fra `useAuth` og vis `AdvisorCompanyPrompt` når `isAdvisor && !companyId`.

### Tekniske ændringer

**3 filer ændres -- identisk mønster i hver:**

1. **`src/pages/Index.tsx`** (Dashboard)
   - Importér `AdvisorCompanyPrompt`
   - Udvid `useAuth()` med `isAdvisor`
   - Tilføj tidlig return med `<AppLayout><AdvisorCompanyPrompt /></AppLayout>` når `isAdvisor && !companyId`

2. **`src/pages/Reports.tsx`** (Rapportering)
   - Samme mønster: importér, tjek, vis prompt

3. **`src/pages/Milestones.tsx`** (Milestones)
   - Samme mønster: importér, tjek, vis prompt

Ingen nye filer, ingen backend-ændringer. Genbruger den eksisterende `AdvisorCompanyPrompt`-komponent.
