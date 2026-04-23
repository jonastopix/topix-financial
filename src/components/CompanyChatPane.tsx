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
  CalendarIcon, StickyNote, MoreHorizontal, Layers, Building2, Loader2,
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
  isLegat?: boolean;
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

type MessageTopic = "report" | "handout" | "milestone" | "budget" | null;


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
  
  const [selectedTopic, setSelectedTopic] = useState<MessageTopic>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatSubmitRef = useRef<() => void>(() => {});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [participants, setParticipants] = useState<{ user_id: string; full_name: string; avatar_url: string | null; isAdvisor: boolean }[]>([]);
  const [companyMembers, setCompanyMembers] = useState<{ user_id: string; full_name: string; avatar_url: string | null }[]>([]);
  const [assignmentPopoverOpen, setAssignmentPopoverOpen] = useState(false);

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


  // Deep linking
  useEffect(() => {
    const convParam = searchParams.get("conversationId");
    const msgParam = searchParams.get("messageId");
    if (convParam && conversations.length > 0) {
      const conv = conversations.find(c => c.id === convParam);
      if (conv && activeConvId !== convParam) {
        setActiveConvId(convParam);
        if (isMobile) setShowMessages(true);
        // Clear URL param immediately after applying — prevents re-locking
        setSearchParams({}, { replace: true });
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

  // Fetch all company members (not just message senders) for the active conversation
  useEffect(() => {
    if (!activeConvId || activeConvId.startsWith("group_")) {
      setCompanyMembers([]);
      return;
    }
    const conv = conversations.find(c => c.id === activeConvId);
    const companyId = conv?.company_id;
    if (!companyId) { setCompanyMembers([]); return; }
    const loadMembers = async () => {
      const { data: cm } = await supabase
        .from("company_members")
        .select("user_id")
        .eq("company_id", companyId);
      const userIds = (cm || []).map(r => r.user_id);
      if (userIds.length === 0) { setCompanyMembers([]); return; }
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds);
      setCompanyMembers((profs || []).map(p => ({
        user_id: p.user_id,
        full_name: p.full_name || "Ukendt",
        avatar_url: p.avatar_url,
      })));
    };
    loadMembers();
  }, [activeConvId, conversations]);

  // Load conversations — batch fetch, no N+1
  useEffect(() => {
    if (!user) return;

    const loadConversations = async () => {
      let convsQuery = supabase
        .from("conversations")
        .select("*, companies:company_id(id, name, logo_url, is_legat)")
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
          isLegat: !!companyData?.is_legat,
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
  }, [user, isAdvisor, companyId, isCompanyOverride]);

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

  const CHECKIN_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
  const groupedConversations = useMemo(() => {
    const now = new Date();
    // Split legat from regular conversations immediately
    const regularConvs = conversations.filter(c => !c.isLegat);
    const legatConvs = conversations.filter(c => c.isLegat);
    // KRÆVER SVAR: all conversations awaiting any advisor reply, not acknowledged, not snoozed
    const needsReply = regularConvs.filter(c => {
      if (c.conversation_status === 'resolved') return false;
      if (c.awaiting_reply_from !== 'advisor') return false;
      const hasExpiredSnooze = !!c.follow_up_at && new Date(c.follow_up_at) <= now;
      return !c.acknowledged_at || hasExpiredSnooze;
    }).sort((a, b) => {
      const aT = a.last_member_message_at ? new Date(a.last_member_message_at).getTime() : 0;
      const bT = b.last_member_message_at ? new Date(b.last_member_message_at).getTime() : 0;
      return aT - bT; // oldest first = most urgent
    });
    const needsReplyIds = new Set(needsReply.map(c => c.id));
    // TJEK IND: all conversations where no advisor has written in 14+ days
    const needsCheckin = regularConvs.filter(c => {
      if (needsReplyIds.has(c.id)) return false;
      if (c.conversation_status === 'resolved') return false;
      const lastAdvisor = c.last_advisor_reply_at
        ? new Date(c.last_advisor_reply_at).getTime()
        : new Date(c.last_message_at).getTime();
      return now.getTime() - lastAdvisor > CHECKIN_THRESHOLD_MS;
    }).sort((a, b) => {
      const aLast = a.last_advisor_reply_at || a.last_message_at;
      const bLast = b.last_advisor_reply_at || b.last_message_at;
      return new Date(aLast).getTime() - new Date(bLast).getTime(); // longest without contact first
    });
    const checkinIds = new Set(needsCheckin.map(c => c.id));
    // ALLE ANDRE: everything not in the two groups above, sorted by latest activity
    const rest = regularConvs.filter(c => {
      return !needsReplyIds.has(c.id) && !checkinIds.has(c.id);
    }).sort((a, b) =>
      new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    );
    // Legat: sorted by latest message
    const legat = legatConvs.sort((a, b) =>
      new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    );
    return { needsReply, needsCheckin, rest, legat };
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
      const uploadResult = await uploadChatAttachments(user.id, files);
      attachments = uploadResult.attachments;
      if (uploadResult.failedCount > 0) {
        if (attachments.length === 0 && !trimmed) {
          setSending(false);
          toast.error("Filer kunne ikke uploades. Prøv igen.");
          return;
        }
        toast.warning(`${uploadResult.failedCount} fil${uploadResult.failedCount > 1 ? "er" : ""} kunne ikke uploades og er ikke vedhæftet.`);
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
      if (error) {
        toast.error("Beskeden kunne ikke sendes");
      } else {
        setNewMessage(""); // Fix 1: ryd inputfeltet

        // Fix 2: opdatér group_conversations awaiting_reply_from
        if (isAdvisor) {
          supabase.from("group_conversations" as any).update({
            awaiting_reply_from: "company",
            last_message_at: new Date().toISOString(),
          }).eq("id", gcId).then(() => {
            queryClient.invalidateQueries({ queryKey: ["advisor-dashboard"] });
          });

          // Fix 3: notifikation til koncern-members
          supabase.functions.invoke("notify-chat-reply", {
            body: {
              group_conversation_id: gcId,
              message_id: gcId + "_" + Date.now(),
            },
          }).catch(() => {});
        }
      }
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

          // Notify founder via in-app notification
          supabase.functions.invoke("notify-chat-reply", {
            body: {
              conversation_id: activeConvId,
              message_id: (data as any).id,
            },
          }).catch(() => {}); // fire-and-forget
        }
      }
    }

    setSending(false);
  }, [activeConvId, user, selectedTopic]);

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const isGroupThread = activeConv?.threadType === "group";

  // Pulse context for advisor chat banner — only show if from last 30 days
  const { data: latestPulse } = useQuery({
    queryKey: ["chat-pulse-context", activeConv?.company_id],
    queryFn: async () => {
      if (!activeConv?.company_id) return null;
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("pulse_checkins")
        .select("help_needed, biggest_challenge, period_key")
        .eq("company_id", activeConv.company_id)
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!isAdvisor && !!activeConv?.company_id,
    staleTime: 5 * 60_000,
  });

  // Advisor prev/next navigation — always uses full unfiltered list (filter-agnostic)
  const advisorConvList = useMemo(() => {
    if (!isAdvisor) return [];
    return [...conversations].sort(
      (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    );
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

  const handleNoActionNeeded = async () => {
    if (!activeConvId || !user) return;
    const { table, id } = getOpsTarget();
    const now = new Date().toISOString();
    const updateData = {
      awaiting_reply_from: null,
      follow_up_at: null,
      acknowledged_at: null,
      acknowledged_by_advisor_id: null,
      last_advisor_reply_at: now,
    };
    const { error } = await supabase
      .from(table as any)
      .update(updateData)
      .eq("id", id);
    if (error) { toast.error("Kunne ikke opdatere samtalen"); return; }
    setConversations(prev => prev.map(c =>
      c.id === activeConvId ? { ...c, ...updateData } : c
    ));
    toast.success("Markeret som tjekket ind");
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

  // Long-press quick-react overlay for mobile message bubbles
  const [longPressedMessageId, setLongPressedMessageId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressHandlers = useCallback((messageId: string) => ({
    onTouchStart: () => {
      longPressTimerRef.current = setTimeout(() => setLongPressedMessageId(messageId), 500);
    },
    onTouchEnd: () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    },
    onTouchMove: () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    },
  }), []);

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

      <div className={`${isMobile ? "bg-card overflow-hidden" : "glass-card overflow-hidden"} flex flex-1 min-h-0 ${isFullscreen || isMobile ? "" : "rounded-xl"}`}>
        {/* ─── ADVISOR INBOX SIDEBAR ─── */}
        {showSidebar && (
          <div className={`${isMobile ? "w-full" : "w-[340px]"} border-r border-border flex flex-col bg-card/50`}>
            {/* Search */}
            <div className="px-3 pt-3 pb-2 border-b border-border">
              {isMobile && (
                <h1 className="text-lg font-display font-bold text-foreground tracking-tight flex items-center gap-2 mb-2">
                  <MessageCircle className="h-4.5 w-4.5 text-primary" />
                  Indbakke
                </h1>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Søg virksomhed..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
            </div>

            {/* Grouped conversation list */}
            <div className="flex-1 overflow-y-auto">
              {(() => {
                // Apply search filter across all groups
                const q = searchQuery.toLowerCase().trim();
                const filterConvs = (list: ConversationWithProfile[]) =>
                  q ? list.filter(c =>
                    c.companyName?.toLowerCase().includes(q) ||
                    c.profile?.full_name?.toLowerCase().includes(q)
                  ) : list;

                const replyList = filterConvs(groupedConversations.needsReply);
                const checkinList = filterConvs(groupedConversations.needsCheckin);
                const restList = filterConvs(groupedConversations.rest);
                const legatList = filterConvs(groupedConversations.legat);
                const total = replyList.length + checkinList.length + restList.length + legatList.length;

                if (q && total === 0) {
                  return (
                    <div className="p-6 text-center">
                      <p className="text-xs text-muted-foreground">Ingen resultater for "{searchQuery}"</p>
                    </div>
                  );
                }

                const renderConvCard = (conv: ConversationWithProfile, urgency: 'reply' | 'checkin' | 'normal') => {
                  const isActive = activeConvId === conv.id;
                  const hasFutureSnooze = !!conv.follow_up_at && new Date(conv.follow_up_at) > new Date();
                  const assignedInitials = getAdvisorInitials(conv.assigned_advisor_id);
                  const assignedName = getAdvisorName(conv.assigned_advisor_id);
                  return (
                    <button
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv.id)}
                      className={`w-full text-left px-3 py-3 border-b border-border/30 transition-colors ${
                        isActive
                          ? "bg-primary/8 border-l-2 border-l-primary"
                          : urgency === 'reply'
                          ? "hover:bg-destructive/5"
                          : urgency === 'checkin'
                          ? "hover:bg-amber-500/5"
                          : "hover:bg-secondary/30"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`h-9 w-9 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 ${
                          urgency === 'reply' ? "bg-destructive/10" : "bg-primary/10"
                        }`}>
                          {conv.threadType === "group" ? (
                            <Layers className={`h-4 w-4 ${urgency === 'reply' ? "text-destructive" : "text-primary"}`} />
                          ) : conv.companyLogoUrl ? (
                            <img src={conv.companyLogoUrl} alt="" className="h-9 w-9 object-cover" />
                          ) : (
                            <span className={`text-xs font-semibold ${urgency === 'reply' ? "text-destructive" : "text-primary"}`}>
                              {getInitialsLocal(conv.companyName || conv.profile?.full_name || "??")}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className={`text-sm truncate ${urgency === 'reply' ? "font-semibold text-foreground" : "font-medium text-foreground"}`}>
                              {conv.companyName || conv.profile?.full_name || "Ukendt"}
                              {conv.isLegat && (
                                <span className="ml-1.5 text-[9px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">Legat</span>
                              )}
                            </p>
                            <span className="text-[10px] text-muted-foreground ml-2 flex-shrink-0">
                              {relativeTime(conv.last_message_at)}
                            </span>
                          </div>
                          {conv.companyName && conv.profile?.full_name && conv.threadType !== "group" && (
                            <p className="text-[10px] text-muted-foreground truncate leading-tight mb-0.5">
                              {conv.profile.full_name}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 mt-1">
                            {urgency === 'reply' && (
                              <span className="text-[10px] font-medium text-destructive">
                                {conv.last_member_message_at
                                  ? `Afventer · ${formatDistanceToNow(new Date(conv.last_member_message_at), { locale: da })}`
                                  : "Afventer svar"}
                              </span>
                            )}
                            {urgency === 'checkin' && (
                              <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                {conv.last_advisor_reply_at
                                  ? `Ingen kontakt · ${formatDistanceToNow(new Date(conv.last_advisor_reply_at), { locale: da })}`
                                  : "Tjek ind"}
                              </span>
                            )}
                            {urgency === 'normal' && conv.lastMessage && (
                              <p className="text-xs text-muted-foreground truncate">
                                {conv.lastMessageSenderId === user?.id ? "Du: " : ""}
                                {conv.lastMessage.replace(/<[^>]+>/g, "").slice(0, 50)}
                              </p>
                            )}
                            {hasFutureSnooze && (
                              <span className="ml-auto text-[10px] text-amber-500 flex-shrink-0">
                                ↩ {format(new Date(conv.follow_up_at!), "d. MMM", { locale: da })}
                              </span>
                            )}
                            {conv.hasRecentReport && (
                              <span className="ml-auto flex-shrink-0">
                                <FileText className="h-3 w-3 text-primary" />
                              </span>
                            )}
                            {urgency === 'normal' && conversationNoteIds.has(conv.id) && (
                              <StickyNote className="h-3 w-3 text-amber-500/70 flex-shrink-0 ml-auto" />
                            )}
                            {assignedInitials && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted text-[9px] font-medium text-muted-foreground flex-shrink-0 ml-auto"
                                title={assignedName || ""}
                              >
                                {assignedName?.split(" ")[0] || assignedInitials}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                };

                return (
                  <>
                    {/* Section: Kræver svar */}
                    {replyList.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
                          <span className="text-[10px] font-semibold text-destructive uppercase tracking-wider">
                            Kræver svar
                          </span>
                          <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                            {replyList.length}
                          </span>
                        </div>
                        {replyList.map(c => renderConvCard(c, 'reply'))}
                      </div>
                    )}

                    {/* Section: Tjek ind */}
                    {checkinList.length > 0 && (
                      <div className={replyList.length > 0 ? "border-t border-border" : ""}>
                        <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
                          <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                            Tjek ind
                          </span>
                          <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-amber-500/20 text-[9px] font-bold text-amber-700 dark:text-amber-300">
                            {checkinList.length}
                          </span>
                        </div>
                        {checkinList.map(c => renderConvCard(c, 'checkin'))}
                      </div>
                    )}

                    {/* Section: Alle andre */}
                    {restList.length > 0 && (
                      <div className={(replyList.length > 0 || checkinList.length > 0) ? "border-t border-border" : ""}>
                        <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Alle
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {restList.length}
                          </span>
                        </div>
                        {restList.map(c => renderConvCard(c, 'normal'))}
                      </div>
                    )}

                    {/* Section: Legat */}
                    {legatList.length > 0 && (
                      <div className={(replyList.length > 0 || checkinList.length > 0 || restList.length > 0) ? "border-t-2 border-border mt-1" : ""}>
                        <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
                          <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
                            Legat
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {legatList.length}
                          </span>
                        </div>
                        {legatList.map(c => renderConvCard(c, 'normal'))}
                      </div>
                    )}

                    {/* Empty state */}
                    {replyList.length === 0 && checkinList.length === 0 && restList.length === 0 && legatList.length === 0 && !q && (
                      <div className="p-8 text-center">
                        <CheckCheck className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">Alt er i orden 🎉</p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            {/* Internal note — fixed at sidebar bottom */}
            {isAdvisor && activeConvId && !activeConvId.startsWith("group_") && (
              <div className="border-t border-border bg-amber-500/5 flex-shrink-0">
                <div className="px-3 py-2 flex items-center gap-2">
                  <StickyNote className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                  <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider flex-1">
                    Intern note
                  </span>
                  <span className="text-[9px] text-amber-600/50 dark:text-amber-400/50">Kun rådgivere</span>
                </div>
                <div className="px-3 pb-3">
                  <Textarea
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    onBlur={handleNoteSave}
                    placeholder="Skriv en intern note..."
                    className="min-h-[72px] max-h-[140px] text-xs bg-transparent border-amber-500/20 focus-visible:ring-amber-500/30 resize-none placeholder:text-amber-600/40 dark:placeholder:text-amber-400/40"
                  />
                  <p className="text-[9px] text-amber-600/50 dark:text-amber-400/50 mt-1">
                    {noteSaveStatus === 'saving' ? "Gemmer..." : noteSaveStatus === 'saved' ? "Gemt ✓" : noteMeta?.updated_at ? `Opdateret ${formatDistanceToNow(new Date(noteMeta.updated_at), { addSuffix: true, locale: da })}` : ""}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── MESSAGE AREA ─── */}
        {showMessageArea && (
          <div className="flex-1 flex flex-col">
            {activeConvId ? (
              <>
                {/* Header */}
                {isAdvisor ? (
                  <div className="px-4 py-3 border-b border-border">
                    {/* Row 1: identity + nav */}
                    <div className="flex items-center gap-3">
                      {isMobile && (
                        <button onClick={handleBackToList} className="p-1.5 -ml-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                          <ArrowLeft className="h-5 w-5" />
                        </button>
                      )}
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
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
                        {/* Member names shown directly under company name */}
                        {!isGroupThread && (() => {
                          const names = companyMembers.length > 0
                            ? companyMembers.map(p => p.full_name).join(", ")
                            : activeConv?.profile?.full_name || null;
                          return names ? (
                            <p className="text-[11px] text-muted-foreground truncate leading-tight">
                              {names}
                            </p>
                          ) : null;
                        })()}
                        {/* Quick nav links — desktop only, takes too much vertical space on mobile */}
                        {activeConv?.member_id && !isGroupThread && !isMobile && (
                          <div className="flex items-center gap-1 mt-0.5">
                            {[
                              { label: "Overblik", path: `/members/${activeConv.member_id}` },
                              { label: "Milestones", path: `/members/${activeConv.member_id}?section=milestones` },
                              { label: "Rapporter", path: `/members/${activeConv.member_id}?section=reports` },
                            ].map(({ label, path }) => (
                              <button
                                key={label}
                                onClick={() => navigate(path)}
                                className="text-[10px] px-2 py-0.5 rounded-full bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors border border-border/30"
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Primary contextual action */}
                      {(() => {
                        const now = new Date();
                        const isActionable = activeConv &&
                          !isGroupThread &&
                          activeConv.awaiting_reply_from === "advisor" &&
                          activeConv.conversation_status !== "resolved" &&
                          (!activeConv.acknowledged_at || (!!activeConv.follow_up_at && new Date(activeConv.follow_up_at) <= now));
                        const hasFutureSnooze = activeConv?.follow_up_at && new Date(activeConv.follow_up_at) > now;
                        if (isActionable) {
                          return (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 flex-shrink-0">
                              <Clock className="h-3.5 w-3.5" />
                              Afventer dit svar
                            </span>
                          );
                        }
                        if (hasFutureSnooze) {
                          return (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex-shrink-0">
                              <Clock className="h-3.5 w-3.5" />
                              Følger op {format(new Date(activeConv!.follow_up_at!), "d. MMM", { locale: da })}
                            </span>
                          );
                        }
                        return null;
                      })()}
                      {/* ⋯ secondary actions menu */}
                      {!isGroupThread && (
                        <Popover open={assignmentPopoverOpen} onOpenChange={setAssignmentPopoverOpen} modal={false}>
                          <PopoverTrigger asChild>
                            <button className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex-shrink-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="end" sideOffset={8} className="w-56 p-1 z-[200]">
                            {/* Assign */}
                            <div className="px-2 py-1 mb-1">
                              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1.5">Tildel rådgiver</p>
                              {(advisorUsers || []).map((a: any) => {
                                const isCurrent = activeConv?.assigned_advisor_id === a.user_id;
                                return (
                                  <button
                                    key={a.user_id}
                                    onClick={() => { handleAssignAdvisor(a.user_id); setAssignmentPopoverOpen(false); }}
                                    className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs transition-colors text-foreground ${isCurrent ? "bg-primary/5 font-medium" : "hover:bg-secondary/60"}`}
                                  >
                                    <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                                      {a.avatar_url ? (
                                        <img src={a.avatar_url} alt="" className="h-5 w-5 object-cover" />
                                      ) : (
                                        <span className="text-[8px] font-medium text-muted-foreground">{getInitialsLocal(a.full_name)}</span>
                                      )}
                                    </div>
                                    <span className="truncate">{a.full_name}</span>
                                    {isCurrent && <Check className="h-3 w-3 text-primary ml-auto flex-shrink-0" />}
                                  </button>
                                );
                              })}
                              {activeConv?.assigned_advisor_id && (
                                <button
                                  onClick={() => { handleAssignAdvisor(null); setAssignmentPopoverOpen(false); }}
                                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors mt-1"
                                >
                                  Fjern tildeling
                                </button>
                              )}
                            </div>
                            <div className="border-t border-border my-1" />
                            {/* Snooze */}
                            {activeConv?.conversation_status !== 'resolved' && (
                              <>
                                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider px-2 py-1">Følg op</p>
                                {[
                                  { label: "I morgen", date: getSnoozeDate('tomorrow') },
                                  { label: "Om 3 dage", date: getSnoozeDate('3days') },
                                  { label: "Næste uge", date: getSnoozeDate('nextweek') },
                                ].map(({ label, date }) => (
                                  <button
                                    key={label}
                                    onClick={() => { handleSnooze(date); setAssignmentPopoverOpen(false); }}
                                    className="flex items-center justify-between w-full px-2 py-1.5 rounded-md text-xs text-foreground hover:bg-secondary/60 transition-colors"
                                  >
                                    <span>{label}</span>
                                    <span className="text-muted-foreground text-[10px]">{format(date, "EEE d. MMM", { locale: da })}</span>
                                  </button>
                                ))}
                                {activeConv?.follow_up_at && new Date(activeConv.follow_up_at) > new Date() && (
                                  <button
                                    onClick={() => { handleCancelSnooze(); setAssignmentPopoverOpen(false); }}
                                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
                                  >
                                    <X className="h-3 w-3" />
                                    Fjern opfølgning
                                  </button>
                                )}
                                <div className="border-t border-border my-1" />
                              </>
                            )}
                            {/* Acknowledge / no action */}
                            {activeConv?.awaiting_reply_from === "advisor" && !activeConv?.acknowledged_at && (
                              <button
                                onClick={() => { handleAcknowledge(); setAssignmentPopoverOpen(false); }}
                                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-foreground hover:bg-secondary/60 transition-colors"
                              >
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                                Jeg følger op (fjern fra kø)
                              </button>
                            )}
                            <button
                              onClick={() => { handleNoActionNeeded(); setAssignmentPopoverOpen(false); }}
                              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-secondary/60 transition-colors"
                            >
                              <CheckCheck className="h-3.5 w-3.5" />
                              Ingen handling nødvendig
                            </button>
                          </PopoverContent>
                        </Popover>
                      )}
                      {/* Prev/next */}
                      {advisorConvList.length > 1 && (
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button
                            onClick={() => prevConv && setActiveConvId(prevConv.id)}
                            disabled={!prevConv}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 transition-colors"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => nextConv && setActiveConvId(nextConv.id)}
                            disabled={!nextConv}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 transition-colors"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (allAdvisors && allAdvisors.length > 0) ? (
                  <div className={`${isMobile ? "px-3 py-2" : "px-4 md:px-5 py-3"} border-b border-border flex items-center gap-3`}>
                    {isMobile && (
                      <button
                        onClick={handleBackToList}
                        className="p-1.5 -ml-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      >
                        <ArrowLeft className="h-5 w-5" />
                      </button>
                    )}
                    <div className="flex items-center gap-1.5 min-w-0">
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
                      <span className="text-[11px] text-muted-foreground truncate">
                        {isMobile
                          ? allAdvisors.map(p => p.full_name.split(" ")[0]).join(", ")
                          : `Dine rådgivere: ${allAdvisors.map(p => p.full_name.split(" ")[0]).join(", ")}`}
                      </span>
                    </div>
                  </div>
                ) : null}

                {/* Pulse banner */}
                {isAdvisor && activeConv && !isGroupThread && latestPulse?.help_needed && (
                  <div className="px-4 py-2 bg-amber-500/5 border-b border-amber-500/10">
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      <span className="font-semibold">Brug for hjælp til:</span> {latestPulse.help_needed}
                    </p>
                  </div>
                )}

                {/* Messages list */}
                <div ref={messagesContainerRef} className={`flex-1 overflow-y-auto ${isMobile ? "px-3 py-3 space-y-2" : "px-4 md:px-5 py-4 space-y-4"}`}>
                  {messages.length === 0 && !activeConvId?.startsWith("group_") && (
                    <div className="flex flex-col items-center justify-center h-full py-16 text-center px-8">
                      <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                        <MessageSquare className="h-6 w-6 text-primary" />
                      </div>
                      <p className="text-sm font-semibold text-foreground mb-1">
                        Din direkte linje til rådgiverne
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
                        Skriv hvad du har på hjerte — spørgsmål, opdateringer eller bare hvad der fylder. Dine rådgivere læser dine tal og svarer hurtigt.
                      </p>
                    </div>
                  )}
                  {(() => {
                    let lastDateKey = "";
                    let unreadDividerShown = false;
                    return messages.map((msg, msgIdx) => {
                      if (msg.context_type === "session_prep" && !isAdvisor) return null;
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
                                  {msg.context_type === "session_prep" ? "Session-dagsorden" : msg.message_type === "ai" ? "AI Analyse" : "System"}
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
                              <div className="text-sm text-foreground leading-relaxed chat-html-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(
                                msg.content
                                  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                  .replace(/\n/g, '<br>'),
                                { ALLOWED_TAGS: ['b','strong','i','em','ul','ol','li','a','p','br'], ALLOWED_ATTR: ['href','target','rel'] }
                              ) }} />
                              {contextType && contextMeta?.title && (() => {
                                const memberId = activeConv?.member_id;
                                const linkPath =
                                  contextType === "report" && memberId
                                    ? (contextMeta?.report_id
                                        ? `/members/${memberId}?reportId=${contextMeta.report_id}&section=reports`
                                        : `/members/${memberId}?section=reports`)
                                    : contextType === "milestone" && memberId
                                    ? `/members/${memberId}?section=milestones`
                                    : null;
                                const chip = (
                                  <span className="inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md bg-secondary text-muted-foreground">
                                    {contextType === "report" && <FileText className="h-3 w-3" />}
                                    {contextType === "milestone" && <Target className="h-3 w-3" />}
                                    {String(contextMeta.title)}
                                    {isAdvisor && linkPath && <ExternalLink className="h-2.5 w-2.5 ml-0.5" />}
                                  </span>
                                );
                                return (
                                  <div className="mt-2">
                                    {isAdvisor && linkPath ? (
                                      <button onClick={() => navigate(linkPath)} className="hover:opacity-80 transition-opacity">
                                        {chip}
                                      </button>
                                    ) : chip}
                                  </div>
                                );
                              })()}
                              {msg.context_type === "agent" && (
                                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/20">
                                  <span className="text-[10px] text-muted-foreground">Var dette nyttigt?</span>
                                  <button
                                    onClick={async () => {
                                      await supabase.from("messages").update({
                                        context_meta: { ...(msg.context_meta as any || {}), feedback: "up" }
                                      } as any).eq("id", msg.id);
                                      toast.success("Tak for feedback");
                                    }}
                                    className="text-[11px] px-2 py-0.5 rounded border border-border/40 hover:bg-primary/10 hover:border-primary/30 transition-colors"
                                  >
                                    Ja
                                  </button>
                                  <button
                                    onClick={async () => {
                                      await supabase.from("messages").update({
                                        context_meta: { ...(msg.context_meta as any || {}), feedback: "down" }
                                      } as any).eq("id", msg.id);
                                      toast("Forstået — vi arbejder på det");
                                    }}
                                    className="text-[11px] px-2 py-0.5 rounded border border-border/40 hover:bg-destructive/10 hover:border-destructive/30 transition-colors"
                                  >
                                    Nej
                                  </button>
                                </div>
                              )}
                              {msg.context_type === "session_prep" && (
                                <div className="mt-2 pt-2 border-t border-border/20 flex items-center gap-1.5">
                                  <div className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                                  <span className="text-[10px] text-muted-foreground">Forberedelse til næste session med founder</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </React.Fragment>
                        );
                      }

                      const participant = participants.find(p => p.user_id === msg.sender_id);
                      const senderProfile = participant || profilesMap.get(msg.sender_id);
                      const senderName = senderProfile?.full_name || "Rådgiver";
                      const senderAvatar = senderProfile?.avatar_url;

                      // Unread divider
                      let showUnreadDivider = false;
                      if (!unreadDividerShown && companyLastSeenId && companyLastSeenId !== latestMsgId && msgIdx > 0) {
                        if (messages[msgIdx - 1].id === companyLastSeenId && !isMine) {
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
                          {!isMine && !isMobile && (
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
                            className={`${isMobile ? "max-w-[88%]" : "max-w-[70%]"} relative ${msg.pinned_at ? "ring-1 ring-primary/20 rounded-2xl" : ""}`}
                            {...(isMobile ? longPressHandlers(msg.id) : {})}
                          >
                            {longPressedMessageId === msg.id && isMobile && (
                              <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-card border border-border rounded-full px-2 py-1 shadow-lg">
                                <button onClick={() => { toggleReaction(msg.id, "👍"); setLongPressedMessageId(null); }} className="p-1.5 hover:bg-secondary rounded-full text-sm">👍</button>
                                <button onClick={() => { toggleReaction(msg.id, "❤️"); setLongPressedMessageId(null); }} className="p-1.5 hover:bg-secondary rounded-full text-sm">❤️</button>
                                <button onClick={() => { navigator.clipboard.writeText(msg.content || ""); setLongPressedMessageId(null); }} className="p-1.5 hover:bg-secondary rounded-full text-sm">📋</button>
                              </div>
                            )}
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
                          {isMine && !isMobile && (
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

                {/* Input with topic selector — sticky at bottom of message column */}
                <div
                  className={`sticky bottom-0 ${isMobile ? "px-2 pt-2" : "p-3 md:p-4"} border-t border-border bg-background shrink-0 z-10`}
                  style={{
                    paddingBottom: isMobile ? "calc(0.5rem + env(safe-area-inset-bottom))" : undefined,
                    position: isMobile ? "sticky" : undefined,
                    bottom: isMobile ? 0 : undefined,
                  }}
                >
                  {!isGroupThread && isAdvisor && (
                    <div
                      className={`flex items-center gap-1.5 mb-2 overflow-x-auto ${isMobile ? "-mx-2 px-2" : ""}`}
                      style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
                    >
                      {!isMobile && (
                        <span className="text-[10px] text-muted-foreground mr-1 flex-shrink-0">Emne:</span>
                      )}
                      {MESSAGE_TOPICS.map(t => {
                        const isActive = selectedTopic === t.key;
                        const topicInfo = t.key ? TOPIC_COLORS[t.key] : null;
                        return (
                          <button
                            key={t.key ?? "general"}
                            type="button"
                            onClick={() => setSelectedTopic(t.key)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
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
                      onRequestSubmit={(fn) => { chatSubmitRef.current = fn; }}
                      disabled={sending}
                      placeholder={isGroupThread ? "Skriv en besked til koncernen..." : selectedTopic ? `Skriv om ${MESSAGE_TOPICS.find(t => t.key === selectedTopic)?.label?.toLowerCase()}...` : `Skriv til ${advisorNamesLabel}...`}
                      maxLength={MAX_MESSAGE_LENGTH}
                    />
                    {!isMobile && (
                      <button
                        type="button"
                        onClick={() => chatSubmitRef.current()}
                        disabled={sending}
                        className="flex-shrink-0 h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50"
                        aria-label="Send besked"
                      >
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                  {!isMobile && <div className="safe-bottom-spacer" />}
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
