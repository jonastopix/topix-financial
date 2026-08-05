import * as React from "react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { computeMembershipTier } from "@/lib/membershipTier";
import { HbCard } from "./HbCard";
import { HbInput } from "./admin/HbField";

/** Hb-virksomhedsvælgeren for advisors uden company-override — PRÆCIS
    samme mekanik/datakilde som gamle AdvisorCompanyPrompt (delt query-nøgle
    "all-companies-picker", samme expired-filter fail-open, samme
    setCompanyOverride), i lyst Hb-udtryk m. søgefelt. Gamle
    AdvisorCompanyPrompt er urørt (bro for gamle flader); denne bor
    centralt i hjemmebane/ til genbrug på kommende Hb-flader. */
export const HbAdvisorCompanyPrompt = () => {
  const { isAdvisor, setCompanyOverride } = useAuth();
  const [search, setSearch] = useState("");

  const { data: companies, isLoading } = useQuery({
    queryKey: ["all-companies-picker"],
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, name, contract_end_date, subscription_status, subscription_current_period_end")
        .order("name");
      return data || [];
    },
    enabled: isAdvisor,
  });

  // Hide expired companies from the in-page picker (Reports, Handouts,
  // Milestones, KPIs). `no_date` and any undefined-tier rows fall through
  // as visible — fail open, never hide silently. Advisors can still reach
  // expired customers via AppSidebar "Se som member" (search-reveal path).
  const visibleCompanies = (companies ?? []).filter(
    (c) =>
      computeMembershipTier({
        contract_end_date: c.contract_end_date,
        subscription_status: c.subscription_status,
        subscription_current_period_end: c.subscription_current_period_end,
      }) !== "expired",
  );

  const query = search.trim().toLowerCase();
  const filtered = query
    ? visibleCompanies.filter((c) => c.name.toLowerCase().includes(query))
    : visibleCompanies;

  if (!isAdvisor) return null;

  return (
    <div className="mx-auto max-w-md py-10">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Rådgiver</p>
      <h2 className="mt-2 font-editorial text-2xl font-medium text-hb-ink">Vælg en virksomhed</h2>
      <p className="mt-2 text-sm leading-relaxed text-hb-ink-soft">
        Som rådgiver skal du vælge en virksomhed for at se data på denne side. Du kan også bruge
        "Vis som virksomhed" i menuen.
      </p>

      <HbInput
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Søg virksomhed…"
        aria-label="Søg virksomhed"
        className="mt-5 text-sm"
      />

      {isLoading ? (
        <p className="mt-4 text-sm text-hb-ink-soft">Henter…</p>
      ) : (
        <div className="mt-3 space-y-1.5">
          {filtered.map((c) => (
            <HbCard key={c.id} className="p-0">
              <button
                type="button"
                onClick={() => setCompanyOverride(c.id, c.name)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-hb px-4 py-3 text-left transition-colors hover:bg-hb-sage/25",
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-hb-sage">
                  <Building2 className="h-4 w-4 text-hb-ink" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-hb-ink">{c.name}</span>
              </button>
            </HbCard>
          ))}
          {filtered.length === 0 && (
            <p className="py-3 text-center text-sm text-hb-ink-soft">
              {query ? "Ingen virksomheder matcher søgningen." : "Ingen virksomheder fundet."}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
