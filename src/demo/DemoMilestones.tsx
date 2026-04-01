import { Plus, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DEMO_MILESTONES, CATEGORY_LABELS } from "./demoData";
import { toast } from "sonner";

export default function DemoMilestones() {
  return (
    <div className="p-4 md:p-8 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Milestones</h1>
        <Button
          size="sm"
          onClick={() => toast.info("Opret en konto for at tilføje milestones")}
        >
          <Plus className="h-4 w-4 mr-1" /> Ny milestone
        </Button>
      </div>

      <div className="space-y-4">
        {DEMO_MILESTONES.map((m) => (
          <Card key={m.title} className="bg-card border-border">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-foreground">{m.title}</h3>
                <Badge variant="outline" className="shrink-0 text-xs">{CATEGORY_LABELS[m.category]}</Badge>
              </div>
              <Progress value={m.progress} className="h-2.5" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{m.current} / {m.target} — {m.progress}%</span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> {m.deadline}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
