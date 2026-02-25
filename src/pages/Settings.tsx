import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Settings as SettingsIcon, User, Building2, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import CompanyInvitations from "@/components/CompanyInvitations";

const Settings = () => {
  const { user, profile } = useAuth();
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setCompanyName(profile.company_name || "");
    }
  }, [profile]);

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
                Virksomhed
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Virksomhedsnavn"
                />
              </div>
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
            Gem ændringer
          </button>
        </div>

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
