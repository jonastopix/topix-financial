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
import { HbButton } from "@/components/hjemmebane/HbButton";
import { HbTag } from "@/components/hjemmebane/HbTag";
import { hbControlClasses } from "@/components/hjemmebane/admin/HbField";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose,
} from "@/components/ui/drawer";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { useKpiTargets } from "@/hooks/useKpiTargets";
import { useKpiBenchmarks } from "@/hooks/useKpiBenchmarks";
import { deriveKpiMetrics, getTargetStatus, type KpiMetric } from "@/lib/kpiDefs";
import { useCompanyCommentary } from "@/hooks/useCompanyCommentary";
import type { AnalysisData } from "@/components/AIFinancialAnalysis";
import { format, formatDistanceToNow, startOfDay } from "date-fns";
import { da } from "date-fns/locale";
// Delt med MemberChatPane efter C1-splittet (docs/chat-design.md):
// typerne, emne-konstanterne og små helpers bor i lib/chatShared.ts —
// ren flytning, samme indhold som før.
import {
  dateSeparatorLabel,
  getInitials as getInitialsLocal,
  MAX_MESSAGE_LENGTH,
  MESSAGE_TOPICS,
  TOPIC_COLORS,
  type ConversationWithProfile,
  type Message,
  type MessageTopic,
} from "@/lib/chatShared";

/**
 * `laastTilCompanyId` (VALGFRI, additiv — Jonas 4/9, raadgiverfladen-
 * design.md §3.4/§4 blok 4): sat af virksomhedssiden, som viser ÉN tråd i
 * fuld højde. Når den er sat: samtalen findes på virksomhedens company_id
 * (ikke rådgiverens company-override), samtalelisten hentes IKKE som
 * indbakke og vises ikke, og links til /members/:userId skjules — man er
 * allerede på virksomheden. Indbakken er /chat (bevidst dublet, §3.4).
 * Uden prop'en opfører komponenten sig NØJAGTIG som før: ChatShell giver
 * ingen props, og hver gren nedenfor er `laast ? … : <som før>`.
 *
 * HJEMMEBANE-UDTRYK, ETAPE 1 (4/9): det man ser i blok 4 på virksomheds-
 * siden — roden, headeren, beskedlisten, boblerne, kontekst-chips, den
 * tomme tilstand og skrivefeltet — er lagt om til Hjemmebane. Klasserne er
 * KOPIERET ORDRET fra MemberChatPane (C4), som er den samme komponent med
 * rådgiverdelene slettet; kun det rådgiver-specifikke (headeren med
 * virksomhedsnavn og status, pulse-banneret, afsender-navn i bobler,
 * emnevælgeren) er bygget her, i husets sprog med medlemmets former som
 * forbillede. De seks delte byggesten får `variant="hb"` (før: 0 af 8
 * steder). Adfærden er uændret — samme handlinger, samme kald, samme
 * tekster; kun udtrykket.
 *
 * ETAPE 2 (4/9): resten — det der kun findes på /chat. SIDEBAREN
 * («ADVISOR INBOX SIDEBAR») er husets listeform: papir, hairlines
 * (divide/border-hb-line), søgefelt i hbControlClasses, grupperne som
 * eyebrow-overskrifter, én række pr. samtale med ForfatterAvatar, navn,
 * tid, status og rådgiver — HbTag til statusser (Legat, Udløbet, tæller).
 * Ordet siger hvad rækken er; tonen siger kun om noget haster: rust for
 * «Kræver svar», blæk for «Tjek ind» (før amber — en påmindelse, ikke en
 * fejl), ink-soft for resten. «SE TAL»-SKUFFEN beholder vaul-Draweren
 * (samme mekanik: overlay, swipe) med `theme-hjemmebane` på indholdet —
 * præcis som MobileMessageActionDrawer gør med variant="hb" — og viser
 * KPI'erne som virksomhedssidens KpiKort (blok 5, VirksomhedView), ikke
 * KPICard: samme dom (getTargetStatus → mål nået/ikke nået), kun udtrykket
 * er Hb. ⋯-MENUEN er ikke længere en Radix Popover: den er en simpel
 * menu i DOM-træet (HbMenu nedenfor), fordi HbOverlejrings HbPopover er
 * venstre-forankret (bygget til datovælgeren under et felt), og ⋯ står i
 * headerens højre kant og skal åbne mod venstre; udenfor-klik og Escape
 * lukker, fokus går tilbage til triggeren — samme regler. Roden bærer
 * `theme-hjemmebane`, så hb-tokens findes også på /chat, hvor skallen
 * stadig er AppLayout. Emnefarverne (TOPIC_COLORS) er off-token og bruges
 * ikke til farve: alle emne-chips er sage/ink, som hos medlemmet.
 */

/** ⋯-menuen i DOM-træet (etape 2): højre-forankret panel under triggeren,
    lukker ved mousedown udenfor og ved Escape (capture), fokus tilbage til
    triggeren. Samme regler som HbOverlejring.HbPopover, som er venstre-
    forankret — en `align`-prop dér er det naturlige næste skridt, så denne
    kan udgå. Klik INDE i panelet (tildel, foreslå opgave med felter) lukker
    ikke; kalderen lukker selv efter en handling, som før. */
const HbMenu = ({
  open, onOpenChange, trigger, children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trigger: (props: { ref: React.RefObject<HTMLButtonElement>; onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "menu" }) => React.ReactNode;
  children: React.ReactNode;
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) onOpenChangeRef.current(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        e.preventDefault();
        onOpenChangeRef.current(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);
  return (
    <div ref={wrapperRef} className="relative flex-shrink-0">
      {trigger({ ref: triggerRef, onClick: () => onOpenChange(!open), "aria-expanded": open, "aria-haspopup": "menu" })}
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-56 rounded-hb border border-hb-line bg-hb-surface p-1 shadow-hb-hover">
          {children}
        </div>
      )}
    </div>
  );
};

/** KPI-kort i skuffen — VirksomhedView.KpiKort (blok 5), uden sparkline
    («kompakt, ingen sparkline» var skuffens egen regel). afviger = målet er
    ikke nået (getTargetStatus, som skuffen dømte før med emerald/amber). */
