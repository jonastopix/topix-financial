/**
 * Shared helper for determining if a conversation is "actionable now" for an advisor.
 *
 * A conversation is actionable when:
 * - awaiting_reply_from === 'advisor'
 * - not resolved
 * - and either not acknowledged, or follow_up_at has passed
 *
 * Used in: AdvisorDashboard, AppSidebar, Chat (action filter)
 */
export function isConversationActionable(
  conv: {
    awaiting_reply_from?: string | null;
    conversation_status?: string | null;
    acknowledged_at?: string | null;
    follow_up_at?: string | null;
  },
  now: Date,
): boolean {
  return (
    conv.awaiting_reply_from === "advisor" &&
    (conv.conversation_status ?? "open") !== "resolved" &&
    (
      !conv.acknowledged_at ||
      (!!conv.follow_up_at && new Date(conv.follow_up_at) <= now)
    )
  );
}
