import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";

import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { notifyChatMessage } from "@/lib/chatNotify";
import { uploadChatAttachments } from "@/lib/chatAttachments";
import { MessageAttachments, type ChatAttachment } from "@/components/ChatAttachments";
import { useMessageReactions } from "@/hooks/useMessageReactions";
import { ReactionBar, ReactionPicker } from "@/components/MessageReactions";
import { useMessageActions } from "@/hooks/useMessageActions";
import { useConversationLastSeen } from "@/hooks/useConversationLastSeen";
import MessageActionMenu from "@/components/MessageActionMenu";
import InlineEditInput from "@/components/InlineEditInput";
import MobileMessageActionDrawer from "@/components/MobileMessageActionDrawer";
import { openReportFile } from "@/lib/reportFileAccess";
import { isConversationActionable } from "@/lib/advisorActionHelpers";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import {
  Send, MessageCircle, CheckCheck, FileText, Sparkles, Target,
  Search, Inbox, Clock, AlertCircle, Filter, Calculator, BookOpen, MessageSquare,
  BarChart3, Pin, Maximize2, Minimize2, ArrowLeft, ExternalLink, Eye,
  UserCheck, Users as UsersIcon, ChevronDown, ChevronLeft, ChevronRight, Check, ArrowRightLeft, X,
  CalendarIcon, StickyNote, MoreHorizontal, Layers, Building2,
} from "lucide-react";
import ChatRichInput from "@/components/ChatRichInput";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose,
} from "@/components/ui/drawer";
import { format, formatDistanceToNow, startOfDay, addDays, nextMonday, setHours, setMinutes, setSeconds } from "date-fns";
import { da } from "date-fns/locale";

/** Smart date separator label: "I dag", "I går", or "9. marts 2026" */
function dateSeparatorLabel(date: Date): string {
  const today = startOfDay(new Date());
  const d = startOfDay(date);
  const diff = today.getTime() - d.getTime();
  if (diff === 0) return "I dag";
  if (diff === 86400000) return "I går";
  return format(d, "d. MMMM yyyy", { locale: da });
}

