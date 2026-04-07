import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { Loader2 } from "lucide-react";

export default function BookSession() {
  const [loading, setLoading] = useState(false);

  const handleBook = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-stripe-checkout");
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
      else toast.error("Ingen URL modtaget fra Stripe");
    } catch (err: any) {
      console.error("Booking error:", err);
      toast.error(err?.message || "Noget gik galt");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <h1 className="text-2xl font-bold text-foreground mb-4">Book 1:1 session</h1>
        <p className="text-muted-foreground mb-8">500 kr. ex. moms</p>
        <Button size="lg" onClick={handleBook} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Book og betal
        </Button>
      </div>
    </AppLayout>
  );
}
