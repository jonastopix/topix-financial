import { CheckCircle2, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DEMO_FACTS } from "./demoData";
import { toast } from "sonner";

export default function DemoRapportering() {
  return (
    <div className="p-4 md:p-8 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Rapportering</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Her uploader du din månedlige saldobalance — AI'en læser tallene automatisk
        </p>
      </div>

      <Button
        className="w-full sm:w-auto"
        onClick={() => toast.info("Dette er en demooplevelse — opret en konto for at uploade rigtige rapporter")}
      >
        <Upload className="h-4 w-4 mr-2" />
        Upload rapport
      </Button>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Perioder med committed facts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {DEMO_FACTS.map((f) => (
              <div key={f.key} className="flex items-center justify-between py-3">
                <span className="text-sm font-medium text-foreground">{f.period}</span>
                <Badge variant="secondary" className="text-[hsl(var(--chart-positive))] bg-[hsl(var(--chart-positive))]/10 border-0 gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Analyse klar
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
