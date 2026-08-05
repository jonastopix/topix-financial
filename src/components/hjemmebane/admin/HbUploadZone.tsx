import * as React from "react";
import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildAssetPath, getAssetPreviewUrl, uploadAsset } from "@/lib/hjemmebane/adminContentApi";

interface HbUploadZoneProps {
  /** Path-konventionen fra baseline §9: covers/ · templates/ · partners/ · attachments/. */
  kind: "covers" | "templates" | "partners" | "attachments";
  ownerId: string;
  currentPath: string | null;
  accept?: string;
  onUploaded: (path: string) => void;
  className?: string;
}

/** Upload til den private content-assets-bucket (advisor-INSERT-policy) med
    signeret preview. Klienten uploader direkte — ingen edge function. */
export const HbUploadZone = ({
  kind,
  ownerId,
  currentPath,
  accept,
  onUploaded,
  className,
}: HbUploadZoneProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const path = await uploadAsset(buildAssetPath(kind, ownerId, file.name), file);
      onUploaded(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fejlede");
    } finally {
      setBusy(false);
    }
  };

  const openPreview = async () => {
    if (!currentPath) return;
    setError(null);
    try {
      const url = await getAssetPreviewUrl(currentPath);
      window.open(url, "_blank", "noopener");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke hente preview");
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFile(e.dataTransfer.files?.[0]);
        }}
        disabled={busy}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-left text-sm transition-colors",
          dragOver
            ? "border-hb-evergreen bg-hb-sage/40"
            : "border-hb-line bg-hb-surface hover:bg-hb-sage/20",
          busy && "opacity-60",
        )}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-hb-ink-soft" />
        ) : (
          <FileUp className="h-4 w-4 shrink-0 text-hb-ink-soft" />
        )}
        <span className="min-w-0 flex-1 text-hb-ink-soft">
          {busy
            ? "Uploader…"
            : currentPath
              ? "Erstat filen — klik eller træk hertil"
              : "Vælg fil — klik eller træk hertil"}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {currentPath && (
        <p className="mt-1.5 flex min-w-0 items-baseline gap-2 text-xs text-hb-ink-soft">
          <span className="truncate">{currentPath.split("/").pop()}</span>
          <button
            type="button"
            onClick={() => void openPreview()}
            className="shrink-0 text-hb-rust underline-offset-4 hover:underline"
          >
            Vis (signeret, 60 min)
          </button>
        </p>
      )}
      {error && <p className="mt-1.5 text-xs text-hb-rust">{error}</p>}
    </div>
  );
};
