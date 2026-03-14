

## Feedback-funktion for virksomheder

### Koncept
En letvægts feedback-knap tilgængelig fra alle sider (floating action button), der åbner en kompakt dialog hvor virksomhedsmedlemmer kan indsende feedback kategoriseret som **bug**, **forslag** eller **andet**. Alt samles i en admin-side med overblik og status-håndtering.

### Struktur

**Database: `feedback` tabel**
- `id`, `user_id`, `company_id`, `category` (bug/suggestion/other), `title`, `description`, `status` (new/acknowledged/resolved), `created_at`, `resolved_at`, `admin_note`
- RLS: Brugere kan INSERT og SELECT egne. Advisors kan SELECT/UPDATE alle.

**Frontend-komponenter:**

1. **FeedbackButton** — Floating knap (nederste højre hjørne) med `MessageSquarePlus`-ikon, synlig for alle authenticated brugere. Åbner en dialog.

2. **FeedbackDialog** — Kompakt formular:
   - Kategori-valg (3 ikoner: Bug / Forslag / Andet)
   - Titel (kort tekst)
   - Beskrivelse (textarea)
   - Submit → insert i `feedback`-tabellen + toast-bekræftelse

3. **Admin Feedback-side** (`/admin/feedback`) — Tabel med alle indsendte feedback-items:
   - Filtrér på kategori og status
   - Vis virksomhedsnavn, bruger, dato
   - Mulighed for at markere som acknowledged/resolved og tilføje intern note
   - Tilgængelig via AdminRoute

**Sidebar:** Nyt menupunkt under admin-sektionen: "Feedback" med badge-count for nye items.

### Teknisk plan

| Trin | Beskrivelse |
|------|-------------|
| 1 | Database migration: opret `feedback`-tabel med RLS-politikker |
| 2 | `FeedbackDialog.tsx` — formular-komponent med kategori, titel, beskrivelse |
| 3 | `FeedbackButton.tsx` — floating knap der renders i `AppLayout`, åbner dialogen |
| 4 | `/admin/feedback` side med tabel, filtre og status-håndtering |
| 5 | Tilføj route i `App.tsx` (AdminRoute) og menupunkt i `AppSidebar.tsx` |
| 6 | Badge i sidebar der viser antal ubehandlede feedback-items |

