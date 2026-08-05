import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  BUDGET_TEMPLATES,
  GROUP_LABELS,
  GROUP_ORDER,
  type BudgetTemplate,
} from "@/lib/budgetTemplates";
import { HbCard } from "../HbCard";
import { HbTag } from "../HbTag";

/** Skabelon-guiden i Hb-udtryk (design-blok §c2): samme 2-spørgsmåls-flow
    og samme anbefalings-dom som BudgetTemplatePicker.tsx:44-58 (ordret),
    men rolige Hb-kort i stedet for emoji-grid. Import-sporene bor i
    tilstands-rejsen udenom — guiden vælger kun skabelon. */

type GuideStep = "q1" | "q2" | "templates";

const Q1_OPTIONS = [
  { key: "produkter", label: "Produkter / varer" },
  { key: "ydelser", label: "Ydelser / services" },
  { key: "software", label: "Software / abonnement" },
  { key: "begge", label: "Produkter og ydelser" },
];

const Q2_PRODUCT = [
  { key: "online", label: "Online / webshop" },
  { key: "fysisk", label: "Fysisk butik" },
  { key: "begge", label: "Begge dele" },
];

const Q2_SERVICE = [
  { key: "b2b", label: "Andre virksomheder (B2B)" },
  { key: "b2c", label: "Private forbrugere (B2C)" },
  { key: "haandvaerk", label: "Håndværk / produktion" },
  { key: "mad_drikke", label: "Mad & drikke / serveringssted" },
];

const optionButtonClasses =
  "rounded-hb border border-hb-line bg-hb-surface px-5 py-4 text-left text-sm font-medium text-hb-ink transition-colors hover:border-hb-evergreen/50 hover:bg-hb-sage/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen/60";

export const HbBudgetTemplateGuide = ({
  onSelect,
}: {
  onSelect: (t: BudgetTemplate) => void;
}) => {
  const [guideStep, setGuideStep] = useState<GuideStep>("q1");
  const [q1Answer, setQ1Answer] = useState<string | null>(null);
  const [q2Answer, setQ2Answer] = useState<string | null>(null);

  // Anbefalings-dommen — ordret fra BudgetTemplatePicker.tsx:44-58.
  const recommendedKey = useMemo(() => {
    if (!q1Answer) return null;
    if (q1Answer === "software") return "saas_b2b";
    if (q1Answer === "produkter" || q1Answer === "begge") {
      if (q2Answer === "fysisk") return "detail_b2c";
      if (q2Answer === "online" || q2Answer === "begge") return "webshop_b2c";
    }
    if (q1Answer === "ydelser") {
      if (q2Answer === "b2b") return "service_b2b";
      if (q2Answer === "b2c") return "service_b2c";
      if (q2Answer === "haandvaerk") return "haandvaerk";
      if (q2Answer === "mad_drikke") return "restaurant_cafe";
    }
    return null;
  }, [q1Answer, q2Answer]);

  const q2Options = q1Answer === "ydelser" ? Q2_SERVICE : Q2_PRODUCT;
  const q2Title =
    q1Answer === "ydelser"
      ? "Hvem er dine primære kunder?"
      : "Sælger du primært online eller i en fysisk butik?";

  const orderedTemplates = useMemo(() => {
    if (!recommendedKey) return BUDGET_TEMPLATES;
    const recommended = BUDGET_TEMPLATES.find((t) => t.key === recommendedKey);
    if (!recommended) return BUDGET_TEMPLATES;
    return [recommended, ...BUDGET_TEMPLATES.filter((t) => t.key !== recommendedKey)];
  }, [recommendedKey]);

  if (guideStep === "q1") {
    return (
      <div>
        <p className="text-sm text-hb-ink-soft">
          To hurtige spørgsmål — så finder vi den skabelon, der passer bedst.
        </p>
        <p className="mt-4 font-editorial text-xl font-medium text-hb-ink">Hvad sælger du?</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {Q1_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={optionButtonClasses}
              onClick={() => {
                setQ1Answer(opt.key);
                setGuideStep(opt.key === "software" ? "templates" : "q2");
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (guideStep === "q2") {
    return (
      <div>
        <button
          type="button"
          className="text-sm text-hb-ink-soft underline-offset-4 hover:underline"
          onClick={() => setGuideStep("q1")}
        >
          ← Tilbage
        </button>
        <p className="mt-4 font-editorial text-xl font-medium text-hb-ink">{q2Title}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {q2Options.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={optionButtonClasses}
              onClick={() => {
                setQ2Answer(opt.key);
                setGuideStep("templates");
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        className="text-sm text-hb-ink-soft underline-offset-4 hover:underline"
        onClick={() => {
          setGuideStep("q1");
          setQ1Answer(null);
          setQ2Answer(null);
        }}
      >
        ← Start forfra
      </button>
      <p className="mt-4 font-editorial text-xl font-medium text-hb-ink">Vælg din skabelon</p>
      <p className="mt-2 text-sm text-hb-ink-soft">
        {recommendedKey
          ? "Ud fra dine svar anbefaler vi den øverste — men alle kan vælges."
          : "Vælg den skabelon, der ligner din virksomhed mest."}
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {orderedTemplates.map((tmpl) => {
          const groups = GROUP_ORDER.filter((g) => tmpl.categories.some((c) => c.group === g));
          const isRecommended = tmpl.key === recommendedKey;
          return (
            <HbCard
              key={tmpl.key}
              className={cn("p-5", isRecommended && "border-hb-evergreen/60")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-editorial text-lg font-medium text-hb-ink">{tmpl.label}</p>
                  <p className="mt-1 text-sm text-hb-ink-soft">{tmpl.description}</p>
                </div>
                {isRecommended && <HbTag className="shrink-0">Anbefalet</HbTag>}
              </div>
              <p className="mt-3 text-xs text-hb-ink-soft">
                {tmpl.categories.length} linjer · {groups.map((g) => GROUP_LABELS[g]).join(" · ")}
              </p>
              <button
                type="button"
                onClick={() => onSelect(tmpl)}
                className="mt-4 inline-flex h-9 items-center rounded-full bg-hb-evergreen px-5 text-sm font-medium text-white transition-colors hover:bg-hb-evergreen/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen/60"
              >
                Vælg {tmpl.label}
              </button>
            </HbCard>
          );
        })}
      </div>
    </div>
  );
};
