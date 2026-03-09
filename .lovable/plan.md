

## Plan: Replace Slack buttons with mrkdwn links

**File:** `supabase/functions/send-slack-chat-notification/index.ts`

### Changes

**1. Root message (new thread)** — Remove the `actions` block and append the deep link to the `context` block:

```js
// Current blocks array has 4 items: header, section, context, actions
// Change to 3 items: header, section, context (with link added)

const rootBlocks = [
  { type: "header", ... },  // unchanged
  { type: "section", ... }, // unchanged
  {
    type: "context",
    elements: [{
      type: "mrkdwn",
      text: `${timestamp} · <${deepLink}|Åbn chat →>`,
    }],
  },
  // actions block REMOVED
];
```

**2. Reply message (existing thread)** — Already uses a context block with the link, but verify format is consistent. Currently has `<${deepLink}|Åbn besked>` — keep as-is since it's already a mrkdwn link with no button.

Only the root message needs changing (remove the `actions` block, merge link into `context`). Reply format is already correct.

