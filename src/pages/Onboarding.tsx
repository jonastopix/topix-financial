import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Rocket, FileText, ClipboardList, LayoutDashboard, TrendingUp, Target, Users } from "lucide-react";
import { toast } from "sonner";

const ONBOARDING_INDUSTRIES = [
  { label: "Detailhandel", value: "retail_other" },
  { label: "Engroshandel og import/eksport", value: "wholesale_general" },
  { label: "Produktion og fremstilling", value: "production_industrial" },
  { label: "Bygge og anlæg", value: "construction_contractor" },
  { label: "Transport og logistik", value: "transport_freight" },
  { label: "IT og teknologi", value: "tech_software" },
  { label: "Rådgivning og konsulentydelser", value: "consulting_management" },
  { label: "Sundhed og velvære", value: "health_clinic" },
  { label: "Fødevarer og restauration", value: "food_restaurant" },
  { label: "Håndværk og serviceerhverv", value: "trades_other" },
  { label: "Ejendom og bolig", value: "realestate_agency" },
  { label: "Medier, kultur og kreative erhverv", value: "creative_advertising" },
  { label: "Uddannelse og undervisning", value: "education_general" },
  { label: "Finans og forsikring", value: "finance_general" },
  { label: "Andet", value: "other_general" },
];

const Onboarding = () => {
  const { user, profile, companyName, setOnboardingComplete, companyId } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [industryCode, setIndustryCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || undefined,
        onboarded_at: new Date().toISOString(),
      } as any)
      .eq("user_id", user.id);

    if (error) {
      toast.error("Noget gik galt. Prøv igen.");
      setSaving(false);
      return;
    }

    setSaving(false);
    // Send welcome message right after onboarded_at is persisted (fire and forget)
    if (companyId) {
      supabase.functions.invoke("send-welcome-message", {
        body: { companyId, memberName: fullName.trim() },
      }).catch((err) => console.error("[Onboarding] Welcome message failed:", err));
    }
    setStep(2);
  };

  const valueCards = [
    {
      icon: TrendingUp,
      title: "AI der forstår dine tal",
      description: "Upload en rapport og få øjeblikkelig analyse baseret på dine faktiske nøgletal.",
    },
    {
      icon: Target,
      title: "Accountability der virker",
      description: "Sæt milestones, følg din fremgang, og få løbende sparring fra dine rådgivere.",
    },
    {
      icon: Users,
      title: "Du er ikke alene",
      description: "Dine rådgivere læser dine tal og er klar til at sparre.",
    },
  ];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto bg-primary/10 rounded-full p-3 w-fit">
            <Rocket className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-brand">Velkommen til The Boardroom!</CardTitle>
          <CardDescription>
            {step === 1
              ? (companyName
                  ? `Du er blevet tilknyttet ${companyName}. Bekræft dine oplysninger for at komme i gang.`
                  : "Bekræft dine oplysninger for at komme i gang.")
              : "Her er hvad du kan forvente"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 1 ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="fullName">Dit fulde navn</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Indtast dit navn"
                  required
                />
              </div>

              <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-2.5">
                <p className="text-xs font-medium text-muted-foreground">Hvad sker der nu?</p>
                {[
                  { icon: FileText, text: "Upload din første rapport" },
                  { icon: ClipboardList, text: "Udfyld dine første handouts" },
                  { icon: LayoutDashboard, text: "Få overblik på dashboardet" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-2.5">
                    <Icon className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                    <span className="text-sm text-muted-foreground">{text}</span>
                  </div>
                ))}
              </div>

              <Button type="submit" className="w-full" disabled={saving || !fullName.trim()}>
                {saving ? "Gemmer..." : "Fortsæt"}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              {valueCards.map(({ icon: Icon, title, description }) => (
                <div key={title} className="rounded-lg border border-border p-4 space-y-1">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary shrink-0" />
                    <span className="font-semibold text-sm text-foreground">{title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground pl-7">{description}</p>
                </div>
              ))}

              <div className="space-y-2 pt-2">
                <Button
                  className="w-full"
                  onClick={() => {
                    setOnboardingComplete(); navigate("/reports", { replace: true });
                  }}
                >
                  Upload min første rapport
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Eksporter din saldobalance fra e-conomic, Dinero eller Billy som PDF
                </p>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setOnboardingComplete(); navigate("/", { replace: true });
                  }}
                >
                  Se dashboardet først
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Onboarding;
