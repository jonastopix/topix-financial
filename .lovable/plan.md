

## Problem: "Se original fil" virker ikke

### Årsag

`handleViewOriginalFile` er en `async` funktion der kalder `createSignedUrl` og derefter `window.open()`. Problemet er sandsynligvis **popup-blokering** i browseren: Når `window.open()` kaldes inde i en `async` callback (efter `await`), betragter browseren det ikke som en direkte bruger-handling, og popup-blokkeren forhindrer vinduet i at åbne.

Derudover mangler funktionen fejlhåndtering — hvis `createSignedUrl` fejler, sker der ingenting synligt.

### Plan

**Ændring i `src/pages/Reports.tsx`** (og tilsvarende i `src/pages/MemberDetail.tsx`):

1. **Fix popup-blokering**: Åbn et tomt vindue (`window.open('', '_blank')`) **før** `await`-kaldet (synkront i bruger-klik kontekst), og sæt derefter `location.href` på det åbnede vindue efter URL'en er hentet.

2. **Tilføj fejlhåndtering**: Vis en toast-fejlbesked hvis `createSignedUrl` fejler eller ikke returnerer en URL.

Ændret logik:
```typescript
const handleViewOriginalFile = async (report: DbReport) => {
  if (!report.file_path) return;
  const newWindow = window.open('', '_blank'); // Synkront — undgår popup-blokering
  const { data, error } = await supabase.storage
    .from("financial-documents")
    .createSignedUrl(report.file_path, 3600);
  if (data?.signedUrl && newWindow) {
    newWindow.location.href = data.signedUrl;
  } else {
    newWindow?.close();
    toast.error("Kunne ikke åbne filen");
  }
};
```

Samme fix i `MemberDetail.tsx`.

