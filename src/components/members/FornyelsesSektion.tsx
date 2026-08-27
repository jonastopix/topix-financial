import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarClock } from "lucide-react";
import {
  afgoerFornyelsestilstand,
  type Fornyelsesbeslutning,
  type FornyelseStatus,
} from "@/lib/fornyelse";

/**
 * Fornyelsesbeslutninger — rådgiverens flade oven på den færdige motor
 * (afgoerFornyelsestilstand) og company_fornyelse-tabellen.
 *
 * Viser kun virksomheder der kræver opmærksomhed (status er hverken
 * i_god_tid, ingen_slutdato eller selvbetjener). Tavshed er standarden:
 * ingen række i company_fornyelse betyder "endnu ikke besluttet", og at
 * FJERNE en beslutning er derfor ikke det samme som tilbyd_ikke.
 *
 * Skrivevejen er direkte klient-upsert mod advisor-RLS'en
 * (ProgressView-mønstret) — men med eksplicit tjek af BÅDE error OG
 * antal berørte rækker: advisor-writes der rammer nul rækker tavst er
 * husets kendte fælde. Cachen patches først EFTER bekræftet skrivning.
 */

interface FornyelsesCompany {
  id: string;
  name: string;
  contract_end_date: string | null;
  subscription_status: string | null;
  subscription_current_period_end: string | null;
}

interface BeslutningsRow {
  company_id: string;
  beslutning: Fornyelsesbeslutning;
  note: string | null;
  besluttet_at: string;
}

const STATUS_VISNING: Record<FornyelseStatus, { label: string; className: string }> = {
  udloebet_uden_beslutning: { label: "Udløbet — ingen beslutning", className: "bg-destructive/15 text-destructive" },
  udloebet_tilbyd: { label: "Udløbet — tilbyd", className: "bg-primary/10 text-primary" },
  udloebet_tilbyd_ikke: { label: "Udløbet — tilbyd ikke", className: "bg-muted text-muted-foreground" },
  beslutning_mangler: { label: "Beslutning mangler", className: "bg-chart-warning/15 text-chart-warning" },
  klar_til_tilbud: { label: "Klar til tilbud", className: "bg-primary/10 text-primary" },
  klar_til_afsked: { label: "Klar til afsked", className: "bg-muted text-muted-foreground" },
  uden_for_ordningen: { label: "Uden for ordningen", className: "border border-border text-muted-foreground" },
  // Frafiltreres før render — står her så typen er udtømmende.
  i_god_tid: { label: "I god tid", className: "bg-muted text-muted-foreground" },
  ingen_slutdato: { label: "Ingen slutdato", className: "bg-muted text-muted-foreground" },
  selvbetjener: { label: "Selvbetjener", className: "bg-muted text-muted-foreground" },
};

const SKJULTE_STATUSSER: ReadonlySet<FornyelseStatus> = new Set([
  "i_god_tid",
  "ingen_slutdato",
  "selvbetjener",
]);

function formatDage(dage: number | null): string {
  if (dage === null) return "—";
  if (dage === 0) return "udløber i dag";
  if (dage < 0) return `udløbet for ${Math.abs(dage)} ${Math.abs(dage) === 1 ? "dag" : "dage"} siden`;
  return `om ${dage} ${dage === 1 ? "dag" : "dage"}`;
}

function formatDato(d: string | null): string {
  if (!d) return "—";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });
}

