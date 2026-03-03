
## Send personlig velkomstbesked til 3 accepterede medlemmer

### Hvad skal gøres
Sende en velkomstbesked direkte i chatten til de 3 accepterede medlemmer (Simon Frimann, Nille HH Philbert, og Line Almegaard Bakke) så de får en personlig besked der guider dem i gang med platformen.

### Forudsætning
Line Almegaard Bakke mangler en conversation-record i databasen. Den skal oprettes forst.

### Trin

**1. Opret manglende conversation for Line Almegaard Bakke**
- INSERT i `conversations` med `member_id` = Lines user_id og `company_id` = hendes virksomheds-id
- Kræver en database-migration

**2. Send velkomstbesked til alle 3 via messages-tabellen**
- Indsæt en besked i `messages` for hver brugers conversation med `message_type = 'user'` og `sender_id` = advisor-brugerens id
- Beskeden vil være en personlig velkomst på dansk der guider dem til at komme i gang

### Besked-udkast (kan tilpasses)

> Hej [navn]! Velkommen til The Boardroom. Fedt at du er kommet med. Du kan starte med at uploade din seneste regnskabsrapport under "Rapporter", sa far du automatisk en AI-analyse af din okonomi. Du er ogsa velkommen til at skrive til mig her i chatten hvis du har sporgsmal. Jeg glaeder mig til at folge din rejse!

### Modtagere

| Navn | Virksomhed | Conversation |
|------|-----------|-------------|
| Simon Frimann | Two Socks | Eksisterer |
| Nille HH Philbert | PHILBERT ApS | Eksisterer |
| Line Almegaard Bakke | Line Bakke | Skal oprettes |

### Teknisk detalje
- Conversation oprettes via database-migration (da advisor RLS tillader INSERT)
- Beskeder indsættes som advisor-brugerens id (`23e81de4-...`) som sender
- Beskederne vil vises i brugerens chat naeste gang de logger ind
