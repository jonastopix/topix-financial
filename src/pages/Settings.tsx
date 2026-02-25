import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Settings as SettingsIcon, User, Building2, Save, Loader2, Globe, Phone, Hash } from "lucide-react";
import { toast } from "sonner";
import CompanyInvitations from "@/components/CompanyInvitations";

interface CompanyData {
  id: string;
  name: string;
  cvr_number: string | null;
  contact_email: string | null;
  website: string | null;
  contact_phone: string | null;
}

const Settings = () => {
  const { user, profile } = useAuth();
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [saving, setSaving] = useState(false);

  // Company fields
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [companyForm, setCompanyForm] = useState({
    name: "",
    cvr_number: "",
    contact_email: "",
    website: "",
    contact_phone: "",
  });
  const [savingCompany, setSavingCompany] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setCompanyName(profile.company_name || "");
    }
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    const fetchCompany = async () => {
      const { data: cm } = await supabase
        .from("company_members")
        .select("company_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (!cm?.company_id) return;

      const { data } = await supabase
        .from("companies")
        .select("id, name, cvr_number, contact_email, website, contact_phone")
        .eq("id", cm.company_id)
        .single();

      if (data) {
        setCompany(data);
        setCompanyForm({
          name: data.name || "",
          cvr_number: data.cvr_number || "",
          contact_email: data.contact_email || "",
          website: data.website || "",
          contact_phone: data.contact_phone || "",
        });
      }
    };
    fetchCompany();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim(), company_name: companyName.trim() })
      .eq("user_id", user.id);

    if (error) {
      toast.error("Kunne ikke gemme ændringer");
    } else {
      toast.success("Profil opdateret");
    }
    setSaving(false);
  };

  const handleSaveCompany = async () => {
    if (!company) return;
    setSavingCompany(true);

    const { error } = await supabase
      .from("companies")
      .update({
        name: companyForm.name.trim(),
        cvr_number: companyForm.cvr_number.trim() || null,
        contact_email: companyForm.contact_email.trim() || null,
        website: companyForm.website.trim() || null,
        contact_phone: companyForm.contact_phone.trim() || null,
      })
      .eq("id", company.id);

    if (error) {
      toast.error("Kunne ikke gemme virksomhedsdata");
    } else {
      toast.success("Virksomhed opdateret");
    }
    setSavingCompany(false);
  };

  const companyField = (
    label: string,
    key: keyof typeof companyForm,
    placeholder: string,
    icon?: React.ReactNode
  ) => (
    <div>
      <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>
        )}
        <input
          value={companyForm[key]}
          onChange={(e) => setCompanyForm((p) => ({ ...p, [key]: e.target.value }))}
          className={`w-full ${icon ? "pl-10" : "px-4"} pr-4 py-2.5 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50`}
          placeholder={placeholder}
        />
      </div>
    </div>
  );

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-foreground tracking-tight flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-primary" />
          Indstillinger
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Administrér din konto og profil
        </p>
      </div>

      <div className="max-w-xl space-y-6">
        {/* Profile section */}
        <div className="glass-card rounded-xl p-6 animate-fade-in">
          <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            Profil
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                Fulde navn
              </label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="Dit fulde navn"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                E-mail
              </label>
              <input
                value={user?.email || ""}
                disabled
                className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border text-sm text-muted-foreground cursor-not-allowed"
              />
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Gem profil
          </button>
        </div>

        {/* Company section */}
        {company && (
          <div className="glass-card rounded-xl p-6 animate-fade-in">
            <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Virksomhed
            </h2>
            <div className="space-y-4">
              {companyField("Virksomhedsnavn", "name", "Virksomhedsnavn", <Building2 className="h-4 w-4" />)}
              {companyField("CVR-nummer", "cvr_number", "12345678", <Hash className="h-4 w-4" />)}
              {companyField("Kontakt e-mail", "contact_email", "kontakt@firma.dk")}
              {companyField("Hjemmeside", "website", "https://firma.dk", <Globe className="h-4 w-4" />)}
              {companyField("Telefon", "contact_phone", "+45 12 34 56 78", <Phone className="h-4 w-4" />)}
            </div>
            <button
              onClick={handleSaveCompany}
              disabled={savingCompany}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {savingCompany ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Gem virksomhed
            </button>
          </div>
        )}

        {/* Team invitations */}
        <CompanyInvitations />

        {/* Account info */}
        <div className="glass-card rounded-xl p-6 animate-fade-in">
          <h2 className="font-display font-semibold text-foreground mb-3">Konto</h2>
          <p className="text-xs text-muted-foreground">
            Logget ind som <span className="font-medium text-foreground">{user?.email}</span>
          </p>
        </div>
      </div>
    </AppLayout>
  );
};

export default Settings;
