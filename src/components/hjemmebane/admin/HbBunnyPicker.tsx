import * as React from "react";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as tus from "tus-js-client";
import { CloudUpload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { HbField, HbInput } from "./HbField";

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TUS_ENDPOINT = "https://video.bunnycdn.com/tusupload";

interface CreateVideoResponse {
  videoGuid: string;
  signature: string;
  expires: number;
  libraryId: string;
}

interface HbBunnyPickerProps {
  videoId: string | null;
  itemTitle: string;
  onVideoId: (guid: string) => void;
}

/** Bunny-sporet, to veje (design-blok §5): manuelt GUID-felt der virker fra
    dag ét, og integreret TUS-upload der aktiveres når BUNNY_STREAM_*-secrets
    findes. Ikke-konfigureret = rolig flade, ingen død knap — API-nøglen rører
    aldrig frontend (edge function signerer, browseren uploader direkte). */
export const HbBunnyPicker = ({ videoId, itemTitle, onVideoId }: HbBunnyPickerProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const status = useQuery({
    queryKey: ["bunny-status"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error: fnError } = await supabase.functions.invoke("bunny-content-admin", {
        body: { action: "status" },
      });
      if (fnError) throw new Error(fnError.message);
      return data as { configured: boolean };
    },
  });

  const uploadFile = async (file: File | undefined) => {
    if (!file || progress !== null) return;
    setError(null);
    setProgress(0);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("bunny-content-admin", {
        body: { action: "create-video", title: itemTitle || file.name },
      });
      if (fnError) throw new Error(fnError.message);
      const grant = data as CreateVideoResponse;

      await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint: TUS_ENDPOINT,
          retryDelays: [0, 3000, 5000, 10000],
          headers: {
            AuthorizationSignature: grant.signature,
            AuthorizationExpire: String(grant.expires),
            VideoId: grant.videoGuid,
            LibraryId: grant.libraryId,
          },
          metadata: { filetype: file.type, title: itemTitle || file.name },
          onError: reject,
          onProgress: (sent, total) => setProgress(Math.round((sent / total) * 100)),
          onSuccess: () => resolve(),
        });
        upload.start();
      });

      onVideoId(grant.videoGuid);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fejlede");
    } finally {
      setProgress(null);
    }
  };

  const guidInvalid = Boolean(videoId) && !GUID_RE.test(videoId ?? "");

  return (
    <div className="space-y-4">
      <HbField
        label="Bunny video-ID"
        htmlFor="bunny-guid"
        error={guidInvalid ? "Ikke et gyldigt video-ID (GUID-form forventes)" : null}
        help="Afspilningstest kommer i trin 3 (get-video-embed)."
      >
        <HbInput
          id="bunny-guid"
          value={videoId ?? ""}
          onChange={(e) => onVideoId(e.target.value.trim())}
          placeholder="fx 1a2b3c4d-…"
          spellCheck={false}
        />
      </HbField>

      {status.data?.configured ? (
        <div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={progress !== null}
            className="flex w-full items-center gap-3 rounded-lg border border-dashed border-hb-line bg-hb-surface px-4 py-3 text-left text-sm text-hb-ink-soft transition-colors hover:bg-hb-sage/20 disabled:opacity-60"
          >
            {progress !== null ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <CloudUpload className="h-4 w-4 shrink-0" />
            )}
            <span className="min-w-0 flex-1">
              {progress !== null
                ? `Uploader til Bunny… ${progress}%`
                : "Upload video direkte til Bunny Stream"}
            </span>
          </button>
          {progress !== null && (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-hb-sage/60">
              <div
                className="h-full rounded-full bg-hb-evergreen transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              void uploadFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <div className="rounded-lg bg-hb-sage/40 px-4 py-3 text-sm leading-relaxed text-hb-ink">
          {status.isLoading
            ? "Tjekker Bunny-opsætningen…"
            : "Bunny Stream er ikke sat op endnu — følg docs/hjemmebane/c0-bunny.md. Du kan indsætte et video-ID manuelt, når videoen er uploadet i Bunny-dashboardet."}
        </div>
      )}

      {error && <p className="text-xs text-hb-rust">{error}</p>}
    </div>
  );
};
