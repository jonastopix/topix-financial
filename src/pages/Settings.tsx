import { useState, useEffect, useRef } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Settings as SettingsIcon, User, Building2, Save, Loader2, Globe, Phone, Hash, Upload, ImageIcon, Briefcase, Trash2, Send, Mail, RotateCcw, Clock, Lock, Link2 } from "lucide-react";
import PasswordStrengthIndicator, { getPasswordScore } from "@/components/PasswordStrengthIndicator";
import { toast } from "sonner";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import CompanyInvitations from "@/components/CompanyInvitations";

interface CompanyData {
  id: string;
  name: string;
  cvr_number: string | null;
  contact_email: string | null;
  website: string | null;
  contact_phone: string | null;
  logo_url: string | null;
  industry: string | null;
}

const Settings = () => {
  const { user, profile, isAdvisor, isAdmin, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Company fields
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [companyForm, setCompanyForm] = useState({
    name: "",
    cvr_number: "",
    contact_email: "",
    website: "",
    contact_phone: "",
    industry: "",
  });
  const [savingCompany, setSavingCompany] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setCompanyName(profile.company_name || "");
      setAvatarUrl(profile.avatar_url || null);
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
        .select("id, name, cvr_number, contact_email, website, contact_phone, logo_url, industry")
        .eq("id", cm.company_id)
        .single();

      if (data) {
        setCompany(data as CompanyData);
        setCompanyForm({
          name: data.name || "",
          cvr_number: data.cvr_number || "",
          contact_email: data.contact_email || "",
          website: data.website || "",
          contact_phone: data.contact_phone || "",
          industry: data.industry || "",
        });
        setLogoUrl(data.logo_url || null);
      }
    };
    fetchCompany();
  }, [user]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !company) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Vælg venligst en billedfil");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo må max være 2 MB");
      return;
    }

    setUploadingLogo(true);
    // Use a fixed filename so upsert always overwrites the same file
    const filePath = `${company.id}/logo`;

    const { error: uploadError } = await supabase.storage
      .from("company-logos")
      .upload(filePath, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      toast.error("Kunne ikke uploade logo");
      setUploadingLogo(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("company-logos")
      .getPublicUrl(filePath);

    // Add cache-busting param so browser fetches the new image
    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("companies")
      .update({ logo_url: publicUrl })
      .eq("id", company.id);

    if (updateError) {
      toast.error("Kunne ikke gemme logo-URL");
    } else {
      setLogoUrl(publicUrl);
      toast.success("Logo uploadet");
    }
    setUploadingLogo(false);
    // Reset file input so re-selecting the same file triggers onChange
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Vælg venligst en billedfil");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Billede må max være 2 MB");
      return;
    }

    setUploadingAvatar(true);
    const filePath = `${user.id}/avatar`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      toast.error("Kunne ikke uploade billede");
      setUploadingAvatar(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(filePath);

    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("user_id", user.id);

    if (updateError) {
      toast.error("Kunne ikke gemme billede-URL");
    } else {
      setAvatarUrl(publicUrl);
      await refreshProfile();
      toast.success("Profilbillede opdateret");
    }
    setUploadingAvatar(false);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  };

  const handleRemoveAvatar = async () => {
    if (!user) return;
    setUploadingAvatar(true);

    const { error: deleteError } = await supabase.storage
      .from("avatars")
      .remove([`${user.id}/avatar`]);

    if (deleteError) {
      toast.error("Kunne ikke slette billede");
      setUploadingAvatar(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("user_id", user.id);

    if (updateError) {
      toast.error("Kunne ikke opdatere profil");
    } else {
      setAvatarUrl(null);
      await refreshProfile();
      toast.success("Profilbillede fjernet");
    }
    setUploadingAvatar(false);
  };

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

  const handleChangePassword = async () => {
    if (!currentPassword) {
      toast.error("Indtast din nuværende adgangskode");
      return;
    }
    if (getPasswordScore(newPassword) < 2) {
      toast.error("Vælg en stærkere adgangskode");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("De to adgangskoder matcher ikke");
      return;
    }
    setSavingPassword(true);

    // Verify current password by re-authenticating
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user?.email || "",
      password: currentPassword,
    });
    if (signInError) {
      toast.error("Nuværende adgangskode er forkert");
      setSavingPassword(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Adgangskode opdateret");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
    setSavingPassword(false);
  };

  const handleSaveCompany = async () => {
    if (!company) return;

    // Validate inputs
    const name = companyForm.name.trim();
    const cvr = companyForm.cvr_number.trim();
    const email = companyForm.contact_email.trim();
    const website = companyForm.website.trim();
    const phone = companyForm.contact_phone.trim();
    const industry = companyForm.industry.trim();

    if (!name || name.length > 200) {
      toast.error("Virksomhedsnavn skal udfyldes (max 200 tegn)");
      return;
    }
    if (cvr && !/^\d{8}$/.test(cvr)) {
      toast.error("CVR-nummer skal være præcis 8 cifre");
      return;
    }
    if (email && (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      toast.error("Ugyldig e-mailadresse");
      return;
    }
    if (website && website.length > 500) {
      toast.error("Hjemmeside-URL er for lang (max 500 tegn)");
      return;
    }
    if (phone && (phone.length > 30 || !/^[+\d\s\-()]+$/.test(phone))) {
      toast.error("Ugyldigt telefonnummer");
      return;
    }
    if (industry.length > 100) {
      toast.error("Branche må max være 100 tegn");
      return;
    }

    setSavingCompany(true);

    const { error } = await supabase
      .from("companies")
      .update({
        name,
        cvr_number: cvr || null,
        contact_email: email || null,
        website: website || null,
        contact_phone: phone || null,
        industry: industry || null,
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

  // Settings is available to all authenticated users (personal profile settings)

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
          {/* Avatar upload */}
          <div className="flex items-center gap-4 mb-5">
            <div className="h-16 w-16 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profilbillede" className="h-full w-full object-cover" />
              ) : (
                <span className="text-lg font-semibold text-muted-foreground">
                  {getInitials(fullName || user?.email || "?")}
                </span>
              )}
            </div>
            <div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {avatarUrl ? "Skift billede" : "Upload billede"}
                </button>
                {avatarUrl && (
                  <button
                    onClick={handleRemoveAvatar}
                    disabled={uploadingAvatar}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Fjern
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">PNG, JPG – max 2 MB</p>
            </div>
          </div>

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
            {/* Logo upload */}
            <div className="mb-5">
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Logo
              </label>
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-lg bg-secondary border border-border flex items-center justify-center overflow-hidden shrink-0">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Virksomhedslogo" className="h-full w-full object-contain" />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {logoUrl ? "Skift logo" : "Upload logo"}
                  </button>
                  <p className="text-xs text-muted-foreground mt-1">PNG, JPG – max 2 MB</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {companyField("Virksomhedsnavn", "name", "Virksomhedsnavn", <Building2 className="h-4 w-4" />)}
              {companyField("CVR-nummer", "cvr_number", "12345678", <Hash className="h-4 w-4" />)}
              {companyField("Kontakt e-mail", "contact_email", "kontakt@firma.dk")}
              {companyField("Hjemmeside", "website", "https://firma.dk", <Globe className="h-4 w-4" />)}
              {companyField("Telefon", "contact_phone", "+45 12 34 56 78", <Phone className="h-4 w-4" />)}
              {companyField("Branche", "industry", "F.eks. E-commerce, Håndværker, Autoværksted…", <Briefcase className="h-4 w-4" />)}
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

        {/* Change password */}
        <div className="glass-card rounded-xl p-6 animate-fade-in">
          <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            Skift adgangskode
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                Nuværende adgangskode
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                Ny adgangskode
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="••••••••"
              />
            </div>
            <PasswordStrengthIndicator password={newPassword} />
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                Bekræft ny adgangskode
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="••••••••"
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-destructive mt-1">Adgangskoderne matcher ikke</p>
              )}
            </div>
          </div>
          <button
            onClick={handleChangePassword}
            disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Opdater adgangskode
          </button>
        </div>

        {/* Linked login methods */}
        <LinkedLoginMethods />

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

// Linked login methods section (info only — manual linking not available)
const LinkedLoginMethods = () => {
  const { user } = useAuth();

  const identities = user?.identities || [];
  const googleIdentity = identities.find((i) => i.provider === "google");
  const hasPassword = identities.some((i) => i.provider === "email");

  return (
    <div className="glass-card rounded-xl p-6 animate-fade-in">
      <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
        <Link2 className="h-4 w-4 text-primary" />
        Login-metoder
      </h2>

      <div className="space-y-3">
        {/* Email/password */}
        {hasPassword && (
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">E-mail & adgangskode</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <span className="text-xs text-primary bg-primary/10 px-2 py-1 rounded">Aktiv</span>
          </div>
        )}

        {/* Google */}
        <div className={`flex items-center justify-between py-2 ${hasPassword ? "border-t border-border pt-3" : ""}`}>
          <div className="flex items-center gap-3">
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <div>
              <p className="text-sm font-medium text-foreground">Google</p>
              {googleIdentity ? (
                <p className="text-xs text-muted-foreground">{(googleIdentity as any).identity_data?.email || "Tilknyttet"}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Ikke tilknyttet</p>
              )}
            </div>
          </div>
          {googleIdentity ? (
            <span className="text-xs text-primary bg-primary/10 px-2 py-1 rounded">Aktiv</span>
          ) : (
            <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">Inaktiv</span>
          )}
        </div>
      </div>

      {!googleIdentity && (
        <p className="text-xs text-muted-foreground mt-3">
          Log ind med Google på login-siden for at tilknytte din Google-konto.
        </p>
      )}
    </div>
  );
};

// Pending invitations widget for Settings page
const PendingInvitationsSection = ({ companyId, companyName }: { companyId: string | null; companyName: string | null }) => {
  const [pendingInvs, setPendingInvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    const fetch = async () => {
      const { data } = await supabase
        .from("company_invitations")
        .select("id, email, status, created_at, token")
        .eq("company_id", companyId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      setPendingInvs(data || []);
      setLoading(false);
    };
    fetch();
  }, [companyId]);

  const handleResend = async (inv: any) => {
    setResending(inv.id);
    try {
      const tokenParam = inv.token ? `&invite=${inv.token}` : "";
      await supabase.functions.invoke("send-invitation-email", {
        body: {
          email: inv.email,
          company_name: companyName || "Din virksomhed",
          signup_url: `https://topix.lovable.app/auth?mode=signup${tokenParam}`,
        },
      });
      toast.success(`Invitation gensendt til ${inv.email}`);
    } catch (err: any) {
      toast.error("Kunne ikke gensende: " + (err.message || "Ukendt fejl"));
    } finally {
      setResending(null);
    }
  };

  if (!companyId) return null;

  return (
    <div className="glass-card rounded-xl overflow-hidden animate-fade-in">
      <div className="px-6 py-4 flex items-center gap-2 border-b border-border">
        <Send className="h-4 w-4 text-chart-warning" />
        <span className="font-display font-semibold text-foreground">Afventende invitationer</span>
        <span className="ml-1 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-chart-warning/15 text-chart-warning text-xs font-bold">
          {pendingInvs.length}
        </span>
      </div>
      {loading ? (
        <div className="px-6 py-4 flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Indlæser...
        </div>
      ) : pendingInvs.length > 0 ? (
        <div className="divide-y divide-border">
          {pendingInvs.map((inv) => (
            <div key={inv.id} className="px-6 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">Sendt {format(new Date(inv.created_at), "d. MMM yyyy", { locale: da })}</p>
                </div>
              </div>
              <button
                onClick={() => handleResend(inv)}
                disabled={resending === inv.id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-medium hover:bg-secondary/80 transition-colors border border-border disabled:opacity-50 shrink-0"
              >
                {resending === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                Gensend
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-6 py-6 text-center">
          <p className="text-sm text-muted-foreground">Ingen afventende invitationer</p>
        </div>
      )}
    </div>
  );
};

export default Settings;
