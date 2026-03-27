import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  APP_BRANDING,
  PERFORMANCE_SCORE,
  GAMIFICATION,
  MEETINGS,
} from "@/lib/appConfig";

type ConfigKey = "branding" | "performance_score" | "gamification" | "meetings";

/**
 * Fetches all app_config rows and merges with static defaults.
 * Every authenticated user can read; only advisors can write.
 */
export function useAppConfig() {
  const queryClient = useQueryClient();

  const { data: dbRows = [] } = useQuery({
    queryKey: ["app-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_config")
        .select("config_key, config_value");
      if (error) throw error;
      return (data || []) as { config_key: string; config_value: any }[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const dbMap = Object.fromEntries(dbRows.map((r) => [r.config_key, r.config_value]));

  const branding = { ...APP_BRANDING, ...(dbMap.branding || {}) };
  const performanceScore = { ...PERFORMANCE_SCORE, ...(dbMap.performance_score || {}) };
  const gamification = { ...GAMIFICATION, ...(dbMap.gamification || {}) };
  const meetings = { ...MEETINGS, ...(dbMap.meetings || {}) };

  const updateConfig = async (key: ConfigKey, value: any) => {
    const { error } = await supabase
      .from("app_config")
      .upsert(
        { config_key: key, config_value: value, updated_at: new Date().toISOString() },
        { onConflict: "config_key" }
      );
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["app-config"] });
  };

  return { branding, performanceScore, gamification, meetings, updateConfig };
}
