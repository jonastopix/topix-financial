import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Users, Plus, CheckCircle2, Clock, Calendar,
  ChevronDown, ChevronUp, ArrowUpRight, Loader2, X,
} from "lucide-react";

const HANDOUT_MODULES = [
  { key: "overordnet", label: "Intro & Målsætning", day: 1 },
  { key: "bogholderi", label: "Bogholderi & Økonomi", day: 3 },
  { key: "administration", label: "Administration & Kundeservice", day: 5 },
  { key: "salg", label: "Salg", day: 7 },
  { key: "marketing", label: "Marketing", day: 9 },
];

function getDayNumber(startDate: string) {
  return Math.min(
    Math.max(
      Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000) + 1,
      1
    ),
    10
  );
}

export default function AdminLegat() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    company_name: "",
    start_date: new Date().toISOString().split("T")[0],
    notes: "",
  });
  const [upgradeForm, setUpgradeForm] = useState<Record<string, any>>({});

  const { data: enrollments = [], isLoading } = useQuery({
    queryKey: ["admin-legat-enrollments"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("legat_enrollments")
        .select(`
          id, user_id, company_id, start_date, status,
          momentumkald_booked, notes, created_at, upgraded_at,
          companies(name),
          profiles:user_id(full_name, email)
        `)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: handoutProgress = {} } = useQuery({
    queryKey: ["admin-legat-handout-progress"],
    queryFn: async () => {
      if (!enrollments.length) return {};
      const userIds = enrollments.map((e: any) => e.user_id);
      const { data } = await supabase
        .from("handouts")
        .select("user_id, module, status")
        .in("user_id", userIds);
      const map: Record<string, Record<string, string>> = {};
      for (const h of data || []) {
        if (!map[h.user_id]) map[h.user_id] = {};
        map[h.user_id][h.module] = h.status;
      }
      return map;
    },
    enabled: enrollments.length > 0,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("create-legat-enrollment", {
        body: form,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success(`Legatforløb oprettet for ${form.full_name}`);
      queryClient.invalidateQueries({ queryKey: ["admin-legat-enrollments"] });
      setShowCreate(false);
      setForm({ full_name: "", email: "", company_name: "", start_date: new Date().toISOString().split("T")[0], notes: "" });
    },
    onError: (err: any) => {
      toast.error(`Fejl: ${err.message}`);
    },
  });

  const upgradeMutation = useMutation({
    mutationFn: async ({ userId, uf }: { userId: string; uf: { company_name: string; cvr_number: string; industry_label: string } }) => {
      const { data, error } = await supabase.functions.invoke("upgrade-legat-to-member", {
        body: { user_id: userId, ...uf },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Legatmodtager opgraderet til member");
      queryClient.invalidateQueries({ queryKey: ["admin-legat-enrollments"] });
      setExpandedId(null);
    },
    onError: (err: any) => {
      toast.error(`Fejl: ${err.message}`);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (enrollmentId: string) => {
      const { error } = await (supabase as any)
        .from("legat_enrollments")
        .update({ status: "cancelled" })
        .eq("id", enrollmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Forløb annulleret");
      queryClient.invalidateQueries({ queryKey: ["admin-legat-enrollments"] });
    },
  });

  const activeEnrollments = enrollments.filter((e: any) => e.status === "active");
  const pastEnrollments = enrollments.filter((e: any) => e.status !== "active");

  const renderEnrollmentCard = (e: any) => {
    const day = e.status === "active" ? getDayNumber(e.start_date) : null;
    const progress = handoutProgress[e.user_id] || {};
    const completedCount = HANDOUT_MODULES.filter(m => progress[m.key] === "completed").length;
    const isExpanded = expandedId === e.id;
    const uf = upgradeForm[e.id] || { company_name: e.companies?.name || "", cvr_number: "", industry_label: "" };

    return (
      <div key={e.id} className="rounded-xl border border-border bg-card overflow-hidden">
        <button
          className="w-full flex items-center gap-3 p-4 text-left hover:bg-secondary/30 transition-colors"
          onClick={() => setExpandedId(isExpanded ? null : e.id)}
        >
          <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
            {(e.profiles?.full_name || "?").slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{e.profiles?.full_name || "Ukendt"}</p>
            <p className="text-xs text-muted-foreground truncate">{e.profiles?.email || ""} · {e.companies?.name || ""}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {e.status === "active" && (
              <>
                <div className="text-right">
                  <p className="text-xs font-medium">Dag {day}/10</p>
                  <p className="text-[10px] text-muted-foreground">{completedCount}/5 handouts</p>
                </div>
                <div className="h-8 w-8 rounded-full border-2 border-primary flex items-center justify-center">
                  <span className="text-[10px] font-bold text-primary">{Math.round((completedCount / 5) * 100)}%</span>
                </div>
              </>
            )}
            {e.status === "upgraded" && (
              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Member</span>
            )}
            {e.status === "cancelled" && (
              <span className="text-xs font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">Annulleret</span>
            )}
            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </button>

        {isExpanded && (
          <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
            {/* Handout progress */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Handout progress</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {HANDOUT_MODULES.map(m => {
                  const status = progress[m.key] || "not_started";
                  const dayNum = e.status === "active" ? getDayNumber(e.start_date) : 10;
                  const unlocked = dayNum >= m.day;
                  return (
                    <div key={m.key} className="flex items-center gap-2 text-xs py-1">
                      <div className={`h-2 w-2 rounded-full shrink-0 ${status === "completed" ? "bg-emerald-500" : status === "in_progress" ? "bg-amber-500" : unlocked ? "bg-secondary" : "bg-secondary/40"}`} />
                      <span className={`flex-1 ${status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                        {m.label}
                      </span>
                      <span className={`text-[10px] ${status === "completed" ? "text-emerald-600" : status === "in_progress" ? "text-amber-600" : "text-muted-foreground/60"}`}>
                        {status === "completed" ? "Færdig" : status === "in_progress" ? "I gang" : unlocked ? "Ikke startet" : `Dag ${m.day}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Start date + notes */}
            <div className="flex gap-6 text-xs">
              <div>
                <p className="text-muted-foreground mb-0.5">Startdato</p>
                <p className="font-medium">{new Date(e.start_date).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" })}</p>
              </div>
              {e.notes && (
                <div>
                  <p className="text-muted-foreground mb-0.5">Note</p>
                  <p className="font-medium">{e.notes}</p>
                </div>
              )}
            </div>

            {/* Upgrade form */}
            {e.status === "active" && (
              <div className="space-y-3 pt-2 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Opgrader til member</p>
                <div className="space-y-2">
                  <Input
                    placeholder="Virksomhedsnavn"
                    value={uf.company_name}
                    onChange={(e2) => setUpgradeForm(prev => ({ ...prev, [e.id]: { ...uf, company_name: e2.target.value } }))}
                    className="h-8 text-xs"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="CVR (valgfrit)"
                      value={uf.cvr_number}
                      onChange={(e2) => setUpgradeForm(prev => ({ ...prev, [e.id]: { ...uf, cvr_number: e2.target.value } }))}
                      className="h-8 text-xs"
                    />
                    <Input
                      placeholder="Branche (valgfrit)"
                      value={uf.industry_label}
                      onChange={(e2) => setUpgradeForm(prev => ({ ...prev, [e.id]: { ...uf, industry_label: e2.target.value } }))}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => upgradeMutation.mutate({ userId: e.user_id, uf })}
                    disabled={upgradeMutation.isPending || !uf.company_name}
                  >
                    {upgradeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                    Opgrader til member
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-xs text-destructive hover:text-destructive"
                    onClick={() => cancelMutation.mutate(e.id)}
                    disabled={cancelMutation.isPending}
                  >
                    <X className="h-3.5 w-3.5" />
                    Annullér
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Legat</h1>
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
              {activeEnrollments.length} aktive forløb
            </span>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nyt forløb
          </Button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Opret legatforløb</p>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input
                placeholder="Fulde navn *"
                value={form.full_name}
                onChange={(e) => setForm(p => ({ ...p, full_name: e.target.value }))}
                className="h-9 text-sm"
              />
              <Input
                placeholder="Email *"
                type="email"
                value={form.email}
                onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
                className="h-9 text-sm"
              />
              <Input
                placeholder="Virksomhed (valgfrit)"
                value={form.company_name}
                onChange={(e) => setForm(p => ({ ...p, company_name: e.target.value }))}
                className="h-9 text-sm"
              />
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Startdato</label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm(p => ({ ...p, start_date: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <Textarea
              placeholder="Note (valgfrit)"
              value={form.notes}
              onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
              className="text-sm min-h-[60px] resize-none"
            />
            <Button
              className="w-full"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !form.full_name || !form.email}
            >
              {createMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Opretter...</>
              ) : (
                <><Plus className="h-4 w-4 mr-2" />Opret og send velkomstmail</>
              )}
            </Button>
          </div>
        )}

        {/* Active enrollments */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-secondary/30 animate-pulse" />
            ))}
          </div>
        ) : activeEnrollments.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <Users className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Ingen aktive legatforløb</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Klik "Nyt forløb" for at oprette det første</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeEnrollments.map(renderEnrollmentCard)}
          </div>
        )}

        {/* Past enrollments */}
        {pastEnrollments.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Afsluttede forløb</p>
            {pastEnrollments.map(renderEnrollmentCard)}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
