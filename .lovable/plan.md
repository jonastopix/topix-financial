
Mål: Fjerne falske “ulæste beskeder” for `jonas+test14@topix.dk`, så tælleren kun viser reel, ubesvaret chat-kommunikation.

1) Diagnose (bekræftet)
- Problemet er en mismatch mellem “markér som læst” og “tæl ulæste”.
- `mark_messages_read(...)` markerer kun `message_type = 'user'` som læst.
- UI-tællere (sidebar + “Kræver opmærksomhed”) tæller i dag alle beskeder med `read_at IS NULL` (inkl. `system`).
- Data for den konkrete bruger bekræfter fejlen:
  - Ulæste fra andre: **17**
  - Ulæste med `message_type='user'`: **0**
  - De 17 er systembeskeder (rapport/AI-aktiviteter), derfor nulstilles de aldrig af læse-funktionen.

2) Implementeringsplan
- Opdatér ulæst-logik i `src/components/AppSidebar.tsx` (member-branch):
  - Filtrér ulæst-tælling til `message_type = 'user'`.
  - Begræns conversations-query til korrekt kontekst:
    - primært `company_id = companyId`
    - fallback `member_id = user.id`
  - Dette forhindrer også “globale” tællere i medlemsvisning.
- Opdatér `src/components/AttentionNeeded.tsx`:
  - Find conversation(s) via `company_id` (med fallback), ikke kun `member_id`.
  - Tæl kun ulæste `message_type='user'`.
  - Behold tekst “ubesvaret kommunikation fra dine rådgivere” (nu matcher den data).
- (Konsistens) Opdatér evt. lokal `unreadCount`-beregning i `src/pages/Chat.tsx` til samme definition (`message_type='user'`), så al UI følger samme regel.

3) Forventet effekt
- Efter login vil brugeren ikke længere se “17 ulæste”, når der kun er systemaktivitet.
- Tælleren stiger kun ved nye menneskelige beskeder fra rådgiver.
- Når chat åbnes, nulstilles disse korrekt via eksisterende `mark_messages_read`.

4) Verifikation
- Log ind som `jonas+test14@topix.dk`.
- Tjek sidebar-badge + “Kræver opmærksomhed”:
  - Før ny rådgiverbesked: 0.
  - Efter ny rådgiverbesked (`message_type='user'`): stiger.
  - Åbn chattråd: tæller går tilbage til 0.
- Genindlæs/log ind-ud igen: tælleren forbliver korrekt.

Tekniske detaljer
- Ingen database-migration nødvendig.
- Root cause er rent applikationslogik (query-filtrering), ikke datakorruption.
- Eksisterende read-state RPC kan beholdes uændret.
