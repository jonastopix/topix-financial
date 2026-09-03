import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Building2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { visningSomLinje } from "@/lib/hjemmebane/visningSom";

/**
 * «Du ser {virksomhed} · Tilbage til dig selv» — Hjemmebane-udgaven af
 * AppLayouts «Virksomhedsvisning: {navn} · Tilbage» (AppLayout.tsx:112-115,
 * :269-281, :321-333). Samme ADFÆRD, genbrugt: clearCompanyOverride() og
 * navigate("/") — forsiden viser så AdvisorDashboard igen, fordi companyId
 * ikke længere er sat. Samme betingelse (dommen i src/lib/hjemmebane/
 * visningSom.ts). Rører ikke override-mekanikken.
 *
 * Udtrykket er Hjemmebane: en slank linje i sage-tone over indholdet,
 * ink-soft tekst, knappen i evergreen (hb-link-farve-reglen: nye
 * handlinger i evergreen, aldrig rust). Sticky øverst i indholdskolonnen,
 * så den ses uanset hvor langt man har scrollet, uden at flytte fladen.
 */
export const HbVisningSom = () => {
  const navigate = useNavigate();
  const { isAdvisor, isCompanyOverride, companyName, clearCompanyOverride } = useAuth();
  const { viewingAsMember } = useViewMode();
  const linje = visningSomLinje({ isAdvisor, isCompanyOverride, viewingAsMember, companyName });
  if (!linje) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-30 flex shrink-0 items-center justify-center gap-2 border-b border-hb-line bg-hb-sage/40 px-4 py-2 text-sm text-hb-ink-soft"
    >
      <Building2 className="h-4 w-4 shrink-0" />
      <span className="truncate">{linje.tekst}</span>
      <span aria-hidden className="text-hb-ink/30">·</span>
      <button
        type="button"
        onClick={() => {
          clearCompanyOverride();
          navigate("/");
        }}
        className="shrink-0 font-medium text-hb-evergreen underline-offset-4 hover:underline"
      >
        {linje.knap}
      </button>
    </div>
  );
};
