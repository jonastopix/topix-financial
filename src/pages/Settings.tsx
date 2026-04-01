import { useState, useEffect, useRef, useMemo } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { blockIfDemo } from "@/lib/demoGuard";
import { supabase } from "@/integrations/supabase/client";
import { Settings as SettingsIcon, User, Building2, Save, Loader2, Globe, Phone, Hash, Upload, ImageIcon, Briefcase, Trash2, Send, Mail, Clock, Lock, Link2, AlertTriangle, LogOut, Sparkles } from "lucide-react";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import PasswordStrengthIndicator, { getPasswordScore } from "@/components/PasswordStrengthIndicator";
import { toast } from "sonner";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import CompanyInvitations from "@/components/CompanyInvitations";

const INDUSTRY_OPTIONS: { label: string; value: string; sub: { label: string; value: string }[] }[] = [
  { label: "Detailhandel", value: "retail", sub: [
    { label: "Dagligvarer og fødevarer", value: "retail_grocery" },
    { label: "Tøj og accessories", value: "retail_fashion" },
    { label: "Møbler og interiør", value: "retail_furniture" },
    { label: "Elektronik og IT-udstyr", value: "retail_electronics" },
    { label: "Sport og fritid", value: "retail_sport" },
    { label: "Biler og køretøjer", value: "retail_automotive" },
    { label: "Anden detailhandel", value: "retail_other" },
  ]},
  { label: "Engroshandel og import/eksport", value: "wholesale", sub: [
    { label: "Engroshandel og import/eksport", value: "wholesale_general" },
  ]},
  { label: "Produktion og fremstilling", value: "production", sub: [
    { label: "Fødevareproduktion", value: "production_food" },
    { label: "Industriel produktion", value: "production_industrial" },
    { label: "Håndværksproduktion", value: "production_craft" },
  ]},
  { label: "Bygge og anlæg", value: "construction", sub: [
    { label: "Entreprenør og anlæg", value: "construction_contractor" },
    { label: "Håndværk og installation", value: "construction_craft" },
    { label: "Arkitektur og rådgivning", value: "construction_consulting" },
  ]},
  { label: "Transport og logistik", value: "transport", sub: [
    { label: "Varetransport og spedition", value: "transport_freight" },
    { label: "Personbefordring", value: "transport_passenger" },
    { label: "Eventlogistik og specialtransport", value: "transport_event" },
  ]},
  { label: "Rejse og turisme", value: "travel", sub: [
    { label: "Rejsebureau og turoperatør", value: "travel_tour" },
    { label: "Eventrejser og specialture", value: "travel_event" },
  ]},
  { label: "IT og teknologi", value: "tech", sub: [
    { label: "Softwareudvikling", value: "tech_software" },
    { label: "IT-drift og support", value: "tech_support" },
    { label: "Tech-startup", value: "tech_startup" },
  ]},
  { label: "Rådgivning og konsulentydelser", value: "consulting", sub: [
    { label: "Økonomi og regnskab", value: "consulting_finance" },
    { label: "Juridisk rådgivning", value: "consulting_legal" },
    { label: "Management og strategi", value: "consulting_management" },
    { label: "HR og rekruttering", value: "consulting_hr" },
    { label: "Marketing og kommunikation", value: "consulting_marketing" },
  ]},
  { label: "Sundhed og velvære", value: "health", sub: [
    { label: "Klinik og behandling", value: "health_clinic" },
    { label: "Træning og fitness", value: "health_fitness" },
    { label: "Apotek og helse", value: "health_pharmacy" },
    { label: "Optiker og synspleje", value: "health_optician" },
  ]},
  { label: "Fødevarer og restauration", value: "food", sub: [
    { label: "Restaurant og café", value: "food_restaurant" },
    { label: "Catering og events", value: "food_catering" },
    { label: "Takeaway og levering", value: "food_takeaway" },
  ]},
  { label: "Håndværk og serviceerhverv", value: "trades", sub: [
    { label: "El, VVS og ventilation", value: "trades_electrical" },
    { label: "Maler og gulv", value: "trades_painter" },
    { label: "Rengøring og facility", value: "trades_cleaning" },
    { label: "Anden håndværksservice", value: "trades_other" },
  ]},
  { label: "Ejendom og bolig", value: "realestate", sub: [
    { label: "Ejendomsmægling", value: "realestate_agency" },
    { label: "Udlejning og administration", value: "realestate_rental" },
    { label: "Ejendomsudvikling", value: "realestate_development" },
  ]},
  { label: "Medier, kultur og kreative erhverv", value: "creative", sub: [
    { label: "Reklame og design", value: "creative_advertising" },
    { label: "Foto og video", value: "creative_photo" },
    { label: "Musik og underholdning", value: "creative_music" },
  ]},
  { label: "Uddannelse og undervisning", value: "education", sub: [
    { label: "Uddannelse og undervisning", value: "education_general" },
  ]},
  { label: "Landbrug, gartneri og natur", value: "agriculture", sub: [
    { label: "Landbrug, gartneri og natur", value: "agriculture_general" },
  ]},
  { label: "Finans og forsikring", value: "finance", sub: [
    { label: "Finans og forsikring", value: "finance_general" },
  ]},
  { label: "Andet", value: "other", sub: [
    { label: "Andet", value: "other_general" },
  ]},
];

