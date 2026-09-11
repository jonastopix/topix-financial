import { useState, useRef } from "react";
import { Bug, Lightbulb, MessageSquare, Loader2, ImagePlus, X } from "lucide-react";
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
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  doemSkaermbillede,
  FEEDBACK_BESKRIVELSE_MAX,
  FEEDBACK_KATEGORIER,
  FEEDBACK_STANDARD_KATEGORI,
  FEEDBACK_TITEL_MAX,
  kanSendeFeedback,
  sendFeedback,
  type FeedbackKategori,
} from "@/lib/feedback";

/* Validering, sti, grænser og skrivevejen bor i src/lib/feedback.ts (11/9,
   kort 85) — én motor for denne dialog og HbFeedbackDialog i Hb-skallen.
   Kategoriernes værdier og etiketter kommer derfra («Bug» blev «Fejl»);
   ikonerne er denne dialogs egne. */
const IKONER: Record<FeedbackKategori, { icon: typeof Bug; color: string }> = {
  bug: { icon: Bug, color: "text-destructive" },
  suggestion: { icon: Lightbulb, color: "text-amber-500" },
  other: { icon: MessageSquare, color: "text-primary" },
};
const categories = FEEDBACK_KATEGORIER.map((k) => ({ ...k, ...IKONER[k.key] }));

type Category = FeedbackKategori;

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FeedbackDialog = ({ open, onOpenChange }: FeedbackDialogProps) => {
  const [category, setCategory] = useState<Category>(FEEDBACK_STANDARD_KATEGORI);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { user } = useAuth();

  const reset = () => {
    setCategory(FEEDBACK_STANDARD_KATEGORI);
    setTitle("");
    setDescription("");
    setScreenshot(null);
    setScreenshotPreview(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dom = doemSkaermbillede(file);
    if (dom.ok === false) {
      toast.error(dom.titel, { description: dom.tekst });
      return;
    }
    setScreenshot(file);
    setScreenshotPreview(URL.createObjectURL(file));
  };

  const removeScreenshot = () => {
    setScreenshot(null);
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshotPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!kanSendeFeedback(title) || !user) return;
    setSubmitting(true);

    // Upload → user_company_id → insert → notify, i motoren (src/lib/feedback.ts).
    const r = await sendFeedback({ userId: user.id, category, title, description, screenshot });

    setSubmitting(false);

    if (r.ok === false) {
      if (r.trin === "upload") toast.error("Upload fejlede", { description: "Kunne ikke uploade billedet. Prøv igen." });
      else toast.error("Fejl", { description: "Kunne ikke sende feedback. Prøv igen." });
      return;
    }

    toast.success("Tak for din feedback!", { description: "Vi har modtaget din besked og vender tilbage." });
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
            maxLength={FEEDBACK_TITEL_MAX}
            autoFocus
          />

          <Textarea
            placeholder="Beskriv hvad du oplevede eller ønsker (valgfrit)…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={FEEDBACK_BESKRIVELSE_MAX}
          />

          {/* Screenshot upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />

          {screenshotPreview ? (
            <div className="relative rounded-lg border border-border overflow-hidden">
              <img
                src={screenshotPreview}
                alt="Screenshot preview"
                className="w-full max-h-36 object-cover"
              />
              <button
                onClick={removeScreenshot}
                className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center hover:bg-background transition-colors"
                aria-label="Fjern screenshot"
              >
                <X className="h-3.5 w-3.5 text-foreground" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground transition-colors"
            >
              <ImagePlus className="h-4 w-4" />
              Vedhæft screenshot (valgfrit)
            </button>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Annullér
            </Button>
            <Button onClick={handleSubmit} disabled={!kanSendeFeedback(title) || submitting}>
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
