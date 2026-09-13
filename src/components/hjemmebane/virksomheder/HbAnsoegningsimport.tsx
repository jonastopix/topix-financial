import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invaliderInvitationer } from "@/hooks/invitationer";
import { importAdvarsel } from "@/lib/importensAdvarsel";
import {
  TOMME_FELTER, byggImportBody, parseAnsoegning, validerAnsoegning,
  type AnsoegningsFelter, type Arkdata, type ParseResultat,
} from "@/lib/ansoegningsimport";
import { HbButton } from "../HbButton";
import { HbCard } from "../HbCard";
import { HbDropzone } from "../HbDropzone";
import { HbField, HbInput, HbTextarea } from "../admin/HbField";

/**
 * «Importér ansøgning» på /virksomheder (13/9-2026, trin 2 af 2 — trin 1 var
 * motoren, #823). Importen opretter en virksomhed og hører derfor til ved
 * siden af «Inviter» på listen, ikke på en virksomhedsside (Jonas 13/9).
 *
 * Et PANEL, ikke en dialog: fjorten felter plus en dropzone er mere end
 * nogen Hb-dialog bærer (den største har syv, MilestoneDialoger.tsx:149-257),
 * og ingen af husets dropzoner står i en dialog. Formen er HbBudgetImports:
 * ét komponenttræ der skifter på tilstand — dropzone → felterne til
 * gennemsyn → (evt. tilknyt-trinnet) — og tilbage til dropzonen ved «Vælg
 * en anden fil». «Annullér» rydder og lukker panelet; åbnes det igen, står
 * dropzonen dér. Ingen overlay, ingen rute.
 *
 * Datoerne er <input type="date"> gennem HbInput, som LegatView.tsx:368-373
 * gør i sit panel: de kommer forudfyldt fra regnearket og skal kunne rettes
 * hurtigt — et datofelt viser værdien, en popover skjuler den (afgjort 13/9).
 *
 * Motoren (parseAnsoegning, validerAnsoegning, byggImportBody) bor i
 * lib/ansoegningsimport.ts og røres ikke; herinde kun det der kræver
 * browseren (File → ArrayBuffer → xlsx) og svarene fra import-application,
 * håndteret som /members' dialog gør i dag (samme tekster, samme grene).
 * /members' dialog bliver stående — begge veje deler motoren, og siden
 * slettes i bygning 3.
 */

/** Filen → rækker af celler. Kun det der kræver browseren; tolkningen er motorens. */
async function laesAnsoegningsfil(file: File): Promise<ParseResultat> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as Arkdata;
  return parseAnsoegning(rows);
}

const FELT_ID = "ansoegning-";

/** Knappen ved siden af «Inviter». Panelet ejes af forælderen (HbInvitationer). */
export const ImporterAnsoegningKnap = ({ aaben, onClick }: { aaben: boolean; onClick: () => void }) => (
  <HbButton type="button" variant="secondary" className="h-9 gap-1.5 px-4 text-sm" onClick={onClick} aria-expanded={aaben}>
    <FileSpreadsheet className="h-4 w-4" /> Importér ansøgning
  </HbButton>
);

type Trin = "dropzone" | "gennemsyn" | "tilknyt";

