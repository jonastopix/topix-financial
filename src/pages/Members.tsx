import { useState, useEffect, useMemo, useCallback } from "react";
import { Navigate, Link } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { supabase } from "@/integrations/supabase/client";
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
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  unreadCount: number;
  conversationId: string | null;
  circleInfo: CircleInfo[];
  logo_url: string | null;
  pendingInvitationEmail: string | null;
  invitationStatus: 'pending' | 'accepted' | null;
  invitationAcceptedAt: string | null;
  invitationEmail: string | null;
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
  const { user, isAdvisor: rawAdvisor, loading: authLoading } = useAuth();
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

  // Bulk invite state
  interface UninvitedCompany {
    id: string;
    name: string;
    contact_person: string;
    contact_email: string;
  }
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [uninvitedCompanies, setUninvitedCompanies] = useState<UninvitedCompany[]>([]);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [bulkDone, setBulkDone] = useState(false);
  const [selectedBulkIds, setSelectedBulkIds] = useState<Set<string>>(new Set());

  // Standalone invite (no company)
  const [standaloneInviteOpen, setStandaloneInviteOpen] = useState(false);
  const [standaloneEmail, setStandaloneEmail] = useState("");
  const [standaloneName, setStandaloneName] = useState("");
  const [standaloneSending, setStandaloneSending] = useState(false);

  const loadCompanies = useCallback(async () => {
    if (!user || !isAdvisor) return;
    setLoading(true);

    const [companiesRes, membersRes, profilesRes, convsRes, reportsRes, circleMembersRes, circleActivityRes, invitationsRes] = await Promise.all([
      supabase.from("companies" as any).select("*"),
      supabase.from("company_members" as any).select("company_id, user_id, role"),
      supabase.from("profiles").select("user_id, full_name, avatar_url"),
      supabase.from("conversations").select("id, company_id, last_message_at"),
      supabase.from("financial_reports").select("company_id, id, extracted_data"),
      supabase.from("circle_members").select("id, circle_id, email, name, last_seen_at, user_id"),
      supabase.from("circle_activity").select("circle_member_id, activity_type").limit(1000),
      supabase.from("company_invitations").select("company_id, email, status, accepted_at"),
    ]);

    const allCompanies = (companiesRes.data || []) as any[];
    const allMembers = (membersRes.data || []) as any[];
    const allProfiles = (profilesRes.data || []) as any[];
    const allConvs = (convsRes.data || []) as any[];
    const allReports = (reportsRes.data || []) as any[];
    const allCircleMembers = (circleMembersRes.data || []) as any[];
    const allCircleActivity = (circleActivityRes.data || []) as any[];
    const allInvitations = (invitationsRes.data || []) as any[];

    // Invitation info by company (most recent invitation per company)
    const pendingInvitationByCompany = new Map<string, string>();
    const invitationInfoByCompany = new Map<string, { status: string; email: string; accepted_at: string | null }>();
    // Sort so most recent comes last (overwrites)
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
    const reportFilesByCompany = new Map<string, number>();
    const reportedRevenueByCompany = new Map<string, number>();
    const periodsByCompany = new Map<string, Set<string>>();
    allReports.forEach((r: any) => {
      if (r.company_id) {
        reportFilesByCompany.set(r.company_id, (reportFilesByCompany.get(r.company_id) || 0) + 1);
        // Track unique periods
        if (r.report_period) {
          const periods = periodsByCompany.get(r.company_id) || new Set<string>();
          periods.add(r.report_period);
          periodsByCompany.set(r.company_id, periods);
        }
        // Try to extract revenue from extracted_data
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

    // Use unique periods as the report count
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

    // Circle.so matching: match circle_members to company members via user_id or email
    // Build a map: company_id -> CircleInfo[]
    const circleByUserId = new Map<string, any>();
    allCircleMembers.forEach((cm: any) => {
      if (cm.user_id) circleByUserId.set(cm.user_id, cm);
    });

    // Also match by email (profiles don't have email, but we can match circle_members.email to profiles)
    // We'll need auth emails - but we can't access auth.users. Instead, match via circle_members.user_id link
    // or by name similarity. The safest is user_id link on circle_members table.

    // (circle_course_progress removed — API does not support fetching lesson data)

    // Activity count by circle_member_id
    const activityByCircleMember = new Map<number, number>();
    allCircleActivity.forEach((a: any) => {
      activityByCircleMember.set(a.circle_member_id, (activityByCircleMember.get(a.circle_member_id) || 0) + 1);
    });

    const circleInfoByCompany = new Map<string, CircleInfo[]>();
    // For each company member, check if they have a circle_member linked
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
          unreadCount: conv ? (unreadByConv.get(conv.id) || 0) : 0,
          conversationId: conv?.id || null,
          circleInfo: circleInfoByCompany.get(c.id) || [],
          logo_url: c.logo_url || null,
          pendingInvitationEmail: pendingInvitationByCompany.get(c.id) || null,
          invitationStatus: (invitationInfoByCompany.get(c.id)?.status as 'pending' | 'accepted') || null,
          invitationAcceptedAt: invitationInfoByCompany.get(c.id)?.accepted_at || null,
          invitationEmail: invitationInfoByCompany.get(c.id)?.email || null,
        };
      });

    setCompanies(enriched);
    setLoading(false);
  }, [user, isAdvisor]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies, reloadTrigger]);

  // Load unassigned users for merge dialog
  const handleRemoveMember = async (company: CompanyData, member: CompanyMember) => {
    if (member.role === 'owner') return;
    setRemovingMember(member.user_id);
    try {
      // Remove from company_members
      const { error } = await supabase
        .from("company_members" as any)
        .delete()
        .eq("company_id", company.id)
        .eq("user_id", member.user_id) as any;
      if (error) throw error;

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
      // If invitation was accepted, reset it back to pending first
      if (company.invitationStatus === 'accepted') {
        const { error: updateErr } = await supabase
          .from("company_invitations")
          .update({ status: 'pending', accepted_at: null })
          .eq("company_id", company.id)
          .eq("email", company.invitationEmail)
          .eq("status", "accepted");
        if (updateErr) throw updateErr;
      }

      const { error } = await supabase.functions.invoke("send-invitation-email", {
        body: {
          email: company.invitationEmail,
          company_name: company.name,
          signup_url: "https://topix.lovable.app/auth?mode=signup",
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

  const openMergeDialog = async (company: CompanyData) => {
    setMergeTargetCompany(company);
    setMergeSearch("");
    setMergeDialogOpen(true);

    // Get all users that are in auto-created "X's virksomhed" companies
    // or all users not in this company
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
      // 1. Update company_members: change user's company_id
      const { error: updateErr } = await supabase
        .from("company_members" as any)
        .update({ company_id: mergeTargetCompany.id } as any)
        .eq("user_id", targetUser.user_id)
        .eq("company_id", targetUser.company_id) as any;

      if (updateErr) throw updateErr;

      // 2. Update conversations for this user to new company
      await supabase
        .from("conversations")
        .update({ company_id: mergeTargetCompany.id })
        .eq("member_id", targetUser.user_id)
        .eq("company_id", targetUser.company_id);

      // 3. Move any reports, handouts, milestones, budget_targets, kpi_targets, kpi_benchmarks
      await Promise.all([
        supabase.from("financial_reports").update({ company_id: mergeTargetCompany.id } as any).eq("company_id", targetUser.company_id).eq("user_id", targetUser.user_id),
        supabase.from("handouts").update({ company_id: mergeTargetCompany.id } as any).eq("company_id", targetUser.company_id).eq("user_id", targetUser.user_id),
        supabase.from("milestones").update({ company_id: mergeTargetCompany.id } as any).eq("company_id", targetUser.company_id).eq("user_id", targetUser.user_id),
        supabase.from("budget_targets").update({ company_id: mergeTargetCompany.id } as any).eq("company_id", targetUser.company_id).eq("user_id", targetUser.user_id),
        supabase.from("kpi_targets").update({ company_id: mergeTargetCompany.id } as any).eq("company_id", targetUser.company_id).eq("user_id", targetUser.user_id),
        supabase.from("kpi_benchmarks").update({ company_id: mergeTargetCompany.id } as any).eq("company_id", targetUser.company_id).eq("user_id", targetUser.user_id),
      ]);

      // 4. Check if old company is now empty
      const { data: remaining } = await supabase
        .from("company_members" as any)
        .select("id")
        .eq("company_id", targetUser.company_id) as any;

      if (!remaining || remaining.length === 0) {
        // Auto-delete empty company
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
      // Delete all related data first
      await Promise.all([
        supabase.from("financial_reports").delete().eq("company_id", deleteTarget.id),
        supabase.from("handouts").delete().eq("company_id", deleteTarget.id),
        supabase.from("milestones").delete().eq("company_id", deleteTarget.id),
        supabase.from("budget_targets").delete().eq("company_id", deleteTarget.id),
        supabase.from("kpi_targets").delete().eq("company_id", deleteTarget.id),
        supabase.from("kpi_benchmarks").delete().eq("company_id", deleteTarget.id),
        supabase.from("company_invitations").delete().eq("company_id", deleteTarget.id),
      ]);

      // Delete conversations and their messages
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

  const openBulkInviteDialog = async () => {
    // Get all existing invitations (pending/accepted)
    const { data: existingInvitations } = await supabase
      .from("company_invitations" as any)
      .select("company_id, status")
      .in("status", ["pending", "accepted"]) as any;

    const invitedCompanyIds = new Set(
      (existingInvitations || []).map((i: any) => i.company_id)
    );

    const uninvited = companies
      .filter((c) => !invitedCompanyIds.has(c.id))
      .map((c) => ({
        id: c.id,
        name: c.name,
        contact_person: c.contact_person,
        contact_email: c.contact_email,
      }));

    setUninvitedCompanies(uninvited);
    setSelectedBulkIds(new Set(uninvited.filter((c) => c.contact_email.trim()).map((c) => c.id)));
    setBulkSending(false);
    setBulkProgress(0);
    setBulkErrors([]);
    setBulkDone(false);
    setBulkDialogOpen(true);
  };

  const executeBulkInvite = async () => {
    if (!user) return;
    const toSend = uninvitedCompanies.filter((c) => c.contact_email.trim() && selectedBulkIds.has(c.id));
    setBulkSending(true);
    setBulkProgress(0);
    setBulkErrors([]);
    setBulkDone(false);

    const errors: string[] = [];

    for (let i = 0; i < toSend.length; i++) {
      const c = toSend[i];
      try {
        const { error } = await supabase
          .from("company_invitations" as any)
          .insert({
            company_id: c.id,
            email: c.contact_email.trim().toLowerCase(),
            invited_by: user.id,
          } as any);

        if (error) throw error;

        // Send email
        try {
          await supabase.functions.invoke("send-invitation-email", {
            body: {
              email: c.contact_email.trim().toLowerCase(),
              company_name: c.name,
              signup_url: `https://topix.lovable.app/auth?mode=signup`,
            },
          });
        } catch (emailErr) {
          console.error("Email error for", c.contact_email, emailErr);
        }
      } catch (err: any) {
        errors.push(`${c.name}: ${err.message || "Ukendt fejl"}`);
      }
      setBulkProgress(i + 1);
    }

    setBulkErrors(errors);
    setBulkDone(true);
    setBulkSending(false);

    const successCount = toSend.length - errors.length;
    if (successCount > 0) {
      toast.success(`${successCount} invitationer sendt`);
    }
    if (errors.length > 0) {
      toast.error(`${errors.length} invitationer fejlede`);
    }

    setReloadTrigger((t) => t + 1);
  };

  const handleStandaloneInvite = async () => {
    if (!standaloneEmail.trim() || !user) return;
    setStandaloneSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-invitation-email", {
        body: {
          email: standaloneEmail.trim().toLowerCase(),
          company_name: "The Boardroom",
          signup_url: "https://topix.lovable.app/auth?mode=signup",
        },
      });
      if (error) throw error;
      toast.success(`Invitation sendt til ${standaloneEmail}`);
      setStandaloneInviteOpen(false);
      setStandaloneEmail("");
      setStandaloneName("");
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
    // Reported revenue from financial reports takes priority
    if (c.reported_revenue && c.reported_revenue > 0) return { value: c.reported_revenue, source: "rapport" };
    if (c.annual_revenue > 0) return { value: c.annual_revenue, source: "ansøgning" };
    return null;
  };

  const totalCompanies = companies.length;
  const totalMembers = companies.reduce((sum, c) => sum + c.members.length, 0);
  const totalUnread = companies.reduce((sum, c) => sum + c.unreadCount, 0);
  const companiesWithReports = companies.filter((c) => c.reportCount > 0).length;
  const invitedCount = companies.filter((c) => c.invitationStatus !== null).length;
  const acceptedCount = companies.filter((c) => c.invitationStatus === 'accepted').length;
  const pendingCount = companies.filter((c) => c.invitationStatus === 'pending').length;
  const notInvitedCount = companies.filter((c) => c.invitationStatus === null).length;

  const filteredMergeUsers = unassignedUsers.filter((u) => {
    if (!mergeSearch.trim()) return true;
    const q = mergeSearch.toLowerCase();
    return u.full_name.toLowerCase().includes(q) || u.company_name.toLowerCase().includes(q);
  });

  if (authLoading) return null;
  if (!isAdvisor) return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <div className="mb-6 flex items-start justify-between">
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
          >
            <UserPlus className="h-4 w-4" />
            Inviter ny bruger
          </Button>
          <Button
            onClick={openBulkInviteDialog}
            className="gap-2"
            variant="outline"
          >
            <Send className="h-4 w-4" />
            Invitér alle
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

      {/* Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 bg-secondary/50 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          <button onClick={() => toggleSort("name")} className="col-span-3 flex items-center gap-1 hover:text-foreground transition-colors">
            Virksomhed <ArrowUpDown className="h-3 w-3" />
          </button>
          <button onClick={() => toggleSort("industry")} className="col-span-2 flex items-center gap-1 hover:text-foreground transition-colors">
            Branche <ArrowUpDown className="h-3 w-3" />
          </button>
          <button onClick={() => toggleSort("contact_person")} className="col-span-2 flex items-center gap-1 hover:text-foreground transition-colors">
            Kontaktperson <ArrowUpDown className="h-3 w-3" />
          </button>
          <button onClick={() => toggleSort("city")} className="col-span-1 flex items-center gap-1 hover:text-foreground transition-colors">
            By <ArrowUpDown className="h-3 w-3" />
          </button>
          <button onClick={() => toggleSort("annual_revenue")} className="col-span-2 flex items-center gap-1 hover:text-foreground transition-colors">
            Omsætning <ArrowUpDown className="h-3 w-3" />
          </button>
          <button onClick={() => toggleSort("reportCount")} className="col-span-1 flex items-center gap-1 hover:text-foreground transition-colors">
            Perioder <ArrowUpDown className="h-3 w-3" />
          </button>
          <div className="col-span-1">Chat</div>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {search ? "Ingen virksomheder matcher din søgning" : "Ingen virksomheder endnu"}
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {filtered.map((c) => {
              const isExpanded = expandedId === c.id;
              const revenue = getDisplayRevenue(c);
              return (
                <div key={c.id}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : c.id)}
                    className="w-full text-left px-5 py-3.5 hover:bg-secondary/30 transition-colors"
                  >
                    {/* Desktop row */}
                    <div className="hidden sm:grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-3 flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {c.logo_url ? (
                            <img src={c.logo_url} alt={c.name} className="h-full w-full object-contain" />
                          ) : (
                            <span className="text-[10px] font-semibold text-primary">{getInitials(c.name)}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground truncate block">{c.name}</span>
                            {c.invitationStatus === 'pending' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-chart-warning/15 text-chart-warning text-[10px] font-semibold whitespace-nowrap">
                                <Send className="h-2.5 w-2.5" /> Afventer
                              </span>
                            )}
                            {c.invitationStatus === 'accepted' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-600 dark:text-green-400 text-[10px] font-semibold whitespace-nowrap">
                                <CheckCircle2 className="h-2.5 w-2.5" /> Accepteret
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {c.cvr_number && (
                              <span className="text-[10px] text-muted-foreground">CVR: {c.cvr_number}</span>
                            )}
                            {c.slack_channel && (
                              <span className="text-[10px] text-primary flex items-center gap-0.5">
                                <Hash className="h-2.5 w-2.5" />{c.slack_channel}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs text-muted-foreground truncate block">{c.industry || "–"}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs text-foreground truncate block">{c.contact_person || "–"}</span>
                      </div>
                      <div className="col-span-1">
                        <span className="text-xs text-muted-foreground truncate block">{c.city || "–"}</span>
                      </div>
                      <div className="col-span-2">
                        {revenue ? (
                          <div>
                            <span className="text-xs text-foreground font-medium">{formatDKK(revenue.value)}</span>
                            <span className="text-[9px] text-muted-foreground ml-1">({revenue.source})</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">–</span>
                        )}
                      </div>
                      <div className="col-span-1">
                        <div className="flex items-center gap-1.5">
                          <FileText className="h-3 w-3 text-muted-foreground" />
                          <span className={`text-xs ${c.reportCount === 0 ? "text-muted-foreground" : "text-foreground font-medium"}`}>
                            {c.reportCount}
                          </span>
                        </div>
                      </div>
                      <div className="col-span-1 flex items-center justify-between">
                        {c.unreadCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-chart-warning">
                            <MessageCircle className="h-3 w-3" />
                            {c.unreadCount}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">0</span>
                        )}
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                    </div>

                    {/* Mobile row */}
                    <div className="sm:hidden flex items-center gap-3">
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
                          {c.invitationStatus === 'accepted' && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-600 dark:text-green-400 text-[10px] font-semibold whitespace-nowrap">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Accepteret
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
                          {/* Invitation status */}
                          {c.invitationStatus && (
                            <div className="mt-3 pt-2 border-t border-border/30">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                                <Send className="h-3 w-3" /> Invitation
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {c.invitationEmail}
                              </p>
                              {c.invitationStatus === 'accepted' && c.invitationAcceptedAt && (
                                <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                                  Accepteret {format(new Date(c.invitationAcceptedAt), "d. MMM yyyy", { locale: da })}
                                </p>
                              )}
                              {c.invitationStatus === 'pending' && (
                                <p className="text-xs text-chart-warning mt-0.5">
                                  Afventer svar
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Team members + merge button */}
                        <div className="rounded-lg bg-background/50 border border-border/50 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-primary" />
                              <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                                Team ({c.members.length})
                              </span>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); openMergeDialog(c); }}
                              className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
                              title="Tilknyt bruger"
                            >
                              <UserPlus className="h-3 w-3" /> Tilknyt
                            </button>
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
                                    <span className="text-xs text-foreground truncate">{m.full_name}</span>
                                    <span className="text-[10px] text-muted-foreground ml-auto">{m.role}</span>
                                  </Link>
                                  {m.role !== 'owner' && (
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

                        {/* Actions + delete */}
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
                            {c.invitationEmail && c.invitationStatus === 'pending' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleResendInvitation(c); }}
                                disabled={resendingInvitation === c.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-medium hover:bg-secondary/80 transition-colors border border-border disabled:opacity-50"
                              >
                                {resendingInvitation === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Gensend invitation
                              </button>
                            )}
                            {c.invitationEmail && c.invitationStatus === 'accepted' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleResendInvitation(c); }}
                                disabled={resendingInvitation === c.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-chart-warning/10 text-chart-warning text-xs font-medium hover:bg-chart-warning/20 transition-colors border border-chart-warning/30 disabled:opacity-50"
                              >
                                {resendingInvitation === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Nulstil & gensend
                              </button>
                            )}
                            {c.members.length === 0 && c.reportCount === 0 && (
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
            <DialogTitle>Slet {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              Denne virksomhed har ingen tilknyttede brugere eller rapporter. Sletningen kan ikke fortrydes.
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

      {/* Bulk invite dialog */}
      <AlertDialog open={bulkDialogOpen} onOpenChange={(open) => { if (!bulkSending) setBulkDialogOpen(open); }}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Bulk-invitation
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                {(() => {
                  const selectedCount = uninvitedCompanies.filter((c) => c.contact_email.trim() && selectedBulkIds.has(c.id)).length;
                  const totalWithEmail = uninvitedCompanies.filter((c) => c.contact_email.trim()).length;
                  const missingCount = uninvitedCompanies.filter((c) => !c.contact_email.trim()).length;
                  return (
                    <div className="flex gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground bg-secondary px-3 py-1.5 rounded-lg">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        {selectedCount} af {totalWithEmail} valgt
                      </span>
                      {missingCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-destructive bg-destructive/10 px-3 py-1.5 rounded-lg">
                          <AlertTriangle className="h-4 w-4" />
                          {missingCount} mangler e-mail
                        </span>
                      )}
                    </div>
                  );
                })()}

                {bulkSending || bulkDone ? (
                  <div className="space-y-3">
                    <Progress value={(bulkProgress / Math.max(uninvitedCompanies.filter((c) => c.contact_email.trim() && selectedBulkIds.has(c.id)).length, 1)) * 100} className="h-3" />
                    <p className="text-sm text-muted-foreground">
                      {bulkDone
                        ? `Færdig — ${bulkProgress - bulkErrors.length} af ${uninvitedCompanies.filter((c) => c.contact_email.trim() && selectedBulkIds.has(c.id)).length} sendt`
                        : `Sender ${bulkProgress} af ${uninvitedCompanies.filter((c) => c.contact_email.trim() && selectedBulkIds.has(c.id)).length}...`
                      }
                    </p>
                    {bulkErrors.length > 0 && (
                      <div className="bg-destructive/10 rounded-lg p-3 space-y-1">
                        <p className="text-xs font-semibold text-destructive">{bulkErrors.length} fejlede:</p>
                        {bulkErrors.map((e, i) => (
                          <p key={i} className="text-xs text-destructive">{e}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <ScrollArea className="h-[340px] rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-secondary">
                        <tr className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                          <th className="px-3 py-2 w-8">
                            <input
                              type="checkbox"
                              checked={uninvitedCompanies.filter((c) => c.contact_email.trim()).every((c) => selectedBulkIds.has(c.id))}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedBulkIds(new Set(uninvitedCompanies.filter((c) => c.contact_email.trim()).map((c) => c.id)));
                                } else {
                                  setSelectedBulkIds(new Set());
                                }
                              }}
                              className="rounded border-border"
                            />
                          </th>
                          <th className="px-3 py-2">Virksomhed</th>
                          <th className="px-3 py-2">Kontaktperson</th>
                          <th className="px-3 py-2">E-mail</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {uninvitedCompanies.map((c) => {
                          const hasEmail = c.contact_email.trim();
                          return (
                            <tr
                              key={c.id}
                              className={`${!hasEmail ? "opacity-50" : "cursor-pointer hover:bg-secondary/30"}`}
                              onClick={() => {
                                if (!hasEmail) return;
                                setSelectedBulkIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(c.id)) next.delete(c.id);
                                  else next.add(c.id);
                                  return next;
                                });
                              }}
                            >
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={selectedBulkIds.has(c.id)}
                                  disabled={!hasEmail}
                                  onChange={() => {}}
                                  className="rounded border-border"
                                />
                              </td>
                              <td className="px-3 py-2 text-foreground font-medium">{c.name}</td>
                              <td className="px-3 py-2 text-muted-foreground">{c.contact_person || "–"}</td>
                              <td className="px-3 py-2">
                                {hasEmail ? (
                                  <span className="text-foreground">{c.contact_email}</span>
                                ) : (
                                  <span className="text-destructive text-xs flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" /> Mangler e-mail
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </ScrollArea>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {bulkDone ? (
              <Button onClick={() => setBulkDialogOpen(false)}>Luk</Button>
            ) : (
              <>
                <AlertDialogCancel disabled={bulkSending}>Annuller</AlertDialogCancel>
                <Button
                  onClick={executeBulkInvite}
                  disabled={bulkSending || uninvitedCompanies.filter((c) => c.contact_email.trim() && selectedBulkIds.has(c.id)).length === 0}
                  className="gap-2"
                >
                  {bulkSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Send {uninvitedCompanies.filter((c) => c.contact_email.trim() && selectedBulkIds.has(c.id)).length} invitationer
                </Button>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Standalone invite dialog */}
      <Dialog open={standaloneInviteOpen} onOpenChange={setStandaloneInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inviter ny bruger</DialogTitle>
            <DialogDescription>
              Send en invitation til en person, som selv opretter sin virksomhed ved tilmelding.
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
            <p className="text-xs text-muted-foreground">
              Personen modtager en email med link til at oprette konto. Ved tilmelding oprettes automatisk en ny virksomhed, som de selv udfylder under onboarding.
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
    </AppLayout>
  );
};

export default Members;
