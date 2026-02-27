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
        .select("id, email, status, created_at, accepted_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
      supabase
        .from("company_members" as any)
        .select("user_id, role")
        .eq("company_id", companyId),
    ]);

    setInvitations((invRes.data as any) || []);

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

    const { error } = await supabase
      .from("company_invitations" as any)
      .insert({
        company_id: companyId,
        email: pendingEmail,
        invited_by: user.id,
      } as any);

    if (error) {
      if (error.code === "23505") {
        toast.error("Denne e-mail er allerede inviteret");
      } else {
        toast.error("Kunne ikke oprette invitation");
      }
    } else {
      toast.success(`Invitation oprettet til ${pendingEmail}`);
      setEmail("");
      fetchData();

      // Trigger invitation email
      try {
        const { data: emailResult } = await supabase.functions.invoke("send-invitation-email", {
          body: {
            email: pendingEmail,
            company_name: companyName || "Din virksomhed",
            signup_url: `https://topix.lovable.app/auth`,
          },
        });
      } catch (emailErr) {
        console.error("Could not trigger invitation email:", emailErr);
      }
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

  const signupUrl = `https://topix.lovable.app/auth`;

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
          Invitér en kollega via e-mail. Når de opretter en konto med den e-mail, bliver de automatisk tilknyttet jeres virksomhed.
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
                  <span className="text-sm text-foreground">{inv.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {inv.status === "pending" ? "Afventer" : "Accepteret"}
                  </span>
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
          <p className="text-xs text-muted-foreground mt-3">
            Del signup-linket med den inviterede: <span className="font-mono text-foreground select-all">{signupUrl}</span>
          </p>
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
