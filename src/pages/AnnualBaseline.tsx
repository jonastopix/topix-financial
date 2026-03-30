import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { TrendingUp, ChevronRight, ChevronLeft, CheckCircle2, Info, Loader2 } from "lucide-react";

const FIELDS = [
  {
    key: "revenue",
    label: "Omsætning",
    hint: "Den samlede omsætning for hele året — typisk øverst i resultatopgørelsen",
    placeholder: "f.eks. 3.200.000",
    required: true,
  },
  {
    key: "gross_profit",
    label: "Dækningsbidrag / Bruttofortjeneste",
    hint: "Omsætning minus direkte vareomkostninger — findes i resultatopgørelsen",
    placeholder: "f.eks. 1.800.000",
    required: false,
  },
  {
    key: "payroll",
    label: "Lønninger (samlet)",
    hint: "Samlede lønomkostninger inkl. pension og ATP for hele året",
    placeholder: "f.eks. 900.000",
    required: false,
  },
  {
    key: "ebt",
    label: "Resultat før skat",
    hint: "Årets resultat inden skat — kan være negativt",
    placeholder: "f.eks. 240.000",
    required: true,
  },
  {
    key: "cash",
    label: "Bank / Likvide midler",
    hint: "Bankbeholdning pr. 31. december — findes i balancen",
    placeholder: "f.eks. 450.000",
    required: false,
  },
] as const;

type FieldKey = typeof FIELDS[number]["key"];

const AnnualBaseline = () => {
  const { user, companyId } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [values, setValues] = useState<Record<FieldKey, string>>({
    revenue: "",
    gross_profit: "",
    payroll: "",
    ebt: "",
    cash: "",
  });
  const [saving, setSaving] = useState(false);

  const canContinue = values.revenue.trim() !== "" && values.ebt.trim() !== "";

  const formatNum = (v: string) =>
    v ? Number(v).toLocaleString("da-DK") + " kr." : "—";

  const rev = Number(values.revenue) || 0;
  const gp = Number(values.gross_profit) || 0;
  const ebt = Number(values.ebt) || 0;
  const dbMargin = rev > 0 && gp ? ((gp / rev) * 100).toFixed(1) : null;
  const profitMargin = rev > 0 ? ((ebt / rev) * 100).toFixed(1) : null;

  const handleSave = async () => {
    if (!companyId || !user) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("save-annual-baseline", {
        body: {
          year,
          company_id: companyId,
          revenue: values.revenue || null,
          gross_profit: values.gross_profit || null,
          payroll: values.payroll || null,
          ebt: values.ebt || null,
          cash: values.cash || null,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      queryClient.invalidateQueries({ queryKey: ["company-facts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });

      toast.success("Baseline gemt!", {
        description: `${year}-tallene er nu fordelt på 12 måneder i dit dashboard.`,
      });
      navigate("/kpis");
    } catch (err: any) {
      toast.error("Kunne ikke gemme baseline", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold text-foreground">Sæt din baseline</h1>
            <p className="text-sm text-muted-foreground">Årstal fra dit seneste regnskab</p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 my-6">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                s <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Step 1: Year selection */}
        {step === 1 && (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Indtast 5 nøgletal fra dit seneste årsregnskab. Vi fordeler dem på 12 måneder
              så du med det samme får meningsfyldte grafer og trends.
            </p>

            <div>
              <Label className="text-sm font-medium text-foreground">Regnskabsår</Label>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full mt-1.5 px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {[0, 1, 2, 3].map((offset) => {
                  const y = String(new Date().getFullYear() - 1 - offset);
                  return <option key={y} value={y}>{y}</option>;
                })}
              </select>
              <p className="text-xs text-muted-foreground mt-1.5">Vælg det år du har årsregnskab for</p>
            </div>

            <Button onClick={() => setStep(2)} className="w-full">
              Fortsæt <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Step 2: Enter figures */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" /> Tilbage
              </button>
              <span className="text-xs text-muted-foreground font-medium">Regnskabsår {year}</span>
            </div>

            {FIELDS.map((field) => (
              <div key={field.key}>
                <Label className="text-sm font-medium text-foreground">
                  {field.label}
                  {field.required && <span className="text-destructive ml-0.5">*</span>}
                </Label>
                <div className="relative mt-1.5">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={values[field.key]}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        [field.key]: e.target.value.replace(/[^\d.-]/g, ""),
                      }))
                    }
                    placeholder={field.placeholder}
                    className="pr-12"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    kr.
                  </span>
                </div>
                <p className="flex items-start gap-1 text-xs text-muted-foreground mt-1">
                  <Info className="h-3 w-3 mt-0.5 shrink-0" />
                  {field.hint}
                </p>
              </div>
            ))}

            <Button onClick={() => setStep(3)} disabled={!canContinue} className="w-full">
              Se opsummering <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Step 3: Summary & save */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" /> Tilbage
              </button>
              <span className="text-xs text-muted-foreground font-medium">Regnskabsår {year}</span>
            </div>

            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-foreground mb-3">Opsummering — {year}</h3>
              {FIELDS.filter((f) => values[f.key]).map((field) => (
                <div key={field.key} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{field.label}</span>
                  <span className="font-medium text-foreground">{formatNum(values[field.key])}</span>
                </div>
              ))}
              {(dbMargin || profitMargin) && (
                <div className="border-t border-border pt-3 mt-3 space-y-2">
                  {dbMargin && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">DB-margin</span>
                      <span className="font-medium text-foreground">{dbMargin}%</span>
                    </div>
                  )}
                  {profitMargin && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Overskudsgrad</span>
                      <span className="font-medium text-foreground">{profitMargin}%</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Tallene fordeles jævnt på 12 måneder og erstatter evt. eksisterende baseline for {year}.
            </p>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Gemmer…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Gem baseline
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default AnnualBaseline;
