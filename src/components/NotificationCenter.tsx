import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, FileText, ClipboardList, MessageCircle, AlertTriangle, FileCheck, Clock, Sparkles, CheckCircle2, TrendingDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import { useNotifications, type Notification } from "@/hooks/useNotifications";

const NotificationCenter = () => {
  const navigate = useNavigate();
  const { notifications, unseenCount, hasActionRequired, markAllSeen, markRead } = useNotifications();
  const [open, setOpen] = useState(false);

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      // Mark all as seen when panel opens → resets badge
      markAllSeen();
    }
  };

  const handleClick = (n: Notification) => {
    if (!n.read_at) markRead(n.id);
    setOpen(false);
    if (n.deep_link) {
      navigate(n.deep_link);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "report_uploaded":
        return { Icon: FileText, bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" };
      case "member_message":
        return { Icon: MessageCircle, bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" };
      case "handout_completed":
        return { Icon: ClipboardList, bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" };
      // Phase 2 member events
      case "advisor_replied":
        return { Icon: MessageCircle, bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" };
      case "report_review_ready":
        return { Icon: FileCheck, bg: "bg-primary/10", text: "text-primary" };
      case "report_reminder":
        return { Icon: Clock, bg: "bg-destructive/10", text: "text-destructive" };
      case "report_error":
        return { Icon: AlertTriangle, bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" };
      case "pulse_checkin_received":
        return { Icon: Sparkles, bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400" };
      case "meeting_reminder":
        return { Icon: Clock, bg: "bg-primary/10", text: "text-primary" };
      case "report_committed":
        return { Icon: CheckCircle2, bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" };
      default:
        return { Icon: Bell, bg: "bg-muted", text: "text-muted-foreground" };
    }
  };

  const getPriorityDot = (priority: string, readAt: string | null) => {
    if (readAt) return null;
    if (priority === "action_required") return "bg-destructive";
    if (priority === "important") return "bg-primary";
    return null;
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative p-2 rounded-lg text-sidebar-muted hover:text-sidebar-accent-foreground hover:bg-sidebar-accent transition-colors"
          title="Notifikationer"
        >
          <Bell className="h-4.5 w-4.5" />
          {unseenCount > 0 && (
            <span
              className={`absolute -top-0.5 -right-0.5 h-4.5 min-w-[18px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center ${
                hasActionRequired
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              {unseenCount > 99 ? "99+" : unseenCount}
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
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-foreground">Notifikationer</h3>
          </div>
          <div className="flex items-center gap-2">
            {notifications.filter(n => n.priority === "info" && !n.read_at).length > 0 && (
              <button
                onClick={() => {
                  notifications
                    .filter(n => n.priority === "info" && !n.read_at)
                    .forEach(n => markRead(n.id));
                }}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Ryd aktivitet
              </button>
            )}
            {notifications.some(n => !n.read_at) && (
              <button
                onClick={() => {
                  notifications
                    .filter(n => !n.read_at)
                    .forEach(n => markRead(n.id));
                }}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Marker alle som læst
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-8 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">Ingen notifikationer endnu</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Vi giver dig besked når der sker noget vigtigt
              </p>
            </div>
          ) : (
            (() => {
              const actionable = notifications.filter(n => n.priority !== "info");
              const informational = notifications.filter(n => n.priority === "info");

              const renderCard = (n: Notification) => {
                const { Icon, bg, text } = getIcon(n.type);
                const dotColor = getPriorityDot(n.priority, n.read_at);
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
                      <div className="flex items-center gap-1.5">
                        <p className={`text-xs font-medium text-foreground ${!n.read_at ? "font-semibold" : ""}`}>
                          {n.title}
                        </p>
                        {n.priority === "action_required" && (
                          <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                        )}
                      </div>
                      {n.body && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                      )}
                      <span className="text-[10px] text-muted-foreground mt-1 block">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: da })}
                      </span>
                    </div>
                    {dotColor && (
                      <div className={`h-2 w-2 rounded-full ${dotColor} mt-1.5 flex-shrink-0`} />
                    )}
                  </button>
                );
              };

              return (
                <>
                  {actionable.map(renderCard)}
                  {informational.length > 0 && actionable.length > 0 && (
                    <div className="px-4 py-2 border-b border-border bg-muted/30">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        Aktivitet
                      </p>
                    </div>
                  )}
                  {informational.map(renderCard)}
                </>
              );
            })()
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationCenter;
