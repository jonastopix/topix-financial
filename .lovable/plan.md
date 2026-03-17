

# Emoji-reaktioner på chatbeskeder

## Oversigt
Tilføj mulighed for at reagere med emojis på beskeder i både virksomheds-chat (CompanyChatPane) og koncern-chat (GroupChatMessageList). Hover/tap på en besked viser en reaktions-knap, der åbner en kompakt emoji-picker med 6-8 hurtige emojis (👍❤️😂🎉👀🙏). Reaktioner vises under beskedboblen.

## Database

**Ny tabel: `message_reactions`**
- `id` (uuid, PK)
- `message_id` (uuid, NOT NULL) — ID fra enten `messages` eller `group_messages`
- `message_table` (text, NOT NULL) — `'messages'` eller `'group_messages'` for at skelne
- `user_id` (uuid, NOT NULL)
- `emoji` (text, NOT NULL) — e.g. `'👍'`
- `created_at` (timestamptz, default now())
- UNIQUE constraint på `(message_id, message_table, user_id, emoji)`

**RLS policies:**
- SELECT: authenticated users kan se reaktioner for beskeder de har adgang til (brug eksisterende `user_can_access_group_conversation` for group, og conversations-check for company)
- INSERT: authenticated + `user_id = auth.uid()`
- DELETE: authenticated + `user_id = auth.uid()` (toggle af/på)

**Realtime:** Tilføj tabellen til `supabase_realtime` publication.

## Ny komponent: `MessageReactions.tsx`

- **ReactionBar**: Viser eksisterende reaktioner som kompakte pills under beskedboblen (`👍 3`, `❤️ 1`). Klikbar for toggle.
- **ReactionPicker**: Lille popover med 6-8 quick-emojis der vises ved hover/tap på en smiley-knap ved beskedboblen.
- Props: `messageId`, `messageTable`, `reactions`, `currentUserId`, `onToggle`

## Ny hook: `useMessageReactions.ts`

- Fetcher alle reaktioner for den aktive samtale (batch via conversation messages).
- Realtime subscription for INSERT/DELETE på `message_reactions`.
- `toggleReaction(messageId, messageTable, emoji)` — insert hvis ikke eksisterer, delete hvis den gør.

## UI-integration

### CompanyChatPane (virksomheds-chat)
- På hover over en beskedboble: vis en lille smiley-ikon-knap (ved siden af eksisterende pin-knap).
- Under beskedboblen: vis `ReactionBar` med aggregerede reaktioner.

### GroupChatMessageList (koncern-chat)
- Samme mønster: hover-knap + reaktionsbar under boblen.

## Tekniske detaljer

- Emoji-sæt er hardcoded (6-8 stk), ingen tredjeparts emoji-picker nødvendig.
- Reaktioner grupperes client-side: `Map<emoji, { count, reacted }>`.
- Optimistic UI: Tilføj/fjern reaktion lokalt før server-response.
- Mobile: Tap-and-hold eller inline knap i stedet for hover.

