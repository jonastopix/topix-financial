import type { CompanyData } from "./types";

interface OnboardingFunnel {
  notInvited: CompanyData[];
  invitedPending: CompanyData[];
  activatedNoReport: CompanyData[];
  reportedNotCommitted: CompanyData[];
  fullyOnboarded: CompanyData[];
}

interface MembersOnboardingFunnelProps {
  onboardingFunnel: OnboardingFunnel;
  totalCompanies: number;
  standalonePendingCount: number;
  onSearchCompany: (name: string) => void;
}

const MembersOnboardingFunnel = ({
  onboardingFunnel,
  totalCompanies,
  standalonePendingCount,
  onSearchCompany,
}: MembersOnboardingFunnelProps) => {
  const stages = [
    {
      label: "Ikke inviteret",
      count: onboardingFunnel.notInvited.length,
      companies: onboardingFunnel.notInvited,
      color: "bg-muted text-muted-foreground",
      dot: "bg-muted-foreground",
      action: "Send invitation",
    },
    {
      label: "Inviteret",
      count: onboardingFunnel.invitedPending.length + standalonePendingCount,
      companies: onboardingFunnel.invitedPending,
      color: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
      dot: "bg-amber-400",
      action: standalonePendingCount > 0
        ? `Afventer accept · ${standalonePendingCount} uden virksomhed`
        : "Afventer accept",
    },
    {
      label: "Aktiveret",
      count: onboardingFunnel.activatedNoReport.length,
      companies: onboardingFunnel.activatedNoReport,
      color: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
      dot: "bg-blue-400",
      action: "Ingen rapport endnu",
    },
    {
      label: "Rapporteret",
      count: onboardingFunnel.reportedNotCommitted.length,
      companies: onboardingFunnel.reportedNotCommitted,
      color: "bg-primary/10 text-primary",
      dot: "bg-primary",
      action: "Ikke committed",
    },
    {
      label: "Klar",
      count: onboardingFunnel.fullyOnboarded.length,
      companies: onboardingFunnel.fullyOnboarded,
      color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      dot: "bg-emerald-500",
      action: "Fuldt onboardet",
    },
  ];

  return (
    <div className="glass-card rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Onboarding-tragt
        </h3>
        <span className="text-[10px] text-muted-foreground">
          {onboardingFunnel.fullyOnboarded.length}/{totalCompanies} fuldt onboardet
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {stages.map((stage) => (
          <div key={stage.label} className={`rounded-lg p-2.5 ${stage.count > 0 ? stage.color : "bg-muted/30 text-muted-foreground"}`}>
            <div className="flex items-center gap-1.5 mb-1">
              <div className={`h-2 w-2 rounded-full flex-shrink-0 ${stage.count > 0 ? stage.dot : "bg-muted-foreground/30"}`} />
              <span className="text-[10px] font-semibold uppercase tracking-wider truncate">
                {stage.label}
              </span>
            </div>
            <p className="text-xl font-display font-bold leading-none mb-1">
              {stage.count}
            </p>
            <p className="text-[10px] opacity-70 leading-tight">
              {stage.action}
            </p>
            {stage.count > 0 && stage.companies.slice(0, 3).map(c => (
              <button
                key={c.id}
                onClick={() => onSearchCompany(c.name)}
                className="mt-1 block w-full text-left text-[10px] truncate underline-offset-2 hover:underline opacity-80"
                title={c.name}
              >
                {c.name}
              </button>
            ))}
            {stage.count > 3 && (
              <p className="text-[10px] opacity-50 mt-0.5">
                +{stage.count - 3} flere
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MembersOnboardingFunnel;
