import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, Loader2, AlertTriangle, Users, ChevronRight } from "lucide-react";

interface CompanyOption {
  id: string;
  name: string;
  members: { user_id: string; full_name: string; role: string }[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  groupName: string;
  allCompanies: CompanyOption[];
  groupedCompanyIds: Set<string>;
  onSuccess: () => void;
}

type Step = "select" | "confirm";

export default function AddCompanyToGroupDialog({
  open,
  onOpenChange,
  groupId,
  groupName,
  allCompanies,
  groupedCompanyIds,
  onSuccess,
}: Props) {
  const [step, setStep] = useState<Step>("select");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");

  const ungroupedCompanies = useMemo(
    () =>
      allCompanies
        .filter((c) => !groupedCompanyIds.has(c.id))
        .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name, "da")),
    [allCompanies, groupedCompanyIds, search]
  );

  const selectedCompany = allCompanies.find((c) => c.id === selectedCompanyId);

  const handleReset = () => {
    setStep("select");
    setSelectedCompanyId(null);
    setSelectedMembers(new Set());
    setSearch("");
  };

  const handleOpenChange = (val: boolean) => {
    if (!val) handleReset();
    onOpenChange(val);
  };

  const handleSelectCompany = (id: string) => {
    setSelectedCompanyId(id);
    const company = allCompanies.find((c) => c.id === id);
    // Auto-select all members by default
    setSelectedMembers(new Set((company?.members || []).map((m) => m.user_id)));
    setStep("confirm");
  };

  const toggleMember = (userId: string) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!selectedCompanyId) return;
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Ikke autentificeret");

      const memberEntries = Array.from(selectedMembers).map((uid) => ({
        user_id: uid,
        role: "member",
      }));

      const { data, error } = await supabase.functions.invoke(
        "admin-add-company-to-group",
        {
          body: { group_id: groupId, company_id: selectedCompanyId, members: memberEntries },
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(
        `${selectedCompany?.name} er tilføjet til ${groupName}`,
        {
          description:
            "Virksomheden vises i /group og /group/budget når den har indsendt rapporter. Operativt arbejde er fortsat låst til anchor-virksomheden i v1.",
          duration: 8000,
        }
      );

      handleOpenChange(false);
      onSuccess();
    } catch (err: any) {
      console.error("Add company to group failed:", err);
      toast.error("Kunne ikke tilføje virksomhed", {
        description: err.message || "Ukendt fejl",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        {step === "select" && (
          <>
            <DialogHeader>
              <DialogTitle>Tilføj virksomhed til {groupName}</DialogTitle>
              <DialogDescription>
                Vælg en virksomhed, der ikke allerede tilhører en koncern.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <input
                type="text"
                placeholder="Søg virksomhed..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />

              <div className="max-h-64 overflow-y-auto space-y-1">
                {ungroupedCompanies.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Ingen tilgængelige virksomheder
                  </p>
                ) : (
                  ungroupedCompanies.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleSelectCompany(c.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/50 transition-colors text-left"
                    >
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Building2 className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {c.members.length} {c.members.length === 1 ? "bruger" : "brugere"}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))
                )}
              </div>
            </div>
          </>
        )}

        {step === "confirm" && selectedCompany && (
          <>
            <DialogHeader>
              <DialogTitle>Bekræft tilføjelse</DialogTitle>
              <DialogDescription>
                <strong>{selectedCompany.name}</strong> tilføjes til <strong>{groupName}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Member selection */}
              {selectedCompany.members.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Vælg brugere der skal have koncernadgang
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1 pl-1">
                    {selectedCompany.members.map((m) => (
                      <label
                        key={m.user_id}
                        className="flex items-center gap-2.5 py-1.5 px-2 rounded hover:bg-secondary/30 cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedMembers.has(m.user_id)}
                          onCheckedChange={() => toggleMember(m.user_id)}
                        />
                        <span className="text-sm">{m.full_name}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">{m.role}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Explicit message when no members selected */}
              {selectedMembers.size === 0 && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-chart-warning/10 border border-chart-warning/20">
                  <AlertTriangle className="h-4 w-4 text-chart-warning mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-chart-warning">
                    Ingen brugere er valgt. Virksomheden bliver en del af koncernen, men ingen
                    brugere fra virksomheden vil få koncernadgang endnu.
                  </p>
                </div>
              )}

              {/* Limitation notice */}
              <div className="p-3 rounded-lg bg-secondary/50 border border-border space-y-1">
                <p className="text-xs text-muted-foreground">
                  • Virksomheden vises i /group og /group/budget når den har indsendt rapporter.
                </p>
                <p className="text-xs text-muted-foreground">
                  • Operativt arbejde er fortsat låst til anchor-virksomheden i v1.
                </p>
                <p className="text-xs text-muted-foreground">
                  • Denne handling kan ikke fortrydes i v1.
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStep("select")} disabled={submitting}>
                Tilbage
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Tilføj til koncern
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
