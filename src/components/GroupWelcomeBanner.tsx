import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Layers, BarChart3, MessageCircle, Calculator, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  /** "full" on /group page, "compact" on / dashboard */
  variant?: "full" | "compact";
}

export default function GroupWelcomeBanner({ variant = "full" }: Props) {
  const { user, groupName, isGroupUser, welcomeDismissedAt } = useAuth();
  const navigate = useNavigate();
  const [dismissing, setDismissing] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (!isGroupUser || welcomeDismissedAt || dismissed) return null;

  const handleDismiss = async () => {
    if (!user) return;
    setDismissing(true);
    await supabase
      .from("group_memberships" as any)
      .update({ welcome_dismissed_at: new Date().toISOString() } as any)
      .eq("user_id", user.id);
    setDismissed(true);
    setDismissing(false);
  };

  if (variant === "compact") {
    return (
      <div className="glass-card rounded-xl p-4 mb-6 border-l-4 border-l-primary relative">
        <button onClick={handleDismiss} disabled={dismissing} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 mb-1">
          <Layers className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Du er nu del af {groupName}</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Se samlede nøgletal og kommunikér på tværs af koncernen.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="default" onClick={() => navigate("/group")} className="gap-1.5 text-xs">
            <BarChart3 className="h-3.5 w-3.5" /> Koncernoverblik
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/chat")} className="gap-1.5 text-xs">
            <MessageCircle className="h-3.5 w-3.5" /> Chat
          </Button>
        </div>
      </div>
    );
  }

  // Full variant
  return (
    <div className="glass-card rounded-xl p-6 mb-6 relative">
      <button onClick={handleDismiss} disabled={dismissing} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-3 mb-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Layers className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-display font-bold text-foreground">Velkommen til {groupName}</h2>
          <p className="text-sm text-muted-foreground">Din rådgiver har tilknyttet din virksomhed til en koncern.</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Du kan nu se samlede nøgletal, budgetter og kommunikere på tværs af koncernen.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={() => navigate("/group")}
          className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors text-left"
        >
          <BarChart3 className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Koncernoverblik</p>
            <p className="text-xs text-muted-foreground">Se samlede nøgletal</p>
          </div>
        </button>
        <button
          onClick={() => navigate("/chat")}
          className="flex items-center gap-3 p-3 rounded-lg bg-secondary border border-border hover:bg-secondary/80 transition-colors text-left"
        >
          <MessageCircle className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Koncernchat</p>
            <p className="text-xs text-muted-foreground">Kommunikér på tværs</p>
          </div>
        </button>
        <button
          onClick={() => navigate("/group/budget")}
          className="flex items-center gap-3 p-3 rounded-lg bg-secondary border border-border hover:bg-secondary/80 transition-colors text-left"
        >
          <Calculator className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Koncernbudget</p>
            <p className="text-xs text-muted-foreground">Se samlet budget</p>
          </div>
        </button>
      </div>
    </div>
  );
}
