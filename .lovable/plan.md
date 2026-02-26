

# Pin beskeder i chatten

## Hvad der bygges
En pin-funktion sa brugere kan fremhaeve vigtige beskeder i en samtale. Pinnede beskeder vises i et kompakt panel ovenover beskedlisten, sa man altid hurtigt kan finde dem.

## Brugeroplevelse
- Hover over en besked -> et lille pin-ikon dukker op
- Klik pa pin-ikonet for at pinne/unpinne
- Ovenover beskedlisten vises et sammenfoldeligt "Pinned" panel med alle pinnede beskeder
- Klik pa en pinned besked scroller ned til den i samtalen

## Teknisk plan

### 1. Database: Tilfoj `pinned_at` kolonne til `messages`
- Tilfojer en nullable `timestamp with time zone` kolonne `pinned_at` til `messages`-tabellen
- Null = ikke pinned, vaerdi = pinned tidspunkt
- Opdaterer eksisterende RLS-policies sa bade advisors og members kan update `pinned_at` (advisors har allerede UPDATE, members far en ny policy for pin)

```sql
ALTER TABLE public.messages ADD COLUMN pinned_at timestamptz DEFAULT NULL;

-- Members can pin/unpin messages in own conversations
CREATE POLICY "Members can update own conversation messages"
  ON public.messages FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM conversations
    WHERE conversations.id = messages.conversation_id
    AND conversations.member_id = auth.uid()
  ));
```

### 2. UI: Chat-siden (`src/pages/Chat.tsx`)
- **Pin-knap pa beskeder**: Ved hover vises et `Pin`-ikon (fra lucide-react). Klik toggler `pinned_at` via Supabase update
- **Pinned-panel**: Et sammenfoldeligt panel ovenover beskedlisten der viser pinnede beskeder i kompakt form (afsender, uddrag, dato). Klik pa en pinned besked scroller til den
- **Visuel markering**: Pinnede beskeder far en lille pin-indikator og let baggrundsfremhaevning direkte i beskedlisten

### Filer der aendres
- **Database migration**: Tilfojer `pinned_at` kolonne + RLS policy
- **`src/pages/Chat.tsx`**: Pin-knap, pinned-panel, scroll-to-message logik