const SkuffeKpiKort = ({ metric, afviger }: { metric: KpiMetric; afviger: boolean }) => (
  <div className={`rounded-hb border p-3 ${afviger ? "border-hb-rust/40 bg-hb-rust/5" : "border-hb-line bg-hb-surface"}`}>
    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{metric.label}</p>
    <p className={`mt-1 font-editorial text-2xl leading-tight ${afviger ? "text-hb-rust" : "text-hb-ink"}`}>
      {metric.value}
      <span className="ml-1 text-sm text-hb-ink-soft">{metric.unit === "%" ? "%" : metric.unit === "DKK" ? "kr" : ""}</span>
    </p>
    <p className="mt-1 text-xs text-hb-ink-soft">
      {metric.change ? `${metric.change} M/M` : "M/M —"}
      {metric.targetNum > 0 && ` · mål ${metric.target}`}
    </p>
  </div>
);

/** Samme avatar-form som MemberChatPane (:84-95, kopieret derfra — den er
    lokal dér, som den er lokal i CommunityTraadView): rounded-full,
    hb-line-ramme, sage-initial som fallback. Bruges til afsendere OG til
    virksomhedens logo i headeren. */
const ForfatterAvatar = ({ navn, avatarUrl, className = "h-9 w-9" }: { navn: string | null; avatarUrl: string | null; className?: string }) =>
  avatarUrl ? (
    <img
      src={avatarUrl}
      alt={navn ?? "Medlem"}
      className={`${className} shrink-0 rounded-full border border-hb-line object-cover`}
    />
  ) : (
    <span className={`${className} flex shrink-0 items-center justify-center rounded-full border border-hb-line bg-hb-sage/40 font-editorial text-sm text-hb-ink-soft`}>
      {(navn ?? "?").charAt(0)}
    </span>
  );

