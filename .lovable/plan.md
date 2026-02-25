

# Tilfoej manuel milestone-oprettelse med kategori-type

## Problem
Medlemmer kan i dag ikke oprette milestones manuelt. Der findes kun redigering og sletning af eksisterende milestones (typisk AI-genererede). Der mangler ogsaa en kategorisering, saa man kan skelne mellem forskellige typer maal.

## Loesning

### Trin 1: Database -- tilfoej `category` kolonne
Tilfoej en ny kolonne `category` til `milestones`-tabellen med en default-vaerdi saa eksisterende data ikke bryder:

```sql
ALTER TABLE milestones ADD COLUMN category text NOT NULL DEFAULT 'other';
```

### Trin 2: Opret milestone-formular med kategori-vaelger

Tilfoej en "Opret milestone"-knap i sidehovedet paa Milestones-siden og en dialog/formular med:

- **Titel** (tekstfelt, paakraevet)
- **Beskrivelse** (textarea, valgfrit)
- **Kategori** (dropdown med foelgende muligheder):
  - Vaekst (revenue growth)
  - Profit (profitability)
  - Timer (hours/workload)
  - Medarbejdere (team/hiring)
  - Daekningsbidrag (contribution margin)
  - Andet (custom)
- **Deadline** (kalendervælger, valgfrit)

### Trin 3: Vis kategori paa milestone-kort

Vis kategorien som et farvekodet badge paa hvert milestone-kort, saa man hurtigt kan se typen. Hver kategori faar sin egen farve og ikon.

### Trin 4: Tilfoej kategori til redigering

Udvid den eksisterende inline-redigering saa kategorien ogsaa kan aendres.

## Teknisk implementering

### Filer der aendres:
1. **Database migration** -- tilfoej `category` kolonne
2. **`src/pages/Milestones.tsx`** -- tilfoej "Opret milestone"-knap og Dialog-komponent
3. **`src/components/MilestonesList.tsx`** -- udvid Milestone-interface med `category`, vis badge, tilfoej kategori til redigering

### Kategori-konfiguration:
```text
vaekst     -> Groen badge,  TrendingUp ikon
profit     -> Blaa badge,   Coins ikon
timer      -> Gul badge,    Clock ikon
medarbejdere -> Lilla badge, Users ikon
db         -> Orange badge,  BarChart ikon
other      -> Graa badge,   Target ikon
```

### Oprettelses-flow:
1. Bruger klikker "+ Opret milestone" i headeren
2. Dialog aabner med formularfelter
3. Ved gem: INSERT i milestones med `source: 'manual'`, `progress: 0`, `status: 'active'`
4. Listen opdateres og toast bekraefter oprettelsen

