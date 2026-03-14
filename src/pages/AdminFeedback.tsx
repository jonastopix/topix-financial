import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bug, Lightbulb, MessageSquare, CheckCircle2, Clock, AlertCircle, ImageIcon, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const categoryConfig: Record<string, { label: string; icon: typeof Bug; color: string }> = {
  bug: { label: "Bug", icon: Bug, color: "text-destructive" },
  suggestion: { label: "Forslag", icon: Lightbulb, color: "text-amber-500" },
  other: { label: "Andet", icon: MessageSquare, color: "text-primary" },
};

const statusConfig: Record<string, { label: string; icon: typeof Clock; variant: "default" | "secondary" | "outline" }> = {
  new: { label: "Ny", icon: AlertCircle, variant: "default" },
  acknowledged: { label: "Set", icon: Clock, variant: "secondary" },
  resolved: { label: "Løst", icon: CheckCircle2, variant: "outline" },
};

const ScreenshotImage = ({ path }: { path: string }) => {
  const { data: url } = useQuery({
    queryKey: ["feedback-screenshot", path],
    queryFn: async () => {
      const { data } = await supabase.storage
        .from("feedback-screenshots")
        .createSignedUrl(path, 3600);
      return data?.signedUrl || null;
    },
  });
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      <img
        src={url}
        alt="Feedback screenshot"
        className="rounded-lg border border-border max-h-48 object-contain w-full bg-muted/30"
      />
    </a>
  );
};

