import { Activity, User } from "lucide-react";

interface MembersStatsBarProps {
  totalCompanies: number;
  totalMembers: number;
  totalUnread: number;
  companiesWithReports: number;
  loginStats: { active: number; inactive: number; never: number };
  companiesNoEndDate: number;
  companiesExpired: number;
}

const MembersStatsBar = ({
  totalCompanies,
  totalMembers,
  totalUnread,
  companiesWithReports,
  loginStats,
  companiesNoEndDate,
  companiesExpired,
}: MembersStatsBarProps) => {
  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
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
        <div className="glass-card rounded-xl p-4 text-center">
          <p className={`text-2xl font-display font-bold ${companiesNoEndDate > 0 ? "text-amber-500" : "text-foreground"}`}>
            {companiesNoEndDate}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Uden slutdato</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className={`text-2xl font-display font-bold ${companiesExpired > 0 ? "text-destructive" : "text-foreground"}`}>
            {companiesExpired}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Udløbet</p>
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
    </>
  );
};

export default MembersStatsBar;
