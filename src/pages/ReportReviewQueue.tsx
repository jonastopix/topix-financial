import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { da } from "date-fns/locale";

type Report = {
  id: string;
  file_name: string;
  company_name: string | null;
  report_period: string | null;
  report_type: string;
  uploaded_at: string;
  status: string;
  extraction_method: string | null;
  validation_status: string | null;
  ai_analysis: unknown;
  normalized_data: unknown;
  raw_extracted_data: unknown;
  manual_report_period_label: string | null;
  manual_report_period_key: string | null;
  manual_override_status: string | null;
};

type Flag = {
  label: string;
  color: string; // tailwind badge class
};

function getFlags(r: Report): Flag[] {
  const flags: Flag[] = [];
  const nd = r.normalized_data as Record<string, unknown> | null;
  const red = r.raw_extracted_data as Record<string, unknown> | null;

  if (r.manual_override_status === "applied") flags.push({ label: "Manual override", color: "bg-indigo-500 text-white" });
  if (r.status === "needs_review") flags.push({ label: "Needs review", color: "bg-yellow-500 text-white" });
  if (r.validation_status && r.validation_status !== "PASS") flags.push({ label: "Validation fail", color: "bg-destructive text-destructive-foreground" });
  if (r.normalized_data == null && r.status !== "processing") flags.push({ label: "No canonical", color: "bg-orange-500 text-white" });

  const aiEligible = nd?.ai_eligible as boolean | undefined;
  if (aiEligible === false) flags.push({ label: "AI blocked", color: "bg-red-700 text-white" });
  if (aiEligible === true && r.ai_analysis == null) flags.push({ label: "AI missing", color: "bg-amber-600 text-white" });

  if (r.extraction_method === "ai_extraction") flags.push({ label: "AI extraction", color: "bg-blue-500 text-white" });

  const routingTrace = red?.routing_trace as Record<string, unknown> | undefined;
  const branch = routingTrace?.branch as string | undefined;
  if (branch === "structural_fail") flags.push({ label: "Structural fail", color: "bg-red-600 text-white" });
  if (branch === "no_match") flags.push({ label: "No match", color: "bg-red-500 text-white" });

  const correctionLog = nd?.correction_log as unknown[] | undefined;
  if (correctionLog && correctionLog.length > 0) flags.push({ label: "Has corrections", color: "bg-purple-500 text-white" });

  return flags;
}

function hasAnyFlag(r: Report): boolean {
  return getFlags(r).length > 0;
}

export default function ReportReviewQueue() {
  const [filterMethod, setFilterMethod] = useState("all");
  const [filterValidation, setFilterValidation] = useState("all");
  const [filterAiEligible, setFilterAiEligible] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["review-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_reports")
        .select("id, file_name, company_name, report_period, report_type, uploaded_at, status, extraction_method, validation_status, ai_analysis, normalized_data, raw_extracted_data")
        .is("deleted_at", null)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data as Report[];
    },
  });

  const queueReports = useMemo(() => {
    let list = reports.filter(hasAnyFlag);

    if (filterMethod !== "all") list = list.filter(r => r.extraction_method === filterMethod);
    if (filterValidation !== "all") list = list.filter(r => r.validation_status === filterValidation);
    if (filterStatus !== "all") list = list.filter(r => r.status === filterStatus);
    if (filterAiEligible !== "all") {
      list = list.filter(r => {
        const nd = r.normalized_data as Record<string, unknown> | null;
        const v = nd?.ai_eligible;
        if (filterAiEligible === "true") return v === true;
        if (filterAiEligible === "false") return v === false;
        return true;
      });
    }

    return list;
  }, [reports, filterMethod, filterValidation, filterStatus, filterAiEligible]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Review Queue</h1>
          <p className="text-muted-foreground text-sm mt-1">{queueReports.length} rapporter kræver opmærksomhed</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle status</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="processed">Processed</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="needs_review">Needs review</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterMethod} onValueChange={setFilterMethod}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Extraction method" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle metoder</SelectItem>
              <SelectItem value="deterministic_template">Deterministic</SelectItem>
              <SelectItem value="ai_extraction">AI extraction</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterValidation} onValueChange={setFilterValidation}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Validation" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle validation</SelectItem>
              <SelectItem value="PASS">PASS</SelectItem>
              <SelectItem value="FAIL">FAIL</SelectItem>
              <SelectItem value="UNSURE">UNSURE</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterAiEligible} onValueChange={setFilterAiEligible}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="AI eligible" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle AI</SelectItem>
              <SelectItem value="true">AI eligible</SelectItem>
              <SelectItem value="false">AI blocked</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <p className="text-muted-foreground">Indlæser…</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fil</TableHead>
                <TableHead>Virksomhed</TableHead>
                <TableHead>Periode</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Uploadet</TableHead>
                <TableHead>Pipeline</TableHead>
                <TableHead>Issues</TableHead>
                <TableHead>Flags</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queueReports.map(r => {
                const flags = getFlags(r);
                const nd = r.normalized_data as Record<string, unknown> | null;
                const templateId = nd?.templateId as string | undefined;
                const statementType = nd?.statementType as string | undefined;
                const aiEligible = nd?.ai_eligible;

                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs max-w-[200px] truncate" title={r.file_name}>{r.file_name}</TableCell>
                    <TableCell className="text-sm">{r.company_name || "–"}</TableCell>
                    <TableCell className="text-sm">{r.report_period || "–"}</TableCell>
                    <TableCell className="text-xs space-y-0.5">
                      <div>{r.report_type}</div>
                      {statementType && <div className="text-muted-foreground">{statementType}</div>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(r.uploaded_at), "d. MMM yyyy HH:mm", { locale: da })}
                    </TableCell>
                    <TableCell className="text-xs space-y-0.5">
                      <div>Status: <span className="font-medium">{r.status}</span></div>
                      <div>Method: <span className="font-medium">{r.extraction_method || "–"}</span></div>
                      {templateId && <div>Template: <span className="font-medium font-mono">{templateId}</span></div>}
                      <div>Validation: <span className="font-medium">{r.validation_status || "–"}</span></div>
                      <div>AI: <span className="font-medium">{aiEligible === true ? "✓" : aiEligible === false ? "✗" : "–"}</span> | Analysis: <span className="font-medium">{r.ai_analysis ? "✓" : "✗"}</span></div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">{flags.length}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {flags.map((f, i) => (
                          <span key={i} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${f.color}`}>
                            {f.label}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" asChild>
                        <Link to={`/admin/report-debug/${r.id}`}><ExternalLink className="h-4 w-4" /></Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {queueReports.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    Ingen rapporter i review queue
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </AppLayout>
  );
}
