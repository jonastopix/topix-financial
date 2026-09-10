/**
 * useAdvisorNotifications — rådgiverens advisor_notifications som hook
 * (10/9-2026). Logikken er LØFTET ORDRET ud af AdvisorNotifications.tsx
 * (den gamle klokke: seneste 30, realtime på INSERT, read_at pr. klik og
 * alle på én gang) — komponenten i det gamle design er urørt; Hjemmebanes
 * klokke (HbKlokke) læser herfra. Ingen ny regel: «ulæst» = read_at NULL.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { RaadgiverNotifikation } from "@/lib/hjemmebane/klokke";

export function useAdvisorNotifications() {
  const { user, isAdvisor } = useAuth();
  const [notifications, setNotifications] = useState<RaadgiverNotifikation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user || !isAdvisor) return;
    // Tabellen er i de genererede typer — ingen any (i modsætning til den gamle klokke).
    const { data } = await supabase
      .from("advisor_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifications((data ?? []) as unknown as RaadgiverNotifikation[]);
    setLoading(false);
  }, [user, isAdvisor]);

  useEffect(() => {
    void load();
    if (!user || !isAdvisor) return;
    const channel = supabase
      .channel("advisor-notifications-hb")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "advisor_notifications" }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, isAdvisor, load]);

  const markAsRead = useCallback(async (id: string) => {
    await supabase.from("advisor_notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: n.read_at || new Date().toISOString() } : n)));
  }, []);

  const markAllRead = useCallback(async () => {
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from("advisor_notifications").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
  }, [notifications]);

  return { notifications, loading, markAsRead, markAllRead };
}
