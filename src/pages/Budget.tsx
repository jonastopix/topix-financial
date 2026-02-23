import { useState, useMemo, useCallback } from "react";
import AppLayout from "@/components/AppLayout";
import {
  Calculator,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Building2,
  Users,
  Megaphone,
  Pencil,
  Save,
  X,
  ChevronRight,
  BarChart3,
  Layers,
  Sparkles,
  Shield,
  Zap,
  Copy,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

interface BudgetRow {
  key: string;
  label: string;
  values: number[];
  isEditable?: boolean;
  icon?: any;
}

type ScenarioKey = "base" | "optimistisk" | "pessimistisk";

interface Scenario {
  key: ScenarioKey;
  label: string;
  description: string;
  icon: any;
  color: string;
  bg: string;
  border: string;
}

const SCENARIOS: Scenario[] = [
  { key: "base", label: "Base", description: "Dit reelle budget – udgangspunktet", icon: Shield, color: "text-primary", bg: "bg-primary/10", border: "border-primary/30" },
  { key: "optimistisk", label: "Optimistisk", description: "Hvad hvis alt går bedre end forventet?", icon: Zap, color: "text-chart-warning", bg: "bg-chart-warning/10", border: "border-chart-warning/30" },
  { key: "pessimistisk", label: "Pessimistisk", description: "Worst case – hvad kan du tåle?", icon: TrendingDown, color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/30" },
];

const baseBudgetRows: BudgetRow[] = [
  { key: "omsaetning", label: "Omsætning", values: [73000, 13000, 31000, 41000, 78000, 82000, 82000, 83000, 159000, 112000, 114000, 120000], isEditable: true, icon: TrendingUp },
  { key: "marketing", label: "Marketing", values: [-11000, -2000, -5000, -6000, -12000, -12000, -12000, -12000, -24000, -17000, -17000, -18000], isEditable: true, icon: Megaphone },
  { key: "loenninger", label: "Lønninger", values: [-40000, -40000, -40000, -40000, -40000, -40000, -40000, -40000, -40000, -40000, -40000, -40000], isEditable: true, icon: Users },
  { key: "lokaler", label: "Lokaler", values: [-4000, -4000, -4000, -4000, -4000, -4000, -4000, -4000, -4000, -4000, -4000, -4000], isEditable: true, icon: Building2 },
  { key: "admin", label: "Admin", values: [-12000, -12000, -12000, -12000, -12000, -12000, -12000, -12000, -12000, -12000, -12000, -12000], isEditable: true },
  { key: "ovrige_faste", label: "Øvrige faste", values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], isEditable: true },
  { key: "vareforbrug", label: "Vareforbrug", values: [-5000, -5000, -5000, -5000, -5000, -5000, -5000, -5000, -5000, -5000, -5000, -5000], isEditable: true },
  { key: "biomkostninger", label: "Biomkostninger", values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], isEditable: true },
  { key: "salgsomkostninger", label: "Salgs-/rejseomkostninger", values: [-2000, -2000, -2000, -2000, -2000, -2000, -2000, -2000, -2000, -2000, -2000, -2000], isEditable: true },
];

function applyMultiplier(rows: BudgetRow[], revenueMultiplier: number, costMultiplier: number): BudgetRow[] {
  return rows.map(row => ({
    ...row,
    values: row.values.map(v => {
      if (row.key === "omsaetning") return Math.round(v * revenueMultiplier);
      if (v < 0) return Math.round(v * costMultiplier);
      return v;
    }),
  }));
}

const formatK = (v: number) => {
  if (v === 0) return "—";
  const sign = v < 0 ? "-" : "";
  return `${sign}${Math.abs(Math.round(v / 1000))}k`;
};

