import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ImageIcon, Loader2, Reply } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { HbButton } from "../../HbButton";
import { HbTag } from "../../HbTag";
import { HbAdminSplit } from "../HbAdminShell";
import { HbField, HbSelect, HbTextarea } from "../HbField";
import { HbSegmented } from "../HbSegmented";
import { useAdminHotkeys } from "../useAdminHotkeys";
import { EditorEmptyState, EditorShell } from "../editors/shared";

/**
 * Feedback i Hjemmebane (4/9) — konvertering af src/pages/AdminFeedback.tsx
 * (målt 4/9: 587 linjer, FEM portaler — 1 Dialog, 1 AlertDialog, 2 Select,
 * 1 Tooltip — to tabeller på syv kolonner, to textarea; næstdyrest af de
 * otte). Queries, mutationer, svar-skrivningen i `messages`, deep-linket
 * og teksterne står som i den gamle fil — kun udtrykket er nyt.
 *
 * MÅLT SAMME DAG, og det former fladen: Jonas åbner den aldrig — «Feedback
 * får jeg en melding på i Slack, og der er ikke kommet feedback i lang tid.
 * Jeg tror ikke den er nok integreret i platformen til at det er noget
 * medlemmerne skal bruge.» Om funktionen skal gentænkes er en anden
 * samtale; denne fil konverterer udtrykket. Derfor er fladen bygget som
 * det roligste splittet kan: liste, detalje, ingen pynt.
 *
 * SKALLEN er HbMemberShell (layout="fuld", som LegatView) — siden er et
 * «Platform»-punkt i admin-blokken, ikke en af HbAdminShells otte
 * indholdssektioner. Menuen røres ikke (se AdminFeedback.tsx).
 *
 * DIALOGEN (:463, detalje med svar) ER BLEVET HbAdminSplit: liste til
 * venstre, detalje til højre — man flytter fokus, man skifter ikke side.
 * Det er præcis den form splittet er lavet til, og det fjerner en portal.
 * Detaljen er en EditorShell (eyebrow = kategori, titel, meta-linje) med
 * beskrivelse, screenshot, status, svar til bruger og intern note; fast
 * bundlinje med Slet / Luk / Gem note som før.
 *
 * ALERTDIALOG (:564, slet) er INLINE i bundlinjen — DeleteSpec-formen fra
 * EditorBar (editors/shared.tsx:129-172): spørgsmålet, «Annullér» og en
 * rust-knap tager handlingernes plads. Teksten er den gamle dialogs.
 * TOOLTIP (:133, «Besvaret via chat») er `title` på ikonet, som
 * HbEditorRichtext gør. DE TO SELECT: kategorifilteret (fire valg: alle,
 * bug, forslag, andet) er HbSegmented — få valg, alle synlige på én gang,
 * som ReviewQueueView; status pr. række (tre valg) er HbSelect (native),
 * fordi den står inde i hver række, hvor tre synlige segmenter ville
 * fylde mere end titlen. Status kan også skiftes i detaljen (samme kald).
 *
 * DE TO TABELLER (aktiv og løst, syv kolonner hver) ER BLEVET ÉN LISTE
 * MED EN FOLD. Splittets venstre kolonne er 380 px (HbAdminSplit) — to
 * tabeller på syv kolonner får ikke plads, og rækken er alligevel dét man
 * skimmer: titel + status øverst, kategori · virksomhed · bruger · dato
 * som dæmpet meta-linje under (samme syv felter, samme rækkefølge).
 * «Løst (N)» er en fold NEDERST i samme liste, lukket som før
 * (resolvedExpanded), åbnet af deep-linket — HbTreeLists «Arkiv»-form
 * (HbTreeList.tsx:164-174). Ét filter oveni ville have kostet den gamle
 * sides adfærd: aktiv altid synlig, løst ude af vejen. Folden bevarer den.
 *
 * SCREENSHOT (:57, ScreenshotImage) henter en signeret URL fra storage.
 * Intet Hb-forbillede; bygget enklest muligt — og med RESERVERET PLADS:
 * rammen (h-24 × w-40) står fra første render, billedet lander i den
 * (object-cover), så intet indhold flytter sig når URL'en kommer
 * (fælden fra chat-hoppet, #639). Klik åbner originalen i ny fane som før.
 */