function findMainCategoryBySubValue(subValue: string): string {
  for (const cat of INDUSTRY_OPTIONS) {
    if (cat.sub.some(s => s.value === subValue)) return cat.value;
  }
  return "";
}
interface CompanyData {
  id: string;
  name: string;
  cvr_number: string | null;
  contact_email: string | null;
  website: string | null;
  contact_phone: string | null;
  logo_url: string | null;
  industry: string | null;
  industry_code: string | null;
  industry_label: string | null;
}

const CircleProfileSection = ({ userId }: { userId?: string }) => {
  const [circleEmail, setCircleEmail] = useState("");
  const [linking, setLinking] = useState(false);
  const [linkedProfile, setLinkedProfile] = useState<{ id: string; name: string; email: string } | null>(null);
  const [loadingLinked, setLoadingLinked] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const check = async () => {
      const { data } = await supabase
        .from("circle_members")
        .select("id, name, email")
        .eq("user_id", userId)
        .maybeSingle();
      if (data) setLinkedProfile({ id: data.id, name: data.name, email: data.email });
      setLoadingLinked(false);
    };
    check();
  }, [userId]);

  const handleLink = async () => {
    if (!userId || !circleEmail.trim()) return;
    setLinking(true);
    const { data, error } = await supabase
      .from("circle_members")
      .select("id, name, email")
      .ilike("email", circleEmail.trim())
      .maybeSingle();

    if (error || !data) {
      toast.error("Ingen Circle-profil fundet med den email");
      setLinking(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("circle_members")
      .update({ user_id: userId })
      .eq("id", data.id);

    if (updateError) {
      toast.error("Kunne ikke tilknytte profil");
    } else {
      setLinkedProfile({ id: data.id, name: data.name, email: data.email });
      setCircleEmail("");
      toast.success("Circle-profil tilknyttet");
    }
    setLinking(false);
  };

  const handleUnlink = async () => {
    if (!userId) return;
    setLinking(true);
    const { error } = await supabase
      .from("circle_members")
      .update({ user_id: null })
      .eq("user_id", userId);

    if (error) {
      toast.error("Kunne ikke fjerne tilknytning");
    } else {
      setLinkedProfile(null);
      toast.success("Tilknytning fjernet");
    }
    setLinking(false);
  };

  if (loadingLinked) return null;

  return (
    <div className="glass-card rounded-xl p-6 animate-fade-in">
      <h2 className="font-display font-semibold text-foreground mb-1 flex items-center gap-2">
        <Link2 className="h-4 w-4 text-primary" />
        Tilknyt Circle-profil
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Hvis du bruger en anden email på app.topix.dk end her på platformen, kan du tilknytte din Circle-profil her.
      </p>

      {linkedProfile ? (
        <div className="space-y-2">
          <p className="text-sm text-green-600 dark:text-green-400">
            ✓ Tilknyttet som {linkedProfile.name} ({linkedProfile.email})
          </p>
          <button
            onClick={handleUnlink}
            disabled={linking}
            className="text-sm text-muted-foreground hover:text-destructive underline transition-colors disabled:opacity-50"
          >
            Fjern tilknytning
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              Din email på app.topix.dk
            </label>
            <input
              value={circleEmail}
              onChange={(e) => setCircleEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="din@email.dk"
            />
          </div>
          <button
            onClick={handleLink}
            disabled={linking || !circleEmail.trim()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Tilknyt profil
          </button>
        </div>
      )}
    </div>
  );
};

const Settings = () => {
  const { user, profile, isAdvisor, isAdmin, refreshProfile, isDemoMode } = useAuth();
  const navigate = useNavigate();
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [leaveConfirmName, setLeaveConfirmName] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [emailPrefs, setEmailPrefs] = useState({
    action_required: true,
    important: true,
    report_reminders: true,
    monthly_digest: true,
  });
  const [savingPrefs, setSavingPrefs] = useState(false);
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
    industry_code: "",
    industry_label: "",
  });
  const [selectedMainCategory, setSelectedMainCategory] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);
  const [weeklyFocusEnabled, setWeeklyFocusEnabled] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setCompanyName(profile.company_name || "");
      setAvatarUrl(profile.avatar_url || null);
      const prefs = (profile as any)?.notification_email_prefs;
      if (prefs) {
        setEmailPrefs({
          action_required: prefs.action_required !== false,
          important: prefs.important !== false,
          report_reminders: prefs.report_reminders !== false,
          monthly_digest: prefs.monthly_digest !== false,
        });
      }
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
        .select("id, name, cvr_number, contact_email, website, contact_phone, logo_url, industry, industry_code, industry_label, weekly_focus_enabled")
        .eq("id", cm.company_id)
        .single();

      if (data) {
        const companyData = data as CompanyData;
        setCompany(companyData);
        setCompanyForm({
          name: data.name || "",
          cvr_number: data.cvr_number || "",
          contact_email: data.contact_email || "",
          website: data.website || "",
          contact_phone: data.contact_phone || "",
          industry_code: (data as any).industry_code || "",
          industry_label: (data as any).industry_label || "",
        });
        setLogoUrl(data.logo_url || null);
        setWeeklyFocusEnabled((data as any).weekly_focus_enabled ?? false);
        // Derive main category from stored industry_code
        const mainCat = findMainCategoryBySubValue((data as any).industry_code || "");
        setSelectedMainCategory(mainCat);
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

    const cleanUrl = urlData.publicUrl;
    const bustUrl = `${cleanUrl}?t=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("companies")
      .update({ logo_url: cleanUrl })
      .eq("id", company.id);

    if (updateError) {
      toast.error("Kunne ikke gemme logo-URL");
    } else {
      setLogoUrl(bustUrl);
      toast.success("Logo uploadet");
    }
    setUploadingLogo(false);
    // Reset file input so re-selecting the same file triggers onChange
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveLogo = async () => {
    if (!company) return;
    setUploadingLogo(true);
    const filePath = `${company.id}/logo`;
    await supabase.storage.from("company-logos").remove([filePath]);
    const { error } = await supabase
      .from("companies")
      .update({ logo_url: null })
      .eq("id", company.id);
    if (error) {
      toast.error("Kunne ikke fjerne logo");
    } else {
      setLogoUrl(null);
      toast.success("Logo fjernet");
    }
    setUploadingLogo(false);
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

    const cleanUrl = urlData.publicUrl;
    const bustUrl = `${cleanUrl}?t=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: cleanUrl })
      .eq("user_id", user.id);

    if (updateError) {
      toast.error("Kunne ikke gemme billede-URL");
    } else {
      setAvatarUrl(bustUrl);
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
    if (blockIfDemo(isDemoMode, "Ændring af indstillinger")) return;
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim(), company_name: companyName.trim() })
      .eq("user_id", user.id);

    if (error) {
      toast.error("Kunne ikke gemme ændringer");
    } else {
      await refreshProfile();
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
      toast.error(signInError.message.includes("Invalid") ? "Nuværende adgangskode er forkert" : "Kunne ikke verificere adgangskode — prøv igen");
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

  const handleLeaveCompany = async () => {
    if (!user || !company) return;
    setLeaving(true);
    try {
      const { error } = await supabase
        .from("company_members")
        .delete()
        .eq("user_id", user.id)
        .eq("company_id", company.id);
      if (error) throw error;
      toast.success(`Du har forladt ${company.name}`);
      setLeaveDialogOpen(false);
      navigate("/auth", { replace: true });
    } catch (err: any) {
      toast.error("Noget gik galt. Prøv igen.");
    } finally {
      setLeaving(false);
    }
  };

  const handleSaveCompany = async () => {
    if (blockIfDemo(isDemoMode, "Ændring af virksomhedsindstillinger")) return;
    if (!company) return;

    // Validate inputs
    const name = companyForm.name.trim();
    const cvr = companyForm.cvr_number.trim();
    const email = companyForm.contact_email.trim();
    const website = companyForm.website.trim();
    const phone = companyForm.contact_phone.trim();
    const industryCode = companyForm.industry_code.trim();
    const industryLabel = companyForm.industry_label.trim();

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

    setSavingCompany(true);

    const { error } = await supabase
      .from("companies")
      .update({
        name,
        cvr_number: cvr || null,
        contact_email: email || null,
        website: website || null,
        contact_phone: phone || null,
        industry_code: industryCode || null,
        industry_label: industryLabel || null,
      })
      .eq("id", company.id);

    if (error) {
      toast.error("Kunne ikke gemme virksomhedsdata");
    } else {
      toast.success("Virksomhed opdateret");

      // Auto-sync KPI benchmarks from industry_benchmarks only when industry actually changes
      const industryChanged = industryCode !== (company.industry_code || "");
      if (industryCode && industryChanged) {
        const KPI_KEY_MAP: Record<string, string> = {
          gross_margin_pct: "db_margin",
          ebitda_margin_pct: "ebitda_margin",
        };

        const { data: industryBenchmarks } = await supabase
          .from("industry_benchmarks")
          .select("kpi_key, benchmark_value, benchmark_label, source_label")
          .eq("industry_code", industryCode);

        if (industryBenchmarks && industryBenchmarks.length > 0) {
          for (const ib of industryBenchmarks) {
            const mappedKey = KPI_KEY_MAP[ib.kpi_key] || ib.kpi_key;
            // Sync benchmarks
            await supabase
              .from("kpi_benchmarks")
              .upsert(
                {
                  company_id: company.id,
                  user_id: user!.id,
                  kpi_key: mappedKey,
                  benchmark_value: ib.benchmark_value,
                  benchmark_label: ib.benchmark_label,
                  source_label: ib.source_label,
                } as any,
                { onConflict: "company_id,kpi_key" } as any
              );
            // Sync targets (use benchmark_value as default target)
            await supabase
              .from("kpi_targets")
              .upsert(
                {
                  company_id: company.id,
                  user_id: user!.id,
                  kpi_key: mappedKey,
                  target_value: ib.benchmark_value,
                  target_label: ib.benchmark_label,
                  lower_is_better: false,
                } as any,
                { onConflict: "company_id,kpi_key" } as any
              );
          }
          toast.info("KPI-mål opdateret fra branchestandard");
        }
      }
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

  const [activeTab, setActiveTab] = useState<"virksomhed" | "profil" | "notifikationer">("virksomhed");

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-foreground tracking-tight flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-primary" />
          Indstillinger
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Administrér din konto og profil
        </p>
      </div>

      <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
        {([
          { key: "virksomhed", label: "Virksomhed" },
          { key: "profil", label: "Profil & adgangskode" },
          { key: "notifikationer", label: "Notifikationer" },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap shrink-0 ${
              activeTab === tab.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="max-w-xl space-y-6">
        {/* ── Tab 1: Virksomhed ── */}
        {activeTab === "virksomhed" && (
          <>
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
                      {logoUrl && (
                        <button
                          onClick={handleRemoveLogo}
                          disabled={uploadingLogo}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          Fjern
                        </button>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">PNG, JPG – max 2 MB</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                      Virksomhedsnavn
                    </label>
                    <input
                      value={companyForm.name}
                      onChange={(e) => setCompanyForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                        <Hash className="inline h-3 w-3 mr-1" />CVR
                      </label>
                      <input
                        value={companyForm.cvr_number}
                        onChange={(e) => setCompanyForm(f => ({ ...f, cvr_number: e.target.value }))}
                        className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                        placeholder="12345678"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                        <Globe className="inline h-3 w-3 mr-1" />Hjemmeside
                      </label>
                      <input
                        value={companyForm.website}
                        onChange={(e) => setCompanyForm(f => ({ ...f, website: e.target.value }))}
                        className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                      <Phone className="inline h-3 w-3 mr-1" />Telefon
                    </label>
                    <input
                      value={companyForm.contact_phone}
                      onChange={(e) => setCompanyForm(f => ({ ...f, contact_phone: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                      <Mail className="inline h-3 w-3 mr-1" />Kontakt-email
                    </label>
                    <input
                      value={companyForm.contact_email}
                      onChange={(e) => setCompanyForm(f => ({ ...f, contact_email: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                      <Briefcase className="inline h-3 w-3 mr-1" />Branche
                    </label>
                    {(() => {
                      const allSubs = INDUSTRY_OPTIONS.flatMap(g => g.sub);
                      return (
                        <Select value={companyForm.industry_code} onValueChange={(v) => {
                          const found = allSubs.find(s => s.value === v);
                          setCompanyForm(f => ({ ...f, industry_code: v, industry_label: found?.label || "" }));
                        }}>
                          <SelectTrigger className="w-full bg-secondary border-border text-sm">
                            <SelectValue placeholder="Vælg branche" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            {INDUSTRY_OPTIONS.map(group => (
                              <div key={group.value}>
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                  {group.label}
                                </div>
                                {group.sub.map(sub => (
                                  <SelectItem key={sub.value} value={sub.value} className="pl-4">
                                    {sub.label}
                                  </SelectItem>
                                ))}
                              </div>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    })()}
                  </div>
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

            {/* Ugens Fokus toggle — member only */}
            {!isAdvisor && !isAdmin && company && (
              <div className="glass-card rounded-xl p-6 animate-fade-in">
                <h2 className="font-display font-semibold text-foreground mb-1 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Ugens Fokus
                </h2>
                <p className="text-xs text-muted-foreground mb-4">
                  Få en ugentlig AI-analyse med konkrete handlinger baseret på dine rapporter, milestones og handouts.
                </p>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Aktivér Ugens Fokus</p>
                    <p className="text-xs text-muted-foreground">
                      Analysen kører hver mandag morgen og kræver mindst én uploadet rapport.
                    </p>
                  </div>
                  <Switch
                    checked={weeklyFocusEnabled}
                    onCheckedChange={async (next) => {
                      setWeeklyFocusEnabled(next);
                      const { error } = await supabase
                        .from("companies")
                        .update({ weekly_focus_enabled: next } as any)
                        .eq("id", company.id);
                      if (error) {
                        setWeeklyFocusEnabled(!next);
                        toast.error("Kunne ikke ændre indstillingen");
                        return;
                      }
                      toast.success(next ? "Ugens Fokus aktiveret" : "Ugens Fokus deaktiveret");
                    }}
                  />
                </div>
              </div>
            )}

            {/* Konto */}
            <div className="glass-card rounded-xl p-6 animate-fade-in">
              <h2 className="font-display font-semibold text-foreground mb-3">Konto</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Logget ind som <span className="font-medium text-foreground">{user?.email}</span>
              </p>
              <button
                onClick={async () => { await supabase.auth.signOut(); navigate("/auth?force=true", { replace: true }); }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-secondary transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Log ud
              </button>
            </div>

            {/* Danger zone — members only */}
            {!isAdvisor && !isAdmin && company && (
              <div className="glass-card rounded-xl overflow-hidden animate-fade-in border border-destructive/20">
                <div className="px-6 py-4 flex items-center gap-2 border-b border-destructive/20 bg-destructive/5">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="font-display font-semibold text-destructive">
                    Farlig zone
                  </span>
                </div>
                <div className="p-6">
                  <p className="text-sm font-medium text-foreground mb-1">Forlad virksomhed</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Du mister adgang til alle data og rapporter. 
                    Denne handling kan ikke fortrydes.
                  </p>
                  <button
                    onClick={() => { setLeaveConfirmName(""); setLeaveDialogOpen(true); }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-destructive/40 text-destructive text-sm font-medium hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Forlad {company.name}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Tab 2: Profil & adgangskode ── */}
        {activeTab === "profil" && (
          <>
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
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
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
                    Fuldt navn
                  </label>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
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

            {/* Circle profile section */}
            <CircleProfileSection userId={user?.id} />

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
          </>
        )}

        {/* ── Tab 3: Notifikationer ── */}
        {activeTab === "notifikationer" && (
          <>
            {!isAdvisor && !isAdmin && (
              <div className="glass-card rounded-xl p-6 animate-fade-in">
                <h2 className="font-display font-semibold text-foreground mb-1">
                  Email-notifikationer
                </h2>
                <p className="text-xs text-muted-foreground mb-4">
                  Vælg hvilke emails du vil modtage. App-notifikationer påvirkes ikke.
                </p>
                <div className="space-y-3">
                  {[
                    { key: "action_required", label: "Vigtige handlinger", desc: "Rapport klar til gennemgang, manuel indtastning påkrævet" },
                    { key: "important", label: "Opdateringer", desc: "Svar fra rådgiver, rapport behandlet, ny AI-analyse klar" },
                    { key: "report_reminders", label: "Rapport-påmindelser", desc: "Automatisk reminder hvis du ikke har uploadet inden dag 7, 15 og 20 i måneden" },
                    { key: "monthly_digest", label: "Månedlig digest", desc: "Personligt overblik den 5. i måneden med dine KPI-tal, milestones og beskeder" },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                      <Switch
                        checked={emailPrefs[key as keyof typeof emailPrefs]}
                        onCheckedChange={(checked) => setEmailPrefs(prev => ({ ...prev, [key]: checked }))}
                        className="mt-0.5"
                      />
                    </div>
                  ))}
                </div>
                <button
                  onClick={async () => {
                    if (!user) return;
                    setSavingPrefs(true);
                    await supabase
                      .from("profiles")
                      .update({ notification_email_prefs: emailPrefs } as any)
                      .eq("user_id", user.id);
                    setSavingPrefs(false);
                    toast.success("Notifikationsindstillinger gemt");
                  }}
                  disabled={savingPrefs}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg 
                    bg-primary text-primary-foreground text-sm font-medium 
                    hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {savingPrefs ? "Gemmer..." : "Gem indstillinger"}
                </button>
              </div>
            )}

            {(isAdvisor || isAdmin) && (
              <div className="glass-card rounded-xl p-6 animate-fade-in">
                <h2 className="font-display font-semibold text-foreground mb-1">
                  Notifikationer
                </h2>
                <p className="text-xs text-muted-foreground mb-4">
                  Du modtager Slack-notifikationer for al member-aktivitet. 
                  Email-notifikationer er deaktiveret for advisors.
                </p>
                <div className="rounded-lg bg-muted/30 border border-border/50 p-3">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">In-app notifikationer</span>
                    {" "}— Direkte beskeder fra members vises som vigtige. 
                    Rapporter, pulse og handouts vises som aktivitet uden badge.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Leave company confirmation dialog */}
      <AlertDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Er du sikker?</AlertDialogTitle>
            <AlertDialogDescription>
              Du er ved at forlade {company?.name}. Du mister adgang til alle 
              rapporter, milestones og chat. Skriv virksomhedens navn for at bekræfte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            value={leaveConfirmName}
            onChange={(e) => setLeaveConfirmName(e.target.value)}
            placeholder={company?.name || ""}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-destructive/30 mt-2"
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setLeaveConfirmName("")}>
              Annuller
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLeaveCompany}
              disabled={leaving || leaveConfirmName !== company?.name}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {leaving ? "Forlader..." : "Forlad virksomhed"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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


export default Settings;
