import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw,
  Search, ChevronDown, ChevronUp, Mail, FlaskConical, Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { da } from "date-fns/locale";

interface LogEntry {
  id: string;
  message_id: string | null;
  template_name: string;
  recipient_email: string;
  subject: string | null;
  status: string;
  error_message: string | null;
  is_test: boolean;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  sent:         { label: "Sendt",        icon: CheckCircle2,  className: "text-[hsl(var(--chart-positive))] bg-[hsl(var(--chart-positive)/0.1)]" },
  pending:      { label: "Afventer",     icon: Clock,         className: "text-chart-warning bg-chart-warning/10" },
  failed:       { label: "Fejlet",       icon: XCircle,       className: "text-destructive bg-destructive/10" },
  dlq:          { label: "DLQ",          icon: Trash2,        className: "text-destructive bg-destructive/10" },
  rate_limited: { label: "Rate-limited", icon: AlertTriangle, className: "text-chart-warning bg-chart-warning/10" },
  suppressed:   { label: "Undertrykket", icon: AlertTriangle, className: "text-muted-foreground bg-muted" },
  bounced:      { label: "Bounce",       icon: XCircle,       className: "text-destructive bg-destructive/10" },
  complained:   { label: "Klage",        icon: XCircle,       className: "text-destructive bg-destructive/10" },
};

const TEMPLATE_LABELS: Record<string, string> = {
  "report-reminder":  "Rapport-påmindelse",
  "pulse-reminder":   "Pulse-påmindelse",
  "monthly-digest":   "Månedlig digest",
  "invitation":       "Invitation",
  "signup":           "Signup-bekræftelse",
  "recovery":         "Password reset",
  "magiclink":        "Magic link",
  "invite":           "Auth invitation",
  "email_change":     "Email-ændring",
  "reauthentication": "Re-auth kode",
  "template-test":    "Skabelon-test",
};

function templateLabel(name: string) {
  if (TEMPLATE_LABELS[name]) return TEMPLATE_LABELS[name];
  if (name.startsWith("notification-")) {
    const type = name.replace("notification-", "");
    const map: Record<string, string> = {
      advisor_replied:        "Notif: Ny besked",
      report_review_ready:    "Notif: Rapport klar",
      report_error:           "Notif: Rapport fejl",
      report_committed:       "Notif: Rapport godkendt",
      milestone_completed:    "Notif: Milestone fuldført",
      weekly_focus_ready:     "Notif: Ugens fokus",
      pulse_checkin_received: "Notif: Pulse modtaget",
    };
    return map[type] || `Notifikation: ${type}`;
  }
  return name;
}

const PAGE_SIZE = 100;
const ALL_STATUSES = ["sent", "pending", "failed", "dlq", "rate_limited", "suppressed", "bounced", "complained"];

export default function AdminEmailLog() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-email-log", statusFilter, typeFilter, page],
    queryFn: async () => {
      let query = (supabase as any)
        .from("email_send_log")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (typeFilter !== "all") query = query.eq("template_name", typeFilter);

      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data || []) as LogEntry[], total: count || 0 };
    },
    staleTime: 30_000,
  });

  const rows = data?.rows || [];
  const total = data?.total || 0;

  const filtered = search.trim()
    ? rows.filter(r =>
        r.recipient_email.toLowerCase().includes(search.toLowerCase()) ||
        (r.subject || "").toLowerCase().includes(search.toLowerCase()) ||
        (r.message_id || "").toLowerCase().includes(search.toLowerCase())
      )
    : rows;

  const uniqueTypes = [...new Set(rows.map(r => r.template_name))].sort();

  const countByStatus = (s: string) => rows.filter(r => r.status === s).length;
  const failedCount = rows.filter(r => ["failed", "dlq", "bounced", "complained"].includes(r.status)).length;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Email-log</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {total.toLocaleString("da-DK")} afsendelser registreret
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Opdater
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border bg-card p-4 text-center">
            <p className="text-2xl font-bold text-[hsl(var(--chart-positive))]">{countByStatus("sent")}</p>
            <p className="text-xs text-muted-foreground mt-1">Sendt</p>
          </div>
          <div className="rounded-lg border bg-card p-4 text-center">
            <p className="text-2xl font-bold text-chart-warning">{countByStatus("pending")}</p>
            <p className="text-xs text-muted-foreground mt-1">Afventer</p>
          </div>
          <div className="rounded-lg border bg-card p-4 text-center">
            <p className="text-2xl font-bold text-destructive">{failedCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Fejlet / DLQ</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Søg modtager, emne eller message-id…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              className="pl-9 h-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle statuser</SelectItem>
              {ALL_STATUSES.map(s => (
                <SelectItem key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Mail-type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle mail-typer</SelectItem>
              {uniqueTypes.map(t => (
                <SelectItem key={t} value={t}>{templateLabel(t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="rounded-lg border bg-card overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Mail className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">Ingen afsendelser fundet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tidspunkt</TableHead>
                  <TableHead>Modtager</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Emne</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(row => {
                  const sc = STATUS_CONFIG[row.status] || { label: row.status, icon: Clock, className: "text-muted-foreground bg-muted" };
                  const Icon = sc.icon;
                  const isExpanded = expandedId === row.id;

                  return (
                    <React.Fragment key={row.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setExpandedId(isExpanded ? null : row.id)}
                      >
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(row.created_at), "d. MMM HH:mm:ss", { locale: da })}
                        </TableCell>
                        <TableCell className="font-mono text-xs max-w-[200px] truncate">
                          <div className="flex items-center gap-1.5">
                            {row.is_test && <FlaskConical className="h-3.5 w-3.5 text-chart-warning shrink-0" />}
                            {row.recipient_email}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {templateLabel(row.template_name)}
                        </TableCell>
                        <TableCell className="text-xs max-w-[180px] truncate">
                          {row.subject || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`gap-1 text-xs ${sc.className}`}>
                            <Icon className="h-3 w-3" />
                            {sc.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {isExpanded
                            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                      </TableRow>

                      {isExpanded && (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={6}>
                            <div className="text-xs space-y-1.5 py-2 px-1">
                              <p><span className="font-medium text-muted-foreground">Message-ID:</span> {row.message_id || "—"}</p>
                              <p><span className="font-medium text-muted-foreground">Tidspunkt:</span> {format(new Date(row.created_at), "d. MMMM yyyy HH:mm:ss", { locale: da })}</p>
                              <p><span className="font-medium text-muted-foreground">Emne:</span> {row.subject || "—"}</p>
                              {row.error_message && (
                                <p><span className="font-medium text-destructive">Fejl:</span> {row.error_message}</p>
                              )}
                              {row.metadata && Object.keys(row.metadata).length > 0 && (
                                <p><span className="font-medium text-muted-foreground">Metadata:</span> {JSON.stringify(row.metadata)}</p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Side {page + 1} af {Math.ceil(total / PAGE_SIZE)}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                Forrige
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total}>
                Næste
              </Button>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}
