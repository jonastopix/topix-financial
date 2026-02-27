

# Vis deltagere i chat-tråden

## Oversigt
Tilf en deltager-sektion i chat-headeren der viser navnene p de teammedlemmer der tilhorer virksomheden, samt alle advisors. Alle advisors deler samme trad per virksomhed.

## Hvordan det virker i dag
- Hver virksomhed har en samlet conversation (deduplikeret pa company_id)
- Headeren viser kun virksomhedens navn og logo
- Der er ingen synlighed over hvem der er med i traden

## Plan

### 1. Hent deltagere for aktiv conversation
Nar en conversation valges, hent:
- **Teammedlemmer**: Fra `company_members` + `profiles` baseret pa conversationens `company_id`
- **Advisors**: Fra `user_roles` (role = advisor/admin) + `profiles`

### 2. Vis deltagere i chat-headeren
Under virksomhedsnavnet i headeren (linje ~714-718), tilf en linje med:
- Stablede avatar-cirkler (overlappende, max 4-5 synlige)
- Navne som komma-separeret tekst i lille skrift, f.eks. "Jonas, Maria, Peter + 2 advisors"
- Kort og kompakt sa det ikke tager for meget plads

## Teknisk implementering

### Fil: `src/pages/Chat.tsx`

**Ny state og data-fetch:**
- Tilf `participants` state med liste af `{ user_id, full_name, avatar_url, isAdvisor }`
- I en `useEffect` der korer nar `activeConvId` andres, hent:
  1. Company members via `company_members` joined med `profiles` for den aktive conversations `company_id`
  2. Alle advisors via `user_roles` (role in advisor, admin) joined med `profiles`
- Kombiner til en samlet deltagerliste

**Header-andring (advisor-view, linje ~694-725):**
- Under virksomhedsnavnet, tilf en lille linje med:
  - Stablede avatarer (3-4 max synlige, med +N indicator)
  - Navne i `text-[11px] text-muted-foreground`
  - Format: "Jonas P., Maria H. + 2 radgivere"

**Member-view:**
- For medlemmer vises ogsa en kompakt deltagerliste, men her er det primart "Dine radgivere: Jonas, Maria" eller lignende

### Queries
```sql
-- Team members for company
SELECT p.user_id, p.full_name, p.avatar_url
FROM company_members cm
JOIN profiles p ON p.user_id = cm.user_id
WHERE cm.company_id = :company_id

-- All advisors
SELECT p.user_id, p.full_name, p.avatar_url
FROM user_roles ur
JOIN profiles p ON p.user_id = ur.user_id
WHERE ur.role IN ('advisor', 'admin')
```

Ingen database-andringer krevet - alle novendige tabeller og RLS-policies er allerede pa plads.
