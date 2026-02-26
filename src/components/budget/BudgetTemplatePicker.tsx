import { ChevronRight } from "lucide-react";
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

export default function BudgetTemplatePicker({ onSelect, userId, companyId, onImportComplete }: Props) {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Import options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
        <BudgetImport userId={userId} companyId={companyId} onImportComplete={onImportComplete} />
        <BudgetFromAccounts userId={userId} companyId={companyId} onImportComplete={onImportComplete} />
      </div>

      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 border-t border-border/30" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Eller vælg en skabelon</span>
        <div className="flex-1 border-t border-border/30" />
      </div>

      <div className="text-center mb-8">
        <h2 className="text-xl font-display font-bold text-foreground mb-2">Vælg en budgetskabelon</h2>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          Vælg den skabelon der passer bedst til din virksomhed. Kategorierne er tilpasset din branche — du kan altid justere bagefter.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {BUDGET_TEMPLATES.map((tmpl) => {
          const Icon = tmpl.icon;
          const groups = GROUP_ORDER.filter(g => tmpl.categories.some(c => c.group === g));

          return (
            <button
              key={tmpl.key}
              onClick={() => onSelect(tmpl)}
              className="p-5 rounded-xl border-2 border-border/30 bg-secondary/20 hover:bg-secondary/50 hover:border-primary/30 text-left transition-all group"
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
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
    </div>
  );
}
