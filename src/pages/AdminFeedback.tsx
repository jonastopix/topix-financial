import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
import { Bug, Lightbulb, MessageSquare, CheckCircle2, Clock, AlertCircle, ImageIcon, Trash2, ChevronDown, ChevronRight, Send, Loader2, Reply } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

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
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block">
      <img
        src={url}
        alt="Feedback screenshot"
        className="rounded-md border border-border max-h-24 max-w-[160px] object-cover bg-muted/30 hover:opacity-80 transition-opacity"
      />
    </a>
  );
};

const FeedbackTable = ({
  items,
  onOpenDetail,
  onStatusChange,
  highlightId,
  repliedIds,
  compact = false,
}: {
  items: any[];
  onOpenDetail: (item: any) => void;
  onStatusChange: (item: any, status: string) => void;
  highlightId?: string | null;
  repliedIds: Set<string>;
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
                    {repliedIds.has(item.id) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Reply className="h-3.5 w-3.5 text-primary shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>Besvaret via chat</TooltipContent>
                      </Tooltip>
                    )}
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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [detailItem, setDetailItem] = useState<any>(null);
  const [adminNote, setAdminNote] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [resolvedExpanded, setResolvedExpanded] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
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

  // Fetch feedback IDs that have been replied to via chat
  const { data: repliedIds } = useQuery({
    queryKey: ["feedback-replied-ids"],
    queryFn: async () => {
      const { data } = await supabase
        .from("messages")
        .select("context_id")
        .eq("context_type", "feedback")
        .not("context_id", "is", null);
      return new Set((data || []).map((m: any) => m.context_id));
    },
  });
  const repliedSet = repliedIds || new Set<string>();

  // Deep-link: auto-open feedback item from URL param
  useEffect(() => {
    if (!highlightId || feedbackItems.length === 0) return;
    const target = feedbackItems.find((i: any) => i.id === highlightId);
    if (target) {
      // If it's resolved, expand the resolved section
      if (target.status === "resolved") setResolvedExpanded(true);
      // Open detail dialog
      openDetail(target);
      // Scroll to row
      setTimeout(() => {
        document.getElementById(`feedback-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      // Clear param so it doesn't re-trigger
      setSearchParams({}, { replace: true });
    }
  }, [highlightId, feedbackItems]);

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
      toast.success("Feedback opdateret");
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
      toast.success("Feedback slettet");
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
    setReplyText("");
  };

  const handleSendReply = async () => {
    if (!detailItem || !replyText.trim() || !user) return;
    setReplySending(true);
    try {
      // Find the user's conversation
      const { data: conv } = await supabase
        .from("conversations")
        .select("id")
        .eq("member_id", detailItem.user_id)
        .limit(1)
        .maybeSingle();

      if (!conv) {
        // Try via company_id
        const { data: companyConv } = await supabase
          .from("conversations")
          .select("id")
          .eq("company_id", detailItem.company_id)
          .limit(1)
          .maybeSingle();
        if (!companyConv) {
          toast.error("Ingen samtale fundet", { description: "Brugeren har ikke en aktiv samtale." });
          setReplySending(false);
          return;
        }
        var conversationId = companyConv.id;
      } else {
        var conversationId = conv.id;
      }

      const categoryLabel = categoryConfig[detailItem.category]?.label || "Feedback";
      const contextMessage = `💬 **Svar på ${categoryLabel.toLowerCase()}: "${detailItem.title}"**\n\n${replyText.trim()}`;

      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: contextMessage,
        message_type: "user",
        context_type: "feedback",
        context_id: detailItem.id,
      });

      if (error) throw error;

      // Auto-acknowledge if still "new"
      if (detailItem.status === "new") {
        updateMutation.mutate({ id: detailItem.id, status: "acknowledged" });
      }

      toast.success("Svar sendt", { description: "Beskeden er sendt i brugerens samtale." });
      setReplyText("");
    } catch (err) {
      console.error("Reply error:", err);
      toast({ title: "Fejl", description: "Kunne ikke sende svaret. Prøv igen.", variant: "destructive" });
    } finally {
      setReplySending(false);
    }
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
                  highlightId={highlightId}
                  repliedIds={repliedSet}
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
                    highlightId={highlightId}
                    repliedIds={repliedSet}
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
            <DialogTitle className="pr-6">{detailItem?.title}</DialogTitle>
          </DialogHeader>
          {detailItem && (
            <div className="space-y-3">
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
                <span>{detailItem.profile?.full_name || "—"}</span>
                <span>·</span>
                <span>{detailItem.companies?.name || "—"}</span>
                <span>·</span>
                <span>{formatDate(detailItem.created_at)}</span>
              </div>

              {/* Description + screenshot inline */}
              <div className="flex gap-3">
                {detailItem.description && (
                  <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/50 rounded-lg p-2.5 flex-1 min-w-0">
                    {detailItem.description}
                  </p>
                )}
                {detailItem.screenshot_path && (
                  <div className="shrink-0">
                    <ScreenshotImage path={detailItem.screenshot_path} />
                  </div>
                )}
              </div>

              {/* Reply to user */}
              {detailItem.company_id && (
                <div className="space-y-1.5 border-t border-border pt-2.5">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
                    <Send className="h-3 w-3" />
                    Svar til bruger
                  </label>
                  <div className="flex gap-2">
                    <Textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Skriv et svar der sendes i brugerens samtale…"
                      rows={1}
                      className="min-h-[36px] text-sm resize-none"
                    />
                    <Button
                      size="sm"
                      className="shrink-0 self-end"
                      onClick={handleSendReply}
                      disabled={!replyText.trim() || replySending}
                    >
                      {replySending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-1.5 border-t border-border pt-2.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Intern note</label>
                <Textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Tilføj en intern note…"
                  rows={2}
                  className="min-h-[36px] text-sm resize-y"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
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
                  <Button variant="ghost" size="sm" onClick={() => setDetailItem(null)}>
                    Luk
                  </Button>
                  <Button size="sm" onClick={handleSaveNote}>Gem note</Button>
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
