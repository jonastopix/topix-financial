import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const data = [
  { month: "Sep", revenue: 42000, expenses: 68000 },
  { month: "Okt", revenue: 58000, expenses: 65000 },
  { month: "Nov", revenue: 71000, expenses: 62000 },
  { month: "Dec", revenue: 85000, expenses: 70000 },
  { month: "Jan", revenue: 98000, expenses: 72000 },
  { month: "Feb", revenue: 115000, expenses: 75000 },
];

const RevenueChart = () => {
  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-foreground">Omsætning vs. Udgifter</h3>
        <span className="text-xs text-muted-foreground">Sidste 6 måneder</span>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.15} />
                <stop offset="95%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 14%)" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 12, fill: "hsl(220, 10%, 46%)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "hsl(220, 10%, 46%)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v / 1000}k`}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(220, 25%, 9%)",
                border: "1px solid hsl(220, 20%, 14%)",
                borderRadius: "8px",
                fontSize: "12px",
                color: "hsl(220, 10%, 90%)",
              }}
              formatter={(value: number) => [`${(value / 1000).toFixed(0)}k DKK`, ""]}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="hsl(160, 84%, 39%)"
              strokeWidth={2}
              fill="url(#colorRevenue)"
              name="Omsætning"
            />
            <Area
              type="monotone"
              dataKey="expenses"
              stroke="hsl(0, 72%, 51%)"
              strokeWidth={2}
              fill="url(#colorExpenses)"
              name="Udgifter"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default RevenueChart;
