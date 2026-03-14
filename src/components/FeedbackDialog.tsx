import { useState } from "react";
import { Bug, Lightbulb, MessageSquare, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const categories = [
  { key: "bug", label: "Bug", icon: Bug, color: "text-destructive" },
  { key: "suggestion", label: "Forslag", icon: Lightbulb, color: "text-amber-500" },
  { key: "other", label: "Andet", icon: MessageSquare, color: "text-primary" },
] as const;

type Category = (typeof categories)[number]["key"];

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FeedbackDialog = ({ open, onOpenChange }: FeedbackDialogProps) => {
  const [category, setCategory] = useState<Category>("suggestion");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const reset = () => {
    setCategory("suggestion");
    setTitle("");
    setDescription("");
  };

  const handleSubmit = async () => {
    if (!title.trim() || !user) return;
    setSubmitting(true);

    // Get company_id
    const { data: companyData } = await supabase
      .rpc("user_company_id", { _user_id: user.id });

    if (!companyData) {
      toast({ title: "Fejl", description: "Kunne ikke finde din virksomhed.", variant: "destructive" });
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.from("feedback").insert({
      user_id: user.id,
      company_id: companyData,
      category,
      title: title.trim(),
      description: description.trim(),
    });

    setSubmitting(false);

    if (error) {
      toast({ title: "Fejl", description: "Kunne ikke sende feedback. Prøv igen.", variant: "destructive" });
      return;
    }

    toast({ title: "Tak for din feedback!", description: "Vi har modtaget din besked og vender tilbage." });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Rapportér en fejl, del et forslag eller skriv til os.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Category picker */}
          <div className="flex gap-2">
            {categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                className={cn(
                  "flex-1 flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all text-sm font-medium",
                  category === cat.key
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border hover:border-muted-foreground/30 hover:bg-muted/50"
                )}
              >
                <cat.icon className={cn("h-5 w-5", category === cat.key ? cat.color : "text-muted-foreground")} />
                <span className={category === cat.key ? "text-foreground" : "text-muted-foreground"}>
                  {cat.label}
                </span>
              </button>
            ))}
          </div>

          <Input
            placeholder="Kort titel…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            autoFocus
          />

          <Textarea
            placeholder="Beskriv hvad du oplevede eller ønsker (valgfrit)…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={2000}
          />

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Annullér
            </Button>
            <Button onClick={handleSubmit} disabled={!title.trim() || submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send feedback
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FeedbackDialog;
