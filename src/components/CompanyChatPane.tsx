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
import MessageEditDialog from "@/components/MessageEditDialog";
import MobileMessageActionDrawer from "@/components/MobileMessageActionDrawer";
import { openReportFile } from "@/lib/reportFileAccess";
import { computeMembershipTier, type MembershipTier } from "@/lib/membershipTier";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import {
  Send, MessageCircle, CheckCheck, FileText, Sparkles, Target,
  Search, Inbox, Clock, AlertCircle, Filter, Calculator, BookOpen, MessageSquare,
  BarChart3, Pin, Maximize2, Minimize2, ArrowLeft, ExternalLink, Eye,
  UserCheck, Users as UsersIcon, ChevronDown, ChevronLeft, ChevronRight, Check, ArrowRightLeft,
  CalendarIcon, MoreHorizontal, Building2, Loader2, AlertTriangle,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import ChatRichInput from "@/components/ChatRichInput";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose,
} from "@/components/ui/drawer";
import KPICard from "@/components/KPICard";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { useKpiTargets } from "@/hooks/useKpiTargets";
import { useKpiBenchmarks } from "@/hooks/useKpiBenchmarks";
import { deriveKpiMetrics, getTargetStatus } from "@/lib/kpiDefs";
import { useCompanyCommentary } from "@/hooks/useCompanyCommentary";
import type { AnalysisData } from "@/components/AIFinancialAnalysis";
import { format, formatDistanceToNow, startOfDay } from "date-fns";
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
  const [showCompanyDrawer, setShowCompanyDrawer] = useState(false);
  // Foreslå opgave fra chatten (rådgiver, ⋯-menuen) — B1: et forslag,
  // ikke en opgave, før medlemmet siger ja i "Dine aftaler".
  const [forslagTitel, setForslagTitel] = useState("");
  const [forslagBegrundelse, setForslagBegrundelse] = useState("");
  const [foreslaarOpgave, setForeslaarOpgave] = useState(false);

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
    fetchParticipants(activeConvId);
  }, [activeConvId]);

  // Fetch all company members (not just message senders) for the active conversation
  useEffect(() => {
    if (!activeConvId) {
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
      // Kun de 9 læste kolonner — select("*") trak også ops-model-resterne
      // (acknowledged_*, conversation_status, follow_up_at, resolved_at),
      // som ingen læser her (perf/chatpane-nyttelast). Join uændret.
      let convsQuery = supabase
        .from("conversations")
        .select("id, member_id, company_id, last_message_at, created_at, awaiting_reply_from, assigned_advisor_id, last_member_message_at, last_advisor_reply_at, companies:company_id(id, name, logo_url, is_legat, contract_end_date, subscription_status, subscription_current_period_end)")
        .order("last_message_at", { ascending: false });
      
      if (isCompanyOverride && companyId) {
        convsQuery = convsQuery.eq("company_id", companyId);
      } else if (!isAdvisor && companyId) {
        convsQuery = convsQuery.eq("company_id", companyId);
      } else if (!isAdvisor) {
        convsQuery = convsQuery.eq("member_id", user.id);
      }

      const [convsRes, profilesRes, msgsRes, reportsRes] = await Promise.all([
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
      ]);

      const convs = convsRes.data || [];
      const profiles = profilesRes.data || [];
      const allMessages = msgsRes.data || [];
      const recentReports = reportsRes.data || [];

      const filteredConvs = convs;

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
        const membershipTier = companyData
          ? computeMembershipTier({
              contract_end_date: companyData.contract_end_date,
              subscription_status: companyData.subscription_status,
              subscription_current_period_end: companyData.subscription_current_period_end,
            })
          : undefined;

        return {
          id: c.id,
          member_id: c.member_id,
          last_message_at: c.last_message_at || c.created_at,
          company_id: cid,
          companyName: companyData?.name || undefined,
          companyLogoUrl: companyData?.logo_url || undefined,
          isLegat: !!companyData?.is_legat,
          membershipTier,
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
        deduped.push(conv);
      }

      setConversations(deduped);

      // Auto-select for members
      if (!isAdvisor && enriched.length > 0 && !activeConvId) {
        setActiveConvId(enriched[0].id);
        if (enriched.length <= 1) setShowMessages(true);
        else if (isMobile) setShowMessages(true);
      }
    };

    loadConversations();
  }, [user, isAdvisor, companyId, isCompanyOverride]);

  // Realtime subscription on conversations for live ops state updates
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
                  last_message_at: updated.last_message_at || c.last_message_at,
                }
              : c
          ));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, isAdvisor]);

  const CHECKIN_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
  const groupedConversations = useMemo(() => {
    const now = new Date();
    // Split legat from regular conversations immediately
    const regularConvs = conversations.filter(c => !c.isLegat);
    const legatConvs = conversations.filter(c => c.isLegat);
    // Partition regular conversations on membership state. Expired ones are
    // excluded from KRÆVER SVAR / TJEK IND / ALLE — they only surface via
    // the search-reveal path. `undefined` tier (orphan conversations with no
    // company join) falls through as active (fail open against accidentally
    // hiding live conversations).
    const activeConvs = regularConvs.filter(c => c.membershipTier !== "expired");
    const expiredConvs = regularConvs.filter(c => c.membershipTier === "expired");
    // KRÆVER SVAR: all conversations awaiting any advisor reply
    const needsReply = activeConvs.filter(c => {
      return c.awaiting_reply_from === 'advisor';
    }).sort((a, b) => {
      const aT = a.last_member_message_at ? new Date(a.last_member_message_at).getTime() : 0;
      const bT = b.last_member_message_at ? new Date(b.last_member_message_at).getTime() : 0;
      return aT - bT; // oldest first = most urgent
    });
    const needsReplyIds = new Set(needsReply.map(c => c.id));
    // TJEK IND: all conversations where no advisor has written in 14+ days
    const needsCheckin = activeConvs.filter(c => {
      if (needsReplyIds.has(c.id)) return false;
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
    const rest = activeConvs.filter(c => {
      return !needsReplyIds.has(c.id) && !checkinIds.has(c.id);
    }).sort((a, b) =>
      new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    );
    // Legat: sorted by latest message
    const legat = legatConvs.sort((a, b) =>
      new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    );
    // Expired: sorted by latest message; only surfaced through search-reveal.
    const expired = expiredConvs.sort((a, b) =>
      new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    );
    return { needsReply, needsCheckin, rest, legat, expired };
  }, [conversations, user?.id]);

  // Load messages for active conversation
  useEffect(() => {
    if (!activeConvId) return;

    // Company thread: existing logic
    const loadMessages = async () => {
      // Kun de 11 læste kolonner (alt undtagen edited_at — attachments bor i
      // context_meta-jsonb'en og SKAL med), og et loft på 500: median er 26
      // beskeder og max 89 i dag, så loftet ændrer intet i praksis. Hentes
      // nyeste-først og vendes, så en samtale over loftet viser de NYESTE
      // 500 — ikke de ældste (perf/chatpane-nyttelast).
      const { data } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, content, read_at, created_at, message_type, context_type, context_id, context_meta, pinned_at")
        .eq("conversation_id", activeConvId)
        .order("created_at", { ascending: false })
        .limit(500);
      setMessages((data || []).reverse());

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

    // Defense in depth: composer is also hidden in the UI when this is true,
    // but a stale `conversations` snapshot or a race could still leave it
    // mounted. The toast surfaces why nothing happened.
    const activeConvForSend = conversations.find(c => c.id === activeConvId);
    if (activeConvForSend?.membershipTier === "expired") {
      toast.error("Denne virksomhed er udløbet — beskeder kan ikke sendes");
      return;
    }

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

    {
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
  }, [activeConvId, user, selectedTopic, conversations]);

  const activeConv = conversations.find((c) => c.id === activeConvId);

  // "Se tal"-drawer data (advisor-mobil). Hooks cache via react-query og fyrer
  // ogsaa naar drawer er lukket — fint for nu; kan gates paa showCompanyDrawer senere.
  const companyIdForDrawer = activeConv?.company_id;
  const { data: drawerFacts = [] } = useCompanyFacts(companyIdForDrawer);
  const { targets: drawerTargets } = useKpiTargets(companyIdForDrawer);
  const { benchmarks: drawerBenchmarks } = useKpiBenchmarks(companyIdForDrawer);
  const drawerMetrics = useMemo(
    () => deriveKpiMetrics(drawerFacts, drawerTargets, drawerBenchmarks),
    [drawerFacts, drawerTargets, drawerBenchmarks],
  );
  const latestPeriodLabel = drawerFacts.at(-1)?.period_label ?? "";
  const { data: drawerCommentaries = [] } = useCompanyCommentary(companyIdForDrawer);
  const latestCommentary = drawerCommentaries[0]; // nyeste, sorteret descending
  const drawerAnalysis = latestCommentary?.analysis as AnalysisData | undefined;
  const drawerIsStale = latestCommentary?.is_stale ?? false;

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

  const handleNoReplyNeeded = async () => {
    if (!activeConvId || !user) return;
    const { table, id } = getOpsTarget();
    const { error } = await supabase
      .from(table as any)
      .update({ awaiting_reply_from: null })
      .eq("id", id);
    if (error) { toast.error("Kunne ikke opdatere samtalen"); return; }
    setConversations(prev => prev.map(c =>
      c.id === activeConvId ? { ...c, awaiting_reply_from: null } : c
    ));
    toast.success("Fjernet fra Kræver svar");
  };

  // Rådgiveren foreslår en opgave fra chatten. Klienten har KUN SELECT
  // på company_actions (RLS-migration 20260822224100) — skrivningen går
  // gennem edge-funktionen foreslaa-opgave (Bucket A), som også skriver
  // systembeskeden i samtalen. Fejl-body læses ud af FunctionsHttpError
  // og vises ordret (opgaveMutation-mønstret fra BoardroomView).
  const handleForeslaaOpgave = async () => {
    const companyId = activeConv?.company_id;
    if (!companyId || !activeConvId || foreslaarOpgave || !forslagTitel.trim()) return;
    setForeslaarOpgave(true);
    try {
      // Samtalen sendes med — serveren må ikke gætte den ud fra
      // company_id: en virksomhed kan have flere samtaler (dedup'en i
      // loadConversations findes netop af den grund), og klienten
      // sidder allerede i den rigtige.
      const { data, error } = await supabase.functions.invoke("foreslaa-opgave", {
        body: {
          companyId,
          conversationId: activeConvId,
          titel: forslagTitel,
          ...(forslagBegrundelse.trim() ? { begrundelse: forslagBegrundelse } : {}),
        },
      });
      if (error) {
        let besked = error.message;
        try {
          const svar = await (error as any).context?.json?.();
          if (svar?.error) besked = svar.error;
        } catch { /* behold error.message */ }
        toast.error("Forslaget blev ikke sendt", { description: besked });
        return;
      }
      if (data?.beskedSkrevet === false) {
        // Opgaven er det vigtige; beskeden er sporet — men rådgiveren
        // skal vide at sporet mangler, ellers leder de forgæves.
        toast.warning("Forslaget er sendt, men kom ikke med i samtalen", {
          description: "Medlemmet ser det stadig under Dine aftaler.",
        });
      } else {
        toast.success("Opgaven er foreslået — medlemmet svarer i Dine aftaler");
      }
      setForslagTitel("");
      setForslagBegrundelse("");
      setAssignmentPopoverOpen(false);
      // INGEN manuel genindlæsning af beskederne: realtime-abonnementet
      // på messages INSERT henter allerede den nye systembesked, og en
      // genindlæsning oveni gav to kopier i state. Målt 31/8: én række
      // i databasen, to bobler på skærmen.
    } finally {
      setForeslaarOpgave(false);
    }
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
  const reactionMessageTable = "messages" as const;
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
  const lastSeenConvType = "company" as const;
  const latestMsgId = messages.length > 0 ? messages[messages.length - 1].id : null;
  const { lastSeenMessageId: companyLastSeenId } = useConversationLastSeen(
    activeConvId,
    lastSeenConvType,
    user?.id,
    latestMsgId
  );

  const handleEditSave = async (html: string) => {
    // editingId kan nulstilles af saveEdit ved success, saa fang id'et foer await.
    const id = editingId;
    if (!id) return false;
    const ok = await saveEditAction(id, html);
    if (ok) {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, content: html, edited_at: new Date().toISOString() } as any : m));
    }
    return ok;
  };

  const handleDeleteMsg = async (messageId: string) => {
    const ok = await deleteMessageAction(messageId);
    if (ok) {
      setMessages(prev => prev.filter(m => m.id !== messageId));
    }
  };

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
                // Expired conversations are hidden by default. They only appear
                // in search results so advisors can still pull up historical
                // threads by typing the company name.
                const expiredList = q ? filterConvs(groupedConversations.expired) : [];
                const total = replyList.length + checkinList.length + restList.length + legatList.length + expiredList.length;

                if (q && total === 0) {
                  return (
                    <div className="p-6 text-center">
                      <p className="text-xs text-muted-foreground">Ingen resultater for "{searchQuery}"</p>
                    </div>
                  );
                }

                const renderConvCard = (conv: ConversationWithProfile, urgency: 'reply' | 'checkin' | 'normal') => {
                  const isActive = activeConvId === conv.id;
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
                          {conv.companyLogoUrl ? (
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
                              {conv.membershipTier === "expired" && (
                                <span className="ml-1.5 text-[9px] font-semibold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full">Udløbet</span>
                              )}
                            </p>
                            <span className="text-[10px] text-muted-foreground ml-2 flex-shrink-0">
                              {relativeTime(conv.last_message_at)}
                            </span>
                          </div>
                          {conv.companyName && conv.profile?.full_name && (
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
                            {conv.hasRecentReport && (
                              <span className="ml-auto flex-shrink-0">
                                <FileText className="h-3 w-3 text-primary" />
                              </span>
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

                    {/* Section: Udløbede (search-reveal only) */}
                    {expiredList.length > 0 && (
                      <div className={(replyList.length > 0 || checkinList.length > 0 || restList.length > 0 || legatList.length > 0) ? "border-t-2 border-border mt-1" : ""}>
                        <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Udløbede
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {expiredList.length}
                          </span>
                        </div>
                        {expiredList.map(c => renderConvCard(c, 'normal'))}
                      </div>
                    )}

                    {/* Empty state */}
                    {replyList.length === 0 && checkinList.length === 0 && restList.length === 0 && legatList.length === 0 && expiredList.length === 0 && !q && (
                      <div className="p-8 text-center">
                        <CheckCheck className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">Alt er i orden 🎉</p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* ─── MESSAGE AREA ─── */}
        {showMessageArea && (
          <div className="flex-1 flex flex-col min-w-0">
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
                        {activeConv?.companyLogoUrl ? (
                          <img src={activeConv.companyLogoUrl} alt="" className="h-8 w-8 object-cover" />
                        ) : (
                          <span className="text-xs font-semibold text-primary">
                            {getInitialsLocal(activeConv?.companyName || "??")}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {activeConv?.companyName || "Ukendt"}
                        </p>
                        {/* Member names shown directly under company name */}
                        {(() => {
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
                        {activeConv?.member_id && !isMobile && (
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
                      {/* Se tal — mobil-rådgiver: hurtig adgang til virksomhedens nøgletal */}
                      {isMobile && isAdvisor && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowCompanyDrawer(true)}
                          className="h-8 px-2 gap-1.5 flex-shrink-0"
                        >
                          <BarChart3 className="h-4 w-4" />
                          <span className="text-xs">Se tal</span>
                        </Button>
                      )}
                      {/* Primary contextual action */}
                      {activeConv?.awaiting_reply_from === "advisor" && (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-1.5 sm:px-2.5 py-1.5 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 flex-shrink-0">
                          <Clock className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Afventer dit svar</span>
                        </span>
                      )}
                      {/* ⋯ secondary actions menu */}
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
                            {activeConv?.awaiting_reply_from === "advisor" && (
                              <>
                                <div className="border-t border-border my-1" />
                                <button
                                  onClick={() => { handleNoReplyNeeded(); setAssignmentPopoverOpen(false); }}
                                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-secondary/60 transition-colors"
                                >
                                  <CheckCheck className="h-3.5 w-3.5" />
                                  Kræver ikke svar
                                </button>
                              </>
                            )}
                            {/* Foreslå opgave — rådgiverens ikke-besked-handling.
                                Forslaget lander i medlemmets "Dine aftaler"
                                (B1: intet er en opgave før medlemmet siger ja;
                                B6: medlemmet vælger datoen ved accept). */}
                            <div className="border-t border-border my-1" />
                            <div className="px-2 py-1.5">
                              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1.5">Foreslå opgave</p>
                              <input
                                value={forslagTitel}
                                onChange={(e) => setForslagTitel(e.target.value)}
                                maxLength={200}
                                placeholder="Hvad skal medlemmet gøre?"
                                className="w-full px-2 py-1.5 mb-1.5 rounded-md border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                              <textarea
                                value={forslagBegrundelse}
                                onChange={(e) => setForslagBegrundelse(e.target.value)}
                                placeholder="Hvorfor? (valgfrit)"
                                rows={2}
                                className="w-full px-2 py-1.5 mb-1.5 rounded-md border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                              <button
                                onClick={handleForeslaaOpgave}
                                disabled={foreslaarOpgave || !forslagTitel.trim()}
                                className="w-full px-2 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                              >
                                {foreslaarOpgave ? "Sender…" : "Foreslå opgave"}
                              </button>
                            </div>
                          </PopoverContent>
                      </Popover>
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
                {isAdvisor && activeConv && latestPulse?.help_needed && (
                  <div className="px-4 py-2 bg-amber-500/5 border-b border-amber-500/10">
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      <span className="font-semibold">Brug for hjælp til:</span> {latestPulse.help_needed}
                    </p>
                  </div>
                )}

                {/* Messages list */}
                <div ref={messagesContainerRef} className={`flex-1 overflow-y-auto min-w-0 ${isMobile ? "px-3 py-3 space-y-2" : "px-4 md:px-5 py-4 space-y-4"}`}>
                  {messages.length === 0 && (
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
                              {contextMeta?.kind === "report_card" && (() => {
                                // Rich report card — ONLY for the dedicated report_card
                                // message (has context_meta.kind). The AI analysis message
                                // has no `kind`, so it stays on the chip path below.
                                const cardPeriodKey: string | null = contextMeta?.period_key ?? null;
                                const facts = drawerFacts;
                                const idx = cardPeriodKey ? facts.findIndex(f => f.period_key === cardPeriodKey) : -1;
                                const current = idx >= 0 ? facts[idx] : null;
                                // Previous = the period immediately before this card's period
                                // (facts are sorted by period_key ascending).
                                const previous = idx > 0 ? facts[idx - 1] : null;
                                const cur = current ? factsToDanishMetrics(current.metrics) : {};
                                const prv = previous ? factsToDanishMetrics(previous.metrics) : {};

                                const periodLabel =
                                  current?.period_label ||
                                  (cardPeriodKey
                                    ? (() => {
                                        const [y, m] = cardPeriodKey.split("-").map(Number);
                                        if (!y || !m) return cardPeriodKey;
                                        return new Date(y, m - 1, 1).toLocaleDateString("da-DK", { month: "long", year: "numeric" });
                                      })()
                                    : "");

                                const fmtKr = (n: number) =>
                                  n.toLocaleString("da-DK", { maximumFractionDigits: 0 }) + " kr.";

                                const rows = [
                                  { label: "Omsætning", key: "omsaetning" },
                                  { label: "Resultat f. skat", key: "resultat_foer_skat" },
                                  { label: "Dækningsbidrag", key: "daekningsbidrag" },
                                ]
                                  .map(d => ({ label: d.label, curr: cur[d.key] ?? null, prev: prv[d.key] ?? null }))
                                  .filter(r => r.curr != null);

                                return (
                                  <div className="mt-3 rounded-xl border border-border/60 bg-background/60 p-3 md:p-4">
                                    <div className="flex items-center justify-between gap-2 mb-3">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <FileText className="h-4 w-4 text-primary shrink-0" />
                                        <div className="min-w-0">
                                          <p className="text-sm font-semibold text-foreground truncate">
                                            {activeConv?.companyName || "Rapport"}
                                          </p>
                                          {periodLabel && (
                                            <p className="text-[11px] text-muted-foreground">{periodLabel}</p>
                                          )}
                                        </div>
                                      </div>
                                      <button
                                        onClick={async () => {
                                          if (!msg.context_id) return;
                                          const { data: report } = await supabase
                                            .from("financial_reports")
                                            .select("file_path")
                                            .eq("id", msg.context_id)
                                            .maybeSingle();
                                          const filePath = (report as { file_path?: string } | null)?.file_path;
                                          if (filePath) {
                                            await openReportFile(filePath);
                                          } else {
                                            toast.error("Rapportfil ikke tilgængelig");
                                          }
                                        }}
                                        className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                        Åbn rapportfil
                                      </button>
                                    </div>
                                    {rows.length > 0 && (
                                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                        {rows.map(r => {
                                          const hasPrev = r.prev != null && r.prev !== 0;
                                          const pct = hasPrev ? ((r.curr! - r.prev!) / Math.abs(r.prev!)) * 100 : null;
                                          const isFlat = pct != null && Math.abs(pct) < 1;
                                          const isUp = pct != null && pct > 0;
                                          return (
                                            <div key={r.label} className="rounded-lg bg-secondary/40 p-2.5">
                                              <p className="text-[10px] text-muted-foreground">{r.label}</p>
                                              <p className="text-sm font-semibold text-foreground">{fmtKr(r.curr!)}</p>
                                              {pct != null && (
                                                <div className={`flex items-center gap-1 mt-0.5 text-[11px] font-medium ${
                                                  isFlat ? "text-muted-foreground" : isUp ? "text-primary" : "text-destructive"
                                                }`}>
                                                  {isFlat ? <Minus className="h-3 w-3" /> : isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                                  {isUp ? "+" : ""}{pct.toFixed(1)}%
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
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
                            {isMobile ? (
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
                                  <MessageAttachments attachments={msg.context_meta?.attachments} isMine={isMine} messageId={msg.id} source="messages" />
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
                                  <MessageAttachments attachments={msg.context_meta?.attachments} isMine={isMine} messageId={msg.id} source="messages" />
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
                  className={`${isMobile ? "px-2 pt-2 pb-2" : "p-3 md:p-4"} border-t border-border bg-background shrink-0 z-10`}
                  style={{
                    paddingBottom: isMobile ? "calc(0.5rem + env(safe-area-inset-bottom))" : undefined,
                  }}
                >
                  {activeConv?.membershipTier === "expired" ? (
                    <div className="flex items-center gap-2 px-3 py-3 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground">
                      <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                      <span>
                        Denne virksomhed er <span className="font-semibold text-foreground">udløbet</span> — beskeder kan ikke sendes. Historik er stadig læsbar.
                      </span>
                    </div>
                  ) : (
                  <>
                  {isAdvisor && (
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
                      placeholder={selectedTopic ? `Skriv om ${MESSAGE_TOPICS.find(t => t.key === selectedTopic)?.label?.toLowerCase()}...` : `Skriv til ${advisorNamesLabel}...`}
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
                  </>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col min-w-0">
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

      {/* Se tal-drawer (mobil-rådgiver) — kerne-tal + KPI-grid (kompakt, ingen sparkline) */}
      <Drawer open={showCompanyDrawer} onOpenChange={setShowCompanyDrawer}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{activeConv?.companyName || "Virksomhed"}</DrawerTitle>
            {latestPeriodLabel && (
              <p className="text-xs text-muted-foreground">{latestPeriodLabel}</p>
            )}
          </DrawerHeader>

          {/* Scroll-wrapper: drawer-indhold kan være højere end skærm */}
          <div className="overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-h-[70vh]">
            {drawerMetrics.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Ingen tal endnu. Når virksomheden har godkendte rapporter, vises tallene her.
              </div>
            ) : (
              <>
                {/* Kerne-tal: omsætning, resultat, resultat margin */}
                <div className="grid grid-cols-1 gap-2 mb-4">
                  {["omsaetning", "resultat", "ebitda_margin"].map((key) => {
                    const m = drawerMetrics.find((x) => x.key === key);
                    if (!m) return null;
                    const status = getTargetStatus(m);
                    return (
                      <KPICard
                        key={m.key}
                        title={m.label}
                        value={`${m.value}${m.unit === "%" ? "%" : ""}${m.unit === "DKK" ? " kr" : ""}`}
                        change={m.change}
                        trend={m.trend}
                        accentColor={status.hit ? "emerald" : "amber"}
                      />
                    );
                  })}
                </div>

                {/* Adskiller + KPI-grid: alle seks */}
                <div className="border-t pt-4 mb-2">
                  <h3 className="text-sm font-medium mb-2">Alle KPI'er</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {drawerMetrics.map((m) => {
                      const status = getTargetStatus(m);
                      return (
                        <KPICard
                          key={m.key}
                          title={m.label}
                          value={`${m.value}${m.unit === "%" ? "%" : ""}${m.unit === "DKK" ? " kr" : ""}`}
                          change={m.change}
                          trend={m.trend}
                          accentColor={status.hit ? "emerald" : "amber"}
                        />
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* AI-analyse: kompakt visning (read-only) */}
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium">AI-analyse</h3>
                {drawerIsStale && (
                  <span className="inline-flex items-center gap-1 text-xs text-chart-warning">
                    <AlertTriangle className="h-3 w-3" />
                    Muligvis forældet
                  </span>
                )}
              </div>

              {!drawerAnalysis ? (
                <div className="py-4 text-sm text-muted-foreground">
                  Ingen AI-analyse endnu. Generér den fra Reports-siden på desktop.
                </div>
              ) : (
                <div className="space-y-3">
                  {drawerAnalysis.overview && (
                    <p className={`text-sm leading-relaxed ${drawerIsStale ? "opacity-60" : ""}`}>
                      {drawerAnalysis.overview}
                    </p>
                  )}

                  {drawerAnalysis.key_findings && drawerAnalysis.key_findings.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Nøglefund
                      </h4>
                      <div className="space-y-1.5">
                        {drawerAnalysis.key_findings.map((finding, idx) => {
                          const severityColor =
                            finding.severity === "kritisk" ? "bg-destructive/10 text-destructive border-destructive/30" :
                            finding.severity === "advarsel" ? "bg-chart-warning/10 text-chart-warning border-chart-warning/30" :
                            "bg-primary/10 text-primary border-primary/30";
                          return (
                            <div
                              key={idx}
                              className={`text-sm px-3 py-2 rounded-md border ${severityColor} ${drawerIsStale ? "opacity-60" : ""}`}
                            >
                              {finding.title}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground pt-2">
                    Se fuld analyse på Reports-siden.
                  </p>
                </div>
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <MessageEditDialog
        open={editingId !== null}
        onOpenChange={(o) => { if (!o) cancelEdit(); }}
        initialHTML={editContent}
        onSave={handleEditSave}
      />
    </>
  );
};

export default CompanyChatPane;
