import { useState, useMemo } from "react";
import { ChevronRight, ArrowLeft, Sparkles } from "lucide-react";
import BudgetImport from "@/components/BudgetImport";
import BudgetFromAccounts from "@/components/BudgetFromAccounts";
import {
  BUDGET_TEMPLATES, GROUP_LABELS, GROUP_ORDER,
  type BudgetTemplate,
} from "@/lib/budgetTemplates";

interface Props {
  onSelect: (t: BudgetTemplate) => void;
  userId: string;
  companyId: string;
  onImportComplete: (result: any) => void;
}

type GuideStep = "q1" | "q2" | "templates";

const Q1_OPTIONS = [
  { key: "produkter", label: "Produkter / varer", emoji: "📦" },
  { key: "ydelser", label: "Ydelser / services", emoji: "🤝" },
  { key: "software", label: "Software / abonnement", emoji: "💻" },
  { key: "begge", label: "Produkter og ydelser", emoji: "🔄" },
];

const Q2_PRODUCT = [
  { key: "online", label: "Online / webshop", emoji: "🛒" },
  { key: "fysisk", label: "Fysisk butik", emoji: "🏪" },
  { key: "begge", label: "Begge dele", emoji: "🔀" },
];

const Q2_SERVICE = [
  { key: "b2b", label: "Andre virksomheder (B2B)", emoji: "🏢" },
  { key: "b2c", label: "Private forbrugere (B2C)", emoji: "👤" },
  { key: "haandvaerk", label: "Håndværk / produktion", emoji: "🔧" },
  { key: "mad_drikke", label: "Mad & drikke / serveringssted", emoji: "🍽️" },
];

