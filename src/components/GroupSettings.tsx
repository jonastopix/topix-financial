import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings, Pencil, UserPlus, Loader2, Mail, Building2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { GroupCompanySummary } from "@/lib/groupDashboardUtils";

interface GroupSettingsProps {
  groupId: string;
  groupName: string | null;
  companies: GroupCompanySummary[];
  userId: string;
}

interface InviteState {
  companyId: string;
  companyName: string;
  email: string;
  sending: boolean;
}

const GroupSettings = ({ groupId, groupName, companies, userId }: GroupSettingsProps) => {
  const queryClient = useQueryClient();

  // Section A — Rename
  const [newName, setNewName] = useState(groupName || "");
  const [saving, setSaving] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);

  const handleRename = async () => {
    if (!newName.trim() || !groupId) return;
    setSaving(true);
    const { error } = await (supabase.from("groups" as any)
      .update({ name: newName.trim() })
      .eq("id", groupId) as any);
    setSaving(false);
    if (error) {
      toast.error("Kunne ikke opdatere navnet");
      return;
    }
    toast.success("Koncernens navn er opdateret");
    setRenameOpen(false);
    queryClient.invalidateQueries({ queryKey: ["group-financial-summary"] });
  };

  // Section B — Invite
  const [inviteState, setInviteState] = useState<InviteState | null>(null);

  const handleInvite = async () => {
    if (!inviteState || !inviteState.email.trim()) return;
    setInviteState(prev => prev ? { ...prev, sending: true } : null);

    const token = crypto.randomUUID();
    const { error } = await supabase.from("company_invitations").insert({
      company_id: inviteState.companyId,
      email: inviteState.email.trim().toLowerCase(),
      token,
      status: "pending",
      invited_by: userId,
    } as any);

    if (error) {
      toast.error("Kunne ikke oprette invitation");
      setInviteState(prev => prev ? { ...prev, sending: false } : null);
      return;
    }

    // Try to send invitation email (best effort)
    await supabase.functions.invoke("send-invitation-email", {
      body: {
        invitationId: token,
        companyId: inviteState.companyId,
        email: inviteState.email.trim().toLowerCase(),
      },
    });

    toast.success(`Invitation sendt til ${inviteState.email.trim()}`);
    setInviteState(null);
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Koncern-indstillinger</h3>
        </div>

        <div className="space-y-5">
          {/* Section A — Rename */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Koncernnavn
              </span>
              {!renameOpen && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] gap-1"
                  onClick={() => { setRenameOpen(true); setNewName(groupName || ""); }}
                >
                  <Pencil className="h-3 w-3" />
                  Rediger
                </Button>
              )}
            </div>
            {renameOpen ? (
              <div className="flex items-center gap-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }}
                  placeholder="Nyt koncernnavn"
                  className="h-8 text-sm"
                  autoFocus
                />
                <Button
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={handleRename}
                  disabled={saving || !newName.trim()}
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Gem"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => setRenameOpen(false)}
                >
                  Annuller
                </Button>
              </div>
            ) : (
              <p className="text-sm text-foreground">{groupName || "—"}</p>
            )}
          </div>

          {/* Section B — Invite to company */}
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-2">
              Invitér medlem til selskab
            </span>
            <div className="space-y-2">
              {companies.map(c => (
                <div
                  key={c.company_id}
                  className="flex items-center gap-2 p-2 rounded-lg border border-border bg-background"
                >
                  <div className="h-6 w-6 rounded bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
                    {c.logo_url ? (
                      <img src={c.logo_url} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <span className="text-xs font-medium text-foreground truncate flex-1">
                    {c.company_name}
                  </span>

                  {inviteState?.companyId === c.company_id ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="email"
                        value={inviteState.email}
                        onChange={(e) => setInviteState(prev => prev ? { ...prev, email: e.target.value } : null)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleInvite(); }}
                        placeholder="email@eksempel.dk"
                        className="h-7 text-xs w-44"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        className="h-7 px-2 text-[10px]"
                        onClick={handleInvite}
                        disabled={inviteState.sending || !inviteState.email.trim()}
                      >
                        {inviteState.sending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-1.5 text-[10px]"
                        onClick={() => setInviteState(null)}
                      >
                        ✕
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[10px] gap-1 shrink-0"
                      onClick={() => setInviteState({
                        companyId: c.company_id,
                        companyName: c.company_name,
                        email: "",
                        sending: false,
                      })}
                    >
                      <UserPlus className="h-3 w-3" />
                      Invitér
                    </Button>
                  )}
                </div>
              ))}
              {companies.length === 0 && (
                <p className="text-xs text-muted-foreground">Ingen selskaber i koncernen.</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default GroupSettings;
