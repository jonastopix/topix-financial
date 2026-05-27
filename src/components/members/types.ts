export interface LoginInfo {
  lastLogin: string | null;
  loginCount: number | null;
}

export interface CompanyMember {
  user_id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
}

export interface CompanyData {
  id: string;
  name: string;
  cvr_number: string | null;
  industry_label: string;
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
  latestReportPeriod: string | null;
  committedCount: number;
  unreadCount: number;
  conversationId: string | null;
  logo_url: string | null;
  pendingInvitationEmail: string | null;
  invitationStatus: 'pending' | 'accepted' | null;
  invitationAcceptedAt: string | null;
  invitationEmail: string | null;
  loginInfo: Map<string, LoginInfo>;
  hasPulseThisMonth: boolean;
  contract_start_date: string | null;
  contract_end_date: string | null;
  subscription_status: string | null;
  membershipTier: "full" | "subscriber" | "expired" | "no_date";
  __pendingInvitations?: any[];
}

export type SortKey = "name" | "reportCount" | "latest_report";
export type SortDir = "asc" | "desc";

export interface UnassignedUser {
  user_id: string;
  full_name: string;
  company_id: string;
  company_name: string;
}
