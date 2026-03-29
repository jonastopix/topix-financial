import { useMemo } from "react";
import { Trophy, TrendingUp, FileCheck, Heart } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { GroupCompanySummary } from "@/lib/groupDashboardUtils";
import { computeMomentumScore } from "@/lib/groupDashboardUtils";

interface GroupLeaderboardProps {
  companies: GroupCompanySummary[];
}

export default function GroupLeaderboard({ companies }: GroupLeaderboardProps) {
  const { companyId } = useAuth();

  const ranked = useMemo(() => {
    return [...companies]
      .map(c => ({ ...c, score: computeMomentumScore(c) }))
      .sort((a, b) => b.score - a.score)
      .map((c, i) => ({ ...c, rank: i + 1 }));
  }, [companies]);

  const anonymised = useMemo(() => {
    let letterIdx = 0;
    return ranked.map(c => ({
      ...c,
      displayName: c.company_id === companyId
        ? c.company_name
        : `Virksomhed ${String.fromCharCode(65 + letterIdx++)}`,
      isOwn: c.company_id === companyId,
    }));
  }, [ranked, companyId]);

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="glass-card rounded-xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          <h3 className="font-display font-semibold text-foreground">
            Momentum-leaderboard
          </h3>
        </div>
        <span className="text-xs text-muted-foreground">Denne måned</span>
      </div>

      <div className="space-y-2">
        {anonymised.map(c => (
          <div
            key={c.company_id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              c.isOwn
                ? "bg-primary/10 border border-primary/20"
                : "bg-secondary/40"
            }`}
          >
            {/* Rank */}
            <span className="text-lg w-8 text-center shrink-0">
              {c.rank <= 3 ? medals[c.rank - 1] : (
                <span className="text-sm font-medium text-muted-foreground">{c.rank}</span>
              )}
            </span>

            {/* Name */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium truncate ${c.isOwn ? "text-foreground" : "text-muted-foreground"}`}>
                  {c.displayName}
                </span>
                {c.isOwn && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">
                    dig
                  </span>
                )}
              </div>
            </div>

            {/* Score indicators */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`p-1 rounded ${!c.missing_current_period && c.has_verified_metrics ? "bg-primary/15" : "bg-muted"}`}>
                <FileCheck className={`h-3 w-3 ${!c.missing_current_period && c.has_verified_metrics ? "text-primary" : "text-muted-foreground"}`} />
              </span>
              <span className={`p-1 rounded ${c.has_pulse ? "bg-primary/15" : "bg-muted"}`}>
                <Heart className={`h-3 w-3 ${c.has_pulse ? "text-primary" : "text-muted-foreground"}`} />
              </span>
              <span className={`p-1 rounded ${(c.ebt ?? 0) > 0 ? "bg-primary/15" : "bg-muted"}`}>
                <TrendingUp className={`h-3 w-3 ${(c.ebt ?? 0) > 0 ? "text-primary" : "text-muted-foreground"}`} />
              </span>
            </div>

            {/* Score */}
            <span className="text-xs font-semibold text-foreground w-14 text-right shrink-0">
              {c.score}/100
            </span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground mt-4">
        Baseret på: rapport uploadet (40p), pulse check-in (20p), positivt resultat (20p), omsætning registreret (20p). Andre virksomheder er anonymiserede.
      </p>
    </div>
  );
}
