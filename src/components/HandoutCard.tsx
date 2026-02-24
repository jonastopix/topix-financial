import { Calculator, Compass, Settings, Handshake, Megaphone, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { HandoutConfig, HandoutModule } from "@/lib/handoutConfig";

const iconMap: Record<string, React.ElementType> = {
  Compass,
  Calculator,
  Settings,
  Handshake,
  Megaphone,
};

interface HandoutCardProps {
  config: HandoutConfig;
  status: 'not_started' | 'in_progress' | 'completed';
  progress: number;
  completedAt?: string | null;
  onClick: () => void;
}

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  not_started: { label: "Ikke startet", variant: "outline" },
  in_progress: { label: "I gang", variant: "secondary" },
  completed: { label: "Udfyldt", variant: "default" },
};

const HandoutCard = ({ config, status, progress, completedAt, onClick }: HandoutCardProps) => {
  const Icon = iconMap[config.icon] || Compass;
  const statusInfo = statusLabels[status];

  return (
    <button
      onClick={onClick}
      className="glass-card rounded-xl p-5 text-left w-full hover:ring-2 hover:ring-primary/30 transition-all duration-200 group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="p-2.5 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <Badge variant={statusInfo.variant} className="text-[10px]">
          {statusInfo.label}
        </Badge>
      </div>
      <h3 className="font-display font-semibold text-foreground text-sm mb-1">{config.title}</h3>
      <p className="text-xs text-muted-foreground mb-4 line-clamp-2">{config.subtitle}</p>
      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">Fremskridt</span>
          <span className="font-medium text-foreground">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>
      {status === "completed" && completedAt && (
        <div className="flex items-center gap-1.5 mt-3 text-[11px] text-primary">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Udfyldt {new Date(completedAt).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" })}</span>
        </div>
      )}
    </button>
  );
};

export default HandoutCard;
