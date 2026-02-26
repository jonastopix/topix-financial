
# Navigation: Altid kunne komme tilbage

## Problem
1. Sidebar-links bruger `<Link>` som ignorerer klik hvis man allerede er pa ruten -- sa man sidder fast i sub-views
2. Flere sider mangler tydelige tilbageknapper nar man er i en under-visning

## Losning

### 1. Sidebar: Tving navigation selv pa aktiv rute
**Fil: `src/components/AppSidebar.tsx`**

Erstatter `<Link>` med en `onClick`-handler der bruger `useNavigate`. Nar brugeren klikker pa det aktive menupunkt, navigeres med et nyt `state.key` (timestamp), sa React Router registrerer det som en ny navigation.

```text
Klik pa "Budget" (allerede aktiv)
  -> navigate("/budget", { state: { resetKey: Date.now() } })
  -> Budget-siden ser nyt resetKey og nulstiller intern state
```

### 2. Sider lytter til navigation-reset
Opretter en simpel hook `useNavigationReset` der returnerer en key baseret pa `location.state?.resetKey`. Sider bruger denne key i `useEffect` til at nulstille sub-views.

**Ny fil: `src/hooks/useNavigationReset.ts`**
- Returnerer `resetKey` fra `location.state`
- Sider kan bruge dette som dependency i useEffect

### 3. Tilbageknapper pa sub-views
Tilfojer en genbrugelig "Tilbage"-knap-komponent og placerer den pa relevante sider:

**Sider der far tilbageknap:**
- **Budget** (`src/pages/Budget.tsx`): Nar man er i "Skift skabelon"-visningen, vises en tilbageknap der gar tilbage til budget-oversigten
- **Handouts** (`src/pages/Handouts.tsx`): Har allerede `onBack` -- men tilfojer en synlig tilbageknap i header-omradet (den eksisterer i `HandoutDetail`, verificerer den er tydelig)

### 4. Reset-logik per side

**Budget:**
- Nar `resetKey` aendres og der allerede er valgt en template + data, forbliv pa oversigten (nulstil evt. "skift skabelon"-tilstand)
- `handleChangeTemplate`-visningen nulstilles ved sidebar-klik

**Handouts:**
- Nar `resetKey` aendres, nulstil `activeModule` til `null` sa man ser oversigtslisten

## Teknisk implementering

### Filer der oprettes:
- `src/hooks/useNavigationReset.ts` -- simpel hook (5-10 linjer)

### Filer der aendres:
- `src/components/AppSidebar.tsx` -- erstat `<Link>` med klikbar `<button>`/`<div>` + `useNavigate` med state
- `src/pages/Budget.tsx` -- tilbageknap i template-picker + lytte pa resetKey
- `src/pages/Handouts.tsx` -- lytte pa resetKey for at nulstille activeModule
