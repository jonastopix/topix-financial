/**
 * Notification Writer — Phase 1
 *
 * Single helper for inserting into the new `notifications` table.
 * Uses ON CONFLICT (user_id, dedup_key) DO NOTHING for idempotency.
 * Called from edge functions alongside legacy advisor_notifications writes.
 *
 * NO database triggers. Edge functions are the sole writers.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface NotificationPayload {
  user_id: string;
  type: string;
  priority: "info" | "important" | "action_required";
  title: string;
  body?: string;
  reference_type?: string;
  reference_id?: string;
  deep_link?: string;
  company_id?: string;
  group_id?: string;
  dedup_key: string;
}

/**
 * Insert a notification row with dedup protection.
 * Returns true if inserted, false if deduped (already exists).
 * Swallows errors to avoid breaking the calling function's main flow.
 */
export async function writeNotification(
  adminClient: SupabaseClient,
  payload: NotificationPayload,
): Promise<boolean> {
  try {
    const { error } = await adminClient
      .from("notifications")
      .insert({
        user_id: payload.user_id,
        type: payload.type,
        priority: payload.priority,
        title: payload.title,
        body: payload.body || null,
        reference_type: payload.reference_type || null,
        reference_id: payload.reference_id || null,
        deep_link: payload.deep_link || null,
        company_id: payload.company_id || null,
        group_id: payload.group_id || null,
        dedup_key: payload.dedup_key,
      });

    if (error) {
      // 23505 = unique_violation → dedup hit, expected
      if (error.code === "23505") {
        return false;
      }
      console.error("writeNotification error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("writeNotification unexpected error:", err);
    return false;
  }
}

/**
 * Write notifications to multiple recipients (e.g. all advisors).
 * Each gets its own dedup_key scoped to their user_id.
 */
export async function writeNotificationToMany(
  adminClient: SupabaseClient,
  recipientIds: string[],
  payload: Omit<NotificationPayload, "user_id">,
): Promise<number> {
  let inserted = 0;
  for (const uid of recipientIds) {
    const ok = await writeNotification(adminClient, { ...payload, user_id: uid });
    if (ok) inserted++;
  }
  return inserted;
}
