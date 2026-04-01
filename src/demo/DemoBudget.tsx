import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">Budget vs. Realiseret</h1>

      <Card className="bg-card border-border overflow-x-auto">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Q4 2025</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Måned</TableHead>
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
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
