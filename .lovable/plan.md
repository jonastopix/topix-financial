

## Problem

"Dine rådgivere" header in the member chat view only shows advisors who have **sent a message** in that conversation. This is because it uses `get_conversation_sender_profiles`, which queries the `messages` table for distinct senders. If only Jonas has written in the thread, only Jonas appears — even though Morten is equally available as an advisor.

## Solution

Fetch **all advisors** independently of conversation participation, and display them in the header. This way members always see the full advisor team.

### Implementation

1. **Add a new query in `src/pages/Chat.tsx`** that fetches all advisor profiles:
   - Query `user_roles` where `role IN ('advisor', 'admin')`, join with `profiles` to get name + avatar.
   - This can be done with a simple select: `supabase.from("user_roles").select("user_id, profiles(full_name, avatar_url)").in("role", ["advisor", "admin"])`.
   - Store as `allAdvisors` state (or a `useQuery`).

2. **Update the member header bar** (line ~1607-1638) to use `allAdvisors` instead of `participants.filter(p => p.isAdvisor)` for the "Dine rådgivere" display.

3. **Keep `participants`** for the advisor-side view (showing company members + advisors who participated), which is a different UI section.

### Result
Members will always see "Dine rådgivere: Jonas, Morten" with both avatars, regardless of who has written in the conversation.

