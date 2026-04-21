import { Link } from "react-router-dom";
import {
  Building2, MessageCircle, MessageSquare, FileText,
  ChevronDown, ChevronUp, Users, Globe, MapPin, User,
  Mail, Phone, Wallet, ExternalLink, Hash, Trash2,
  UserPlus, X, Activity, Send, RotateCcw, CheckCircle2,
  Loader2, Layers, Pencil, CalendarDays,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogContent,
  AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import type { CompanyData, CompanyMember, LoginInfo } from "./types";

interface MemberCompanyRowProps {
  company: CompanyData;
  isExpanded: boolean;
  onToggle: () => void;
  isAdmin: boolean;
  isAdvisor: boolean;
  groupInfoMap: Map<string, { groupName: string; groupId: string; isAnchor: boolean }>;
  groupedCompanyIds: Set<string>;
  resendingInvitation: string | null;
  removingMember: string | null;
  onRename: (id: string, currentName: string) => void;
  onInvite: (companyId: string, email: string) => void;
  onOpenMerge: (company: CompanyData) => void;
  onResendInvitation: (company: CompanyData) => void;
  onRemoveMember: (company: CompanyData, member: CompanyMember) => void;
  onDelete: (company: CompanyData) => void;
  onCreateGroup: (id: string, name: string) => void;
  onEnrich?: (companyId: string) => void;
  getDisplayRevenue: (c: CompanyData) => { value: number; source: string } | null;
  getInitials: (name: string) => string;
}

const MemberCompanyRow = ({
  company: c,
  isExpanded,
  onToggle,
  isAdmin,
  isAdvisor,
  groupInfoMap,
  groupedCompanyIds,
  resendingInvitation,
  removingMember,
  onRename,
  onInvite,
  onOpenMerge,
  onResendInvitation,
  onRemoveMember,
  onDelete,
  onCreateGroup,
  onEnrich,
  getDisplayRevenue,
  getInitials,
}: MemberCompanyRowProps) => {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full text-left hover:bg-secondary/30 transition-colors focus:outline-none"
      >
        {/* Desktop row */}
        <div className="hidden sm:grid grid-cols-[2fr_0.8fr_0.8fr_0.8fr_0.5fr] gap-3 px-5 py-3 items-center">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {c.logo_url ? (
                <img src={c.logo_url} alt={c.name} className="h-full w-full object-contain" />
              ) : (
                <span className="text-xs font-semibold text-primary">{getInitials(c.name)}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 group/name">
                <span className="text-sm font-medium text-foreground truncate">{c.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onRename(c.id, c.name); }}
                  className="opacity-0 group-hover/name:opacity-100 transition-opacity p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0"
                  title="Omdøb virksomhed"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                {(c.name.toLowerCase().endsWith("s virksomhed") || c.name.toLowerCase() === "ny bruger") && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium shrink-0">
                    Ret navn
                  </span>
                )}
                {c.invitationStatus === 'pending' && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-chart-warning/15 text-chart-warning text-[10px] font-semibold whitespace-nowrap">
                    <Send className="h-2.5 w-2.5" /> Afventer
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-muted-foreground">
                  {c.members.length} {c.members.length === 1 ? "bruger" : "brugere"}
                  {c.slack_channel && (
                    <span className="ml-2 text-primary"><Hash className="h-2.5 w-2.5 inline" />{c.slack_channel}</span>
                  )}
                </span>
                {(() => {
                  const tier = c.membershipTier;
                  if (tier === "full") return (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                      {c.contract_end_date ? `til ${format(new Date(c.contract_end_date), "MMM yyyy", { locale: da })}` : "Fuldt"}
                    </span>
                  );
                  if (tier === "subscriber") return (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">Abonnent</span>
                  );
                  if (tier === "expired") return (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">Udløbet</span>
                  );
                  if (tier === "no_date") return (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">Ingen slutdato</span>
                  );
                  return null;
                })()}
              </div>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-foreground">
              {c.latestReportPeriod || "—"}
            </span>
            {c.committedCount > 0 && (
              <span className="text-[10px] text-primary">
                {c.committedCount} committed
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`h-2 w-2 rounded-full ${
              c.hasPulseThisMonth ? "bg-emerald-500" : "bg-muted-foreground/30"
            }`} />
            <span className="text-xs text-muted-foreground">
              {c.hasPulseThisMonth ? "Udfyldt" : "Mangler"}
            </span>
          </div>
          <div>
            {c.unreadCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-chart-warning">
                <MessageSquare className="h-3 w-3" />
                {c.unreadCount}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`h-2 w-2 rounded-full ${
              c.committedCount > 0 && c.hasPulseThisMonth ? "bg-emerald-500" :
              c.reportCount === 0 ? "bg-muted-foreground/30" :
              "bg-amber-400"
            }`} title={
              c.committedCount > 0 && c.hasPulseThisMonth ? "Klar til session" :
              c.reportCount === 0 ? "Ingen rapport" :
              "Delvist klar"
            } />
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
            <div className="flex items-center gap-2 group/name">
              <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
              <button
                onClick={(e) => { e.stopPropagation(); onRename(c.id, c.name); }}
                className="opacity-0 group-hover/name:opacity-100 transition-opacity p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0"
                title="Omdøb virksomhed"
              >
                <Pencil className="h-3 w-3" />
              </button>
              {(c.name.toLowerCase().endsWith("s virksomhed") || c.name.toLowerCase() === "ny bruger") && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium shrink-0">
                  Ret navn
                </span>
              )}
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
              <p className="text-xs text-muted-foreground truncate">{c.industry_label || "–"}</p>
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
        <div className="px-5 pb-4 pt-2 bg-secondary/20 border-t border-border/30 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* ── KOLONNE 1: Kontakt & Team ── */}
            <div className="space-y-3">
              {/* Kontakt */}
              <div className="rounded-lg bg-background/50 border border-border/50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Kontakt</span>
                </div>
                {c.contact_person && <p className="text-sm font-medium text-foreground">{c.contact_person}</p>}
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
                    <Globe className="h-3 w-3" /> Hjemmeside <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
                {c.cvr_number && <p className="text-xs text-muted-foreground mt-1">CVR: {c.cvr_number}</p>}
                {c.slack_channel && (
                  <p className="text-xs text-primary flex items-center gap-1 mt-1 font-medium">
                    <Hash className="h-3 w-3" /> {c.slack_channel}
                  </p>
                )}
                {(() => {
                  const rev = getDisplayRevenue(c);
                  if (!rev) return null;
                  return (
                    <p className="text-xs text-foreground font-medium flex items-center gap-1 mt-2">
                      <Wallet className="h-3 w-3 text-primary" /> {rev.value.toLocaleString("da-DK")} DKK
                      <span className="text-[9px] text-muted-foreground font-normal">({rev.source})</span>
                    </p>
                  );
                })()}
                {isAdmin && c.invitationStatus && (
                  <div className="mt-3 pt-2 border-t border-border/30">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Send className="h-3 w-3" /> Invitation
                    </p>
                    {c.invitationStatus === 'pending' ? (
                      <>
                        <p className="text-xs text-muted-foreground">{c.invitationEmail}</p>
                        <p className="text-xs text-chart-warning mt-0.5">Afventer svar</p>
                      </>
                    ) : c.invitationStatus === 'accepted' && c.invitationAcceptedAt ? (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Accepteret{c.members.length > 0 ? ` af ${c.members[0].full_name}` : ""}
                        </p>
                        <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                          {format(new Date(c.invitationAcceptedAt), "d. MMM yyyy", { locale: da })}
                        </p>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
              {/* Team */}
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
                      onClick={(e) => { e.stopPropagation(); onInvite(c.id, c.contact_email || ""); }}
                      className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
                    >
                      <Send className="h-3 w-3" /> Inviter
                    </button>
                    {isAdmin && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onOpenMerge(c); }}
                        className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
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
                                  Sidst aktiv {format(new Date(login.lastLogin!), "d. MMM yyyy", { locale: da })}{login.loginCount ? ` · ${login.loginCount} logins` : ""}
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
                                  onClick={() => onRemoveMember(c, m)}
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
            </div>

            {/* ── KOLONNE 2: Kontrakt & Membership ── */}
            <div className="rounded-lg bg-background/50 border border-border/50 p-3 h-fit">
              <div className="flex items-center gap-2 mb-3">
                <CalendarDays className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Kontrakt & Membership</span>
              </div>
              {/* Tier badge */}
              <div className="mb-3">
                {c.membershipTier === "full" && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Fuldt medlem
                  </span>
                )}
                {c.membershipTier === "subscriber" && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500" /> Selvbetjeningsabonnement
                  </span>
                )}
                {c.membershipTier === "expired" && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-destructive/10 text-destructive">
                    <div className="h-1.5 w-1.5 rounded-full bg-destructive" /> Udløbet
                  </span>
                )}
                {c.membershipTier === "no_date" && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Ingen slutdato sat
                  </span>
                )}
              </div>
              {/* Contract dates */}
              <div className="space-y-2">
                {c.contract_start_date && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Kontraktstart</p>
                    <p className="text-xs text-foreground mt-0.5">
                      {format(new Date(c.contract_start_date), "d. MMM yyyy", { locale: da })}
                    </p>
                  </div>
                )}
                {c.contract_end_date && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Kontraktslut</p>
                    <p className={`text-xs font-medium mt-0.5 ${new Date(c.contract_end_date) < new Date() ? "text-destructive" : "text-foreground"}`}>
                      {format(new Date(c.contract_end_date), "d. MMM yyyy", { locale: da })}
                    </p>
                  </div>
                )}
                {c.subscription_status && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Abonnement</p>
                    <p className="text-xs text-foreground mt-0.5 capitalize">{c.subscription_status}</p>
                  </div>
                )}
                {!c.contract_start_date && !c.contract_end_date && !c.subscription_status && (
                  <p className="text-xs text-muted-foreground italic">Ingen kontraktdata registreret</p>
                )}
              </div>
              {/* Enrich button */}
              {onEnrich && (
                <div className="mt-3 pt-3 border-t border-border/30">
                  <button
                    onClick={(e) => { e.stopPropagation(); onEnrich(c.id); }}
                    className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                  >
                    <FileText className="h-3 w-3" /> Berig med ansøgning
                  </button>
                </div>
              )}
            </div>
            {/* ── KOLONNE 3: Aktivitet & Handlinger ── */}
            <div className="rounded-lg bg-background/50 border border-border/50 p-3 flex flex-col justify-between h-fit">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Aktivitet</span>
                </div>
                {/* Reports */}
                <div className="space-y-1.5 mb-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {c.reportCount} {c.reportCount === 1 ? "periode" : "perioder"} leveret
                      {c.latestReportPeriod && (
                        <span className="text-muted-foreground font-normal ml-1.5">
                          · seneste: {c.latestReportPeriod}
                        </span>
                      )}
                    </p>
                    {c.committedCount > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        {c.committedCount} godkendt
                      </span>
                    )}
                  </div>
                  {c.unreadCount > 0 && (
                    <p className="text-xs text-chart-warning font-semibold flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> {c.unreadCount} ubesvarede beskeder
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className={`h-2 w-2 rounded-full ${c.hasPulseThisMonth ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                    <span className="text-xs text-muted-foreground">
                      Pulse {c.hasPulseThisMonth ? "udfyldt" : "mangler"} denne måned
                    </span>
                  </div>
                </div>
              </div>
              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-3 border-t border-border/30">
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
                    onClick={(e) => { e.stopPropagation(); onResendInvitation(c); }}
                    disabled={resendingInvitation === c.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-medium hover:bg-secondary/80 transition-colors border border-border disabled:opacity-50"
                  >
                    {resendingInvitation === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Gensend invitation
                  </button>
                )}
                {isAdmin && c.invitationEmail && c.invitationStatus === 'accepted' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onResendInvitation(c); }}
                    disabled={resendingInvitation === c.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-chart-warning/10 text-chart-warning text-xs font-medium hover:bg-chart-warning/20 transition-colors border border-chart-warning/30 disabled:opacity-50"
                  >
                    {resendingInvitation === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Nulstil & gensend
                  </button>
                )}
                {isAdmin && !groupedCompanyIds.has(c.id) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onCreateGroup(c.id, c.name); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors border border-primary/30"
                  >
                    <Layers className="h-3 w-3" /> Gør til koncern
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(c); }}
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
};

export default MemberCompanyRow;