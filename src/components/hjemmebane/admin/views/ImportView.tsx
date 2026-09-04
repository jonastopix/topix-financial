import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { HbCard } from "../../HbCard";
import { HbField, HbSelect } from "../HbField";
import { HbReportUploadZone } from "../../rapportering/HbReportUploadZone";

/**
 * Import i Hjemmebane (4/9) — konvertering af src/pages/BulkImport.tsx
 * (målt 4/9: 126 linjer, én Select, ingen tabel, nul formularfelter; den
 * gamle side monterede FileUploadZone, 963 linjer, med én AlertDialog).
 *
 * HVAD SIDEN ER (målt 4/9): den ENESTE flade hvor en rådgiver kan uploade
 * rapporter FOR en valgt virksomhed — uden company-override, som
 * virksomhedens første medlem (upload-rækken får virksomhedens første
 * company_members.user_id som user_id), og UDEN at udløse rådgiver-
 * notifikationen om upload. Ingen linker til den ud over menuen (målt:
 * nul træffere ud over App.tsx og HbMemberShells admin-blok). Jonas 4/9:
 * den hører hjemme på VIRKSOMHEDSSIDEN frem for som eget menupunkt — det
 * er ikke denne PR, men det står her, så den næste ved det.
 *
 * ZONEN er HbReportUploadZone — rapporteringsfladens Hb-zone — IKKE den
 * gamle FileUploadZone. AFGJORT 4/9 ved ordret sammenligning af de to:
 *   FileUploadZone.tsx:333  if (!adminMode && conversationId && userId) { notifyReportUpload(…) }
 *   HbReportUploadZone.tsx:251  if (conversationId && userId) { notifyReportUpload(…) }
 * `adminMode` gør intet andet i FileUploadZone (grep: :45, :66, :333,
 * :363, :530 — kun de to notify-grene). Med conversationId={null} er
 * Hb-zonens gren identisk med adminMode — og den gamle side sendte
 * ALDRIG conversationId (BulkImport.tsx:103-112), så notifikationen kunne
 * ikke udløses der uanset adminMode. `userId` og `companyId` er props i
 * begge zoner og bruges ens (financial_reports.user_id/company_id,
 * storage-sti, runPostExtractionPipeline); `onPipelineComplete` findes i
 * begge. Kaldet til extract-financial-data er ordret det samme
 * (FileUploadZone.tsx:258-261 = HbReportUploadZone.tsx:206-209). Det
 * gamle zones `title`/`description`/`accept`/`guideDefaultOpen`/
 * `onExtracted` bruges ikke af importen (accept-listen er den samme
 * fire filtyper). Overskrivnings-bekræftelsen er inline i Hb-zonen —
 * ingen portal.
 *
 * ADFÆRD, som før: alle companies i en vælger (:17-27), virksomhedens
 * første company_members-række som ejer (:30-43, `.in("role", ["owner",
 * "member"]).limit(1)`), zonen vises kun med valgt virksomhed OG ejer
 * (:92), «Ingen ejer fundet» ellers (:116-120), tælleren «N rapporter
 * importeret» via onPipelineComplete (:14, :97-101, :111), og
 * `key={selectedCompanyId}` så zonen nulstilles ved skift af virksomhed.
 * Adgang: AdminRoute i App.tsx OG sidens egen `if (!isAdmin) return
 * <Navigate to="/" />` (:46), begge bevaret.
 *
 * VÆLGEREN er HbSelect (native, ingen portal), ikke et søgefelt som
 * HbAdvisorCompanyPrompt: der er ~38 virksomheder, og et native select
 * har typeahead (tast «Ph» → PHILBERT) og tastaturnavigation uden en
 * liste at rulle i. Søgefeltet er rigtigt når listen er en side i sig
 * selv (prompten); her er valget ét felt over zonen.
 *
 * SKALLEN er HbMemberShell (side-flow), som LegatView, EmailLogView og
 * ReviewQueueView: siden hører til admin-blokkens «Platform» i
 * HbMemberShell, ikke til HbAdminShells otte indholdssektioner. Menuen
 * røres ikke (se BulkImport.tsx).
 */
export const ImportView = () => {
  const { isAdvisor, isAdmin, loading } = useAuth();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [importCount, setImportCount] = useState(0);

  // Alle virksomheder — BulkImport.tsx:17-27, ordret.
  const { data: companies } = useQuery({
    queryKey: ["companies-for-import"],
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, name")
        .order("name");
      return data || [];
    },
    enabled: isAdvisor,
  });

  // Virksomhedens første medlem som ejer af upload-rækken — :30-43, ordret.
  const { data: ownerUserId, isLoading: ejerLoader } = useQuery({
    queryKey: ["company-owner", selectedCompanyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("company_members")
        .select("user_id")
        .eq("company_id", selectedCompanyId)
        .in("role", ["owner", "member"])
        .limit(1)
        .maybeSingle();
      return data?.user_id || null;
    },
    enabled: !!selectedCompanyId,
  });

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  const selectedCompany = companies?.find((c) => c.id === selectedCompanyId);

  return (
    <div>
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Platform</p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">Import rapporter</h1>
        <p className="mt-3 text-sm text-hb-ink-soft">
          Importér historiske rapporter for en virksomhed. Filerne kører igennem AI-pipeline automatisk.
        </p>
      </section>

      <div className="mt-10 max-w-3xl space-y-6">
        {/* Info — samme to sætninger som før (:63-69) */}
        <div className="flex items-start gap-3 rounded-hb border border-hb-line bg-hb-sage/30 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-hb-evergreen" />
          <div className="space-y-1 text-xs text-hb-ink-soft">
            <p>Rapporterne tilknyttes den valgte virksomhed og kører igennem den fulde AI-pipeline (extraction, analyse, milestones).</p>
            <p>Chat-beskeder og rådgivernotifikationer springes over ved bulk-import.</p>
          </div>
        </div>

        {/* Virksomhedsvælgeren — HbSelect i stedet for Radix Select (:77-88) */}
        <HbCard className="p-5">
          <HbField label="Vælg virksomhed" htmlFor="import-virksomhed">
            <HbSelect
              id="import-virksomhed"
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
            >
              <option value="">Vælg en virksomhed...</option>
              {companies?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </HbSelect>
          </HbField>
        </HbCard>

        {/* Zonen — kun med valgt virksomhed OG ejer (:92) */}
        {selectedCompanyId && ownerUserId && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-hb-ink-soft">
              <span>
                Uploader til <span className="font-medium text-hb-ink">{selectedCompany?.name}</span>
              </span>
              {importCount > 0 && (
                <span className="ml-auto text-xs font-medium text-hb-evergreen">
                  {importCount} rapport{importCount !== 1 ? "er" : ""} importeret
                </span>
              )}
            </div>
            {/* conversationId={null}: ingen rådgiver-notifikation — det
                adminMode gjorde (filhovedet). key nulstiller zonen pr. virksomhed. */}
            <HbReportUploadZone
              key={selectedCompanyId}
              userId={ownerUserId}
              companyId={selectedCompanyId}
              companyName={selectedCompany?.name ?? null}
              conversationId={null}
              onPipelineComplete={() => setImportCount((c) => c + 1)}
            />
          </div>
        )}

        {selectedCompanyId && !ejerLoader && !ownerUserId && (
          <HbCard className="p-5 text-center text-sm text-hb-ink-soft">
            Ingen ejer fundet for denne virksomhed. Tilknyt først en bruger.
          </HbCard>
        )}
      </div>
    </div>
  );
};
