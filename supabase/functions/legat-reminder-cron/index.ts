import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.cron("legat-momentum-reminder", "0 9 * * *", async () => {
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Find active enrollments where momentumkald not yet booked
  const { data: enrollments, error: enrollErr } = await supabase
    .from("legat_enrollments")
    .select("id, user_id, start_date, created_by")
    .eq("status", "active")
    .eq("momentumkald_booked", false);

  if (enrollErr) {
    console.error("Failed to fetch enrollments:", enrollErr.message);
    return;
  }

  if (!enrollments || enrollments.length === 0) {
    console.log("No eligible legat enrollments found");
    return;
  }

  const now = Date.now();

  for (const enrollment of enrollments) {
    try {
      // 2. Calculate days since start
      const daysSinceStart = Math.floor(
        (now - new Date(enrollment.start_date).getTime()) / 86400000
      );

      if (daysSinceStart < 2) {
        continue;
      }

      // 3. Find conversation for this user
      const { data: conversation } = await supabase
        .from("conversations")
        .select("id")
        .eq("member_id", enrollment.user_id)
        .maybeSingle();

      if (!conversation) {
        console.warn(`No conversation found for user ${enrollment.user_id}`);
        continue;
      }

      // 4. Check if reminder already sent (never send twice)
      const { data: existingReminder } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conversation.id)
        .eq("message_type", "legat-momentum-reminder")
        .limit(1)
        .maybeSingle();

      if (existingReminder) {
        continue;
      }

      // 5. Get user's first name from profiles
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", enrollment.user_id)
        .maybeSingle();

      const firstName = profile?.full_name?.split(" ")[0] || "du";

      // 6. Insert reminder message
      const content = `Hej ${firstName} 👋 Har du husket at booke dit Momentumkald? Det er en god mulighed for at afslutte forløbet og evt. høre mere om mulighederne for et videre samarbejde med Morten og Jonas — book her: https://theboardroom.dk/momentumkald`;

      const senderId = enrollment.created_by;
      if (!senderId) {
        console.warn(`No created_by for enrollment ${enrollment.id}, skipping`);
        continue;
      }

      const { error: msgErr } = await supabase.from("messages").insert({
        conversation_id: conversation.id,
        sender_id: senderId,
        message_type: "legat-momentum-reminder",
        content,
      });

      if (msgErr) {
        console.error(`Failed to insert reminder for user ${enrollment.user_id}:`, msgErr.message);
        continue;
      }

      // 7. Update conversation timestamps
      await supabase
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
          awaiting_reply_from: "company",
        })
        .eq("id", conversation.id);

      console.log(`Sent momentum reminder to user ${enrollment.user_id}`);
    } catch (err) {
      console.error(`Error processing enrollment ${enrollment.id}:`, err);
    }
  }
});
