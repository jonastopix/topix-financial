import { useState } from "react";
import { Navigate, useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useAdminGroupDashboard } from "@/hooks/useAdminGroupDashboard";
import GroupDashboardContent from "@/components/GroupDashboardContent";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Building2, UserCog, Trash2, Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const AdminGroupDetail = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { companies, aggregates, isLoading, error, groupName } = useAdminGroupDashboard(groupId);

  const [showAddCompany, setShowAddCompany] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // --- Panel 1: Group companies ---
  const { data: groupCompanies } = useQuery({
    queryKey: ["admin-group-companies", groupId],
    queryFn: async () => {
      const { data } = await supabase
        .from("group_companies")
        .select("id, company_id, sort_order, companies:company_id(id, name)")
        .eq("group_id", groupId!)
        .order("sort_order");
      return (data || []) as any[];
    },
    enabled: !!groupId && isAdmin,
  });

  const { data: allCompanies } = useQuery({
    queryKey: ["admin-all-companies"],
    queryFn: async () => {
      const { data } = await (supabase.from("companies").select("id, name").order("name") as any);
      return (data || []) as { id: string; name: string }[];
    },
    enabled: !!groupId && isAdmin,
  });

  const addCompany = useMutation({
    mutationFn: async (companyId: string) => {
      const { error } = await supabase.from("group_companies").insert({
        group_id: groupId!,
        company_id: companyId,
        sort_order: (groupCompanies?.length || 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-group-companies", groupId] });
      queryClient.invalidateQueries({ queryKey: ["admin-group-list"] });
      queryClient.invalidateQueries({ queryKey: ["admin-group-financial-summary", groupId] });
      toast.success("Selskab tilføjet til koncernen");
      setShowAddCompany(false);
      setSelectedCompanyId("");
    },
    onError: () => toast.error("Kunne ikke tilføje selskabet"),
  });

  const removeCompany = useMutation({
    mutationFn: async (groupCompanyId: string) => {
      const { error } = await supabase.from("group_companies").delete().eq("id", groupCompanyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-group-companies", groupId] });
      queryClient.invalidateQueries({ queryKey: ["admin-group-list"] });
      queryClient.invalidateQueries({ queryKey: ["admin-group-financial-summary", groupId] });
      toast.success("Selskab fjernet fra koncernen");
    },
    onError: () => toast.error("Kunne ikke fjerne selskabet"),
  });

  // --- Panel 2: Advisor access ---
  const { data: advisorAccess } = useQuery({
    queryKey: ["admin-group-advisors", groupId],
    queryFn: async () => {
      const { data } = await supabase
        .from("group_advisor_access")
        .select("id, advisor_user_id, profiles:advisor_user_id(full_name)")
        .eq("group_id", groupId!);
      return (data || []) as any[];
    },
    enabled: !!groupId && isAdmin,
  });

  const removeAdvisor = useMutation({
    mutationFn: async (accessId: string) => {
      const { error } = await supabase.from("group_advisor_access").delete().eq("id", accessId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-group-advisors", groupId] });
      toast.success("Advisor-adgang fjernet");
    },
    onError: () => toast.error("Kunne ikke fjerne adgang"),
  });

  // --- Panel 3: Delete group ---
  const deleteGroup = useMutation({
    mutationFn: async () => {
      await supabase.from("group_advisor_access").delete().eq("group_id", groupId!);
      await supabase.from("group_companies").delete().eq("group_id", groupId!);
      const { error } = await supabase.from("groups").delete().eq("id", groupId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-group-list"] });
      toast.success("Koncern slettet");
      navigate("/admin/groups");
    },
    onError: () => toast.error("Kunne ikke slette koncernen"),
  });

  if (!loading && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (error) {
    return <Navigate to="/admin/groups" replace />;
  }

  return (
    <AppLayout>
      <button
        onClick={() => navigate("/admin/groups")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Tilbage til koncernoversigt
      </button>

      <GroupDashboardContent
        companies={companies}
        aggregates={aggregates}
        isLoading={isLoading}
        groupName={groupName}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        {/* Panel 1: Selskaber i koncernen */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-4.5 w-4.5 text-primary" />
              <h3 className="font-semibold text-foreground">Selskaber i koncernen</h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddCompany((v) => !v)}
              className="gap-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Tilføj selskab
            </Button>
          </div>

          {showAddCompany && (
            <div className="flex items-center gap-2">
              <select
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Vælg virksomhed...</option>
                {(allCompanies || [])
                  .filter(
                    (c) =>
                      !(groupCompanies || []).some(
                        (gc: any) => gc.company_id === c.id
                      )
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <Button
                size="sm"
                disabled={!selectedCompanyId || addCompany.isPending}
                onClick={() => addCompany.mutate(selectedCompanyId)}
              >
                {addCompany.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Tilføj"
                )}
              </Button>
              <button
                onClick={() => {
                  setShowAddCompany(false);
                  setSelectedCompanyId("");
                }}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="space-y-1">
            {(groupCompanies || []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center">
                Ingen selskaber tilknyttet endnu.
              </p>
            ) : (
              (groupCompanies || []).map((gc: any) => (
                <div
                  key={gc.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <span className="text-sm text-foreground">
                    {gc.companies?.name || gc.company_id}
                  </span>
                  <button
                    onClick={() => removeCompany.mutate(gc.id)}
                    disabled={removeCompany.isPending}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Fjern fra koncern"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Panel 2: Advisor-adgang */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <UserCog className="h-4.5 w-4.5 text-primary" />
            <h3 className="font-semibold text-foreground">Advisor-adgang</h3>
          </div>

          <div className="space-y-1">
            {(advisorAccess || []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center">
                Ingen advisors har adgang endnu.
              </p>
            ) : (
              (advisorAccess || []).map((advisor: any) => (
                <div
                  key={advisor.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <span className="text-sm text-foreground">
                    {advisor.profiles?.full_name || advisor.advisor_user_id}
                  </span>
                  <button
                    onClick={() => removeAdvisor.mutate(advisor.id)}
                    disabled={removeAdvisor.isPending}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Fjern adgang"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Tildel adgang via Administrer rådgivere.
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-destructive/30 bg-destructive/5 p-5 space-y-3">
        <h3 className="font-semibold text-destructive">Farezone</h3>
        <p className="text-sm text-muted-foreground">
          Sletning af en koncern fjerner alle selskabstilknytninger og
          advisor-adgange. Selskaberne og deres data slettes ikke.
        </p>

        {!confirmDelete ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Slet koncern
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteGroup.isPending}
              onClick={() => deleteGroup.mutate()}
            >
              {deleteGroup.isPending && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              Bekræft sletning
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(false)}
            >
              Annuller
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default AdminGroupDetail;