const Budget = () => {
  const [year, setYear] = useState("2026");
  const [activeScenario, setActiveScenario] = useState<ScenarioKey>("base");
  const [scenarioData, setScenarioData] = useState<Record<ScenarioKey, BudgetRow[]>>({
    base: baseBudgetRows,
    optimistisk: applyMultiplier(baseBudgetRows, 1.25, 0.95),
    pessimistisk: applyMultiplier(baseBudgetRows, 0.7, 1.15),
  });
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, number[]>>({});

  const rows = scenarioData[activeScenario];
  const scenarioConfig = SCENARIOS.find(s => s.key === activeScenario)!;

  const ebitda = useMemo(() => MONTHS.map((_, i) => rows.reduce((sum, row) => sum + row.values[i], 0)), [rows]);
  const afskrivninger = MONTHS.map(() => -3000);
  const ebit = useMemo(() => ebitda.map((v, i) => v + afskrivninger[i]), [ebitda]);

  const totalOmsaetning = useMemo(() => rows.find(r => r.key === "omsaetning")?.values.reduce((s, v) => s + v, 0) || 0, [rows]);
  const totalMarketing = useMemo(() => Math.abs(rows.find(r => r.key === "marketing")?.values.reduce((s, v) => s + v, 0) || 0), [rows]);
  const totalLoenninger = useMemo(() => Math.abs(rows.find(r => r.key === "loenninger")?.values.reduce((s, v) => s + v, 0) || 0), [rows]);
  const totalEbitda = useMemo(() => ebitda.reduce((s, v) => s + v, 0), [ebitda]);

  // Compare scenario EBITDA to base
  const baseEbitdaTotal = useMemo(() => {
    const baseRows = scenarioData.base;
    return MONTHS.map((_, i) => baseRows.reduce((sum, row) => sum + row.values[i], 0)).reduce((s, v) => s + v, 0);
  }, [scenarioData]);

  const ebitdaDiffFromBase = totalEbitda - baseEbitdaTotal;

  const startEditing = () => {
    const vals: Record<string, number[]> = {};
    rows.forEach(r => { vals[r.key] = [...r.values]; });
    setEditValues(vals);
    setEditing(true);
  };

  const cancelEditing = () => { setEditing(false); setEditValues({}); };

  const saveEdits = () => {
    setScenarioData(prev => ({
      ...prev,
      [activeScenario]: prev[activeScenario].map(row => ({
        ...row,
        values: editValues[row.key] || row.values,
      })),
    }));
    setEditing(false);
    setEditValues({});
    toast.success(`${scenarioConfig.label}-scenarie gemt`);
  };

  const updateCell = (key: string, monthIdx: number, value: string) => {
    const num = parseInt(value) || 0;
    setEditValues(prev => {
      const updated = { ...prev };
      updated[key] = [...(updated[key] || [])];
      updated[key][monthIdx] = num;
      return updated;
    });
  };

  const copyBaseToScenario = (target: ScenarioKey) => {
    setScenarioData(prev => ({
      ...prev,
      [target]: prev.base.map(r => ({ ...r, values: [...r.values] })),
    }));
    toast.success(`Base-budget kopieret til ${SCENARIOS.find(s => s.key === target)?.label}`);
  };

  return (
    <AppLayout>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight flex items-center gap-2">
            <Calculator className="h-6 w-6 text-primary" />
            Budgettering
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Planlæg og følg op på dine finansielle mål
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-[100px] h-9 text-xs bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border z-50">
              <SelectItem value="2025">2025</SelectItem>
              <SelectItem value="2026">2026</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="oversigt" className="space-y-6">
        <TabsList className="bg-secondary border border-border">
          <TabsTrigger value="oversigt" className="text-xs">
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
            Oversigt
          </TabsTrigger>
          <TabsTrigger value="scenarier" className="text-xs">
            <Layers className="h-3.5 w-3.5 mr-1.5" />
            Scenarier
          </TabsTrigger>
          <TabsTrigger value="maaned" className="text-xs">
            <DollarSign className="h-3.5 w-3.5 mr-1.5" />
            Månedsoversigt
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="oversigt" className="space-y-6">
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold text-foreground">Budget {year}</h2>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Konsolideret overblik</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryKPI icon={TrendingUp} label="Total omsætning" value={`${(totalOmsaetning / 1000).toFixed(0)}.000 kr.`} />
              <SummaryKPI icon={Megaphone} label="Marketing" value={`${(totalMarketing / 1000).toFixed(0)}.000 kr.`} />
              <SummaryKPI icon={Users} label="Lønninger" value={`${(totalLoenninger / 1000).toFixed(0)}.000 kr.`} />
              <SummaryKPI icon={DollarSign} label="EBITDA" value={`${(totalEbitda / 1000).toFixed(0)}.000 kr.`} valueColor={totalEbitda >= 0 ? "text-primary" : "text-destructive"} />
            </div>
          </div>

          <div className="glass-card rounded-xl p-6">
            <h3 className="font-display font-semibold text-foreground mb-4">Faste omkostninger</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <CostCard label="Lokaler" amount={Math.abs(rows.find(r => r.key === "lokaler")?.values.reduce((s, v) => s + v, 0) || 0)} detail="Klik for detaljer" />
              <CostCard label="Administration" amount={Math.abs(rows.find(r => r.key === "admin")?.values.reduce((s, v) => s + v, 0) || 0)} detail="Klik for detaljer" />
              <CostCard label="Øvrige faste" amount={Math.abs(rows.find(r => r.key === "ovrige_faste")?.values.reduce((s, v) => s + v, 0) || 0)} detail="" />
            </div>
          </div>
        </TabsContent>

        {/* Scenarios Tab */}
        <TabsContent value="scenarier" className="space-y-6">
          {/* Scenario selector */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SCENARIOS.map((sc) => {
              const isActive = activeScenario === sc.key;
              const Icon = sc.icon;
              const scRows = scenarioData[sc.key];
              const scEbitda = MONTHS.map((_, i) => scRows.reduce((sum, row) => sum + row.values[i], 0)).reduce((s, v) => s + v, 0);
              const scRevenue = scRows.find(r => r.key === "omsaetning")?.values.reduce((s, v) => s + v, 0) || 0;

              return (
                <button
                  key={sc.key}
                  onClick={() => { if (editing) { cancelEditing(); } setActiveScenario(sc.key); }}
                  className={`p-5 rounded-xl border-2 text-left transition-all ${
                    isActive ? `${sc.border} ${sc.bg}` : "border-border/30 bg-secondary/20 hover:bg-secondary/40"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`h-4 w-4 ${isActive ? sc.color : "text-muted-foreground"}`} />
                    <span className={`text-sm font-semibold ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                      {sc.label}
                    </span>
                    {isActive && (
                      <span className={`ml-auto text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${sc.bg} ${sc.color}`}>
                        Aktiv
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{sc.description}</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Omsætning</p>
                      <p className="text-sm font-display font-bold text-foreground">{(scRevenue / 1000).toFixed(0)}k</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">EBITDA</p>
                      <p className={`text-sm font-display font-bold ${scEbitda >= 0 ? "text-primary" : "text-destructive"}`}>
                        {(scEbitda / 1000).toFixed(0)}k
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active scenario detail */}
          <div className={`glass-card rounded-xl p-6 border-l-4 ${scenarioConfig.border}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <scenarioConfig.icon className={`h-5 w-5 ${scenarioConfig.color}`} />
                <div>
                  <h3 className="font-display font-semibold text-foreground">
                    {scenarioConfig.label}-scenarie · {year}
                  </h3>
                  <p className="text-xs text-muted-foreground">{scenarioConfig.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {activeScenario !== "base" && (
                  <button
                    onClick={() => copyBaseToScenario(activeScenario)}
                    className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Kopiér base
                  </button>
                )}
                {!editing ? (
                  <button
                    onClick={startEditing}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Rediger
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button onClick={cancelEditing} className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={saveEdits} className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                      <Save className="h-3.5 w-3.5" />
                      Gem
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Scenario comparison KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <ScenarioKPI label="Omsætning" value={totalOmsaetning} color={scenarioConfig.color} />
              <ScenarioKPI label="Marketing" value={-totalMarketing} color={scenarioConfig.color} />
              <ScenarioKPI label="Lønninger" value={-totalLoenninger} color={scenarioConfig.color} />
              <ScenarioKPI
                label="EBITDA"
                value={totalEbitda}
                color={totalEbitda >= 0 ? "text-primary" : "text-destructive"}
                diff={activeScenario !== "base" ? ebitdaDiffFromBase : undefined}
              />
            </div>

            {/* Scenario grid */}
            <div className="overflow-x-auto rounded-lg border border-border/30">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="text-left py-2.5 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider sticky left-0 bg-secondary/30 min-w-[160px] z-10">Linje</th>
                    {MONTHS.map(m => (
                      <th key={m} className="text-right py-2.5 px-2.5 text-muted-foreground font-medium text-xs uppercase tracking-wider min-w-[65px]">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.key} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                      <td className="py-2.5 px-3 text-foreground font-medium text-xs sticky left-0 bg-card z-10 flex items-center gap-1.5">
                        {row.icon && <row.icon className="h-3 w-3 text-muted-foreground" />}
                        {row.label}
                      </td>
                      {row.values.map((val, i) => (
                        <td key={i} className="py-2.5 px-2.5 text-right font-display text-xs">
                          {editing && row.isEditable ? (
                            <input
                              type="number"
                              value={editValues[row.key]?.[i] ?? val}
                              onChange={(e) => updateCell(row.key, i, e.target.value)}
                              className="w-16 text-right bg-secondary border border-border rounded px-1 py-0.5 text-foreground text-xs font-display focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          ) : (
                            <span className={val === 0 ? "text-muted-foreground" : "text-foreground"}>{formatK(val)}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border bg-secondary/20 font-semibold">
                    <td className="py-2.5 px-3 text-foreground font-bold text-xs sticky left-0 bg-secondary/20 z-10">EBITDA</td>
                    {ebitda.map((val, i) => (
                      <td key={i} className={`py-2.5 px-2.5 text-right font-display text-xs font-bold ${val >= 0 ? "text-primary" : "text-destructive"}`}>{formatK(val)}</td>
                    ))}
                  </tr>
                  <tr className="border-b border-border/30">
                    <td className="py-2.5 px-3 text-foreground font-medium text-xs sticky left-0 bg-card z-10">Afskrivninger</td>
                    {afskrivninger.map((val, i) => (
                      <td key={i} className="py-2.5 px-2.5 text-right font-display text-xs text-foreground">{formatK(val)}</td>
                    ))}
                  </tr>
                  <tr className="border-t-2 border-border bg-secondary/20 font-semibold">
                    <td className="py-2.5 px-3 text-foreground font-bold text-xs sticky left-0 bg-secondary/20 z-10">EBIT</td>
                    {ebit.map((val, i) => (
                      <td key={i} className={`py-2.5 px-2.5 text-right font-display text-xs font-bold ${val >= 0 ? "text-primary" : "text-destructive"}`}>{formatK(val)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Scenario comparison summary */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Scenarie-sammenligning
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Nøgletal</th>
                    {SCENARIOS.map(sc => (
                      <th key={sc.key} className="text-right py-3 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                        <span className="flex items-center justify-end gap-1">
                          <sc.icon className={`h-3 w-3 ${sc.color}`} />
                          {sc.label}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {["omsaetning", "marketing", "loenninger"].map(key => {
                    const label = baseBudgetRows.find(r => r.key === key)?.label || key;
                    return (
                      <tr key={key} className="hover:bg-secondary/30 transition-colors">
                        <td className="py-3 px-3 text-foreground font-medium">{label}</td>
                        {SCENARIOS.map(sc => {
                          const val = scenarioData[sc.key].find(r => r.key === key)?.values.reduce((s, v) => s + v, 0) || 0;
                          return (
                            <td key={sc.key} className="py-3 px-3 text-right font-display">
                              {(val / 1000).toFixed(0)}k
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  <tr className="font-semibold border-t-2 border-border">
                    <td className="py-3 px-3 text-foreground font-bold">EBITDA</td>
                    {SCENARIOS.map(sc => {
                      const scRows = scenarioData[sc.key];
                      const val = MONTHS.map((_, i) => scRows.reduce((sum, row) => sum + row.values[i], 0)).reduce((s, v) => s + v, 0);
                      return (
                        <td key={sc.key} className={`py-3 px-3 text-right font-display font-bold ${val >= 0 ? "text-primary" : "text-destructive"}`}>
                          {(val / 1000).toFixed(0)}k
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Monthly Grid Tab - always shows base */}
        <TabsContent value="maaned" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Månedsoversigt – Base
            </h2>
          </div>

          <div className="glass-card rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium text-xs uppercase tracking-wider sticky left-0 bg-secondary/30 min-w-[180px] z-10">Linje</th>
                    {MONTHS.map(m => (
                      <th key={m} className="text-right py-3 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider min-w-[70px]">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scenarioData.base.map(row => (
                    <tr key={row.key} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                      <td className="py-3 px-4 text-foreground font-medium sticky left-0 bg-card z-10 flex items-center gap-2">
                        {row.icon && <row.icon className="h-3.5 w-3.5 text-muted-foreground" />}
                        {row.label}
                      </td>
                      {row.values.map((val, i) => (
                        <td key={i} className="py-3 px-3 text-right font-display">
                          <span className={val === 0 ? "text-muted-foreground" : "text-foreground"}>{formatK(val)}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                  {(() => {
                    const baseEbitda = MONTHS.map((_, i) => scenarioData.base.reduce((sum, row) => sum + row.values[i], 0));
                    const baseEbit = baseEbitda.map((v, i) => v + afskrivninger[i]);
                    return (
                      <>
                        <tr className="border-t-2 border-border bg-secondary/20 font-semibold">
                          <td className="py-3 px-4 text-foreground font-bold sticky left-0 bg-secondary/20 z-10">EBITDA</td>
                          {baseEbitda.map((val, i) => (
                            <td key={i} className={`py-3 px-3 text-right font-display font-bold ${val >= 0 ? "text-primary" : "text-destructive"}`}>{formatK(val)}</td>
                          ))}
                        </tr>
                        <tr className="border-b border-border/50">
                          <td className="py-3 px-4 text-foreground font-medium sticky left-0 bg-card z-10">Afskrivninger</td>
                          {afskrivninger.map((val, i) => (
                            <td key={i} className="py-3 px-3 text-right font-display text-foreground">{formatK(val)}</td>
                          ))}
                        </tr>
                        <tr className="border-t-2 border-border bg-secondary/20 font-semibold">
                          <td className="py-3 px-4 text-foreground font-bold sticky left-0 bg-secondary/20 z-10">EBIT</td>
                          {baseEbit.map((val, i) => (
                            <td key={i} className={`py-3 px-3 text-right font-display font-bold ${val >= 0 ? "text-primary" : "text-destructive"}`}>{formatK(val)}</td>
                          ))}
                        </tr>
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

function SummaryKPI({ icon: Icon, label, value, valueColor }: { icon: any; label: string; value: string; valueColor?: string }) {
  return (
    <div className="p-4 rounded-xl bg-secondary/50 border border-border/30 hover:bg-secondary/70 transition-colors cursor-pointer">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-lg font-display font-bold ${valueColor || "text-foreground"}`}>{value}</p>
    </div>
  );
}

function ScenarioKPI({ label, value, color, diff }: { label: string; value: number; color: string; diff?: number }) {
  return (
    <div className="p-3 rounded-lg bg-secondary/30 border border-border/20">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm font-display font-bold ${value >= 0 ? (color || "text-foreground") : "text-destructive"}`}>
        {(value / 1000).toFixed(0)}k kr.
      </p>
      {diff !== undefined && diff !== 0 && (
        <p className={`text-[10px] font-medium mt-0.5 ${diff >= 0 ? "text-primary" : "text-destructive"}`}>
          {diff > 0 ? "+" : ""}{(diff / 1000).toFixed(0)}k vs. base
        </p>
      )}
    </div>
  );
}

function CostCard({ label, amount, detail }: { label: string; amount: number; detail: string }) {
  return (
    <div className="p-4 rounded-xl bg-secondary/30 border border-border/20 hover:bg-secondary/50 transition-colors cursor-pointer group">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          <p className="text-base font-display font-bold text-foreground">{amount.toLocaleString("da-DK")} kr.</p>
          {detail && <p className="text-[10px] text-muted-foreground mt-0.5">{detail}</p>}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
}

export default Budget;
