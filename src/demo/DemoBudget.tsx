import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DEMO_BUDGET } from "./demoData";
import { formatDKK } from "@/lib/financialUtils";

function DiffCell({ actual, budget }: { actual: number; budget: number }) {
  const diff = actual - budget;
  const positive = diff >= 0;
  return (
    <TableCell className={`text-right text-xs font-medium ${positive ? "text-[hsl(var(--chart-positive))]" : "text-[hsl(var(--chart-negative))]"}`}>
      {positive ? "+" : ""}{formatDKK(diff)}
    </TableCell>
  );
}

export default function DemoBudget() {
  const totals = DEMO_BUDGET.reduce(
    (acc, r) => ({
      revBudget: acc.revBudget + r.revBudget,
      revActual: acc.revActual + r.revActual,
      costBudget: acc.costBudget + r.costBudget,
      costActual: acc.costActual + r.costActual,
      ebitdaBudget: acc.ebitdaBudget + r.ebitdaBudget,
      ebitdaActual: acc.ebitdaActual + r.ebitdaActual,
    }),
    { revBudget: 0, revActual: 0, costBudget: 0, costActual: 0, ebitdaBudget: 0, ebitdaActual: 0 }
  );

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-display font-bold text-foreground">Budget vs. Realiseret</h1>

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <p className="text-sm font-medium text-muted-foreground">Q4 2025</p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Måned</TableHead>
                <TableHead className="text-right">Oms. budget</TableHead>
                <TableHead className="text-right">Oms. realiseret</TableHead>
                <TableHead className="text-right">Afv.</TableHead>
                <TableHead className="text-right">Omk. budget</TableHead>
                <TableHead className="text-right">Omk. realiseret</TableHead>
                <TableHead className="text-right">Afv.</TableHead>
                <TableHead className="text-right">EBITDA budget</TableHead>
                <TableHead className="text-right">EBITDA realiseret</TableHead>
                <TableHead className="text-right">Afv.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DEMO_BUDGET.map((r) => (
                <TableRow key={r.month}>
                  <TableCell className="font-medium text-foreground">{r.month}</TableCell>
                  <TableCell className="text-right text-sm">{formatDKK(r.revBudget)}</TableCell>
                  <TableCell className="text-right text-sm">{formatDKK(r.revActual)}</TableCell>
                  <DiffCell actual={r.revActual} budget={r.revBudget} />
                  <TableCell className="text-right text-sm">{formatDKK(r.costBudget)}</TableCell>
                  <TableCell className="text-right text-sm">{formatDKK(r.costActual)}</TableCell>
                  <DiffCell actual={r.costBudget} budget={r.costActual} />
                  <TableCell className="text-right text-sm">{formatDKK(r.ebitdaBudget)}</TableCell>
                  <TableCell className="text-right text-sm">{formatDKK(r.ebitdaActual)}</TableCell>
                  <DiffCell actual={r.ebitdaActual} budget={r.ebitdaBudget} />
                </TableRow>
              ))}
              {/* Totals row */}
              <TableRow className="border-t-2 border-border font-semibold">
                <TableCell className="text-foreground">Total</TableCell>
                <TableCell className="text-right text-sm">{formatDKK(totals.revBudget)}</TableCell>
                <TableCell className="text-right text-sm">{formatDKK(totals.revActual)}</TableCell>
                <DiffCell actual={totals.revActual} budget={totals.revBudget} />
                <TableCell className="text-right text-sm">{formatDKK(totals.costBudget)}</TableCell>
                <TableCell className="text-right text-sm">{formatDKK(totals.costActual)}</TableCell>
                <DiffCell actual={totals.costBudget} budget={totals.costActual} />
                <TableCell className="text-right text-sm">{formatDKK(totals.ebitdaBudget)}</TableCell>
                <TableCell className="text-right text-sm">{formatDKK(totals.ebitdaActual)}</TableCell>
                <DiffCell actual={totals.ebitdaActual} budget={totals.ebitdaBudget} />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
