import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { APP_BRANDING, laesVelkomstvideoGuid } from "@/lib/appConfig";

/** Nøglerne fladen kan skrive. performance_score, gamification og meetings
    er SLETTET 13/9 (kort 82): ingen monteret flade læste dem (målt 4/9,
    bekræftet 11/9 og 13/9), og rækkerne fjernes af migrationen
    20260913231500_platformconfig_doede_raekker. De øvrige app_config-nøgler
    (session_timeout_minutes, notification_v2_rollout, extraction_v2_rollout)
    har aldrig været skrivbare herfra. */
type ConfigKey = "branding" | "velkomstvideo_guid";

/**
 * Fetches all app_config rows and merges with static defaults.
 * Every authenticated user can read; only advisors can write.
 * Ukendte rækker i tabellen ignoreres; en manglende række giver default.
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
  // Én JSON-streng, ikke et objekt — dommen (tom JSON-streng = ingen video,
  // også læst rå) bor i laesVelkomstvideoGuid og er testet dér.
  const velkomstvideoGuid = laesVelkomstvideoGuid(dbMap.velkomstvideo_guid);

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

  return { branding, velkomstvideoGuid, updateConfig };
}
