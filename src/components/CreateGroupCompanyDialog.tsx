import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

interface CreateGroupCompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
}

const CreateGroupCompanyDialog = ({ open, onOpenChange, groupId }: CreateGroupCompanyDialogProps) => {
  const [companyName, setCompanyName] = useState("");
  const [cvr, setCvr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const cvrDigits = cvr.replace(/[^0-9]/g, "");
  const cvrValid = cvr.trim() === "" || cvrDigits.length === 8;

  const handleSubmit = async () => {
    setError(null);
    const trimmedName = companyName.trim();
    if (!trimmedName) {
      setError("Virksomhedsnavn er påkrævet");
      return;
    }
    if (cvr.trim() && !cvrValid) {
      setError("CVR skal være præcis 8 cifre");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "owner-add-company-to-group",
        {
          body: {
            group_id: groupId,
            company_name: trimmedName,
            cvr_number: cvr.trim() || null,
          },
        }
      );

      if (fnError) {
        // supabase.functions.invoke wraps non-2xx as FunctionsHttpError
        const msg = (data as any)?.error || fnError.message || "Ukendt fejl";
        setError(msg);
        return;
      }

      if (data?.error) {
        setError(data.error);
        return;
      }

      toast({
        title: "Selskab oprettet",
        description: `${data.company_name} er tilføjet til koncernen`,
      });

      // Reset and close
      setCompanyName("");
      setCvr("");
      onOpenChange(false);

      // Refresh group dashboard data
      queryClient.invalidateQueries({ queryKey: ["group-financial-summary"] });
    } catch (e: any) {
      setError(e.message || "Der opstod en fejl");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Opret nyt selskab</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="company-name">Virksomhedsnavn *</Label>
            <Input
              id="company-name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Fx Holding ApS"
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cvr">CVR-nummer (valgfrit)</Label>
            <Input
              id="cvr"
              value={cvr}
              onChange={(e) => setCvr(e.target.value)}
              placeholder="12345678"
              maxLength={12}
              disabled={isSubmitting}
            />
            {cvr.trim() && !cvrValid && (
              <p className="text-xs text-destructive">CVR skal være præcis 8 cifre</p>
            )}
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Annullér
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !companyName.trim()}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Opret
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateGroupCompanyDialog;
