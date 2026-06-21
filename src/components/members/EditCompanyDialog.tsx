import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface EditCompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  onSaved?: () => void;
}

interface CompanyEditForm {
  contract_start_date: string;
  contract_end_date: string;
  subscription_status: string;
  cvr_number: string;
  industry_label: string;
  website: string;
  slack_channel: string;
  intro_session_used: boolean;
}

const EMPTY_FORM: CompanyEditForm = {
  contract_start_date: "",
  contract_end_date: "",
  subscription_status: "",
  cvr_number: "",
  industry_label: "",
  website: "",
  slack_channel: "",
  intro_session_used: false,
};

// Delt, selv-fetchende dialog. Aabnes baade fra MemberDetail og fra medlemsoversigten
// (Members) med kun et companyId. Den henter selv de 8 redigerbare felter, saa den raa
// intro_session_used_at-timestamp altid er til raadighed for preservation ved gem.
const EditCompanyDialog = ({ open, onOpenChange, companyId, onSaved }: EditCompanyDialogProps) => {
  const [form, setForm] = useState<CompanyEditForm>(EMPTY_FORM);
  // Bevar den hentede intro-timestamp, saa en almindelig gem aldrig flytter "hvornaar brugt".
  const [originalIntroAt, setOriginalIntroAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Selv-fetch: hent de 8 felter naar dialogen aabner for et companyId. No-op hvis null.
  useEffect(() => {
    if (!open || !companyId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("contract_start_date, contract_end_date, subscription_status, cvr_number, industry_label, website, slack_channel, intro_session_used_at")
        .eq("id", companyId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.error("Kunne ikke hente virksomhedsdata", { description: error?.message });
        setLoading(false);
        return;
      }
      const c = data as any;
      setOriginalIntroAt(c.intro_session_used_at ?? null);
      setForm({
        contract_start_date: c.contract_start_date?.slice(0, 10) || "",
        contract_end_date: c.contract_end_date?.slice(0, 10) || "",
        subscription_status: c.subscription_status || "",
        cvr_number: c.cvr_number || "",
        industry_label: c.industry_label || "",
        website: c.website || "",
        slack_channel: c.slack_channel || "",
        intro_session_used: !!c.intro_session_used_at,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, companyId]);

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      const updates: Record<string, any> = {
        contract_start_date: form.contract_start_date || null,
        contract_end_date: form.contract_end_date || null,
        subscription_status: form.subscription_status || null,
        cvr_number: form.cvr_number || null,
        industry_label: form.industry_label || null,
        website: form.website || null,
        slack_channel: form.slack_channel || null,
      };
      // Gratis intro-session: map afkrydsning til timestamp, men bevar et eksisterende
      // tidspunkt saa en almindelig gem aldrig overskriver "hvornaar brugt".
      if (form.intro_session_used) {
        updates.intro_session_used_at = originalIntroAt || new Date().toISOString();
      } else {
        updates.intro_session_used_at = null;
      }
      const { error } = await (supabase.from("companies").update(updates as any).eq("id", companyId) as any);
      if (error) throw error;
      toast.success("Virksomhedsdata gemt");
      onOpenChange(false);
      onSaved?.();
    } catch (err: any) {
      toast.error("Kunne ikke gemme", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Rediger virksomhedsdata</DialogTitle>
          <DialogDescription>Ændringer gemmes direkte på virksomheden i databasen.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Kontraktstart</label>
            <input
              type="date"
              value={form.contract_start_date}
              onChange={(e) => setForm(f => ({ ...f, contract_start_date: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Kontraktslut</label>
            <input
              type="date"
              value={form.contract_end_date}
              onChange={(e) => setForm(f => ({ ...f, contract_end_date: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">CVR-nummer</label>
            <input
              type="text"
              value={form.cvr_number}
              onChange={(e) => setForm(f => ({ ...f, cvr_number: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="12345678"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Branche</label>
            <input
              type="text"
              value={form.industry_label}
              onChange={(e) => setForm(f => ({ ...f, industry_label: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Website</label>
            <input
              type="text"
              value={form.website}
              onChange={(e) => setForm(f => ({ ...f, website: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="https://"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Slack-kanal</label>
            <input
              type="text"
              value={form.slack_channel}
              onChange={(e) => setForm(f => ({ ...f, slack_channel: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="#virksomhed"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Abonnementsstatus</label>
            <select
              value={form.subscription_status}
              onChange={(e) => setForm(f => ({ ...f, subscription_status: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Ingen (kontraktmedlem)</option>
              <option value="active">active (self-serve abonnent)</option>
              <option value="cancelled">cancelled</option>
              <option value="past_due">past_due</option>
            </select>
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-foreground">
              <input
                type="checkbox"
                checked={form.intro_session_used}
                onChange={(e) => setForm(f => ({ ...f, intro_session_used: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              Gratis intro-session brugt
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annullér</Button>
          <Button onClick={handleSave} disabled={saving || loading || !companyId}>
            {saving ? "Gemmer..." : "Gem ændringer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditCompanyDialog;
