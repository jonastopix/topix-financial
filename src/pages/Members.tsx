import { useState, useMemo, useCallback } from "react";
import { Navigate, Link } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import CreateGroupWizard from "@/components/CreateGroupWizard";
import AddCompanyToGroupDialog from "@/components/AddCompanyToGroupDialog";
import {
  Building2, Search, ChevronDown, ArrowUpDown, UserPlus,
  AlertTriangle, Loader2, Layers, Pencil, Users, FileText,
  Activity, Send, Upload, CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

import type { CompanyData, CompanyMember, LoginInfo, UnassignedUser, SortKey, SortDir } from "@/components/members/types";
import MembersStatsBar from "@/components/members/MembersStatsBar";
import MembersOnboardingFunnel from "@/components/members/MembersOnboardingFunnel";
import MemberCompanyRow from "@/components/members/MemberCompanyRow";
import MembersAdminSection from "@/components/members/MembersAdminSection";

async function parseApplicationExcel(file: File): Promise<Partial<{
  email: string; company_name: string; cvr_number: string; contact_name: string;
  annual_revenue: string; revenue_interval: string; industry_label: string; current_situation: string;
  goals: string; help_needed: string; website: string; phone: string;
  contract_start_date: string; contract_end_date: string;
}>> {
  const XLSX = await import("xlsx");
  const { read, utils } = XLSX;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[][] = utils.sheet_to_json(sheet, { header: 1, defval: null });

        let headerIdx = -1;
        for (let i = 0; i < Math.min(rows.length, 15); i++) {
          const nonNull = rows[i].filter(v => v != null);
          if (nonNull.length > 5 && (nonNull.includes("Name") || nonNull.includes("Email"))) {
            headerIdx = i;
            break;
          }
        }
        if (headerIdx === -1) { reject(new Error("Kunne ikke finde kolonneoverskrifter")); return; }

        const headers: string[] = rows[headerIdx].map(h => String(h ?? ""));
        const dataRow = rows[headerIdx + 1];
        if (!dataRow) { reject(new Error("Ingen data fundet")); return; }

        const get = (key: string) => {
          const idx = headers.findIndex(h => h.toLowerCase().includes(key.toLowerCase()));
          if (idx === -1) return "";
          const val = dataRow[idx];
          return val != null ? String(val).trim() : "";
        };

        let annualRevenue = "";
        // Try exact annual revenue first (if founder filled it in)
        const exactRev = get("Årlig omsætning");
        const intervalRev = get("Omsætning (interval)");
        const revRaw = exactRev || intervalRev;
        if (revRaw) {
          // Check if it's a clean number (exact revenue)
          const cleanNum = parseFloat(revRaw.replace(/[\s.]/g, "").replace(",", "."));
          if (!isNaN(cleanNum) && cleanNum > 0 && cleanNum < 100_000_000 && !revRaw.includes("-")) {
            annualRevenue = String(Math.round(cleanNum));
          } else {
            // It's an interval — extract the two boundary numbers and take midpoint
            const nums = revRaw.match(/[\d.]+/g)
              ?.map(n => parseFloat(n.replace(/\./g, "")))
              .filter(n => !isNaN(n) && n > 0 && n < 100_000_000);
            if (nums && nums.length >= 2) {
              annualRevenue = String(Math.round((nums[0] + nums[1]) / 2));
            } else if (nums && nums.length === 1) {
              annualRevenue = String(nums[0]);
            }
          }
        }
        // Store the raw interval string for the agent context
        const revenueInterval = intervalRev && intervalRev !== exactRev ? intervalRev : null;

        // Parse contract dates
        const parseExcelDate = (raw: string | number | null | undefined): string | null => {
          if (raw == null || raw === "" || raw === "nan") return null;
          try {
            // Numeric Excel serial date (days since 1900-01-01, with Lotus 1-2-3 leap year bug)
            const num = typeof raw === "number" ? raw : parseFloat(String(raw));
            if (!isNaN(num) && num > 1000 && num < 100000) {
              const utc = new Date(Date.UTC(1899, 11, 30 + Math.floor(num)));
              if (!isNaN(utc.getTime())) return utc.toISOString().slice(0, 10);
            }
            // ISO string or other parseable formats
            const d = new Date(String(raw));
            if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
            return null;
          } catch { return null; }
        };
        const contractStart = parseExcelDate(get("Startdato"));
        const contractEnd = parseExcelDate(get("End date"));

        resolve({
          email: get("Email"),
          company_name: get("Name"),
          cvr_number: get("CVR").replace(/\s/g, ""),
          contact_name: get("Kontaktperson"),
          annual_revenue: annualRevenue,
          revenue_interval: revenueInterval || undefined,
          industry_label: get("Branche"),
          current_situation: get("Nuværende situation"),
          goals: get("Mål med virksomhed"),
          help_needed: get("Beskriv hvilken hjælp"),
          website: get("Hjemmeside"),
          phone: get("Telefon"),
          contract_start_date: contractStart,
          contract_end_date: contractEnd,
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Kunne ikke læse filen"));
    reader.readAsArrayBuffer(file);
  });
}

interface CircleInfo {
  circle_member_id: number;
  name: string;
  last_seen_at: string | null;
  recent_activity_count: number;
}

const Members = () => {
  const { user, isAdvisor: rawAdvisor, isAdmin, loading: authLoading } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;
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

  const [resendingInvitation, setResendingInvitation] = useState<string | null>(null);
  const [removingMember, setRemovingMember] = useState<string | null>(null);

  // Rename state
  const [renamingCompany, setRenamingCompany] = useState<{ id: string; currentName: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  // Group/Koncern state (admin-only)
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

  // Import application state
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importForm, setImportForm] = useState({
    email: "", company_name: "", cvr_number: "", contact_name: "",
    annual_revenue: "", revenue_interval: "", industry_label: "", current_situation: "",
    goals: "", help_needed: "", website: "", phone: "",
    contract_start_date: "", contract_end_date: "",
  });
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(false);
  const [showAttachUser, setShowAttachUser] = useState(false);
  const [attachEmail, setAttachEmail] = useState("");
  const [attaching, setAttaching] = useState(false);

  const handleAttachExistingUser = async () => {
    if (!attachEmail) return;
    setAttaching(true);
    try {
      if (!importForm.cvr_number) {
        toast.error("CVR mangler — kan ikke finde virksomheden");
        return;
      }
      const { data: company } = await supabase
        .from("companies")
        .select("id, name")
        .eq("cvr_number", importForm.cvr_number)
        .maybeSingle();

      if (!company) {
        toast.error("Virksomhed ikke fundet — importér ansøgningen først");
        return;
      }

      const { data, error } = await supabase.functions.invoke("attach-user-to-company", {
        body: { email: attachEmail.trim().toLowerCase(), company_id: company.id },
      });

      if (error || !data?.ok) throw new Error(data?.error || error?.message || "Tilknytning fejlede");

      toast.success("Bruger tilknyttet ✓", {
        description: `${attachEmail} er nu tilknyttet ${company.name}`,
      });
      setShowAttachUser(false);
      setAttachEmail("");
      resetImportDialog();
      refetchMembers();
    } catch (err: any) {
      toast.error("Fejl ved tilknytning", { description: err.message });
    } finally {
      setAttaching(false);
    }
  };

  const resetImportDialog = () => {
    setShowImportDialog(false);
    setParsed(false);
    setParsing(false);
    setImportForm({ email: "", company_name: "", cvr_number: "", contact_name: "", annual_revenue: "", revenue_interval: "", industry_label: "", current_situation: "", goals: "", help_needed: "", website: "", phone: "", contract_start_date: "", contract_end_date: "" });
  };

  const { data: membersData, isLoading: loading, refetch: refetchMembers } = useQuery({
    queryKey: ["members-data", user?.id],
    queryFn: async () => {
      if (!user || !isAdvisor) return null;

      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

      const [companiesRes, membersRes, profilesRes, convsRes, reportsRes, circleMembersRes, circleActivityRes, invitationsRes, loginLogsRes, factsRes, pulseRes] = await Promise.all([
        supabase.from("companies" as any).select("*, is_legat").limit(500),
        supabase.from("company_members" as any).select("company_id, user_id, role").limit(2000),
        supabase.from("profiles").select("user_id, full_name, avatar_url"),
        supabase.from("conversations").select("id, company_id, last_message_at"),
        (supabase.from("financial_reports").select("company_id, id, extracted_data, report_period") as any).is("deleted_at", null).limit(1000),
        supabase.from("circle_members").select("id, circle_id, email, name, last_seen_at, user_id"),
        supabase.from("circle_activity").select("circle_member_id, activity_type").limit(1000),
        supabase.from("company_invitations").select("id, company_id, email, status, accepted_at, accepted_by, token, created_at"),
        supabase.from("user_login_log" as any).select("user_id, logged_in_at") as any,
        supabase.from("financial_report_facts" as any).select("company_id, period_key"),
        supabase.from("pulse_checkins").select("company_id, period_key").gte("created_at", monthStart),
      ]);

      const allCompanies = (companiesRes.data || []) as any[];
      const legatCompanyIds = new Set(allCompanies.filter((c: any) => c.is_legat).map((c: any) => c.id));
      const regularCompanies = allCompanies.filter((c: any) => !c.is_legat);
      const allMembers = (membersRes.data || []) as any[];
      const allProfiles = (profilesRes.data || []) as any[];
      const allConvs = (convsRes.data || []) as any[];
      const allReports = (reportsRes.data || []) as any[];
      const allCircleMembers = (circleMembersRes.data || []) as any[];
      const allCircleActivity = (circleActivityRes.data || []) as any[];
      const allInvitations = (invitationsRes.data || []) as any[];
      const allLoginLogs = (loginLogsRes.data || []) as any[];
      const allFacts = (factsRes.data || []) as any[];
      const pulseThisMonthSet = new Set(
        (pulseRes.data || []).map((p: any) => p.company_id)
      );

      const committedByCompany = new Map<string, number>();
      for (const fact of allFacts) {
        const id = fact.company_id;
        committedByCompany.set(id, (committedByCompany.get(id) || 0) + 1);
      }

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

      const pendingInvitationByCompany = new Map<string, string>();
      const invitationInfoByCompany = new Map<string, { status: string; email: string; accepted_at: string | null }>();
      const pendingInvsByCompany = new Map<string, any[]>();
      const sortedInvitations = [...allInvitations].sort((a: any, b: any) => 
        new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      );
      sortedInvitations.forEach((inv: any) => {
        invitationInfoByCompany.set(inv.company_id, { 
          status: inv.status, email: inv.email, accepted_at: inv.accepted_at 
        });
        if (inv.status === 'pending') {
          pendingInvitationByCompany.set(inv.company_id, inv.email);
          const arr = pendingInvsByCompany.get(inv.company_id) || [];
          arr.push({ id: inv.id, email: inv.email, created_at: inv.created_at, token: inv.token, lastSentAt: lastSentMap.get(inv.email) || null });
          pendingInvsByCompany.set(inv.company_id, arr);
        }
      });

      const profileMap = new Map(allProfiles.map((p: any) => [p.user_id, p]));
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

      const latestPeriodByCompany = new Map<string, { period: string; uploadedAt: string }>();
      periodsByCompany.forEach((periods, companyId) => {
        reportsByCompany.set(companyId, periods.size);
      });
      allReports.forEach((r: any) => {
        if (r.company_id && r.report_period) {
          const existing = latestPeriodByCompany.get(r.company_id);
          if (!existing || r.uploaded_at > existing.uploadedAt) {
            latestPeriodByCompany.set(r.company_id, { period: r.report_period, uploadedAt: r.uploaded_at });
          }
        }
      });

      const convByCompany = new Map<string, any>();
      allConvs.forEach((c: any) => {
        if (c.company_id) convByCompany.set(c.company_id, c);
      });

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

      const enriched: CompanyData[] = regularCompanies
        .filter((c: any) => c.status === "active" || !c.status)
        .map((c: any) => {
          const conv = convByCompany.get(c.id);
          const reportedRev = reportedRevenueByCompany.get(c.id) || null;
          return {
            id: c.id,
            name: c.name || "",
            cvr_number: c.cvr_number,
            industry_label: c.industry_label || "",
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
            latestReportPeriod: latestPeriodByCompany.get(c.id)?.period || null,
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
            hasPulseThisMonth: pulseThisMonthSet.has(c.id),
          } as any;
        });

      const standalonePending = allInvitations
        .filter((inv: any) => inv.company_id === null && inv.status === 'pending')
        .map((inv: any) => ({ id: inv.id, email: inv.email, created_at: inv.created_at, token: inv.token, lastSentAt: lastSentMap.get(inv.email) || null }));

      let groupInfoMapResult = new Map<string, { groupName: string; groupId: string; isAnchor: boolean }>();
      let groupedCompanyIdsResult = new Set<string>();

      if (isAdmin) {
        const { data: gcData } = await supabase
          .from("group_companies" as any)
          .select("company_id, group_id, groups:group_id(id, name, anchor_company_id)" as any);
        (gcData || []).forEach((gc: any) => {
          groupedCompanyIdsResult.add(gc.company_id);
          groupInfoMapResult.set(gc.company_id, {
            groupName: gc.groups?.name || "Koncern",
            groupId: gc.group_id,
            isAnchor: gc.groups?.anchor_company_id === gc.company_id,
          });
        });
      }

      // Sort
      const sortedCompanies = [...enriched].sort((a, b) => a.name.localeCompare(b.name, "da"));

      return {
        companies: sortedCompanies,
        standalonePendingInvitations: standalonePending,
        groupInfoMap: groupInfoMapResult,
        groupedCompanyIds: groupedCompanyIdsResult,
        legatCompanies: allCompanies.filter((c: any) => c.is_legat),
        legatCompanyIds,
        allMembers: membersRes.data || [],
        allProfiles: profilesRes.data || [],
      };
    },
    enabled: !!user && !!isAdvisor,
    staleTime: 2 * 60_000,
  });

  // Destructure from query data
  const companies = membersData?.companies || [];
  const standalonePendingInvitations = membersData?.standalonePendingInvitations || [];
  const groupInfoMap = membersData?.groupInfoMap || new Map<string, { groupName: string; groupId: string; isAnchor: boolean }>();
  const groupedCompanyIds = membersData?.groupedCompanyIds || new Set<string>();
  const legatCompanies = membersData?.legatCompanies || [];
  const legatCompanyIds = membersData?.legatCompanyIds || new Set<string>();
  const allMembersRaw = (membersData?.allMembers || []) as any[];
  const allProfilesRaw = (membersData?.allProfiles || []) as any[];

  const handleImport = async () => {
    if (!importForm.email || !importForm.company_name) {
      toast.error("Email og virksomhedsnavn er påkrævet");
      return;
    }
    if (importForm.cvr_number && !/^\d{8}$/.test(importForm.cvr_number.trim())) {
      toast.error("CVR-nummer skal være præcis 8 cifre");
      return;
    }
    if (!importForm.contract_end_date) {
      toast.error("Kontraktslut er påkrævet");
      return;
    }
    if (importForm.contract_start_date && importForm.contract_end_date) {
      if (new Date(importForm.contract_end_date) <= new Date(importForm.contract_start_date)) {
        toast.error("Kontraktslut skal være efter kontraktstart");
        return;
      }
    }
    if (importForm.contract_end_date) {
      const endDate = new Date(importForm.contract_end_date);
      const minDate = new Date("2020-01-01");
      const maxDate = new Date();
      maxDate.setFullYear(maxDate.getFullYear() + 5);
      if (endDate < minDate || endDate > maxDate) {
        toast.error("Kontraktslut ser forkert ud", {
          description: `Datoen ${importForm.contract_end_date} er udenfor forventet interval (2020–${maxDate.getFullYear()})`,
        });
        return;
      }
    }
    if (importForm.contract_start_date) {
      const startDate = new Date(importForm.contract_start_date);
      const minDate = new Date("2020-01-01");
      const maxDate = new Date();
      maxDate.setFullYear(maxDate.getFullYear() + 2);
      if (startDate < minDate || startDate > maxDate) {
        toast.error("Kontraktstart ser forkert ud", {
          description: `Datoen ${importForm.contract_start_date} er udenfor forventet interval (2020–${maxDate.getFullYear()})`,
        });
        return;
      }
    }
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-application", {
        body: {
          ...importForm,
          annual_revenue: importForm.annual_revenue ? Number(importForm.annual_revenue) : undefined,
          revenue_interval: importForm.revenue_interval || undefined,
          contract_start_date: importForm.contract_start_date || undefined,
          contract_end_date: importForm.contract_end_date || undefined,
        },
      });
      if (error) throw new Error(error.message || "Import fejlede");
      if (!data?.ok) {
        if (data?.reason === "invitation_already_exists") {
          toast.warning("Der er allerede en aktiv invitation på denne email", {
            description: "Founder har allerede modtaget en invitationsmail.",
          });
          resetImportDialog();
          return;
        }
        if (data?.reason === "user_already_exists") {
          setAttachEmail(importForm.email);
          setShowAttachUser(true);
          return;
        }
        throw new Error(data?.error || "Import fejlede");
      }
      if (data.reused_company) {
        toast.success("Virksomheden findes allerede — ny invitation sendt", {
          description: `Invitation sendt til ${importForm.email} for ${data.company_name}`,
        });
      } else {
        toast.success("Ansøgning importeret ✓", {
          description: `${data.company_name} er oprettet og invitation sendt til ${importForm.email}`,
        });
      }
      resetImportDialog();
      refetchMembers();
    } catch (err: any) {
      toast.error("Import fejlede", { description: err.message });
    } finally {
      setImporting(false);
    }
  };

  const handleRenameCompany = async () => {
    if (!renamingCompany || !renameValue.trim()) return;
    setRenameSaving(true);
    const { error } = await (supabase
      .from("companies")
      .update({ name: renameValue.trim() }) as any)
      .eq("id", renamingCompany.id);
    setRenameSaving(false);
    if (error) {
      toast.error("Kunne ikke omdøbe virksomheden.");
      return;
    }
    toast.success(`Virksomheden hedder nu "${renameValue.trim()}"`);
    setRenamingCompany(null);
    setRenameValue("");
    refetchMembers();
  };

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
      refetchMembers();
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
          signup_url: `https://app.theboardroom.dk/auth?mode=signup${tokenParam}`,
        },
      });
      if (error) throw error;
      toast.success(`Invitation ${company.invitationStatus === 'accepted' ? 'nulstillet og ' : ''}gensendt til ${company.invitationEmail}`);
      refetchMembers();
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
          signup_url: `https://app.theboardroom.dk/auth?mode=signup&invite=${inv.token}`,
        },
      });
      if (error) throw error;
      toast.success(`Invitation gensendt til ${inv.email}`);
      refetchMembers();
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
    const profileMapLocal = new Map((allProfiles || []).map((p: any) => [p.user_id, p.full_name]));
    const users: UnassignedUser[] = (allMemberships || [])
      .filter((m: any) => m.company_id !== company.id)
      .map((m: any) => ({
        user_id: m.user_id,
        full_name: profileMapLocal.get(m.user_id) || "Ukendt",
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
        supabase.from("financial_report_facts").update({ company_id: mergeTargetCompany.id } as any).eq("company_id", targetUser.company_id),
        supabase.from("pulse_checkins").update({ company_id: mergeTargetCompany.id } as any).eq("company_id", targetUser.company_id).eq("user_id", targetUser.user_id),
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
      refetchMembers();
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
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("manage-advisor", {
        body: { action: "delete-company", company_id: deleteTarget.id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`${deleteTarget.name} slettet`);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      refetchMembers();
    } catch (err: any) {
      console.error("Delete error:", err);
      toast.error("Kunne ikke slette: " + (err.message || "Ukendt fejl"));
    } finally {
      setDeleting(false);
    }
  };

  const industries = useMemo(() => {
    const set = new Set(companies.map((c) => c.industry_label).filter(Boolean));
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
          signup_url: `https://app.theboardroom.dk/auth?mode=signup${tokenParam}`,
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
      refetchMembers();
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
      result = result.filter((c) => c.industry_label === filterIndustry);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.industry_label?.toLowerCase().includes(q) ||
          c.cvr_number?.toLowerCase().includes(q) ||
          c.contact_email?.toLowerCase().includes(q) ||
          c.members?.some((m: any) => m.full_name?.toLowerCase().includes(q))
      );
    }
    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = (a.name || "").localeCompare(b.name || "", "da");
      else if (sortKey === "reportCount") cmp = a.reportCount - b.reportCount;
      else if (sortKey === "latest_report") cmp = (a.latestReportPeriod || "").localeCompare(b.latestReportPeriod || "");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [companies, search, sortKey, sortDir, filterIndustry]);

  const groupedView = useMemo(() => {
    const standaloneCompanies = filtered.filter(c => !groupInfoMap.has(c.id));
    const groupMap = new Map<string, {
      groupId: string; groupName: string;
      anchorCompany: CompanyData | null; subCompanies: CompanyData[];
    }>();
    for (const c of filtered) {
      const info = groupInfoMap.get(c.id);
      if (!info) continue;
      if (!groupMap.has(info.groupId)) {
        groupMap.set(info.groupId, { groupId: info.groupId, groupName: info.groupName, anchorCompany: null, subCompanies: [] });
      }
      const group = groupMap.get(info.groupId)!;
      if (info.isAnchor) group.anchorCompany = c;
      else group.subCompanies.push(c);
    }
    return { standaloneCompanies, groups: [...groupMap.values()] };
  }, [filtered, groupInfoMap]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

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
    let active = 0, inactive = 0, never = 0;
    companies.forEach((c) => {
      (c.members || []).forEach((m) => {
        const info = c.loginInfo.get(m.user_id);
        if (!info || !info.lastLogin) never++;
        else if (new Date(info.lastLogin) >= sevenDaysAgo) active++;
        else inactive++;
      });
    });
    return { active, inactive, never };
  }, [companies]);

  const onboardingFunnel = useMemo(() => {
    const notInvited: CompanyData[] = [];
    const invitedPending: CompanyData[] = [];
    const activatedNoReport: CompanyData[] = [];
    const reportedNotCommitted: CompanyData[] = [];
    const fullyOnboarded: CompanyData[] = [];
    companies.forEach(c => {
      const hasMembers = c.members.length > 0;
      const hasReport = c.reportCount > 0;
      const hasCommitted = c.committedCount > 0;
      if (!hasMembers && c.invitationStatus === null) notInvited.push(c);
      else if (!hasMembers && c.invitationStatus === 'pending') invitedPending.push(c);
      else if (hasMembers && !hasReport) activatedNoReport.push(c);
      else if (hasReport && !hasCommitted) reportedNotCommitted.push(c);
      else if (hasCommitted) fullyOnboarded.push(c);
    });
    return { notInvited, invitedPending, activatedNoReport, reportedNotCommitted, fullyOnboarded };
  }, [companies, standalonePendingInvitations]);

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
          {isAdvisor && (
            <button
              onClick={() => setShowImportDialog(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/50 transition-colors"
            >
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Importér ansøgning</span>
              <span className="sm:hidden">Importér</span>
            </button>
          )}
          <Button onClick={() => setStandaloneInviteOpen(true)} className="gap-2" size="sm">
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Inviter ny bruger</span>
            <span className="sm:hidden">Inviter</span>
          </Button>
        </div>
      </div>

      <MembersStatsBar
        totalCompanies={totalCompanies}
        totalMembers={totalMembers}
        totalUnread={totalUnread}
        companiesWithReports={companiesWithReports}
        loginStats={loginStats}
      />

      <MembersOnboardingFunnel
        onboardingFunnel={onboardingFunnel}
        totalCompanies={totalCompanies}
        standalonePendingCount={standalonePendingInvitations.length}
        onSearchCompany={(name) => setSearch(name)}
      />

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
        <div className="hidden sm:grid grid-cols-[2fr_0.8fr_0.8fr_0.8fr_0.5fr] gap-3 px-5 py-2 bg-secondary/50 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
          <button onClick={() => toggleSort("name")} className="flex items-center gap-1 text-left hover:text-foreground transition-colors">
            Virksomhed <ArrowUpDown className="h-3 w-3" />
          </button>
          <button onClick={() => toggleSort("latest_report")} className="flex items-center gap-1 text-left hover:text-foreground transition-colors">
            Seneste rapport <ArrowUpDown className="h-3 w-3" />
          </button>
          <span>Pulse</span>
          <span>Chat</span>
          <button onClick={() => toggleSort("reportCount")} className="flex items-center gap-1 text-left hover:text-foreground transition-colors">
            Status <ArrowUpDown className="h-3 w-3" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (groupedView.standaloneCompanies.length === 0 && groupedView.groups.length === 0) ? (
          <div className="text-center py-16">
            <Building2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {search ? "Ingen virksomheder matcher søgningen" : "Ingen virksomheder endnu"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {groupedView.standaloneCompanies.map((c) => (
              <MemberCompanyRow
                key={c.id}
                company={c}
                isExpanded={expandedId === c.id}
                onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                isAdmin={!!isAdmin}
                isAdvisor={!!isAdvisor}
                groupInfoMap={groupInfoMap}
                groupedCompanyIds={groupedCompanyIds}
                resendingInvitation={resendingInvitation}
                removingMember={removingMember}
                onRename={(id, name) => { setRenamingCompany({ id, currentName: name }); setRenameValue(name); }}
                onInvite={(companyId, email) => { setStandaloneCompanyId(companyId); setStandaloneEmail(email); setStandaloneName(""); setStandaloneInviteOpen(true); }}
                onOpenMerge={openMergeDialog}
                onResendInvitation={handleResendInvitation}
                onRemoveMember={handleRemoveMember}
                onDelete={(c) => { setDeleteTarget(c); setDeleteDialogOpen(true); }}
                onCreateGroup={(id, name) => { setWizardAnchor({ id, name }); setWizardOpen(true); }}
                getDisplayRevenue={getDisplayRevenue}
                getInitials={getInitials}
              />
            ))}

            {/* Group / Koncern consolidated rows */}
            {groupedView.groups.map(group => {
              const groupExpandKey = `group_${group.groupId}`;
              const isGroupExpanded = expandedId === groupExpandKey;
              const allCompanies = [group.anchorCompany, ...group.subCompanies].filter(Boolean) as CompanyData[];
              const totalReports = allCompanies.reduce((s, c) => s + c.reportCount, 0);
              const groupTotalMembers = allCompanies.reduce((s, c) => s + c.members.length, 0);
              return (
                <div key={group.groupId} className="border-b border-border/50">
                  <button
                    onClick={() => setExpandedId(isGroupExpanded ? null : groupExpandKey)}
                    className="w-full text-left hover:bg-secondary/30 transition-colors focus:outline-none"
                  >
                    <div className="hidden sm:grid grid-cols-[2fr_0.8fr_0.8fr_0.8fr_0.5fr] gap-3 px-5 py-3 items-center">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Layers className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground truncate">{group.groupName}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold shrink-0">Koncern</span>
                            {isAdmin && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setAddToGroupTarget({ groupId: group.groupId, groupName: group.groupName }); }}
                                className="text-[10px] px-1.5 py-0.5 rounded border border-primary/20 text-primary hover:bg-primary/10 transition-colors shrink-0"
                              >
                                + Tilføj
                              </button>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {allCompanies.length} selskaber · {groupTotalMembers} brugere
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">{totalReports} rap.</span>
                      <span className="text-xs text-muted-foreground">—</span>
                      <span className="text-xs text-muted-foreground">—</span>
                      <div className="flex items-center justify-end">
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isGroupExpanded ? "rotate-180" : ""}`} />
                      </div>
                    </div>
                    <div className="sm:hidden flex items-center gap-3 px-5 py-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Layers className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground truncate">{group.groupName}</p>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">Koncern</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{allCompanies.length} selskaber · {totalReports} rapporter</p>
                      </div>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isGroupExpanded ? "rotate-180" : ""}`} />
                    </div>
                  </button>

                  {isGroupExpanded && (
                    <div className="bg-secondary/10 divide-y divide-border/30">
                      {allCompanies.map(c => (
                        <div key={c.id} className="px-5 py-2.5 flex items-center gap-3 pl-8 sm:pl-12 group/subrow hover:bg-secondary/20 transition-colors">
                          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                            {c.logo_url ? (
                              <img src={c.logo_url} alt={c.name} className="h-full w-full object-contain" />
                            ) : (
                              <span className="text-[10px] font-semibold text-primary">{getInitials(c.name)}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm text-foreground truncate">{c.name}</p>
                              {groupInfoMap.get(c.id)?.isAnchor && (
                                <span className="text-[8px] px-1 py-0.5 rounded bg-primary/10 text-primary font-semibold">Anchor</span>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); setRenamingCompany({ id: c.id, currentName: c.name }); setRenameValue(c.name); }}
                                className="opacity-0 group-hover/subrow:opacity-100 transition-opacity p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0"
                                title="Omdøb virksomhed"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {c.reportCount} rapporter · {c.members.length} brugere
                              {c.industry_label && ` · ${c.industry_label}`}
                            </p>
                          </div>
                          {c.members.length > 0 && (
                            <Link
                              to={`/members/${c.members[0].user_id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
                            >
                              Se data
                            </Link>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="px-5 py-3 bg-secondary/30 border-t border-border text-xs text-muted-foreground">
          Viser {groupedView.standaloneCompanies.length} virksomheder + {groupedView.groups.length} koncerner af {companies.length} total
        </div>
      </div>

      {legatCompanyIds.size > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Legatforløb</span>
            <span className="text-xs text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full">{legatCompanyIds.size} aktive</span>
          </div>
          <div className="rounded-xl border border-primary/10 bg-primary/5 divide-y divide-border/30">
            {legatCompanies.map((company: any) => {
              const member = allMembersRaw.find((m: any) => m.company_id === company.id);
              const profile = member ? allProfilesRaw.find((p: any) => p.user_id === member.user_id) : null;
              return (
                <div key={company.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                    {(profile?.full_name || company.name || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{profile?.full_name || "Ukendt"}</p>
                    <p className="text-xs text-muted-foreground truncate">{company.name}</p>
                  </div>
                  <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">Legat</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <MembersAdminSection
        isAdmin={!!isAdmin}
        acceptedCount={acceptedCount}
        pendingCount={pendingCount}
        notInvitedCount={notInvitedCount}
        companies={companies}
        standalonePendingInvitations={standalonePendingInvitations}
        resendingInvitation={resendingInvitation}
        onResendInvitation={handleResendInvitation}
        onResendStandaloneInvitation={handleResendStandaloneInvitation}
        onReload={() => refetchMembers()}
      />

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
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Annullér</Button>
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
              <input type="text" value={standaloneName} onChange={(e) => setStandaloneName(e.target.value)} placeholder="F.eks. Jeppe Chris" className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">E-mail *</label>
              <input type="email" value={standaloneEmail} onChange={(e) => setStandaloneEmail(e.target.value)} placeholder="email@virksomhed.dk" required className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tilknyt virksomhed (valgfrit)</label>
              <select value={standaloneCompanyId} onChange={(e) => setStandaloneCompanyId(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">Ingen — opretter selv virksomhed</option>
                {companies.slice().sort((a, b) => a.name.localeCompare(b.name, "da")).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              {standaloneCompanyId ? "Personen tilknyttes automatisk den valgte virksomhed ved tilmelding." : "Personen opretter selv en ny virksomhed ved tilmelding."}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStandaloneInviteOpen(false)} disabled={standaloneSending}>Annuller</Button>
            <Button onClick={handleStandaloneInvite} disabled={standaloneSending || !standaloneEmail.trim()}>
              {standaloneSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
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
          onCreated={() => refetchMembers()}
        />
      )}

      {addToGroupTarget && (
        <AddCompanyToGroupDialog
          open={!!addToGroupTarget}
          onOpenChange={(val) => { if (!val) setAddToGroupTarget(null); }}
          groupId={addToGroupTarget.groupId}
          groupName={addToGroupTarget.groupName}
          allCompanies={companies.map((c) => ({
            id: c.id, name: c.name,
            members: c.members.map((m) => ({ user_id: m.user_id, full_name: m.full_name, role: m.role })),
          }))}
          groupedCompanyIds={groupedCompanyIds}
          onSuccess={() => refetchMembers()}
        />
      )}

      {/* Rename company dialog */}
      <Dialog open={!!renamingCompany} onOpenChange={(open) => { if (!open) setRenamingCompany(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Omdøb virksomhed</DialogTitle>
            <DialogDescription>Nuværende navn: {renamingCompany?.currentName}</DialogDescription>
          </DialogHeader>
          <input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleRenameCompany(); }}
            placeholder="Nyt virksomhedsnavn"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            autoFocus
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRenamingCompany(null)}>Annuller</Button>
            <Button onClick={handleRenameCompany} disabled={renameSaving || !renameValue.trim()}>
              {renameSaving ? "Gemmer..." : "Gem navn"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showImportDialog && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl my-8">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Importér ansøgning</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Opretter virksomhed, slår CVR op og sender invitationsmail automatisk
                  </p>
                </div>
                <button onClick={resetImportDialog} className="text-muted-foreground hover:text-foreground">✕</button>
              </div>

              {!parsed ? (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (!file) return;
                    setParsing(true);
                    try {
                      const result = await parseApplicationExcel(file);
                      setImportForm(f => ({ ...f, ...result }));
                      setParsed(true);
                    } catch (err: any) {
                      toast.error("Kunne ikke læse filen", { description: err.message });
                    } finally {
                      setParsing(false);
                    }
                  }}
                  onClick={() => document.getElementById("excel-upload")?.click()}
                  className="border-2 border-dashed border-border rounded-xl p-12 flex flex-col items-center justify-center text-center cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors"
                >
                  <input
                    id="excel-upload"
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setParsing(true);
                      try {
                        const result = await parseApplicationExcel(file);
                        setImportForm(f => ({ ...f, ...result }));
                        setParsed(true);
                      } catch (err: any) {
                        toast.error("Kunne ikke læse filen", { description: err.message });
                      } finally {
                        setParsing(false);
                      }
                    }}
                  />
                  {parsing ? (
                    <>
                      <Loader2 className="h-10 w-10 text-muted-foreground animate-spin mb-3" />
                      <p className="text-sm font-medium text-foreground">Læser fil...</p>
                    </>
                  ) : (
                    <>
                      <Upload className="h-10 w-10 text-muted-foreground mb-3" />
                      <p className="text-sm font-medium text-foreground">Træk ansøgnings-Excel hertil</p>
                      <p className="text-xs text-muted-foreground mt-1">eller klik for at vælge fil · .xlsx fra Monday.com</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-foreground bg-accent/30 border border-border rounded-lg px-3 py-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Ansøgning læst — gennemgå og ret hvis nødvendigt
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Email *</label>
                      <input value={importForm.email} onChange={e => setImportForm(f => ({ ...f, email: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Virksomhedsnavn *</label>
                      <input value={importForm.company_name} onChange={e => setImportForm(f => ({ ...f, company_name: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">CVR-nummer</label>
                      <input value={importForm.cvr_number} onChange={e => setImportForm(f => ({ ...f, cvr_number: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Kontaktperson</label>
                      <input value={importForm.contact_name} onChange={e => setImportForm(f => ({ ...f, contact_name: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Årlig omsætning (kr.)</label>
                      <input value={importForm.annual_revenue} onChange={e => setImportForm(f => ({ ...f, annual_revenue: e.target.value }))} type="number" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Branche</label>
                      <input value={importForm.industry_label} onChange={e => setImportForm(f => ({ ...f, industry_label: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Kontraktstart</label>
                      <input value={importForm.contract_start_date} onChange={e => setImportForm(f => ({ ...f, contract_start_date: e.target.value }))} type="date" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Kontraktslut <span className="text-destructive">*</span>
                      </label>
                      <input value={importForm.contract_end_date} onChange={e => setImportForm(f => ({ ...f, contract_end_date: e.target.value }))} type="date" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Nuværende situation</label>
                      <textarea value={importForm.current_situation} onChange={e => setImportForm(f => ({ ...f, current_situation: e.target.value }))} rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Mål med virksomheden</label>
                      <textarea value={importForm.goals} onChange={e => setImportForm(f => ({ ...f, goals: e.target.value }))} rows={2} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Hvilken hjælp søges?</label>
                      <textarea value={importForm.help_needed} onChange={e => setImportForm(f => ({ ...f, help_needed: e.target.value }))} rows={2} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none" />
                    </div>
                  </div>

                  <button
                    onClick={() => { setParsed(false); setImportForm({ email: "", company_name: "", cvr_number: "", contact_name: "", annual_revenue: "", revenue_interval: "", industry_label: "", current_situation: "", goals: "", help_needed: "", website: "", phone: "", contract_start_date: "", contract_end_date: "" }); }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ← Upload anden fil
                  </button>
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
                <button onClick={resetImportDialog} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Annullér</button>
                <button
                  onClick={handleImport}
                  disabled={importing || !parsed || !importForm.email || !importForm.company_name}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {importing ? "Importerer..." : "Importér og send invitation"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default Members;
