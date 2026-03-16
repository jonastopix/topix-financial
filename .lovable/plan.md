

## Fix: Feedback-knap dækker chat-input

### Problem
Feedback-knappen er `fixed` positioneret i nederste højre hjørne (bottom: 24px, right: 24px). På chat-siden overlapper den med chat-inputfeltet, som også sidder i bunden af skærmen.

### Løsning
Skjul feedback-knappen når brugeren er på en chat-rute. Chat-siderne har allerede deres egen kommunikationskanal, så feedback-knappen er redundant der.

**Ændring i `src/components/FeedbackButton.tsx`**:
- Importér `useLocation` fra react-router-dom
- Tjek om den aktuelle rute er en chat-rute (`/chat`, `/group-chat`, `/group-chats`)
- Returnér `null` hvis brugeren er på en chat-rute

```typescript
import { useLocation } from "react-router-dom";

const FeedbackButton = () => {
  const location = useLocation();
  const isChatRoute = location.pathname.startsWith("/chat") || 
                      location.pathname.startsWith("/group-chat");
  
  if (isChatRoute) return null;
  // ... rest unchanged
};
```

Denne tilgang er simpel, påvirker ikke andre sider, og løser overlap-problemet uden at kræve komplekse layout-justeringer.

