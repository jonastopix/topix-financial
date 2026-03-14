

## Plan: Rich text toolbar i chatten

### Oversigt
Tilføj en kompakt formateringstoolbar over chat-inputfeltet med knapper til fed, kursiv, lister og links. Beskeder gemmes som HTML og renderes med `dangerouslySetInnerHTML` (sanitized).

### Ændringer

**1. Ny komponent: `src/components/ChatRichInput.tsx`**
- Letvægts Tiptap-editor (genbruger samme extensions som `RichTextEditor` men med minimal toolbar)
- Extensions: `StarterKit` (bold, italic, bulletList, orderedList), `Link`
- Kompakt toolbar med kun: **Fed**, *Kursiv*, Punktliste, Nummereret liste, Link
- Samme keyboard-logik: Enter sender, Shift+Enter linjeskift
- Eksponerer `onSubmit(html: string)` og `disabled` props
- Auto-resize styling matchende nuværende textarea (rounded-xl, bg-secondary, border)
- Max-length tæller bevares

**2. Opdatér `src/pages/Chat.tsx`**
- Erstat textarea + form submit med `<ChatRichInput>` komponenten
- `handleSend` modtager HTML-string i stedet for plain text fra `newMessage` state
- Content gemmes som HTML i `messages.content` (bagudkompatibelt — plain text er valid HTML)
- Beskedvisning (linje ~1914 og ~1994): Erstat `<p>{msg.content}</p>` med `<div dangerouslySetInnerHTML>` wrappet i sanitize via `DOMPurify`
- Tillad kun tags: `b, strong, i, em, ul, ol, li, a, p, br`
- Bevar eksisterende styling (text-sm, leading-relaxed)

**3. Tilføj dependency**
- `dompurify` + `@types/dompurify` til sanitering af HTML-output

### Styling i bobler
- Links: `underline text-primary` (eller `text-primary-foreground underline` i egne bobler)
- Lister: kompakt `pl-4 text-sm` styling
- Fed/kursiv: native browser styling

