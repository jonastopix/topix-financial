import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Upload, X } from "lucide-react";
import type { RaadgiverOpslag } from "@/lib/hjemmebane/ansigter";
import { flyt, GAESTEVAERT_MAERKE, type VaertUdkast } from "@/lib/hjemmebane/vaerter";
import { uploadGaestFoto } from "@/lib/hjemmebane/vaerterApi";
import { HbAvatar } from "@/components/hjemmebane/HbAvatar";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { HbTag } from "@/components/hjemmebane/HbTag";
import { HbField, HbInput, HbSelect } from "../HbField";

/** «Værter» i event-editoren (PR 4b): vælg rådgivere (get_all_advisor_profiles
    via useRaadgivere i forælderen), «+ Tilføj gæstevært» (navn påkrævet,
    titel/virksomhed og foto valgfri), rækkefølge med op/ned. Feltet ejer
    intet — udkastet bor i EventEditor og gemmes SAMMEN med eventet
    (persist → saveVaerter). Gæstens foto uploades straks til content-assets
    (vaerter/{event_id}/…) — kun stien ligger i udkastet. */
export const VaerterFelt = ({
  eventId,
  vaerter,
  onChange,
  raadgivere,
}: {
  eventId: string;
  vaerter: readonly VaertUdkast[];
  onChange: (naeste: VaertUdkast[]) => void;
  raadgivere: RaadgiverOpslag;
}) => {
  const [valgtRaadgiver, setValgtRaadgiver] = useState("");
  const [gaestAaben, setGaestAaben] = useState(false);
  const [gaestNavn, setGaestNavn] = useState("");
  const [gaestTitel, setGaestTitel] = useState("");
  const [gaestFoto, setGaestFoto] = useState<string | null>(null);
  const [uploader, setUploader] = useState(false);
  const [fotoFejl, setFotoFejl] = useState<string | null>(null);
  const filRef = useRef<HTMLInputElement>(null);

  const ledige = [...raadgivere.values()].filter((r) => !vaerter.some((v) => v.user_id === r.user_id));

  const tilfoejRaadgiver = () => {
    if (!valgtRaadgiver) return;
    onChange([...vaerter, { user_id: valgtRaadgiver, gaest_navn: null, gaest_titel: null, gaest_foto_path: null }]);
    setValgtRaadgiver("");
  };
  const tilfoejGaest = () => {
    if (!gaestNavn.trim()) return;
    onChange([...vaerter, { user_id: null, gaest_navn: gaestNavn.trim(), gaest_titel: gaestTitel.trim() || null, gaest_foto_path: gaestFoto }]);
    setGaestNavn(""); setGaestTitel(""); setGaestFoto(null); setGaestAaben(false);
  };
  const uploadFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fil = e.target.files?.[0];
    if (!fil) return;
    if (!fil.type.startsWith("image/")) { setFotoFejl("Vælg en billedfil"); return; }
    if (fil.size > 2 * 1024 * 1024) { setFotoFejl("Billedet må højst være 2 MB"); return; }
    setUploader(true); setFotoFejl(null);
    try {
      setGaestFoto(await uploadGaestFoto(eventId, fil));
    } catch (err) {
      setFotoFejl(err instanceof Error ? err.message : "Billedet kunne ikke uploades");
    } finally {
      setUploader(false);
      if (filRef.current) filRef.current.value = "";
    }
  };

  return (
    <HbField label="Værter" help="Rækkefølgen er visningens: «Morten og Jonas». Gæsteværter er ikke på platformen — de vises med navn, titel og mærket «Gæstevært».">
      {vaerter.length > 0 && (
        <ul className="mb-3 divide-y divide-hb-line rounded-lg border border-hb-line" data-vaerter-udkast={vaerter.length}>
          {vaerter.map((v, i) => {
            const p = v.user_id ? raadgivere.get(v.user_id) : null;
            const navn = v.user_id ? (p?.full_name ?? "Ukendt rådgiver") : (v.gaest_navn ?? "");
            return (
              <li key={`${v.user_id ?? "gaest"}-${i}`} className="flex items-center gap-3 px-3 py-2">
                <HbAvatar navn={navn} avatarUrl={v.user_id ? (p?.avatar_url ?? null) : null} stoerrelse="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-hb-ink">{navn}</p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-hb-ink-soft">
                    {v.user_id ? "Rådgiver" : <HbTag className="px-2 py-0.5 text-[11px]">{GAESTEVAERT_MAERKE}</HbTag>}
                    {!v.user_id && v.gaest_titel && <span>{v.gaest_titel}</span>}
                    {!v.user_id && v.gaest_foto_path && <span>· foto</span>}
                  </p>
                </div>
                <button type="button" aria-label="Flyt op" disabled={i === 0} onClick={() => onChange(flyt(vaerter, i, -1))} className="rounded p-1 text-hb-ink-soft hover:text-hb-ink disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" aria-label="Flyt ned" disabled={i === vaerter.length - 1} onClick={() => onChange(flyt(vaerter, i, 1))} className="rounded p-1 text-hb-ink-soft hover:text-hb-ink disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                <button type="button" aria-label="Fjern vært" onClick={() => onChange(vaerter.filter((_, j) => j !== i))} className="rounded p-1 text-hb-ink-soft hover:text-hb-rust"><X className="h-4 w-4" /></button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <HbSelect aria-label="Vælg rådgiver" value={valgtRaadgiver} onChange={(e) => setValgtRaadgiver(e.target.value)} className="max-w-xs">
          <option value="">Vælg rådgiver…</option>
          {ledige.map((r) => (
            <option key={r.user_id} value={r.user_id}>{r.full_name ?? r.user_id}</option>
          ))}
        </HbSelect>
        <HbButton type="button" variant="secondary" className="h-9 gap-1 px-3 text-sm" onClick={tilfoejRaadgiver} disabled={!valgtRaadgiver}>
          <Plus className="h-3.5 w-3.5" /> Tilføj rådgiver
        </HbButton>
        {!gaestAaben && (
          <button type="button" onClick={() => setGaestAaben(true)} className="text-sm text-hb-evergreen underline-offset-4 hover:underline">+ Tilføj gæstevært</button>
        )}
      </div>
      {gaestAaben && (
        <div className="mt-3 space-y-3 rounded-lg border border-hb-line p-3" data-gaest-formular>
          <HbField label="Navn *" htmlFor="vaert-gaest-navn">
            <HbInput id="vaert-gaest-navn" value={gaestNavn} onChange={(e) => setGaestNavn(e.target.value)} placeholder="Fx Mette Hansen" />
          </HbField>
          <HbField label="Titel / virksomhed" htmlFor="vaert-gaest-titel">
            <HbInput id="vaert-gaest-titel" value={gaestTitel} onChange={(e) => setGaestTitel(e.target.value)} placeholder="Fx CFO, Nordic ApS" />
          </HbField>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={filRef} type="file" accept="image/*" onChange={uploadFoto} className="hidden" />
            <HbButton type="button" variant="secondary" className="h-9 gap-1.5 px-3 text-sm" onClick={() => filRef.current?.click()} disabled={uploader}>
              {uploader ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {gaestFoto ? "Skift foto" : "Foto (valgfrit)"}
            </HbButton>
            {gaestFoto && <span className="text-xs text-hb-ink-soft">Foto uploadet</span>}
            {fotoFejl && <span className="text-xs text-hb-rust">{fotoFejl}</span>}
          </div>
          <div className="flex items-center gap-3">
            <HbButton type="button" className="h-9 px-4 text-sm" onClick={tilfoejGaest} disabled={!gaestNavn.trim() || uploader}>Tilføj gæstevært</HbButton>
            <button type="button" onClick={() => { setGaestAaben(false); setGaestNavn(""); setGaestTitel(""); setGaestFoto(null); }} className="text-sm text-hb-ink-soft underline-offset-4 hover:underline">Fortryd</button>
          </div>
        </div>
      )}
    </HbField>
  );
};
