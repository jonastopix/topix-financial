import { useState, useMemo } from "react";
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
  ChevronDown,
  ChevronRight,
  BarChart3,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

interface BudgetRow {
  key: string;
  label: string;
  values: number[];
  isEditable?: boolean;
  isHeader?: boolean;
  isCalculated?: boolean;
  icon?: any;
}

const defaultBudgetRows: BudgetRow[] = [
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

const formatK = (v: number) => {
  if (v === 0) return "—";
  const sign = v < 0 ? "-" : "";
  return `${sign}${Math.abs(Math.round(v / 1000))}k`;
};

const Budget = () => {
  const [year, setYear] = useState("2026");
  const [rows, setRows] = useState<BudgetRow[]>(defaultBudgetRows);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, number[]>>({});
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["faste_omk"]));

  // Calculated rows
  const ebitda = useMemo(() => {
    return MONTHS.map((_, i) => rows.reduce((sum, row) => sum + row.values[i], 0));
  }, [rows]);

  const afskrivninger = MONTHS.map(() => -3000);
  const ebit = useMemo(() => ebitda.map((v, i) => v + afskrivninger[i]), [ebitda]);

  const totalOmsaetning = useMemo(() => rows.find(r => r.key === "omsaetning")?.values.reduce((s, v) => s + v, 0) || 0, [rows]);
  const totalMarketing = useMemo(() => Math.abs(rows.find(r => r.key === "marketing")?.values.reduce((s, v) => s + v, 0) || 0), [rows]);
  const totalLoenninger = useMemo(() => Math.abs(rows.find(r => r.key === "loenninger")?.values.reduce((s, v) => s + v, 0) || 0), [rows]);
  const totalEbitda = useMemo(() => ebitda.reduce((s, v) => s + v, 0), [ebitda]);

  const fasteOmkostninger = useMemo(() => {
    const fasteKeys = ["lokaler", "admin", "ovrige_faste"];
    return Math.abs(fasteKeys.reduce((sum, key) => {
      const row = rows.find(r => r.key === key);
      return sum + (row?.values.reduce((s, v) => s + v, 0) || 0);
    }, 0));
  }, [rows]);

  const startEditing = () => {
    const vals: Record<string, number[]> = {};
    rows.forEach(r => { vals[r.key] = [...r.values]; });
    setEditValues(vals);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditValues({});
  };

  const saveEdits = () => {
    setRows(prev => prev.map(row => ({
      ...row,
      values: editValues[row.key] || row.values,
    })));
    setEditing(false);
    setEditValues({});
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
          <TabsTrigger value="maaned" className="text-xs">
            <DollarSign className="h-3.5 w-3.5 mr-1.5" />
            Månedsoversigt
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="oversigt" className="space-y-6">
          {/* Summary KPIs */}
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold text-foreground">Budget {year}</h2>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Konsolideret overblik
              </span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryKPI
                icon={TrendingUp}
                label="Total omsætning"
                value={`${(totalOmsaetning / 1000).toFixed(0)}.000 kr.`}
              />
              <SummaryKPI
                icon={Megaphone}
                label="Marketing"
                value={`${(totalMarketing / 1000).toFixed(0)}.000 kr.`}
              />
              <SummaryKPI
                icon={Users}
                label="Lønninger"
                value={`${(totalLoenninger / 1000).toFixed(0)}.000 kr.`}
              />
              <SummaryKPI
                icon={DollarSign}
                label="EBITDA"
                value={`${(totalEbitda / 1000).toFixed(0)}.000 kr.`}
                valueColor={totalEbitda >= 0 ? "text-primary" : "text-destructive"}
              />
            </div>
          </div>

          {/* Fixed costs breakdown */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="font-display font-semibold text-foreground mb-4">Faste omkostninger</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <CostCard
                label="Lokaler"
                amount={Math.abs(rows.find(r => r.key === "lokaler")?.values.reduce((s, v) => s + v, 0) || 0)}
                detail="Klik for detaljer"
              />
              <CostCard
                label="Administration"
                amount={Math.abs(rows.find(r => r.key === "admin")?.values.reduce((s, v) => s + v, 0) || 0)}
                detail="Klik for detaljer"
              />
              <CostCard
                label="Øvrige faste"
                amount={Math.abs(rows.find(r => r.key === "ovrige_faste")?.values.reduce((s, v) => s + v, 0) || 0)}
                detail=""
              />
            </div>
          </div>
        </TabsContent>

        {/* Monthly Grid Tab */}
        <TabsContent value="maaned" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Månedsoversigt
            </h2>
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
                <button
                  onClick={cancelEditing}
                  className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                  Annuller
                </button>
                <button
                  onClick={saveEdits}
                  className="inline-flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Save className="h-3.5 w-3.5" />
                  Gem
                </button>
              </div>
            )}
          </div>

          <div className="glass-card rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium text-xs uppercase tracking-wider sticky left-0 bg-secondary/30 min-w-[180px] z-10">
                      Linje
                    </th>
                    {MONTHS.map((m) => (
                      <th key={m} className="text-right py-3 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider min-w-[70px]">
                        {m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Data rows */}
                  {rows.map((row) => (
                    <tr key={row.key} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                      <td className="py-3 px-4 text-foreground font-medium sticky left-0 bg-card z-10 flex items-center gap-2">
                        {row.icon && <row.icon className="h-3.5 w-3.5 text-muted-foreground" />}
                        {row.label}
                        {row.key === "ovrige_faste" && (
                          <span className="text-[10px] text-muted-foreground">(ingen data)</span>
                        )}
                      </td>
                      {row.values.map((val, i) => (
                        <td key={i} className="py-3 px-3 text-right font-display">
                          {editing && row.isEditable ? (
                            <input
                              type="number"
                              value={editValues[row.key]?.[i] ?? val}
                              onChange={(e) => updateCell(row.key, i, e.target.value)}
                              className="w-16 text-right bg-secondary border border-border rounded px-1.5 py-0.5 text-foreground text-xs font-display focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          ) : (
                            <span className={val === 0 ? "text-muted-foreground" : val > 0 ? "text-foreground" : "text-foreground"}>
                              {formatK(val)}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}

                  {/* EBITDA row */}
                  <tr className="border-t-2 border-border bg-secondary/20 font-semibold">
                    <td className="py-3 px-4 text-foreground font-bold sticky left-0 bg-secondary/20 z-10">
                      EBITDA
                    </td>
                    {ebitda.map((val, i) => (
                      <td key={i} className={`py-3 px-3 text-right font-display font-bold ${val >= 0 ? "text-primary" : "text-destructive"}`}>
                        {formatK(val)}
                      </td>
                    ))}
                  </tr>

                  {/* Afskrivninger */}
                  <tr className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="py-3 px-4 text-foreground font-medium sticky left-0 bg-card z-10">
                      Afskrivninger
                    </td>
                    {afskrivninger.map((val, i) => (
                      <td key={i} className="py-3 px-3 text-right font-display text-foreground">
                        {formatK(val)}
                      </td>
                    ))}
                  </tr>

                  {/* EBIT row */}
                  <tr className="border-t-2 border-border bg-secondary/20 font-semibold">
                    <td className="py-3 px-4 text-foreground font-bold sticky left-0 bg-secondary/20 z-10">
                      EBIT
                    </td>
                    {ebit.map((val, i) => (
                      <td key={i} className={`py-3 px-3 text-right font-display font-bold ${val >= 0 ? "text-primary" : "text-destructive"}`}>
                        {formatK(val)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

function SummaryKPI({ icon: Icon, label, value, valueColor }: {
  icon: any; label: string; value: string; valueColor?: string;
}) {
  return (
    <div className="p-4 rounded-xl bg-secondary/50 border border-border/30 hover:bg-secondary/70 transition-colors cursor-pointer">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-lg font-display font-bold ${valueColor || "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

function CostCard({ label, amount, detail }: { label: string; amount: number; detail: string }) {
  return (
    <div className="p-4 rounded-xl bg-secondary/30 border border-border/20 hover:bg-secondary/50 transition-colors cursor-pointer group">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          <p className="text-base font-display font-bold text-foreground">
            {amount.toLocaleString("da-DK")} kr.
          </p>
          {detail && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{detail}</p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
}

export default Budget;
