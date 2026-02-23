import AppLayout from "@/components/AppLayout";
import KPICard from "@/components/KPICard";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, Users, DollarSign, Target } from "lucide-react";

const kpiData = [
  { month: "Sep", mrr: 42, customers: 45, churn: 5.2 },
  { month: "Okt", mrr: 58, customers: 52, churn: 4.8 },
  { month: "Nov", mrr: 71, customers: 60, churn: 4.1 },
  { month: "Dec", mrr: 85, customers: 68, churn: 3.5 },
  { month: "Jan", mrr: 98, customers: 75, churn: 3.0 },
  { month: "Feb", mrr: 115, customers: 87, churn: 2.8 },
];

const KPIs = () => {
  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">KPI'er</h1>
        <p className="text-sm text-muted-foreground mt-1">Følg dine vigtigste nøgletal</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard title="MRR" value="115k DKK" change="+17%" trend="up" icon={<DollarSign className="h-4 w-4" />} />
        <KPICard title="Aktive kunder" value="87" change="+16%" trend="up" icon={<Users className="h-4 w-4" />} />
        <KPICard title="Churn Rate" value="2,8%" change="-0,2pp" trend="up" icon={<TrendingUp className="h-4 w-4" />} />
        <KPICard title="LTV" value="42.000 DKK" change="+8%" trend="up" icon={<Target className="h-4 w-4" />} />
      </div>

      <div className="glass-card rounded-xl p-5 animate-fade-in">
        <h3 className="font-display font-semibold text-foreground mb-4">MRR Udvikling (i tusinder DKK)</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={kpiData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 14%)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(220, 10%, 46%)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "hsl(220, 10%, 46%)" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: "hsl(220, 25%, 9%)",
                  border: "1px solid hsl(220, 20%, 14%)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "hsl(220, 10%, 90%)",
                }}
              />
              <Bar dataKey="mrr" fill="hsl(160, 84%, 39%)" radius={[6, 6, 0, 0]} name="MRR (k)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </AppLayout>
  );
};

export default KPIs;
