
## Tilføj login-statistik sektion på Members-siden

### Hvad bygges
En ny statistik-række under de eksisterende invitation-stats (linje 902-931) der viser login-aktivitet fordelt på:
- **Aktive brugere** (logget ind inden for 7 dage) - med grøn indikator
- **Inaktive brugere** (har logget ind, men ikke inden for 7 dage) - med gul indikator  
- **Aldrig logget ind** (ingen login-log overhovedet) - med rød/grå indikator

### Ændringer

**`src/pages/Members.tsx`**

1. Beregn login-statistik fra eksisterende `companies` data (som allerede indeholder `loginInfo` per virksomhed):
   - Gennemløb alle members på tværs af alle companies
   - Tjek om deres `lastLogin` er inden for 7 dage -> "aktiv"
   - Har login men ældre end 7 dage -> "inaktiv"
   - Ingen login-data -> "aldrig logget ind"

2. Tilføj en ny `grid grid-cols-3` sektion lige efter invitation-stats (efter linje 931) med tre kort:
   - Kort 1: Aktive brugere (grøn ikon) med antal
   - Kort 2: Inaktive brugere (gul ikon) med antal
   - Kort 3: Aldrig logget ind (grå/rød ikon) med antal

### Teknisk detalje

Beregningen bruger allerede indlæste data fra `loginInfo` Map'en på hver company, så der er ingen ekstra database-kald nødvendige. Statistikken beregnes med `useMemo` baseret på `companies` state.

```text
Ny sektion (efter invitation stats):
+------------------+------------------+------------------+
| Aktive (7d)      | Inaktive         | Aldrig logget ind|
| [grøn ikon] 2    | [gul ikon] 1     | [grå ikon] 27   |
+------------------+------------------+------------------+
```

Ingen database-ændringer nødvendige - alt data er allerede tilgængeligt.
