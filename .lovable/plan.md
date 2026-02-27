

## Plan: Mobilvenlig chat, ubesvaret-fokus og udvidede advisor-notifikationer

### 1. Mobilvenlig chat

Chatten har i dag en fast sidebar-bredde (340px) og et to-panel layout der ikke fungerer pa mobil. Losningen:

- **Mobil: vis kun en af panelerne ad gangen.** Pa mobil vises samtalelisten som standard. Nar man trykker pa en samtale, vises beskedpanelet i fuldskarm med en "tilbage"-knap.
- Juster padding, font-storrelser og input-felter til touch-venlig storrelse
- Skjul topic-filter chips i en horisontal scroll-container pa mobil
- Gor sidebar-bredden responsiv (fuld bredde pa mobil i stedet for 340px)

### 2. Advisor-chat: Ubesvaret som standard-filter

- Saet `activeFilter` til `"ubesvaret"` som standard nar brugeren er advisor (i stedet for `"alle"`)
- Bevar sogning, sa advisors kan finde andre samtaler via sogefeltet
- Nar der ikke er nogen ubesvarede, vises en tom-tilstand med opfordring til at soge eller skifte filter

### 3. Udvidede advisor-notifikationer

Nuvarende system understotter kun `report_uploaded` og `handout_completed`. Udvidelsen:

**A. Nye besked-notifikationer:**
- Nar et medlem sender en besked, oprettes en `advisor_notification` med type `new_message` og reference_type `chat`
- Tilfojes i besked-send logikken (client-side i Chat.tsx nar afsender ikke er advisor)

**B. Rapport-upload notifikationer:**
- Bekraft at der allerede oprettes notifikationer ved rapport-upload (se eksisterende flow)

**C. Handout-indsendelse notifikationer:**
- Bekraft at der allerede oprettes notifikationer ved handout-indsendelse

**D. Notifikations-type udvidelse i UI:**
- Tilfoej `MessageCircle`-ikon for `new_message` type i AdvisorNotifications-komponenten
- Klik pa besked-notifikation navigerer til `/chat`

### Teknisk overblik

**Filer der andres:**

| Fil | Andring |
|-----|---------|
| `src/pages/Chat.tsx` | Responsivt layout med mobil-panel-toggle, standard "ubesvaret" filter for advisors |
| `src/components/AdvisorNotifications.tsx` | Ny `new_message` type med MessageCircle-ikon, navigation til /chat |
| `src/components/AppLayout.tsx` | Ingen andringer nodvendige |

**Ingen database-andringer nodvendige** -- `advisor_notifications`-tabellen understotter allerede fleksible typer via text-felter.

**Besked-notifikation trigger:** Nar et medlem (ikke-advisor) sender en besked, kalder klienten `createAdvisorNotification` med type `new_message`, sa advisors far besked i klokken.