type FeedbackItem = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  admin_note: string | null;
  screenshot_path: string | null;
  user_id: string;
  company_id: string | null;
  created_at: string;
  companies?: { name: string | null } | null;
  profile: { full_name: string; email: string | null } | null;
};

const categoryConfig: Record<string, { label: string; klasse: string }> = {
  bug: { label: "Bug", klasse: "bg-hb-rust/10 text-hb-rust" },
  suggestion: { label: "Forslag", klasse: "bg-hb-sage text-hb-ink" },
  other: { label: "Andet", klasse: "border border-hb-line bg-hb-paper text-hb-ink-soft" },
};

const statusConfig: Record<string, { label: string; klasse: string }> = {
  new: { label: "Ny", klasse: "bg-hb-evergreen/10 text-hb-evergreen" },
  acknowledged: { label: "Set", klasse: "border border-hb-line bg-hb-paper text-hb-ink" },
  resolved: { label: "Løst", klasse: "bg-hb-line/60 text-hb-ink-soft" },
};

const KATEGORI_VALG = [
  { value: "all", label: "Alle kategorier" },
  { value: "bug", label: "Bug" },
  { value: "suggestion", label: "Forslag" },
  { value: "other", label: "Andet" },
];

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });

/** Signeret URL fra storage — rammen er reserveret fra første render,
    så billedet ikke flytter noget når det lander. */
const ScreenshotImage = ({ path }: { path: string }) => {
  const { data: url } = useQuery({
    queryKey: ["feedback-screenshot", path],
    queryFn: async () => {
      const { data } = await supabase.storage
        .from("feedback-screenshots")
        .createSignedUrl(path, 3600);
      return data?.signedUrl || null;
    },
  });
  const ramme = "block h-24 w-40 shrink-0 overflow-hidden rounded-lg border border-hb-line bg-hb-sage/30";
  if (!url) return <span aria-hidden className={ramme} />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={cn(ramme, "transition-opacity hover:opacity-80")}>
      <img src={url} alt="Feedback screenshot" className="h-full w-full object-cover" />
    </a>
  );
};

const RaekkeSkelet = () => (
  <div aria-hidden className="border-b border-hb-line/60 px-4 py-3">
    <div className="h-4 w-3/5 animate-pulse rounded bg-hb-line/60" />
    <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-hb-line/40" />
  </div>
);

