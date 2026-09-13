import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * HbDropzone — husets FRIE dropzone (13/9-2026, ansøgningsimporten).
 *
 * Der fandtes tre ældre zoner, hver bundet til sit sted: admin/HbUploadZone
 * (uploader direkte til content-assets-bucketen og giver kalderen en sti,
 * ikke filen), rapportering/HbReportUploadZone (rapport-pipelinen: flere
 * filer, userId/companyId/conversationId) og budget/HbBudgetImport (inline
 * JSX med modul-private hjælpere). Ingen af dem kunne bruges til «giv mig
 * filen, så læser jeg den selv» uden at kopieres.
 *
 * Denne er den frie: samme button-form som HbUploadZone.tsx:64-108
 * (onDragOver/onDragLeave/onDrop, dashed ramme, evergreen/sage ved træk,
 * skjult <input type="file"> med ref og e.target.value = "" så samme fil
 * kan vælges igen), men uden bucket, kind eller ownerId — kalderen får
 * File-objektet gennem onFile og bestemmer selv hvad der sker.
 *
 * De tre ældre zoner er bevidst IKKE lagt oven på denne i samme bygning
 * (det ville blande to ting); de kan lægges oven på den den dag nogen
 * rører dem alligevel.
 */

interface HbDropzoneProps {
  onFile: (f: File) => void;
  /** Som <input accept>, fx ".xlsx,.xls". */
  accept?: string;
  /** Hovedlinjen, fx «Træk ansøgnings-Excel hertil». */
  tekst: string;
  /** Linjen under, fx «eller klik for at vælge fil · .xlsx fra Monday.com». */
  undertekst?: string;
  /** Sat mens kalderen læser filen — zonen spærres og viser busyTekst. */
  busy?: boolean;
  busyTekst?: string;
  disabled?: boolean;
  className?: string;
}

export const HbDropzone = ({
  onFile,
  accept,
  tekst,
  undertekst,
  busy = false,
  busyTekst = "Læser filen…",
  disabled = false,
  className,
}: HbDropzoneProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const spaerret = busy || disabled;

  const tag = (file: File | undefined) => {
    if (!file || spaerret) return;
    onFile(file);
  };

  return (
    <div className={className}>
      <button
        type="button"
        disabled={spaerret}
        aria-disabled={spaerret}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!spaerret) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          tag(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex w-full items-center gap-4 rounded-hb border border-dashed px-6 py-6 text-left transition-colors",
          spaerret
            ? "cursor-not-allowed border-hb-line bg-hb-surface/60"
            : dragOver
              ? "border-hb-evergreen bg-hb-sage/40"
              : "border-hb-line bg-hb-surface hover:bg-hb-sage/20",
          busy && "opacity-60",
        )}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-hb-ink-soft" />
        ) : (
          <FileUp className="h-5 w-5 shrink-0 text-hb-ink-soft" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] text-hb-ink">{busy ? busyTekst : tekst}</span>
          {!busy && undertekst && <span className="block text-sm text-hb-ink-soft">{undertekst}</span>}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        aria-label={tekst}
        onChange={(e) => {
          tag(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
};