export default function FornyelsesSektion({ companies }: { companies: FornyelsesCompany[] }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const beslutningerQuery = useQuery({
    queryKey: ["company-fornyelse"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("company_fornyelse" as any)
        .select("company_id, beslutning, note, besluttet_at") as any);
      if (error) throw error;
      return new Map<string, BeslutningsRow>(
        ((data ?? []) as BeslutningsRow[]).map((r) => [r.company_id, r]),
      );
    },
  });
  const beslutninger = beslutningerQuery.data ?? new Map<string, BeslutningsRow>();

  const patchCache = (companyId: string, row: BeslutningsRow | null) => {
    queryClient.setQueryData<Map<string, BeslutningsRow>>(["company-fornyelse"], (old) => {
      const next = new Map(old ?? []);
      if (row) next.set(companyId, row);
      else next.delete(companyId);
      return next;
    });
  };

  const gemBeslutning = async (companyId: string, beslutning: Fornyelsesbeslutning) => {
    if (!user) return;
    setSaving(companyId);
    try {
      const eksisterende = beslutninger.get(companyId);
      const note = (noteDrafts[companyId] ?? eksisterende?.note ?? "").trim() || null;
      const { data, error } = await (supabase
        .from("company_fornyelse" as any)
        .upsert(
          {
            company_id: companyId,
            beslutning,
            besluttet_af: user.id,
            besluttet_at: new Date().toISOString(),
            note,
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: "company_id" },
        )
        .select("company_id, beslutning, note, besluttet_at") as any);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        // Nul rækker uden fejl = RLS-filtreret skrivning — husets kendte fælde.
        throw new Error("Skrivningen ramte nul rækker — beslutningen er IKKE gemt (RLS).");
      }
      patchCache(companyId, data[0] as BeslutningsRow);
      toast.success(beslutning === "tilbyd" ? "Registreret: tilbyd forlængelse" : "Registreret: tilbyd ikke");
    } catch (err: any) {
      toast.error("Beslutningen blev ikke gemt", { description: err.message });
    } finally {
      setSaving(null);
    }
  };

  const gemNote = async (companyId: string) => {
    const eksisterende = beslutninger.get(companyId);
    if (!eksisterende) return;
    setSaving(companyId);
    try {
      const note = (noteDrafts[companyId] ?? eksisterende.note ?? "").trim() || null;
      const { data, error } = await (supabase
        .from("company_fornyelse" as any)
        .update({ note, updated_at: new Date().toISOString() } as any)
        .eq("company_id", companyId)
        .select("company_id, beslutning, note, besluttet_at") as any);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        throw new Error("Skrivningen ramte nul rækker — noten er IKKE gemt (RLS).");
      }
      patchCache(companyId, data[0] as BeslutningsRow);
      toast.success("Note gemt");
    } catch (err: any) {
      toast.error("Noten blev ikke gemt", { description: err.message });
    } finally {
      setSaving(null);
    }
  };

  const fjernBeslutning = async (companyId: string) => {
    setSaving(companyId);
    try {
      const { data, error } = await (supabase
        .from("company_fornyelse" as any)
        .delete()
        .eq("company_id", companyId)
        .select("company_id") as any);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        throw new Error("Sletningen ramte nul rækker — beslutningen står stadig (RLS).");
      }
      patchCache(companyId, null);
      setNoteDrafts((d) => ({ ...d, [companyId]: "" }));
      toast.success("Beslutning fjernet", {
        description: "Virksomheden står nu som 'endnu ikke besluttet' — ikke som 'tilbyd ikke'.",
      });
    } catch (err: any) {
      toast.error("Kunne ikke fjerne beslutningen", { description: err.message });
    } finally {
      setSaving(null);
    }
  };

  const raekker = companies
    .map((c) => {
      const row = beslutninger.get(c.id) ?? null;
      const tilstand = afgoerFornyelsestilstand({
        contract_end_date: c.contract_end_date,
        subscription_status: c.subscription_status,
        subscription_current_period_end: c.subscription_current_period_end,
        // Fraværet ER kontrakten: ingen række = null = "endnu ikke besluttet".
        beslutning: row?.beslutning ?? null,
      });
      return { company: c, tilstand, row };
    })
    .filter((r) => !SKJULTE_STATUSSER.has(r.tilstand.status))
    .sort((a, b) => (a.tilstand.dage_til_udloeb ?? Infinity) - (b.tilstand.dage_til_udloeb ?? Infinity));

  if (beslutningerQuery.isLoading) return null;

  // Fejler opslaget mod company_fornyelse, er beslutninger en tom Map —
  // og så dømmes en virksomhed med "tilbyd_ikke" fejlagtigt som
  // "beslutning mangler". Vis fejlen frem for at vise et forkert
  // beslutningsbillede som var det sandt.
  if (beslutningerQuery.isError) {
    return (
      <div className="glass-card rounded-xl p-5 mb-6 border border-destructive/30">
        <div className="flex items-center gap-2 mb-1">
          <CalendarClock className="h-4 w-4 text-destructive" />
          <h2 className="font-display font-semibold text-foreground">Fornyelsesbeslutninger</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Beslutningerne kunne ikke hentes, så tilstandene kan ikke vises korrekt.
          Genindlæs siden — registrér ikke beslutninger før listen virker igen.
        </p>
      </div>
    );
  }

  if (raekker.length === 0) return null;

  return (
    <div className="glass-card rounded-xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <CalendarClock className="h-4 w-4 text-primary" />
        <h2 className="font-display font-semibold text-foreground">Fornyelsesbeslutninger</h2>
        <span className="text-xs text-muted-foreground">· {raekker.length} kræver opmærksomhed</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Tavshed er standarden: intet sendes automatisk, og en beslutning registreres kun her.
        At fjerne en beslutning betyder "endnu ikke besluttet" — ikke "tilbyd ikke".
      </p>

      <div className="space-y-3">
        {raekker.map(({ company, tilstand, row }) => {
          const visning = STATUS_VISNING[tilstand.status];
          const udenForOrdningen = tilstand.status === "uden_for_ordningen";
          const erSaving = saving === company.id;
          return (
            <div
              key={company.id}
              className={`rounded-lg border p-3 ${udenForOrdningen ? "border-dashed border-border bg-muted/30" : "border-border/50 bg-secondary/20"}`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{company.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Slutdato {formatDato(company.contract_end_date)} · {formatDage(tilstand.dage_til_udloeb)}
                  </p>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${visning.className}`}>
                  {visning.label}
                </span>
                {row ? (
                  <span className="text-[11px] text-muted-foreground">
                    Besluttet: <span className="font-medium text-foreground">{row.beslutning === "tilbyd" ? "tilbyd" : "tilbyd ikke"}</span>
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground italic">Endnu ikke besluttet</span>
                )}
              </div>

              {udenForOrdningen && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Ordningen rører bevidst ikke denne virksomhed (slutdato på eller før 10/9) — den
                  håndteres i personlig dialog. En beslutning her registreres uden at udløse noget.
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={row?.beslutning === "tilbyd" ? "default" : "outline"}
                  disabled={erSaving}
                  onClick={() => void gemBeslutning(company.id, "tilbyd")}
                >
                  Tilbyd
                </Button>
                <Button
                  size="sm"
                  variant={row?.beslutning === "tilbyd_ikke" ? "default" : "outline"}
                  disabled={erSaving}
                  onClick={() => void gemBeslutning(company.id, "tilbyd_ikke")}
                >
                  Tilbyd ikke
                </Button>
                <Input
                  value={noteDrafts[company.id] ?? row?.note ?? ""}
                  onChange={(e) => setNoteDrafts((d) => ({ ...d, [company.id]: e.target.value }))}
                  placeholder="Valgfri note (gemmes med beslutningen)"
                  className="h-8 max-w-xs text-xs"
                />
                {row && (noteDrafts[company.id] ?? row.note ?? "") !== (row.note ?? "") && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={erSaving}
                    onClick={() => void gemNote(company.id)}
                  >
                    Gem note
                  </Button>
                )}
                {row && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={erSaving}
                    onClick={() => void fjernBeslutning(company.id)}
                    className="text-muted-foreground"
                  >
                    Fjern beslutning
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
