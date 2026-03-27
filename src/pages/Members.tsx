import { useState, useEffect, useMemo, useCallback } from "react";
import { Navigate, Link } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { supabase } from "@/integrations/supabase/client";
import CreateGroupWizard from "@/components/CreateGroupWizard";
import AddCompanyToGroupDialog from "@/components/AddCompanyToGroupDialog";
import {
  Building2,
  Search,
  MessageCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Users,
  Globe,
  MapPin,
  User,
  Mail,
  Phone,
  Wallet,
  ExternalLink,
  Hash,
  Trash2,
  UserPlus,
  X,
  Activity,
  Send,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Loader2,
  Layers,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface LoginInfo {
  lastLogin: string | null;
  loginCount: number;
}

interface CompanyMember {
  user_id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
}

interface CircleInfo {
  circle_member_id: number;
  name: string;
  last_seen_at: string | null;
  recent_activity_count: number;
}

interface CompanyData {
  id: string;
  name: string;
  cvr_number: string | null;
  industry: string;
  contact_person: string;
  contact_email: string;
  contact_phone: string;
  website: string;
  address: string;
  postal_code: string;
  city: string;
  annual_revenue: number;
  reported_revenue: number | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  slack_channel: string;
  created_at: string;
  members: CompanyMember[];
  reportCount: number;
  committedCount: number;
  unreadCount: number;
  conversationId: string | null;
  circleInfo: CircleInfo[];
  logo_url: string | null;
  pendingInvitationEmail: string | null;
  invitationStatus: 'pending' | 'accepted' | null;
  invitationAcceptedAt: string | null;
  invitationEmail: string | null;
  loginInfo: Map<string, LoginInfo>;
}

type SortKey = "name" | "industry" | "city" | "annual_revenue" | "reportCount" | "contact_person";
type SortDir = "asc" | "desc";

interface UnassignedUser {
  user_id: string;
  full_name: string;
  company_id: string;
  company_name: string;
}

const Members = () => {
  const { user, isAdvisor: rawAdvisor, isAdmin, loading: authLoading } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filterIndustry, setFilterIndustry] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Merge state
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeTargetCompany, setMergeTargetCompany] = useState<CompanyData | null>(null);
  const [unassignedUsers, setUnassignedUsers] = useState<UnassignedUser[]>([]);
  const [mergeSearch, setMergeSearch] = useState("");
  const [merging, setMerging] = useState(false);

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CompanyData | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [resendingInvitation, setResendingInvitation] = useState<string | null>(null);
  const [removingMember, setRemovingMember] = useState<string | null>(null);
  const [standalonePendingInvitations, setStandalonePendingInvitations] = useState<any[]>([]);

  // Group/Koncern state (admin-only)
  const [groupInfoMap, setGroupInfoMap] = useState<Map<string, { groupName: string; groupId: string; isAnchor: boolean }>>(new Map());
  const [groupedCompanyIds, setGroupedCompanyIds] = useState<Set<string>>(new Set());
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardAnchor, setWizardAnchor] = useState<{ id: string; name: string } | null>(null);

  // Add company to existing group (admin-only)
  const [addToGroupTarget, setAddToGroupTarget] = useState<{ groupId: string; groupName: string } | null>(null);

  // Standalone invite (no company)
  const [standaloneInviteOpen, setStandaloneInviteOpen] = useState(false);
  const [standaloneEmail, setStandaloneEmail] = useState("");
  const [standaloneName, setStandaloneName] = useState("");
  const [standaloneSending, setStandaloneSending] = useState(false);
  const [standaloneCompanyId, setStandaloneCompanyId] = useState<string>("");

  const loadCompanies = useCallback(async () => {
    if (!user || !isAdvisor) return;
    setLoading(true);

    const [companiesRes, membersRes, profilesRes, convsRes, reportsRes, circleMembersRes, circleActivityRes, invitationsRes, loginLogsRes, factsRes] = await Promise.all([
      supabase.from("companies" as any).select("*"),
      supabase.from("company_members" as any).select("company_id, user_id, role"),
      supabase.from("profiles").select("user_id, full_name, avatar_url"),
      supabase.from("conversations").select("id, company_id, last_message_at"),
      (supabase.from("financial_reports").select("company_id, id, extracted_data, report_period") as any).is("deleted_at", null),
      supabase.from("circle_members").select("id, circle_id, email, name, last_seen_at, user_id"),
      supabase.from("circle_activity").select("circle_member_id, activity_type").limit(1000),
      supabase.from("company_invitations").select("id, company_id, email, status, accepted_at, accepted_by, token, created_at"),
      supabase.from("user_login_log" as any).select("user_id, logged_in_at") as any,
      supabase.from("financial_report_facts" as any).select("company_id, period_key"),
    ]);

    const allCompanies = (companiesRes.data || []) as any[];
    const allMembers = (membersRes.data || []) as any[];
    const allProfiles = (profilesRes.data || []) as any[];
    const allConvs = (convsRes.data || []) as any[];
    const allReports = (reportsRes.data || []) as any[];
    const allCircleMembers = (circleMembersRes.data || []) as any[];
    const allCircleActivity = (circleActivityRes.data || []) as any[];
    const allInvitations = (invitationsRes.data || []) as any[];
    const allLoginLogs = (loginLogsRes.data || []) as any[];
    const allFacts = (factsRes.data || []) as any[];

    // Build committedByCompany map
    const committedByCompany = new Map<string, number>();
    for (const fact of allFacts) {
      const id = fact.company_id;
      committedByCompany.set(id, (committedByCompany.get(id) || 0) + 1);
    }

    // Fetch latest sent_at from email_send_log for pending invitation emails
    const pendingEmails = allInvitations
      .filter((inv: any) => inv.status === 'pending')
      .map((inv: any) => inv.email);
    const lastSentMap = new Map<string, string>();
    if (pendingEmails.length > 0) {
      const { data: sendLogs } = await supabase
        .from("email_send_log" as any)
        .select("recipient_email, sent_at")
        .in("recipient_email", pendingEmails)
        .order("sent_at", { ascending: false });
      (sendLogs || []).forEach((log: any) => {
        if (!lastSentMap.has(log.recipient_email)) {
          lastSentMap.set(log.recipient_email, log.sent_at);
        }
      });
    }

    // Build login info map: user_id -> { lastLogin, loginCount }
    const loginInfoMap = new Map<string, LoginInfo>();
    allLoginLogs.forEach((log: any) => {
      const existing = loginInfoMap.get(log.user_id);
      if (!existing) {
        loginInfoMap.set(log.user_id, { lastLogin: log.logged_in_at, loginCount: 1 });
      } else {
        existing.loginCount++;
        if (log.logged_in_at > (existing.lastLogin || "")) {
          existing.lastLogin = log.logged_in_at;
        }
      }
    });

    // Invitation info by company (most recent invitation per company)
    const pendingInvitationByCompany = new Map<string, string>();
    const invitationInfoByCompany = new Map<string, { status: string; email: string; accepted_at: string | null }>();
    const pendingInvsByCompany = new Map<string, any[]>();
    const sortedInvitations = [...allInvitations].sort((a: any, b: any) => 
      new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
    );
    sortedInvitations.forEach((inv: any) => {
      invitationInfoByCompany.set(inv.company_id, { 
        status: inv.status, 
        email: inv.email, 
        accepted_at: inv.accepted_at 
      });
      if (inv.status === 'pending') {
        pendingInvitationByCompany.set(inv.company_id, inv.email);
        const arr = pendingInvsByCompany.get(inv.company_id) || [];
        arr.push({ id: inv.id, email: inv.email, created_at: inv.created_at, token: inv.token, lastSentAt: lastSentMap.get(inv.email) || null });
        pendingInvsByCompany.set(inv.company_id, arr);
      }
    });

    // Build profile map
    const profileMap = new Map(allProfiles.map((p: any) => [p.user_id, p]));

    // Group members by company
    const membersByCompany = new Map<string, CompanyMember[]>();
    allMembers.forEach((cm: any) => {
      const profile = profileMap.get(cm.user_id);
      const arr = membersByCompany.get(cm.company_id) || [];
      arr.push({
        user_id: cm.user_id,
        full_name: profile?.full_name || "Ukendt",
        role: cm.role,
        avatar_url: profile?.avatar_url || null,
      });
      membersByCompany.set(cm.company_id, arr);
    });

    // Reports by company: count unique periods (not individual files)
    const reportsByCompany = new Map<string, number>();
    const reportedRevenueByCompany = new Map<string, number>();
    const periodsByCompany = new Map<string, Set<string>>();
    allReports.forEach((r: any) => {
      if (r.company_id) {
        if (r.report_period) {
          const periods = periodsByCompany.get(r.company_id) || new Set<string>();
          periods.add(r.report_period);
          periodsByCompany.set(r.company_id, periods);
        }
        const data = r.extracted_data as any;
        if (data?.revenue || data?.omsætning || data?.nettoomsætning) {
          const rev = Number(data.revenue || data.omsætning || data.nettoomsætning || 0);
          if (rev > 0) {
            const existing = reportedRevenueByCompany.get(r.company_id) || 0;
            if (rev > existing) reportedRevenueByCompany.set(r.company_id, rev);
          }
        }
      }
    });

    periodsByCompany.forEach((periods, companyId) => {
      reportsByCompany.set(companyId, periods.size);
    });

    // Conversations by company
    const convByCompany = new Map<string, any>();
    allConvs.forEach((c: any) => {
      if (c.company_id) convByCompany.set(c.company_id, c);
    });

    // Batch unread messages
    const convIds = allConvs.map((c: any) => c.id);
    const { data: unreadMessages } = convIds.length > 0
      ? await supabase
          .from("messages")
          .select("conversation_id")
          .in("conversation_id", convIds)
          .neq("sender_id", user.id)
          .is("read_at", null)
      : { data: [] };

    const unreadByConv = new Map<string, number>();
    (unreadMessages || []).forEach((m) => {
      unreadByConv.set(m.conversation_id, (unreadByConv.get(m.conversation_id) || 0) + 1);
    });

    // Circle.so matching
    const circleByUserId = new Map<string, any>();
    allCircleMembers.forEach((cm: any) => {
      if (cm.user_id) circleByUserId.set(cm.user_id, cm);
    });

    const activityByCircleMember = new Map<number, number>();
    allCircleActivity.forEach((a: any) => {
      activityByCircleMember.set(a.circle_member_id, (activityByCircleMember.get(a.circle_member_id) || 0) + 1);
    });

    const circleInfoByCompany = new Map<string, CircleInfo[]>();
    allMembers.forEach((cm: any) => {
      const circleMember = circleByUserId.get(cm.user_id);
      if (circleMember) {
        const activityCount = activityByCircleMember.get(circleMember.circle_id) || 0;
        const arr = circleInfoByCompany.get(cm.company_id) || [];
        arr.push({
          circle_member_id: circleMember.circle_id,
          name: circleMember.name,
          last_seen_at: circleMember.last_seen_at,
          recent_activity_count: activityCount,
        });
        circleInfoByCompany.set(cm.company_id, arr);
      }
    });

    const enriched: CompanyData[] = allCompanies
      .filter((c: any) => c.status === "active" || !c.status)
      .map((c: any) => {
        const conv = convByCompany.get(c.id);
        const reportedRev = reportedRevenueByCompany.get(c.id) || null;
        return {
          id: c.id,
          name: c.name || "",
          cvr_number: c.cvr_number,
          industry: c.industry || "",
          contact_person: c.contact_person || "",
          contact_email: c.contact_email || "",
          contact_phone: c.contact_phone || "",
          website: c.website || "",
          address: c.address || "",
          postal_code: c.postal_code || "",
          city: c.city || "",
          annual_revenue: Number(c.annual_revenue) || 0,
          reported_revenue: reportedRev,
          start_date: c.start_date,
          end_date: c.end_date,
          status: c.status || "active",
          slack_channel: c.slack_channel || "",
          created_at: c.created_at,
          members: membersByCompany.get(c.id) || [],
          reportCount: reportsByCompany.get(c.id) || 0,
          committedCount: committedByCompany.get(c.id) || 0,
          unreadCount: conv ? (unreadByConv.get(conv.id) || 0) : 0,
          conversationId: conv?.id || null,
          circleInfo: circleInfoByCompany.get(c.id) || [],
          logo_url: c.logo_url || null,
          pendingInvitationEmail: pendingInvitationByCompany.get(c.id) || null,
          invitationStatus: (() => {
            const companyMembers = membersByCompany.get(c.id) || [];
            const hasActiveMembers = companyMembers.length > 0;
            const invInfo = invitationInfoByCompany.get(c.id);
            if (!invInfo) return null;
            if (hasActiveMembers) return 'accepted' as const;
            return invInfo.status as 'pending' | 'accepted';
          })(),
          invitationAcceptedAt: invitationInfoByCompany.get(c.id)?.accepted_at || null,
          invitationEmail: invitationInfoByCompany.get(c.id)?.email || null,
          loginInfo: (() => {
            const companyLoginInfo = new Map<string, LoginInfo>();
            const companyMembers = membersByCompany.get(c.id) || [];
            companyMembers.forEach((m) => {
              const info = loginInfoMap.get(m.user_id);
              if (info) companyLoginInfo.set(m.user_id, info);
            });
            return companyLoginInfo;
          })(),
          __pendingInvitations: pendingInvsByCompany.get(c.id) || [],
        } as any;
      });

    // Collect standalone pending invitations (no company_id)
    const standalonePending = allInvitations
      .filter((inv: any) => inv.company_id === null && inv.status === 'pending')
      .map((inv: any) => ({ id: inv.id, email: inv.email, created_at: inv.created_at, token: inv.token, lastSentAt: lastSentMap.get(inv.email) || null }));
    setStandalonePendingInvitations(standalonePending);

    // Fetch group data (admin-only)
    if (isAdmin) {
      const { data: gcData } = await supabase
        .from("group_companies" as any)
        .select("company_id, group_id, groups:group_id(id, name, anchor_company_id)" as any);
      const gMap = new Map<string, { groupName: string; groupId: string; isAnchor: boolean }>();
      const gSet = new Set<string>();
      (gcData || []).forEach((gc: any) => {
        gSet.add(gc.company_id);
        gMap.set(gc.company_id, {
          groupName: gc.groups?.name || "Koncern",
          groupId: gc.group_id,
          isAnchor: gc.groups?.anchor_company_id === gc.company_id,
        });
      });
      setGroupInfoMap(gMap);
      setGroupedCompanyIds(gSet);
    }

    setCompanies(enriched);
    setLoading(false);
  }, [user, isAdvisor, isAdmin]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies, reloadTrigger]);

  const handleRemoveMember = async (company: CompanyData, member: CompanyMember) => {
    if (member.role === 'owner') return;
    setRemovingMember(member.user_id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('manage-advisor', {
        body: { action: 'remove-member', target_user_id: member.user_id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`${member.full_name} fjernet fra ${company.name}`);
      setReloadTrigger((t) => t + 1);
    } catch (err: any) {
      console.error("Remove member error:", err);
      toast.error("Kunne ikke fjerne medlem: " + (err.message || "Ukendt fejl"));
    } finally {
      setRemovingMember(null);
    }
  };

  const handleResendInvitation = async (company: CompanyData) => {
    if (!company.invitationEmail) return;
    setResendingInvitation(company.id);
    try {
      if (company.invitationStatus === 'accepted') {
        const { error: updateErr } = await supabase
          .from("company_invitations")
          .update({ status: 'pending', accepted_at: null, accepted_by: null })
          .eq("company_id", company.id)
          .eq("email", company.invitationEmail)
          .eq("status", "accepted");
        if (updateErr) throw updateErr;
      }

      const { data: invData } = await supabase
        .from("company_invitations")
        .select("token")
        .eq("company_id", company.id)
        .eq("email", company.invitationEmail)
        .in("status", ["pending"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const tokenParam = invData?.token ? `&invite=${invData.token}` : "";
      const { error } = await supabase.functions.invoke("send-invitation-email", {
        body: {
          email: company.invitationEmail,
          company_name: company.name,
          signup_url: `https://topix.lovable.app/auth?mode=signup${tokenParam}`,
        },
      });
      if (error) throw error;
      toast.success(`Invitation ${company.invitationStatus === 'accepted' ? 'nulstillet og ' : ''}gensendt til ${company.invitationEmail}`);
      setReloadTrigger((t) => t + 1);
    } catch (err: any) {
      console.error("Resend invitation error:", err);
      toast.error("Kunne ikke gensende invitation: " + (err.message || "Ukendt fejl"));
    } finally {
      setResendingInvitation(null);
    }
  };

  const handleResendStandaloneInvitation = async (inv: { id: string; email: string; token: string }) => {
    setResendingInvitation(inv.id);
    try {
      const { error } = await supabase.functions.invoke("send-invitation-email", {
        body: {
          email: inv.email,
          company_name: "The Boardroom",
          signup_url: `https://topix.lovable.app/auth?mode=signup&invite=${inv.token}`,
        },
      });
      if (error) throw error;
      toast.success(`Invitation gensendt til ${inv.email}`);
      setReloadTrigger((t) => t + 1);
    } catch (err: any) {
      console.error("Resend standalone invitation error:", err);
      toast.error("Kunne ikke gensende invitation: " + (err.message || "Ukendt fejl"));
    } finally {
      setResendingInvitation(null);
    }
  };

  const openMergeDialog = async (company: CompanyData) => {
    setMergeTargetCompany(company);
    setMergeSearch("");
    setMergeDialogOpen(true);

    const { data: allMemberships } = await supabase
      .from("company_members" as any)
      .select("user_id, company_id") as any;
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("user_id, full_name");
    const { data: allCompanies } = await supabase
      .from("companies" as any)
      .select("id, name") as any;

    const companyNameMap = new Map((allCompanies || []).map((c: any) => [c.id, c.name]));
    const profileMap = new Map((allProfiles || []).map((p: any) => [p.user_id, p.full_name]));

    const users: UnassignedUser[] = (allMemberships || [])
      .filter((m: any) => m.company_id !== company.id)
      .map((m: any) => ({
        user_id: m.user_id,
        full_name: profileMap.get(m.user_id) || "Ukendt",
        company_id: m.company_id,
        company_name: companyNameMap.get(m.company_id) || "Ukendt",
      }));

    setUnassignedUsers(users);
  };

  const handleMergeUser = async (targetUser: UnassignedUser) => {
    if (!mergeTargetCompany || !user) return;
    setMerging(true);

    try {
      const { error: updateErr } = await supabase
        .from("company_members" as any)
        .update({ company_id: mergeTargetCompany.id } as any)
        .eq("user_id", targetUser.user_id)
        .eq("company_id", targetUser.company_id) as any;

      if (updateErr) throw updateErr;

      await supabase
        .from("conversations")
        .update({ company_id: mergeTargetCompany.id })
        .eq("member_id", targetUser.user_id)
        .eq("company_id", targetUser.company_id);

      await Promise.all([
        supabase.from("financial_reports").update({ company_id: mergeTargetCompany.id } as any).eq("company_id", targetUser.company_id).eq("user_id", targetUser.user_id),
        supabase.from("handouts").update({ company_id: mergeTargetCompany.id } as any).eq("company_id", targetUser.company_id).eq("user_id", targetUser.user_id),
        supabase.from("milestones").update({ company_id: mergeTargetCompany.id } as any).eq("company_id", targetUser.company_id).eq("user_id", targetUser.user_id),
        supabase.from("budget_targets").update({ company_id: mergeTargetCompany.id } as any).eq("company_id", targetUser.company_id).eq("user_id", targetUser.user_id),
        supabase.from("kpi_targets").update({ company_id: mergeTargetCompany.id } as any).eq("company_id", targetUser.company_id).eq("user_id", targetUser.user_id),
        supabase.from("kpi_benchmarks").update({ company_id: mergeTargetCompany.id } as any).eq("company_id", targetUser.company_id).eq("user_id", targetUser.user_id),
      ]);

      const { data: remaining } = await supabase
        .from("company_members" as any)
        .select("id")
        .eq("company_id", targetUser.company_id) as any;

      if (!remaining || remaining.length === 0) {
        await supabase.from("conversations").delete().eq("company_id", targetUser.company_id);
        await supabase.from("companies" as any).delete().eq("id", targetUser.company_id) as any;
      }

      toast.success(`${targetUser.full_name} tilknyttet ${mergeTargetCompany.name}`);
      setMergeDialogOpen(false);
      setReloadTrigger((t) => t + 1);
    } catch (err: any) {
      console.error("Merge error:", err);
      toast.error("Kunne ikke flytte brugeren: " + (err.message || "Ukendt fejl"));
    } finally {
      setMerging(false);
    }
  };

  const handleDeleteCompany = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await Promise.all([
        supabase.from("financial_reports").update({ deleted_at: new Date().toISOString() }).eq("company_id", deleteTarget.id),
        supabase.from("handouts").delete().eq("company_id", deleteTarget.id),
        supabase.from("milestones").delete().eq("company_id", deleteTarget.id),
        supabase.from("budget_targets").delete().eq("company_id", deleteTarget.id),
        supabase.from("kpi_targets").delete().eq("company_id", deleteTarget.id),
        supabase.from("kpi_benchmarks").delete().eq("company_id", deleteTarget.id),
        supabase.from("company_invitations").delete().eq("company_id", deleteTarget.id),
      ]);

      const { data: convs } = await supabase
        .from("conversations")
        .select("id")
        .eq("company_id", deleteTarget.id);
      if (convs && convs.length > 0) {
        const convIds = convs.map((c) => c.id);
        await supabase.from("messages").delete().in("conversation_id", convIds);
      }
      await supabase.from("conversations").delete().eq("company_id", deleteTarget.id);
      await (supabase.from("company_members" as any).delete().eq("company_id", deleteTarget.id) as any);

      const { error } = await supabase.from("companies" as any).delete().eq("id", deleteTarget.id) as any;
      if (error) throw error;

      toast.success(`${deleteTarget.name} slettet`);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      setReloadTrigger((t) => t + 1);
    } catch (err: any) {
      console.error("Delete error:", err);
      toast.error("Kunne ikke slette: " + (err.message || "Ukendt fejl"));
    } finally {
      setDeleting(false);
    }
  };

  const industries = useMemo(() => {
    const set = new Set(companies.map((c) => c.industry).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "da"));
  }, [companies]);

  const handleStandaloneInvite = async () => {
    if (!standaloneEmail.trim() || !user) return;
    setStandaloneSending(true);
    try {
      const selectedCompany = standaloneCompanyId
        ? companies.find((c) => c.id === standaloneCompanyId)
        : null;

      let tokenParam = "";
      let wasResent = false;

      if (selectedCompany) {
        const trimmedEmail = standaloneEmail.trim().toLowerCase();
        const { data: existing } = await supabase
          .from("company_invitations")
          .select("id, token, status")
          .eq("company_id", selectedCompany.id)
          .eq("email", trimmedEmail)
          .maybeSingle();

        let invToken: string | null = null;

        if (existing) {
          if (existing.status === "accepted") {
            const { error: upErr } = await supabase
              .from("company_invitations")
              .update({ status: "pending", accepted_at: null, accepted_by: null })
              .eq("id", existing.id);
            if (upErr) throw upErr;
          }
          invToken = existing.token;
          wasResent = true;
        } else {
          const { data: newInv, error: invErr } = await supabase
            .from("company_invitations")
            .insert({
              company_id: selectedCompany.id,
              email: trimmedEmail,
              invited_by: user.id,
            })
            .select("token")
            .single();
          if (invErr) {
            if (invErr.code === "23505") {
              const { data: raceInv } = await supabase
                .from("company_invitations")
                .select("token")
                .eq("company_id", selectedCompany.id)
                .eq("email", trimmedEmail)
                .maybeSingle();
              invToken = raceInv?.token || null;
              wasResent = true;
            } else {
              throw invErr;
            }
          } else {
            invToken = newInv?.token || null;
          }
        }

        if (invToken) tokenParam = `&invite=${invToken}`;
      } else {
        const trimmedEmail = standaloneEmail.trim().toLowerCase();
        const { data: existing } = await supabase
          .from("company_invitations")
          .select("id, token, status")
          .is("company_id", null)
          .eq("email", trimmedEmail)
          .maybeSingle();

        let invToken: string | null = null;

        if (existing) {
          if (existing.status === "accepted") {
            await supabase
              .from("company_invitations")
              .update({ status: "pending", accepted_at: null, accepted_by: null })
              .eq("id", existing.id);
          }
          invToken = existing.token;
          wasResent = true;
        } else {
          const { data: newInv, error: invErr } = await supabase
            .from("company_invitations")
            .insert({
              email: trimmedEmail,
              invited_by: user.id,
            })
            .select("token")
            .single();
          if (invErr) {
            if (invErr.code === "23505") {
              const { data: raceInv } = await supabase
                .from("company_invitations")
                .select("token")
                .is("company_id", null)
                .eq("email", trimmedEmail)
                .maybeSingle();
              invToken = raceInv?.token || null;
              wasResent = true;
            } else {
              throw invErr;
            }
          } else {
            invToken = newInv?.token || null;
          }
        }

        if (invToken) tokenParam = `&invite=${invToken}`;
      }

      const { error } = await supabase.functions.invoke("send-invitation-email", {
        body: {
          email: standaloneEmail.trim().toLowerCase(),
          company_name: standaloneCompanyId ? companies.find(c => c.id === standaloneCompanyId)?.name || "The Boardroom" : "The Boardroom",
          signup_url: `https://topix.lovable.app/auth?mode=signup${tokenParam}`,
        },
      });
      if (error) throw error;
      const selectedCompanyForToast = standaloneCompanyId ? companies.find(c => c.id === standaloneCompanyId) : null;
      toast.success(wasResent
        ? `Invitation gensendt til ${standaloneEmail}${selectedCompanyForToast ? ` (${selectedCompanyForToast.name})` : ""}`
        : `Invitation sendt til ${standaloneEmail}${selectedCompanyForToast ? ` (${selectedCompanyForToast.name})` : ""}`
      );
      setStandaloneInviteOpen(false);
      setStandaloneEmail("");
      setStandaloneName("");
      setStandaloneCompanyId("");
      setReloadTrigger((t) => t + 1);
    } catch (err: any) {
      console.error("Standalone invite error:", err);
      toast.error("Kunne ikke sende invitation: " + (err.message || "Ukendt fejl"));
    } finally {
      setStandaloneSending(false);
    }
  };

  const filtered = useMemo(() => {
    let result = companies;

    if (filterIndustry !== "all") {
      result = result.filter((c) => c.industry === filterIndustry);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.industry.toLowerCase().includes(q) ||
          c.contact_person.toLowerCase().includes(q) ||
          c.city.toLowerCase().includes(q) ||
          c.slack_channel.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name" || sortKey === "industry" || sortKey === "city" || sortKey === "contact_person") {
        cmp = (a[sortKey] || "").localeCompare(b[sortKey] || "", "da");
      } else if (sortKey === "annual_revenue" || sortKey === "reportCount") {
        cmp = a[sortKey] - b[sortKey];
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [companies, search, sortKey, sortDir, filterIndustry]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const formatDKK = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(".", ",") + " mio";
    if (n >= 1000) return Math.round(n / 1000) + "k";
    return n.toLocaleString("da-DK");
  };

  const getDisplayRevenue = (c: CompanyData) => {
    if (c.reported_revenue && c.reported_revenue > 0) return { value: c.reported_revenue, source: "rapport" };
    if (c.annual_revenue > 0) return { value: c.annual_revenue, source: "ansøgning" };
    return null;
  };

  const totalCompanies = companies.length;
  const totalMembers = companies.reduce((sum, c) => sum + c.members.length, 0);
  const totalUnread = companies.reduce((sum, c) => sum + c.unreadCount, 0);
  const companiesWithReports = companies.filter((c) => c.reportCount > 0).length;
  const acceptedCount = companies.filter((c) => c.invitationStatus === 'accepted').length;
  const pendingCount = companies.filter((c) => c.invitationStatus === 'pending').length;
  const notInvitedCount = companies.filter((c) => c.invitationStatus === null).length;

  const loginStats = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    let active = 0;
    let inactive = 0;
    let never = 0;
    companies.forEach((c) => {
      const members = c.members || [];
      members.forEach((m) => {
        const info = c.loginInfo.get(m.user_id);
        if (!info || !info.lastLogin) {
          never++;
        } else if (new Date(info.lastLogin) >= sevenDaysAgo) {
          active++;
        } else {
          inactive++;
        }
      });
    });
    return { active, inactive, never };
  }, [companies]);

  const filteredMergeUsers = unassignedUsers.filter((u) => {
    if (!mergeSearch.trim()) return true;
    const q = mergeSearch.toLowerCase();
    return u.full_name.toLowerCase().includes(q) || u.company_name.toLowerCase().includes(q);
  });

  if (authLoading) return null;
  if (!isAdvisor) return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Virksomheder
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Oversigt over alle virksomheder i forløbet
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setStandaloneInviteOpen(true)}
            className="gap-2"
            size="sm"
          >
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Inviter ny bruger</span>
            <span className="sm:hidden">Inviter</span>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-display font-bold text-foreground">{totalCompanies}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Virksomheder</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-display font-bold text-foreground">{totalMembers}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Teammedlemmer</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className={`text-2xl font-display font-bold ${totalUnread > 0 ? "text-chart-warning" : "text-foreground"}`}>{totalUnread}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Ubesvarede</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-display font-bold text-foreground">{companiesWithReports}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Har rapporteret</p>
        </div>
      </div>

      {/* Login activity stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="glass-card rounded-xl p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-green-500/15 flex items-center justify-center">
            <Activity className="h-4 w-4 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-lg font-display font-bold text-foreground">{loginStats.active}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Aktive (7d)</p>
          </div>
        </div>
        <div className="glass-card rounded-xl p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-chart-warning/15 flex items-center justify-center">
            <Activity className="h-4 w-4 text-chart-warning" />
          </div>
          <div>
            <p className="text-lg font-display font-bold text-foreground">{loginStats.inactive}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Inaktive</p>
          </div>
        </div>
        <div className="glass-card rounded-xl p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-lg font-display font-bold text-foreground">{loginStats.never}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Aldrig logget ind</p>
          </div>
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="glass-card rounded-xl p-4 mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Søg på virksomhed, branche, kontaktperson, by eller Slack..."
            className="w-full pl-10 pr-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterIndustry("all")}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              filterIndustry === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            Alle
          </button>
          {industries.slice(0, 5).map((ind) => (
            <button
              key={ind}
              onClick={() => setFilterIndustry(ind)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                filterIndustry === ind
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {ind}
            </button>
          ))}
          {industries.length > 5 && (
            <select
              value={filterIndustry}
              onChange={(e) => setFilterIndustry(e.target.value)}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-secondary text-muted-foreground border-none focus:outline-none"
            >
              <option value="all">Flere brancher...</option>
              {industries.map((ind) => (
                <option key={ind} value={ind}>{ind}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Members table */}
      <div className="glass-card rounded-xl overflow-hidden mb-6">
        {/* Table header */}
        <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_0.7fr_0.7fr_0.5fr] gap-3 px-5 py-2 bg-secondary/50 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
          <button onClick={() => toggleSort("name")} className="flex items-center gap-1 text-left hover:text-foreground transition-colors">
            Virksomhed <ArrowUpDown className="h-3 w-3" />
          </button>
          <button onClick={() => toggleSort("industry")} className="flex items-center gap-1 text-left hover:text-foreground transition-colors">
            Branche <ArrowUpDown className="h-3 w-3" />
          </button>
          <button onClick={() => toggleSort("contact_person")} className="flex items-center gap-1 text-left hover:text-foreground transition-colors">
            Kontakt <ArrowUpDown className="h-3 w-3" />
          </button>
          <button onClick={() => toggleSort("city")} className="flex items-center gap-1 text-left hover:text-foreground transition-colors">
            By <ArrowUpDown className="h-3 w-3" />
          </button>
          <button onClick={() => toggleSort("annual_revenue")} className="flex items-center gap-1 text-left hover:text-foreground transition-colors">
            Omsætning <ArrowUpDown className="h-3 w-3" />
          </button>
          <button onClick={() => toggleSort("reportCount")} className="flex items-center gap-1 text-left hover:text-foreground transition-colors">
            Rapporter <ArrowUpDown className="h-3 w-3" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Building2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {search ? "Ingen virksomheder matcher søgningen" : "Ingen virksomheder endnu"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {filtered.map((c) => {
              const isExpanded = expandedId === c.id;
              const rev = getDisplayRevenue(c);
              return (
                <div key={c.id}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : c.id)}
                    className="w-full text-left hover:bg-secondary/30 transition-colors focus:outline-none"
                  >
                    {/* Desktop row */}
                    <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_0.7fr_0.7fr_0.5fr] gap-3 px-5 py-3 items-center">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {c.logo_url ? (
                            <img src={c.logo_url} alt={c.name} className="h-full w-full object-contain" />
                          ) : (
                            <span className="text-xs font-semibold text-primary">{getInitials(c.name)}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground truncate">{c.name}</span>
                            {c.invitationStatus === 'pending' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-chart-warning/15 text-chart-warning text-[10px] font-semibold whitespace-nowrap">
                                <Send className="h-2.5 w-2.5" /> Afventer
                              </span>
                            )}
                            {isAdmin && groupInfoMap.has(c.id) && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold whitespace-nowrap">
                                <Layers className="h-2.5 w-2.5" /> {groupInfoMap.get(c.id)!.groupName}
                                {groupInfoMap.get(c.id)!.isAnchor && <span className="text-[8px] opacity-70">(Anchor)</span>}
                              </span>
                            )}
                            {isAdmin && groupInfoMap.get(c.id)?.isAnchor && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const info = groupInfoMap.get(c.id)!;
                                  setAddToGroupTarget({ groupId: info.groupId, groupName: info.groupName });
                                }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/5 text-primary text-[10px] font-medium hover:bg-primary/15 transition-colors border border-primary/20 whitespace-nowrap"
                              >
                                + Tilføj virksomhed
                              </button>
                            )}
                            {c.unreadCount > 0 && (
                              <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-chart-warning text-white text-[10px] font-bold flex items-center justify-center">
                                {c.unreadCount}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {c.members.length} {c.members.length === 1 ? "bruger" : "brugere"}
                            {c.slack_channel && (
                              <span className="ml-2 text-primary"><Hash className="h-2.5 w-2.5 inline" />{c.slack_channel}</span>
                            )}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground truncate">{c.industry || "–"}</span>
                      <span className="text-xs text-muted-foreground truncate">{c.contact_person || "–"}</span>
                      <span className="text-xs text-muted-foreground truncate">{c.city || "–"}</span>
                      <span className="text-xs text-muted-foreground">
                        {rev ? formatDKK(rev.value) : "–"}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">{c.reportCount}</span>
                          {c.committedCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              {c.committedCount}
                            </span>
                          )}
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>

                    {/* Mobile row */}
                    <div className="sm:hidden flex items-center gap-3 px-5 py-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {c.logo_url ? (
                          <img src={c.logo_url} alt={c.name} className="h-full w-full object-contain" />
                        ) : (
                          <span className="text-xs font-semibold text-primary">{getInitials(c.name)}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                          {c.invitationStatus === 'pending' && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-chart-warning/15 text-chart-warning text-[10px] font-semibold whitespace-nowrap">
                              <Send className="h-2.5 w-2.5" /> Afventer
                            </span>
                          )}
                          {c.unreadCount > 0 && (
                            <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-chart-warning text-white text-[10px] font-bold flex items-center justify-center">
                              {c.unreadCount}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <p className="text-xs text-muted-foreground truncate">{c.industry || "–"}</p>
                          <span className="text-[10px] text-muted-foreground">{c.city}</span>
                          {c.slack_channel && (
                            <span className="text-[10px] text-primary flex items-center gap-0.5">
                              <Hash className="h-2.5 w-2.5" />{c.slack_channel}
                            </span>
                          )}
                        </div>
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-5 pb-4 pt-1 bg-secondary/20 border-t border-border/30 animate-fade-in">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                        {/* Contact info */}
                        <div className="rounded-lg bg-background/50 border border-border/50 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <User className="h-4 w-4 text-primary" />
                            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Kontakt</span>
                          </div>
                          <p className="text-sm font-medium text-foreground">{c.contact_person || "–"}</p>
                          {c.contact_email && (
                            <a href={`mailto:${c.contact_email}`} className="text-xs text-primary hover:underline flex items-center gap-1 mt-1">
                              <Mail className="h-3 w-3" /> {c.contact_email}
                            </a>
                          )}
                          {c.contact_phone && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <Phone className="h-3 w-3" /> {c.contact_phone}
                            </p>
                          )}
                          {c.website && (
                            <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 mt-1">
                              <Globe className="h-3 w-3" /> Hjemmeside
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                          {c.slack_channel && (
                            <p className="text-xs text-primary flex items-center gap-1 mt-2 font-medium">
                              <Hash className="h-3 w-3" /> {c.slack_channel}
                            </p>
                          )}
                          {/* Invitation status — admin only */}
                          {isAdmin && c.invitationStatus && (
                            <div className="mt-3 pt-2 border-t border-border/30">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                                <Send className="h-3 w-3" /> Invitation
                              </p>
                              {c.invitationStatus === 'pending' ? (
                                <>
                                  <p className="text-xs text-muted-foreground">
                                    {c.invitationEmail}
                                  </p>
                                  <p className="text-xs text-chart-warning mt-0.5">
                                    Afventer svar
                                  </p>
                                </>
                              ) : c.invitationStatus === 'accepted' ? (
                                <>
                                  {c.members.length > 0 ? (
                                    <p className="text-xs text-muted-foreground">
                                      Accepteret af {c.members[0].full_name}
                                    </p>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">Accepteret</p>
                                  )}
                                  {c.invitationAcceptedAt && (
                                    <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                                      {format(new Date(c.invitationAcceptedAt), "d. MMM yyyy", { locale: da })}
                                    </p>
                                  )}
                                </>
                              ) : null}
                            </div>
                          )}
                        </div>

                        {/* Team members */}
                        <div className="rounded-lg bg-background/50 border border-border/50 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-primary" />
                              <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                                Team ({c.members.length})
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); setStandaloneCompanyId(c.id); setStandaloneEmail(c.contact_email || ""); setStandaloneName(""); setStandaloneInviteOpen(true); }}
                                className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
                                title="Inviter ny bruger"
                              >
                                <Send className="h-3 w-3" /> Inviter
                              </button>
                              {isAdmin && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); openMergeDialog(c); }}
                                  className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
                                  title="Tilknyt eksisterende bruger"
                                >
                                  <UserPlus className="h-3 w-3" /> Tilknyt
                                </button>
                              )}
                            </div>
                          </div>
                          {c.members.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Ingen tilknyttede brugere</p>
                          ) : (
                            <div className="space-y-1.5">
                              {c.members.map((m) => (
                                <div key={m.user_id} className="flex items-center gap-2 group">
                                  <Link
                                    to={`/members/${m.user_id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-2 hover:bg-secondary/50 rounded-md p-1 -ml-1 transition-colors flex-1 min-w-0"
                                  >
                                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                      <span className="text-[8px] font-semibold text-primary">{getInitials(m.full_name)}</span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <span className="text-xs text-foreground truncate block">{m.full_name}</span>
                                      {(() => {
                                        const login = c.loginInfo.get(m.user_id);
                                        if (!login) return (
                                          <span className="text-[10px] text-muted-foreground">Aldrig logget ind</span>
                                        );
                                        return (
                                          <span className="text-[10px] text-muted-foreground">
                                            Sidst aktiv {format(new Date(login.lastLogin!), "d. MMM", { locale: da })} · {login.loginCount} logins
                                          </span>
                                        );
                                      })()}
                                    </div>
                                    <span className="text-[10px] text-muted-foreground">{m.role}</span>
                                  </Link>
                                  {isAdmin && m.role !== 'owner' && (
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <button
                                          onClick={(e) => e.stopPropagation()}
                                          disabled={removingMember === m.user_id}
                                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all disabled:opacity-50"
                                          title={`Fjern ${m.full_name}`}
                                        >
                                          {removingMember === m.user_id ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                          ) : (
                                            <X className="h-3 w-3" />
                                          )}
                                        </button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Fjern teammedlem?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Er du sikker på, at du vil fjerne <strong>{m.full_name}</strong> fra {c.name}? Denne handling kan ikke fortrydes.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Annuller</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() => handleRemoveMember(c, m)}
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                          >
                                            Fjern
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Info + Circle activity */}
                        <div className="rounded-lg bg-background/50 border border-border/50 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Building2 className="h-4 w-4 text-primary" />
                            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Detaljer</span>
                          </div>
                          {c.cvr_number && (
                            <p className="text-xs text-muted-foreground">CVR: {c.cvr_number}</p>
                          )}
                          {c.address && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <MapPin className="h-3 w-3" /> {c.address}, {c.postal_code} {c.city}
                            </p>
                          )}
                          {(() => {
                            const rev = getDisplayRevenue(c);
                            if (!rev) return null;
                            return (
                              <p className="text-xs text-foreground font-medium flex items-center gap-1 mt-1">
                                <Wallet className="h-3 w-3 text-primary" /> {rev.value.toLocaleString("da-DK")} DKK
                                <span className="text-[9px] text-muted-foreground font-normal">({rev.source})</span>
                              </p>
                            );
                          })()}
                          {c.start_date && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Forløb: {format(new Date(c.start_date), "d. MMM yyyy", { locale: da })}
                              {c.end_date && ` – ${format(new Date(c.end_date), "d. MMM yyyy", { locale: da })}`}
                            </p>
                          )}

                          {/* Circle.so activity */}
                          {c.circleInfo.length > 0 && (
                            <div className="mt-3 pt-2 border-t border-border/30">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                                <Activity className="h-3 w-3" /> Community
                              </p>
                              {c.circleInfo.map((ci) => (
                                <div key={ci.circle_member_id} className="text-xs text-muted-foreground mt-1.5 space-y-0.5">
                                  {ci.last_seen_at && (
                                    <p className="text-[10px]">
                                      Sidst aktiv: {format(new Date(ci.last_seen_at), "d. MMM yyyy", { locale: da })}
                                    </p>
                                  )}
                                  {ci.recent_activity_count > 0 && (
                                    <p>{ci.recent_activity_count} community-indlæg</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="rounded-lg bg-background/50 border border-border/50 p-3 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <FileText className="h-4 w-4 text-primary" />
                              <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Rapporter & Chat</span>
                            </div>
                            <p className="text-sm font-medium text-foreground">{c.reportCount} {c.reportCount === 1 ? "periode" : "perioder"} leveret</p>
                            {c.unreadCount > 0 && (
                              <p className="text-xs text-chart-warning font-semibold mt-1">{c.unreadCount} ubesvarede beskeder</p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 mt-3">
                            {c.members.length > 0 && (
                              <Link
                                to={`/members/${c.members[0].user_id}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <FileText className="h-3 w-3" /> Se data
                              </Link>
                            )}
                            {c.conversationId && (
                              <Link
                                to="/chat"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-medium hover:bg-secondary/80 transition-colors border border-border"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MessageCircle className="h-3 w-3" /> Åbn chat
                              </Link>
                            )}
                            {isAdmin && c.invitationEmail && c.invitationStatus === 'pending' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleResendInvitation(c); }}
                                disabled={resendingInvitation === c.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-medium hover:bg-secondary/80 transition-colors border border-border disabled:opacity-50"
                              >
                                {resendingInvitation === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Gensend invitation
                              </button>
                            )}
                            {isAdmin && c.invitationEmail && c.invitationStatus === 'accepted' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleResendInvitation(c); }}
                                disabled={resendingInvitation === c.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-chart-warning/10 text-chart-warning text-xs font-medium hover:bg-chart-warning/20 transition-colors border border-chart-warning/30 disabled:opacity-50"
                              >
                                {resendingInvitation === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Nulstil & gensend
                              </button>
                            )}
                            {isAdmin && !groupedCompanyIds.has(c.id) && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setWizardAnchor({ id: c.id, name: c.name }); setWizardOpen(true); }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors border border-primary/30"
                              >
                                <Layers className="h-3 w-3" /> Gør til koncern
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); setDeleteDialogOpen(true); }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors"
                              >
                                <Trash2 className="h-3 w-3" /> Slet
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 bg-secondary/30 border-t border-border text-xs text-muted-foreground">
          Viser {filtered.length} af {companies.length} virksomheder
        </div>
      </div>

      {/* Admin-only sections */}
      {isAdmin && (
        <>
          {/* Invitation stats */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="glass-card rounded-xl p-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-green-500/15 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-lg font-display font-bold text-foreground">{acceptedCount}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Accepteret</p>
              </div>
            </div>
            <div className="glass-card rounded-xl p-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-chart-warning/15 flex items-center justify-center">
                <Send className="h-4 w-4 text-chart-warning" />
              </div>
              <div>
                <p className="text-lg font-display font-bold text-foreground">{pendingCount}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Afventer svar</p>
              </div>
            </div>
            <div className="glass-card rounded-xl p-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-lg font-display font-bold text-foreground">{notInvitedCount}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ikke inviteret</p>
              </div>
            </div>
          </div>

          {/* Pending invitations overview */}
          {(() => {
            const companyPendingInvitations = companies
              .flatMap(c => {
                const companyInvs = (c as any).__pendingInvitations || [];
                return companyInvs.map((inv: any) => ({ ...inv, companyName: c.name, companyId: c.id }));
              });
            const standaloneInvs = standalonePendingInvitations.map((inv: any) => ({
              ...inv,
              companyName: "Ingen virksomhed",
              companyId: null,
            }));
            const pendingInvitations = [...companyPendingInvitations, ...standaloneInvs];
            return (
              <div className="mb-6 glass-card rounded-xl overflow-hidden">
                <div className="px-4 py-3 flex items-center gap-2 border-b border-border">
                  <Send className="h-4 w-4 text-chart-warning" />
                  <span className="text-sm font-semibold text-foreground">Afventende invitationer</span>
                  <span className="ml-1 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-chart-warning/15 text-chart-warning text-xs font-bold">
                    {pendingInvitations.length}
                  </span>
                </div>
                {pendingInvitations.length > 0 ? (
                  <div className="divide-y divide-border">
                    {pendingInvitations.map((inv: any) => (
                      <div key={inv.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{inv.email}</p>
                            <p className="text-xs text-muted-foreground">{inv.companyName} · Sendt {format(new Date(inv.lastSentAt || inv.created_at), "d. MMM yyyy", { locale: da })}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => {
                              if (inv.companyId) {
                                const company = companies.find(c => c.id === inv.companyId);
                                if (company) handleResendInvitation(company);
                              } else {
                                handleResendStandaloneInvitation({ id: inv.id, email: inv.email, token: inv.token });
                              }
                            }}
                            disabled={resendingInvitation === (inv.companyId || inv.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-medium hover:bg-secondary/80 transition-colors border border-border disabled:opacity-50"
                          >
                            {resendingInvitation === (inv.companyId || inv.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                            Gensend
                          </button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Slet invitation?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Er du sikker på, at du vil slette invitationen til <strong>{inv.email}</strong>? Dette kan ikke fortrydes.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annuller</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={async () => {
                                    const { error } = await supabase
                                      .from("company_invitations")
                                      .delete()
                                      .eq("id", inv.id);
                                    if (error) {
                                      toast.error("Kunne ikke slette invitationen: " + error.message);
                                    } else {
                                      toast.success(`Invitation til ${inv.email} er slettet`);
                                      loadCompanies();
                                    }
                                  }}
                                >
                                  Slet
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-muted-foreground">Ingen afventende invitationer</p>
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}

      {/* Merge dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tilknyt bruger til {mergeTargetCompany?.name}</DialogTitle>
            <DialogDescription>
              Søg efter en bruger og flyt dem til denne virksomhed. Eventuelle data flyttes automatisk med.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={mergeSearch}
              onChange={(e) => setMergeSearch(e.target.value)}
              placeholder="Søg på brugernavn eller virksomhed..."
              className="w-full pl-10 pr-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {filteredMergeUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {mergeSearch ? "Ingen brugere matcher" : "Ingen brugere at tilknytte"}
              </p>
            ) : (
              filteredMergeUsers.map((u) => (
                <button
                  key={u.user_id}
                  onClick={() => handleMergeUser(u)}
                  disabled={merging}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/50 transition-colors text-left disabled:opacity-50"
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-semibold text-primary">{getInitials(u.full_name)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{u.full_name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">Fra: {u.company_name}</p>
                  </div>
                  <UserPlus className="h-4 w-4 text-primary flex-shrink-0" />
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {(deleteTarget && (deleteTarget.members.length > 0 || deleteTarget.reportCount > 0)) && (
                <AlertTriangle className="h-5 w-5 text-chart-warning" />
              )}
              Slet {deleteTarget?.name}?
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3">
                {deleteTarget && (deleteTarget.members.length > 0 || deleteTarget.reportCount > 0) ? (
                  <>
                    <p className="text-sm font-medium text-destructive">
                      Denne virksomhed har tilknyttede data der vil blive påvirket:
                    </p>
                    <ul className="space-y-1.5 text-sm">
                      {deleteTarget.members.length > 0 && (
                        <li className="flex items-center gap-2">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          {deleteTarget.members.length} tilknyttede {deleteTarget.members.length === 1 ? "bruger" : "brugere"} (fjernes fra virksomheden)
                        </li>
                      )}
                      {deleteTarget.reportCount > 0 && (
                        <li className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          {deleteTarget.reportCount} {deleteTarget.reportCount === 1 ? "rapport" : "rapporter"} (flyttes til papirkurv)
                        </li>
                      )}
                      <li className="flex items-center gap-2">
                        <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                        Alle milestones, budgets, KPI'er og handouts slettes permanent
                      </li>
                    </ul>
                    <p className="text-xs text-muted-foreground pt-1 border-t border-border/50">
                      Denne handling kan ikke fortrydes. Rapporter kan gendannes fra papirkurven.
                    </p>
                  </>
                ) : (
                  <p>Denne virksomhed har ingen tilknyttede brugere eller data. Sletningen kan ikke fortrydes.</p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Annullér
            </Button>
            <Button variant="destructive" onClick={handleDeleteCompany} disabled={deleting}>
              {deleting ? "Sletter..." : "Slet virksomhed"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Standalone invite dialog */}
      <Dialog open={standaloneInviteOpen} onOpenChange={(open) => { setStandaloneInviteOpen(open); if (!open) { setStandaloneCompanyId(""); setStandaloneEmail(""); setStandaloneName(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inviter ny bruger</DialogTitle>
            <DialogDescription>
              Send en invitation til en ny person. Vælg eventuelt en virksomhed de skal tilknyttes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Navn (valgfrit)</label>
              <input
                type="text"
                value={standaloneName}
                onChange={(e) => setStandaloneName(e.target.value)}
                placeholder="F.eks. Jeppe Chris"
                className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">E-mail *</label>
              <input
                type="email"
                value={standaloneEmail}
                onChange={(e) => setStandaloneEmail(e.target.value)}
                placeholder="email@virksomhed.dk"
                required
                className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tilknyt virksomhed (valgfrit)</label>
              <select
                value={standaloneCompanyId}
                onChange={(e) => setStandaloneCompanyId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Ingen — opretter selv virksomhed</option>
                {companies
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name, "da"))
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              {standaloneCompanyId
                ? "Personen tilknyttes automatisk den valgte virksomhed ved tilmelding."
                : "Personen opretter selv en ny virksomhed ved tilmelding."}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStandaloneInviteOpen(false)} disabled={standaloneSending}>
              Annuller
            </Button>
            <Button onClick={handleStandaloneInvite} disabled={standaloneSending || !standaloneEmail.trim()}>
              {standaloneSending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group creation wizard */}
      {wizardAnchor && (
        <CreateGroupWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          anchorCompany={wizardAnchor}
          allCompanies={companies.map((c) => ({ id: c.id, name: c.name }))}
          groupedCompanyIds={groupedCompanyIds}
          onCreated={() => setReloadTrigger((t) => t + 1)}
        />
      )}

      {/* Add company to existing group dialog */}
      {addToGroupTarget && (
        <AddCompanyToGroupDialog
          open={!!addToGroupTarget}
          onOpenChange={(val) => { if (!val) setAddToGroupTarget(null); }}
          groupId={addToGroupTarget.groupId}
          groupName={addToGroupTarget.groupName}
          allCompanies={companies.map((c) => ({
            id: c.id,
            name: c.name,
            members: c.members.map((m) => ({ user_id: m.user_id, full_name: m.full_name, role: m.role })),
          }))}
          groupedCompanyIds={groupedCompanyIds}
          onSuccess={() => setReloadTrigger((t) => t + 1)}
        />
      )}
    </AppLayout>
  );
};

export default Members;
