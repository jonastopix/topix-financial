import * as React from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { HbButton } from "../../HbButton";
import { HbTag } from "../../HbTag";
import { HbProgressBar } from "../../akademi/HbProgressBar";
import { HbAdminSplit } from "../HbAdminShell";
import { HbField, HbInput, HbTextarea } from "../HbField";
import { useAdminHotkeys } from "../useAdminHotkeys";
import { EditorEmptyState, EditorShell } from "../editors/shared";

/**
 * Legat i Hjemmebane (4/9) — konvertering af src/pages/AdminLegat.tsx,
 * den letteste af de otte gamle admin-sider (målt 4/9: 377 linjer, nul
 * Radix-portaler, ingen tabel, otte felter). ALT hvad siden gjorde er
 * med: opret forløb (create-legat-enrollment), aktive tilmeldinger,
 * handout-fremdrift pr. tilmelding, opgradér til member
 * (upgrade-legat-to-member), annullér, afsluttede forløb. Queries,
 * mutationer, valideringer og tekster står som i den gamle fil — kun
 * udtrykket er nyt.
 *
 * FORMEN er HbAdminSplit (liste til venstre, detalje til højre — man
 * flytter fokus, man skifter ikke side), hvor den gamle side foldede
 * kortet ud INLINE (:178). Indholdet passer: én tilmelding ad gangen har
 * fremdrift, datoer og en opgradér-formular — det er en detalje, ikke en
 * række. «Nyt forløb» åbner opret-formularen i samme højre felt frem for
 * som en boks over listen; samme felter, samme knap, samme validering.
 *
 * SKALLEN er HbMemberShell (layout="fuld", så splittet får bundet højde
 * som chatten), ikke HbAdminShell: Legat hører ikke til admin-
 * sektionsnavigationen (HbAdminShell.SECTIONS er de otte indholds-
 * sektioner under /admin/indhold), men til admin-blokkens «Platform» i
 * HbMemberShell (:208). Menuen røres ikke i denne PR — om punktet
 * overhovedet bliver i menuen måles i det andet vindue — så siden
 * markerer intet nav-punkt aktivt (se AdminLegat.tsx).
 *
 * FREMDRIFTEN pr. handout er StateDot-formen fra HbItemRow/ProgressView
 * (● færdig · ◐ i gang · ○ ikke startet; låst = nedtonet med «Dag N»).
 * De rå tailwind-farver (bg-emerald-500 / bg-amber-500, gamle :190, :194)
 * er oversat: evergreen bærer «færdig», den halvfyldte prik bærer «i
 * gang» uden egen farve — Hjemmebane bruger få farver med vilje. Den
 * gamle procent-ring i kortets hoved er blevet HbProgressBar («N af 5»,
 * ingen procenter — Akademi-formen); tallene Dag X/10 og N/5 står i
 * listen som før.
 *
 * Ingen generisk Hb-liste findes (målt 4/9) — listen er inline som i
 * VirksomhedslisteView og ProgressView (memberRow), i HbTreeLists
 * rækkeudtryk. HbTreeList selv er ikke brugt: dens HbStatusDot kender
 * kun draft/published/archived/cancelled/completed og ville sætte
 * forkerte titler («Kladde», «Afholdt») på active/upgraded.
 */

const HANDOUT_MODULES = [
  { key: "overordnet", label: "Intro & Målsætning", day: 1 },
  { key: "bogholderi", label: "Bogholderi & Økonomi", day: 3 },
  { key: "administration", label: "Administration & Kundeservice", day: 5 },
  { key: "salg", label: "Salg", day: 7 },
  { key: "marketing", label: "Marketing", day: 9 },
];

function getDayNumber(startDate: string) {
  return Math.min(
    Math.max(
      Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000) + 1,
      1
    ),
    10
  );
}

const NY = "ny";

const tomtForm = () => ({
  full_name: "",
  email: "",
  company_name: "",
  start_date: new Date().toISOString().split("T")[0],
  notes: "",
});

type UpgradeForm = { company_name: string; cvr_number: string; industry_label: string };

const formatStartdato = (iso: string) =>
  new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" });

/** Tilstandsprik — samme udtryk som HbItemRow/ProgressView: ● færdig,
    ◐ i gang, ○ ikke startet. Låste moduler nedtones af rækken. */
