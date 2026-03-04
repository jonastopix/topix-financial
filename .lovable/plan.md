

## Tilføj PasswordStrengthIndicator til ResetPassword.tsx

Samme mønster som i Auth.tsx:

1. **Importér** `PasswordStrengthIndicator` og `getPasswordScore` fra `@/components/PasswordStrengthIndicator`
2. **Indsæt** `<PasswordStrengthIndicator password={password} />` under password-inputfeltet
3. **Tilføj submission-guard**: Blokér submit hvis `getPasswordScore(password) < 2` med toast-besked
4. **Opdatér minLength** fra 6 til 8 for konsistens med indikatoren

Én fil ændres: `src/pages/ResetPassword.tsx`.