export default function BudgetTemplatePicker({ onSelect, userId, companyId, onImportComplete }: Props) {
  const [guideStep, setGuideStep] = useState<GuideStep>("q1");
  const [q1Answer, setQ1Answer] = useState<string | null>(null);
  const [q2Answer, setQ2Answer] = useState<string | null>(null);

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

  const recommendedTemplate = recommendedKey
    ? BUDGET_TEMPLATES.find(t => t.key === recommendedKey)
    : null;

  const q2Options = q1Answer === "ydelser" ? Q2_SERVICE : Q2_PRODUCT;
  const q2Title = q1Answer === "ydelser"
    ? "Hvem er dine primære kunder?"
    : "Sælger du primært online eller i en fysisk butik?";

  const resetGuide = () => {
    setGuideStep("q1");
    setQ1Answer(null);
    setQ2Answer(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Import options — always visible */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
        <BudgetImport userId={userId} companyId={companyId} onImportComplete={onImportComplete} />
        <BudgetFromAccounts userId={userId} companyId={companyId} onImportComplete={onImportComplete} />
      </div>

      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 border-t border-border/30" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Eller vælg en skabelon</span>
        <div className="flex-1 border-t border-border/30" />
      </div>

      {/* STEP: Q1 */}
      {guideStep === "q1" && (
        <div className="animate-fade-in">
          <div className="text-center mb-8">
            <h2 className="text-xl font-display font-bold text-foreground mb-2">
              Lad os finde den rigtige skabelon
            </h2>
            <p className="text-sm text-muted-foreground">
              2 hurtige spørgsmål — så finder vi den bedste skabelon til dig
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto">
            {Q1_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => {
                  setQ1Answer(opt.key);
                  if (opt.key === "software") {
                    setGuideStep("templates");
                  } else {
                    setGuideStep("q2");
                  }
                }}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border/30 bg-secondary/20 hover:border-primary/50 hover:bg-primary/5 transition-all text-center"
              >
                <span style={{ fontSize: 28 }}>{opt.emoji}</span>
                <span className="text-sm font-medium text-foreground">{opt.label}</span>
              </button>
            ))}
          </div>
          <div className="text-center mt-6">
            <button
              onClick={() => setGuideStep("templates")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
            >
              Spring over — vis alle skabeloner
            </button>
          </div>
        </div>
      )}

      {/* STEP: Q2 */}
      {guideStep === "q2" && (
        <div className="animate-fade-in">
          <div className="text-center mb-8">
            <h2 className="text-xl font-display font-bold text-foreground mb-2">
              {q2Title}
            </h2>
            <p className="text-sm text-muted-foreground">
              Sidste spørgsmål — så har vi en anbefaling
            </p>
          </div>
          <div className={`grid gap-3 max-w-xl mx-auto ${q2Options.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            {q2Options.map(opt => (
              <button
                key={opt.key}
                onClick={() => {
                  setQ2Answer(opt.key);
                  setGuideStep("templates");
                }}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border/30 bg-secondary/20 hover:border-primary/50 hover:bg-primary/5 transition-all text-center"
              >
                <span style={{ fontSize: 28 }}>{opt.emoji}</span>
                <span className="text-sm font-medium text-foreground">{opt.label}</span>
              </button>
            ))}
          </div>
          <div className="text-center mt-6">
            <button
              onClick={() => { setGuideStep("q1"); setQ1Answer(null); setQ2Answer(null); }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3 w-3" /> Tilbage
            </button>
          </div>
        </div>
      )}

      {/* STEP: Templates */}
      {guideStep === "templates" && (
        <div className="animate-fade-in">
          {/* Recommendation banner */}
          {recommendedTemplate && (
            <div className="flex items-center gap-4 p-4 rounded-xl bg-primary/5 border border-primary/20 mb-6">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Vi anbefaler: {recommendedTemplate.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {recommendedTemplate.description}
                </p>
              </div>
              <button
                onClick={() => onSelect(recommendedTemplate)}
                className="shrink-0 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors inline-flex items-center gap-1"
              >
                Vælg denne <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          )}

          <div className="text-center mb-8">
            <h2 className="text-xl font-display font-bold text-foreground mb-2">Vælg en budgetskabelon</h2>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">
              {recommendedKey
                ? "Den anbefalede skabelon er fremhævet — men du kan vælge en anden."
                : "Vælg den skabelon der passer bedst til din virksomhed. Du kan altid justere bagefter."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {BUDGET_TEMPLATES.map((tmpl) => {
              const Icon = tmpl.icon;
              const isRecommended = tmpl.key === recommendedKey;
              const groups = GROUP_ORDER.filter(g => tmpl.categories.some(c => c.group === g));

              return (
                <button
                  key={tmpl.key}
                  onClick={() => onSelect(tmpl)}
                  className={`relative p-5 rounded-xl border-2 text-left transition-all group ${
                    isRecommended
                      ? "border-primary bg-primary/5 hover:bg-primary/10 ring-1 ring-primary/20"
                      : "border-border/30 bg-secondary/20 hover:bg-secondary/50 hover:border-primary/30"
                  }`}
                >
                  {isRecommended && (
                    <span className="absolute top-2 right-2 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      Anbefalet
                    </span>
                  )}
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className={`p-2 rounded-lg transition-colors ${
                      isRecommended
                        ? "bg-primary/20 text-primary"
                        : "bg-primary/10 text-primary group-hover:bg-primary/20"
                    }`}>
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-foreground">{tmpl.label}</span>
                      {tmpl.segment && (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {tmpl.segment}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{tmpl.description}</p>

                  <div className="space-y-1.5">
                    {groups.map(g => {
                      const cats = tmpl.categories.filter(c => c.group === g);
                      return (
                        <div key={g} className="flex items-start gap-1.5">
                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider min-w-[80px] pt-0.5">{GROUP_LABELS[g]?.split(" ")[0]}</span>
                          <div className="flex flex-wrap gap-1">
                            {cats.map(c => (
                              <span key={c.key} className="text-[10px] px-1.5 py-0.5 rounded bg-card border border-border/50 text-foreground/70">
                                {c.label.split(" / ")[0].split(" & ")[0]}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    Vælg skabelon <ChevronRight className="h-3 w-3" />
                  </div>
                </button>
              );
            })}
          </div>

          {q1Answer && (
            <div className="text-center mt-6">
              <button
                onClick={resetGuide}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3 w-3" /> Start forfra
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
