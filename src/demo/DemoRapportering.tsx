import { CheckCircle2, Upload, FileUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DEMO_FACTS } from "./demoData";
import { toast } from "sonner";

export default function DemoRapportering() {
  return (
    <div className="p-4 md:p-8 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Rapportering</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Her uploader du din månedlige saldobalance — AI'en læser tallene automatisk
        </p>
      </div>

      {/* Upload zone */}
      <button
        onClick={() => toast.info("Dette er en demooplevelse — opret en konto for at uploade rigtige rapporter", {
          action: { label: "Opret konto →", onClick: () => window.open("https://theboardroom.dk", "_blank") },
        })}
        className="w-full glass-card rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors p-8 flex flex-col items-center gap-3 cursor-pointer group"
      >
        <div className="p-3 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
          <FileUp className="h-6 w-6 text-primary" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">Upload rapport</p>
          <p className="text-xs text-muted-foreground mt-1">Træk en fil hertil eller klik for at vælge · PDF, CSV eller Excel</p>
        </div>
      </button>

      {/* Committed periods */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <p className="text-sm font-medium text-muted-foreground">Perioder med committed facts</p>
        </div>
        <div className="divide-y divide-border">
          {DEMO_FACTS.map((f) => (
            <div key={f.key} className="flex items-center justify-between px-5 py-3">
              <span className="text-sm font-medium text-foreground">{f.period}</span>
              <Badge variant="secondary" className="text-[hsl(var(--chart-positive))] bg-[hsl(var(--chart-positive))]/10 border-0 gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Analyse klar
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
