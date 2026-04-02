import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { UserPlus, Trash2, Mail, Loader2, Clock, CheckCircle2, Users, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

interface Invitation {
  id: string;
  email: string;
  status: string;
  created_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  token: string;
  acceptor_name?: string;
  acceptor_email?: string;
}

const CompanyInvitations = () => {
  const { user, companyId, companyName } = useAuth();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [members, setMembers] = useState<{ user_id: string; role: string; full_name: string; email: string }[]>([]);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  const fetchData = async () => {
    if (!companyId) return;
    setLoading(true);

    const [invRes, memRes] = await Promise.all([
      supabase
        .from("company_invitations" as any)
        .select("id, email, status, created_at, accepted_at, accepted_by, token")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
      supabase
        .from("company_members" as any)
        .select("user_id, role")
        .eq("company_id", companyId),
    ]);

    // Enrich accepted invitations with acceptor profile info
    const rawInvitations = (invRes.data as any) || [];
    const acceptedByIds = rawInvitations
      .filter((i: any) => i.accepted_by)
      .map((i: any) => i.accepted_by);

    let acceptorProfiles: Record<string, { full_name: string; email: string | null }> = {};
    if (acceptedByIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", acceptedByIds);
      (profiles || []).forEach((p: any) => {
        acceptorProfiles[p.user_id] = { full_name: p.full_name, email: p.email };
      });
    }

    setInvitations(rawInvitations.map((inv: any) => {
      const acceptor = inv.accepted_by ? acceptorProfiles[inv.accepted_by] : null;
      return {
        ...inv,
        acceptor_name: acceptor?.full_name || undefined,
        acceptor_email: acceptor?.email || undefined,
      };
    }));

    const memberData = (memRes.data as any) || [];
    if (memberData.length > 0) {
      const userIds = memberData.map((m: any) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const enriched = memberData.map((m: any) => {
        const profile = profiles?.find((p) => p.user_id === m.user_id);
        return {
          ...m,
          full_name: profile?.full_name || "Ukendt",
          email: "",
        };
      });
      setMembers(enriched);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [companyId]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !user || !email.trim()) return;

    const trimmed = email.trim().toLowerCase();

    // Check if already invited
    if (invitations.some((i) => i.email === trimmed && i.status === "pending")) {
      toast.error("Denne e-mail er allerede inviteret");
      return;
    }

    // Show confirmation dialog instead of sending directly
    setPendingEmail(trimmed);
    setShowConfirm(true);
  };

  const confirmInvite = async () => {
    if (!companyId || !user || !pendingEmail) return;

    setShowConfirm(false);
    setSending(true);

    try {
      // Look up existing invitation for (company, email)
      const { data: existing } = await supabase
        .from("company_invitations")
        .select("id, token, status")
        .eq("company_id", companyId)
        .eq("email", pendingEmail)
        .maybeSingle();

      let invToken: string | null = null;
      let wasResent = false;

      if (existing) {
        if (existing.status === "accepted") {
          await supabase
            .from("company_invitations")
            .update({ status: "pending", accepted_at: null, accepted_by: null })
            .eq("id", existing.id);
        }
        invToken = existing.token;
        wasResent = true;
      } else {
        const { data: newInv, error: invErr } = await (supabase
          .from("company_invitations" as any)
          .insert({
            company_id: companyId,
            email: pendingEmail,
            invited_by: user.id,
          } as any) as any)
          .select("token")
          .single();

        if (invErr) {
          if (invErr.code === "23505") {
            // Race condition: fetch existing token
            const { data: raceInv } = await supabase
              .from("company_invitations")
              .select("token")
              .eq("company_id", companyId)
              .eq("email", pendingEmail)
              .maybeSingle();
            invToken = raceInv?.token || null;
            wasResent = true;
          } else {
            toast.error("Kunne ikke oprette invitation");
            setSending(false);
            setPendingEmail("");
            return;
          }
        } else {
          invToken = newInv?.token || null;
        }
      }

      toast.success(wasResent ? `Invitation gensendt til ${pendingEmail}` : `Invitation oprettet til ${pendingEmail}`);
      setEmail("");
      fetchData();

      // Send invitation email
      const tokenParam = invToken ? `&invite=${invToken}` : "";
      await supabase.functions.invoke("send-invitation-email", {
        body: {
          email: pendingEmail,
          company_name: companyName || "Din virksomhed",
          signup_url: `https://app.theboardroom.dk/auth?mode=signup${tokenParam}`,
        },
      });
    } catch (err: any) {
      console.error("Invitation error:", err);
      toast.error("Kunne ikke sende invitation: " + (err.message || "Ukendt fejl"));
    }

    setSending(false);
    setPendingEmail("");
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("company_invitations" as any)
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Kunne ikke slette invitation");
    } else {
      toast.success("Invitation slettet");
      fetchData();
    }
  };

  if (!companyId) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Current members */}
      <div className="glass-card rounded-xl p-6 animate-fade-in">
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Teammedlemmer — {companyName}
        </h2>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Indlæser...
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ingen medlemmer fundet</p>
        ) : (
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.user_id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/50">
                <div>
                  <span className="text-sm font-medium text-foreground">{m.full_name}</span>
                  <span className="ml-2 text-xs text-muted-foreground capitalize">({m.role})</span>
                </div>
                {m.user_id === user?.id && (
                  <span className="text-xs text-primary font-medium">Dig</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invite form */}
      <div className="glass-card rounded-xl p-6 animate-fade-in">
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          Invitér teammedlem
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Invitér en kollega via e-mail. De modtager et link og tilknyttes automatisk jeres virksomhed — uanset hvilken e-mail de opretter sig med.
        </p>
        <form onSubmit={handleInvite} className="flex gap-2">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="kollega@firma.dk"
            />
          </div>
          <button
            type="submit"
            disabled={sending}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Invitér
          </button>
        </form>
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div className="glass-card rounded-xl p-6 animate-fade-in">
          <h2 className="font-display font-semibold text-foreground mb-4">Invitationer</h2>
          <div className="space-y-2">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/50">
                <div className="flex items-center gap-2">
                  {inv.status === "pending" ? (
                    <Clock className="h-4 w-4 text-warning" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  )}
                  {inv.status === "pending" ? (
                    <>
                      <span className="text-sm text-foreground">{inv.email}</span>
                      <span className="text-xs text-muted-foreground">Afventer</span>
                    </>
                  ) : inv.acceptor_name ? (
                    <>
                      <span className="text-sm text-foreground">
                        {inv.acceptor_name}
                        {inv.acceptor_email ? ` (${inv.acceptor_email})` : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">Accepteret</span>
                    </>
                  ) : (
                    <>
                      <span className="text-sm text-foreground">Accepteret</span>
                    </>
                  )}
                </div>
                {inv.status === "pending" && (
                  <button
                    onClick={() => handleDelete(inv.id)}
                    className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    title="Slet invitation"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {invitations.some(inv => inv.status === "pending") && (
            <div className="mt-3 space-y-1">
              <p className="text-xs text-muted-foreground">Kopiér invitationslink:</p>
              {invitations.filter(inv => inv.status === "pending").map(inv => (
                <div key={inv.id} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground truncate">{inv.email}:</span>
                  <span
                    className="text-xs font-mono text-foreground select-all cursor-pointer hover:underline truncate"
                    onClick={() => {
                      navigator.clipboard.writeText(`https://app.theboardroom.dk/auth?mode=signup&invite=${inv.token}`);
                      toast.success("Link kopieret");
                    }}
                  >
                    https://app.theboardroom.dk/auth?mode=signup&invite={inv.token}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Confirmation dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Bekræft invitation
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                <p>Du er ved at invitere:</p>
                <p className="text-base font-semibold text-foreground bg-secondary px-3 py-2 rounded-lg">{pendingEmail}</p>
                <p>til virksomheden:</p>
                <p className="text-base font-semibold text-foreground bg-secondary px-3 py-2 rounded-lg">{companyName}</p>
                <p className="text-xs text-destructive font-medium mt-2">
                  Denne handling kan ikke fortrydes automatisk.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuller</AlertDialogCancel>
            <AlertDialogAction onClick={confirmInvite}>Ja, send invitation</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CompanyInvitations;
