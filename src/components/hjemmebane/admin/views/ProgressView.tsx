import * as React from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AREAS,
  MEDLEM_SKJULTE_OMRAADER,
  batchMarker,
  fortrydMarkering,
  listAllMemberProgress,
  listMembers,
  type AdminMember,
  type AdminProgressRow,
  type ContentCollection,
  type ContentItem,
} from "@/lib/hjemmebane/adminContentApi";
import {
  itemProgressState,
  listPublishedCollections,
  listPublishedItems,
  type ItemProgressState,
} from "@/lib/hjemmebane/akademiApi";
import { fortrydMarkeringPatch, markeringsTilstand } from "@/lib/hjemmebane/progressState";
import { brugbarLinje, optaelBrugbarPrLektion, synligeMedlemmer, udelukFraBrugbar } from "@/lib/hjemmebane/lektionBrugbar";
import { detaljeTilstand } from "@/lib/hjemmebane/fremdriftDetalje";
import { kraevRaekker } from "@/lib/kraevRaekker";
import { raadgiverHentefejlTekst } from "@/lib/raadgiverHentefejl";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { isTrackedItem } from "../../akademi/useAkademiData";
import { hbControlClasses } from "../HbField";
import { HbAdminSplit } from "../HbAdminShell";

/** Fremdrift-fanen (advisor-værktøjet): overblik over ALLE medlemmers
    Akademi-fremdrift + rådgiverens markering (enkelt + "Markér hele
    modulet"-batch). F0 (2/10-2026, akademi-grundlag §4): TO tydelige
    tilstande pr. lektion — «set af medlemmet» (hendes EGEN acknowledged_at,
    itemProgressState) og «gennemgået med rådgiver» (markeret_at,
    markeringsTilstand). Rådgiveren skriver KUN markeret_*; medlemmets flader
    ser aldrig markeringen som sin egen fremdrift (før: batchAcknowledge
    skrev acknowledged_at, og medlemmet så «Gennemført» på lektioner, hun
    aldrig havde set). Kun TRACKED items (B1-video) vises og skrives; dryp er
    bevidst droppet i advisor-visningen (råt done/total). Én samlet
    progress-nøgle ["admin-progress"] — samme optimistiske patch opdaterer
    både venstre resumé og højre detalje (PR #166-mønstret). */

export const SET_AF_MEDLEMMET = "set af medlemmet";
export const GENNEMGAAET_MED_RAADGIVER = "gennemgået med rådgiver";

type ProgressKey = `${string}:${string}`;
const keyOf = (userId: string, itemId: string): ProgressKey => `${userId}:${itemId}`;

/** Grupperingen til højre: område → grupper (løse + samlinger i
    forløbsrækkefølge, kursus → moduler) — kun tracked items. */
type ItemGroup = { label: string; items: ContentItem[] };
type AreaBlock = { areaKey: string; areaLabel: string; groups: ItemGroup[] };

function buildAreaBlocks(collections: ContentCollection[], tracked: ContentItem[]): AreaBlock[] {
  const byPosition = <T extends { position: number; created_at: string }>(a: T, b: T) =>
    a.position - b.position || a.created_at.localeCompare(b.created_at);
  const blocks: AreaBlock[] = [];

  // Kun forløbsområder — et evt. bunny-push må aldrig optræde som modul.
  for (const area of AREAS.filter((a) => a.akademi || MEDLEM_SKJULTE_OMRAADER.has(a.key))) {
    const areaItems = tracked.filter((i) => i.area === area.key).sort(byPosition);
    if (areaItems.length === 0) continue;
    const areaCollections = collections.filter((c) => c.area === area.key).sort(byPosition);
    const itemsOf = (collectionId: string | null) =>
      areaItems.filter((i) => (i.collection_id ?? null) === collectionId);

    const groups: ItemGroup[] = [];
    const push = (label: string, items: ContentItem[]) => {
      if (items.length > 0) groups.push({ label, items });
    };
    push("Uden samling", itemsOf(null));
    const seen = new Set(itemsOf(null).map((i) => i.id));
    for (const root of areaCollections.filter((c) => !c.parent_id)) {
      push(root.title, itemsOf(root.id));
      itemsOf(root.id).forEach((i) => seen.add(i.id));
      for (const child of areaCollections.filter((c) => c.parent_id === root.id)) {
        push(`${root.title} — ${child.title}`, itemsOf(child.id));
        itemsOf(child.id).forEach((i) => seen.add(i.id));
      }
    }
    // Items i upublicerede samlinger må ikke forsvinde (samme værn som
    // useAkademiData): hæft dem bagest.
    push("Øvrige", areaItems.filter((i) => !seen.has(i.id)));

    blocks.push({ areaKey: area.key, areaLabel: area.label, groups });
  }
  return blocks;
}

