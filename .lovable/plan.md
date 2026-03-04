

## Problem

Rich-text editoren (TipTap) genererer semantisk HTML uden inline styles (`<h1>`, `<p>`, `<a>`). Funktionen `wrapInEmailDocument()` wrapper kun indholdet i en ydre container — men tilføjer ingen styles til de indre elementer. E-mail klienter ignorerer CSS classes og kræver inline styles på hvert element. Resultatet: e-mails der ser pæne ud i editoren (fordi CSS styling virker der), men som er ustylet/ødelagt i inboxen.

## Løsning

Udvid `wrapInEmailDocument()` i `src/pages/EmailTemplates.tsx` med en post-processing funktion der injicerer inline styles på alle relevante HTML-elementer **før** de gemmes i databasen.

### Konkret implementation

**Fil: `src/pages/EmailTemplates.tsx`**

Erstat den simple `wrapInEmailDocument` med en version der:

1. Kører en `inlineEmailStyles(html)` funktion over TipTap-outputtet
2. Regex-baseret replacement der tilføjer inline styles til:
   - `<h1>` → `style="color:#1a1a2e;font-size:24px;font-weight:bold;margin:20px 0 12px;font-family:'Space Grotesk',Arial,sans-serif"`
   - `<h2>` → `style="color:#1a1a2e;font-size:20px;font-weight:bold;margin:16px 0 10px"`  
   - `<h3>` → `style="color:#1a1a2e;font-size:16px;font-weight:bold;margin:14px 0 8px"`
   - `<p>` → `style="color:#333;font-size:14px;line-height:24px;margin:8px 0"`
   - `<a ` → tilføjer `style="color:#0fa968;text-decoration:underline"` (bevarer eksisterende attributter)
   - `<ul>`, `<ol>`, `<li>` → korrekt spacing og styling
   - `<hr>` → `style="border:none;border-top:1px solid #e5e5e5;margin:24px 0"`
3. Bevarer eksisterende `style` attributter (merger i stedet for at overskrive)
4. Wrapper resultatet i det eksisterende email-document shell

### Vigtige detaljer

- Styles matche det eksisterende brand (grøn `#0fa968`, mørk `#1a1a2e`, grå `#333`)
- Links der ligner knapper (f.eks. "Acceptér invitation") kan ikke automatisk styles som knapper — men basal link-styling sikres
- `extractBodyContent()` forbliver uændret (den stripper kun wrapperen)
- Preview-tab'en viser allerede det korrekte resultat fordi den renderer HTML direkte

### Filer der rettes
- `src/pages/EmailTemplates.tsx` (udvid `wrapInEmailDocument` med inline style injection)

