import { format, startOfDay } from "date-fns";
import { da } from "date-fns/locale";
import { Calculator, BookOpen, FileText, MessageSquare, Target } from "lucide-react";
import type { MembershipTier } from "@/lib/membershipTier";

/** Delt mellem CompanyChatPane (rådgiverens indbakke) og MemberChatPane
    (medlemmets chat) efter C1-splittet (docs/chat-design.md). REN
    flytning fra CompanyChatPane — ingen ændringer i indhold. Kun det
    begge sider SKAL have identisk bor her; skelet-JSX og effekter er
    bevidst dubleret i de to komponenter (chat-split-recon §5). */

/** Smart date separator label: "I dag", "I går", or "9. marts 2026" */
export function dateSeparatorLabel(date: Date): string {
  const today = startOfDay(new Date());
  const d = startOfDay(date);
  const diff = today.getTime() - d.getTime();
  if (diff === 0) return "I dag";
  if (diff === 86400000) return "I går";
  return format(d, "d. MMMM yyyy", { locale: da });
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
  message_type?: string;
  context_type?: string | null;
  context_id?: string | null;
  context_meta?: any;
  pinned_at?: string | null;
}

export interface ConversationWithProfile {
  id: string;
  member_id: string;
  last_message_at: string;
  company_id?: string;
  companyName?: string;
  companyLogoUrl?: string;
  isLegat?: boolean;
  membershipTier?: MembershipTier;
  profile: { full_name: string; company_name: string; avatar_url: string } | null;
  unreadCount: number;
  lastMessage?: string;
  lastMessageSenderId?: string;
  lastMessageType?: string;
  lastContextType?: string | null;
  hasRecentReport: boolean;
  recentReportName?: string;
  recentReportIds?: string[];
  awaiting_reply_from?: string | null;
  assigned_advisor_id?: string | null;
  last_member_message_at?: string | null;
  last_advisor_reply_at?: string | null;
}

export type MessageTopic = "report" | "handout" | "milestone" | "budget" | null;

export const TOPIC_COLORS: Record<string, { bg: string; text: string; label: string; icon: typeof MessageSquare }> = {
  report: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", label: "Rapport", icon: FileText },
  handout: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", label: "Handout", icon: BookOpen },
  milestone: { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", label: "Milestone", icon: Target },
  budget: { bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", label: "Budget", icon: Calculator },
};

export const MESSAGE_TOPICS: { key: MessageTopic; label: string }[] = [
  { key: null, label: "Generelt" },
  { key: "report", label: "Rapport" },
  { key: "handout", label: "Handout" },
  { key: "milestone", label: "Milestone" },
  { key: "budget", label: "Budget" },
];

export const MAX_MESSAGE_LENGTH = 5000;

export const getInitials = (name: string) =>
  name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
