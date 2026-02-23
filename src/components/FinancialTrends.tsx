import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";

// Mock historical data based on the real saldobalance structure
const monthlyData = [
  {
    month: "Maj 25",
    omsaetning: 28500,
    direkte_omk: 1200,
    daekningsbidrag: 27300,
    loenninger: 28000,
    marketing: 15200,
    admin: 12800,
    resultat: -28700,
    aktiver: 95000,
    bank: 82000,
    kreditorer: 18000,
  },
  {
    month: "Jun 25",
    omsaetning: 35200,
    direkte_omk: 1450,
    daekningsbidrag: 33750,
    loenninger: 29500,
    marketing: 22100,
    admin: 14200,
    resultat: -32050,
    aktiver: 88000,
    bank: 65000,
    kreditorer: 22000,
  },
  {
    month: "Jul 25",
    omsaetning: 42800,
    direkte_omk: 1600,
    daekningsbidrag: 41200,
    loenninger: 30200,
    marketing: 28500,
    admin: 15800,
    resultat: -33300,
    aktiver: 110000,
    bank: 48000,
    kreditorer: 35000,
  },
  {
    month: "Aug 25",
    omsaetning: 51400,
    direkte_omk: 1750,
    daekningsbidrag: 49650,
    loenninger: 31000,
    marketing: 32400,
    admin: 18500,
    resultat: -32250,
    aktiver: 135000,
    bank: 42000,
    kreditorer: 38000,
  },
  {
    month: "Sep 25",
    omsaetning: 62100,
    direkte_omk: 1850,
    daekningsbidrag: 60250,
    loenninger: 31500,
    marketing: 35800,
    admin: 21000,
    resultat: -28050,
    aktiver: 168000,
    bank: 51000,
    kreditorer: 41000,
  },
  {
    month: "Okt 25",
    omsaetning: 74731,
    direkte_omk: 1862,
    daekningsbidrag: 72869,
    loenninger: 31966,
    marketing: 24661,
    admin: 24530,
    resultat: -15149,
    aktiver: 221219,
    bank: 61095,
    kreditorer: 44938,
  },
];

const formatDKK = (value: number) => `${(value / 1000).toFixed(0)}k`;

const tooltipStyle = {
  background: "hsl(220, 25%, 9%)",
  border: "1px solid hsl(220, 20%, 14%)",
  borderRadius: "8px",
  fontSize: "12px",
  color: "hsl(220, 10%, 90%)",
};

const tooltipFormatter = (value: number) => [
  `${value.toLocaleString("da-DK")} DKK`,
  "",
];

interface TrendCardProps {
  label: string;
  current: number;
  previous: number;
}

function TrendCard({ label, current, previous }: TrendCardProps) {
  const change = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0;
  const isPositive = change > 0;
  // For "resultat" negative means loss, so improving (less negative) is good
  const isGood = label === "Resultat" ? current > previous : isPositive;

  return (
    <div className="p-4 rounded-xl bg-secondary/50 border border-border/30">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-lg font-display font-bold text-foreground">
        {current.toLocaleString("da-DK")} DKK
      </p>
      <div className="flex items-center gap-1 mt-1">
        {isGood ? (
          <TrendingUp className="h-3 w-3 text-primary" />
        ) : (
          <TrendingDown className="h-3 w-3 text-destructive" />
        )}
        <span
          className={`text-xs font-medium ${isGood ? "text-primary" : "text-destructive"}`}
        >
          {isPositive ? "+" : ""}
          {change.toFixed(1)}%
        </span>
        <span className="text-[10px] text-muted-foreground ml-1">vs. forrige</span>
      </div>
    </div>
  );
}

