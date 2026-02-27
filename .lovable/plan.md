

## Giv rådgivere adgang til Indstillinger

### Problem
Navigationslogikken skjuler "Indstillinger" for rådgivere der ikke er admin. Det betyder at de ikke kan uploade/fjerne profilbillede eller andre personlige indstillinger.

### Losning
Vis "Indstillinger" for ALLE autentificerede brugere -- det er personlige indstillinger, ikke platformkonfiguration (som forbliver admin-only under "Platformconfig").

### Teknisk andring

**Fil: `src/components/AppSidebar.tsx` (linje 210)**

Andre betingelsen fra:
```tsx
...(!isAdvisor || isAdmin ? [{ ... "Indstillinger" ... }] : [])
```
til simpelthen altid inkludere Indstillinger:
```tsx
{ icon: SettingsIcon, label: "Indstillinger", path: "/settings" }
```

Dette kan gores ved at flytte Indstillinger-elementet ind i `baseNavItems`-arrayet (linje 33-41), sa det altid vises for alle brugertyper.

En enkelt linje-andring -- ingen nye filer, ingen backend-andringer.