export const HbAnsoegningsimport = ({ aaben, onLuk }: { aaben: boolean; onLuk: () => void }) => {
  const queryClient = useQueryClient();
  const [trin, setTrin] = useState<Trin>("dropzone");
  const [felter, setFelter] = useState<AnsoegningsFelter>({ ...TOMME_FELTER });
  const [advarsler, setAdvarsler] = useState<string[]>([]);
  const [laeser, setLaeser] = useState(false);
  const [importerer, setImporterer] = useState(false);
  const [tilknytEmail, setTilknytEmail] = useState("");
  const [tilknytter, setTilknytter] = useState(false);

  const saet = (patch: Partial<AnsoegningsFelter>) => setFelter((f) => ({ ...f, ...patch }));

  /** Tilbage til dropzonen — «Vælg en anden fil». */
  const tilDropzone = () => {
    setTrin("dropzone");
    setFelter({ ...TOMME_FELTER });
    setAdvarsler([]);
    setTilknytEmail("");
  };

  /** Ryd og luk — efter succes og ved «Annullér». */
  const nulstilOgLuk = () => {
    tilDropzone();
    onLuk();
  };

  const laesFil = async (file: File) => {
    setLaeser(true);
    try {
      const r = await laesAnsoegningsfil(file);
      setFelter({ ...TOMME_FELTER, ...r.felter });
      setAdvarsler(r.advarsler);
      setTrin("gennemsyn");
    } catch (err) {
      // Parserens egne tekster (FEJL_INGEN_HEADER / FEJL_INGEN_DATA) eller xlsx' fejl — som i dag.
      toast.error("Kunne ikke læse filen", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setLaeser(false);
    }
  };

  const importer = async () => {
    // Valideringen og body'en bor i lib/ansoegningsimport.ts (testet). Kun det første afslag vises.
    const dom = validerAnsoegning(felter);
    if (dom.ok === false) {
      const [foerste] = dom.fejl;
      toast.error(foerste.tekst, foerste.detalje ? { description: foerste.detalje } : undefined);
      return;
    }
    setImporterer(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-application", {
        body: byggImportBody(felter),
      });
      if (error) throw new Error(error.message || "Import fejlede");
      if (!data?.ok) {
        if (data?.reason === "invitation_already_exists") {
          toast.warning("Der er allerede en aktiv invitation på denne email", {
            description: "Founder har allerede modtaget en invitationsmail.",
          });
          nulstilOgLuk();
          return;
        }
        if (data?.reason === "user_already_exists") {
          setTilknytEmail(felter.email);
          setTrin("tilknyt");
          return;
        }
        throw new Error(data?.error || "Import fejlede");
      }
      if (data.reused_company) {
        toast.success("Virksomheden findes allerede — ny invitation sendt", {
          description: `Invitation sendt til ${felter.email} for ${data.company_name}`,
        });
      } else {
        toast.success("Ansøgning importeret ✓", {
          description: `${data.company_name} er oprettet og invitation sendt til ${felter.email}`,
        });
      }
      nulstilOgLuk();
      await invaliderInvitationer(queryClient, data.company_id ?? null);
    } catch (err) {
      toast.error("Import fejlede", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setImporterer(false);
    }
  };

  /** Tilknyt-trinnet (recon-members 2.2): virksomheden findes på CVR, brugeren via attach-user-to-company. */
  const tilknyt = async () => {
    if (!tilknytEmail) return;
    setTilknytter(true);
    try {
      if (!felter.cvr_number) {
        toast.error("CVR mangler — kan ikke finde virksomheden");
        return;
      }
      const { data: company } = await supabase
        .from("companies")
        .select("id, name")
        .eq("cvr_number", felter.cvr_number)
        .maybeSingle();
      if (!company) {
        toast.error("Virksomhed ikke fundet — importér ansøgningen først");
        return;
      }
      const { data, error } = await supabase.functions.invoke("attach-user-to-company", {
        body: { email: tilknytEmail.trim().toLowerCase(), company_id: company.id },
      });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || "Tilknytning fejlede");
      toast.success("Bruger tilknyttet ✓", { description: `${tilknytEmail} er nu tilknyttet ${company.name}` });
      nulstilOgLuk();
      await invaliderInvitationer(queryClient, company.id);
    } catch (err) {
      toast.error("Fejl ved tilknytning", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setTilknytter(false);
    }
  };

  if (!aaben) return null;

  const advarsel = importAdvarsel();
  const kanImportere = !importerer && trin === "gennemsyn" && !!felter.email && !!felter.company_name;

  return (
    <HbCard className="mb-4 p-5 sm:p-6" role="region" aria-label="Importér ansøgning">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-editorial text-xl font-medium leading-tight text-hb-ink">Importér ansøgning</p>
          <p className="mt-1 text-sm text-hb-ink-soft">Opretter virksomhed, slår CVR op og sender invitationsmail automatisk</p>
        </div>
        <button
          type="button"
          onClick={nulstilOgLuk}
          disabled={importerer || tilknytter}
          className="text-sm text-hb-ink-soft underline-offset-4 hover:underline disabled:opacity-50"
        >
          Annullér
        </button>
      </div>

      {trin === "dropzone" && (
        <HbDropzone
          className="mt-5"
          accept=".xlsx,.xls"
          onFile={(f) => void laesFil(f)}
          busy={laeser}
          busyTekst="Læser fil…"
          tekst="Træk ansøgnings-Excel hertil"
          undertekst="eller klik for at vælge fil · .xlsx fra Monday.com"
        />
      )}

      {trin === "gennemsyn" && (
        <div className="mt-5 space-y-4">
          <p className="flex items-center gap-2 rounded-lg border border-hb-line bg-hb-sage/30 px-3 py-2 text-sm text-hb-ink">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-hb-evergreen" />
            Ansøgning læst — gennemgå og ret hvis nødvendigt
          </p>
          {advarsler.length > 0 && (
            <ul className="space-y-0.5 text-xs text-hb-ink-soft">
              {advarsler.map((a) => <li key={a}>{a}</li>)}
            </ul>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <HbField label="Email *" htmlFor={`${FELT_ID}email`}>
              <HbInput id={`${FELT_ID}email`} type="email" value={felter.email} onChange={(e) => saet({ email: e.target.value })} />
            </HbField>
            <HbField label="Virksomhedsnavn *" htmlFor={`${FELT_ID}company_name`}>
              <HbInput id={`${FELT_ID}company_name`} value={felter.company_name} onChange={(e) => saet({ company_name: e.target.value })} />
            </HbField>
            <HbField label="CVR-nummer" htmlFor={`${FELT_ID}cvr_number`}>
              <HbInput id={`${FELT_ID}cvr_number`} inputMode="numeric" value={felter.cvr_number} onChange={(e) => saet({ cvr_number: e.target.value })} />
            </HbField>
            <HbField label="Kontaktperson" htmlFor={`${FELT_ID}contact_name`}>
              <HbInput id={`${FELT_ID}contact_name`} value={felter.contact_name} onChange={(e) => saet({ contact_name: e.target.value })} />
            </HbField>
            <HbField label="Årlig omsætning (kr.)" htmlFor={`${FELT_ID}annual_revenue`}>
              <HbInput id={`${FELT_ID}annual_revenue`} type="number" value={felter.annual_revenue} onChange={(e) => saet({ annual_revenue: e.target.value })} />
            </HbField>
            <HbField label="Omsætning (interval)" htmlFor={`${FELT_ID}revenue_interval`} help="Som ansøgeren skrev det — gemmes råt til agent-konteksten">
              <HbInput id={`${FELT_ID}revenue_interval`} value={felter.revenue_interval} onChange={(e) => saet({ revenue_interval: e.target.value })} />
            </HbField>
            <HbField label="Branche" htmlFor={`${FELT_ID}industry_label`}>
              <HbInput id={`${FELT_ID}industry_label`} value={felter.industry_label} onChange={(e) => saet({ industry_label: e.target.value })} />
            </HbField>
            <HbField label="Hjemmeside" htmlFor={`${FELT_ID}website`}>
              <HbInput id={`${FELT_ID}website`} value={felter.website} onChange={(e) => saet({ website: e.target.value })} />
            </HbField>
            <HbField label="Telefon" htmlFor={`${FELT_ID}phone`}>
              <HbInput id={`${FELT_ID}phone`} type="tel" value={felter.phone} onChange={(e) => saet({ phone: e.target.value })} />
            </HbField>
            <div className="hidden sm:block" aria-hidden />
            <HbField label="Kontraktstart" htmlFor={`${FELT_ID}contract_start_date`}>
              <HbInput id={`${FELT_ID}contract_start_date`} type="date" value={felter.contract_start_date} onChange={(e) => saet({ contract_start_date: e.target.value })} />
            </HbField>
            <HbField label="Kontraktslut *" htmlFor={`${FELT_ID}contract_end_date`}>
              <HbInput id={`${FELT_ID}contract_end_date`} type="date" value={felter.contract_end_date} onChange={(e) => saet({ contract_end_date: e.target.value })} />
            </HbField>
            <HbField label="Nuværende situation" htmlFor={`${FELT_ID}current_situation`} className="sm:col-span-2">
              <HbTextarea id={`${FELT_ID}current_situation`} rows={3} value={felter.current_situation} onChange={(e) => saet({ current_situation: e.target.value })} />
            </HbField>
            <HbField label="Mål med virksomheden" htmlFor={`${FELT_ID}goals`} className="sm:col-span-2">
              <HbTextarea id={`${FELT_ID}goals`} rows={2} value={felter.goals} onChange={(e) => saet({ goals: e.target.value })} />
            </HbField>
            <HbField label="Hvilken hjælp søges?" htmlFor={`${FELT_ID}help_needed`} className="sm:col-span-2">
              <HbTextarea id={`${FELT_ID}help_needed`} rows={2} value={felter.help_needed} onChange={(e) => saet({ help_needed: e.target.value })} />
            </HbField>
          </div>

          <button type="button" onClick={tilDropzone} disabled={importerer} className="text-sm text-hb-ink-soft underline-offset-4 hover:underline disabled:opacity-50">
            Vælg en anden fil
          </button>
        </div>
      )}

      {trin === "tilknyt" && (
        <div className="mt-5 space-y-4">
          <div>
            <p className="text-[15px] font-medium text-hb-ink">Bruger findes allerede</p>
            <p className="mt-1 text-sm text-hb-ink-soft">
              Denne email har allerede en konto. Du kan tilknytte den eksisterende bruger direkte til virksomheden.
            </p>
          </div>
          <HbField label="Email" htmlFor={`${FELT_ID}tilknyt_email`} className="max-w-md">
            <HbInput id={`${FELT_ID}tilknyt_email`} type="email" value={tilknytEmail} onChange={(e) => setTilknytEmail(e.target.value)} autoFocus />
          </HbField>
          <div className="flex flex-wrap items-center gap-3">
            <HbButton type="button" className="h-9 px-5 text-sm" onClick={() => void tilknyt()} disabled={tilknytter || !tilknytEmail}>
              {tilknytter ? "Tilknytter…" : "Tilknyt bruger →"}
            </HbButton>
            <button type="button" onClick={nulstilOgLuk} disabled={tilknytter} className="text-sm text-hb-ink-soft underline-offset-4 hover:underline disabled:opacity-50">
              Annullér
            </button>
          </div>
        </div>
      )}

      {trin !== "tilknyt" && (
        <>
          {/* Det der sker når man klikker — står FØR knappen, ikke som bekræftelse bagefter. Teksten: lib/importensAdvarsel.ts. */}
          <div className="mt-6 rounded-lg border border-hb-line bg-hb-paper px-4 py-3 text-sm text-hb-ink">
            <p className="font-medium">{advarsel.overskrift}</p>
            <ul className="mt-1.5 space-y-1 text-hb-ink-soft">
              {advarsel.linjer.map((linje) => <li key={linje}>{linje}</li>)}
            </ul>
            <p className="mt-2 text-xs text-hb-ink-soft">{advarsel.andenVej}</p>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <HbButton type="button" className="h-9 px-5 text-sm" onClick={() => void importer()} disabled={!kanImportere}>
              {importerer ? "Importerer…" : "Importér og send invitation"}
            </HbButton>
          </div>
        </>
      )}
    </HbCard>
  );
};
