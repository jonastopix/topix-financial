import { supabase } from "@/integrations/supabase/client";
import {
  Send, CheckCircle2, AlertTriangle, Mail, Trash2,
  RotateCcw, Loader2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogContent,
  AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import { toast } from "sonner";
import type { CompanyData } from "./types";

interface MembersAdminSectionProps {
  isAdmin: boolean;
  acceptedCount: number;
  pendingCount: number;
  notInvitedCount: number;
  companies: CompanyData[];
  standalonePendingInvitations: any[];
  resendingInvitation: string | null;
  onResendInvitation: (company: CompanyData) => void;
  onResendStandaloneInvitation: (inv: { id: string; email: string; token: string }) => void;
  onReload: () => void;
}

const MembersAdminSection = ({
  isAdmin,
  acceptedCount,
  pendingCount,
  notInvitedCount,
  companies,
  standalonePendingInvitations,
  resendingInvitation,
  onResendInvitation,
  onResendStandaloneInvitation,
  onReload,
}: MembersAdminSectionProps) => {
  if (!isAdmin) return null;

  const companyPendingInvitations = companies
    .flatMap(c => {
      const companyInvs = (c as any).__pendingInvitations || [];
      return companyInvs.map((inv: any) => ({ ...inv, companyName: c.name, companyId: c.id }));
    });
  const standaloneInvs = standalonePendingInvitations.map((inv: any) => ({
    ...inv,
    companyName: "Ingen virksomhed",
    companyId: null,
  }));
  const pendingInvitations = [...companyPendingInvitations, ...standaloneInvs];

  return (
    <>
      {/* Invitation stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="glass-card rounded-xl p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-green-500/15 flex items-center justify-center">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-lg font-display font-bold text-foreground">{acceptedCount}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Accepteret</p>
          </div>
        </div>
        <div className="glass-card rounded-xl p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-chart-warning/15 flex items-center justify-center">
            <Send className="h-4 w-4 text-chart-warning" />
          </div>
          <div>
            <p className="text-lg font-display font-bold text-foreground">{pendingCount}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Afventer svar</p>
          </div>
        </div>
        <div className="glass-card rounded-xl p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-lg font-display font-bold text-foreground">{notInvitedCount}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ikke inviteret</p>
          </div>
        </div>
      </div>

      {/* Pending invitations overview */}
      <div className="mb-6 glass-card rounded-xl overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-2 border-b border-border">
          <Send className="h-4 w-4 text-chart-warning" />
          <span className="text-sm font-semibold text-foreground">Afventende invitationer</span>
          <span className="ml-1 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-chart-warning/15 text-chart-warning text-xs font-bold">
            {pendingInvitations.length}
          </span>
        </div>
        {pendingInvitations.length > 0 ? (
          <div className="divide-y divide-border">
            {pendingInvitations.map((inv: any) => (
              <div key={inv.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">{inv.companyName} · Sendt {format(new Date(inv.lastSentAt || inv.created_at), "d. MMM yyyy", { locale: da })}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => {
                      if (inv.companyId) {
                        const company = companies.find(c => c.id === inv.companyId);
                        if (company) onResendInvitation(company);
                      } else {
                        onResendStandaloneInvitation({ id: inv.id, email: inv.email, token: inv.token });
                      }
                    }}
                    disabled={resendingInvitation === (inv.companyId || inv.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-medium hover:bg-secondary/80 transition-colors border border-border disabled:opacity-50"
                  >
                    {resendingInvitation === (inv.companyId || inv.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                    Gensend
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Slet invitation?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Er du sikker på, at du vil slette invitationen til <strong>{inv.email}</strong>? Dette kan ikke fortrydes.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuller</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={async () => {
                            const { error } = await supabase
                              .from("company_invitations")
                              .delete()
                              .eq("id", inv.id);
                            if (error) {
                              toast.error("Kunne ikke slette invitationen: " + error.message);
                            } else {
                              toast.success(`Invitation til ${inv.email} er slettet`);
                              onReload();
                            }
                          }}
                        >
                          Slet
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">Ingen afventende invitationer</p>
          </div>
        )}
      </div>
    </>
  );
};

export default MembersAdminSection;
