import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, MessageCircle, Layers } from "lucide-react";

const GroupChatList = () => {
  const { user, isAdvisor, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const { data: groups, isLoading } = useQuery({
    queryKey: ["advisor-group-chat-list"],
    queryFn: async () => {
      const { data: accessRows, error: accessErr } = await supabase
        .from("group_advisor_access" as any)
        .select("group_id")
        .eq("advisor_user_id", user!.id);

      if (accessErr || !accessRows || accessRows.length === 0) return [];

      const groupIds = (accessRows as any[]).map(r => r.group_id);

      const { data: groupRows, error: groupErr } = await supabase
        .from("groups" as any)
        .select("id, name")
        .in("id", groupIds)
        .order("name");

      if (groupErr) return [];
      return (groupRows as any[]) || [];
    },
    enabled: !!user && isAdvisor,
    staleTime: 60_000,
  });

  // Guard after all hooks
  if (!authLoading && (!user || !isAdvisor)) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          Ingen adgang.
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Koncern-chat</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vælg en koncern for at åbne chatten
          </p>
        </div>

        {isLoading || authLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !groups || groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Layers className="h-10 w-10 opacity-30" />
            <p className="text-sm">Du har ikke adgang til nogen koncerner.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map((g: any) => (
              <Card
                key={g.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => navigate(`/group-chats/${g.id}/chat`)}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <MessageCircle className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{g.name}</p>
                    <p className="text-xs text-muted-foreground">Åbn koncern-chat</p>
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

export default GroupChatList;
