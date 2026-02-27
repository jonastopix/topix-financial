import { Building2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const AdvisorCompanyPrompt = () => {
  const { isAdvisor, setCompanyOverride } = useAuth();

  const { data: companies, isLoading } = useQuery({
    queryKey: ["all-companies-picker"],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("id, name").order("name");
      return data || [];
    },
    enabled: isAdvisor,
  });

  if (!isAdvisor) return null;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="p-4 rounded-2xl bg-primary/10 mb-4">
        <Building2 className="h-8 w-8 text-primary" />
      </div>
      <h2 className="text-xl font-display font-bold text-foreground mb-2">
        Vælg en virksomhed
      </h2>
      <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
        Som rådgiver skal du vælge en virksomhed for at se data på denne side. Du kan også bruge "Vis som virksomhed" i menuen.
      </p>

      {isLoading ? (
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      ) : (
        <div className="grid gap-2 w-full max-w-sm">
          {companies?.map((c) => (
            <button
              key={c.id}
              onClick={() => setCompanyOverride(c.id, c.name)}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all text-left group"
            >
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-medium text-foreground truncate">{c.name}</span>
            </button>
          ))}
          {companies?.length === 0 && (
            <p className="text-xs text-muted-foreground text-center">Ingen virksomheder fundet.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default AdvisorCompanyPrompt;
