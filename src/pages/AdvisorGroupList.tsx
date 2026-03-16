import { Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Layers, Loader2 } from "lucide-react";

interface AdvisorGroup {
  group_id: string;
  group_name: string;
}

const AdvisorGroupList = () => {
  const { user, isAdvisor, loading } = useAuth();
  const navigate = useNavigate();

  const { data: groups, isLoading } = useQuery({
    queryKey: ["advisor-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_advisor_access" as any)
        .select("group_id, groups:group_id(id, name)" as any)
        .eq("advisor_user_id", user!.id);
      if (error) throw error;
      return ((data as any[]) || []).map((row: any) => ({
        group_id: row.group_id,
        group_name: row.groups?.name || "Koncern",
      })) as AdvisorGroup[];
    },
    enabled: !!user && isAdvisor,
    staleTime: 60_000,
  });

  if (!loading && !isAdvisor) {
    return <Navigate to="/" replace />;
  }

  // Auto-redirect if exactly one group
  if (groups && groups.length === 1) {
    return <Navigate to={`/groups/${groups[0].group_id}`} replace />;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Koncernoverblik</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vælg en koncern for at se overblikket
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : groups && groups.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Du har ikke adgang til nogen koncerner.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups?.map((g) => (
              <Card
                key={g.group_id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/groups/${g.group_id}`)}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <Layers className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{g.group_name}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default AdvisorGroupList;
