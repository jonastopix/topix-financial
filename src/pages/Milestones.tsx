import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import MilestonesList from "@/components/MilestonesList";
import { Target, Plus, Filter, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { MILESTONE_CATEGORIES, CATEGORY_OPTIONS, type MilestoneCategory } from "@/lib/milestoneCategories";
import { MILESTONE_SUGGESTIONS, type MilestoneSuggestion } from "@/lib/milestoneSuggestions";
import AdvisorCompanyPrompt from "@/components/AdvisorCompanyPrompt";

const Milestones = () => {
  const { user, companyId, isAdvisor: rawAdvisor, isDemoMode } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [milestoneStats, setMilestoneStats] = useState({ total: 0, done: 0, pct: 0 });
  const [refreshKey, setRefreshKey] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<MilestoneCategory | "all">("all");
  const [usedCategories, setUsedCategories] = useState<Set<string>>(new Set());

  // Create dialog state
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<MilestoneCategory>("other");
  const [deadline, setDeadline] = useState<Date | undefined>(undefined);
  const [baseline, setBaseline] = useState("");
  const [targetValue, setTargetValue] = useState<string>("");
  const [unit, setUnit] = useState<string>("");
  const [saving, setSaving] = useState(false);




  useEffect(() => {
    if (!user || !companyId) return;
    
    const load = async () => {
      const [convRes, msRes] = await Promise.all([
        supabase.from("conversations").select("id").eq("company_id", companyId).maybeSingle(),
        supabase.from("milestones").select("progress, category").eq("company_id", companyId),
      ]);
      setConversationId(convRes.data?.id || null);
      
      const all = msRes.data || [];
      const done = all.filter((m) => m.progress >= 100).length;
      const pct = all.length > 0 ? Math.round(all.reduce((s, m) => s + m.progress, 0) / all.length) : 0;
      setMilestoneStats({ total: all.length, done, pct });
      const cats = new Set(all.map((m) => m.category).filter(Boolean));
      setUsedCategories(cats as Set<string>);
    };
    load();
  }, [user, companyId, refreshKey]);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setBaseline("");
    setCategory("other");
    setDeadline(undefined);
    setTargetValue("");
    setUnit("");
  };

  const STARTER_PICKS: { title: string; cat: MilestoneCategory }[] = [
    { title: "Opnå positiv bundlinje", cat: "profit" },
    { title: "Nå 100 aktive kunder", cat: "kunder" },
    { title: "Reducér driftsomkostninger med 20%", cat: "profit" },
  ];

  const openWithSuggestion = (pick: { title: string; cat: MilestoneCategory }) => {
    const suggestion = MILESTONE_SUGGESTIONS[pick.cat]?.find((s) => s.title === pick.title);
    if (!suggestion) return;
    setTitle(suggestion.title);
    setDescription(suggestion.description);
    setCategory(pick.cat);
    setBaseline("");
    setDeadline(undefined);
    setOpen(true);
  };

  const handleCreate = async () => {
    if (isDemoMode) { const { blockIfDemo } = await import("@/lib/demoGuard"); blockIfDemo(true, "Oprettelse af milestones"); return; }
    if (!title.trim() || !user || !companyId) return;
    setSaving(true);
    const { error } = await supabase.from("milestones").insert({
      title: title.trim(),
      description: description.trim() || null,
      baseline: baseline.trim() || null,
      category,
      deadline: deadline ? deadline.toISOString().split("T")[0] : null,
      company_id: companyId,
      user_id: user.id,
      source: "manual",
      progress: 0,
      status: "active",
      target_value: targetValue ? Number(targetValue) : null,
      current_value: targetValue ? 0 : null,
      unit: unit.trim() || null,
    } as any);
    setSaving(false);
    if (error) {
      toast.error("Kunne ikke oprette milestone");
      return;
    }
    toast.success("Milestone oprettet");
    resetForm();
    setOpen(false);
    setRefreshKey((k) => k + 1);
  };

  if (isAdvisor && !companyId) {
    return (
      <AppLayout>
        <AdvisorCompanyPrompt />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
            Milestones
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sæt og følg dine vigtigste mål
          </p>
        </div>
        <Button onClick={() => setOpen(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Opret milestone
        </Button>
      </div>

      {milestoneStats.total === 0 ? (
        /* ── Empty state ── */
        <div className="flex flex-col items-center text-center py-16 animate-fade-in">
          <div className="p-5 rounded-2xl bg-primary/10 mb-6">
            <Target className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-xl font-display font-bold text-foreground mb-2">
            Sæt dit første mål
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">
            Milestones hjælper dig med at holde fokus på de vigtigste mål for din virksomhed.
            Start med et af forslagene nedenfor, eller opret dit eget.
          </p>
          <Link
            to="/handouts"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors mb-8"
          >
            <BookOpen className="h-4 w-4 text-primary" />
            Gå til Handouts — generer milestones automatisk
          </Link>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
            {STARTER_PICKS.map((pick) => {
              const cfg = MILESTONE_CATEGORIES[pick.cat];
              const Icon = cfg.icon;
              const suggestion = MILESTONE_SUGGESTIONS[pick.cat]?.find((s) => s.title === pick.title);
              if (!suggestion) return null;
              return (
                <button
                  key={pick.title}
                  onClick={() => openWithSuggestion(pick)}
                  className="glass-card rounded-xl p-5 text-left hover:ring-1 hover:ring-primary/30 transition-all group"
                >
                  <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium mb-3", cfg.badgeClass)}>
                    <Icon className="h-3 w-3" />
                    {cfg.label}
                  </div>
                  <h3 className="font-display font-semibold text-foreground text-sm mb-1.5 group-hover:text-primary transition-colors">
                    {suggestion.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {suggestion.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* ── Normal view ── */
        <>
          {/* Progress overview */}
          <div className="glass-card rounded-xl p-6 mb-6 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10">
                  <Target className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-foreground">Samlet fremgang</h3>
                  <p className="text-sm text-muted-foreground">{milestoneStats.pct}% gennemført</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-secondary text-muted-foreground">
                  {milestoneStats.total} i alt
                </span>
                {milestoneStats.done > 0 && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {milestoneStats.done} fuldført
                  </span>
                )}
                {milestoneStats.total - milestoneStats.done > 0 && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    {milestoneStats.total - milestoneStats.done} aktive
                  </span>
                )}
              </div>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary rounded-full transition-all duration-700" 
                style={{ width: `${milestoneStats.pct}%` }} 
              />
            </div>
          </div>

          {/* Category filter chips */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <button
              onClick={() => setCategoryFilter("all")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                categoryFilter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              Alle
            </button>
            {CATEGORY_OPTIONS.filter((opt) => usedCategories.has(opt.value)).map((opt) => {
              const cfg = MILESTONE_CATEGORIES[opt.value];
              const Icon = cfg.icon;
              const isActive = categoryFilter === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setCategoryFilter(isActive ? "all" : opt.value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                    isActive
                      ? cfg.badgeClass + " ring-1 ring-current/20"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {opt.label}
                </button>
              );
            })}
          </div>

          <MilestonesList userId={user?.id || null} companyId={companyId} conversationId={conversationId} refreshKey={refreshKey} categoryFilter={categoryFilter === "all" ? undefined : categoryFilter} />
        </>
      )}

      {/* Create Dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Opret ny milestone</DialogTitle>
            <DialogDescription>Definer dit mål og vælg en kategori.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Titel *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="F.eks. Nå 1M i omsætning"
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Beskrivelse</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Uddyb dit mål..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Kategori</label>
              <Select value={category} onValueChange={(v) => setCategory(v as MilestoneCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Suggestion chips – only when title is empty */}
            {!title.trim() && MILESTONE_SUGGESTIONS[category]?.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground block">Forslag</label>
                <div className="flex flex-wrap gap-1.5">
                  {MILESTONE_SUGGESTIONS[category].map((s) => (
                    <button
                      key={s.title}
                      type="button"
                      onClick={() => { setTitle(s.title); setDescription(s.description); if (s.baselineHint) setBaseline(""); }}
                      className="text-xs px-2.5 py-1 rounded-full bg-secondary text-foreground hover:bg-accent transition-colors text-left"
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Nuværende status / baseline</label>
              <input
                value={baseline}
                onChange={(e) => setBaseline(e.target.value)}
                placeholder={
                  MILESTONE_SUGGESTIONS[category]?.find((s) => s.title === title)?.baselineHint
                  || "F.eks. 800.000 kr. i omsætning"
                }
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            {/* Målbar milestone — valgfrit */}
            <div className="rounded-xl border border-border p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Gør den målbar <span className="text-muted-foreground/50 normal-case font-normal">(valgfri)</span>
                </label>
                <p className="text-[11px] text-muted-foreground mt-1">
                  F.eks. &quot;10 salgskald&quot; eller &quot;500.000 kr.&quot; i stedet for en procent-slider.
                </p>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">Mål</label>
                  <input
                    type="number"
                    min={0}
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                    placeholder="10"
                    className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">Enhed</label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="salgskald, timer, kr., kunder..."
                    className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
              {targetValue && unit && (
                <p className="text-[11px] text-primary">
                  Milestone viser: 0 / {targetValue} {unit}
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Deadline</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !deadline && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {deadline ? format(deadline, "d. MMM yyyy", { locale: da }) : "Vælg deadline"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={deadline} onSelect={setDeadline} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>Annuller</Button>
            <Button onClick={handleCreate} disabled={!title.trim() || saving}>
              {saving ? "Opretter..." : "Opret"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Milestones;
