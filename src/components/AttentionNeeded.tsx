import {
  AlertTriangle, Clock, MessageSquare, FileText, Target, ChevronRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DANISH_MONTHS } from "@/lib/financialUtils";

interface AttentionItem {
  id: string;
  type: "report" | "milestone" | "chat";
  title: string;
  description: string;
  urgency: "high" | "medium" | "low";
  action: string;
  link: string;
  daysLeft?: number;
}

const typeConfig = {
  report: { icon: FileText, color: "text-destructive", bg: "bg-destructive/10" },
  milestone: { icon: Target, color: "text-chart-warning", bg: "bg-chart-warning/10" },
  chat: { icon: MessageSquare, color: "text-chart-info", bg: "bg-chart-info/10" },
};

const urgencyBorder = {
  high: "border-l-destructive",
  medium: "border-l-chart-warning",
  low: "border-l-muted",
};

const AttentionNeeded = () => {
  const { user } = useAuth();

  const { data: items = [] } = useQuery({
    queryKey: ["attention-needed", user?.id],
    queryFn: async () => {
      const attentionItems: AttentionItem[] = [];
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const currentKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

      const { data: reports } = await supabase
        .from("financial_reports")
        .select("report_period")
        .eq("user_id", user!.id)
        .eq("status", "processed");

      const reportKeys = new Set(
        (reports || [])
          .map(r => {
            if (!r.report_period) return null;
            for (let i = 0; i < DANISH_MONTHS.length; i++) {
              if (r.report_period.toLowerCase().includes(DANISH_MONTHS[i].toLowerCase())) {
                const y = r.report_period.match(/\d{4}/);
                if (y) return `${y[0]}-${String(i + 1).padStart(2, "0")}`;
              }
            }
            return null;
          })
          .filter(Boolean)
      );

      if (!reportKeys.has(currentKey)) {
        const daysLeft = new Date(currentYear, currentMonth + 1, 0).getDate() - now.getDate();
        attentionItems.push({
          id: "missing-report",
          type: "report",
          title: `${DANISH_MONTHS[currentMonth]}-rapport mangler`,
          description: `Upload din saldobalance for ${DANISH_MONTHS[currentMonth]} ${currentYear}`,
          urgency: daysLeft <= 5 ? "high" : "medium",
          action: "Upload nu",
          link: "/reports",
          daysLeft,
        });
      }

      const { data: milestones } = await supabase
        .from("milestones")
        .select("id, title, deadline, progress")
        .eq("user_id", user!.id)
        .lt("progress", 100)
        .not("deadline", "is", null);

      (milestones || []).forEach(ms => {
        if (!ms.deadline) return;
        const deadlineDate = new Date(ms.deadline);
        const daysLeft = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysLeft <= 14 && daysLeft > 0) {
          attentionItems.push({
            id: `ms-${ms.id}`,
            type: "milestone",
            title: "Milestone deadline nærmer sig",
            description: `"${ms.title}" – deadline ${ms.deadline}`,
            urgency: daysLeft <= 3 ? "high" : "medium",
            action: "Se status",
            link: "/milestones",
            daysLeft,
          });
        }
      });

      const { data: conv } = await supabase
        .from("conversations")
        .select("id")
        .eq("member_id", user!.id)
        .maybeSingle();

      if (conv?.id) {
        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .neq("sender_id", user!.id)
          .is("read_at", null);

        if (count && count > 0) {
          attentionItems.push({
            id: "unread-messages",
            type: "chat",
            title: `${count} ulæst${count > 1 ? "e" : ""} besked${count > 1 ? "er" : ""}`,
            description: "Du har ubesvaret kommunikation fra dine rådgivere",
            urgency: count >= 3 ? "high" : "medium",
            action: "Læs beskeder",
            link: "/chat",
          });
        }
      }

      return attentionItems;
    },
    enabled: !!user,
    staleTime: 3 * 60 * 1000,
  });

  if (items.length === 0) return null;

  const highCount = items.filter((i) => i.urgency === "high").length;

  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-chart-warning" />
          <h3 className="font-display font-semibold text-foreground">Kræver opmærksomhed</h3>
        </div>
        {highCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive uppercase tracking-wider">
            {highCount} kritisk
          </span>
        )}
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const config = typeConfig[item.type];
          const Icon = config.icon;
          return (
            <Link
              key={item.id}
              to={item.link}
              className={`flex items-start gap-3 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors border-l-[3px] ${urgencyBorder[item.urgency]} group`}
            >
              <div className={`p-1.5 rounded-md ${config.bg} flex-shrink-0 mt-0.5`}>
                <Icon className={`h-3.5 w-3.5 ${config.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                  {item.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {item.daysLeft !== undefined && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground">
                    <Clock className="h-3 w-3" />{item.daysLeft}d
                  </span>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default AttentionNeeded;