const FeedbackTable = ({
  items,
  onOpenDetail,
  onStatusChange,
  highlightId,
  compact = false,
}: {
  items: any[];
  onOpenDetail: (item: any) => void;
  onStatusChange: (item: any, status: string) => void;
  highlightId?: string | null;
  compact?: boolean;
}) => {
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Kategori</TableHead>
            <TableHead>Titel</TableHead>
            <TableHead>Virksomhed</TableHead>
            <TableHead>Bruger</TableHead>
            <TableHead className="w-[100px]">Dato</TableHead>
            <TableHead className="w-[100px]">Status</TableHead>
            <TableHead className="w-[80px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item: any) => {
            const cat = categoryConfig[item.category] || categoryConfig.other;
            const st = statusConfig[item.status] || statusConfig.new;
            const CatIcon = cat.icon;
            return (
              <TableRow
                key={item.id}
                id={`feedback-${item.id}`}
                className={`cursor-pointer transition-colors ${highlightId === item.id ? "bg-primary/10 ring-1 ring-primary/30" : ""}`}
                onClick={() => onOpenDetail(item)}
              >
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <CatIcon className={`h-4 w-4 ${cat.color}`} />
                    <span className="text-xs">{cat.label}</span>
                  </div>
                </TableCell>
                <TableCell className="font-medium max-w-[250px]">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate">{item.title}</span>
                    {item.screenshot_path && (
                      <ImageIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {item.companies?.name || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {item.profile?.full_name || item.profile?.email || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {formatDate(item.created_at)}
                </TableCell>
                <TableCell>
                  <Badge variant={st.variant}>{st.label}</Badge>
                </TableCell>
                <TableCell>
                  <Select
                    value={item.status}
                    onValueChange={(v) => onStatusChange(item, v)}
                  >
                    <SelectTrigger
                      className="h-7 text-xs w-[80px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">Ny</SelectItem>
                      <SelectItem value="acknowledged">Set</SelectItem>
                      <SelectItem value="resolved">Løst</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

const AdminFeedback = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [detailItem, setDetailItem] = useState<any>(null);
  const [adminNote, setAdminNote] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [resolvedExpanded, setResolvedExpanded] = useState(false);
  const highlightId = searchParams.get("feedbackId");

  const { data: feedbackItems = [], isLoading } = useQuery({
    queryKey: ["admin-feedback", filterCategory],
    queryFn: async () => {
      let query = supabase
        .from("feedback")
        .select("*, companies(name)")
        .order("created_at", { ascending: false });

      if (filterCategory !== "all") query = query.eq("category", filterCategory);

      const { data, error } = await query;
      if (error) throw error;

      const userIds = [...new Set((data || []).map((d: any) => d.user_id))];
      let profileMap: Record<string, { full_name: string; email: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", userIds);
        for (const p of profiles || []) {
          profileMap[p.user_id] = { full_name: p.full_name, email: p.email };
        }
      }

      return (data || []).map((item: any) => ({
        ...item,
        profile: profileMap[item.user_id] || null,
      }));
    },
  });

  const activeItems = useMemo(() => feedbackItems.filter((i: any) => i.status !== "resolved"), [feedbackItems]);
  const resolvedItems = useMemo(() => feedbackItems.filter((i: any) => i.status === "resolved"), [feedbackItems]);

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, admin_note, resolved_at }: { id: string; status: string; admin_note?: string; resolved_at?: string | null }) => {
      const updates: any = { status };
      if (admin_note !== undefined) updates.admin_note = admin_note;
      if (resolved_at !== undefined) updates.resolved_at = resolved_at;
      const { error } = await supabase.from("feedback").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-feedback"] });
      queryClient.invalidateQueries({ queryKey: ["feedback-count"] });
      toast({ title: "Feedback opdateret" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("feedback").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-feedback"] });
      queryClient.invalidateQueries({ queryKey: ["feedback-count"] });
      toast({ title: "Feedback slettet" });
      setDetailItem(null);
      setDeleteTarget(null);
    },
  });

  const handleStatusChange = (item: any, newStatus: string) => {
    updateMutation.mutate({
      id: item.id,
      status: newStatus,
      resolved_at: newStatus === "resolved" ? new Date().toISOString() : null,
    });
  };

  const handleSaveNote = () => {
    if (!detailItem) return;
    updateMutation.mutate({
      id: detailItem.id,
      status: detailItem.status,
      admin_note: adminNote,
    });
    setDetailItem(null);
  };

  const openDetail = (item: any) => {
    setDetailItem(item);
    setAdminNote(item.admin_note || "");
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Feedback</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overblik over feedback fra virksomheder
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Kategori" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle kategorier</SelectItem>
              <SelectItem value="bug">Bug</SelectItem>
              <SelectItem value="suggestion">Forslag</SelectItem>
              <SelectItem value="other">Andet</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Loading */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : feedbackItems.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            Ingen feedback fundet
          </div>
        ) : (
          <>
            {/* Active section */}
            {activeItems.length > 0 ? (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  Aktiv ({activeItems.length})
                </h2>
                <FeedbackTable
                  items={activeItems}
                  onOpenDetail={openDetail}
                  onStatusChange={handleStatusChange}
                />
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Ingen aktiv feedback
              </div>
            )}

            {/* Resolved section */}
            {resolvedItems.length > 0 && (
              <div className="space-y-2">
                <button
                  onClick={() => setResolvedExpanded(!resolvedExpanded)}
                  className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
                >
                  {resolvedExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Løst ({resolvedItems.length})
                </button>
                {resolvedExpanded && (
                  <FeedbackTable
                    items={resolvedItems}
                    onOpenDetail={openDetail}
                    onStatusChange={handleStatusChange}
                    compact
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!detailItem} onOpenChange={(open) => !open && setDetailItem(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailItem?.title}</DialogTitle>
          </DialogHeader>
          {detailItem && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {(() => {
                  const cat = categoryConfig[detailItem.category] || categoryConfig.other;
                  const CatIcon = cat.icon;
                  return (
                    <>
                      <CatIcon className={`h-4 w-4 ${cat.color}`} />
                      <span>{cat.label}</span>
                      <span>·</span>
                    </>
                  );
                })()}
                <span>{detailItem.companies?.name || "—"}</span>
                <span>·</span>
                <span>{formatDate(detailItem.created_at)}</span>
              </div>

              {detailItem.description && (
                <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/50 rounded-lg p-3">
                  {detailItem.description}
                </p>
              )}

              {detailItem.screenshot_path && (
                <ScreenshotImage path={detailItem.screenshot_path} />
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Intern note</label>
                <Textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Tilføj en intern note…"
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteTarget(detailItem)}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Slet
                </Button>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setDetailItem(null)}>
                    Luk
                  </Button>
                  <Button onClick={handleSaveNote}>Gem note</Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slet feedback?</AlertDialogTitle>
            <AlertDialogDescription>
              Er du sikker på at du vil slette "{deleteTarget?.title}"? Handlingen kan ikke fortrydes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annullér</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Slet
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default AdminFeedback;