const StateDot = ({ state }: { state: "done" | "started" | "untouched" }) => {
  if (state === "done")
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-hb-evergreen">
        <Check className="h-3 w-3 text-white" />
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

const StatusTag = ({ status }: { status: string }) => {
  if (status === "upgraded") {
    return <HbTag className="bg-hb-evergreen/10 px-2 py-0.5 text-[11px] text-hb-evergreen">Member</HbTag>;
  }
  if (status === "cancelled") {
    return <HbTag className="bg-hb-line/60 px-2 py-0.5 text-[11px] text-hb-ink-soft">Annulleret</HbTag>;
  }
  return null;
};

export const LegatView = () => {
  const queryClient = useQueryClient();
  // Valgt i listen: en tilmeldings id, NY for opret-formularen, null = tomt.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(tomtForm);
  const [upgradeForm, setUpgradeForm] = useState<Record<string, UpgradeForm>>({});

  const { data: enrollments = [], isLoading } = useQuery({
    queryKey: ["admin-legat-enrollments"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("legat_enrollments")
        .select(`
          id, user_id, company_id, start_date, status,
          momentumkald_booked, notes, created_at, upgraded_at,
          companies(name),
          profiles:user_id(full_name, email)
        `)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: handoutProgress = {} } = useQuery({
    queryKey: ["admin-legat-handout-progress"],
    queryFn: async () => {
      if (!enrollments.length) return {};
      const userIds = enrollments.map((e: any) => e.user_id);
      const { data } = await supabase
        .from("handouts")
        .select("user_id, module, status")
        .in("user_id", userIds);
      const map: Record<string, Record<string, string>> = {};
      for (const h of data || []) {
        if (!map[h.user_id]) map[h.user_id] = {};
        map[h.user_id][h.module] = h.status;
      }
      return map;
    },
    enabled: enrollments.length > 0,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("create-legat-enrollment", {
        body: form,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success(`Legatforløb oprettet for ${form.full_name}`);
      queryClient.invalidateQueries({ queryKey: ["admin-legat-enrollments"] });
      setSelectedId(null);
      setForm(tomtForm());
    },
    onError: (err: any) => {
      toast.error(`Fejl: ${err.message}`);
    },
  });

  const upgradeMutation = useMutation({
    mutationFn: async ({ userId, uf }: { userId: string; uf: UpgradeForm }) => {
      const { data, error } = await supabase.functions.invoke("upgrade-legat-to-member", {
        body: { user_id: userId, ...uf },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Legatmodtager opgraderet til member");
      queryClient.invalidateQueries({ queryKey: ["admin-legat-enrollments"] });
      setSelectedId(null);
    },
    onError: (err: any) => {
      toast.error(`Fejl: ${err.message}`);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (enrollmentId: string) => {
      const { error } = await (supabase as any)
        .from("legat_enrollments")
        .update({ status: "cancelled" })
        .eq("id", enrollmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Forløb annulleret");
      queryClient.invalidateQueries({ queryKey: ["admin-legat-enrollments"] });
    },
  });

  const activeEnrollments = enrollments.filter((e: any) => e.status === "active");
  const pastEnrollments = enrollments.filter((e: any) => e.status !== "active");
  const selected = selectedId && selectedId !== NY ? enrollments.find((e: any) => e.id === selectedId) : undefined;

  useAdminHotkeys({
    onNew: () => setSelectedId(NY),
    onEscape: () => setSelectedId(null),
  });

  const completedFor = (e: any) =>
    HANDOUT_MODULES.filter((m) => (handoutProgress[e.user_id] || {})[m.key] === "completed").length;

  // ── Venstre: listen ───────────────────────────────────────────────────
  const raekke = (e: any) => {
    const valgt = e.id === selectedId;
    const day = e.status === "active" ? getDayNumber(e.start_date) : null;
    return (
      <button
        key={e.id}
        type="button"
        onClick={() => setSelectedId(e.id)}
        className={cn(
          "flex w-full items-center gap-3 border-b border-hb-line/60 px-4 py-3 text-left transition-colors",
          valgt ? "bg-hb-sage/40" : "hover:bg-hb-sage/20",
          e.status !== "active" && "opacity-70",
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-hb-sage text-xs font-medium text-hb-ink">
          {(e.profiles?.full_name || "?").slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-hb-ink">{e.profiles?.full_name || "Ukendt"}</span>
          <span className="block truncate text-xs text-hb-ink-soft">
            {e.profiles?.email || ""} · {e.companies?.name || ""}
          </span>
        </span>
        {e.status === "active" ? (
          <span className="shrink-0 text-right text-xs text-hb-ink-soft">
            <span className="block text-hb-ink">Dag {day}/10</span>
            {completedFor(e)}/5 handouts
          </span>
        ) : (
          <StatusTag status={e.status} />
        )}
      </button>
    );
  };

  const liste = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-editorial text-2xl font-medium leading-tight text-hb-ink">Legat</h1>
          <p className="mt-0.5 text-xs text-hb-ink-soft">{activeEnrollments.length} aktive forløb</p>
        </div>
        <button
          type="button"
          onClick={() => setSelectedId(NY)}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full border px-3 py-2 text-sm transition-colors",
            selectedId === NY
              ? "border-hb-evergreen bg-hb-sage/40 text-hb-ink"
              : "border-hb-line text-hb-ink-soft hover:bg-hb-sage/30 hover:text-hb-ink",
          )}
        >
          <Plus className="h-3.5 w-3.5" /> Nyt forløb
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {isLoading ? (
          <div aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="border-b border-hb-line/60 px-4 py-3">
                <div className="h-4 w-2/5 animate-pulse rounded bg-hb-line/60" />
                <div className="mt-2 h-3 w-3/5 animate-pulse rounded bg-hb-line/40" />
              </div>
            ))}
          </div>
        ) : activeEnrollments.length === 0 ? (
          <div className="px-4 py-8">
            <p className="text-sm text-hb-ink-soft">Ingen aktive legatforløb</p>
            <p className="mt-1 text-xs text-hb-ink-soft/70">Klik "Nyt forløb" for at oprette det første</p>
          </div>
        ) : (
          activeEnrollments.map(raekke)
        )}

        {pastEnrollments.length > 0 && (
          <>
            <p className="px-4 pb-1 pt-5 text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
              Afsluttede forløb
            </p>
            {pastEnrollments.map(raekke)}
          </>
        )}
      </div>
    </div>
  );

  // ── Højre: opret-formularen ───────────────────────────────────────────
  const opret = (
    <EditorShell
      eyebrow="Nyt forløb"
      title="Opret legatforløb"
      meta="Medlemmet får en velkomstmail når forløbet er oprettet."
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <HbButton
            variant="secondary"
            className="h-9 px-4 text-sm"
            onClick={() => setSelectedId(null)}
            disabled={createMutation.isPending}
          >
            Annullér
          </HbButton>
          <HbButton
            className="h-9 px-5 text-sm"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !form.full_name || !form.email}
          >
            {createMutation.isPending ? "Opretter..." : "Opret og send velkomstmail"}
          </HbButton>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <HbField label="Fulde navn *" htmlFor="legat-navn">
          <HbInput
            id="legat-navn"
            placeholder="Fulde navn *"
            value={form.full_name}
            onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
          />
        </HbField>
        <HbField label="Email *" htmlFor="legat-email">
          <HbInput
            id="legat-email"
            type="email"
            placeholder="Email *"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          />
        </HbField>
        <HbField label="Virksomhed" htmlFor="legat-virksomhed">
          <HbInput
            id="legat-virksomhed"
            placeholder="Virksomhed (valgfrit)"
            value={form.company_name}
            onChange={(e) => setForm((p) => ({ ...p, company_name: e.target.value }))}
          />
        </HbField>
        <HbField label="Startdato" htmlFor="legat-startdato">
          <HbInput
            id="legat-startdato"
            type="date"
            value={form.start_date}
            onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
          />
        </HbField>
      </div>
      <HbField label="Note" htmlFor="legat-note">
        <HbTextarea
          id="legat-note"
          placeholder="Note (valgfrit)"
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
        />
      </HbField>
    </EditorShell>
  );

  // ── Højre: den valgte tilmelding ──────────────────────────────────────
  const detalje = (e: any) => {
    const progress = handoutProgress[e.user_id] || {};
    const completedCount = completedFor(e);
    const uf: UpgradeForm = upgradeForm[e.id] || {
      company_name: e.companies?.name || "",
      cvr_number: "",
      industry_label: "",
    };
    const saetUf = (patch: Partial<UpgradeForm>) =>
      setUpgradeForm((prev) => ({ ...prev, [e.id]: { ...uf, ...patch } }));
    const day = e.status === "active" ? getDayNumber(e.start_date) : null;
    const meta = [
      e.profiles?.email || "",
      e.companies?.name || "",
      day !== null ? `Dag ${day} af 10` : e.status === "upgraded" ? "Opgraderet til member" : e.status === "cancelled" ? "Annulleret" : "",
    ]
      .filter(Boolean)
      .join(" · ");

    return (
      <EditorShell
        eyebrow="Legatforløb"
        title={e.profiles?.full_name || "Ukendt"}
        meta={meta}
        footer={
          e.status === "active" ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button
                type="button"
                onClick={() => cancelMutation.mutate(e.id)}
                disabled={cancelMutation.isPending}
                className="px-2 text-sm text-hb-ink-soft underline-offset-4 transition-colors hover:text-hb-rust hover:underline disabled:opacity-50"
              >
                Annullér
              </button>
              <div className="ml-auto flex items-center gap-2">
                <HbButton
                  className="h-9 px-5 text-sm"
                  onClick={() => upgradeMutation.mutate({ userId: e.user_id, uf })}
                  disabled={upgradeMutation.isPending || !uf.company_name}
                >
                  {upgradeMutation.isPending ? "Opgraderer…" : "Opgrader til member"}
                </HbButton>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <StatusTag status={e.status} />
              {e.upgraded_at && (
                <span className="text-xs text-hb-ink-soft">Opgraderet {formatStartdato(e.upgraded_at)}</span>
              )}
            </div>
          )
        }
      >
        <section>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Handout-fremdrift</p>
          <HbProgressBar done={completedCount} total={HANDOUT_MODULES.length} className="mt-3" />
          <ul className="mt-3 space-y-1">
            {HANDOUT_MODULES.map((m) => {
              const status = progress[m.key] || "not_started";
              const dayNum = e.status === "active" ? getDayNumber(e.start_date) : 10;
              const unlocked = dayNum >= m.day;
              const state = status === "completed" ? "done" : status === "in_progress" ? "started" : "untouched";
              return (
                <li
                  key={m.key}
                  className={cn("flex items-center gap-3 rounded-lg px-2 py-1.5", !unlocked && "opacity-55")}
                >
                  <StateDot state={state} />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[15px]",
                      status === "completed" ? "text-hb-ink-soft line-through decoration-hb-line" : "text-hb-ink",
                    )}
                  >
                    {m.label}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      status === "completed" ? "text-hb-evergreen" : status === "in_progress" ? "text-hb-ink" : "text-hb-ink-soft",
                    )}
                  >
                    {status === "completed" ? "Færdig" : status === "in_progress" ? "I gang" : unlocked ? "Ikke startet" : `Dag ${m.day}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="flex flex-wrap gap-x-10 gap-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Startdato</p>
            <p className="mt-1 text-sm text-hb-ink">{formatStartdato(e.start_date)}</p>
          </div>
          {e.notes && (
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Note</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-hb-ink">{e.notes}</p>
            </div>
          )}
        </section>

        {e.status === "active" && (
          <section>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Opgrader til member</p>
            <div className="mt-3 space-y-4">
              <HbField label="Virksomhedsnavn" htmlFor={`legat-upg-navn-${e.id}`}>
                <HbInput
                  id={`legat-upg-navn-${e.id}`}
                  placeholder="Virksomhedsnavn"
                  value={uf.company_name}
                  onChange={(e2) => saetUf({ company_name: e2.target.value })}
                />
              </HbField>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <HbField label="CVR" htmlFor={`legat-upg-cvr-${e.id}`}>
                  <HbInput
                    id={`legat-upg-cvr-${e.id}`}
                    placeholder="CVR (valgfrit)"
                    value={uf.cvr_number}
                    onChange={(e2) => saetUf({ cvr_number: e2.target.value })}
                  />
                </HbField>
                <HbField label="Branche" htmlFor={`legat-upg-branche-${e.id}`}>
                  <HbInput
                    id={`legat-upg-branche-${e.id}`}
                    placeholder="Branche (valgfrit)"
                    value={uf.industry_label}
                    onChange={(e2) => saetUf({ industry_label: e2.target.value })}
                  />
                </HbField>
              </div>
            </div>
          </section>
        )}
      </EditorShell>
    );
  };

  return (
    <HbAdminSplit
      editorOpen={selectedId === NY || selected !== undefined}
      onCloseEditor={() => setSelectedId(null)}
      list={liste}
      editor={
        selectedId === NY ? (
          opret
        ) : selected ? (
          <React.Fragment key={selected.id}>{detalje(selected)}</React.Fragment>
        ) : (
          <EditorEmptyState
            hints={[
              ["n", "nyt forløb"],
              ["esc", "luk"],
            ]}
          />
        )
      }
    />
  );
};
