import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Notification {
  id: string;
  type: string;
  priority: "info" | "important" | "action_required";
  title: string;
  body: string | null;
  reference_type: string | null;
  reference_id: string | null;
  deep_link: string | null;
  company_id: string | null;
  group_id: string | null;
  seen_at: string | null;
  read_at: string | null;
  created_at: string;
}

/**
 * Hook for the new notifications system (phase 1).
 * Completely independent from chat read-state.
 */
export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setNotifications((data as any as Notification[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
    if (!user) return;

    const channel = supabase
      .channel("notifications-v2")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => load()
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => load()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  // Periodic refresh every 2 minutes to catch cross-tab/device changes
  useEffect(() => {
    const interval = setInterval(() => {
      load();
    }, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  // Badge count: unseen important + action_required
  const unseenCount = notifications.filter(
    (n) => !n.seen_at && (n.priority === "important" || n.priority === "action_required")
  ).length;

  const hasActionRequired = notifications.some(
    (n) => !n.seen_at && n.priority === "action_required"
  );

  const markAllSeen = useCallback(async () => {
    if (!user) return;
    await supabase.rpc("mark_notifications_seen" as any);
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, seen_at: n.seen_at || new Date().toISOString() }))
    );
  }, [user]);

  const markRead = useCallback(async (id: string) => {
    await supabase.rpc("mark_notification_read" as any, { p_notification_id: id });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: n.read_at || new Date().toISOString() } : n))
    );
  }, []);

  return {
    notifications,
    loading,
    unseenCount,
    hasActionRequired,
    markAllSeen,
    markRead,
  };
}
