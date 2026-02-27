

## Chat per virksomhed i stedet for per bruger

Chatten skal omstruktureres, så der er en samtale pr. virksomhed i stedet for pr. bruger. Alle teammedlemmer i samme virksomhed deler den samme samtale.

### Hvad ændres

**1. Visning i sidebar (advisor-visning)**
- Virksomhedsnavnet vises som primært navn i stedet for brugernavnet
- Initialerne i avataren baseres pa virksomhedsnavnet
- Virksomhedens logo vises hvis tilgaengeligt
- Soegning filtrerer pa virksomhedsnavn

**2. Visning i message-header**
- Virksomhedsnavnet vises som overskrift i stedet for brugernavnet
- Afsendernavne vises pa individuelle beskeder, sa man kan se hvem der skrev

**3. Konsolidering af samtaler**
- Conversation-listen grupperes/dedupliceres pa `company_id`
- Hvis der er flere conversations for samme virksomhed, vises den med seneste aktivitet
- Alle teammedlemmer fra en virksomhed kan laese og skrive i samme conversation

**4. Database-trigger opdatering**
- `handle_new_user`-funktionen skal opdateres, sa nye brugere der tilknyttes en eksisterende virksomhed far den eksisterende conversation i stedet for at oprette en ny
- Kun oprette en ny conversation hvis virksomheden ikke allerede har en

**5. RLS-politikker**
- Opdatere "Members can view own conversation" til at bruge `company_id = user_company_id(auth.uid())` i stedet for `member_id = auth.uid()` (dette er allerede delvist pa plads via "Company members" policies)
- Tilsvarende for INSERT og UPDATE

### Tekniske detaljer

**Chat.tsx aendringer:**
- I `ConversationWithProfile` interfacet: tilfoej `companyName` og `companyLogoUrl` felter
- I `loadConversations`: join med `companies` tabellen via `company_id` for at hente virksomhedsnavn
- Deduplicer conversations pa `company_id` (behold den med seneste `last_message_at`)
- Erstat `conv.profile?.full_name` med virksomhedsnavn i sidebar-listen
- I message-omradet: vis afsendernavn (fra profiles) pa hver besked sa man kan skelne teammedlemmer

**Database migration:**
- Opdater `handle_new_user()` triggeren til at genbruge eksisterende conversation for virksomheden:
  ```text
  -- Tjek om virksomheden allerede har en conversation
  -- Hvis ja: brug den eksisterende (opret ikke ny)
  -- Hvis nej: opret en ny conversation med company_id
  ```

**Besked-visning:**
- Hver besked viser afsenderens navn (hentes fra profiles-queryen der allerede eksisterer)
- Advisor-beskeder vises stadig som "Du:" for advisors

**Ingen breaking changes:**
- `member_id` pa conversations beholdes som "oprettet af" reference
- Eksisterende data fungerer stadig - conversations med samme `company_id` konsolideres i UI'et
