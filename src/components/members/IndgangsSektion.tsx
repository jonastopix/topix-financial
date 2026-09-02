import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DoorOpen } from "lucide-react";
import {
  afgoerBetalingsfrist,
  BETALINGSFRIST_DAGE,
  type Betalingsfriststatus,
  type Betalingsfristtilstand,
} from "@/lib/betalingsfrist";
import { INDGANGS_PRISPUNKTER_OERE } from "@/lib/indgangspris";

/**
 * Indgangen — virksomheder fra underskrift til betaling, oven på den
 * færdige motor (afgoerBetalingsfrist) og company_betalingslink-tabellen.
 * Forlæg: FornyelsesSektion — samme hentning, samme udseende, samme
 * regel om at sektionen er usynlig når den er tom.
 *
 * HVORFOR: reconen 2/9 fandt at der intet sted var, hvor rådgiveren kunne
 * se en virksomhed der venter på betaling eller mangler prisniveau.
 * Rådgivermailen (indgangsMail.ts, raadgiverManglerPrisMail) linker til
 * /members og lover at prisen kan sættes her.
 *
 * Viser ALLE i indgangen, ikke kun problemerne (Jonas 2/9): afventer_pris,
 * frist_overskredet, afventer_betaling, klar_til_mail. «betalt» vises
 * ikke — de er medlemmer nu og står i listen nedenfor.
 *
 * Læsningen er direkte mod company_betalingslink med rådgiverens JWT
 * (politikken har samme form som company_fornyelse, målt 2/9), med
 * companies embedded (isOneToOne). Tilstanden afgøres af motoren — ingen
 * egne betingelser her.
 *
 * SKRIVNINGEN går IKKE direkte: prisen sættes gennem edge function
 * saet-indgangs-prisniveau, som skriver prisen og udløser dag 0-mailen i
 * samme kald (§19 udløser 2). Skrev fladen prisen selv, ville der findes
 * en tilstand hvor prisen er sat og mailen aldrig gik.
 */

interface LinkRow {
  company_id: string;
  prisniveau_oere: number | null;
  underskrevet_at: string;
  betalingsmail_sendt_at: string | null;
  sidste_paamindelse_dag: number | null;
  companies:
    | { name: string; cvr_number: string | null; contact_person: string | null; contact_email: string | null; contract_end_date: string | null }
    | { name: string; cvr_number: string | null; contact_person: string | null; contact_email: string | null; contract_end_date: string | null }[]
    | null;
}

interface IndgangsRaekke {
  company_id: string;
  name: string;
  cvr_number: string | null;
  contact_person: string | null;
  contact_email: string | null;
  underskrevet_at: string;
  tilstand: Betalingsfristtilstand;
}

const STATUS_VISNING: Record<Betalingsfriststatus, { label: string; className: string }> = {
  afventer_pris: { label: "Mangler pris", className: "bg-chart-warning/15 text-chart-warning" },
  klar_til_mail: { label: "Mail på vej", className: "bg-muted text-muted-foreground" },
  afventer_betaling: { label: "Afventer betaling", className: "bg-primary/10 text-primary" },
  frist_overskredet: { label: "Frist passeret", className: "bg-destructive/10 text-destructive" },
  // Frafiltreres før render — står her så typen er udtømmende.
  betalt: { label: "Betalt", className: "bg-muted text-muted-foreground" },
};

/** Rækkefølgen: dem der kræver noget af dig øverst. */
const STATUS_ORDEN: Record<Betalingsfriststatus, number> = {
  afventer_pris: 0,
  frist_overskredet: 1,
  afventer_betaling: 2,
  klar_til_mail: 3,
  betalt: 4,
};

/**
 * Fristen som dato: UTC-kalenderdagen for UNDERSKRIFTEN + 30 — kontraktens
 * frist (rettet 2/9), samme regnestykke som hent_betalingstilbud og dag
 * 0-mailen, så alle tre siger samme dato. Formateres i UTC, så den ikke
 * skrider med maskinens tidszone.
 */
