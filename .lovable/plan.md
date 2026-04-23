

## Problem

Mobil-chatten er reelt ubrugelig. Konkrete årsager efter gennemgang af `ChatShell`, `CompanyChatPane`, `ChatRichInput` og `AppLayout`:

1. **Input-feltet fylder ekstremt meget** — `ChatRichInput` har en formaterings-toolbar (Bold/Kursiv/Liste/Link/Vedhæft) + editor + tegn-tæller stablet lodret. Sammen med Send-knap som sideløber tager input ~110-130 px. På en 375×667 telefon er der under 200 px tilbage til selve beskederne.

2. **Tastaturet dækker input-feltet** — appen bruger `100dvh`-shell + `fixed bottom-0` bundnav. Når mobiltastaturet åbner, skubbes input ikke ovenfor tastaturet, så man ikke kan se hvad man skriver. Der er ingen `scrollIntoView` på focus.

3. **`px-4` padding fra `AppLayout`** wrapper chat-indholdet i ekstra horizontal padding (i ikke-fullscreen mode), så bobler og input bliver smalle og asymmetriske.

4. **Tabs Advisor/Finansiel AI** tager en ekstra 40 px række på `/chat` for single-company medlemmer — selv på mobil, hvor der ikke er plads.

5. **Annoncerings-banneret + sticky topbar** spiser ~120 px på toppen. Det er ikke nødvendigt at vise annoncering på chat-ruten på mobil.

6. **Sticky topbar og bottom-nav-padding (`pb-20`)** lægger ovenpå hinanden, så messages-listen mister yderligere højde.

7. **Send-knap som separat node ved siden af input** med `items-end` skaber lodret offset og virker klodset.

8. **Long-press menu (Drawer)** virker, men besked-bobler bruger `max-w-[85%]` på mobil og avatar-cirkler ud til siden, så bobler bliver alligevel smalle og tekst wrapper aggressivt.

## Løsning

Mål: gør mobil-chat så tæt på native-messenger-følelse som muligt. Plain-text input, intet toolbar, fuldt synligt input over tastaturet, beskeder-listen får al resterende plads.

### Ændring 1 — Slank `ChatRichInput` på mobil
- Skjul formaterings-toolbaren helt på mobil (`useIsMobile`). Kun Vedhæft-knappen forbliver, placeret som lille ikon-knap inde i input-rammen.
- Reducér editor-padding (`py-2` → `py-2.5`) og fjern tegn-tæller på mobil indtil 95%-grænse er tæt på.
- Indsæt Send-knappen *inde* i input-rammen til højre (i stedet for som ekstern knap), så hele input-feltet bliver én kompakt pille (svarende til iMessage / WhatsApp).
- Resultat: input falder fra ~110 px til ~52 px.

### Ændring 2 — Input følger tastaturet
- Tilføj `inputMode="text"` og `enterkeyhint="send"` på editor-attributter.
- Ved focus: `requestAnimationFrame(() => editorEl.scrollIntoView({ block: "end", behavior: "smooth" }))` så input kommer over tastaturet.
- Wrap input-rækken i `sticky bottom-0 bg-background` *inden i* messages-kolonnen, så den hænger fast nederst i den scroll-bare flex-kolonne uafhængigt af bundnav-positionen.
- Tilføj `pb-[env(safe-area-inset-bottom)]` direkte på input-wrapperen.

### Ændring 3 — Skjul annoncering og tabs på `/chat` mobil
- I `AppLayout`: hvis `location.pathname === "/chat"` og `isMobile`, vis ikke annoncerings-banneret. Det vinder ~60 px på toppen.
- I `ChatShell`: skjul Advisor/Finansiel AI-tabs på mobil for single-company members. Default til "advisor"-tab. Tilføj i stedet en lille link-knap "Spørg AI →" øverst i chat-headeren, der navigerer til `/chat?tab=ai` med tab-bar synlig kun når brugeren tilgår AI.
- Alternativt: behold tabs men gør dem 28 px høje med kun ikon + tekst-label på en linje.

### Ændring 4 — Fjern `px-4`-padding på chat-ruten
- I `AppLayout` ikke-fullscreen mobil-grenen: tjek om barnet er chat (eller giv `AppLayout` en `noPadding`-prop). For chat skal indholdet gå helt ud til kanterne, så input og message-bobler får fuld bredde.
- Eller simplere: chat bruger allerede `<AppLayout fullscreen>`, så der er ingen `px-4` — men tjek at `glass-card` i `CompanyChatPane` (linje 1392) ikke selv tilføjer rounded/border/margin på mobil. Drop `rounded-xl` og border på mobil, så chatten flyder kant-til-kant.

### Ændring 5 — Bredere besked-bobler på mobil
- `max-w-[85%]` → `max-w-[88%]` og fjern den 7×7 px afsender-avatar på mobil (vis kun navn én gang per blok, samlet i grupper). Frigør 36 px til selve teksten.
- Reducér `space-y-4` mellem beskeder til `space-y-2` på mobil.

### Ændring 6 — Header forenklet på mobil
- I `CompanyChatPane`-headeren (linje 1645+): skjul `Quick nav links` (Overblik/Milestones/Rapporter) for medlemmer på mobil — de hører til desktop-cockpit.
- For medlemmer: skjul også advisor-stripen øverst (linje 1839-1872) på mobil — vis den i stedet som lille fold-out i header. Vinder ~50 px.

### Ændring 7 — Group chat (`GroupChatInline`) får samme behandling
- Samme slanke input + sticky-input-fix. `GroupChatInline` bruger samme `ChatRichInput`, så Ændring 1+2 dækker det.

## Tekniske detaljer

**Filer der ændres:**
```text
src/components/ChatRichInput.tsx        — toolbar skjult på mobil, send-knap indvendig, scroll-on-focus
src/components/CompanyChatPane.tsx      — slankere header, bredere bobler, sticky input, drop glass-card-border på mobil
src/pages/ChatShell.tsx                  — kompakt tab-bar på mobil
src/components/AppLayout.tsx            — skjul annoncerings-banner på /chat mobil
src/components/GroupChatInline.tsx      — samme sticky input wrapper
```

**Ingen DB-ændringer. Ingen edge functions. Kun frontend layout + input-komponent.**

**Effekt på 375×667 telefon:**
```text
Før:                              Efter:
─────────────                     ─────────────
Topbar         48 px              Topbar          48 px
Annoncering    60 px              (skjult)         0 px
Tabs           40 px              Slim tabs       28 px
Header        110 px              Header          64 px
Pulse-banner   30 px              Pulse-banner    30 px
Messages      120 px ←kort        Messages       380 px ←brugbart
Input         110 px ←tung        Input           52 px ←slank
Bottom-nav     64 px              Bottom-nav      64 px
─────────────                     ─────────────
              582 px                            666 px
```

**Acceptance:**
- Input er synligt over tastaturet på iOS Safari + Android Chrome.
- Beskeder fylder mindst 50% af viewport-højden uden at scrolle.
- Send virker via on-screen send-tast (`enterkeyhint="send"`) eller dedikeret send-knap inde i input.
- Group chat har samme oplevelse som member-chat.
- Desktop er uændret.

