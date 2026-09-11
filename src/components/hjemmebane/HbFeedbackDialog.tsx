import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { HbDialog } from "./milestones/HbOverlejring";
import { HbField, HbInput, HbSelect, HbTextarea } from "./admin/HbField";
import { HbButton } from "./HbButton";
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

/**
 * Feedback i Hb-skallen (11/9, mangellistens kort 85). Åbnes fra «Giv
 * feedback» i sidebarens profilblok (HbSidebar) — et menupunkt, ikke en
 * flydende knap: en flydende knap ville kollidere med tjekliste-boksen
 * (HbOnboardingTjekliste, fixed nederst til højre).
 *
 * HbDialog, ikke Radix: den gamle FeedbackDialog portalerer til <body>,
 * uden for .theme-hjemmebane, og arver appens mørke tokens. Formen er den
 * HbInvitationer og VirksomhedStamdata bruger — HbField/HbInput/HbSelect/
 * HbTextarea i dialogen, HbButton i foden, toast for kvittering og fejl.
 *
 * Samme felter, grænser og tekster som den gamle dialog; skrivevejen er
 * motorens (src/lib/feedback.ts) — én for begge dialoger.
 */
export const HbFeedbackDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { user } = useAuth();
  const [category, setCategory] = useState<FeedbackKategori>(FEEDBACK_STANDARD_KATEGORI);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const removeScreenshot = () => {
    setScreenshot(null);
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshotPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const reset = () => {
    setCategory(FEEDBACK_STANDARD_KATEGORI);
    setTitle("");
    setDescription("");
    removeScreenshot();
  };

  const luk = () => {
    if (submitting) return;
    onClose();
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

  const handleSubmit = async () => {
    if (!kanSendeFeedback(title) || !user) return;
    setSubmitting(true);
    const r = await sendFeedback({ userId: user.id, category, title, description, screenshot });
    setSubmitting(false);
    if (r.ok === false) {
      if (r.trin === "upload") toast.error("Upload fejlede", { description: "Kunne ikke uploade billedet. Prøv igen." });
      else toast.error("Fejl", { description: "Kunne ikke sende feedback. Prøv igen." });
      return;
    }
    toast.success("Tak for din feedback!", { description: "Vi har modtaget din besked og vender tilbage." });
    reset();
    onClose();
  };

  return (
    <HbDialog
      open={open}
      onClose={luk}
      titel="Send feedback"
      beskrivelse="Rapportér en fejl, del et forslag eller skriv til os."
      fod={
        <div className="flex justify-end gap-2">
          <HbButton type="button" variant="secondary" className="h-10 px-5" onClick={luk} disabled={submitting}>
            Annullér
          </HbButton>
          <HbButton type="button" className="h-10 px-5" onClick={handleSubmit} disabled={!kanSendeFeedback(title) || submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Send feedback
          </HbButton>
        </div>
      }
    >
      <div className="space-y-4">
        <HbField label="Kategori" htmlFor="feedback-kategori">
          <HbSelect id="feedback-kategori" value={category} onChange={(e) => setCategory(e.target.value as FeedbackKategori)}>
            {FEEDBACK_KATEGORIER.map((k) => (
              <option key={k.key} value={k.key}>{k.label}</option>
            ))}
          </HbSelect>
        </HbField>

        <HbField label="Titel" htmlFor="feedback-titel">
          <HbInput
            id="feedback-titel"
            placeholder="Kort titel…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={FEEDBACK_TITEL_MAX}
            autoFocus
          />
        </HbField>

        <HbField label="Beskrivelse" htmlFor="feedback-beskrivelse" help="Valgfrit.">
          <HbTextarea
            id="feedback-beskrivelse"
            placeholder="Beskriv hvad du oplevede eller ønsker (valgfrit)…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={FEEDBACK_BESKRIVELSE_MAX}
          />
        </HbField>

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

        {screenshotPreview ? (
          <div className="relative overflow-hidden rounded-lg border border-hb-line">
            <img src={screenshotPreview} alt="Screenshot preview" className="max-h-36 w-full object-cover" />
            <button
              type="button"
              onClick={removeScreenshot}
              aria-label="Fjern screenshot"
              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-hb-surface/90 text-hb-ink transition-colors hover:bg-hb-surface"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-hb-line px-3.5 py-2.5 text-sm text-hb-ink-soft transition-colors hover:border-hb-ink/40 hover:text-hb-ink"
          >
            <ImagePlus className="h-4 w-4" />
            Vedhæft screenshot (valgfrit)
          </button>
        )}
      </div>
    </HbDialog>
  );
};