function fristDato(underskrevetAt: string): string {
  const underskrevet = new Date(underskrevetAt);
  if (Number.isNaN(underskrevet.getTime())) return "—";
  const frist = new Date(
    Date.UTC(underskrevet.getUTCFullYear(), underskrevet.getUTCMonth(), underskrevet.getUTCDate() + BETALINGSFRIST_DAGE),
  );
  return frist.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function formatDageTilbage(dageSidenUnderskrift: number | null): string {
  if (dageSidenUnderskrift === null) return "—";
  const tilbage = BETALINGSFRIST_DAGE - dageSidenUnderskrift;
  if (tilbage === 0) return "sidste dag i dag";
  if (tilbage < 0) return `passeret for ${Math.abs(tilbage)} ${Math.abs(tilbage) === 1 ? "dag" : "dage"} siden`;
  return `${tilbage} ${tilbage === 1 ? "dag" : "dage"} tilbage`;
}

function formatKr(oere: number): string {
  return `${new Intl.NumberFormat("da-DK").format(oere / 100)} kr.`;
}

/** Læser statuskoden og JSON-body'en ud af en FunctionsHttpError (AgentForslagPanel-mønstret). */
async function laesFejl(error: unknown): Promise<{ status: number | null; body: Record<string, unknown> | null }> {
  const ctx = (error as { context?: Response }).context;
  let status: number | null = null;
  let body: Record<string, unknown> | null = null;
  try {
    status = typeof ctx?.status === "number" ? ctx.status : null;
    body = (await ctx?.json?.()) ?? null;
  } catch {
    /* body var ikke JSON — status er nok */
  }
  return { status, body };
}

export default function IndgangsSektion() {
  const [saving, setSaving] = useState<string | null>(null);

  const linkQuery = useQuery({
    queryKey: ["company-betalingslink"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_betalingslink")
        .select(
          "company_id, prisniveau_oere, underskrevet_at, betalingsmail_sendt_at, sidste_paamindelse_dag, " +
            "companies:company_id(name, cvr_number, contact_person, contact_email, contract_end_date)",
        );
      if (error) throw error;
      return (data ?? []) as unknown as LinkRow[];
    },
  });

  const saetPris = async (companyId: string, prisniveauOere: number) => {
    setSaving(companyId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("saet-indgangs-prisniveau", {
        body: { company_id: companyId, prisniveau_oere: prisniveauOere },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (error) {
        const { status, body } = await laesFejl(error);
        const kode = typeof body?.error === "string" ? body.error : null;
        if (status === 409 || kode === "prisniveau_allerede_sat") {
          toast.info("Prisen er allerede sat.");
          await linkQuery.refetch();
          return;
        }
        if (status === 404 || kode === "ingen_betalingslink") {
          toast.error("Virksomheden er ikke i indgangen.");
          await linkQuery.refetch();
          return;
        }
        if (status === 400 || kode === "ukendt_prisniveau") {
          // Bør ikke kunne ske fra knapperne — så er der noget galt i
          // koden, og den tekniske detalje skal frem.
          toast.error("Prisniveauet blev afvist af serveren", {
            description: typeof body?.detalje === "string" ? body.detalje : `${kode ?? "ukendt fejl"} (status ${status ?? "?"})`,
          });
          return;
        }
        if (status === 403) {
          toast.error("Du har ikke adgang til at sætte prisen.");
          return;
        }
        console.error("[IndgangsSektion] saet-indgangs-prisniveau fejlede:", status, body, error);
        toast.error("Prisen kunne ikke sættes lige nu. Prøv igen om lidt.");
        return;
      }

      if (data?.ok === true && data?.mail_fejlede === true) {
        // Advarsel, ikke fejl: prisen ER gemt.
        console.error("[IndgangsSektion] pris gemt, mail fejlede:", companyId, data?.mail);
        toast.warning("Prisen er gemt, men mailen kunne ikke sendes.", {
          description: "Skriv til medlemmet, eller prøv igen senere.",
        });
      } else if (data?.ok === true && data?.mail === "dag0") {
        toast.success("Prisen er sat, og betalingsmailen er sendt.");
      } else if (data?.ok === true) {
        // Prisen er sat, men modulet sprang mailen over (fx betalt imens).
        toast.info("Prisen er sat. Mailen blev ikke sendt, fordi der ikke var noget at sende.");
      } else {
        console.error("[IndgangsSektion] uventet svar fra saet-indgangs-prisniveau:", data);
        toast.error("Prisen kunne ikke sættes lige nu. Prøv igen om lidt.");
      }
      await linkQuery.refetch();
    } catch (err) {
      console.error("[IndgangsSektion] saet-indgangs-prisniveau kastede:", err);
      toast.error("Prisen kunne ikke sættes lige nu. Prøv igen om lidt.");
    } finally {
      setSaving(null);
    }
  };

  const raekker: IndgangsRaekke[] = (linkQuery.data ?? [])
    .map((row) => {
      const c = Array.isArray(row.companies) ? row.companies[0] : row.companies;
      const tilstand = afgoerBetalingsfrist({
        prisniveau_oere: row.prisniveau_oere,
        underskrevet_at: row.underskrevet_at,
        betalingsmail_sendt_at: row.betalingsmail_sendt_at,
        sidste_paamindelse_dag: row.sidste_paamindelse_dag,
        contract_end_date: c?.contract_end_date ?? null,
      });
      return {
        company_id: row.company_id,
        name: c?.name ?? "Ukendt virksomhed",
        cvr_number: c?.cvr_number ?? null,
        contact_person: c?.contact_person ?? null,
        contact_email: c?.contact_email ?? null,
        underskrevet_at: row.underskrevet_at,
        tilstand,
      };
    })
    .filter((r) => r.tilstand.status !== "betalt")
    .sort((a, b) => {
      const orden = STATUS_ORDEN[a.tilstand.status] - STATUS_ORDEN[b.tilstand.status];
      if (orden !== 0) return orden;
      // Inden for samme status: færrest dage tilbage øverst = flest dage siden underskrift.
      return (b.tilstand.dage_siden_underskrift ?? -1) - (a.tilstand.dage_siden_underskrift ?? -1);
    });

  if (linkQuery.isLoading) return null;

  // Fejler opslaget, er listen tom — og så ville en virksomhed der mangler
  // pris være usynlig, som var alt i orden. Vis fejlen frem for tavshed.
  if (linkQuery.isError) {
    return (
      <div className="glass-card rounded-xl p-5 mb-6 border border-destructive/30">
        <div className="flex items-center gap-2 mb-1">
          <DoorOpen className="h-4 w-4 text-destructive" />
          <h2 className="font-display font-semibold text-foreground">Indgangen</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Indgangens virksomheder kunne ikke hentes. Genindlæs siden — der kan stå nogen og mangle en pris.
        </p>
      </div>
    );
  }

  if (raekker.length === 0) return null;

  const manglerPris = raekker.filter((r) => r.tilstand.status === "afventer_pris").length;

  return (
    <div className="glass-card rounded-xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <DoorOpen className="h-4 w-4 text-primary" />
        <h2 className="font-display font-semibold text-foreground">Indgangen</h2>
        <span className="text-xs text-muted-foreground">
          · {raekker.length} {raekker.length === 1 ? "virksomhed" : "virksomheder"} fra underskrift til betaling
          {manglerPris > 0 && ` · ${manglerPris} mangler pris`}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Prisen sættes én gang og sender betalingsmailen med det samme. Efter fristen sendes fakturaen i hånden fra Stripe.
      </p>

      <div className="space-y-3">
        {raekker.map((r) => {
          const visning = STATUS_VISNING[r.tilstand.status];
          const erSaving = saving === r.company_id;
          const kraeverHandling = r.tilstand.status === "afventer_pris";
          return (
            <div
              key={r.company_id}
              className={`rounded-lg border p-3 ${kraeverHandling ? "border-chart-warning/40 bg-secondary/20" : "border-border/50 bg-secondary/20"}`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    CVR {r.cvr_number || "—"} · {r.contact_person || "Ingen kontaktperson"}
                    {r.contact_email ? ` · ${r.contact_email}` : ""}
                  </p>
                  {/* Fristen er kontraktens og løber fra underskriften — også
                      mens prisen mangler. Derfor vises den for alle statusser. */}
                  <p className="text-xs text-muted-foreground">
                    Frist {fristDato(r.underskrevet_at)} · {formatDageTilbage(r.tilstand.dage_siden_underskrift)}
                    {r.tilstand.status === "frist_overskredet" && " · faktura sendes i hånden"}
                  </p>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${visning.className}`}>
                  {visning.label}
                </span>
              </div>

              {kraeverHandling && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">Sæt prisniveau:</span>
                  {INDGANGS_PRISPUNKTER_OERE.map((oere) => (
                    <Button
                      key={oere}
                      size="sm"
                      variant="outline"
                      disabled={saving !== null}
                      onClick={() => void saetPris(r.company_id, oere)}
                    >
                      {erSaving ? "Gemmer…" : formatKr(oere)}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
