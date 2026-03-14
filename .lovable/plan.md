

## Problem
Chat-sidens indhold (header, noter, filtre, beskeder, input) vokser ud over viewport-højden. Fordi AppLayout bruger `min-h-screen-safe` (ikke fast højde) på desktop, scroller hele siden — og conversation-headeren (virksomhedsnavn, kontroller, emnefiltre) forsvinder op over viewport.

## Løsning: Brug fullscreen-layout til Chat

Chat-siden skal bruge AppLayouts `fullscreen`-mode, som allerede bruger `h-screen-safe` (fast viewport-højde) og `flex-1 min-h-0` — præcis det der skal til for at holde headeren fastlåst og kun scrolle beskedområdet.

### Ændring i `src/pages/Chat.tsx`

**Én linje**: Skift `fullscreen={isFullscreen}` til `fullscreen`:

```tsx
// Linje 911: Fra
<AppLayout fullscreen={isFullscreen}>
// Til  
<AppLayout fullscreen>
```

Dette gør at Chat-siden **altid** bruger den faste højdemodel. AppLayout's fullscreen-mode giver:
- `h-screen-safe` på root (fast viewport-højde)
- `flex-1 min-h-0` på indholdsområdet (forhindrer overflow)
- Conversation-headeren, noter, filtre og input forbliver synlige
- Kun beskedlisten (`overflow-y-auto`) scroller

Den eksisterende "expand/minimize" fullscreen-knap i chatten fjerner/genindsætter inbox-sidebaren og "Indbakke"-titlen — den logik forbliver uændret via `isFullscreen` state.

### Oprydning

Fjern den betingede `isFullscreen`-check fra heading-sektionen (linje 912), da `!isFullscreen` nu bare styrer om inbox-titlen vises — og den skal stadig vises:

```tsx
// Linje 912-918: Behold som den er — "Indbakke" header vises kun når !isFullscreen && !isMobile
// Ingen ændring nødvendig her
```

### Resultat
- Conversation-header med virksomhedsnavn og kontroller er **altid synlig**
- Emnefiltre og pinned beskeder forbliver synlige
- Kun beskedlisten scroller
- Ingen ændring i sidebar/navigation — AppSidebar forbliver fuldt synlig

