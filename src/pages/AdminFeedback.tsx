import { useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bug, Lightbulb, MessageSquare, CheckCircle2, Clock, AlertCircle } from "lucide-react";
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

const AdminFeedback = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [detailItem, setDetailItem] = useState<any>(null);
  const [adminNote, setAdminNote] = useState("");

  const { data: feedbackItems = [], isLoading } = useQuery({
    queryKey: ["admin-feedback", filterCategory, filterStatus],
    queryFn: async () => {
      let query = supabase
        .from("feedback")
        .select("*, companies(name)")
        .order("created_at", { ascending: false });

      if (filterCategory !== "all") query = query.eq("category", filterCategory);
      if (filterStatus !== "all") query = query.eq("status", filterStatus);

      const { data, error } = await query;
      if (error) throw error;

      // Fetch profile names for user_ids
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

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle status</SelectItem>
              <SelectItem value="new">Ny</SelectItem>
              <SelectItem value="acknowledged">Set</SelectItem>
              <SelectItem value="resolved">Løst</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : feedbackItems.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            Ingen feedback fundet
          </div>
        ) : (
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
                {feedbackItems.map((item: any) => {
                  const cat = categoryConfig[item.category] || categoryConfig.other;
                  const st = statusConfig[item.status] || statusConfig.new;
                  const CatIcon = cat.icon;
                  return (
                    <TableRow key={item.id} className="cursor-pointer" onClick={() => openDetail(item)}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <CatIcon className={`h-4 w-4 ${cat.color}`} />
                          <span className="text-xs">{cat.label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium max-w-[250px] truncate">
                        {item.title}
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
                          onValueChange={(v) => {
                            // Prevent row click
                            handleStatusChange(item, v);
                          }}
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
                <span>{detailItem.companies?.name}</span>
                <span>·</span>
                <span>{formatDate(detailItem.created_at)}</span>
              </div>

              {detailItem.description && (
                <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/50 rounded-lg p-3">
                  {detailItem.description}
                </p>
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

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setDetailItem(null)}>
                  Luk
                </Button>
                <Button onClick={handleSaveNote}>Gem note</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default AdminFeedback;
