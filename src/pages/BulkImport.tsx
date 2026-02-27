import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import FileUploadZone from "@/components/FileUploadZone";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Upload, Info } from "lucide-react";

const BulkImport = () => {
  const { user, isAdvisor, loading } = useAuth();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [importCount, setImportCount] = useState(0);

  // Fetch all companies
  const { data: companies } = useQuery({
    queryKey: ["companies-for-import"],
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, name")
        .order("name");
      return data || [];
    },
    enabled: isAdvisor,
  });

  // Fetch owner user_id for selected company
  const { data: ownerUserId } = useQuery({
    queryKey: ["company-owner", selectedCompanyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("company_members")
        .select("user_id")
        .eq("company_id", selectedCompanyId)
        .in("role", ["owner", "member"])
        .limit(1)
        .maybeSingle();
      return data?.user_id || null;
    },
    enabled: !!selectedCompanyId,
  });

  if (loading) return null;
  if (!isAdvisor) return <Navigate to="/" replace />;

  const selectedCompany = companies?.find((c) => c.id === selectedCompanyId);

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Import rapporter
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Importér historiske rapporter for en virksomhed. Filerne kører igennem AI-pipeline automatisk.
          </p>
        </div>

        {/* Info box */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/10">
          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Rapporterne tilknyttes den valgte virksomhed og kører igennem den fulde AI-pipeline (extraction, analyse, milestones).</p>
            <p>Chat-beskeder og rådgivernotifikationer springes over ved bulk-import.</p>
          </div>
        </div>

        {/* Company selector */}
        <div className="glass-card rounded-xl p-5 space-y-3">
          <label className="text-sm font-medium text-foreground flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Vælg virksomhed
          </label>
          <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
            <SelectTrigger>
              <SelectValue placeholder="Vælg en virksomhed..." />
            </SelectTrigger>
            <SelectContent>
              {companies?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Upload zone — only show when company is selected and we have an owner */}
        {selectedCompanyId && ownerUserId && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Upload className="h-4 w-4" />
              Uploader til <span className="font-medium text-foreground">{selectedCompany?.name}</span>
              {importCount > 0 && (
                <span className="ml-auto text-xs text-primary font-medium">
                  {importCount} rapport{importCount !== 1 ? "er" : ""} importeret
                </span>
              )}
            </div>
            <FileUploadZone
              key={selectedCompanyId}
              title="Historiske rapporter"
              description="Træk flere PDF/Excel-filer ind på én gang for at importere historisk data"
              userId={ownerUserId}
              companyId={selectedCompanyId}
              adminMode
              onPipelineComplete={() => setImportCount((c) => c + 1)}
            />
          </div>
        )}

        {selectedCompanyId && !ownerUserId && (
          <div className="glass-card rounded-xl p-5 text-center text-sm text-muted-foreground">
            Ingen ejer fundet for denne virksomhed. Tilknyt først en bruger.
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default BulkImport;
