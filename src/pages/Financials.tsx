import AppLayout from "@/components/AppLayout";
import RevenueChart from "@/components/RevenueChart";
import BudgetOverview from "@/components/BudgetOverview";
import KPICard from "@/components/KPICard";
import { DollarSign, TrendingDown, PiggyBank, CreditCard } from "lucide-react";

const Financials = () => {
  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
          Økonomi
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Finansielt overblik og budgetstyring
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard title="Omsætning (MTD)" value="115.000 DKK" change="+17%" trend="up" icon={<DollarSign className="h-4 w-4" />} />
        <KPICard title="Udgifter (MTD)" value="75.000 DKK" change="-4%" trend="up" icon={<CreditCard className="h-4 w-4" />} />
        <KPICard title="Resultat" value="40.000 DKK" change="+52%" trend="up" icon={<PiggyBank className="h-4 w-4" />} />
        <KPICard title="Cash Position" value="1.050.000 DKK" change="+40k" trend="up" icon={<TrendingDown className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RevenueChart />
        </div>
        <BudgetOverview />
      </div>

      {/* Transactions table */}
      <div className="glass-card rounded-xl p-5 mt-6 animate-fade-in">
        <h3 className="font-display font-semibold text-foreground mb-4">Seneste transaktioner</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Dato</th>
                <th className="text-left py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Beskrivelse</th>
                <th className="text-left py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Kategori</th>
                <th className="text-right py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Beløb</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                { date: "20. feb", desc: "AWS Hosting", cat: "Software", amount: -2400, type: "expense" },
                { date: "18. feb", desc: "Kunde – Acme Corp", cat: "Omsætning", amount: 15000, type: "income" },
                { date: "15. feb", desc: "Lønkørsel", cat: "Lønninger", amount: -45000, type: "expense" },
                { date: "12. feb", desc: "Google Ads", cat: "Marketing", amount: -5600, type: "expense" },
                { date: "10. feb", desc: "Kunde – Nordic Tech", cat: "Omsætning", amount: 12000, type: "income" },
                { date: "8. feb", desc: "Figma Pro", cat: "Software", amount: -600, type: "expense" },
              ].map((tx, i) => (
                <tr key={i} className="hover:bg-secondary/50 transition-colors">
                  <td className="py-3 px-2 text-muted-foreground">{tx.date}</td>
                  <td className="py-3 px-2 text-foreground font-medium">{tx.desc}</td>
                  <td className="py-3 px-2">
                    <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                      {tx.cat}
                    </span>
                  </td>
                  <td className={`py-3 px-2 text-right font-medium font-display ${tx.type === "income" ? "text-primary" : "text-foreground"}`}>
                    {tx.type === "income" ? "+" : ""}{tx.amount.toLocaleString("da-DK")} DKK
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
};

export default Financials;
