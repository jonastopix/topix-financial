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
import { erNytMedlem } from "@/lib/medlemsOverblik";
import { retTilGode } from "@/lib/sessionRet";

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
  /** Jonas' inkluderede session (13/9): companies.jonas_session_used_at —
      søster til intro_session_used_at (Mortens). Samme mønster: afkrydsning
      ↔ timestamp, hentet tidspunkt bevares ved gem. */
  jonas_session_used: boolean;
  /** «Session med Jonas · tilbudt» (1/10-2026, migration 20261001110000):
      companies.jonas_session_tilbudt_at — et ældre medlem (fra før 14/9) er
      tilbudt Jonas-sessionen og tæller da i forsidens «Mangler at booke»
      (lib/medlemsOverblik omfattetAfJonas). Samme mønster: afkrydsning ↔
      timestamp, hentet tidspunkt bevares ved gem. Kun rådgivere skriver den —
      kolonnen står ikke på companies_medlem_kolonnevaern's hvidliste. */
  jonas_session_tilbudt: boolean;
  /** Gæst (kort #174, 10/9): companies.vis_i_netvaerk = false. Feltet blev
      før kun sat med SQL (migration 20260902110000). Vendt i formularen:
      «gæst» = ikke i Netværket. RLS: «Advisors can update all companies»
      (has_role advisor — admin arver) dækker kolonnen; ingen kolonne-trigger. */
  gaest: boolean;
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
  jonas_session_used: false,
  jonas_session_tilbudt: false,
  gaest: false,
};

// Delt, selv-fetchende dialog. Aabnes baade fra MemberDetail og fra medlemsoversigten
// (Members) med kun et companyId. Den henter selv de 8 redigerbare felter, saa den raa
// intro_session_used_at-timestamp altid er til raadighed for preservation ved gem.
const EditCompanyDialog = ({ open, onOpenChange, companyId, onSaved }: EditCompanyDialogProps) => {
  const [form, setForm] = useState<CompanyEditForm>(EMPTY_FORM);
  // Bevar den hentede intro-timestamp, saa en almindelig gem aldrig flytter "hvornaar brugt".
  // Fluebenenes STARTTILSTAND (2/10, CTO-rådets fund 3–4): sessions-kolonnerne skrives KUN, når rådgiveren
  // har ændret fluebenet. Før skrev hver gem den læste værdi tilbage — en booking mellem åbning og gem blev
  // overskrevet med den gamle «brugt» (≤ tilbuddet), og retten var til gode igen.
  const [startFlueben, setStartFlueben] = useState<{ intro: boolean; jonas: boolean; tilbudt: boolean }>({ intro: false, jonas: false, tilbudt: false });
  // Første company_members.created_at — samme «ny»-port som forsiden (erNytMedlem).
  // null (ingen medlemmer, eller hentningen fejlede) = ikke ny → fluebenet vises.
  const [medlemSiden, setMedlemSiden] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Selv-fetch: hent de 8 felter naar dialogen aabner for et companyId. No-op hvis null.
  useEffect(() => {
    if (!open || !companyId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [{ data, error }, foersteMedlem] = await Promise.all([
        supabase
          .from("companies")
          .select("contract_start_date, contract_end_date, subscription_status, cvr_number, industry_label, website, slack_channel, intro_session_used_at, jonas_session_used_at, jonas_session_tilbudt_at, vis_i_netvaerk")
          .eq("id", companyId)
          .maybeSingle(),
        supabase
          .from("company_members")
          .select("created_at")
          .eq("company_id", companyId)
          .order("created_at", { ascending: true })
          .limit(1),
      ]);
      if (cancelled) return;
      // Fejler medlemsopslaget, er porten ukendt: fluebenet vises (fail-open for VISNINGEN, aldrig for skrivningen).
      setMedlemSiden(foersteMedlem.error ? null : ((foersteMedlem.data?.[0] as { created_at?: string | null } | undefined)?.created_at ?? null));
      if (error || !data) {
        toast.error("Kunne ikke hente virksomhedsdata", { description: error?.message });
        setLoading(false);
        return;
      }
      const c = data as any;
      // «Brugt» for Jonas er DEN ENE REGEL (lib/sessionRet): et tilbud overtrumfer en ældre «brugt» — fluebenet
      // står ikke afkrydset for en tilbudt, der endnu ikke har booket.
      const flueben = {
        intro: !retTilGode("morten", c),
        jonas: !retTilGode("jonas", c),
        tilbudt: !!c.jonas_session_tilbudt_at,
      };
      setStartFlueben(flueben);
      setForm({
        contract_start_date: c.contract_start_date?.slice(0, 10) || "",
        contract_end_date: c.contract_end_date?.slice(0, 10) || "",
        subscription_status: c.subscription_status || "",
        cvr_number: c.cvr_number || "",
        industry_label: c.industry_label || "",
        website: c.website || "",
        slack_channel: c.slack_channel || "",
        intro_session_used: flueben.intro,
        jonas_session_used: flueben.jonas,
        jonas_session_tilbudt: flueben.tilbudt,
        gaest: c.vis_i_netvaerk === false,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, companyId]);

  // Fluebenet «tilbudt» vises for et ældre medlem (ikke erNytMedlem) — og altid,
  // når det allerede er sat, så det kan ryddes.
  const visTilbudt = !erNytMedlem(medlemSiden) || form.jonas_session_tilbudt;

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
        vis_i_netvaerk: !form.gaest,
      };
      // Sessions-fluebenene skrives KUN ved ÆNDRING (startFlueben ovenfor). Afkrydset nu → tidspunktet nu (for
      // Jonas efter et tilbud: nyere end tilbuddet = brugt, lib/sessionRet); fjernet → null (til gode). Et nyt
      // «tilbudt» er et NYT tilbud (nyt tidspunkt) — det overtrumfer en ældre «brugt» med vilje.
      const nuIso = new Date().toISOString();
      if (form.intro_session_used !== startFlueben.intro) updates.intro_session_used_at = form.intro_session_used ? nuIso : null;
      if (form.jonas_session_used !== startFlueben.jonas) updates.jonas_session_used_at = form.jonas_session_used ? nuIso : null;
      if (form.jonas_session_tilbudt !== startFlueben.tilbudt) updates.jonas_session_tilbudt_at = form.jonas_session_tilbudt ? nuIso : null;
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
              Session med Morten · inkluderet — brugt
            </label>
          </div>
          {visTilbudt && (
            <div>
              <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={form.jonas_session_tilbudt}
                  onChange={(e) => setForm(f => ({ ...f, jonas_session_tilbudt: e.target.checked }))}
                  className="h-4 w-4 rounded border-border"
                />
                Session med Jonas · tilbudt (ældre medlem)
              </label>
              <p className="mt-1 pl-6 text-xs text-muted-foreground">
                Kun for medlemmer fra før 14/9 — for nyere er sessionen altid med.
              </p>
            </div>
          )}
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-foreground">
              <input
                type="checkbox"
                checked={form.jonas_session_used}
                onChange={(e) => setForm(f => ({ ...f, jonas_session_used: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              Session med Jonas · inkluderet — brugt
            </label>
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-foreground">
              <input
                type="checkbox"
                checked={form.gaest}
                onChange={(e) => setForm(f => ({ ...f, gaest: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              Gæst — har adgang til platformen, men vises ikke i Netværket
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
