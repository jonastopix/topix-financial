import { useState, useEffect, useCallback } from "react";
import { Bell, FileText, ClipboardList, MessageCircle, ExternalLink, MessageSquareDashed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { openReportFile } from "@/lib/reportFileAccess";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  company_id: string;
  member_id: string;
  reference_id: string | null;
  reference_type: string | null;
  read_at: string | null;
  created_at: string;
}

const AdvisorNotifications = () => {
  const { user, isAdvisor } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!user || !isAdvisor) return;
    const { data } = await supabase
      .from("advisor_notifications" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifications((data as any as Notification[]) || []);
  }, [user, isAdvisor]);

  useEffect(() => {
    loadNotifications();

    if (!user || !isAdvisor) return;
    const channel = supabase
      .channel("advisor-notifications-bell")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "advisor_notifications" },
        () => loadNotifications()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, isAdvisor, loadNotifications]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const markAsRead = async (id: string) => {
    await supabase
      .from("advisor_notifications" as any)
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    );
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase
      .from("advisor_notifications" as any)
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds);
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
    );
  };

  const handleClick = async (n: Notification) => {
    // Fire-and-forget: don't block navigation
    if (!n.read_at) markAsRead(n.id);
    // Close popover immediately for responsive feel
    setOpen(false);

    if (n.reference_type === "report") {
      // Deep-link to member detail with exact report expanded
      if (n.member_id && n.reference_id) {
        navigate(`/members/${n.member_id}?reportId=${n.reference_id}`);
      } else if (n.member_id) {
        navigate(`/members/${n.member_id}`);
      } else {
        navigate("/reports");
      }
    } else if (n.reference_type === "handout") {
      // Look up handout module for deep-link
      if (n.reference_id && n.member_id) {
        const { data } = await supabase
          .from("handouts")
          .select("module")
          .eq("id", n.reference_id)
          .maybeSingle();
        if (data?.module) {
          navigate(`/members/${n.member_id}?handout=${data.module}`);
        } else {
          navigate(`/members/${n.member_id}`);
        }
      } else {
        navigate("/handouts");
      }
    } else if (n.reference_type === "chat") {
      // Look up conversation_id from message for deep-link
      if (n.reference_id) {
        const { data } = await supabase
          .from("messages")
          .select("conversation_id")
          .eq("id", n.reference_id)
          .maybeSingle();
        if (data?.conversation_id) {
          navigate(`/chat?conversationId=${data.conversation_id}&messageId=${n.reference_id}`);
        } else {
          navigate("/chat");
        }
      } else {
        navigate("/chat");
      }
    } else if (n.reference_type === "feedback") {
      navigate(`/admin/feedback?feedbackId=${n.reference_id || ""}`);
    }
  };

  const handleDownloadFile = async (e: React.MouseEvent, n: Notification) => {
    e.stopPropagation();
    if (!n.reference_id || n.reference_type !== "report") return;

    const { data: report } = await supabase
      .from("financial_reports")
      .select("file_path, file_name")
      .eq("id", n.reference_id)
      .single();

    if (!report?.file_path) return;
    await openReportFile(report.file_path);
  };

  if (!isAdvisor) return null;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "report_uploaded": return { Icon: FileText, bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" };
      case "new_message": return { Icon: MessageCircle, bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" };
      case "handout_completed": return { Icon: ClipboardList, bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" };
      default: return { Icon: Bell, bg: "bg-muted", text: "text-muted-foreground" };
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative p-2 rounded-lg text-sidebar-muted hover:text-sidebar-accent-foreground hover:bg-sidebar-accent transition-colors"
          title="Notifikationer"
        >
          <Bell className="h-4.5 w-4.5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4.5 min-w-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="right"
        sideOffset={8}
        className="w-80 p-0 max-h-[420px] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Notifikationer</h3>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-[10px] text-primary hover:underline font-medium"
            >
              Markér alle som læst
            </button>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-6 text-center">
              <Bell className="h-6 w-6 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Ingen notifikationer endnu</p>
            </div>
          ) : (
            notifications.map((n) => {
              const { Icon, bg, text } = getNotificationIcon(n.type);
              const isReport = n.type === "report_uploaded";
              return (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-secondary/50 transition-colors flex items-start gap-3 ${
                    !n.read_at ? "bg-primary/5" : ""
                  }`}
                >
                  <div className={`p-1.5 rounded-lg mt-0.5 flex-shrink-0 ${bg}`}>
                    <Icon className={`h-3.5 w-3.5 ${text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium text-foreground ${!n.read_at ? "font-semibold" : ""}`}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: da })}
                      </span>
                      {isReport && n.reference_id && (
                        <button
                          onClick={(e) => handleDownloadFile(e, n)}
                          className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline font-medium"
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                          Se fil
                        </button>
                      )}
                    </div>
                  </div>
                  {!n.read_at && (
                    <div className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default AdvisorNotifications;
