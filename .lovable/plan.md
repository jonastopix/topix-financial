
## Plan: Shift+Enter til linjeskift i chat

### Problem
Når brugeren trykker `Shift+Enter` i chat-input feltet, sendes beskeden i stedet for at indsætte et linjeskift. Dette sker fordi input-feltet er et `<input>` element uden nogen `onKeyDown` håndtering.

### Løsning
1. **Skift fra `<input>` til `<textarea>`** - Kun textarea kan indeholde linjeskift
2. **Tilføj `onKeyDown` handler** på textarea der:
   - Tjekker for `Shift+Enter` (e.shiftKey && e.key === "Enter")
   - Forhindrer default submit ved at kalde `e.preventDefault()`
   - Indsætter et linjeskift (`\n`) i teksten
   - Giver stadig mulighed for at sende med Enter alene

### Tekniske detaljer
Fil: `src/pages/Chat.tsx`

Ændringer ved linje 2054-2061:
- Erstat `<input>` med `<textarea>`
- Tilføj `rows={1}` for kompakt visning
- Tilføj `onKeyDown` handler med logik til Shift+Enter vs Enter
- Bevar eksisterende styling og adfærd

Form submit håndteringen via `handleSend` forbliver uændret - den vil stadig virke når brugeren trykker Enter uden Shift.
