

## Bekræftelsesdialog ved invitation

### Hvad ændres
En bekræftelsesdialog tilføjes til invitationsflowet i `CompanyInvitations.tsx`, så brugeren tydeligt ser **hvilken e-mail** der inviteres til **hvilken virksomhed** inden afsendelse.

### Hvordan det virker
1. Når brugeren klikker "Inviter", åbnes en `AlertDialog` i stedet for at sende direkte
2. Dialogen viser tydeligt:
   - E-mail-adressen der inviteres (fremhævet)
   - Virksomhedsnavnet den tilknyttes (fremhævet)
   - En advarselstekst: "Denne handling kan ikke fortrydes automatisk"
3. Brugeren skal bekræfte med "Ja, send invitation" eller annullere

### Teknisk plan

**Fil: `src/components/CompanyInvitations.tsx`**

- Importér `AlertDialog`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogAction`, `AlertDialogCancel` fra `@/components/ui/alert-dialog`
- Tilføj state: `showConfirm` (boolean) og `pendingEmail` (string)
- Ændr `handleInvite` til at validere og sætte `showConfirm = true` + `pendingEmail = trimmed` i stedet for at sende
- Opret ny `confirmInvite()` funktion der udforer den faktiske insert + email-afsendelse (den nuværende logik)
- Tilføj `AlertDialog` i JSX med teksten:

```text
Du er ved at invitere:
[email@example.dk]
til virksomheden:
[Virksomhedsnavn]
```

- "Annuller" og "Ja, send invitation" knapper

Ingen database-ændringer nødvendige.