/** Tilstandsprik — samme udtryk som HbItemRow (uden dryp/skip-varianten
    behøver vi kun done/started/untouched + skipped-streg). */
const StateDot = ({ state }: { state: ItemProgressState }) => {
  if (state === "done")
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-hb-evergreen">
        <Check className="h-3 w-3 text-white" />
      </span>
    );
  if (state === "skipped")
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-hb-line">
        <span className="h-0.5 w-2 bg-hb-ink-soft" />
      </span>
    );
  return (
    <span
      className={cn(
        "h-5 w-5 shrink-0 rounded-full border",
        state === "started"
          ? "border-hb-evergreen [background:linear-gradient(90deg,hsl(var(--hb-evergreen))_50%,transparent_50%)]"
          : "border-hb-line",
      )}
    />
  );
};

export const ProgressView = () => {
  const queryClient = useQueryClient();
  // Rådgiveren selv — markeret_af på det, hun markerer (F0).
  const { user } = useAuth();
  const raadgiverId = user?.id ?? "";
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const membersQuery = useQuery({
    queryKey: ["admin-content", "progress", "members"],
    queryFn: listMembers,
  });
  // Deler katalog-cachen med medlemsfladen (samme published-univers).
  const collectionsQuery = useQuery({
    queryKey: ["akademi", "collections"],
    queryFn: listPublishedCollections,
  });
  const itemsQuery = useQuery({ queryKey: ["akademi", "items"], queryFn: listPublishedItems });

  const publishedIds = useMemo(
    () => (itemsQuery.data ?? []).map((i) => i.id),
    [itemsQuery.data],
  );
  const progressQuery = useQuery({
    queryKey: ["admin-progress"],
    queryFn: () => listAllMemberProgress(publishedIds),
    enabled: publishedIds.length > 0,
  });
  // Rådgiverne og ikke-kunders medlemmer udelukkes af «Kunne du bruge
  // den?»-tallet: rådgivernes egne rækker (self-only RLS gælder også dem)
  // må ikke tælle, og heller ikke Topix.dk ApS' (er_kunde = false, som i
  // rådgiverens andre flader). Rådgiverne kommer herfra; ikke-kunderne fra
  // membersQuery (companyErKunde). Samme RPC og kraevRaekker-form som
  // useVirksomhed (:332/:382) — fejler opslaget, vises INGEN tal (aldrig
  // tal uden udelukkelsen).
  const raadgivereQuery = useQuery({
    queryKey: ["admin-progress", "raadgivere"],
    queryFn: async () =>
      (kraevRaekker(await supabase.rpc("get_all_advisor_profiles"), "get_all_advisor_profiles") as { user_id: string }[])
        .map((r) => r.user_id)
        .filter(Boolean),
  });
  // Tal kun når ALLE TRE hentninger er hentet: rådgiverlisten OG
  // medlemslisten (udelukkelsen: rådgiverne og ikke-kunders medlemmer,
  // udelukFraBrugbar — pr. bruger, så et medlem af både en kunde og en
  // ikke-kunde tæller med) OG progress-rækkerne. progressQuery er disabled
  // uden publicerede lektioner — dér er [] det sande svar; ellers er null
  // «ikke klar».
  const brugbarOptaelling = useMemo(() => {
    if (!raadgivereQuery.isSuccess || !membersQuery.isSuccess) return null;
    const udeluk = udelukFraBrugbar(raadgivereQuery.data, membersQuery.data);
    if (progressQuery.isSuccess) return optaelBrugbarPrLektion(progressQuery.data, udeluk);
    if (publishedIds.length === 0) return optaelBrugbarPrLektion([], udeluk);
    return null;
  }, [
    progressQuery.isSuccess,
    progressQuery.data,
    raadgivereQuery.isSuccess,
    raadgivereQuery.data,
    membersQuery.isSuccess,
    membersQuery.data,
    publishedIds.length,
  ]);

  const trackedItems = useMemo(
    () => (itemsQuery.data ?? []).filter(isTrackedItem),
    [itemsQuery.data],
  );
  const areaBlocks = useMemo(
    () => buildAreaBlocks(collectionsQuery.data ?? [], trackedItems),
    [collectionsQuery.data, trackedItems],
  );
  const rowByKey = useMemo(() => {
    const map = new Map<ProgressKey, AdminProgressRow>();
    for (const row of progressQuery.data ?? []) map.set(keyOf(row.user_id, row.content_item_id), row);
    return map;
  }, [progressQuery.data]);

  // Medlemmets EGEN tilstand (F0: itemProgressState ser bort fra rådgiverens
  // stempel) — og rådgiverens markering, hver for sig.
  const stateFor = (userId: string, itemId: string): ItemProgressState =>
    itemProgressState(rowByKey.get(keyOf(userId, itemId)));
  const erGennemgaaet = (userId: string, itemId: string): boolean =>
    markeringsTilstand(rowByKey.get(keyOf(userId, itemId))) === "gennemgaaet";

  // «N af M videoer» tæller kun det, medlemmet KAN se: skjulte områder
  // (Quick Wins, 1/10-2026) står stadig i blokkene til højre, men ikke i
  // tallet — ellers kan intet medlem nå M.
  const synligeTracked = useMemo(
    () => trackedItems.filter((item) => !MEDLEM_SKJULTE_OMRAADER.has(item.area)),
    [trackedItems],
  );
  const doneCount = (userId: string) =>
    synligeTracked.filter((item) => stateFor(userId, item.id) === "done").length;
  const gennemgaaetCount = (userId: string) =>
    synligeTracked.filter((item) => erGennemgaaet(userId, item.id)).length;

  // ── Optimistisk skrivning (PR #166-formen på den samlede nøgle) ─────────
  // Patchen rører KUN markeringskolonnerne — plus det, fortrydMarkeringPatch
  // rydder på en backfillet batch-række. Medlemmets egne felter i cachen
  // står som hentet.
  const patchCache = (
    userId: string,
    patches: { itemId: string; patch: Partial<Pick<AdminProgressRow, "markeret_at" | "markeret_af" | "acknowledged_at" | "seen_at">> }[],
  ) => {
    queryClient.setQueryData<AdminProgressRow[]>(["admin-progress"], (old = []) => {
      const next = [...old];
      for (const { itemId, patch } of patches) {
        const index = next.findIndex((row) => row.user_id === userId && row.content_item_id === itemId);
        if (index >= 0) {
          next[index] = { ...next[index], ...patch };
        } else {
          next.push({
            user_id: userId,
            content_item_id: itemId,
            seen_at: null,
            acknowledged_at: null,
            skipped_at: null,
            markeret_at: null,
            markeret_af: null,
            ...patch,
          });
        }
      }
      return next;
    });
  };

  const setMutation = useMutation({
    mutationFn: ({ userId, itemIds }: { userId: string; itemIds: string[] }) =>
      batchMarker(userId, itemIds, raadgiverId),
    onMutate: async ({ userId, itemIds }) => {
      setError(null);
      await queryClient.cancelQueries({ queryKey: ["admin-progress"] });
      const previous = queryClient.getQueryData<AdminProgressRow[]>(["admin-progress"]);
      const now = new Date().toISOString();
      patchCache(
        userId,
        itemIds.map((itemId) => ({ itemId, patch: { markeret_at: now, markeret_af: raadgiverId } })),
      );
      return { previous };
    },
    onError: (err: Error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(["admin-progress"], context.previous);
      setError(err.message);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["admin-progress"] }),
  });

  const clearMutation = useMutation({
    mutationFn: ({ userId, itemId, raekke }: { userId: string; itemId: string; raekke: AdminProgressRow }) =>
      fortrydMarkering(userId, itemId, raekke),
    onMutate: async ({ userId, itemId, raekke }) => {
      setError(null);
      await queryClient.cancelQueries({ queryKey: ["admin-progress"] });
      const previous = queryClient.getQueryData<AdminProgressRow[]>(["admin-progress"]);
      patchCache(userId, [{ itemId, patch: fortrydMarkeringPatch(raekke) }]);
      return { previous };
    },
    onError: (err: Error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(["admin-progress"], context.previous);
      setError(err.message);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["admin-progress"] }),
  });

  const markerEn = (userId: string, item: ContentItem) => {
    setMutation.mutate({ userId, itemIds: [item.id] });
  };

  /** «Markér hele modulet»: det, rådgiveren ikke har gennemgået endnu —
      uanset om medlemmet selv har set lektionen (de to tilstande er hver sin). */
  const markerManglende = (userId: string, items: ContentItem[]) => {
    const manglende = items.filter((item) => !erGennemgaaet(userId, item.id));
    setMutation.mutate({ userId, itemIds: manglende.map((item) => item.id) });
  };

  const fortrydEn = (userId: string, item: ContentItem) => {
    const raekke = rowByKey.get(keyOf(userId, item.id));
    if (!raekke) return;
    clearMutation.mutate({ userId, itemId: item.id, raekke });
  };

  // ── Venstre: medlemsliste (alfabetisk fra api-laget) ────────────────────
  // Legat-medlemskaber vises ikke på fanen (som før, hvor listMembers
  // filtrerede dem); de kommer kun med til udelukkelsen ovenfor (30/9).
  const members = synligeMedlemmer(membersQuery.data ?? []);
  const query = search.trim().toLowerCase();
  const filteredMembers = query
    ? members.filter(
        (m) => m.name.toLowerCase().includes(query) || m.companyName.toLowerCase().includes(query),
      )
    : members;
  const selectedMember = members.find((m) => m.userId === selectedUserId);
  const loading =
    membersQuery.isLoading || collectionsQuery.isLoading || itemsQuery.isLoading || progressQuery.isLoading;
  // Medlemsdetaljens dom (16/9, fremdriftDetalje.ts): fejler lektionerne,
  // samlingerne eller fremdriften, vises husets fejltekst — aldrig «0 af 0
  // videoer gennemført». Mens der hentes: «Henter…». Tallet og listen med
  // markeringsknapperne findes kun ved «klar».
  const detalje = detaljeTilstand({
    lektioner: itemsQuery,
    samlinger: collectionsQuery,
    fremdrift: progressQuery,
    publiceredeLektioner: publishedIds.length,
  });

  const memberRow = (member: AdminMember) => {
    const active = member.userId === selectedUserId;
    return (
      <button
        key={member.userId}
        type="button"
        onClick={() => setSelectedUserId(member.userId)}
        className={cn(
          "flex w-full items-center gap-3 border-b border-hb-line/60 px-4 py-3 text-left transition-colors",
          active ? "bg-hb-sage/40" : "hover:bg-hb-sage/20",
        )}
      >
        {member.avatarUrl ? (
          <img src={member.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-hb-sage text-xs font-medium text-hb-ink">
            {member.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-hb-ink">{member.name}</span>
          {member.companyName && (
            <span className="block truncate text-xs text-hb-ink-soft">{member.companyName}</span>
          )}
        </span>
        <span className="shrink-0 text-right text-xs text-hb-ink-soft">
          <span className="block">{doneCount(member.userId)} af {synligeTracked.length}</span>
          {gennemgaaetCount(member.userId) > 0 && (
            <span className="block">{gennemgaaetCount(member.userId)} gennemgået</span>
          )}
        </span>
      </button>
    );
  };

  // ── Højre: valgt medlems fremdrift ──────────────────────────────────────
  const detail = selectedMember ? (
    <div className="flex h-full min-h-0 flex-col bg-hb-surface">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 md:px-10">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Fremdrift</p>
          <h2 className="mt-2 truncate font-editorial text-2xl font-medium leading-tight text-hb-ink md:text-3xl">
            {selectedMember.name}
          </h2>
          <p className="mt-1.5 text-sm text-hb-ink-soft">
            {[
              selectedMember.companyName,
              detalje.art === "klar" ? `${doneCount(selectedMember.userId)} af ${synligeTracked.length} videoer ${SET_AF_MEDLEMMET}` : null,
              detalje.art === "klar" ? `${gennemgaaetCount(selectedMember.userId)} ${GENNEMGAAET_MED_RAADGIVER}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {detalje.art === "klar" && (
            <p className="mt-1 text-xs text-hb-ink-soft">
              To tilstande, hver sin: «{SET_AF_MEDLEMMET}» er det, medlemmet selv har set færdigt — det tæller i
              hendes fremdrift. «{GENNEMGAAET_MED_RAADGIVER}» er jeres markering — den tæller ikke som hendes.
            </p>
          )}

          {error && <p className="mt-4 text-sm text-hb-rust">{error}</p>}

          {/* Hentefejl før tallet og listen (16/9): fejlet og «intet set» må
              ikke se ens ud, og knapperne må ikke kunne bruges på en liste
              der ikke er hentet. Skrivefejlen ovenfor står som før. */}
          {detalje.art === "fejl" ? (
            <p className="mt-4 text-sm text-hb-rust">{raadgiverHentefejlTekst(detalje.error, "listen")}</p>
          ) : detalje.art === "henter" ? (
            <p className="mt-4 text-sm text-hb-ink-soft">Henter…</p>
          ) : (
          <div className="mt-8 space-y-10">
            {areaBlocks.map((block) => (
              <section key={block.areaKey}>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
                  {block.areaLabel}
                </p>
                <div className="mt-3 space-y-6">
                  {block.groups.map((group) => {
                    const missing = group.items.filter(
                      (item) => !erGennemgaaet(selectedMember.userId, item.id),
                    ).length;
                    return (
                      <div key={`${block.areaKey}:${group.label}`}>
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="min-w-0 flex-1 truncate font-editorial text-lg font-medium text-hb-ink">
                            {group.label}
                          </h3>
                          <button
                            type="button"
                            onClick={() => markerManglende(selectedMember.userId, group.items)}
                            disabled={missing === 0 || setMutation.isPending}
                            className="shrink-0 rounded-full border border-hb-line px-3.5 py-1.5 text-sm text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink disabled:opacity-40"
                          >
                            Markér hele modulet som gennemgået ({missing})
                          </button>
                        </div>
                        <ul className="mt-2 space-y-1">
                          {group.items.map((item) => {
                            const state = stateFor(selectedMember.userId, item.id);
                            const done = state === "done";
                            const gennemgaaet = erGennemgaaet(selectedMember.userId, item.id);
                            return (
                              <li
                                key={item.id}
                                className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-hb-sage/20"
                              >
                                {/* Prikken er medlemmets EGEN tilstand — aldrig markeringen. */}
                                <StateDot state={state} />
                                <span className="min-w-0 flex-1 truncate text-[15px] text-hb-ink">
                                  {item.title}
                                </span>
                                {done && (
                                  <span
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-hb-sage px-3 py-1 text-xs font-medium text-hb-ink"
                                    title="Medlemmet har selv set lektionen færdig — kun medlemmet kan fortryde det"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                    Set af medlemmet
                                  </span>
                                )}
                                {gennemgaaet ? (
                                  /* Fortryd celle-for-celle — samme rolige
                                     hover-cue som medlemmets egen toggle. */
                                  <button
                                    type="button"
                                    onClick={() => fortrydEn(selectedMember.userId, item)}
                                    title="Klik for at fortryde markeringen"
                                    aria-label={`Gennemgået med rådgiver: ${item.title} — klik for at fortryde`}
                                    className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-hb-evergreen/50 px-3 py-1 text-xs font-medium text-hb-ink transition-colors hover:bg-hb-sage/40"
                                  >
                                    <Check className="h-3.5 w-3.5 group-hover:hidden" />
                                    <Undo2 className="hidden h-3.5 w-3.5 group-hover:block" />
                                    Gennemgået med rådgiver
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => markerEn(selectedMember.userId, item)}
                                    className="shrink-0 rounded-full border border-hb-line px-3 py-1 text-xs text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink"
                                  >
                                    Markér som gennemgået
                                  </button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          )}
        </div>
      </div>
    </div>
  ) : (
    /* Intet medlem valgt (16/9): overblikket «Svar pr. lektion» — tallet fra
       «Kunne du bruge den?» pr. tracked lektion, grupperet som medlems-
       detaljen. Rækkerne er listAllMemberProgress; rådgiverne og
       ikke-kunders medlemmer trækkes fra (udelukFraBrugbar).
       På smal skærm er højre side skjult uden valgt medlem (HbAdminSplit:
       hidden md:block) — overblikket ses dér ikke; ladt være. */
    <div className="flex h-full min-h-0 flex-col bg-hb-surface">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 md:px-10">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Svar pr. lektion</p>
          <p className="mt-2 text-sm leading-relaxed text-hb-ink-soft">
            Medlemmernes svar på «Kunne du bruge den?» efter hver video. Vælg et medlem i listen for
            at se og markere fremdrift.
          </p>

          {/* Kataloget først: fejler items eller collections, er areaBlocks
              tomme, og uden denne gren ligner en fejlet hentning «ingen
              lektioner». Tom og fejlet må ikke se ens ud. */}
          {itemsQuery.isError || collectionsQuery.isError ? (
            <p className="mt-4 text-sm text-hb-rust">
              {raadgiverHentefejlTekst(itemsQuery.isError ? itemsQuery.error : collectionsQuery.error, "listen")}
            </p>
          ) : raadgivereQuery.isError ? (
            <p className="mt-4 text-sm text-hb-rust">{raadgiverHentefejlTekst(raadgivereQuery.error, "listen")}</p>
          ) : membersQuery.isError ? (
            <p className="mt-4 text-sm text-hb-rust">{raadgiverHentefejlTekst(membersQuery.error, "listen")}</p>
          ) : progressQuery.isError ? (
            <p className="mt-4 text-sm text-hb-rust">{raadgiverHentefejlTekst(progressQuery.error, "listen")}</p>
          ) : itemsQuery.isSuccess && publishedIds.length === 0 ? (
            /* Ingen publicerede lektioner: kun eyebrow og indledning — aldrig «Henter…» for evigt. */
            null
          ) : brugbarOptaelling === null || loading ? (
            <p className="mt-4 text-sm text-hb-ink-soft">Henter…</p>
          ) : (
            <div className="mt-8 space-y-10">
              {areaBlocks.map((block) => (
                <section key={block.areaKey}>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
                    {block.areaLabel}
                  </p>
                  <div className="mt-3 space-y-6">
                    {block.groups.map((group) => (
                      <div key={`${block.areaKey}:${group.label}`}>
                        <h3 className="min-w-0 truncate font-editorial text-lg font-medium text-hb-ink">
                          {group.label}
                        </h3>
                        <ul className="mt-2 space-y-1">
                          {group.items.map((item) => (
                            <li key={item.id} className="rounded-lg px-2 py-1.5">
                              <p className="truncate text-[15px] text-hb-ink">{item.title}</p>
                              <p className="text-xs text-hb-ink-soft">{brugbarLinje(brugbarOptaelling[item.id])}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <HbAdminSplit
      editorOpen={selectedUserId !== null}
      onCloseEditor={() => setSelectedUserId(null)}
      list={
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b border-hb-line px-4 py-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Søg medlem eller virksomhed…"
              aria-label="Søg medlem eller virksomhed"
              className={cn(hbControlClasses, "py-2 text-sm")}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-sm text-hb-ink-soft">Henter…</p>
            ) : filteredMembers.length === 0 ? (
              <p className="px-4 py-6 text-sm text-hb-ink-soft">Ingen medlemmer matcher.</p>
            ) : (
              filteredMembers.map(memberRow)
            )}
          </div>
        </div>
      }
      editor={detail}
    />
  );
};