const CompanyChatPane = ({ laastTilCompanyId }: { laastTilCompanyId?: string } = {}) => {
  const laast = !!laastTilCompanyId;
  const { user, isAdvisor: rawAdvisor, companyId, isCompanyOverride, companyName } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;
  // Låst tilstand: er samtalelisten hentet? Uden den ville tom-tilstanden
  // blinke før første svar.
  const [samtalerHentet, setSamtalerHentet] = useState(false);
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

  // C1-splittet: all-advisor-profiles-query'en var `enabled: !isAdvisor`
  // og flyttede med til MemberChatPane. For rådgiveren var værdien altid
  // fallback'en — composer-placeholderen ("Skriv til Dine rådgivere...")
  // er derfor uændret.
  const advisorNamesLabel = "Dine rådgivere";


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
      
      if (laastTilCompanyId) {
        // Blok 4: virksomhedens egen samtale — nøglet på sidens companyId,
        // ikke på company-override. Målt 4/9: højst én samtale pr. virksomhed.
        convsQuery = convsQuery.eq("company_id", laastTilCompanyId);
      } else if (isCompanyOverride && companyId) {
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
      if (laastTilCompanyId) {
        // Ingen liste at vælge fra — den ene samtale åbnes direkte.
        if (deduped.length > 0) setActiveConvId(deduped[0].id);
        setSamtalerHentet(true);
      }
    };

    loadConversations();
  }, [user, isAdvisor, companyId, isCompanyOverride, laastTilCompanyId]);

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

  /* Rul beskedlisten til bunden når `messages` ændrer sig — men KUN
     listens EGEN scroll-container (messagesContainerRef), aldrig
     forfædrene. Før stod her `messagesEndRef.current?.scrollIntoView(
     { behavior: "smooth" })`, og scrollIntoView ruller ALLE scrollbare
     forfædre indtil elementet er i view. På /chat er der én (listen —
     AppLayout fullscreen binder resten), så det var usynligt. På
     virksomhedssiden (blok 4, laastTilCompanyId) er der TO: listen og
     Hb-skallens indholdskolonne (HbMemberShell.tsx:240 lg:overflow-y-auto),
     som chatten ligger midt i under blok 1 og 2 — så HELE siden rullede
     ned til chattens bund ved første indlæsning og ved hver realtime-
     INSERT/UPDATE/DELETE, pin, redigér og slet (målt 4/9,
     ~/Downloads/recon-chat-hop.md). `el.scrollTo` rører kun `el`s egen
     scrollTop; forfædrene står stille. /chat ruller præcis som før
     (samme udløsere, samme smooth), den ruller bare ikke noget den ikke
     skulle.
     FØRSTE indlæsning i låst tilstand (blok 4): rulningen BEHOLDES.
     Bekymringen var at siden selv rullede ned til chatten, så man
     mistede blok 1 — det gjorde scrollIntoView; scrollTo på listen kan
     ikke flytte siden, listen står i sin faste 100dvh-ramme og viser de
     nyeste beskeder nederst, som en chat skal. Uden rulningen ville
     tråden åbne ved sin ÆLDSTE besked. */
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

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
  const showSidebar = !laast && isAdvisor && (!isMobile || !showMessages);
  const showMessageArea = laast || !isMobile || showMessages || !isAdvisor;

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
      {/* «Indbakke»-overskriften ligger UDEN FOR roden (over den) og får derfor
          sin egen theme-hjemmebane + papir, så den er læsbar i AppLayout og
          papiret løber sammen med roden nedenunder. */}
      {!laast && isAdvisor && !isFullscreen && !isMobile && (
        <div className="theme-hjemmebane bg-hb-paper px-4 pt-4 pb-2 font-body text-hb-ink antialiased">
          <h1 className="font-editorial text-2xl font-medium leading-tight text-hb-ink flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-hb-evergreen" />
            Indbakke
          </h1>
        </div>
      )}

      {/* Roden — MemberChatPane:505-507 (C4/C: kassen er væk — papiret går ud
          til kanten). theme-hjemmebane + bg-hb-paper så hb-tokens findes også
          på /chat (AppLayout); i blok 4 er skallen allerede Hb og roden
          gennemsigtig i praksis. */}
      <div className="theme-hjemmebane flex flex-1 min-h-0 overflow-hidden bg-hb-paper font-body text-hb-ink antialiased">
        {/* ─── ADVISOR INBOX SIDEBAR — husets listeform (etape 2) ─── */}
        {showSidebar && (
          <div className={`${isMobile ? "w-full" : "w-[340px]"} border-r border-hb-line flex flex-col bg-hb-paper`}>
            {/* Search — VirksomhedslisteView:295-301: hbControlClasses, rund */}
            <div className="px-3 pt-3 pb-2 border-b border-hb-line">
              {isMobile && (
                <h1 className="font-editorial text-2xl font-medium leading-tight text-hb-ink flex items-center gap-2 mb-2">
                  <MessageCircle className="h-5 w-5 text-hb-evergreen" />
                  Indbakke
                </h1>
              )}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-hb-ink-soft" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Søg virksomhed..."
                  className={`${hbControlClasses} rounded-full py-2 pl-9 pr-4 text-sm`}
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
                      <p className="text-xs text-hb-ink-soft">Ingen resultater for "{searchQuery}"</p>
                    </div>
                  );
                }

                // Én række pr. samtale — LegatViews rækkeform (valgt = sage,
                // hover = sage/20, hairline under). Tonen: rust kun for
                // «Kræver svar»; «Tjek ind» er en påmindelse og står i blæk.
                const renderConvCard = (conv: ConversationWithProfile, urgency: 'reply' | 'checkin' | 'normal') => {
                  const isActive = activeConvId === conv.id;
                  const assignedInitials = getAdvisorInitials(conv.assigned_advisor_id);
                  const assignedName = getAdvisorName(conv.assigned_advisor_id);
                  return (
                    <button
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv.id)}
                      className={`w-full text-left px-3 py-3 border-b border-hb-line/60 transition-colors ${
                        isActive ? "bg-hb-sage/40" : "hover:bg-hb-sage/20"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <ForfatterAvatar navn={conv.companyName || conv.profile?.full_name || null} avatarUrl={conv.companyLogoUrl || null} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className={`text-sm truncate text-hb-ink ${urgency === 'reply' ? "font-medium" : ""}`}>
                              {conv.companyName || conv.profile?.full_name || "Ukendt"}
                              {conv.isLegat && (
                                <HbTag className="ml-1.5 bg-hb-sage/60 px-1.5 py-0.5 text-[9px]">Legat</HbTag>
                              )}
                              {conv.membershipTier === "expired" && (
                                <HbTag className="ml-1.5 bg-hb-line/60 px-1.5 py-0.5 text-[9px] text-hb-ink-soft">Udløbet</HbTag>
                              )}
                            </p>
                            <span className="text-[10px] text-hb-ink-soft ml-2 flex-shrink-0">
                              {relativeTime(conv.last_message_at)}
                            </span>
                          </div>
                          {conv.companyName && conv.profile?.full_name && (
                            <p className="text-[10px] text-hb-ink-soft truncate leading-tight mb-0.5">
                              {conv.profile.full_name}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 mt-1">
                            {urgency === 'reply' && (
                              <span className="text-[10px] font-medium text-hb-rust">
                                {conv.last_member_message_at
                                  ? `Afventer · ${formatDistanceToNow(new Date(conv.last_member_message_at), { locale: da })}`
                                  : "Afventer svar"}
                              </span>
                            )}
                            {urgency === 'checkin' && (
                              <span className="text-[10px] font-medium text-hb-ink">
                                {conv.last_advisor_reply_at
                                  ? `Ingen kontakt · ${formatDistanceToNow(new Date(conv.last_advisor_reply_at), { locale: da })}`
                                  : "Tjek ind"}
                              </span>
                            )}
                            {urgency === 'normal' && conv.lastMessage && (
                              <p className="text-xs text-hb-ink-soft truncate">
                                {conv.lastMessageSenderId === user?.id ? "Du: " : ""}
                                {conv.lastMessage.replace(/<[^>]+>/g, "").slice(0, 50)}
                              </p>
                            )}
                            {conv.hasRecentReport && (
                              <span className="ml-auto flex-shrink-0">
                                <FileText className="h-3 w-3 text-hb-evergreen" />
                              </span>
                            )}
                            {assignedInitials && (
                              <HbTag
                                className="bg-hb-sage/40 px-1.5 py-0.5 text-[9px] text-hb-ink-soft flex-shrink-0 ml-auto"
                                title={assignedName || ""}
                              >
                                {assignedName?.split(" ")[0] || assignedInitials}
                              </HbTag>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                };

                // Gruppeoverskrifter som eyebrows; tælleren som HbTag.
                const gruppeHoved = (label: string, antal: number, tone: "rust" | "ink" | "soft") => (
                  <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
                    <span className={`text-[11px] font-medium uppercase tracking-[0.14em] ${tone === "rust" ? "text-hb-rust" : tone === "ink" ? "text-hb-ink" : "text-hb-ink-soft"}`}>
                      {label}
                    </span>
                    <HbTag className={`px-1.5 py-0 text-[10px] ${tone === "rust" ? "bg-hb-rust/10 text-hb-rust" : "bg-hb-sage/50 text-hb-ink-soft"}`}>
                      {antal}
                    </HbTag>
                  </div>
                );

                return (
                  <>
                    {/* Section: Kræver svar */}
                    {replyList.length > 0 && (
                      <div>
                        {gruppeHoved("Kræver svar", replyList.length, "rust")}
                        {replyList.map(c => renderConvCard(c, 'reply'))}
                      </div>
                    )}

                    {/* Section: Tjek ind */}
                    {checkinList.length > 0 && (
                      <div className={replyList.length > 0 ? "border-t border-hb-line" : ""}>
                        {gruppeHoved("Tjek ind", checkinList.length, "ink")}
                        {checkinList.map(c => renderConvCard(c, 'checkin'))}
                      </div>
                    )}

                    {/* Section: Alle andre */}
                    {restList.length > 0 && (
                      <div className={(replyList.length > 0 || checkinList.length > 0) ? "border-t border-hb-line" : ""}>
                        {gruppeHoved("Alle", restList.length, "soft")}
                        {restList.map(c => renderConvCard(c, 'normal'))}
                      </div>
                    )}

                    {/* Section: Legat */}
                    {legatList.length > 0 && (
                      <div className={(replyList.length > 0 || checkinList.length > 0 || restList.length > 0) ? "border-t border-hb-line mt-1" : ""}>
                        {gruppeHoved("Legat", legatList.length, "soft")}
                        {legatList.map(c => renderConvCard(c, 'normal'))}
                      </div>
                    )}

                    {/* Section: Udløbede (search-reveal only) */}
                    {expiredList.length > 0 && (
                      <div className={(replyList.length > 0 || checkinList.length > 0 || restList.length > 0 || legatList.length > 0) ? "border-t border-hb-line mt-1" : ""}>
                        {gruppeHoved("Udløbede", expiredList.length, "soft")}
                        {expiredList.map(c => renderConvCard(c, 'normal'))}
                      </div>
                    )}

                    {/* Empty state */}
                    {replyList.length === 0 && checkinList.length === 0 && restList.length === 0 && legatList.length === 0 && expiredList.length === 0 && !q && (
                      <div className="p-8 text-center">
                        <CheckCheck className="h-8 w-8 text-hb-evergreen/40 mx-auto mb-2" />
                        <p className="text-xs text-hb-ink-soft">Alt er i orden 🎉</p>
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
                {/* Header — rådgiver-specifik (virksomhed, medlemmer, status,
                    handlinger). Formen er medlemmets header (MemberChatPane:513:
                    hairline under, samme padding), indholdet er rådgiverens. */}
                {isAdvisor ? (
                  <div className={`${isMobile ? "px-3 py-2.5" : "px-4 md:px-6 py-3"} border-b border-hb-line`}>
                    {/* Row 1: identity + nav */}
                    <div className="flex items-center gap-3">
                      {isMobile && !laast && (
                        <button onClick={handleBackToList} className="p-1.5 -ml-1 rounded-full text-hb-ink-soft hover:text-hb-ink hover:bg-hb-sage/30 transition-colors">
                          <ArrowLeft className="h-5 w-5" />
                        </button>
                      )}
                      <ForfatterAvatar navn={activeConv?.companyName || null} avatarUrl={activeConv?.companyLogoUrl || null} className="h-8 w-8" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-hb-ink truncate">
                          {activeConv?.companyName || "Ukendt"}
                        </p>
                        {/* Member names shown directly under company name */}
                        {(() => {
                          const names = companyMembers.length > 0
                            ? companyMembers.map(p => p.full_name).join(", ")
                            : activeConv?.profile?.full_name || null;
                          return names ? (
                            <p className="text-[11px] text-hb-ink-soft truncate leading-tight">
                              {names}
                            </p>
                          ) : null;
                        })()}
                        {/* Quick nav links — desktop only, takes too much vertical space on mobile.
                            Skjult i blok 4 (laast): man er allerede på virksomheden. */}
                        {activeConv?.member_id && !isMobile && !laast && (
                          <div className="flex items-center gap-1 mt-0.5">
                            {[
                              { label: "Overblik", path: `/members/${activeConv.member_id}` },
                              { label: "Milestones", path: `/members/${activeConv.member_id}?section=milestones` },
                              { label: "Rapporter", path: `/members/${activeConv.member_id}?section=reports` },
                            ].map(({ label, path }) => (
                              <button
                                key={label}
                                onClick={() => navigate(path)}
                                className="text-[10px] px-2 py-0.5 rounded-full bg-hb-sage/40 hover:bg-hb-sage text-hb-ink-soft hover:text-hb-ink transition-colors"
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Se tal — mobil-rådgiver: hurtig adgang til virksomhedens nøgletal.
                          Triggeren er Hb; skuffen den åbner er etape 2. */}
                      {isMobile && isAdvisor && (
                        <button
                          type="button"
                          onClick={() => setShowCompanyDrawer(true)}
                          className="h-8 px-2 gap-1.5 flex-shrink-0 inline-flex items-center rounded-full text-hb-ink-soft hover:text-hb-ink hover:bg-hb-sage/30 transition-colors"
                        >
                          <BarChart3 className="h-4 w-4" />
                          <span className="text-xs">Se tal</span>
                        </button>
                      )}
                      {/* Primary contextual action — status som HbTag; rust bærer
                          «venter på dig» (en af rusts betydninger: advarsel). */}
                      {activeConv?.awaiting_reply_from === "advisor" && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-hb-rust/10 px-2 py-0.5 text-[11px] font-medium text-hb-rust flex-shrink-0">
                          <Clock className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Afventer dit svar</span>
                        </span>
                      )}
                      {/* ⋯ secondary actions menu — HbMenu i DOM-træet (etape 2),
                          ingen portal. Samme tre handlinger, samme kald. */}
                      <HbMenu
                        open={assignmentPopoverOpen}
                        onOpenChange={setAssignmentPopoverOpen}
                        trigger={(p) => (
                          <button type="button" {...p} className="p-1.5 rounded-full text-hb-ink-soft hover:text-hb-ink hover:bg-hb-sage/30 transition-colors flex-shrink-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        )}
                      >
                            {/* Assign */}
                            <div className="px-2 py-1 mb-1">
                              <p className="text-[10px] text-hb-ink-soft font-medium uppercase tracking-[0.14em] mb-1.5">Tildel rådgiver</p>
                              {(advisorUsers || []).map((a: any) => {
                                const isCurrent = activeConv?.assigned_advisor_id === a.user_id;
                                return (
                                  <button
                                    key={a.user_id}
                                    onClick={() => { handleAssignAdvisor(a.user_id); setAssignmentPopoverOpen(false); }}
                                    className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs transition-colors text-hb-ink ${isCurrent ? "bg-hb-sage/40 font-medium" : "hover:bg-hb-sage/30"}`}
                                  >
                                    <div className="h-5 w-5 rounded-full border border-hb-line bg-hb-sage/40 flex items-center justify-center overflow-hidden flex-shrink-0">
                                      {a.avatar_url ? (
                                        <img src={a.avatar_url} alt="" className="h-5 w-5 object-cover" />
                                      ) : (
                                        <span className="text-[8px] font-medium text-hb-ink-soft">{getInitialsLocal(a.full_name)}</span>
                                      )}
                                    </div>
                                    <span className="truncate">{a.full_name}</span>
                                    {isCurrent && <Check className="h-3 w-3 text-hb-evergreen ml-auto flex-shrink-0" />}
                                  </button>
                                );
                              })}
                              {activeConv?.assigned_advisor_id && (
                                <button
                                  onClick={() => { handleAssignAdvisor(null); setAssignmentPopoverOpen(false); }}
                                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-hb-ink-soft hover:text-hb-rust hover:bg-hb-rust/5 transition-colors mt-1"
                                >
                                  Fjern tildeling
                                </button>
                              )}
                            </div>
                            {activeConv?.awaiting_reply_from === "advisor" && (
                              <>
                                <div className="border-t border-hb-line my-1" />
                                <button
                                  onClick={() => { handleNoReplyNeeded(); setAssignmentPopoverOpen(false); }}
                                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-hb-ink-soft hover:text-hb-ink hover:bg-hb-sage/30 transition-colors"
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
                            <div className="border-t border-hb-line my-1" />
                            <div className="px-2 py-1.5">
                              <p className="text-[10px] text-hb-ink-soft font-medium uppercase tracking-[0.14em] mb-1.5">Foreslå opgave</p>
                              <input
                                value={forslagTitel}
                                onChange={(e) => setForslagTitel(e.target.value)}
                                maxLength={200}
                                placeholder="Hvad skal medlemmet gøre?"
                                className={`${hbControlClasses} mb-1.5 px-2 py-1.5 text-xs`}
                              />
                              <textarea
                                value={forslagBegrundelse}
                                onChange={(e) => setForslagBegrundelse(e.target.value)}
                                placeholder="Hvorfor? (valgfrit)"
                                rows={2}
                                className={`${hbControlClasses} mb-1.5 resize-none px-2 py-1.5 text-xs`}
                              />
                              <HbButton
                                type="button"
                                onClick={handleForeslaaOpgave}
                                disabled={foreslaarOpgave || !forslagTitel.trim()}
                                className="h-8 w-full px-2 text-xs"
                              >
                                {foreslaarOpgave ? "Sender…" : "Foreslå opgave"}
                              </HbButton>
                            </div>
                      </HbMenu>
                      {/* Prev/next */}
                      {advisorConvList.length > 1 && (
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button
                            onClick={() => prevConv && setActiveConvId(prevConv.id)}
                            disabled={!prevConv}
                            className="p-1.5 rounded-full text-hb-ink-soft hover:text-hb-ink hover:bg-hb-sage/30 disabled:opacity-30 transition-colors"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => nextConv && setActiveConvId(nextConv.id)}
                            disabled={!nextConv}
                            className="p-1.5 rounded-full text-hb-ink-soft hover:text-hb-ink hover:bg-hb-sage/30 disabled:opacity-30 transition-colors"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

                {/* Pulse banner — rådgiver-specifik. Før amber (off-token); nu en
                    stille sage-linje under headeren: medlemmets egne ord er en
                    oplysning, ikke en advarsel. */}
                {isAdvisor && activeConv && latestPulse?.help_needed && (
                  <div className="px-4 py-2 bg-hb-sage/20 border-b border-hb-line">
                    <p className="text-[11px] text-hb-ink-soft">
                      <span className="font-medium text-hb-ink">Brug for hjælp til:</span> {latestPulse.help_needed}
                    </p>
                  </div>
                )}

                {/* Messages list — MemberChatPane:538-551, ordret */}
                <div ref={messagesContainerRef} className={`flex-1 overflow-y-auto min-w-0 ${isMobile ? "px-3 py-3 space-y-2" : "px-4 md:px-5 py-4 space-y-4"}`}>
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full py-16 text-center px-8">
                      <div className="h-12 w-12 rounded-full bg-hb-sage/40 flex items-center justify-center mb-4">
                        <MessageSquare className="h-6 w-6 text-hb-evergreen" />
                      </div>
                      <p className="text-sm font-medium text-hb-ink mb-1">
                        Din direkte linje til rådgiverne
                      </p>
                      <p className="text-xs text-hb-ink-soft leading-relaxed max-w-xs">
                        Skriv hvad du har på hjerte — spørgsmål, opdateringer eller bare hvad der fylder. Dine rådgivere læser dine tal og svarer hurtigt.
                      </p>
                    </div>
                  )}
                  {(() => {
                    let lastDateKey = "";
                    let unreadDividerShown = false;
                    return messages.map((msg, msgIdx) => {
                      // session_prep-filteret (!isAdvisor) flyttede til
                      // MemberChatPane med C1-splittet — rådgiveren SER
                      // session_prep, så her er intet filter.
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
                          /* MemberChatPane:574-581: ÉN hairline, labelen står på
                             papiret over den — ikke to streger om et ord. */
                          <div className="relative py-3">
                            <div className="border-t border-hb-line" />
                            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-hb-paper px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                              {dateSeparatorLabel(msgDate)}
                            </span>
                          </div>
                        );
                      }

                      // System / AI messages — rådgiveren ser MERE end medlemmet her
                      // (session_prep-dagsordenen, agent-feedback, label), så
                      // kortet består (medlemmets stille linje ville drukne en
                      // dagsorden) — men i Hb-kortets form: hvid flade, hairline,
                      // rounded-hb, evergreen som handlingsfarve.
                      if (msg.message_type === "system" || msg.message_type === "ai") {
                        return (
                          <React.Fragment key={msg.id}>
                            {dateSep}
                          <div
                            ref={(el) => { if (el) messageRefs.current.set(msg.id, el); }}
                            className="flex justify-center group/msg transition-all duration-300"
                          >
                            <div
                              className={`max-w-[90%] md:max-w-[85%] rounded-hb border border-hb-line bg-hb-surface px-4 md:px-5 py-3 md:py-4 relative ${msg.pinned_at ? "ring-1 ring-hb-evergreen/20" : ""}`}
                            >
                              <button
                                onClick={() => togglePin(msg)}
                                className={`absolute top-2 right-2 p-1 rounded-md transition-all ${
                                  msg.pinned_at
                                    ? "text-hb-evergreen opacity-100 hover:text-hb-rust"
                                    : "text-hb-ink-soft opacity-0 group-hover/msg:opacity-100 hover:text-hb-evergreen hover:bg-hb-evergreen/10"
                                }`}
                                title={msg.pinned_at ? "Fjern pin" : "Pin besked"}
                              >
                                <Pin className="h-3.5 w-3.5" />
                              </button>
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <Sparkles className="h-3.5 w-3.5 text-hb-evergreen" />
                                <span className="text-[10px] font-medium text-hb-ink-soft uppercase tracking-[0.14em]">
                                  {msg.context_type === "session_prep" ? "Session-dagsorden" : msg.message_type === "ai" ? "AI Analyse" : "System"}
                                </span>
                                {topicInfo && (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-hb-sage/50 text-hb-ink">
                                    <topicInfo.icon className="h-2.5 w-2.5" />
                                    {topicInfo.label}
                                  </span>
                                )}
                                <span className="text-[10px] text-hb-ink-soft">
                                  {format(new Date(msg.created_at), "HH:mm", { locale: da })}
                                </span>
                              </div>
                              <div className="text-sm text-hb-ink leading-relaxed chat-html-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(
                                msg.content
                                  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                  .replace(/\n/g, '<br>'),
                                { ALLOWED_TAGS: ['b','strong','i','em','ul','ol','li','a','p','br'], ALLOWED_ATTR: ['href','target','rel'] }
                              ) }} />
                              {/* C2 (besluttet 31/8): report_card-kortet og
                                  ai_analysis-chippen er fjernet — system·report-
                                  bestanden slettes historisk og produceres ikke
                                  længere. Chippen består for milestone-beskederne. */}
                              {contextType && contextMeta?.title && (() => {
                                const memberId = activeConv?.member_id;
                                // Intet link i blok 4 (laast) — siden ER virksomheden.
                                const linkPath =
                                  contextType === "milestone" && memberId && !laast
                                    ? `/members/${memberId}?section=milestones`
                                    : null;
                                const chip = (
                                  <span className="inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full bg-hb-sage/30 text-hb-ink-soft">
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
                                /* MemberChatPane:632-658: tekstuelle handlinger i evergreen */
                                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-hb-line text-[11px]">
                                  <span className="text-hb-ink-soft/70">Var dette nyttigt?</span>
                                  <button
                                    onClick={async () => {
                                      await supabase.from("messages").update({
                                        context_meta: { ...(msg.context_meta as any || {}), feedback: "up" }
                                      } as any).eq("id", msg.id);
                                      toast.success("Tak for feedback");
                                    }}
                                    className="text-hb-evergreen transition-colors hover:underline underline-offset-2"
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
                                    className="text-hb-evergreen transition-colors hover:underline underline-offset-2"
                                  >
                                    Nej
                                  </button>
                                </div>
                              )}
                              {msg.context_type === "session_prep" && (
                                <div className="mt-2 pt-2 border-t border-hb-line flex items-center gap-1.5">
                                  <div className="h-1.5 w-1.5 rounded-full bg-hb-evergreen/60" />
                                  <span className="text-[10px] text-hb-ink-soft">Forberedelse til næste session med founder</span>
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
                            /* MemberChatPane:684-693: evergreen, diskret — samme
                               én-hairline-form som dags-separatoren. */
                            <div className="relative py-3">
                              <div className="border-t border-hb-evergreen/40" />
                              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-hb-paper px-3 text-[11px] font-medium text-hb-evergreen">
                                Nye beskeder
                              </span>
                            </div>
                          )}
                        <div
                          ref={(el) => { if (el) messageRefs.current.set(msg.id, el); }}
                          className={`flex group/msg ${isMine ? "justify-end" : "justify-start"} items-end gap-2 transition-all duration-300`}
                        >
                          {!isMine && !isMobile && (
                            <div className="mb-1">
                              <ForfatterAvatar navn={senderName} avatarUrl={senderAvatar ?? null} className="h-7 w-7" />
                            </div>
                          )}
                          <div
                            className={`${isMobile ? "max-w-[88%]" : "max-w-[70%]"} relative ${msg.pinned_at ? "ring-1 ring-hb-evergreen/20 rounded-hb" : ""}`}
                            {...(isMobile ? longPressHandlers(msg.id) : {})}
                          >
                            {longPressedMessageId === msg.id && isMobile && (
                              <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-hb-surface border border-hb-line rounded-full px-2 py-1 shadow-hb-hover">
                                <button onClick={() => { toggleReaction(msg.id, "👍"); setLongPressedMessageId(null); }} className="p-1.5 hover:bg-hb-sage/30 rounded-full text-sm">👍</button>
                                <button onClick={() => { toggleReaction(msg.id, "❤️"); setLongPressedMessageId(null); }} className="p-1.5 hover:bg-hb-sage/30 rounded-full text-sm">❤️</button>
                                <button onClick={() => { navigator.clipboard.writeText(msg.content || ""); setLongPressedMessageId(null); }} className="p-1.5 hover:bg-hb-sage/30 rounded-full text-sm">📋</button>
                              </div>
                            )}
                            {!isMobile && !isEditingThis && (
                              <div className={`absolute ${isMine ? "-left-20" : "-right-20"} top-1/2 -translate-y-1/2 flex gap-0.5 z-10`}>
                                <button
                                  onClick={() => togglePin(msg)}
                                  className={`p-1 rounded-md transition-all ${
                                    msg.pinned_at
                                      ? "text-hb-evergreen opacity-100 hover:text-hb-rust"
                                      : "text-hb-ink-soft opacity-0 group-hover/msg:opacity-100 hover:text-hb-evergreen hover:bg-hb-evergreen/10"
                                  }`}
                                  title={msg.pinned_at ? "Fjern pin" : "Pin besked"}
                                >
                                  <Pin className="h-3.5 w-3.5" />
                                </button>
                                <ReactionPicker
                                  onSelect={(emoji) => toggleReaction(msg.id, emoji)}
                                  isMine={isMine}
                                  variant="hb"
                                />
                                <MessageActionMenu
                                  canEdit={canEditCheck(msg.sender_id, msg.created_at)}
                                  canDelete={canDeleteCheck(msg.sender_id)}
                                  onEdit={() => startEdit(msg.id, msg.content)}
                                  onDelete={() => handleDeleteMsg(msg.id)}
                                  isMine={isMine}
                                  variant="hb"
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
                                variant="hb"
                              >
                                {topicInfo && (
                                  /* Emnefarverne (inkl. milestone-lilla) er off-token —
                                     i Hb er alle emne-chips sage/ink (HbTag-formen). */
                                  <div className={`mb-1 inline-flex items-center gap-1 text-[9px] font-medium px-2 py-0.5 rounded-full bg-hb-sage/50 text-hb-ink ${isMine ? "ml-auto" : ""}`}>
                                    <topicInfo.icon className="h-2.5 w-2.5" />
                                    {topicInfo.label}
                                  </div>
                                )}
                                {contextType && contextMeta?.title && (
                                  <div className={`mb-1 inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-t-lg ${
                                    isMine ? "bg-hb-sage/60 text-hb-ink ml-auto" : "bg-hb-sage/30 text-hb-ink-soft"
                                  }`}>
                                    {contextType === "report" && <FileText className="h-3 w-3" />}
                                    {contextType === "milestone" && <Target className="h-3 w-3" />}
                                    Re: {String(contextMeta.title)}
                                  </div>
                                )}
                                <div
                                  className={`rounded-hb px-4 py-2.5 ${
                                    isMine
                                      ? "bg-hb-sage text-hb-ink rounded-br-md"
                                      : "bg-hb-surface border border-hb-line text-hb-ink rounded-bl-md"
                                  } ${contextType ? "rounded-tl-md" : ""}`}
                                >
                                  {/* Afsender-navn i boblen — rådgiveren ser navnet på den der
                                      skrev (samme betingelse som før, medlemmets placering). */}
                                  {isAdvisor && !isMine && (
                                    <p className="text-[10px] font-medium text-hb-ink-soft mb-0.5">
                                      {senderName}
                                    </p>
                                  )}
                                  {msg.content !== "📎" && (
                                    <div className="text-sm leading-relaxed chat-html-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.content, { ALLOWED_TAGS: ['b','strong','i','em','ul','ol','li','a','p','br'], ALLOWED_ATTR: ['href','target','rel'] }) }} />
                                  )}
                                  <MessageAttachments attachments={msg.context_meta?.attachments} isMine={isMine} messageId={msg.id} source="messages" variant="hb" />
                                  <div className={`flex items-center gap-1 mt-1 ${isMine ? "justify-end" : ""}`}>
                                    {(msg as any).edited_at && (
                                      <span className="text-[9px] italic text-hb-ink-soft/70">
                                        (redigeret)
                                      </span>
                                    )}
                                    <span className="text-[10px] text-hb-ink-soft">
                                      {format(new Date(msg.created_at), "HH:mm", { locale: da })}
                                    </span>
                                  </div>
                                </div>
                              </MobileMessageActionDrawer>
                            ) : (
                              <>
                                {topicInfo && (
                                  /* Emnefarverne (inkl. milestone-lilla) er off-token —
                                     i Hb er alle emne-chips sage/ink (HbTag-formen). */
                                  <div className={`mb-1 inline-flex items-center gap-1 text-[9px] font-medium px-2 py-0.5 rounded-full bg-hb-sage/50 text-hb-ink ${isMine ? "ml-auto" : ""}`}>
                                    <topicInfo.icon className="h-2.5 w-2.5" />
                                    {topicInfo.label}
                                  </div>
                                )}
                                {contextType && contextMeta?.title && (
                                  <div className={`mb-1 inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-t-lg ${
                                    isMine ? "bg-hb-sage/60 text-hb-ink ml-auto" : "bg-hb-sage/30 text-hb-ink-soft"
                                  }`}>
                                    {contextType === "report" && <FileText className="h-3 w-3" />}
                                    {contextType === "milestone" && <Target className="h-3 w-3" />}
                                    Re: {String(contextMeta.title)}
                                  </div>
                                )}
                                <div
                                  className={`rounded-hb px-4 py-2.5 ${
                                    isMine
                                      ? "bg-hb-sage text-hb-ink rounded-br-md"
                                      : "bg-hb-surface border border-hb-line text-hb-ink rounded-bl-md"
                                  } ${contextType ? "rounded-tl-md" : ""}`}
                                >
                                  {isAdvisor && !isMine && (
                                    <p className="text-[10px] font-medium text-hb-ink-soft mb-0.5">
                                      {senderName}
                                    </p>
                                  )}
                                  {msg.content !== "📎" && (
                                    <div className="text-sm leading-relaxed chat-html-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.content, { ALLOWED_TAGS: ['b','strong','i','em','ul','ol','li','a','p','br'], ALLOWED_ATTR: ['href','target','rel'] }) }} />
                                  )}
                                  <MessageAttachments attachments={msg.context_meta?.attachments} isMine={isMine} messageId={msg.id} source="messages" variant="hb" />
                                  <div className={`flex items-center gap-1 mt-1 ${isMine ? "justify-end" : ""}`}>
                                    {(msg as any).edited_at && (
                                      <span className="text-[9px] italic text-hb-ink-soft/70">
                                        (redigeret)
                                      </span>
                                    )}
                                    <span className="text-[10px] text-hb-ink-soft">
                                      {format(new Date(msg.created_at), "HH:mm", { locale: da })}
                                    </span>
                                  </div>
                                </div>
                              </>
                            )}
                            <ReactionBar
                              reactions={getReactions(msg.id)}
                              onToggle={(emoji) => toggleReaction(msg.id, emoji)}
                              isMine={isMine}
                              variant="hb"
                              getReactorName={(userId) =>
                                profilesMap.get(userId)?.full_name ||
                                participants.find(p => p.user_id === userId)?.full_name ||
                                "Ukendt"
                              }
                            />
                          </div>
                          {isMine && !isMobile && (
                            <div className="mb-1">
                              <ForfatterAvatar navn={senderName} avatarUrl={senderAvatar ?? null} className="h-7 w-7" />
                            </div>
                          )}
                        </div>
                        </React.Fragment>
                      );
                    });
                  })()}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input with topic selector — sticky at bottom of message column.
                    Rammen er MemberChatPane:885-890 (hairline over feltet, papir);
                    feltet er ChatRichInputs hb-variant. */}
                <div
                  className={`${isMobile ? "px-2 pt-2 pb-2" : "p-3 md:p-4"} border-t border-hb-line bg-hb-paper shrink-0 z-10`}
                  style={{
                    paddingBottom: isMobile ? "calc(0.5rem + env(safe-area-inset-bottom))" : undefined,
                  }}
                >
                  {activeConv?.membershipTier === "expired" ? (
                    /* MemberChatPane:891-898 — advarsel, rust (en af rusts fire betydninger). */
                    <div className="flex items-center gap-2 px-3 py-3 rounded-hb bg-hb-sage/20 border border-hb-line text-xs text-hb-ink-soft">
                      <AlertCircle className="h-4 w-4 text-hb-rust shrink-0" />
                      <span>
                        Denne virksomhed er <span className="font-medium text-hb-ink">udløbet</span> — beskeder kan ikke sendes. Historik er stadig læsbar.
                      </span>
                    </div>
                  ) : (
                  <>
                  {/* Emnevælgeren — rådgiver-specifik (C5 fjernede den hos medlemmet;
                      hos rådgiveren står den, adfærden er uændret). TOPIC_COLORS er
                      off-token og bruges ikke til farve: aktiv = sage/ink med
                      evergreen-ring, inaktiv = ink-soft — samme sprog som chips'ene. */}
                  {isAdvisor && (
                    <div
                      className={`flex items-center gap-1.5 mb-2 overflow-x-auto ${isMobile ? "-mx-2 px-2" : ""}`}
                      style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
                    >
                      {!isMobile && (
                        <span className="text-[10px] text-hb-ink-soft mr-1 flex-shrink-0">Emne:</span>
                      )}
                      {MESSAGE_TOPICS.map(t => {
                        const isActive = selectedTopic === t.key;
                        return (
                          <button
                            key={t.key ?? "general"}
                            type="button"
                            onClick={() => setSelectedTopic(t.key)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                              isActive
                                ? "bg-hb-sage text-hb-ink ring-1 ring-hb-evergreen/30"
                                : "text-hb-ink-soft hover:text-hb-ink hover:bg-hb-sage/40"
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
                      variant="hb"
                    />
                    {!isMobile && (
                      <HbButton
                        type="button"
                        onClick={() => chatSubmitRef.current()}
                        disabled={sending}
                        className="h-11 w-11 shrink-0 px-0"
                        aria-label="Send besked"
                      >
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </HbButton>
                    )}
                  </div>
                  {!isMobile && <div className="safe-bottom-spacer" />}
                  </>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 flex items-center justify-center text-center">
                  {laast ? (
                    /* Blok 4 uden samtale (tre virksomheder uden medlemmer,
                       målt 4/9): en rolig besked, ikke en fejl og ikke
                       «Vælg en samtale». En samtale opstår først når
                       virksomheden får et medlem; der er ingen at skrive
                       til, og ⋯-menuen (foreslå opgave) renderes ikke uden
                       samtale — så foreslaa-opgaves 404 kan ikke opstå her. */
                    <p className="text-sm text-hb-ink-soft px-8">
                      {samtalerHentet ? "Der er ingen samtale med virksomheden endnu." : "Henter samtalen…"}
                    </p>
                  ) : (
                    <div>
                      <div className="mx-auto w-14 h-14 rounded-full bg-hb-sage/40 flex items-center justify-center mb-3">
                        <MessageCircle className="h-7 w-7 text-hb-evergreen" />
                      </div>
                      <p className="text-sm text-hb-ink-soft">Vælg en samtale for at starte</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Se tal-drawer (mobil-rådgiver) — kerne-tal + KPI-grid (kompakt, ingen
          sparkline). vaul-Draweren består (overlay, swipe, samme mekanik);
          indholdet får theme-hjemmebane som MobileMessageActionDrawer:104,
          og KPI'erne er SkuffeKpiKort (virksomhedssidens form), ikke KPICard. */}
      <Drawer open={showCompanyDrawer} onOpenChange={setShowCompanyDrawer}>
        <DrawerContent className="theme-hjemmebane border-hb-line bg-hb-paper font-body text-hb-ink antialiased">
          <DrawerHeader>
            <DrawerTitle className="font-editorial text-xl font-medium text-hb-ink">{activeConv?.companyName || "Virksomhed"}</DrawerTitle>
            {latestPeriodLabel && (
              <p className="text-xs text-hb-ink-soft">{latestPeriodLabel}</p>
            )}
          </DrawerHeader>

          {/* Scroll-wrapper: drawer-indhold kan være højere end skærm */}
          <div className="overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-h-[70vh]">
            {drawerMetrics.length === 0 ? (
              <div className="py-10 text-center text-sm text-hb-ink-soft">
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
                    return <SkuffeKpiKort key={m.key} metric={m} afviger={!status.hit} />;
                  })}
                </div>

                {/* Adskiller + KPI-grid: alle seks */}
                <div className="border-t border-hb-line pt-4 mb-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft mb-2">Alle KPI'er</p>
                  <div className="grid grid-cols-1 gap-2">
                    {drawerMetrics.map((m) => {
                      const status = getTargetStatus(m);
                      return <SkuffeKpiKort key={m.key} metric={m} afviger={!status.hit} />;
                    })}
                  </div>
                </div>
              </>
            )}

            {/* AI-analyse: kompakt visning (read-only) */}
            <div className="border-t border-hb-line pt-4 mt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">AI-analyse</p>
                {drawerIsStale && (
                  <span className="inline-flex items-center gap-1 text-xs text-hb-ink-soft">
                    <AlertTriangle className="h-3 w-3" />
                    Muligvis forældet
                  </span>
                )}
              </div>

              {!drawerAnalysis ? (
                <div className="py-4 text-sm text-hb-ink-soft">
                  Ingen AI-analyse endnu. Generér den fra Reports-siden på desktop.
                </div>
              ) : (
                <div className="space-y-3">
                  {drawerAnalysis.overview && (
                    <p className={`text-sm leading-relaxed text-hb-ink ${drawerIsStale ? "opacity-60" : ""}`}>
                      {drawerAnalysis.overview}
                    </p>
                  )}

                  {drawerAnalysis.key_findings && drawerAnalysis.key_findings.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                        Nøglefund
                      </p>
                      <div className="space-y-1.5">
                        {drawerAnalysis.key_findings.map((finding, idx) => {
                          // Tonen siger kun om det haster: rust for kritisk,
                          // papir/hairline for advarsel, sage for det gode.
                          const severityColor =
                            finding.severity === "kritisk" ? "bg-hb-rust/5 text-hb-rust border-hb-rust/40" :
                            finding.severity === "advarsel" ? "bg-hb-paper text-hb-ink border-hb-line" :
                            "bg-hb-sage/30 text-hb-ink border-hb-line";
                          return (
                            <div
                              key={idx}
                              className={`text-sm px-3 py-2 rounded-hb border ${severityColor} ${drawerIsStale ? "opacity-60" : ""}`}
                            >
                              {finding.title}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-hb-ink-soft pt-2">
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
        variant="hb"
      />
    </>
  );
};

export default CompanyChatPane;
