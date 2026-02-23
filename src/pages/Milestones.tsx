import AppLayout from "@/components/AppLayout";
import MilestonesList from "@/components/MilestonesList";
import { Target, Plus } from "lucide-react";

const Milestones = () => {
  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
            Milestones
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sæt og følg dine vigtigste mål
          </p>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" />
          Ny milestone
        </button>
      </div>

      {/* Progress overview */}
      <div className="glass-card rounded-xl p-6 mb-6 animate-fade-in">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 rounded-xl bg-primary/10">
            <Target className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-foreground">Samlet fremgang</h3>
            <p className="text-sm text-muted-foreground">1 af 5 milestones nået</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-2xl font-display font-bold text-primary">20%</p>
          </div>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div className="h-full w-1/5 bg-primary rounded-full transition-all duration-700" />
        </div>
      </div>

      <MilestonesList />
    </AppLayout>
  );
};

export default Milestones;