export const FeedbackView = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [searchParams, setSearchParams] = useSearchParams();
  const [filterCategory, setFilterCategory] = useState<string>("all");
  // Detaljen er valgt pr. id og læses fra listen, så statusskift og
  // sletning afspejles med det samme (den gamle Dialog holdt en kopi).
  const [detailId, setDetailId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [bekraeftSlet, setBekraeftSlet] = useState(false);
  const [resolvedExpanded, setResolvedExpanded] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const highlightId = searchParams.get("feedbackId");

  const { data: feedbackItems = [], isLoading } = useQuery({
    queryKey: ["admin-feedback", filterCategory],
    queryFn: async () => {
      let query = supabase
        .from("feedback")
        .select("*, companies(name)")
        .order("created_at", { ascending: false });

      if (filterCategory !== "all") query = query.eq("category", filterCategory);

      const { data, error } = await query;
      if (error) throw error;

      const userIds = [...new Set((data || []).map((d: any) => d.user_id))];
      let profileMap: Record<string, { full_name: string; email: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", userIds);
        for (const p of profiles || []) {
          profileMap[p.user_id] = { full_name: p.full_name, email: p.email };
        }
      }

      return (data || []).map((item: any) => ({
        ...item,
        profile: profileMap[item.user_id] || null,
      })) as FeedbackItem[];
    },
  });

  // Fetch feedback IDs that have been replied to via chat
  const { data: repliedIds } = useQuery({
    queryKey: ["feedback-replied-ids"],
    queryFn: async () => {
      const { data } = await supabase
        .from("messages")
        .select("context_id")
        .eq("context_type", "feedback")
        .not("context_id", "is", null);
      return new Set((data || []).map((m: any) => m.context_id));
    },
  });
  const repliedSet = repliedIds || new Set<string>();

  const openDetail = (item: FeedbackItem) => {
    setDetailId(item.id);
    setAdminNote(item.admin_note || "");
    setReplyText("");
    setBekraeftSlet(false);
  };

  // Deep-link: auto-open feedback item from URL param
  useEffect(() => {
    if (!highlightId || feedbackItems.length === 0) return;
    const target = feedbackItems.find((i) => i.id === highlightId);
    if (target) {
      // If it's resolved, expand the resolved section
      if (target.status === "resolved") setResolvedExpanded(true);
      // Open detail
      openDetail(target);
      // Scroll to row
      setTimeout(() => {
        document.getElementById(`feedback-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      // Clear param so it doesn't re-trigger
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, feedbackItems]);

  const activeItems = useMemo(() => feedbackItems.filter((i) => i.status !== "resolved"), [feedbackItems]);
  const resolvedItems = useMemo(() => feedbackItems.filter((i) => i.status === "resolved"), [feedbackItems]);
  const detailItem = detailId ? feedbackItems.find((i) => i.id === detailId) ?? null : null;

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, admin_note, resolved_at }: { id: string; status: string; admin_note?: string; resolved_at?: string | null }) => {
      const updates: any = { status };
      if (admin_note !== undefined) updates.admin_note = admin_note;
      if (resolved_at !== undefined) updates.resolved_at = resolved_at;
      const { error } = await supabase.from("feedback").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-feedback"] });
      queryClient.invalidateQueries({ queryKey: ["feedback-count"] });
      toast.success("Feedback opdateret");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("feedback").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-feedback"] });
      queryClient.invalidateQueries({ queryKey: ["feedback-count"] });
      toast.success("Feedback slettet");
      setDetailId(null);
      setBekraeftSlet(false);
    },
  });

  const handleStatusChange = (item: FeedbackItem, newStatus: string) => {
    updateMutation.mutate({
      id: item.id,
      status: newStatus,
      resolved_at: newStatus === "resolved" ? new Date().toISOString() : null,
    });
  };

  const handleSaveNote = () => {
    if (!detailItem) return;
    updateMutation.mutate({
      id: detailItem.id,
      status: detailItem.status,
      admin_note: adminNote,
    });
    setDetailId(null);
  };

  const handleSendReply = async () => {
    if (!detailItem || !replyText.trim() || !user) return;
    setReplySending(true);
    try {
      // Find the user's conversation
      const { data: conv } = await supabase
        .from("conversations")
        .select("id")
        .eq("member_id", detailItem.user_id)
        .limit(1)
        .maybeSingle();

      let conversationId: string;
      if (!conv) {
        // Try via company_id
        const { data: companyConv } = await supabase
          .from("conversations")
          .select("id")
          .eq("company_id", detailItem.company_id!)
          .limit(1)
          .maybeSingle();
        if (!companyConv) {
          toast.error("Ingen samtale fundet", { description: "Brugeren har ikke en aktiv samtale." });
          setReplySending(false);
          return;
        }
        conversationId = companyConv.id;
      } else {
        conversationId = conv.id;
      }

      const categoryLabel = categoryConfig[detailItem.category]?.label || "Feedback";
      const contextMessage = `💬 **Svar på ${categoryLabel.toLowerCase()}: "${detailItem.title}"**\n\n${replyText.trim()}`;

      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: contextMessage,
        message_type: "user",
        context_type: "feedback",
        context_id: detailItem.id,
      });

      if (error) throw error;

      // Auto-acknowledge if still "new"
      if (detailItem.status === "new") {
        updateMutation.mutate({ id: detailItem.id, status: "acknowledged" });
      }

      toast.success("Svar sendt", { description: "Beskeden er sendt i brugerens samtale." });
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["feedback-replied-ids"] });
    } catch (err) {
      console.error("Reply error:", err);
      toast.error("Fejl", { description: "Kunne ikke sende svaret. Prøv igen." });
    } finally {
      setReplySending(false);
    }
  };

  useAdminHotkeys({
    onEscape: () => setDetailId(null),
  });

  // ── Venstre: rækken ────────────────────────────────────────────────────
  const raekke = (item: FeedbackItem, loest: boolean) => {
    const cat = categoryConfig[item.category] || categoryConfig.other;
    const valgt = item.id === detailId;
    return (
      <div
        key={item.id}
        id={`feedback-${item.id}`}
        role="button"
        tabIndex={0}
        onClick={() => openDetail(item)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openDetail(item);
          }
        }}
        className={cn(
          "cursor-pointer border-b border-hb-line/60 px-4 py-3 transition-colors",
          valgt ? "bg-hb-sage/40" : "hover:bg-hb-sage/20",
          loest && "opacity-70",
        )}
      >
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm text-hb-ink">{item.title}</p>
          {/* Tooltip'en (:133) er title på et span — lucide-ikoner tager
              ikke title selv. */}
          {repliedSet.has(item.id) && (
            <span title="Besvaret via chat" aria-label="Besvaret via chat" className="flex shrink-0">
              <Reply className="h-3.5 w-3.5 text-hb-evergreen" />
            </span>
          )}
          {item.screenshot_path && (
            <span title="Har screenshot" aria-label="Har screenshot" className="flex shrink-0">
              <ImageIcon className="h-3.5 w-3.5 text-hb-ink-soft" />
            </span>
          )}
          {/* Status pr. række — samme tre valg og samme kald som før
              (:158-173). Native select; klik må ikke åbne detaljen. */}
          <HbSelect
            value={item.status}
            onChange={(e) => handleStatusChange(item, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label="Status"
            className="h-7 w-auto shrink-0 rounded-full px-2 py-0 text-xs"
          >
            <option value="new">Ny</option>
            <option value="acknowledged">Set</option>
            <option value="resolved">Løst</option>
          </HbSelect>
        </div>
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-hb-ink-soft">
          <HbTag className={cn("shrink-0 px-1.5 py-0 text-[10px]", cat.klasse)}>{cat.label}</HbTag>
          <span className="truncate">
            {item.companies?.name || "—"} · {item.profile?.full_name || item.profile?.email || "—"} · {formatDate(item.created_at)}
          </span>
        </p>
      </div>
    );
  };

  const liste = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 pb-3 pt-4">
        <h1 className="font-editorial text-2xl font-medium leading-tight text-hb-ink">Feedback</h1>
        <p className="mt-0.5 text-xs text-hb-ink-soft">Overblik over feedback fra virksomheder</p>
        <HbSegmented
          aria-label="Kategori"
          value={filterCategory}
          options={KATEGORI_VALG}
          onChange={setFilterCategory}
          className="mt-3"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {isLoading ? (
          <>
            <RaekkeSkelet />
            <RaekkeSkelet />
            <RaekkeSkelet />
          </>
        ) : feedbackItems.length === 0 ? (
          <p className="px-4 py-8 text-sm text-hb-ink-soft">Ingen feedback fundet</p>
        ) : (
          <>
            <p className="px-4 pb-1 pt-2 text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
              Aktiv ({activeItems.length})
            </p>
            {activeItems.length > 0 ? (
              activeItems.map((item) => raekke(item, false))
            ) : (
              <p className="px-4 py-6 text-sm text-hb-ink-soft">Ingen aktiv feedback</p>
            )}

            {/* Løst — folden nederst, lukket som før; deep-linket åbner den. */}
            {resolvedItems.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setResolvedExpanded(!resolvedExpanded)}
                  aria-expanded={resolvedExpanded}
                  className="mt-3 flex w-full items-center gap-1.5 px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft transition-colors hover:text-hb-ink"
                >
                  <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", resolvedExpanded && "rotate-90")} />
                  Løst ({resolvedItems.length})
                </button>
                {resolvedExpanded && resolvedItems.map((item) => raekke(item, true))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );

  // ── Højre: detaljen ────────────────────────────────────────────────────
  const detalje = (item: FeedbackItem) => {
    const cat = categoryConfig[item.category] || categoryConfig.other;
    const meta = [
      item.profile?.full_name || "—",
      item.companies?.name || "—",
      formatDate(item.created_at),
      repliedSet.has(item.id) ? "Besvaret via chat" : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return (
      <EditorShell
        eyebrow={cat.label}
        title={item.title}
        meta={meta}
        footer={
          bekraeftSlet ? (
            /* DeleteSpec-formen, inline i bundlinjen. Teksten er den gamle
               AlertDialogs (:567-570). */
            <div className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-2">
              <p className="min-w-0 flex-1 text-sm text-hb-ink">
                Er du sikker på at du vil slette "{item.title}"?{" "}
                <span className="text-hb-ink-soft">Handlingen kan ikke fortrydes.</span>
              </p>
              <div className="flex items-center gap-2">
                <HbButton
                  variant="secondary"
                  className="h-9 px-4 text-sm"
                  onClick={() => setBekraeftSlet(false)}
                  disabled={deleteMutation.isPending}
                >
                  Annullér
                </HbButton>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(item.id)}
                  disabled={deleteMutation.isPending}
                  className="inline-flex h-9 items-center rounded-full bg-hb-rust px-4 text-sm font-medium text-white transition-colors hover:bg-hb-rust/90 disabled:pointer-events-none disabled:opacity-50"
                >
                  {deleteMutation.isPending ? "Sletter…" : "Slet"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button
                type="button"
                onClick={() => setBekraeftSlet(true)}
                className="px-2 text-sm text-hb-ink-soft underline-offset-4 transition-colors hover:text-hb-rust hover:underline"
              >
                Slet
              </button>
              <div className="ml-auto flex items-center gap-2">
                <HbButton variant="secondary" className="h-9 px-4 text-sm" onClick={() => setDetailId(null)}>
                  Luk
                </HbButton>
                <HbButton className="h-9 px-5 text-sm" onClick={handleSaveNote} disabled={updateMutation.isPending}>
                  Gem note
                </HbButton>
              </div>
            </div>
          )
        }
      >
        {/* Beskrivelse + screenshot inline, som før (:490-501) */}
        {(item.description || item.screenshot_path) && (
          <div className="flex flex-wrap items-start gap-4">
            {item.description && (
              <p className="min-w-0 flex-1 whitespace-pre-wrap rounded-lg bg-hb-sage/30 p-3 text-sm leading-relaxed text-hb-ink">
                {item.description}
              </p>
            )}
            {item.screenshot_path && <ScreenshotImage path={item.screenshot_path} />}
          </div>
        )}

        <HbField label="Status" htmlFor="feedback-status" className="max-w-xs">
          <HbSelect
            id="feedback-status"
            value={item.status}
            onChange={(e) => handleStatusChange(item, e.target.value)}
          >
            <option value="new">Ny</option>
            <option value="acknowledged">Set</option>
            <option value="resolved">Løst</option>
          </HbSelect>
        </HbField>

        {/* Svar til bruger — kun med company_id, som før (:504) */}
        {item.company_id && (
          <HbField label="Svar til bruger" htmlFor="feedback-svar" help="Sendes i brugerens samtale.">
            <div className="flex items-end gap-2">
              <HbTextarea
                id="feedback-svar"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Skriv et svar der sendes i brugerens samtale…"
                rows={2}
              />
              <HbButton
                className="h-11 shrink-0 px-5 text-sm"
                onClick={handleSendReply}
                disabled={!replyText.trim() || replySending}
              >
                {replySending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Send
              </HbButton>
            </div>
          </HbField>
        )}

        <HbField label="Intern note" htmlFor="feedback-note">
          <HbTextarea
            id="feedback-note"
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="Tilføj en intern note…"
            rows={3}
          />
        </HbField>
      </EditorShell>
    );
  };

  return (
    <HbAdminSplit
      editorOpen={detailItem !== null}
      onCloseEditor={() => setDetailId(null)}
      list={liste}
      editor={
        detailItem ? (
          detalje(detailItem)
        ) : (
          <EditorEmptyState hints={[["esc", "luk"]]} />
        )
      }
    />
  );
};
