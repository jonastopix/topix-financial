const BudgetOverview = () => {
  const categories = [
    { name: "Lønninger", budgeted: 45000, spent: 45000, pct: 100 },
    { name: "Marketing", budgeted: 15000, spent: 11200, pct: 75 },
    { name: "Software & Tools", budgeted: 8000, spent: 6400, pct: 80 },
    { name: "Kontor & Drift", budgeted: 5000, spent: 3800, pct: 76 },
    { name: "Juridisk & Revision", budgeted: 4000, spent: 1200, pct: 30 },
  ];

  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-foreground">Budget – Februar</h3>
        <span className="text-xs font-medium text-primary">67% brugt</span>
      </div>
      <div className="space-y-4">
        {categories.map((cat) => (
          <div key={cat.name}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm text-foreground">{cat.name}</span>
              <span className="text-xs text-muted-foreground">
                {(cat.spent / 1000).toFixed(1)}k / {(cat.budgeted / 1000).toFixed(1)}k DKK
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  cat.pct >= 90
                    ? "bg-destructive"
                    : cat.pct >= 70
                    ? "bg-chart-warning"
                    : "bg-primary"
                }`}
                style={{ width: `${cat.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BudgetOverview;