const FinancialTrends = () => {
  const latest = monthlyData[monthlyData.length - 1];
  const prev = monthlyData[monthlyData.length - 2];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-display font-semibold text-foreground mb-1">
          Finansielle trends
        </h2>
        <p className="text-xs text-muted-foreground">
          Baseret på uploadede rapporter · Senest: {latest.month}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <TrendCard label="Omsætning" current={latest.omsaetning} previous={prev.omsaetning} />
        <TrendCard label="Dækningsbidrag" current={latest.daekningsbidrag} previous={prev.daekningsbidrag} />
        <TrendCard label="Resultat" current={latest.resultat} previous={prev.resultat} />
        <TrendCard label="Bank" current={latest.bank} previous={prev.bank} />
      </div>

      {/* Revenue vs costs chart */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="font-display font-semibold text-foreground mb-4">
          Omsætning vs. Omkostninger
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthlyData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <defs>
                <linearGradient id="trendRevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="trendCostGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 14%)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(220, 10%, 46%)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(220, 10%, 46%)" }} axisLine={false} tickLine={false} tickFormatter={formatDKK} />
              <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Area type="monotone" dataKey="omsaetning" name="Omsætning" stroke="hsl(160, 84%, 39%)" strokeWidth={2} fill="url(#trendRevGrad)" />
              <Area type="monotone" dataKey="loenninger" name="Lønninger" stroke="hsl(38, 92%, 50%)" strokeWidth={2} fill="url(#trendCostGrad)" />
              <Area type="monotone" dataKey="marketing" name="Marketing" stroke="hsl(217, 91%, 60%)" strokeWidth={1.5} fill="none" strokeDasharray="4 3" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cost breakdown bar chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card rounded-xl p-5">
          <h3 className="font-display font-semibold text-foreground mb-4">
            Omkostningsfordeling pr. måned
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 14%)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(220, 10%, 46%)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(220, 10%, 46%)" }} axisLine={false} tickLine={false} tickFormatter={formatDKK} />
                <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar dataKey="loenninger" name="Lønninger" fill="hsl(38, 92%, 50%)" radius={[3, 3, 0, 0]} stackId="costs" />
                <Bar dataKey="marketing" name="Marketing" fill="hsl(217, 91%, 60%)" radius={[3, 3, 0, 0]} stackId="costs" />
                <Bar dataKey="admin" name="Administration" fill="hsl(220, 10%, 46%)" radius={[3, 3, 0, 0]} stackId="costs" />
                <Bar dataKey="direkte_omk" name="Direkte omk." fill="hsl(0, 72%, 51%)" radius={[3, 3, 0, 0]} stackId="costs" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Balance trend */}
        <div className="glass-card rounded-xl p-5">
          <h3 className="font-display font-semibold text-foreground mb-4">
            Balance – Aktiver & Bank
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <defs>
                  <linearGradient id="aktivGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 14%)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(220, 10%, 46%)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(220, 10%, 46%)" }} axisLine={false} tickLine={false} tickFormatter={formatDKK} />
                <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Area type="monotone" dataKey="aktiver" name="Aktiver i alt" stroke="hsl(160, 84%, 39%)" strokeWidth={2} fill="url(#aktivGrad)" />
                <Area type="monotone" dataKey="bank" name="Bank" stroke="hsl(217, 91%, 60%)" strokeWidth={2} fill="none" />
                <Area type="monotone" dataKey="kreditorer" name="Kreditorer" stroke="hsl(0, 72%, 51%)" strokeWidth={1.5} fill="none" strokeDasharray="4 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Month-over-month table */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="font-display font-semibold text-foreground mb-4">
          Måned-for-måned sammenligning
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                  Nøgletal
                </th>
                {monthlyData.map((d) => (
                  <th key={d.month} className="text-right py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                    {d.month}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                { key: "omsaetning" as const, label: "Omsætning" },
                { key: "daekningsbidrag" as const, label: "Dækningsbidrag" },
                { key: "loenninger" as const, label: "Lønninger" },
                { key: "marketing" as const, label: "Marketing" },
                { key: "resultat" as const, label: "Resultat" },
                { key: "bank" as const, label: "Bank" },
              ].map((row) => (
                <tr key={row.key} className="hover:bg-secondary/50 transition-colors">
                  <td className="py-3 px-2 text-foreground font-medium">{row.label}</td>
                  {monthlyData.map((d, i) => {
                    const val = d[row.key];
                    const prev = i > 0 ? monthlyData[i - 1][row.key] : val;
                    const isUp = val > prev;
                    const isNeutral = val === prev;
                    return (
                      <td key={d.month} className="py-3 px-2 text-right font-display">
                        <span className={
                          row.key === "resultat"
                            ? val < 0 ? "text-destructive" : "text-primary"
                            : isNeutral ? "text-foreground" : ""
                        }>
                          {val < 0 ? "" : ""}{(val / 1000).toFixed(1)}k
                        </span>
                        {!isNeutral && i > 0 && (
                          <span className={`text-[10px] ml-1 ${
                            (row.key === "resultat" ? isUp : isUp)
                              ? "text-primary" : "text-destructive"
                          }`}>
                            {isUp ? "↑" : "↓"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default FinancialTrends;
