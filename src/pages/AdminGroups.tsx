import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Layers, Building2, Users, ArrowRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AdminGroupRow {
  group_id: string;
  group_name: string;
  anchor_company_id: string;
  anchor_company_name: string;
  company_count: number;
  member_count: number;
  created_at: string;
}

const AdminGroups = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const { data: groups, isLoading } = useQuery({
    queryKey: ["admin-group-list"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_group_list" as any);
      if (error) throw error;
      return (data as unknown as AdminGroupRow[]) || [];
    },
    enabled: !!user && isAdmin,
    staleTime: 60_000,
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Layers className="h-6 w-6" />
            Koncernoversigt
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Alle koncerner med antal virksomheder og medlemmer
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : groups && groups.length > 0 ? (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Koncernnavn</TableHead>
                  <TableHead>Anchor-virksomhed</TableHead>
                  <TableHead className="text-center">
                    <span className="flex items-center justify-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />
                      Virksomheder
                    </span>
                  </TableHead>
                  <TableHead className="text-center">
                    <span className="flex items-center justify-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      Medlemmer
                    </span>
                  </TableHead>
                  <TableHead>Oprettet</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <TableRow
                    key={g.group_id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/admin/groups/${g.group_id}`)}
                  >
                    <TableCell className="font-medium">{g.group_name}</TableCell>
                    <TableCell className="text-muted-foreground">{g.anchor_company_name}</TableCell>
                    <TableCell className="text-center">{g.company_count}</TableCell>
                    <TableCell className="text-center">{g.member_count}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(g.created_at).toLocaleDateString("da-DK")}
                    </TableCell>
                    <TableCell>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Ingen koncerner oprettet endnu.
          </p>
        )}
      </div>
    </AppLayout>
  );
};

export default AdminGroups;
