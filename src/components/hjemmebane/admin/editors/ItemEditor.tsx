import * as React from "react";
import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  AREAS,
  ITEM_TYPES,
  type AreaKey,
  type ContentCollection,
  type ContentItem,
  type Partner,
  deleteItem,
  updateItem,
} from "@/lib/hjemmebane/adminContentApi";
import { slugify } from "@/lib/hjemmebane/slug";
import { handoutConfigs, moduleOrder } from "@/lib/handoutConfig";
import { HbField, HbInput, HbSelect, HbTextarea } from "../HbField";
import { HbMediaPicker } from "../HbMediaPicker";
import { HbMaterials } from "../HbMaterials";
import { HbEditorRichtext } from "../HbEditorRichtext";
import { HbUploadZone } from "../HbUploadZone";
import {
  EditorBar,
  EditorShell,
  SlugField,
  formatDuration,
  isSlugUniqueError,
  parseDuration,
  type EditorAction,
  type EditorHandle,
} from "./shared";

type Draft = Partial<ContentItem>;

interface ItemEditorProps {
  item: ContentItem;
  collections: ContentCollection[];
  partners: Partner[];
  draft: Draft;
  onDraftChange: (patch: Draft) => void;
  onSaved: () => void;
  onDeleted: () => void;
}

/** CHECK-constrainten spejles før gem, så DB-fejl aldrig er første feedback. */
const mediaError = (form: ContentItem): string | null => {
  switch (form.media_provider) {
    case "bunny":
      return form.bunny_video_id?.trim() ? null : "Bunny-video kræver et video-ID";
    case "storage":
      return form.storage_path ? null : "Fil kræver en uploadet fil";
    case "external":
      return /^https:\/\/.+/.test(form.external_url ?? "")
        ? null
        : "Eksternt link kræver en https://-adresse";
    default:
      return null;
  }
};