interface Message {
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

interface ConversationWithProfile {
  id: string;
  member_id: string;
  last_message_at: string;
  company_id?: string;
  companyName?: string;
  companyLogoUrl?: string;
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
  acknowledged_at?: string | null;
  acknowledged_by_advisor_id?: string | null;
  conversation_status?: string;
  resolved_at?: string | null;
  resolved_by_advisor_id?: string | null;
  follow_up_at?: string | null;
  // Group thread discriminator
  threadType?: "company" | "group";
  groupConversationId?: string;
  groupId?: string;
  groupName?: string;
}

type InboxFilter = "action" | "mine" | "alle" | "unassigned" | "rapporter";
type TopicFilter = "all" | "report" | "handout" | "milestone" | "budget" | "sparring";
type MessageTopic = "report" | "handout" | "milestone" | "budget" | null;

const ADVISOR_FILTER_CONFIG: { key: InboxFilter; label: string; icon: typeof Inbox }[] = [
  { key: "action", label: "Kræver svar", icon: AlertCircle },
  { key: "mine", label: "Mine", icon: UserCheck },
  { key: "alle", label: "Alle", icon: Inbox },
  { key: "unassigned", label: "Uden ejer", icon: UsersIcon },
  { key: "rapporter", label: "Ny rapport", icon: FileText },
];

const TOPIC_CONFIG: { key: TopicFilter; label: string; icon: typeof MessageSquare; color: string }[] = [
  { key: "all", label: "Alle", icon: MessageSquare, color: "bg-muted text-muted-foreground" },
  { key: "report", label: "Rapporter", icon: FileText, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  { key: "handout", label: "Handouts", icon: BookOpen, color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  { key: "milestone", label: "Milestones", icon: Target, color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  { key: "budget", label: "Budget", icon: Calculator, color: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  { key: "sparring", label: "Sparring", icon: MessageSquare, color: "bg-muted text-muted-foreground" },
];

const TOPIC_COLORS: Record<string, { bg: string; text: string; label: string; icon: typeof MessageSquare }> = {
  report: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", label: "Rapport", icon: FileText },
  handout: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", label: "Handout", icon: BookOpen },
  milestone: { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", label: "Milestone", icon: Target },
  budget: { bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", label: "Budget", icon: Calculator },
};

const MESSAGE_TOPICS: { key: MessageTopic; label: string }[] = [
  { key: null, label: "Generelt" },
  { key: "report", label: "Rapport" },
  { key: "handout", label: "Handout" },
  { key: "milestone", label: "Milestone" },
  { key: "budget", label: "Budget" },
];

const CompanyChatPane = () => {
  const { user, isAdvisor: rawAdvisor, companyId, isCompanyOverride, companyName } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<ConversationWithProfile[]>([]);
  const [profilesMap, setProfilesMap] = useState<Map<string, { full_name: string; avatar_url: string | null }>>(new Map());
  const [unreviewedReportIds, setUnreviewedReportIds] = useState<string[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<InboxFilter>("alle");
  const [topicFilter, setTopicFilter] = useState<TopicFilter>("all");
  const [selectedTopic, setSelectedTopic] = useState<MessageTopic>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [participants, setParticipants] = useState<{ user_id: string; full_name: string; avatar_url: string | null; isAdvisor: boolean }[]>([]);
  const [assignmentPopoverOpen, setAssignmentPopoverOpen] = useState(false);
  const [snoozePopoverOpen, setSnoozePopoverOpen] = useState(false);
  const [snoozeShowCalendar, setSnoozeShowCalendar] = useState(false);
  const [mobileFilterDrawerOpen, setMobileFilterDrawerOpen] = useState(false);
  const [mobileActionsDrawerOpen, setMobileActionsDrawerOpen] = useState(false);

  // Internal note state
  const [noteContent, setNoteContent] = useState("");
  const [noteDbContent, setNoteDbContent] = useState("");
  const [noteMeta, setNoteMeta] = useState<{ updated_at: string; updated_by: string } | null>(null);
  const [noteSaveStatus, setNoteSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [conversationNoteIds, setConversationNoteIds] = useState<Set<string>>(new Set());

  // Fetch all advisors for member header (independent of conversation participation)
  const { data: allAdvisors } = useQuery({
    queryKey: ["all-advisor-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_all_advisor_profiles" as any);
      if (error) { console.error("Failed to fetch advisor profiles:", error); return []; }
      return (data as any[] || []).map((r: any) => ({
        user_id: r.user_id as string,
        full_name: r.full_name as string,
        avatar_url: r.avatar_url as string | null,
      }));
    },
    staleTime: 10 * 60 * 1000,
    enabled: !isAdvisor, // only needed for member view
  });

  const advisorNamesLabel = allAdvisors && allAdvisors.length > 0
    ? allAdvisors.map((a: any) => a.full_name.split(" ")[0]).join(" & ")
    : "Dine rådgivere";


  // Cached advisor list for assignment dropdown (two-step: roles then profiles)
  const { data: advisorUsers, isError: advisorUsersError } = useQuery({
    queryKey: ["advisor-users-for-assignment"],
    queryFn: async () => {
      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["advisor", "admin"]);
      if (rolesErr) throw rolesErr;
      if (!roles?.length) return [];
      const uniqueIds = [...new Set(roles.map((r) => r.user_id))];
      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", uniqueIds);
      if (profErr) throw profErr;
      return (profiles || [])
        .map((p) => ({
          user_id: p.user_id,
          full_name: p.full_name || "Unavngivet",
          avatar_url: p.avatar_url,
        }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name, "da"));
    },
    enabled: !!isAdvisor,
    staleTime: 5 * 60_000,
  });

  // Set default filter for advisors on mount
  useEffect(() => {
    if (isAdvisor) {
      setActiveFilter("action");
    }
  }, [isAdvisor]);

  // Deep linking
  useEffect(() => {
    const convParam = searchParams.get("conversationId");
    const msgParam = searchParams.get("messageId");
    if (convParam && conversations.length > 0) {
      const conv = conversations.find(c => c.id === convParam);
      if (conv && activeConvId !== convParam) {
        setActiveFilter("alle");
        setActiveConvId(convParam);
        if (isMobile) setShowMessages(true);
      }
      if (msgParam && messages.length > 0 && activeConvId === convParam) {
        setTimeout(() => {
          scrollToMessage(msgParam);
          setSearchParams({}, { replace: true });
        }, 300);
      }
    }
  }, [searchParams, conversations, messages, activeConvId]);

  // Escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // Reset active conversation when company changes
  useEffect(() => {
    setActiveConvId(null);
    setMessages([]);
    setShowMessages(false);
  }, [companyId]);

  // Fetch participants for active conversation via security-definer RPC
  const fetchParticipants = async (convId: string) => {
    const { data, error } = await supabase.rpc("get_conversation_sender_profiles" as any, { _conversation_id: convId });
    if (error) { console.error("Failed to load conversation participants:", error); return; }
    const list = ((data as any[]) || []).map((row: any) => ({
      user_id: row.user_id as string,
      full_name: row.full_name as string,
      avatar_url: row.avatar_url as string | null,
      isAdvisor: row.is_advisor as boolean,
    }));
    setParticipants(list);
  };

  useEffect(() => {
    if (!activeConvId) { setParticipants([]); return; }
    if (activeConvId.startsWith("group_")) {
      const gcId = activeConvId.replace("group_", "");
      const fetchGroupParticipants = async () => {
        const { data: msgs } = await supabase
          .from("group_messages" as any)
          .select("sender_id")
          .eq("conversation_id", gcId)
          .limit(200);
        if (!msgs) { setParticipants([]); return; }
        const senderIds = [...new Set((msgs as any[]).map((m: any) => m.sender_id))];
        if (senderIds.length === 0) { setParticipants([]); return; }
        const [profilesRes, rolesRes] = await Promise.all([
          supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", senderIds),
          supabase.from("user_roles").select("user_id, role").in("user_id", senderIds),
        ]);
        const roleSet = new Set((rolesRes.data || []).filter(r => ['advisor','admin'].includes(r.role)).map(r => r.user_id));
        setParticipants((profilesRes.data || []).map(p => ({
          user_id: p.user_id,
          full_name: p.full_name || "Ukendt",
          avatar_url: p.avatar_url,
          isAdvisor: roleSet.has(p.user_id),
        })));
      };
      fetchGroupParticipants();
    } else {
      fetchParticipants(activeConvId);
    }
  }, [activeConvId]);

  // Load conversations — batch fetch, no N+1
  useEffect(() => {
    if (!user) return;

    const loadConversations = async () => {
      let convsQuery = supabase
        .from("conversations")
        .select("*, companies:company_id(id, name, logo_url)")
        .order("last_message_at", { ascending: false });
      
      if (isCompanyOverride && companyId) {
        convsQuery = convsQuery.eq("company_id", companyId);
      } else if (!isAdvisor && companyId) {
        convsQuery = convsQuery.eq("company_id", companyId);
      } else if (!isAdvisor) {
        convsQuery = convsQuery.eq("member_id", user.id);
      }

      const [convsRes, profilesRes, msgsRes, reportsRes, groupCompaniesRes] = await Promise.all([
        convsQuery,
        supabase.from("profiles").select("user_id, full_name, company_name, avatar_url"),
        supabase
          .from("messages")
          .select("id, conversation_id, sender_id, content, read_at, created_at, message_type, context_type, pinned_at")
          .order("created_at", { ascending: false })
          .limit(500),
        isAdvisor
          ? supabase
              .from("financial_reports")
              .select("id, user_id, file_name, uploaded_at, status, reviewed_at")
              .gte("uploaded_at", new Date(Date.now() - 7 * 86400000).toISOString())
              .is("reviewed_at", null)
              .order("uploaded_at", { ascending: false })
          : Promise.resolve({ data: [] }),
        isAdvisor
          ? (supabase
              .from("group_companies" as any)
              .select("company_id, group_id, groups:group_id(anchor_company_id)") as any)
          : Promise.resolve({ data: [] }),
      ]);

      const convs = convsRes.data || [];
      const profiles = profilesRes.data || [];
      const allMessages = msgsRes.data || [];
      const recentReports = reportsRes.data || [];

      // Build set of ALL company IDs that belong to any group (anchor + sub-companies)
      const groupCompanyIds = new Set<string>();
      for (const row of (groupCompaniesRes.data || []) as any[]) {
        groupCompanyIds.add(row.company_id);
      }

      // For advisors: filter out ALL individual conversations for companies
      // that are in any group (anchor OR sub-company).
      // Group communication happens via group_conversations only.
      const filteredConvs = isAdvisor
        ? convs.filter((c: any) => !c.company_id || !groupCompanyIds.has(c.company_id))
        : convs;

      const pMap = new Map<string, { full_name: string; avatar_url: string | null }>();
      profiles.forEach(p => pMap.set(p.user_id, { full_name: p.full_name, avatar_url: p.avatar_url || null }));
      setProfilesMap(pMap);

      setUnreviewedReportIds(recentReports.map((r: any) => r.id));

      const reportsByCompany = new Map<string, { name: string; ids: string[] }>();
      recentReports.forEach((r: any) => {
        const userConv = filteredConvs.find((c: any) => c.member_id === r.user_id);
        const cid = userConv?.company_id;
        if (cid) {
          const existing = reportsByCompany.get(cid);
          if (existing) {
            existing.ids.push(r.id);
          } else {
            reportsByCompany.set(cid, { name: r.file_name, ids: [r.id] });
          }
        }
      });

      const msgsByConv = new Map<string, typeof allMessages>();
      allMessages.forEach((m) => {
        const arr = msgsByConv.get(m.conversation_id) || [];
        arr.push(m);
        msgsByConv.set(m.conversation_id, arr);
      });

      const enriched: ConversationWithProfile[] = filteredConvs.map((c: any) => {
        const profile = profiles.find((p) => p.user_id === c.member_id) || null;
        const convMsgs = msgsByConv.get(c.id) || [];
        const lastMsg = convMsgs[0];
        const unreadCount = convMsgs.filter(
          (m) => m.sender_id !== user.id && !m.read_at && m.message_type === "user"
        ).length;

        const companyData = c.companies as any;
        const cid = c.company_id || undefined;
        const report = cid ? reportsByCompany.get(cid) : undefined;

        return {
          id: c.id,
          member_id: c.member_id,
          last_message_at: c.last_message_at || c.created_at,
          company_id: cid,
          companyName: companyData?.name || undefined,
          companyLogoUrl: companyData?.logo_url || undefined,
          profile: profile
            ? { full_name: profile.full_name, company_name: profile.company_name || "", avatar_url: profile.avatar_url || "" }
            : null,
          unreadCount,
          lastMessage: lastMsg?.content,
          lastMessageSenderId: lastMsg?.sender_id,
          lastMessageType: lastMsg?.message_type,
          lastContextType: lastMsg?.context_type,
          hasRecentReport: !!report,
          recentReportName: report?.name,
          recentReportIds: report?.ids,
          awaiting_reply_from: c.awaiting_reply_from || null,
          assigned_advisor_id: c.assigned_advisor_id || null,
          last_member_message_at: c.last_member_message_at || null,
          last_advisor_reply_at: c.last_advisor_reply_at || null,
          acknowledged_at: c.acknowledged_at || null,
          acknowledged_by_advisor_id: c.acknowledged_by_advisor_id || null,
          conversation_status: c.conversation_status || 'open',
          resolved_at: c.resolved_at || null,
          resolved_by_advisor_id: c.resolved_by_advisor_id || null,
          follow_up_at: c.follow_up_at || null,
        };
      });

      // Deduplicate by company_id
      const deduped: ConversationWithProfile[] = [];
      const seenCompanies = new Set<string>();
      for (const conv of enriched) {
        if (conv.company_id) {
          if (seenCompanies.has(conv.company_id)) continue;
          seenCompanies.add(conv.company_id);
        }
        deduped.push({ ...conv, threadType: "company" });
      }

      // For advisors: fetch group threads and merge into flat inbox
      let merged = deduped;
      if (isAdvisor) {
        try {
          const { data: accessRows } = await supabase
            .from("group_advisor_access")
            .select("group_id")
            .eq("advisor_user_id", user.id);

          if (accessRows && accessRows.length > 0) {
            const groupIds = accessRows.map(r => r.group_id);
            const [groupConvsRes, groupsRes] = await Promise.all([
              supabase
                .from("group_conversations" as any)
                .select("*")
                .in("group_id", groupIds)
                .order("last_message_at", { ascending: false }),
              supabase
                .from("groups" as any)
                .select("id, name")
                .in("id", groupIds),
            ]);

            const groupConvs = (groupConvsRes.data as any[]) || [];
            const groupsData = (groupsRes.data as any[]) || [];
            const groupNameMap = new Map(groupsData.map((g: any) => [g.id, g.name]));

            // Fetch latest message per group conversation for preview
            const gcIds = groupConvs.map((gc: any) => gc.id);
            let latestGroupMsgs: any[] = [];
            if (gcIds.length > 0) {
              const { data: gMsgs } = await supabase
                .from("group_messages" as any)
                .select("conversation_id, sender_id, content, created_at")
                .in("conversation_id", gcIds)
                .order("created_at", { ascending: false })
                .limit(gcIds.length * 2);
              latestGroupMsgs = (gMsgs as any[]) || [];
            }

            const latestMsgByConv = new Map<string, any>();
            for (const m of latestGroupMsgs) {
              if (!latestMsgByConv.has(m.conversation_id)) {
                latestMsgByConv.set(m.conversation_id, m);
              }
            }

            const groupThreads: ConversationWithProfile[] = groupConvs.map((gc: any) => {
              const gName = groupNameMap.get(gc.group_id) || "Koncern";
              const lastMsg = latestMsgByConv.get(gc.id);
              return {
                id: `group_${gc.id}`,
                member_id: "",
                last_message_at: gc.last_message_at || gc.created_at,
                companyName: gName,
                profile: null,
                unreadCount: 0,
                lastMessage: lastMsg?.content,
                lastMessageSenderId: lastMsg?.sender_id,
                hasRecentReport: false,
                awaiting_reply_from: gc.awaiting_reply_from || null,
                assigned_advisor_id: gc.assigned_advisor_id || null,
                last_member_message_at: gc.last_member_message_at || null,
                last_advisor_reply_at: gc.last_advisor_reply_at || null,
                acknowledged_at: gc.acknowledged_at || null,
                acknowledged_by_advisor_id: gc.acknowledged_by_advisor_id || null,
                conversation_status: gc.conversation_status || 'open',
                resolved_at: gc.resolved_at || null,
                resolved_by_advisor_id: gc.resolved_by_advisor_id || null,
                follow_up_at: gc.follow_up_at || null,
                threadType: "group",
                groupConversationId: gc.id,
                groupId: gc.group_id,
                groupName: gName,
              };
            });

            merged = [...deduped, ...groupThreads].sort((a, b) =>
              new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
            );
          }
        } catch (err) {
          console.error("Failed to fetch group threads:", err);
        }
      }

      setConversations(merged);

      // Auto-select for members
      if (!isAdvisor && enriched.length > 0 && !activeConvId) {
        setActiveConvId(enriched[0].id);
        if (enriched.length <= 1) setShowMessages(true);
        else if (isMobile) setShowMessages(true);
      }
    };

    loadConversations();
  }, [user, isAdvisor, activeConvId, companyId, isCompanyOverride]);

  // Realtime subscription on conversations + group_conversations for live ops state updates
  useEffect(() => {
    if (!user || !isAdvisor) return;

    const channel = supabase
      .channel("conv-ops-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations" },
        (payload) => {
          const updated = payload.new as any;
          setConversations(prev => prev.map(c =>
            c.id === updated.id
              ? {
                  ...c,
                  awaiting_reply_from: updated.awaiting_reply_from || null,
                  assigned_advisor_id: updated.assigned_advisor_id || null,
                  last_member_message_at: updated.last_member_message_at || null,
                  last_advisor_reply_at: updated.last_advisor_reply_at || null,
                  acknowledged_at: updated.acknowledged_at || null,
                  acknowledged_by_advisor_id: updated.acknowledged_by_advisor_id || null,
                  conversation_status: updated.conversation_status || 'open',
                  resolved_at: updated.resolved_at || null,
                  resolved_by_advisor_id: updated.resolved_by_advisor_id || null,
                  follow_up_at: updated.follow_up_at || null,
                  last_message_at: updated.last_message_at || c.last_message_at,
                }
              : c
          ));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "group_conversations" },
        (payload) => {
          const updated = payload.new as any;
          const virtualId = `group_${updated.id}`;
          setConversations(prev => prev.map(c =>
            c.id === virtualId
              ? {
                  ...c,
                  awaiting_reply_from: updated.awaiting_reply_from || null,
                  assigned_advisor_id: updated.assigned_advisor_id || null,
                  last_member_message_at: updated.last_member_message_at || null,
                  last_advisor_reply_at: updated.last_advisor_reply_at || null,
                  acknowledged_at: updated.acknowledged_at || null,
                  acknowledged_by_advisor_id: updated.acknowledged_by_advisor_id || null,
                  conversation_status: updated.conversation_status || 'open',
                  resolved_at: updated.resolved_at || null,
                  resolved_by_advisor_id: updated.resolved_by_advisor_id || null,
                  follow_up_at: updated.follow_up_at || null,
                  last_message_at: updated.last_message_at || c.last_message_at,
                }
              : c
          ));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, isAdvisor]);

  // Fetch note existence for loaded conversations (advisor only, company threads only)
  useEffect(() => {
    if (!isAdvisor || conversations.length === 0) return;
    const companyConvIds = conversations.filter(c => c.threadType !== "group").map(c => c.id);
    if (companyConvIds.length === 0) { setConversationNoteIds(new Set()); return; }
    supabase
      .from("conversation_notes" as any)
      .select("conversation_id")
      .in("conversation_id", companyConvIds)
      .then(({ data }) => {
        if (data) {
          setConversationNoteIds(new Set((data as any[]).map(d => d.conversation_id)));
        }
      });
  }, [isAdvisor, conversations]);

  // Fetch note for active conversation (advisor only, company threads only)
  useEffect(() => {
    const isGroup = activeConvId?.startsWith("group_");
    if (!isAdvisor || !activeConvId || isGroup) {
      setNoteContent("");
      setNoteDbContent("");
      setNoteMeta(null);
      setNoteExpanded(false);
      setNoteSaveStatus('idle');
      return;
    }
    supabase
      .from("conversation_notes" as any)
      .select("content, updated_at, updated_by")
      .eq("conversation_id", activeConvId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setNoteContent((data as any).content || "");
          setNoteDbContent((data as any).content || "");
          setNoteMeta({ updated_at: (data as any).updated_at, updated_by: (data as any).updated_by });
          setNoteExpanded(true);
        } else {
          setNoteContent("");
          setNoteDbContent("");
          setNoteMeta(null);
          setNoteExpanded(false);
        }
        setNoteSaveStatus('idle');
      });
  }, [isAdvisor, activeConvId]);

  // Save/delete note on blur
  const handleNoteSave = async () => {
    if (!activeConvId || !user) return;
    const trimmed = noteContent.trim();
    if (trimmed === noteDbContent.trim()) return;

    setNoteSaveStatus('saving');

    if (!trimmed) {
      await supabase
        .from("conversation_notes" as any)
        .delete()
        .eq("conversation_id", activeConvId);
      setNoteDbContent("");
      setNoteContent("");
      setNoteMeta(null);
      setConversationNoteIds(prev => {
        const next = new Set(prev);
        next.delete(activeConvId);
        return next;
      });
    } else {
      const { data, error } = await supabase
        .from("conversation_notes" as any)
        .upsert({
          conversation_id: activeConvId,
          content: trimmed,
          updated_by: user.id,
        } as any, { onConflict: "conversation_id" })
        .select("content, updated_at, updated_by")
        .single();
      if (!error && data) {
        setNoteDbContent((data as any).content);
        setNoteMeta({ updated_at: (data as any).updated_at, updated_by: (data as any).updated_by });
        setConversationNoteIds(prev => {
          const next = new Set(prev);
          next.add(activeConvId);
          return next;
        });
      }
    }

    setNoteSaveStatus('saved');
    setTimeout(() => setNoteSaveStatus('idle'), 2000);
  };

  // Filtered & searched conversations for advisor
  const filteredConversations = useMemo(() => {
    let result = conversations;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.companyName?.toLowerCase().includes(q) ||
          c.profile?.full_name?.toLowerCase().includes(q)
      );
    }

    if (isAdvisor) {
      switch (activeFilter) {
        case "action": {
          const now = new Date();
          result = result.filter((c) => isConversationActionable(c, now));
          result = [...result].sort((a, b) => {
            const aT = a.last_member_message_at ? new Date(a.last_member_message_at).getTime() : 0;
            const bT = b.last_member_message_at ? new Date(b.last_member_message_at).getTime() : 0;
            return aT - bT;
          });
          break;
        }
        case "mine":
          result = result.filter((c) => c.assigned_advisor_id === user?.id);
          result = [...result].sort((a, b) =>
            new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
          );
          break;
        case "alle":
          result = [...result].sort((a, b) =>
            (a.companyName || "").localeCompare(b.companyName || "", "da")
          );
          break;
        case "unassigned":
          result = result.filter((c) => !c.assigned_advisor_id);
          result = [...result].sort((a, b) => {
            const aT = a.last_member_message_at ? new Date(a.last_member_message_at).getTime() : 0;
            const bT = b.last_member_message_at ? new Date(b.last_member_message_at).getTime() : 0;
            return aT - bT;
          });
          break;
        case "rapporter":
          result = result.filter((c) => c.hasRecentReport);
          break;
      }
    }

    return result;
  }, [conversations, searchQuery, activeFilter, isAdvisor, user?.id]);

  const stats = useMemo(() => {
    const now = new Date();
    const actionCount = conversations.filter((c) => {
      if (c.awaiting_reply_from !== "advisor" || c.conversation_status === 'resolved') return false;
      if (!c.assigned_advisor_id || c.assigned_advisor_id === user?.id) {
        if (!c.acknowledged_at) return true;
        if (c.follow_up_at && new Date(c.follow_up_at) <= now) return true;
      }
      return false;
    }).length;

    return {
      total: conversations.length,
      action: actionCount,
      withReports: conversations.filter((c) => c.hasRecentReport).length,
      mine: conversations.filter((c) => c.assigned_advisor_id === user?.id).length,
      unassigned: conversations.filter((c) => !c.assigned_advisor_id).length,
    };
  }, [conversations, user?.id]);

  // Load messages for active conversation
  useEffect(() => {
    if (!activeConvId) return;

    // Group thread: load from group_messages
    if (activeConvId.startsWith("group_")) {
      const gcId = activeConvId.replace("group_", "");
      const loadGroupMessages = async () => {
        const { data } = await supabase
          .from("group_messages" as any)
          .select("*")
          .eq("conversation_id", gcId)
          .order("created_at", { ascending: true })
          .limit(500);
        const msgs: Message[] = ((data as any[]) || []).map((m: any) => ({
          id: m.id,
          conversation_id: m.conversation_id,
          sender_id: m.sender_id,
          content: m.content,
          read_at: null,
          created_at: m.created_at,
          message_type: m.message_type || 'user',
          context_type: null,
          context_id: null,
          context_meta: null,
          pinned_at: null,
        }));
        setMessages(msgs);
      };
      loadGroupMessages();

      const channel = supabase
        .channel(`group-msgs-${gcId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "group_messages",
            filter: `conversation_id=eq.${gcId}`,
          },
          (payload) => {
            const m = payload.new as any;
            const newMsg: Message = {
              id: m.id,
              conversation_id: m.conversation_id,
              sender_id: m.sender_id,
              content: m.content,
              read_at: null,
              created_at: m.created_at,
              message_type: m.message_type || 'user',
              context_type: null,
              context_id: null,
              context_meta: null,
              pinned_at: null,
            };
            setMessages(prev => {
              if (prev.some(p => p.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "group_messages",
            filter: `conversation_id=eq.${gcId}`,
          },
          (payload) => {
            const m = payload.new as any;
            setMessages(prev => prev.map(p => p.id === m.id ? { ...p, content: m.content, edited_at: m.edited_at } as any : p));
          }
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "group_messages",
            filter: `conversation_id=eq.${gcId}`,
          },
          (payload) => {
            const old = payload.old as any;
            if (old?.id) setMessages(prev => prev.filter(p => p.id !== old.id));
          }
        )
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }

    // Company thread: existing logic
    const loadMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", activeConvId)
        .order("created_at", { ascending: true });
      setMessages(data || []);

      if (user) {
        await supabase.rpc("mark_messages_read", { p_conversation_id: activeConvId });
      }
    };

    loadMessages();

    const channel = supabase
      .channel(`messages-${activeConvId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConvId}`,
        },
        async (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => [...prev, newMsg]);

          if (newMsg.message_type !== 'system') {
            setParticipants((prev) => {
              if (!prev.some(p => p.user_id === newMsg.sender_id)) {
                fetchParticipants(activeConvId);
              }
              return prev;
            });
          }

          if (newMsg.sender_id !== user?.id && user) {
            await supabase.rpc("mark_messages_read", { p_conversation_id: activeConvId });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConvId}`,
        },
        (payload) => {
          const updated = payload.new as Message;
          setMessages((prev) => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConvId}`,
        },
        (payload) => {
          const deleted = payload.old as any;
          if (deleted?.id) setMessages((prev) => prev.filter(m => m.id !== deleted.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConvId, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const MAX_MESSAGE_LENGTH = 5000;

  const handleSend = useCallback(async (content: string, files?: File[]) => {
    const trimmed = content.trim();
    const hasFiles = files && files.length > 0;
    if ((!trimmed && !hasFiles) || !activeConvId || !user) return;

    if (trimmed.length > MAX_MESSAGE_LENGTH) return;

    setSending(true);

    // Upload attachments if any
    let attachments: ChatAttachment[] = [];
    if (hasFiles) {
      attachments = await uploadChatAttachments(user.id, files);
      if (attachments.length === 0 && !trimmed) {
        setSending(false);
        toast.error("Upload fejlede");
        return;
      }
    }

    const contextMeta = attachments.length > 0 ? { attachments } : undefined;

    if (activeConvId.startsWith("group_")) {
      const gcId = activeConvId.replace("group_", "");
      const insertData: any = {
        conversation_id: gcId,
        sender_id: user.id,
        content: trimmed || "📎",
      };
      if (contextMeta) {
        insertData.context_meta = contextMeta;
      }
      const { error } = await supabase
        .from("group_messages" as any)
        .insert(insertData);
      if (error) console.error("Failed to send group message:", error);
    } else {
      const insertData: any = {
        conversation_id: activeConvId,
        sender_id: user.id,
        content: trimmed || "📎",
      };

      if (selectedTopic) {
        insertData.context_type = selectedTopic;
      }

      if (contextMeta) {
        insertData.context_meta = contextMeta;
      }

      const { data, error } = await supabase.from("messages").insert(insertData).select().single();

      if (!error && data) {
        setNewMessage("");
        notifyChatMessage((data as any).id);

        // If advisor sends — auto-update conversation to awaiting member reply
        if (isAdvisor && activeConvId) {
          supabase.from("conversations").update({
            awaiting_reply_from: "company",
            last_message_at: new Date().toISOString(),
          } as any).eq("id", activeConvId).then(() => {
            queryClient.invalidateQueries({ queryKey: ["advisor-dashboard"] });
          });
        }
      }
    }

    setSending(false);
  }, [activeConvId, user, selectedTopic]);

  const filteredMessages = useMemo(() => {
    if (topicFilter === "all") return messages;
    if (topicFilter === "sparring") return messages.filter(m => !m.context_type);
    return messages.filter(m => m.context_type === topicFilter);
  }, [messages, topicFilter]);

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const isGroupThread = activeConv?.threadType === "group";

  // Pulse context for advisor chat banner
  const { data: latestPulse } = useQuery({
    queryKey: ["chat-pulse-context", activeConv?.company_id],
    queryFn: async () => {
      if (!activeConv?.company_id) return null;
      const { data } = await supabase
        .from("pulse_checkins")
        .select("help_needed, biggest_challenge, period_key")
        .eq("company_id", activeConv.company_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!isAdvisor && !!activeConv?.company_id,
    staleTime: 5 * 60_000,
  });

  // Advisor prev/next navigation
  const advisorConvList = useMemo(() => {
    if (!isAdvisor) return [];
    return conversations
      .filter(c => c.threadType !== "group")
      .sort((a, b) => {
        if (a.awaiting_reply_from === "advisor" && b.awaiting_reply_from !== "advisor") return -1;
        if (b.awaiting_reply_from === "advisor" && a.awaiting_reply_from !== "advisor") return 1;
        return new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime();
      });
  }, [conversations, isAdvisor]);

  const currentConvIdx = advisorConvList.findIndex(c => c.id === activeConvId);
  const prevConv = currentConvIdx > 0 ? advisorConvList[currentConvIdx - 1] : null;
  const nextConv = currentConvIdx < advisorConvList.length - 1 ? advisorConvList[currentConvIdx + 1] : null;

  const pinnedMessages = useMemo(() => 
    messages.filter(m => m.pinned_at).sort((a, b) => 
      new Date(b.pinned_at!).getTime() - new Date(a.pinned_at!).getTime()
    ), [messages]);

  const togglePin = async (msg: Message) => {
    const newVal = msg.pinned_at ? null : new Date().toISOString();
    await supabase.from("messages").update({ pinned_at: newVal } as any).eq("id", msg.id);
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, pinned_at: newVal } : m));
  };

  const scrollToMessage = (msgId: string) => {
    const el = messageRefs.current.get(msgId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary/50");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary/50"), 2000);
    }
  };

  const getInitialsLocal = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const relativeTime = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: da });
    } catch {
      return "";
    }
  };

  const handleMarkSingleReportRead = async (convId: string, reportIds: string[], e: React.MouseEvent) => {
    e.stopPropagation();
    if (!reportIds.length) return;
    const now = new Date().toISOString();
    await supabase
      .from("financial_reports")
      .update({ reviewed_at: now } as any)
      .in("id", reportIds);
    setUnreviewedReportIds(prev => prev.filter(id => !reportIds.includes(id)));
    setConversations(prev => prev.map(c =>
      c.id === convId ? { ...c, hasRecentReport: false, recentReportName: undefined, recentReportIds: [] } : c
    ));
  };

  const handleSelectConversation = (convId: string) => {
    setActiveConvId(convId);
    if (isMobile) setShowMessages(true);
  };

  const handleBackToList = () => {
    setShowMessages(false);
  };

  const handleMarkReportsAsRead = async () => {
    if (unreviewedReportIds.length === 0) return;
    const now = new Date().toISOString();
    await supabase
      .from("financial_reports")
      .update({ reviewed_at: now } as any)
      .in("id", unreviewedReportIds);
    setUnreviewedReportIds([]);
    setConversations(prev => prev.map(c => ({ ...c, hasRecentReport: false, recentReportName: undefined })));
  };

  // Helper: target the correct table for ops updates
  const getOpsTarget = useCallback((): { table: string; id: string } => {
    if (activeConvId?.startsWith("group_")) {
      return { table: "group_conversations", id: activeConvId.replace("group_", "") };
    }
    return { table: "conversations", id: activeConvId! };
  }, [activeConvId]);

  // Advisor actions
  const handleAssignAdvisor = async (advisorId: string | null) => {
    if (!activeConvId) return;
    const { table, id } = getOpsTarget();
    await supabase
      .from(table as any)
      .update({ assigned_advisor_id: advisorId } as any)
      .eq("id", id);
    setConversations(prev => prev.map(c =>
      c.id === activeConvId ? { ...c, assigned_advisor_id: advisorId } : c
    ));
  };

  const handleAcknowledge = async () => {
    if (!activeConvId || !user) return;
    const { table, id } = getOpsTarget();
    const now = new Date().toISOString();
    const conv = conversations.find(c => c.id === activeConvId);
    const updateData: any = {
      acknowledged_at: now,
      acknowledged_by_advisor_id: user.id,
      awaiting_reply_from: null,
      follow_up_at: null,
    };
    if (!conv?.assigned_advisor_id) {
      updateData.assigned_advisor_id = user.id;
    }
    await supabase
      .from(table as any)
      .update(updateData)
      .eq("id", id);
    setConversations(prev => prev.map(c =>
      c.id === activeConvId ? { ...c, ...updateData } : c
    ));
  };

  const handleResolve = async () => {
    if (!activeConvId || !user) return;
    const { table, id } = getOpsTarget();
    const now = new Date().toISOString();
    const updateData: any = {
      conversation_status: 'resolved',
      resolved_at: now,
      resolved_by_advisor_id: user.id,
      awaiting_reply_from: null,
      acknowledged_at: null,
      acknowledged_by_advisor_id: null,
      follow_up_at: null,
    };
    const { error } = await supabase
      .from(table as any)
      .update(updateData)
      .eq("id", id);
    if (error) {
      toast.error("Kunne ikke afslutte samtalen");
      return;
    }
    setConversations(prev => prev.map(c =>
      c.id === activeConvId ? { ...c, ...updateData } : c
    ));
  };

  // Snooze / follow-up helpers
  const getSnoozeDate = (option: 'tomorrow' | '3days' | 'nextweek'): Date => {
    const now = new Date();
    let d: Date;
    switch (option) {
      case 'tomorrow':
        d = addDays(now, 1);
        break;
      case '3days':
        d = addDays(now, 3);
        break;
      case 'nextweek':
        d = nextMonday(now);
        break;
    }
    return setSeconds(setMinutes(setHours(d, 9), 0), 0);
  };

  const handleSnooze = async (followUpAt: Date) => {
    if (!activeConvId || !user) return;
    const { table, id } = getOpsTarget();
    const now = new Date().toISOString();
    const conv = conversations.find(c => c.id === activeConvId);
    const updateData: any = {
      follow_up_at: followUpAt.toISOString(),
      acknowledged_at: now,
      acknowledged_by_advisor_id: user.id,
    };
    if (!conv?.assigned_advisor_id) {
      updateData.assigned_advisor_id = user.id;
    }
    const { error } = await supabase
      .from(table as any)
      .update(updateData)
      .eq("id", id);
    if (error) {
      toast.error("Kunne ikke sætte opfølgning");
      return;
    }
    setConversations(prev => prev.map(c =>
      c.id === activeConvId ? { ...c, ...updateData } : c
    ));
    setSnoozePopoverOpen(false);
    setSnoozeShowCalendar(false);
    toast.success(`Følger op ${format(followUpAt, "d. MMM", { locale: da })}`);
  };

  const handleCancelSnooze = async () => {
    if (!activeConvId || !user) return;
    const { table, id } = getOpsTarget();
    const updateData: any = {
      follow_up_at: null,
      acknowledged_at: null,
      acknowledged_by_advisor_id: null,
    };
    const { error } = await supabase
      .from(table as any)
      .update(updateData)
      .eq("id", id);
    if (error) {
      toast.error("Kunne ikke fjerne opfølgning");
      return;
    }
    setConversations(prev => prev.map(c =>
      c.id === activeConvId ? { ...c, ...updateData } : c
    ));
    toast.success("Opfølgning fjernet");
  };

  // Determine what to show on mobile
  const showSidebar = isAdvisor && (!isMobile || !showMessages);
  const showMessageArea = !isMobile || showMessages || !isAdvisor;

  // Get assigned advisor name for display
  const getAdvisorName = (advisorId: string | null | undefined) => {
    if (!advisorId || !advisorUsers) return null;
    const a = advisorUsers.find((u: any) => u.user_id === advisorId);
    return a ? a.full_name : null;
  };

  const getAdvisorInitials = (advisorId: string | null | undefined) => {
    const name = getAdvisorName(advisorId);
    return name ? getInitialsLocal(name) : null;
  };

  // Compute latestReadOwnMsgId for member read receipt
  const latestReadOwnMsgId = useMemo(() => {
    if (isAdvisor || !user) return null;
    const ownMsgs = messages.filter(m => m.sender_id === user.id && m.read_at);
    return ownMsgs.length > 0 ? ownMsgs[ownMsgs.length - 1].id : null;
  }, [messages, user, isAdvisor]);

  // Reactions hook
  const reactionsActiveConv = conversations.find(c => c.id === activeConvId);
  const reactionsIsGroup = reactionsActiveConv?.threadType === "group";
  const reactionMessageTable = reactionsIsGroup ? "group_messages" as const : "messages" as const;
  const reactionMessageIds = useMemo(() => messages.map(m => m.id), [messages]);
  const { getAggregated: getReactions, toggleReaction } = useMessageReactions(
    reactionMessageIds,
    reactionMessageTable,
    user?.id
  );

  // Edit/delete hook
  const {
    editingId, editContent, setEditContent,
    startEdit, cancelEdit, saveEdit: saveEditAction,
    deleteMessage: deleteMessageAction, canEdit: canEditCheck, canDelete: canDeleteCheck,
  } = useMessageActions(reactionMessageTable, user?.id, !!isAdvisor);

  // Last-seen / unread marker hook
  const lastSeenConvType = reactionsIsGroup ? "group" as const : "company" as const;
  const latestMsgId = messages.length > 0 ? messages[messages.length - 1].id : null;
  const { lastSeenMessageId: companyLastSeenId } = useConversationLastSeen(
    activeConvId?.startsWith("group_") ? activeConvId.replace("group_", "") : activeConvId,
    lastSeenConvType,
    user?.id,
    latestMsgId
  );

  const handleEditSave = async (messageId: string) => {
    const trimmed = editContent.trim();
    const ok = await saveEditAction(messageId);
    if (ok) {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: trimmed, edited_at: new Date().toISOString() } as any : m));
    }
  };

  const handleDeleteMsg = async (messageId: string) => {
    const ok = await deleteMessageAction(messageId);
    if (ok) {
      setMessages(prev => prev.filter(m => m.id !== messageId));
    }
  };

  // Sub-company member redirect: if member has no conversations and is in a group
  if (!isAdvisor && !viewingAsMember && conversations.length === 0 && companyId && !activeConvId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12">
        <div className="p-4 rounded-2xl bg-primary/10 mb-4">
          <MessageCircle className="h-7 w-7 text-primary" />
        </div>
        <h3 className="text-base font-display font-semibold text-foreground mb-2">
          Brug koncern-chatten
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm mb-4">
          Som del af en koncern kommunikerer I med jeres rådgivere
          via den fælles koncern-chat.
        </p>
        <button
          onClick={() => navigate("/chat")}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground
            text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Åbn koncern-chat →
        </button>
      </div>
    );
  }

  return (
    <>
      {isAdvisor && !isFullscreen && !isMobile && (
        <div className="mb-2">
          <h1 className="text-xl font-display font-bold text-foreground tracking-tight flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            Indbakke
          </h1>
        </div>
      )}

      <div className={`glass-card overflow-hidden flex flex-1 min-h-0 ${isFullscreen ? "" : "rounded-xl"}`}>
        {/* ─── ADVISOR INBOX SIDEBAR ─── */}
        {showSidebar && (
          <div className={`${isMobile ? "w-full" : "w-[340px]"} border-r border-border flex flex-col bg-card/50`}>
            {/* Quick stats */}
            <div className="px-4 pt-4 pb-3 border-b border-border space-y-3">
              {isMobile && (
                <h1 className="text-lg font-display font-bold text-foreground tracking-tight flex items-center gap-2">
                  <MessageCircle className="h-4.5 w-4.5 text-primary" />
                  Indbakke
                </h1>
              )}
              {/* Quick stats — hidden on mobile */}
              <div className="hidden md:grid grid-cols-3 gap-2">
                <div className="text-center py-2 rounded-lg bg-secondary/50">
                  <p className={`text-lg font-display font-bold ${stats.action > 0 ? "text-destructive" : "text-foreground"}`}>
                    {stats.action}
                  </p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Kræver svar</p>
                </div>
                <div className="text-center py-2 rounded-lg bg-secondary/50">
                  <p className={`text-lg font-display font-bold ${stats.withReports > 0 ? "text-primary" : "text-foreground"}`}>
                    {stats.withReports}
                  </p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Ny rapport</p>
                </div>
                <div className="text-center py-2 rounded-lg bg-secondary/50">
                  <p className="text-lg font-display font-bold text-foreground">{stats.total}</p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Total</p>
                </div>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Søg virksomhed eller koncern..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>

              {/* Filter tabs */}
              {isMobile ? (
                <div className="flex gap-1.5">
                  {ADVISOR_FILTER_CONFIG.filter(f => f.key === "action" || f.key === "mine").map((f) => {
                    const count = f.key === "action" ? stats.action : stats.mine;
                    const isActive = activeFilter === f.key;
                    return (
                      <button
                        key={f.key}
                        onClick={() => setActiveFilter(f.key)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-medium transition-colors whitespace-nowrap ${
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary"
                        }`}
                      >
                        <f.icon className="h-3 w-3" />
                        {f.label}
                        {count > 0 && (
                          <span className={`ml-0.5 text-[9px] ${isActive ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}

                  <Drawer open={mobileFilterDrawerOpen} onOpenChange={setMobileFilterDrawerOpen}>
                    <button
                      onClick={() => setMobileFilterDrawerOpen(true)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-medium transition-colors whitespace-nowrap ${
                        activeFilter !== "action" && activeFilter !== "mine"
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary"
                      }`}
                    >
                      <Filter className="h-3 w-3" />
                      {activeFilter !== "action" && activeFilter !== "mine"
                        ? ADVISOR_FILTER_CONFIG.find(f => f.key === activeFilter)?.label || "Filtre"
                        : "Filtre"}
                    </button>
                    <DrawerContent>
                      <DrawerHeader>
                        <DrawerTitle>Filtre</DrawerTitle>
                      </DrawerHeader>
                      <div className="px-4 pb-6 space-y-1">
                        {ADVISOR_FILTER_CONFIG.map((f) => {
                          const count = f.key === "action" ? stats.action
                            : f.key === "mine" ? stats.mine
                            : f.key === "alle" ? stats.total
                            : f.key === "unassigned" ? stats.unassigned
                            : stats.withReports;
                          const isActive = activeFilter === f.key;
                          return (
                            <button
                              key={f.key}
                              onClick={() => { setActiveFilter(f.key); setMobileFilterDrawerOpen(false); }}
                              className={`flex items-center gap-3 w-full px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                                isActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-secondary"
                              }`}
                            >
                              <f.icon className="h-4 w-4" />
                              <span className="flex-1 text-left">{f.label}</span>
                              {count > 0 && (
                                <span className={`text-xs ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                                  {count}
                                </span>
                              )}
                              {isActive && <Check className="h-4 w-4 text-primary" />}
                            </button>
                          );
                        })}
                      </div>
                      <div className="safe-bottom-spacer" />
                    </DrawerContent>
                  </Drawer>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {ADVISOR_FILTER_CONFIG.map((f) => {
                    const count = f.key === "action" ? stats.action
                      : f.key === "mine" ? stats.mine
                      : f.key === "alle" ? stats.total
                      : f.key === "unassigned" ? stats.unassigned
                      : stats.withReports;
                    const isActive = activeFilter === f.key;
                    return (
                      <button
                        key={f.key}
                        onClick={() => setActiveFilter(f.key)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-medium transition-colors whitespace-nowrap ${
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary"
                        }`}
                      >
                        <f.icon className="h-3 w-3" />
                        {f.label}
                        {count > 0 && f.key !== "alle" && (
                          <span className={`ml-0.5 text-[9px] ${isActive ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {activeFilter === "rapporter" && stats.withReports > 0 && (
                <button
                  onClick={handleMarkReportsAsRead}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-medium transition-colors bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary whitespace-nowrap"
                >
                  <CheckCheck className="h-3 w-3" />
                  Markér alle som læst
                </button>
              )}
            </div>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto">
              {(() => {
                const companyConvs = filteredConversations.filter(c => c.threadType !== "group");
                const groupConvs = filteredConversations.filter(c => c.threadType === "group");
                const showGroups = (activeFilter === "alle" || activeFilter === "action") && groupConvs.length > 0;

                const renderConvCard = (conv: ConversationWithProfile) => {
                  const isActive = activeConvId === conv.id;
                  const isResolved = conv.conversation_status === 'resolved';
                  const now = new Date();
                  const hasExpiredSnooze = !!conv.follow_up_at && new Date(conv.follow_up_at) <= now;
                  const hasFutureSnooze = !!conv.follow_up_at && new Date(conv.follow_up_at) > now;
                  const isActionable = !isResolved && conv.awaiting_reply_from === "advisor" && (!conv.acknowledged_at || hasExpiredSnooze);
                  const isAcknowledged = !!conv.acknowledged_at && !hasExpiredSnooze;
                  const assignedInitials = getAdvisorInitials(conv.assigned_advisor_id);

                  return (
                    <button
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv.id)}
                      className={`w-full text-left px-4 py-3.5 border-b border-border/30 transition-colors ${
                        isActive
                          ? "bg-primary/5 border-l-2 border-l-primary"
                          : isActionable
                          ? "bg-destructive/[0.03] hover:bg-secondary/50"
                          : "hover:bg-secondary/30"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="relative flex-shrink-0">
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center overflow-hidden ${
                            isActionable ? "bg-destructive/10" : "bg-primary/10"
                          }`}>
                            {conv.threadType === "group" ? (
                              <Layers className={`h-4.5 w-4.5 ${isActionable ? "text-destructive" : "text-primary"}`} />
                            ) : conv.companyLogoUrl ? (
                              <img src={conv.companyLogoUrl} alt="" className="h-10 w-10 object-cover" />
                            ) : (
                              <span className={`text-xs font-semibold ${isActionable ? "text-destructive" : "text-primary"}`}>
                                {getInitialsLocal(conv.companyName || conv.profile?.full_name || "??")}
                              </span>
                            )}
                          </div>
                          {isActionable && (
                            <div className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-destructive border-2 border-card" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className={`text-sm truncate ${isActionable ? "font-bold text-foreground" : "font-medium text-foreground"}`}>
                                {conv.companyName || conv.profile?.full_name || "Ukendt"}
                              </p>
                            </div>
                            <span className="text-[10px] text-muted-foreground ml-2 flex-shrink-0">
                              {relativeTime(conv.last_message_at)}
                            </span>
                          </div>

                          {conv.lastMessage && (
                            <p className={`text-xs truncate ${isActionable ? "text-foreground/70 font-medium" : "text-muted-foreground"}`}>
                              {conv.lastMessageSenderId && conv.lastMessageSenderId !== user?.id ? "" : "Du: "}
                              {conv.lastMessage}
                            </p>
                          )}

                          <div className="flex items-center gap-1.5 mt-1.5">
                            {isResolved && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                                <CheckCheck className="h-2.5 w-2.5" />
                                Afsluttet
                              </span>
                            )}
                            {!isResolved && isActionable && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                                <Clock className="h-2.5 w-2.5" />
                                Afventer svar
                                {conv.last_member_message_at && (
                                  <span className="text-destructive/70">
                                    · {formatDistanceToNow(new Date(conv.last_member_message_at), { locale: da })}
                                  </span>
                                )}
                              </span>
                            )}
                            {!isResolved && !isActionable && conv.awaiting_reply_from === "company" && !isAcknowledged && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                                <ArrowRightLeft className="h-2.5 w-2.5" />
                                {conv.threadType === "group" ? "Afventer koncern" : "Afventer virksomhed"}
                              </span>
                            )}
                            {!isResolved && isAcknowledged && conv.awaiting_reply_from !== "advisor" && !hasFutureSnooze && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                <Check className="h-2.5 w-2.5" />
                                Følger op
                              </span>
                            )}
                            {!isResolved && hasFutureSnooze && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                <Clock className="h-2.5 w-2.5" />
                                Følg op {format(new Date(conv.follow_up_at!), "d. MMM", { locale: da })}
                              </span>
                            )}
                            {conv.hasRecentReport && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                <FileText className="h-2.5 w-2.5" />
                                {conv.recentReportName
                                  ? conv.recentReportName.length > 15
                                    ? conv.recentReportName.slice(0, 15) + "…"
                                    : conv.recentReportName
                                  : "Ny rapport"}
                                <span
                                  onClick={(e) => handleMarkSingleReportRead(conv.id, conv.recentReportIds || [], e)}
                                  className="ml-0.5 hover:text-destructive cursor-pointer text-xs leading-none"
                                  title="Markér som læst"
                                >
                                  ×
                                </span>
                              </span>
                            )}
                            {conv.threadType !== "group" && conversationNoteIds.has(conv.id) && (
                              <span title="Har intern note"><StickyNote className="h-3 w-3 text-amber-500/70 flex-shrink-0" /></span>
                            )}
                            {assignedInitials && (
                              <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted text-[8px] font-bold text-muted-foreground ml-auto flex-shrink-0" title={getAdvisorName(conv.assigned_advisor_id) || ""}>
                                {assignedInitials}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                };

                if (companyConvs.length === 0 && groupConvs.length === 0) {
                  return (
                    <div className="p-6 text-center">
                      <Inbox className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">
                        {searchQuery ? "Ingen resultater"
                          : activeFilter === "action" ? "Ingen samtaler kræver svar 🎉"
                          : activeFilter === "mine" ? "Ingen samtaler tildelt dig"
                          : activeFilter === "unassigned" ? "Alle samtaler har en ejer"
                          : "Ingen samtaler i denne kategori"}
                      </p>
                      {activeFilter !== "alle" && !searchQuery && (
                        <button
                          onClick={() => setActiveFilter("alle")}
                          className="text-xs text-primary hover:underline mt-2"
                        >
                          Vis alle samtaler
                        </button>
                      )}
                    </div>
                  );
                }

                return (
                  <>
                    {companyConvs.map(renderConvCard)}

                    {showGroups && (
                      <>
                        <div className="px-4 py-2 border-t border-border">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <Layers className="h-3 w-3" />
                            Koncerner ({groupConvs.length})
                          </p>
                        </div>
                        {groupConvs.map(renderConvCard)}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* ─── MESSAGE AREA ─── */}
        {showMessageArea && (
          <div className="flex-1 flex flex-col">
            {activeConvId ? (
              <>
                {/* Header */}
                {isAdvisor ? (
                  <div className="px-4 md:px-5 py-3 border-b border-border flex items-center gap-3">
                    {isMobile && (
                      <button
                        onClick={handleBackToList}
                        className="p-1.5 -ml-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      >
                        <ArrowLeft className="h-5 w-5" />
                      </button>
                    )}
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                      {isGroupThread ? (
                        <Layers className="h-4 w-4 text-primary" />
                      ) : activeConv?.companyLogoUrl ? (
                        <img src={activeConv.companyLogoUrl} alt="" className="h-8 w-8 object-cover" />
                      ) : (
                        <span className="text-xs font-semibold text-primary">
                          {getInitialsLocal(activeConv?.companyName || "??")}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {isGroupThread ? activeConv?.groupName || "Koncern" : activeConv?.companyName || "Ukendt"}
                      </p>
                      {!isAdvisor && (
                       <p className="text-[10px] text-muted-foreground">
                          {advisorNamesLabel}
                        </p>
                      )}
                      {participants.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className="flex -space-x-1.5">
                            {participants.slice(0, 4).map((p) => (
                              <div
                                key={p.user_id}
                                className="h-5 w-5 rounded-full border-2 border-background bg-muted flex items-center justify-center overflow-hidden"
                                title={p.full_name}
                              >
                                {p.avatar_url ? (
                                  <img src={p.avatar_url} alt="" className="h-5 w-5 object-cover" />
                                ) : (
                                  <span className="text-[8px] font-medium text-muted-foreground">
                                    {getInitialsLocal(p.full_name || "?")}
                                  </span>
                                )}
                              </div>
                            ))}
                            {participants.length > 4 && (
                              <div className="h-5 w-5 rounded-full border-2 border-background bg-muted flex items-center justify-center">
                                <span className="text-[8px] font-medium text-muted-foreground">+{participants.length - 4}</span>
                              </div>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground truncate">
                            {(() => {
                              const members = participants.filter(p => !p.isAdvisor);
                              const advisors = participants.filter(p => p.isAdvisor);
                              const shortName = (name: string) => {
                                const parts = name.split(" ");
                                return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
                              };
                              const names = members.slice(0, 2).map(p => shortName(p.full_name));
                              if (members.length > 2) names.push(`+${members.length - 2}`);
                              const advisorCount = advisors.length;
                              const parts = [...names];
                              if (advisorCount > 0) parts.push(`${advisorCount} rådgiver${advisorCount > 1 ? "e" : ""}`);
                              return parts.join(", ");
                            })()}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Advisor prev/next navigation */}
                    {isAdvisor && advisorConvList.length > 1 && (
                      <div className="flex items-center gap-1 ml-auto">
                        <button
                          onClick={() => prevConv && setActiveConvId(prevConv.id)}
                          disabled={!prevConv}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 transition-colors"
                          title={prevConv ? `← ${prevConv.companyName}` : undefined}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="text-[10px] text-muted-foreground">
                          {currentConvIdx + 1} / {advisorConvList.length}
                        </span>
                        <button
                          onClick={() => nextConv && setActiveConvId(nextConv.id)}
                          disabled={!nextConv}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 transition-colors"
                          title={nextConv ? `${nextConv.companyName} →` : undefined}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    )}

                    {/* Advisor action controls */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Assignment popover */}
                      <Popover open={assignmentPopoverOpen} onOpenChange={setAssignmentPopoverOpen} modal={false}>
                        <PopoverTrigger asChild>
                          <button
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors border ${
                              activeConv?.assigned_advisor_id
                                ? "bg-primary/10 text-primary border-primary/20"
                                : "bg-secondary/50 text-muted-foreground border-border hover:bg-secondary"
                            }`}
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            <span className="hidden md:inline">
                              {activeConv?.assigned_advisor_id
                                ? getAdvisorName(activeConv.assigned_advisor_id) || "Tildelt"
                                : "Tildel"}
                            </span>
                            <ChevronDown className={`h-3 w-3 transition-transform ${assignmentPopoverOpen ? "rotate-180" : ""}`} />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" sideOffset={8} collisionPadding={16} className="w-52 p-0 z-[200]">
                          <div className="px-3 py-1.5 border-b border-border">
                            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Tildel rådgiver</span>
                          </div>
                          {advisorUsersError ? (
                            <div className="px-3 py-3 text-xs text-destructive text-center">
                              Kunne ikke hente rådgivere
                            </div>
                          ) : (!advisorUsers || advisorUsers.length === 0) ? (
                            <div className="px-3 py-3 text-xs text-muted-foreground text-center">
                              Ingen rådgivere fundet
                            </div>
                          ) : (
                            <>
                              {advisorUsers.map((a: any) => {
                                const isCurrent = activeConv?.assigned_advisor_id === a.user_id;
                                return (
                                  <button
                                    key={a.user_id}
                                    onClick={() => { handleAssignAdvisor(a.user_id); setAssignmentPopoverOpen(false); }}
                                    className={`flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors text-foreground ${
                                      isCurrent ? "bg-primary/5 font-medium" : "hover:bg-secondary/60"
                                    }`}
                                  >
                                    <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                                      {a.avatar_url ? (
                                        <img src={a.avatar_url} alt="" className="h-5 w-5 object-cover" />
                                      ) : (
                                        <span className="text-[8px] font-medium text-muted-foreground">{getInitialsLocal(a.full_name)}</span>
                                      )}
                                    </div>
                                    <span className="truncate">{a.full_name}</span>
                                    {isCurrent && (
                                      <Check className="h-3 w-3 text-primary ml-auto flex-shrink-0" />
                                    )}
                                  </button>
                                );
                              })}
                              {activeConv?.assigned_advisor_id && (
                                <button
                                  onClick={() => { handleAssignAdvisor(null); setAssignmentPopoverOpen(false); }}
                                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors border-t border-border"
                                >
                                  Fjern tildeling
                                </button>
                              )}
                            </>
                          )}
                        </PopoverContent>
                      </Popover>

                      {/* Acknowledge button */}
                      {activeConv?.awaiting_reply_from === "advisor" && !activeConv?.acknowledged_at && activeConv?.conversation_status !== 'resolved' && (
                        <button
                          onClick={handleAcknowledge}
                          title="Fjerner samtalen fra 'Kræver svar' uden at sende en besked"
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span className="hidden md:inline">Jeg følger op</span>
                        </button>
                      )}

                      {/* Active snooze indicator */}
                      {activeConv?.awaiting_reply_from === "advisor" && activeConv?.conversation_status !== 'resolved' &&
                        activeConv?.follow_up_at && new Date(activeConv.follow_up_at) > new Date() && !isMobile && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          <Clock className="h-3 w-3" />
                          Følger op d. {format(new Date(activeConv.follow_up_at), "d. MMM", { locale: da })}
                          <button
                            onClick={handleCancelSnooze}
                            className="ml-0.5 hover:text-destructive transition-colors"
                            title="Fjern opfølgning"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      )}

                      {/* Desktop: inline snooze + resolve controls */}
                      {!isMobile && (
                        <>
                          {activeConv?.awaiting_reply_from === "advisor" && activeConv?.conversation_status !== 'resolved' && (
                            <Popover open={snoozePopoverOpen} onOpenChange={(open) => { setSnoozePopoverOpen(open); if (!open) setSnoozeShowCalendar(false); }}>
                              <PopoverTrigger asChild>
                                <button
                                  title="Sæt en opfølgningsdato — samtalen forsvinder midlertidigt fra køen"
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20"
                                >
                                  <Clock className="h-3.5 w-3.5" />
                                  <span className="hidden md:inline">Følg op senere</span>
                                </button>
                              </PopoverTrigger>
                              <PopoverContent align="end" sideOffset={8} className="w-auto p-0 z-[200]">
                                {!snoozeShowCalendar ? (
                                  <div className="py-1">
                                    <div className="px-3 py-1.5 border-b border-border">
                                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Følg op</span>
                                    </div>
                                    <button
                                      onClick={() => handleSnooze(getSnoozeDate('tomorrow'))}
                                      className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-secondary/60 transition-colors text-foreground"
                                    >
                                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                      I morgen
                                      <span className="ml-auto text-muted-foreground text-[10px]">
                                        {format(getSnoozeDate('tomorrow'), "EEE d. MMM", { locale: da })}
                                      </span>
                                    </button>
                                    <button
                                      onClick={() => handleSnooze(getSnoozeDate('3days'))}
                                      className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-secondary/60 transition-colors text-foreground"
                                    >
                                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                      Om 3 dage
                                      <span className="ml-auto text-muted-foreground text-[10px]">
                                        {format(getSnoozeDate('3days'), "EEE d. MMM", { locale: da })}
                                      </span>
                                    </button>
                                    <button
                                      onClick={() => handleSnooze(getSnoozeDate('nextweek'))}
                                      className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-secondary/60 transition-colors text-foreground"
                                    >
                                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                      Næste uge
                                      <span className="ml-auto text-muted-foreground text-[10px]">
                                        {format(getSnoozeDate('nextweek'), "EEE d. MMM", { locale: da })}
                                      </span>
                                    </button>
                                    <div className="border-t border-border">
                                      <button
                                        onClick={() => setSnoozeShowCalendar(true)}
                                        className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-secondary/60 transition-colors text-foreground"
                                      >
                                        <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                        Vælg dato
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="px-3 py-1.5 border-b border-border flex items-center justify-between">
                                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Vælg dato</span>
                                      <button
                                        onClick={() => setSnoozeShowCalendar(false)}
                                        className="text-muted-foreground hover:text-foreground transition-colors"
                                      >
                                        <ArrowLeft className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                    <Calendar
                                      mode="single"
                                      selected={undefined}
                                      onSelect={(date) => {
                                        if (date) {
                                          const snoozeDate = setSeconds(setMinutes(setHours(date, 9), 0), 0);
                                          handleSnooze(snoozeDate);
                                        }
                                      }}
                                      disabled={(date) => date < new Date()}
                                      className="p-3 pointer-events-auto"
                                    />
                                  </div>
                                )}
                              </PopoverContent>
                            </Popover>
                          )}

                          {(!activeConv?.conversation_status || activeConv?.conversation_status === 'open') && (
                            <button
                              onClick={handleResolve}
                              title="Markerer samtalen som afsluttet. Genåbnes automatisk ved ny besked."
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors bg-muted text-muted-foreground border border-border hover:bg-secondary"
                            >
                              <CheckCheck className="h-3.5 w-3.5" />
                              <span className="hidden md:inline">Afslut samtale</span>
                            </button>
                          )}

                          {activeConv?.hasRecentReport && (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                              <FileText className="h-3 w-3" />
                              Ny rapport
                            </span>
                          )}
                        </>
                      )}

                      {/* Mobile: overflow Drawer for snooze + resolve */}
                      {isMobile && (
                        <Drawer open={mobileActionsDrawerOpen} onOpenChange={setMobileActionsDrawerOpen}>
                          <button
                            onClick={() => setMobileActionsDrawerOpen(true)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          <DrawerContent>
                            <DrawerHeader>
                              <DrawerTitle>Handlinger</DrawerTitle>
                            </DrawerHeader>
                            <div className="px-4 pb-6 space-y-1">
                              {activeConv?.follow_up_at && new Date(activeConv.follow_up_at) > new Date() && (
                                <div className="flex items-center gap-3 px-3 py-3 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 text-sm">
                                  <Clock className="h-4 w-4" />
                                  <span className="flex-1">Følger op d. {format(new Date(activeConv.follow_up_at), "d. MMM", { locale: da })}</span>
                                  <button onClick={() => { handleCancelSnooze(); setMobileActionsDrawerOpen(false); }} className="text-xs underline">
                                    Fjern
                                  </button>
                                </div>
                              )}

                              {activeConv?.awaiting_reply_from === "advisor" && activeConv?.conversation_status !== 'resolved' && (
                                <>
                                  <button
                                    onClick={() => { handleSnooze(getSnoozeDate('tomorrow')); setMobileActionsDrawerOpen(false); }}
                                    className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-sm text-foreground hover:bg-secondary transition-colors"
                                  >
                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                    <span className="flex-1 text-left">Følg op i morgen</span>
                                    <span className="text-xs text-muted-foreground">{format(getSnoozeDate('tomorrow'), "EEE d. MMM", { locale: da })}</span>
                                  </button>
                                  <button
                                    onClick={() => { handleSnooze(getSnoozeDate('3days')); setMobileActionsDrawerOpen(false); }}
                                    className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-sm text-foreground hover:bg-secondary transition-colors"
                                  >
                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                    <span className="flex-1 text-left">Følg op om 3 dage</span>
                                    <span className="text-xs text-muted-foreground">{format(getSnoozeDate('3days'), "EEE d. MMM", { locale: da })}</span>
                                  </button>
                                  <button
                                    onClick={() => { handleSnooze(getSnoozeDate('nextweek')); setMobileActionsDrawerOpen(false); }}
                                    className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-sm text-foreground hover:bg-secondary transition-colors"
                                  >
                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                    <span className="flex-1 text-left">Følg op næste uge</span>
                                    <span className="text-xs text-muted-foreground">{format(getSnoozeDate('nextweek'), "EEE d. MMM", { locale: da })}</span>
                                  </button>
                                </>
                              )}

                              {(!activeConv?.conversation_status || activeConv?.conversation_status === 'open') && (
                                <button
                                  onClick={() => { handleResolve(); setMobileActionsDrawerOpen(false); }}
                                  className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-sm text-foreground hover:bg-secondary transition-colors border-t border-border mt-2 pt-3"
                                >
                                  <CheckCheck className="h-4 w-4 text-muted-foreground" />
                                  <span className="flex-1 text-left">Afslut samtale</span>
                                </button>
                              )}

                              {activeConv?.hasRecentReport && (
                                <div className="flex items-center gap-3 px-3 py-3 rounded-lg bg-primary/5 text-primary text-sm">
                                  <FileText className="h-4 w-4" />
                                  <span>Ny rapport vedhæftet</span>
                                </div>
                              )}
                            </div>
                            <div className="safe-bottom-spacer" />
                          </DrawerContent>
                        </Drawer>
                      )}
                    </div>
                  </div>
                ) : (allAdvisors && allAdvisors.length > 0) ? (
                  <div className="px-4 md:px-5 py-3 border-b border-border flex items-center gap-3">
                    {isMobile && (
                      <button
                        onClick={handleBackToList}
                        className="p-1.5 -ml-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      >
                        <ArrowLeft className="h-5 w-5" />
                      </button>
                    )}
                    <div className="flex items-center gap-1.5">
                      <div className="flex -space-x-1.5">
                        {allAdvisors.slice(0, 3).map((p) => (
                          <div
                            key={p.user_id}
                            className="h-5 w-5 rounded-full border-2 border-background bg-muted flex items-center justify-center overflow-hidden"
                            title={p.full_name}
                          >
                            {p.avatar_url ? (
                              <img src={p.avatar_url} alt="" className="h-5 w-5 object-cover" />
                            ) : (
                              <span className="text-[8px] font-medium text-muted-foreground">
                                {getInitialsLocal(p.full_name || "?")}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        Dine rådgivere: {allAdvisors.map(p => p.full_name.split(" ")[0]).join(", ")}
                      </span>
                    </div>
                  </div>
                ) : null}

                {/* Internal advisor note */}
                {isAdvisor && activeConvId && !isGroupThread && (
                  <Collapsible open={noteExpanded} onOpenChange={setNoteExpanded}>
                    <div className="border-b border-amber-500/20 bg-amber-500/5">
                      <CollapsibleTrigger asChild>
                        <button className="w-full flex items-center gap-2 px-4 py-1.5 text-left hover:bg-amber-500/10 transition-colors">
                          <StickyNote className="h-3 w-3 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                          <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300 uppercase tracking-wider">Intern note</span>
                          {!noteExpanded && noteDbContent.trim() && (
                            <span className="text-[10px] text-amber-600/60 dark:text-amber-400/60 truncate max-w-[200px]">
                              — {noteDbContent.trim().slice(0, 40)}{noteDbContent.trim().length > 40 ? "…" : ""}
                            </span>
                          )}
                          <ChevronDown className={`h-3 w-3 ml-auto text-amber-600 dark:text-amber-400 transition-transform ${noteExpanded ? "rotate-180" : ""}`} />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-4 pb-2">
                          <Textarea
                            value={noteContent}
                            onChange={(e) => setNoteContent(e.target.value)}
                            onBlur={handleNoteSave}
                            placeholder="Skriv en intern note om denne samtale..."
                            className="min-h-[60px] max-h-[120px] text-xs bg-transparent border-amber-500/20 focus-visible:ring-amber-500/30 resize-none placeholder:text-amber-600/40 dark:placeholder:text-amber-400/40"
                          />
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[9px] text-amber-600/50 dark:text-amber-400/50">
                              {noteSaveStatus === 'saving' ? "Gemmer..." : noteSaveStatus === 'saved' ? "Gemt ✓" : ""}
                              {noteMeta?.updated_at && noteSaveStatus === 'idle' && (
                                <>Opdateret {formatDistanceToNow(new Date(noteMeta.updated_at), { addSuffix: true, locale: da })}</>
                              )}
                            </span>
                            <span className="text-[9px] text-amber-600/40 dark:text-amber-400/40">Kun synlig for rådgivere</span>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                )}

                {/* Pinned messages section */}
                {pinnedMessages.length > 0 && !isGroupThread && (
                  <Collapsible>
                    <div className="border-b border-border bg-primary/[0.02]">
                      <CollapsibleTrigger asChild>
                        <button className="w-full flex items-center gap-2 px-4 py-1.5 text-left hover:bg-primary/5 transition-colors">
                          <Pin className="h-3 w-3 text-primary" />
                          <span className="text-[10px] font-medium text-primary uppercase tracking-wider">
                            {isAdvisor ? `Pinned (${pinnedMessages.length})` : `Vigtige beskeder (${pinnedMessages.length})`}
                          </span>
                          <ChevronDown className="h-3 w-3 ml-auto text-primary transition-transform" />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-4 pb-2 space-y-1.5">
                          {pinnedMessages.map(pm => (
                            <button
                              key={pm.id}
                              onClick={() => scrollToMessage(pm.id)}
                              className="w-full text-left p-2 rounded-md bg-card hover:bg-secondary/50 border border-border/50 transition-colors"
                            >
                              <p className="text-[11px] text-foreground line-clamp-2">
                                {pm.content.replace(/<[^>]+>/g, '').slice(0, 100)}
                              </p>
                              <p className="text-[9px] text-muted-foreground mt-0.5">
                                {profilesMap.get(pm.sender_id)?.full_name || "Ukendt"} · {format(new Date(pm.created_at), "d. MMM HH:mm", { locale: da })}
                              </p>
                            </button>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                )}

                {/* Topic filter row */}
                {isAdvisor && !isGroupThread && (
                  <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                    {TOPIC_CONFIG.map(t => {
                      const isActive = topicFilter === t.key;
                      return (
                        <button
                          key={t.key}
                          onClick={() => setTopicFilter(t.key)}
                          className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors ${
                            isActive ? `${t.color} ring-1 ring-current/20` : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                          }`}
                        >
                          <t.icon className="h-3 w-3" />
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Advisor context banner */}
                {isAdvisor && activeConv && !isGroupThread && (
                  <>
                    <div className="flex items-center gap-3 px-4 py-2 bg-primary/5 border-b border-primary/10">
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                        {activeConv.companyLogoUrl ? (
                          <img src={activeConv.companyLogoUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                        ) : (
                          <span className="text-[9px] font-bold text-primary">
                            {(activeConv.companyName || "?").slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-primary font-medium flex-1">
                        Du svarer <span className="font-semibold">{activeConv.companyName}</span> som rådgiver
                      </p>
                      {activeConv.conversation_status === "open" && activeConv.awaiting_reply_from === "advisor" && (
                        <span className="text-[10px] font-medium text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">
                          Afventer dit svar
                        </span>
                      )}
                    </div>
                    {latestPulse?.help_needed && (
                      <div className="px-4 py-2 bg-amber-500/5 border-b border-amber-500/10">
                        <p className="text-[11px] text-amber-700 dark:text-amber-400">
                          <span className="font-semibold">Brug for hjælp til:</span> {latestPulse.help_needed}
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* Messages list */}
                <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 md:px-5 py-4 space-y-4">
                  {filteredMessages.length === 0 && !activeConvId?.startsWith("group_") && (
                    <div className="flex flex-col items-center justify-center h-full py-16 text-center px-8">
                      <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                        <MessageSquare className="h-6 w-6 text-primary" />
                      </div>
                      <p className="text-sm font-semibold text-foreground mb-1">
                        Din direkte linje til rådgiverne
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
                        Skriv hvad du har på hjerte — spørgsmål, opdateringer eller bare hvad der fylder. Morten og Jonas læser dine tal og svarer hurtigt.
                      </p>
                    </div>
                  )}
                  {(() => {
                    let lastDateKey = "";
                    let unreadDividerShown = false;
                    return filteredMessages.map((msg, msgIdx) => {
                      const isMine = msg.sender_id === user?.id;
                      const contextType = msg.context_type || null;
                      const contextMeta = msg.context_meta || null;
                      const topicInfo = contextType && TOPIC_COLORS[contextType] ? TOPIC_COLORS[contextType] : null;

                      // Date separator
                      const msgDate = new Date(msg.created_at);
                      const dateKey = startOfDay(msgDate).toISOString();
                      let dateSep: React.ReactNode = null;
                      if (dateKey !== lastDateKey) {
                        lastDateKey = dateKey;
                        dateSep = (
                          <div className="flex items-center gap-3 py-2">
                            <div className="flex-1 border-t border-border" />
                            <span className="text-[11px] text-muted-foreground font-medium">{dateSeparatorLabel(msgDate)}</span>
                            <div className="flex-1 border-t border-border" />
                          </div>
                        );
                      }

                      // System / AI messages
                      if (msg.message_type === "system" || msg.message_type === "ai") {
                        return (
                          <React.Fragment key={msg.id}>
                            {dateSep}
                          <div
                            ref={(el) => { if (el) messageRefs.current.set(msg.id, el); }}
                            className="flex justify-center group/msg transition-all duration-300"
                          >
                            <div
                              className={`max-w-[90%] md:max-w-[85%] rounded-xl border border-border/50 bg-muted/30 px-4 md:px-5 py-3 md:py-4 relative ${msg.pinned_at ? "ring-1 ring-primary/20" : ""}`}
                            >
                              <button
                                onClick={() => togglePin(msg)}
                                className={`absolute top-2 right-2 p-1 rounded-md transition-all ${
                                  msg.pinned_at
                                    ? "text-primary opacity-100 hover:text-destructive"
                                    : "text-muted-foreground opacity-0 group-hover/msg:opacity-100 hover:text-primary hover:bg-primary/10"
                                }`}
                                title={msg.pinned_at ? "Fjern pin" : "Pin besked"}
                              >
                                <Pin className="h-3.5 w-3.5" />
                              </button>
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <Sparkles className="h-3.5 w-3.5 text-primary" />
                                <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
                                  {msg.message_type === "ai" ? "AI Analyse" : "System"}
                                </span>
                                {topicInfo && (
                                  <span className={`inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full ${topicInfo.bg} ${topicInfo.text}`}>
                                    <topicInfo.icon className="h-2.5 w-2.5" />
                                    {topicInfo.label}
                                  </span>
                                )}
                                <span className="text-[10px] text-muted-foreground">
                                  {format(new Date(msg.created_at), "HH:mm", { locale: da })}
                                </span>
                              </div>
                              <div className="text-sm text-foreground leading-relaxed chat-html-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.content, { ALLOWED_TAGS: ['b','strong','i','em','ul','ol','li','a','p','br'], ALLOWED_ATTR: ['href','target','rel'] }) }} />
                              {contextType && contextMeta?.title && (
                                <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md bg-secondary text-muted-foreground">
                                  {contextType === "report" && <FileText className="h-3 w-3" />}
                                  {contextType === "milestone" && <Target className="h-3 w-3" />}
                                  {String(contextMeta.title)}
                                </div>
                              )}
                            </div>
                          </div>
                        </React.Fragment>
                        );
                      }

                      const participant = participants.find(p => p.user_id === msg.sender_id);
                      const senderProfile = participant || profilesMap.get(msg.sender_id);
                      const senderName = senderProfile?.full_name || (participant?.isAdvisor ? "Rådgiver" : "Medlem");
                      const senderAvatar = senderProfile?.avatar_url;

                      // Unread divider
                      let showUnreadDivider = false;
                      if (!unreadDividerShown && companyLastSeenId && companyLastSeenId !== latestMsgId && msgIdx > 0) {
                        if (filteredMessages[msgIdx - 1].id === companyLastSeenId && !isMine) {
                          showUnreadDivider = true;
                          unreadDividerShown = true;
                        }
                      }

                      const isEditingThis = editingId === msg.id;

                      return (
                        <React.Fragment key={msg.id}>
                          {dateSep}
                          {showUnreadDivider && (
                            <div className="flex items-center gap-3 py-2">
                              <div className="flex-1 border-t border-primary/50" />
                              <span className="text-[11px] text-primary font-semibold px-2">Nye beskeder</span>
                              <div className="flex-1 border-t border-primary/50" />
                            </div>
                          )}
                        <div
                          ref={(el) => { if (el) messageRefs.current.set(msg.id, el); }}
                          className={`flex group/msg ${isMine ? "justify-end" : "justify-start"} items-end gap-2 transition-all duration-300`}
                        >
                          {!isMine && (
                            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0 mb-1">
                              {senderAvatar ? (
                                <img src={senderAvatar} alt="" className="h-7 w-7 object-cover" />
                              ) : (
                                <span className="text-[9px] font-semibold text-muted-foreground">
                                  {getInitialsLocal(senderName)}
                                </span>
                              )}
                            </div>
                          )}
                          <div
                            className={`${isMobile ? "max-w-[85%]" : "max-w-[70%]"} relative ${msg.pinned_at ? "ring-1 ring-primary/20 rounded-2xl" : ""}`}
                          >
                            {!isMobile && !isEditingThis && (
                              <div className={`absolute ${isMine ? "-left-20" : "-right-20"} top-1/2 -translate-y-1/2 flex gap-0.5 z-10`}>
                                <button
                                  onClick={() => togglePin(msg)}
                                  className={`p-1 rounded-md transition-all ${
                                    msg.pinned_at
                                      ? "text-primary opacity-100 hover:text-destructive"
                                      : "text-muted-foreground opacity-0 group-hover/msg:opacity-100 hover:text-primary hover:bg-primary/10"
                                  }`}
                                  title={msg.pinned_at ? "Fjern pin" : "Pin besked"}
                                >
                                  <Pin className="h-3.5 w-3.5" />
                                </button>
                                <ReactionPicker
                                  onSelect={(emoji) => toggleReaction(msg.id, emoji)}
                                  isMine={isMine}
                                />
                                <MessageActionMenu
                                  canEdit={canEditCheck(msg.sender_id, msg.created_at)}
                                  canDelete={canDeleteCheck(msg.sender_id)}
                                  onEdit={() => startEdit(msg.id, msg.content)}
                                  onDelete={() => handleDeleteMsg(msg.id)}
                                  isMine={isMine}
                                />
                              </div>
                            )}
                            {isEditingThis ? (
                              <InlineEditInput
                                value={editContent}
                                onChange={setEditContent}
                                onSave={() => handleEditSave(msg.id)}
                                onCancel={cancelEdit}
                              />
                            ) : isMobile ? (
                              <MobileMessageActionDrawer
                                canEdit={canEditCheck(msg.sender_id, msg.created_at)}
                                canDelete={canDeleteCheck(msg.sender_id)}
                                onEdit={() => startEdit(msg.id, msg.content)}
                                onDelete={() => handleDeleteMsg(msg.id)}
                                onReaction={(emoji) => toggleReaction(msg.id, emoji)}
                              >
                                {isAdvisor && !isMine && (
                                  <p className="text-[10px] text-muted-foreground mb-1 ml-1">{senderName}</p>
                                )}
                                {topicInfo && (
                                  <div className={`mb-1 inline-flex items-center gap-1 text-[9px] font-medium px-2 py-0.5 rounded-full ${topicInfo.bg} ${topicInfo.text} ${isMine ? "ml-auto" : ""}`}>
                                    <topicInfo.icon className="h-2.5 w-2.5" />
                                    {topicInfo.label}
                                  </div>
                                )}
                                {contextType && contextMeta?.title && (
                                  <div className={`mb-1 inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-t-lg ${
                                    isMine ? "bg-primary/20 text-primary ml-auto" : "bg-secondary text-muted-foreground"
                                  }`}>
                                    {contextType === "report" && <FileText className="h-3 w-3" />}
                                    {contextType === "milestone" && <Target className="h-3 w-3" />}
                                    Re: {String(contextMeta.title)}
                                  </div>
                                )}
                                <div
                                  className={`rounded-2xl px-4 py-2.5 ${
                                    isMine
                                      ? "bg-primary text-primary-foreground rounded-br-md"
                                      : "bg-secondary text-foreground rounded-bl-md"
                                  } ${contextType ? "rounded-tl-md" : ""}`}
                                >
                                  {!isMine && !isAdvisor && (
                                    <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">
                                      {senderName}
                                    </p>
                                  )}
                                  {msg.content !== "📎" && (
                                    <div className="text-sm leading-relaxed chat-html-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.content, { ALLOWED_TAGS: ['b','strong','i','em','ul','ol','li','a','p','br'], ALLOWED_ATTR: ['href','target','rel'] }) }} />
                                  )}
                                  <MessageAttachments attachments={msg.context_meta?.attachments} isMine={isMine} />
                                  <div className={`flex items-center gap-1 mt-1 ${isMine ? "justify-end" : ""}`}>
                                    {(msg as any).edited_at && (
                                      <span className={`text-[9px] italic ${isMine ? "text-primary-foreground/50" : "text-muted-foreground/60"}`}>
                                        (redigeret)
                                      </span>
                                    )}
                                    <span className={`text-[10px] ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                                      {format(new Date(msg.created_at), "HH:mm", { locale: da })}
                                    </span>
                                    {!isAdvisor && isMine && msg.id === latestReadOwnMsgId && (
                                      <>
                                        <CheckCheck className="h-3 w-3 text-primary-foreground/60" />
                                        <span className="text-[10px] text-primary-foreground/60">Læst</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </MobileMessageActionDrawer>
                            ) : (
                              <>
                                {isAdvisor && !isMine && (
                                  <p className="text-[10px] text-muted-foreground mb-1 ml-1">{senderName}</p>
                                )}
                                {topicInfo && (
                                  <div className={`mb-1 inline-flex items-center gap-1 text-[9px] font-medium px-2 py-0.5 rounded-full ${topicInfo.bg} ${topicInfo.text} ${isMine ? "ml-auto" : ""}`}>
                                    <topicInfo.icon className="h-2.5 w-2.5" />
                                    {topicInfo.label}
                                  </div>
                                )}
                                {contextType && contextMeta?.title && (
                                  <div className={`mb-1 inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-t-lg ${
                                    isMine ? "bg-primary/20 text-primary ml-auto" : "bg-secondary text-muted-foreground"
                                  }`}>
                                    {contextType === "report" && <FileText className="h-3 w-3" />}
                                    {contextType === "milestone" && <Target className="h-3 w-3" />}
                                    Re: {String(contextMeta.title)}
                                  </div>
                                )}
                                <div
                                  className={`rounded-2xl px-4 py-2.5 ${
                                    isMine
                                      ? "bg-primary text-primary-foreground rounded-br-md"
                                      : "bg-secondary text-foreground rounded-bl-md"
                                  } ${contextType ? "rounded-tl-md" : ""}`}
                                >
                                  {!isMine && !isAdvisor && (
                                    <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">
                                      {senderName}
                                    </p>
                                  )}
                                  {msg.content !== "📎" && (
                                    <div className="text-sm leading-relaxed chat-html-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.content, { ALLOWED_TAGS: ['b','strong','i','em','ul','ol','li','a','p','br'], ALLOWED_ATTR: ['href','target','rel'] }) }} />
                                  )}
                                  <MessageAttachments attachments={msg.context_meta?.attachments} isMine={isMine} />
                                  <div className={`flex items-center gap-1 mt-1 ${isMine ? "justify-end" : ""}`}>
                                    {(msg as any).edited_at && (
                                      <span className={`text-[9px] italic ${isMine ? "text-primary-foreground/50" : "text-muted-foreground/60"}`}>
                                        (redigeret)
                                      </span>
                                    )}
                                    <span className={`text-[10px] ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                                      {format(new Date(msg.created_at), "HH:mm", { locale: da })}
                                    </span>
                                    {!isAdvisor && isMine && msg.id === latestReadOwnMsgId && (
                                      <>
                                        <CheckCheck className="h-3 w-3 text-primary-foreground/60" />
                                        <span className="text-[10px] text-primary-foreground/60">Læst</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </>
                            )}
                            <ReactionBar
                              reactions={getReactions(msg.id)}
                              onToggle={(emoji) => toggleReaction(msg.id, emoji)}
                              isMine={isMine}
                              getReactorName={(userId) =>
                                profilesMap.get(userId)?.full_name ||
                                participants.find(p => p.user_id === userId)?.full_name ||
                                "Ukendt"
                              }
                            />
                          </div>
                          {isMine && (
                            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0 mb-1">
                              {senderAvatar ? (
                                <img src={senderAvatar} alt="" className="h-7 w-7 object-cover" />
                              ) : (
                                <span className="text-[9px] font-semibold text-primary">
                                  {getInitialsLocal(senderName)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        </React.Fragment>
                      );
                    });
                  })()}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input with topic selector */}
                <div className="p-3 md:p-4 border-t border-border">
                  {!isGroupThread && isAdvisor && (
                    <div className="flex items-center gap-1.5 mb-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                      <span className="text-[10px] text-muted-foreground mr-1 flex-shrink-0">Emne:</span>
                      {MESSAGE_TOPICS.map(t => {
                        const isActive = selectedTopic === t.key;
                        const topicInfo = t.key ? TOPIC_COLORS[t.key] : null;
                        return (
                          <button
                            key={t.key ?? "general"}
                            type="button"
                            onClick={() => setSelectedTopic(t.key)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors whitespace-nowrap ${
                              isActive
                                ? topicInfo
                                  ? `${topicInfo.bg} ${topicInfo.text} ring-1 ring-current/20`
                                  : "bg-muted text-foreground ring-1 ring-border"
                                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                            }`}
                          >
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex gap-2 items-end">
                    <ChatRichInput
                      onSubmit={handleSend}
                      disabled={sending}
                      placeholder={isGroupThread ? "Skriv en besked til koncernen..." : selectedTopic ? `Skriv om ${MESSAGE_TOPICS.find(t => t.key === selectedTopic)?.label?.toLowerCase()}...` : `Skriv til ${advisorNamesLabel}...`}
                      maxLength={MAX_MESSAGE_LENGTH}
                    />
                  </div>
                  <div className="safe-bottom-spacer" />
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col">
                {!isAdvisor && companyName && (
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30 text-xs text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Samtale for <span className="font-medium text-foreground">{companyName}</span> med {advisorNamesLabel}</span>
                  </div>
                )}
                {!isAdvisor ? (
                  <div className="flex-1 flex items-center justify-center text-center px-6">
                    <div className="max-w-sm">
                      <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                        <MessageCircle className="h-7 w-7 text-primary" />
                      </div>
                      <h3 className="text-base font-semibold text-foreground mb-2">
                        Din direkte linje til {advisorNamesLabel}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Stil spørgsmål, del opdateringer eller få sparring på dine tal og beslutninger.
                        Vi svarer typisk inden for 24 timer.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-center">
                    <div>
                      <MessageCircle className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">Vælg en samtale for at starte</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default CompanyChatPane;
