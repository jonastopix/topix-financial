import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Layers, Building2, Users, Shield, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface CompanyMember {
  user_id: string;
  full_name: string;
  role: string;
  company_id: string;
}

interface AdvisorProfile {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorCompany: { id: string; name: string };
  allCompanies: { id: string; name: string }[];
  /** company_ids already in a group (to exclude from selection) */
  groupedCompanyIds: Set<string>;
  onCreated: () => void;
}

type Step = "name" | "companies" | "members" | "advisors" | "confirm";
const STEPS: Step[] = ["name", "companies", "members", "advisors", "confirm"];

export default function CreateGroupWizard({ open, onOpenChange, anchorCompany, allCompanies, groupedCompanyIds, onCreated }: Props) {
  const [step, setStep] = useState<Step>("name");
  const [groupName, setGroupName] = useState("");
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(new Set());
  const [allMembers, setAllMembers] = useState<CompanyMember[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Map<string, "owner" | "member">>(new Map());
  const [advisors, setAdvisors] = useState<AdvisorProfile[]>([]);
  const [selectedAdvisorIds, setSelectedAdvisorIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Available companies (not anchor, not already grouped)
  const availableCompanies = allCompanies.filter(
    (c) => c.id !== anchorCompany.id && !groupedCompanyIds.has(c.id)
  );

  // All company IDs in this group
  const allGroupCompanyIds = [anchorCompany.id, ...Array.from(selectedCompanyIds)];

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep("name");
      setGroupName(anchorCompany.name + " Koncern");
      setSelectedCompanyIds(new Set());
      setSelectedMembers(new Map());
      setSelectedAdvisorIds(new Set());
    }
  }, [open, anchorCompany.name]);

  // Load members when moving to members step
  const loadMembers = async () => {
    setLoadingMembers(true);
    const { data: memberships } = await supabase
      .from("company_members" as any)
      .select("user_id, company_id, role")
      .in("company_id", allGroupCompanyIds) as any;

    const userIds = [...new Set((memberships || []).map((m: any) => m.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", userIds);

    const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name]));

    const members: CompanyMember[] = (memberships || []).map((m: any) => ({
      user_id: m.user_id,
      full_name: profileMap.get(m.user_id) || "Ukendt",
      role: m.role,
      company_id: m.company_id,
    }));

    setAllMembers(members);

    // Auto-select all, anchor company owners get "owner" role
    const sel = new Map<string, "owner" | "member">();
    members.forEach((m) => {
      const isAnchorOwner = m.company_id === anchorCompany.id && m.role === "owner";
      sel.set(m.user_id, isAnchorOwner ? "owner" : "member");
    });
    setSelectedMembers(sel);
    setLoadingMembers(false);
  };

  // Load advisors when moving to advisors step
  const loadAdvisors = async () => {
    const { data } = await supabase.rpc("get_all_advisor_profiles");
    setAdvisors((data || []) as AdvisorProfile[]);
    setSelectedAdvisorIds(new Set((data || []).map((a: any) => a.user_id)));
  };

  const goNext = async () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) {
      const next = STEPS[idx + 1];
      if (next === "members") await loadMembers();
      if (next === "advisors") await loadAdvisors();
      setStep(next);
    }
  };

  const goBack = () => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  };

  const toggleCompany = (id: string) => {
    setSelectedCompanyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleMember = (userId: string) => {
    setSelectedMembers((prev) => {
      const next = new Map(prev);
      if (next.has(userId)) next.delete(userId);
      else next.set(userId, "member");
      return next;
    });
  };

  const setMemberRole = (userId: string, role: "owner" | "member") => {
    setSelectedMembers((prev) => {
      const next = new Map(prev);
      next.set(userId, role);
      return next;
    });
  };

  const toggleAdvisor = (id: string) => {
    setSelectedAdvisorIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasOwner = Array.from(selectedMembers.values()).includes("owner");

  const handleCreate = async () => {
    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("admin-create-group", {
        body: {
          group_name: groupName.trim(),
          anchor_company_id: anchorCompany.id,
          company_ids: Array.from(selectedCompanyIds),
          members: Array.from(selectedMembers.entries()).map(([user_id, role]) => ({ user_id, role })),
          advisors: Array.from(selectedAdvisorIds),
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Koncern "${groupName}" oprettet`);
      onOpenChange(false);
      onCreated();
    } catch (err: any) {
      console.error("Create group error:", err);
      toast.error("Kunne ikke oprette koncern: " + (err.message || "Ukendt fejl"));
    } finally {
      setCreating(false);
    }
  };

  const companyNameMap = new Map(allCompanies.map((c) => [c.id, c.name]));

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Opret koncern
          </DialogTitle>
          <DialogDescription>
            Trin {STEPS.indexOf(step) + 1} af {STEPS.length}
          </DialogDescription>
        </DialogHeader>

        {/* Step: Name */}
        {step === "name" && (
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Koncernnavn</label>
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="F.eks. Two Socks Koncern"
                autoFocus
              />
            </div>
          </div>
        )}

        {/* Step: Companies */}
        {step === "companies" && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">{anchorCompany.name}</span>
                <span className="text-[10px] text-primary font-semibold uppercase tracking-wider bg-primary/10 px-1.5 py-0.5 rounded">Anchor</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Anchor-virksomheden er den primære virksomhed i koncernen. Rapportering og budget styres herfra.
              </p>
            </div>

            {availableCompanies.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ingen andre virksomheder tilgængelige.</p>
            ) : (
              <>
                <label className="text-sm font-medium text-foreground block">Tilknyt yderligere virksomheder</label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {availableCompanies.map((c) => (
                    <label key={c.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer transition-colors">
                      <Checkbox
                        checked={selectedCompanyIds.has(c.id)}
                        onCheckedChange={() => toggleCompany(c.id)}
                      />
                      <span className="text-sm text-foreground">{c.name}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Step: Members */}
        {step === "members" && (
          <div className="space-y-4 py-2">
            {loadingMembers ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Vælg hvilke brugere der skal være med i koncernen. Mindst én skal have rollen "ejer".
                </p>
                {!hasOwner && (
                  <div className="flex items-center gap-2 text-chart-warning text-xs bg-chart-warning/10 rounded-lg p-2">
                    <AlertTriangle className="h-4 w-4" />
                    Mindst én bruger skal have rollen "Ejer"
                  </div>
                )}
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {allMembers.map((m) => {
                    const isSelected = selectedMembers.has(m.user_id);
                    const memberRole = selectedMembers.get(m.user_id) || "member";
                    return (
                      <div key={m.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-colors">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleMember(m.user_id)}
                        />
                        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-[8px] font-semibold text-primary">{getInitials(m.full_name)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-foreground truncate block">{m.full_name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {companyNameMap.get(m.company_id) || "Ukendt"}
                          </span>
                        </div>
                        {isSelected && (
                          <select
                            value={memberRole}
                            onChange={(e) => setMemberRole(m.user_id, e.target.value as "owner" | "member")}
                            className="text-xs bg-background border border-border rounded px-2 py-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="member">Medlem</option>
                            <option value="owner">Ejer</option>
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Step: Advisors */}
        {step === "advisors" && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Vælg hvilke rådgivere der skal have adgang til koncernen.
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {advisors.map((a) => (
                <label key={a.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer transition-colors">
                  <Checkbox
                    checked={selectedAdvisorIds.has(a.user_id)}
                    onCheckedChange={() => toggleAdvisor(a.user_id)}
                  />
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Shield className="h-3 w-3 text-primary" />
                  </div>
                  <span className="text-sm text-foreground">{a.full_name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step: Confirm */}
        {step === "confirm" && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-secondary/50 border border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">{groupName}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider">Anchor</p>
                  <p className="text-foreground font-medium">{anchorCompany.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider">Virksomheder</p>
                  <p className="text-foreground font-medium">{allGroupCompanyIds.length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider">Medlemmer</p>
                  <p className="text-foreground font-medium">{selectedMembers.size}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wider">Rådgivere</p>
                  <p className="text-foreground font-medium">{selectedAdvisorIds.size}</p>
                </div>
              </div>
            </div>
            <div className="rounded-lg bg-chart-warning/10 border border-chart-warning/30 p-3">
              <p className="text-xs text-chart-warning">
                <strong>Bemærk:</strong> Denne handling opretter en koncern og giver de valgte brugere adgang til koncernoverblik, chat og budget. Handlingen kan ikke fortrydes i denne version.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step !== "name" && (
            <Button variant="outline" onClick={goBack} disabled={creating}>
              Tilbage
            </Button>
          )}
          {step !== "confirm" ? (
            <Button
              onClick={goNext}
              disabled={
                (step === "name" && !groupName.trim()) ||
                (step === "members" && (!hasOwner || selectedMembers.size === 0))
              }
            >
              Næste
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Opret koncern
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