export const ItemEditor = forwardRef<EditorHandle, ItemEditorProps>(
  ({ item, collections, partners, draft, onDraftChange, onSaved, onDeleted }, ref) => {
    const queryClient = useQueryClient();
    const [savedAt, setSavedAt] = useState<Date | null>(null);
    const [slugError, setSlugError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [durationText, setDurationText] = useState<string | null>(null);
    const [henterVarighed, setHenterVarighed] = useState(false);

    const form = { ...item, ...draft } as ContentItem;
    const dirty = Object.keys(draft).length > 0;
    const areaLabel = AREAS.find((a) => a.key === (form.area as AreaKey))?.label ?? form.area;
    /* Varighed hører til et MEDIE, ikke til en type. En skabelon uden
       medie har ingen varighed; en lektion med en Bunny-video har.
       media_provider er i forvejen den kolonne, der styrer både
       afspilningen (ElementView.tsx:206) og fremdriften (isTrackedEntry,
       useAkademiData.ts:170-176) — varigheden skal følge samme dom.
       Type bruges kun som label (ITEM_TYPES) og må ikke afgøre hvilke
       felter der findes.

       Historik: før denne rettelse var feltet bundet til type
       video/episode, og de eksisterende lektions-varigheder havde INGEN
       skrivevej gennem admin — de er sat, da itemet havde en anden
       type, eller direkte i SQL, og kunne ikke genskabes, hvis de blev
       nulstillet. */
    const showDuration = form.media_provider !== "none";
    const collection = collections.find((c) => c.id === form.collection_id);
    const inheritedDrip = collection?.drip_after_days;

    const mutation = useMutation({
      mutationFn: (patch: Draft) => updateItem(item.id, patch),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
        setSavedAt(new Date());
        setSlugError(null);
        setError(null);
        onSaved();
      },
      onError: (err: Error) => {
        if (isSlugUniqueError(err.message)) setSlugError("Slug er allerede i brug");
        else setError(err.message);
      },
    });

    const persist = (extra: Draft = {}) => {
      if (mutation.isPending) return;
      setSlugError(null);
      const patch: Draft = { ...draft, ...extra };
      const next = { ...item, ...patch } as ContentItem;
      const mediaProblem = mediaError(next);
      if (mediaProblem) {
        setError(mediaProblem);
        return;
      }
      setError(null);
      if (!String(patch.slug ?? form.slug).trim()) patch.slug = slugify(form.title);
      // Tom patch = intet at gemme. update({}) giver 0 rækker (PGRST116) —
      // kvittér stille i stedet for at sende en no-op-mutation.
      if (Object.keys(patch).length === 0) {
        setSavedAt(new Date());
        return;
      }
      mutation.mutate(patch);
    };

    const publish = () =>
      persist({
        status: "published",
        published_at: form.published_at ?? new Date().toISOString(),
      });

    useImperativeHandle(ref, () => ({ save: () => persist(), publish }));

    const deleteMutation = useMutation({
      mutationFn: () => deleteItem(item.id),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
        onDeleted();
      },
      onError: (err: Error) => setError(err.message),
    });

    const actions: EditorAction[] =
      form.status === "published"
        ? [
            { label: "Tilbage til kladde", onClick: () => persist({ status: "draft" }), variant: "secondary" },
            { label: "Arkivér", onClick: () => persist({ status: "archived" }), variant: "link" },
          ]
        : form.status === "archived"
          ? [{ label: "Gendan som kladde", onClick: () => persist({ status: "draft" }), variant: "primary" }]
          : [
              { label: "Publicér", onClick: publish, variant: "primary" },
              { label: "Arkivér", onClick: () => persist({ status: "archived" }), variant: "link" },
            ];

    return (
      <EditorShell
        eyebrow={`${ITEM_TYPES.find((t) => t.key === form.type)?.label ?? form.type} · ${areaLabel}`}
        title={form.title}
        meta={collection ? `I samlingen: ${collection.title}` : undefined}
        footer={
          <EditorBar
            status={form.status}
            dirty={dirty}
            saving={mutation.isPending}
            savedAt={savedAt}
            error={error}
            onSave={() => persist()}
            actions={actions}
            deleteSpec={
              form.status === "archived"
                ? {
                    entityLabel: form.title || "Uden titel",
                    consequence: "Medlemmers fremdrift på elementet slettes med.",
                    deleting: deleteMutation.isPending,
                    onDelete: () => deleteMutation.mutate(),
                  }
                : undefined
            }
          />
        }
      >
        <div className="grid gap-6 md:grid-cols-2">
          <HbField label="Type" htmlFor="item-type">
            <HbSelect
              id="item-type"
              value={form.type}
              onChange={(e) => onDraftChange({ type: e.target.value })}
            >
              {ITEM_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </HbSelect>
          </HbField>

          <HbField label="Samling" htmlFor="item-collection">
            <HbSelect
              id="item-collection"
              value={form.collection_id ?? ""}
              onChange={(e) => onDraftChange({ collection_id: e.target.value || null })}
            >
              <option value="">Ingen (direkte i området)</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parent_id ? `— ${c.title}` : c.title}
                </option>
              ))}
            </HbSelect>
          </HbField>
        </div>

        <HbField label="Titel" htmlFor="item-title">
          <HbInput
            id="item-title"
            value={form.title}
            onChange={(e) => onDraftChange({ title: e.target.value })}
          />
        </HbField>

        <SlugField
          id="item-slug"
          slug={form.slug}
          title={form.title}
          error={slugError}
          onChange={(slug) => onDraftChange({ slug })}
        />

        <HbField label="Beskrivelse" htmlFor="item-desc" help="Kort — bruges på kort-visninger.">
          <HbTextarea
            id="item-desc"
            rows={2}
            value={form.description ?? ""}
            onChange={(e) => onDraftChange({ description: e.target.value || null })}
          />
        </HbField>

        {form.type === "push_indslag" && (
          /* Push-felterne bor i metadata (fri JSONB-bærer — ingen kolonner):
             author vises i hero'ens byline; expires_at ("YYYY-MM-DD") lader
             hero'en falde tilbage efter udløbsdagens udgang (pickActivePush).
             Tomme værdier fjernes fra metadata (undefined droppes af JSON). */
          <>
            <HbField label="Forfatter" htmlFor="item-author" help="Vises i bylinen på forsidens hero.">
              <HbInput
                id="item-author"
                value={((form.metadata as Record<string, unknown>)?.author as string) ?? ""}
                onChange={(e) =>
                  onDraftChange({
                    metadata: {
                      ...((form.metadata as Record<string, unknown>) ?? {}),
                      author: e.target.value || undefined,
                    },
                  })
                }
              />
            </HbField>

            <HbField
              label="Vises til og med"
              htmlFor="item-expires"
              help="Valgfri — efter denne dag falder hero'en tilbage. Tom = vises til afløst af nyere."
            >
              <HbInput
                id="item-expires"
                type="date"
                value={((form.metadata as Record<string, unknown>)?.expires_at as string) ?? ""}
                onChange={(e) =>
                  onDraftChange({
                    metadata: {
                      ...((form.metadata as Record<string, unknown>) ?? {}),
                      expires_at: e.target.value || undefined,
                    },
                  })
                }
              />
            </HbField>
          </>
        )}

        {/* htmlFor udeladt: richtext/picker/zone har ikke ét labelbart input. */}
        <HbField label="Indhold">
          <HbEditorRichtext
            key={item.id}
            content={form.body ?? ""}
            onChange={(html) => onDraftChange({ body: html })}
          />
        </HbField>

        <HbField label="Medie">
          <HbMediaPicker
            itemId={item.id}
            itemTitle={form.title}
            provider={form.media_provider as "none" | "bunny" | "storage" | "external"}
            bunnyVideoId={form.bunny_video_id}
            storagePath={form.storage_path}
            externalUrl={form.external_url}
            onChange={(patch) => onDraftChange(patch)}
          />
        </HbField>

        <HbField
          label="Materialer"
          help="Filer og links der følger elementet — gemmes straks, uafhængigt af ⌘S. Synlige for medlemmer når elementet publiceres."
        >
          <HbMaterials itemId={item.id} />
        </HbField>

        <div className="grid gap-6 md:grid-cols-2">
          {showDuration && (
            <HbField label="Varighed" htmlFor="item-duration" help="mm:ss — bruges i visning og progress.">
              <div className="flex items-center gap-3">
                <HbInput
                  id="item-duration"
                  value={durationText ?? formatDuration(form.duration_seconds)}
                  onChange={(e) => {
                    setDurationText(e.target.value);
                    onDraftChange({ duration_seconds: parseDuration(e.target.value) });
                  }}
                  onBlur={() => setDurationText(null)}
                  placeholder="12:30"
                />
                {form.media_provider === "bunny" && form.bunny_video_id && (
                  <button
                    type="button"
                    disabled={henterVarighed}
                    onClick={async () => {
                      if (!form.bunny_video_id) return;
                      setHenterVarighed(true);
                      try {
                        const { data, error: fnError } = await supabase.functions.invoke(
                          "bunny-content-admin",
                          { body: { action: "video-info", videoId: form.bunny_video_id } },
                        );
                        if (fnError) throw new Error(fnError.message);
                        const raw = ((data as { raw?: Record<string, unknown> })?.raw ?? {}) as
                          Record<string, unknown>;
                        /* Rækkefølgen er et GÆT på Bunnys feltnavn for
                           varighed — `length` er det mest sandsynlige.
                           Skær listen ned til det rigtige felt, så snart
                           ét kald har bevist hvilket det er. */
                        const kandidater = [
                          raw.length,
                          raw.duration,
                          raw.videoLength,
                          raw.lengthSeconds,
                        ];
                        const sekunder = kandidater.find(
                          (v): v is number => typeof v === "number" && v > 0,
                        );
                        if (sekunder !== undefined) {
                          const rundet = Math.round(sekunder);
                          onDraftChange({ duration_seconds: rundet });
                          setDurationText(formatDuration(rundet));
                          toast.success(`Varighed hentet: ${formatDuration(rundet)}`);
                        } else {
                          /* Det rå svar vises BEVIDST i beskeden: knappen
                             er også efterprøvningen af, hvilke felter
                             Bunny leverer — en generisk fejl ville skjule
                             svaret. */
                          toast.error("Bunny returnerede ingen varighed", {
                            description: JSON.stringify(raw).slice(0, 300),
                          });
                        }
                      } catch (fejl) {
                        toast.error(
                          fejl instanceof Error ? fejl.message : "Kaldet fejlede",
                        );
                      } finally {
                        setHenterVarighed(false);
                      }
                    }}
                    className="flex shrink-0 items-center gap-1.5 text-sm text-hb-ink-soft transition-colors hover:text-hb-ink disabled:opacity-50"
                  >
                    {henterVarighed && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Hent fra Bunny
                  </button>
                )}
              </div>
            </HbField>
          )}

          <HbField
            label="Dryp (dage)"
            htmlFor="item-drip"
            help="Tom = arv fra samlingen. Filtreres i app-laget (B6)."
          >
            <HbInput
              id="item-drip"
              type="number"
              min={0}
              value={form.drip_after_days ?? ""}
              placeholder={inheritedDrip != null ? `arver: ${inheritedDrip}` : "straks"}
              onChange={(e) =>
                onDraftChange({
                  drip_after_days: e.target.value === "" ? null : Math.max(0, parseInt(e.target.value, 10) || 0),
                })
              }
            />
          </HbField>

          {/* Labels læses fra handoutConfig (kodens definitions-sandhed) —
              kun modul-NØGLEN persisteres, så navne aldrig drifter. */}
          <HbField
            label="Handout"
            htmlFor="item-handout"
            help="Kobler elementet til et interaktivt handout — vises som refleksionskort for medlemmet."
          >
            <HbSelect
              id="item-handout"
              value={form.handout_module ?? ""}
              onChange={(e) => onDraftChange({ handout_module: e.target.value || null })}
            >
              <option value="">Intet</option>
              {moduleOrder.map((m) => (
                <option key={m} value={m}>
                  {handoutConfigs[m].title}
                </option>
              ))}
            </HbSelect>
          </HbField>
        </div>

        {form.type === "rabataftale" && (
          <HbField
            label="Partner"
            htmlFor="item-partner"
            help="Aftalen bor i Partnere (B4) — her kobles den, så den kan surfaces i indholdsflows."
          >
            <HbSelect
              id="item-partner"
              value={form.partner_id ?? ""}
              onChange={(e) => onDraftChange({ partner_id: e.target.value || null })}
            >
              <option value="">Vælg partner…</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </HbSelect>
          </HbField>
        )}

        <HbField label="Cover">
          <HbUploadZone
            kind="covers"
            ownerId={item.id}
            currentPath={form.cover_path ?? null}
            accept="image/*"
            onUploaded={(path) => onDraftChange({ cover_path: path })}
          />
        </HbField>
      </EditorShell>
    );
  },
);
ItemEditor.displayName = "ItemEditor";
