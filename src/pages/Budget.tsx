import { useState, useEffect, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import AdvisorCompanyPrompt from "@/components/AdvisorCompanyPrompt";
import { supabase } from "@/integrations/supabase/client";
import { Calculator, ArrowLeft, BarChart3, Layers, DollarSign, Upload, TrendingUp, Droplets } from "lucide-react";
import { useNavigationReset } from "@/hooks/useNavigationReset";
import BudgetImport from "@/components/BudgetImport";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  BUDGET_TEMPLATES, GROUP_ORDER,
  type BudgetTemplate, type BudgetCategory,
} from "@/lib/budgetTemplates";

import { catToRow, type BudgetRow, type ScenarioKey } from "@/components/budget/types";
import BudgetTemplatePicker from "@/components/budget/BudgetTemplatePicker";
import BudgetOverviewTab from "@/components/budget/BudgetOverviewTab";
import BudgetScenariosTab from "@/components/budget/BudgetScenariosTab";
import BudgetVsActualTab from "@/components/budget/BudgetVsActualTab";
import BudgetForecastTab from "@/components/budget/BudgetForecastTab";
import BudgetCashflowTab from "@/components/budget/BudgetCashflowTab";

const Budget = () => {
  const { user, companyId, isAdvisor: rawAdvisor } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [activeScenario, setActiveScenario] = useState<ScenarioKey>("base");
  const [selectedTemplate, setSelectedTemplate] = useState<BudgetTemplate | null>(null);
  const [scenarioData, setScenarioData] = useState<Record<ScenarioKey, BudgetRow[]> | null>(null);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [labelOverrides, setLabelOverrides] = useState<Record<string, string>>({});
  const [changingTemplate, setChangingTemplate] = useState(false);
  const [showImportDirect, setShowImportDirect] = useState(false);
  const [confirmTemplateChange, setConfirmTemplateChange] = useState(false);

  // Navigation reset
  const resetKey = useNavigationReset();
  useEffect(() => {
    if (resetKey) {
      setChangingTemplate(false);
    }
  }, [resetKey]);

  // Load from DB
  useEffect(() => {
    if (!user || !companyId) return;

    const loadBudget = async () => {
      // Reset before loading new year
      setSelectedTemplate(null);
      setScenarioData(null);
      setLabelOverrides({});
      setDbLoaded(false);

      const res = await (supabase
        .from("budget_targets")
        .select("category, budget_amount, period") as any)
        .eq("company_id", companyId);
      const data = (res.data || []) as { category: string; budget_amount: number; period: string }[];

      if (!data || data.length === 0) {
        setDbLoaded(true);
        return;
      }

      // Detect template
      const templateMarker = data.find(d => d.category === "__template__");
      let template: BudgetTemplate | undefined;

      if (templateMarker) {
        template = BUDGET_TEMPLATES.find(t => t.key === templateMarker.period);
      }

      if (!template) {
        const storedKeys = new Set(data.map(d => d.category).filter(c => c !== "__template__" && !c.startsWith("__label__")));
        let bestMatch = BUDGET_TEMPLATES[0];
        let bestScore = 0;
        for (const tmpl of BUDGET_TEMPLATES) {
          const score = tmpl.categories.filter(c => storedKeys.has(c.key)).length;
          if (score > bestScore) { bestScore = score; bestMatch = tmpl; }
        }
        template = bestMatch;
      }

      setSelectedTemplate(template);

      // Collect all unique category keys
      const allCatKeys = new Set(data.map(d => d.category).filter(c => c !== "__template__" && !c.startsWith("__label__")));

      const templateKeys = new Set(template.categories.map(c => c.key));
      const extraKeys = [...allCatKeys].filter(k => !templateKeys.has(k));

      const groupMarkers = data.filter(d => d.category.startsWith("__group__"));
      const extraGroupMap: Record<string, string> = {};
      groupMarkers.forEach(g => {
        const key = g.category
          .replace(/__group__\d{4}_/, "")
          .replace("__group__", "");
        extraGroupMap[key] = g.period;
      });

      const extraCategories: BudgetCategory[] = extraKeys.map(key => ({
        key,
        label: key.replace(/_/g, " "),
        group: (extraGroupMap[key] || "variable") as BudgetCategory["group"],
      }));

      const allCategories = [...template.categories, ...extraCategories];

      const newData: Record<ScenarioKey, BudgetRow[]> = {
        base: allCategories.map(catToRow),
        optimistisk: allCategories.map(catToRow),
        pessimistisk: allCategories.map(catToRow),
      };

      // Load label overrides
      const labelMarkers = data.filter(d => d.category.startsWith("__label__"));
      const loadedLabels: Record<string, string> = {};
      labelMarkers.forEach(m => {
        const key = m.category
          .replace(/__label__\d{4}_/, "")
          .replace("__label__", "");
        loadedLabels[key] = m.period;
      });
      setLabelOverrides(loadedLabels);

      // Apply labels
      Object.entries(loadedLabels).forEach(([key, label]) => {
        for (const sc of Object.values(newData)) {
          const row = sc.find(r => r.key === key);
          if (row) row.label = label;
        }
      });
      extraCategories.forEach(ec => {
        if (loadedLabels[ec.key]) ec.label = loadedLabels[ec.key];
      });

      // Apply values
      data.forEach(item => {
        if (item.category === "__template__" || item.category.startsWith("__label__") || item.category.startsWith("__group__")) return;
        const parts = item.period.split("-");
        if (parts.length < 3) return;
        const [, scenario, monthIdxStr] = parts;
        const monthIdx = parseInt(monthIdxStr, 10);
        if (isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) return;
        const sc = scenario as ScenarioKey;
        if (!newData[sc]) return;

        const row = newData[sc].find(r => r.key === item.category);
        if (row) {
          row.values[monthIdx] = Number(item.budget_amount);
        }
      });

      setScenarioData(newData);
      setDbLoaded(true);
    };

    loadBudget();
  }, [user, companyId, year]);

  const handleTemplateSelect = async (tmpl: BudgetTemplate) => {
    setSelectedTemplate(tmpl);
    const data: Record<ScenarioKey, BudgetRow[]> = {
      base: tmpl.categories.map(catToRow),
      optimistisk: tmpl.categories.map(catToRow),
      pessimistisk: tmpl.categories.map(catToRow),
    };
    setScenarioData(data);

    if (user && companyId) {
      await supabase.from("budget_targets").insert({
        user_id: user.id,
        company_id: companyId,
        category: "__template__",
        budget_amount: 0,
        period: tmpl.key,
      } as any);
    }

    toast.success(`Skabelon "${tmpl.label}" valgt`);
  };

  const handleImportComplete = useCallback((result: any) => {
    const tmpl = BUDGET_TEMPLATES[0];
    setSelectedTemplate(tmpl);

    const importedRows: BudgetRow[] = (result.categories || []).map((cat: any) => ({
      key: cat.key,
      label: cat.label,
      values: cat.monthly || Array(12).fill(0),
      isEditable: true,
      group: cat.key === "omsaetning" ? "indtaegter" :
             cat.key === "loenninger" ? "personale" :
             cat.key === "marketing" ? "salg_marketing" :
             cat.key === "lokaler" ? "faste" :
             cat.key === "tech_software" ? "drift" :
             cat.key === "admin" ? "faste" :
             "variable",
    }));

    setScenarioData({
      base: importedRows,
      optimistisk: importedRows.map(r => ({ ...r, values: [...r.values] })),
      pessimistisk: importedRows.map(r => ({ ...r, values: [...r.values] })),
    });
    setYear(result.year || "2025");
  }, []);

  // ─── Advisor without company ───
  if (isAdvisor && !companyId) {
    return (
      <AppLayout>
        <AdvisorCompanyPrompt />
      </AppLayout>
    );
  }

  // ─── Template picker (first time) ───
  if (dbLoaded && !selectedTemplate && !scenarioData) {
    return (
      <AppLayout>
        <div className="mb-8">
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight flex items-center gap-2">
            <Calculator className="h-6 w-6 text-primary" />
            Budgettering
          </h1>
           <p className="text-sm text-muted-foreground mt-1">
            Planlæg og følg op på dine finansielle mål
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tallene sammenlignes automatisk med dine uploadede rapporter under "Budget vs. Realiseret".
          </p>
        </div>

        {showImportDirect ? (
          <div className="animate-fade-in">
            <button
              onClick={() => setShowImportDirect(false)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
            >
              <ArrowLeft className="h-4 w-4" />
              Tilbage
            </button>
            <BudgetImport userId={user?.id || ""} companyId={companyId || ""} onImportComplete={(result) => { handleImportComplete(result); setShowImportDirect(false); }} />
          </div>
        ) : !changingTemplate ? (
          <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
              <Calculator className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-xl font-display font-bold text-foreground mb-2">
              Byg dit første budget
            </h2>
            <p className="text-sm text-muted-foreground max-w-sm text-center mb-10">
              Start med en skabelon der passer til din virksomhedstype, eller importér et Excel-ark direkte.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
              <button
                onClick={() => setChangingTemplate(true)}
                className="flex flex-col items-start gap-2 p-5 rounded-xl border-2 border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors text-left"
              >
                <Layers className="h-5 w-5 text-primary" />
                <span className="font-semibold text-foreground text-sm">Vælg en skabelon</span>
                <span className="text-xs text-muted-foreground">
                  Service, handel, produktion og SaaS
                </span>
              </button>
              <button
                onClick={() => setShowImportDirect(true)}
                className="flex flex-col items-start gap-2 p-5 rounded-xl border border-border bg-card hover:bg-accent/50 transition-colors text-left"
              >
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="font-semibold text-foreground text-sm">Importér fra Excel</span>
                <span className="text-xs text-muted-foreground">
                  Upload dit eksisterende budgetark
                </span>
              </button>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-6 max-w-sm mx-auto">
              Et budget hjælper dig med at holde styr på dine mål og se præcist hvor du er over eller under plan hver måned.
            </p>
          </div>
        ) : (
          <BudgetTemplatePicker onSelect={handleTemplateSelect} userId={user?.id || ""} companyId={companyId || ""} onImportComplete={handleImportComplete} />
        )}
      </AppLayout>
    );
  }

  // ─── Changing template ───
  if (changingTemplate) {
    return (
      <AppLayout>
        <div className="mb-8">
          <button
            onClick={() => setChangingTemplate(false)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Tilbage til budget
          </button>
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight flex items-center gap-2">
            <Calculator className="h-6 w-6 text-primary" />
            Skift budgetskabelon
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vælg en ny skabelon — dette nulstiller dit nuværende budget
          </p>
        </div>
        <BudgetTemplatePicker
          onSelect={(tmpl) => {
            setSelectedTemplate(null);
            setScenarioData(null);
            setLabelOverrides({});
            handleTemplateSelect(tmpl);
            setChangingTemplate(false);
          }}
          userId={user?.id || ""}
          companyId={companyId || ""}
          onImportComplete={(result) => {
            handleImportComplete(result);
            setChangingTemplate(false);
          }}
        />
      </AppLayout>
    );
  }

  // ─── Loading ───
  if (!scenarioData) {
    return (
      <AppLayout>
        <div className="mb-8">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex gap-2 mb-6">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-9 w-24 rounded-md" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </AppLayout>
    );
  }

  const rows = scenarioData[activeScenario];


  return (
    <AppLayout>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight flex items-center gap-2">
            <Calculator className="h-6 w-6 text-primary" />
            Budgettering
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-muted-foreground">
              {selectedTemplate ? (
                <>
                  Skabelon: <span className="font-medium text-foreground">{selectedTemplate.label}</span>
                  {selectedTemplate.segment && (
                    <span className="ml-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {selectedTemplate.segment}
                    </span>
                  )}
                </>
              ) : "Planlæg og følg op på dine finansielle mål"}
            </p>
            {selectedTemplate && (
              <button
                onClick={() => setConfirmTemplateChange(true)}
                className="text-[10px] text-primary hover:underline"
              >
                Skift skabelon
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-[100px] h-9 text-xs bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border z-50">
              {[0, 1, 2].map(offset => {
                const y = String(new Date().getFullYear() + offset - 1);
                return <SelectItem key={y} value={y}>{y}</SelectItem>;
              })}
            </SelectContent>
          </Select>
          {dbLoaded && !selectedTemplate && !scenarioData && year !== String(new Date().getFullYear()) && (
            <span className="text-[10px] text-muted-foreground">
              Intet budget for {year}
            </span>
          )}
        </div>
      </div>

      <Tabs defaultValue="oversigt" className="space-y-6">
        <TabsList className="bg-secondary border border-border w-full overflow-x-auto justify-start">
          <TabsTrigger value="oversigt" className="text-xs shrink-0">
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
            Oversigt
          </TabsTrigger>
          <TabsTrigger value="scenarier" className="text-xs shrink-0">
            <Layers className="h-3.5 w-3.5 mr-1.5" />
            Scenarier
          </TabsTrigger>
          <TabsTrigger value="maaned" className="text-xs shrink-0">
            <DollarSign className="h-3.5 w-3.5 mr-1.5" />
            Månedsoversigt
          </TabsTrigger>
          <TabsTrigger value="forecast" className="text-xs shrink-0">
            <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
            Forecast & Simulator
          </TabsTrigger>
          <TabsTrigger value="cashflow" className="text-xs shrink-0">
            <Droplets className="h-3.5 w-3.5 mr-1.5" />
            Cashflow
          </TabsTrigger>
          <TabsTrigger value="import" className="text-xs shrink-0">
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Importér
          </TabsTrigger>
        </TabsList>

        <TabsContent value="oversigt">
          <BudgetOverviewTab rows={rows} year={year} />
        </TabsContent>

        <TabsContent value="scenarier">
          <BudgetScenariosTab
            scenarioData={scenarioData}
            setScenarioData={setScenarioData}
            activeScenario={activeScenario}
            setActiveScenario={setActiveScenario}
            year={year}
            userId={user?.id}
            companyId={companyId || undefined}
            selectedTemplate={selectedTemplate}
            labelOverrides={labelOverrides}
            setLabelOverrides={setLabelOverrides}
          />
        </TabsContent>

        <TabsContent value="maaned">
          <BudgetVsActualTab scenarioData={scenarioData} year={year} companyId={companyId || undefined} />
        </TabsContent>

        <TabsContent value="forecast">
          <BudgetForecastTab
            rows={rows}
            year={year}
            companyId={companyId || undefined}
            userId={user?.id}
          />
        </TabsContent>

        <TabsContent value="cashflow">
          <BudgetCashflowTab
            rows={rows}
            year={year}
            companyId={companyId || undefined}
          />
        </TabsContent>

        <TabsContent value="import">
          <BudgetImport userId={user?.id || ""} companyId={companyId || ""} onImportComplete={handleImportComplete} />
        </TabsContent>
      </Tabs>

      <Dialog open={confirmTemplateChange} onOpenChange={setConfirmTemplateChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Skift budgetskabelon?</DialogTitle>
            <DialogDescription>
              Dette nulstiller dit nuværende budget permanent.
              Dine indtastede tal kan ikke gendannes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmTemplateChange(false)}>
              Annuller
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmTemplateChange(false);
                setChangingTemplate(true);
              }}
            >
              Nulstil og skift skabelon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Budget;
