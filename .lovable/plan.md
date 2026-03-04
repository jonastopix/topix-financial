

## Password-styrke indikator i signup-formularen

Tilføjer en visuel styrke-indikator under password-feltet ved signup, der evaluerer adgangskoden i realtid.

### Styrke-kriterier
- Mindst 8 tegn
- Mindst ét stort bogstav
- Mindst ét tal
- Mindst ét specialtegn

Scoren (0–4) mapper til farver og labels: Svag (rød) → Rimelig (orange) → God (gul) → Stærk (grøn).

### Teknisk plan

1. **Ny komponent `src/components/PasswordStrengthIndicator.tsx`**
   - Modtager `password: string` som prop
   - Beregner score baseret på de 4 kriterier
   - Viser en progress-bar med dynamisk farve + tekst-label
   - Viser en checkliste med ikoner for hvert kriterie (opfyldt/ikke opfyldt)

2. **Opdatér `src/pages/Auth.tsx`**
   - Importér og indsæt `PasswordStrengthIndicator` under password-feltet, kun synlig ved signup (`!isLogin`)
   - Blokér submit hvis score < 2 (kræver mindst "Rimelig")

Ingen database- eller backend-ændringer nødvendige — ren klient-side validering.

