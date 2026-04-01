import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import topixIconGreen from "@/assets/topix-icon-green.png";

export default function Demo() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.signInWithPassword({
      email: "demo@theboardroom.dk",
      password: "DemoBoard2026!",
    }).then(({ error }) => {
      if (error) {
        setError("Demo kunne ikke startes. Prøv igen om lidt.");
      } else {
        navigate("/", { replace: true });
      }
    });
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6">
      <img src={topixIconGreen} alt="Topix" className="h-12 w-12" />
      {error ? (
        <div className="text-center space-y-2">
          <p className="text-destructive font-medium">{error}</p>
          <button onClick={() => window.location.reload()} className="text-sm text-primary underline">
            Prøv igen
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Forbereder din demooplevelse...</p>
        </div>
      )}
    </div>
  );
}
