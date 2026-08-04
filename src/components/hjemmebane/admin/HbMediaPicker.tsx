import * as React from "react";
import { HbField, HbInput } from "./HbField";
import { HbSegmented } from "./HbSegmented";
import { HbUploadZone } from "./HbUploadZone";
import { HbBunnyPicker } from "./HbBunnyPicker";

type MediaProvider = "none" | "bunny" | "storage" | "external";

interface HbMediaPickerProps {
  itemId: string;
  itemTitle: string;
  provider: MediaProvider;
  bunnyVideoId: string | null;
  storagePath: string | null;
  externalUrl: string | null;
  onChange: (patch: {
    media_provider?: MediaProvider;
    bunny_video_id?: string | null;
    storage_path?: string | null;
    external_url?: string | null;
  }) => void;
}

const PROVIDERS: { value: MediaProvider; label: string }[] = [
  { value: "none", label: "Ingen" },
  { value: "bunny", label: "Bunny-video" },
  { value: "storage", label: "Fil" },
  { value: "external", label: "Eksternt link" },
];

/** Trefløjet medie-reference (B5). CHECK-constrainten
    content_items_media_matches_provider spejles her: den valgte provider
    viser sit referencefelt, og gem-valideringen kræver det udfyldt. */
export const HbMediaPicker = ({
  itemId,
  itemTitle,
  provider,
  bunnyVideoId,
  storagePath,
  externalUrl,
  onChange,
}: HbMediaPickerProps) => {
  const urlInvalid = Boolean(externalUrl) && !/^https:\/\/.+/.test(externalUrl ?? "");

  return (
    <div className="space-y-4">
      <HbSegmented
        aria-label="Medietype"
        value={provider}
        options={PROVIDERS}
        onChange={(value) => onChange({ media_provider: value })}
      />

      {provider === "bunny" && (
        <HbBunnyPicker
          videoId={bunnyVideoId}
          itemTitle={itemTitle}
          onVideoId={(guid) => onChange({ bunny_video_id: guid })}
        />
      )}

      {provider === "storage" && (
        <HbUploadZone
          kind="templates"
          ownerId={itemId}
          currentPath={storagePath}
          onUploaded={(path) => onChange({ storage_path: path })}
        />
      )}

      {provider === "external" && (
        <HbField
          label="URL"
          htmlFor="external-url"
          error={urlInvalid ? "Skal være en https://-adresse" : null}
        >
          <HbInput
            id="external-url"
            type="url"
            value={externalUrl ?? ""}
            onChange={(e) => onChange({ external_url: e.target.value.trim() })}
            placeholder="https://…"
            spellCheck={false}
          />
        </HbField>
      )}
    </div>
  );
};
