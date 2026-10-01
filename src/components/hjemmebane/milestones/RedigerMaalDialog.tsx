import { useEffect, useId, useState } from "react";
import { MAKS_FRIST_MAANEDER, TITEL_MAX, type MaalKort } from "@/lib/hjemmebane/maalTal";
import { kbhDato, laegMaanederTilDato } from "@/lib/hverdage";
import { HbButton } from "../HbButton";
import { HbField, HbInput } from "../admin/HbField";
import { HbDialog } from "./HbOverlejring";

/**
 * «Redigér» på et målkort (fladen 1/10-2026): titlen, fristen og — for et
 * tastet tal (andet_tal) — tallet nu. Ikke mere: kategori, beskrivelse og
 * baseline er data fra før designet og vises ikke på kortet; de står urørt i
 * databasen. Skyderen og «nuværende ÷ mål» findes ikke her (Jonas 1/10:
 * «skyderen og den blandede procent forsvinder»).
 *
 * Fristen dømmes mod målets åbne skridt af kalderen (doemFrist — SAMME dom som
 * maal-skriv «rediger» og den gamle detalje: doemMaalFristModSkridt); grunden
 * vises i feltet, intet gemmes. Skrivningen er useMilestones.opdaterFelt
 * (medlemmets klientvej, uændret RLS).
 */

export const REDIGER_TITEL = "Redigér målet";
export const REDIGER_TALLET_NU = "Tallet nu";

type Felter = { title?: string; deadline?: Date | null; current_value?: number };

type Props = {
  kort: MaalKort | null;
  open: boolean;
  onClose: () => void;
  /** Grunden til, at fristen ikke må være denne dato («YYYY-MM-DD»); null = ok. */
  doemFrist: (dato: string | null) => string | null;
  /** Det tastede tal i dag (kun andet_tal); null ellers. */
  tastetTal: number | null;
  /** Enheden («kunder») for et tastet tal. */
  enhed: string | null;
  onGem: (felter: Felter) => Promise<void>;
  nu: Date;
};

const talAf = (s: string): number | null => {
  const t = s.replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

export const RedigerMaalDialog = ({ kort, open, onClose, doemFrist, tastetTal, enhed, onGem, nu }: Props) => {
  // Hooks i TOPBLOKKEN, før enhver betinget return (React #310).
  const [titel, setTitel] = useState("");
  const [frist, setFrist] = useState("");
  const [tal, setTal] = useState("");
  const [fejl, setFejl] = useState<string | null>(null);
  const [fristFejl, setFristFejl] = useState<string | null>(null);
  const [gemmer, setGemmer] = useState(false);
  const idRod = useId();

  useEffect(() => {
    if (!open || !kort) return;
    setTitel(kort.titel);
    setFrist(kort.frist ?? "");
    setTal(tastetTal === null ? "" : String(tastetTal));
    setFejl(null);
    setFristFejl(null);
    setGemmer(false);
  }, [open, kort, tastetTal]);

  if (!open || !kort) return null;
  const erTastet = kort.art === "tal" && kort.noegle === "andet_tal";
  const idag = kbhDato(nu);
  const senest = laegMaanederTilDato(idag, MAKS_FRIST_MAANEDER);

  const gem = async () => {
    const t = titel.trim();
    if (!t) { setFejl("Skriv målet som én sætning"); return; }
    const nyFrist = frist.trim() || null;
    const grund = doemFrist(nyFrist);
    if (grund) { setFristFejl(grund); return; }
    const felter: Felter = {};
    if (t !== kort.titel) felter.title = t;
    if (nyFrist !== (kort.frist ?? null)) {
      if (nyFrist) {
        const [y, m, d] = nyFrist.split("-").map(Number);
        felter.deadline = new Date(y, m - 1, d);
      } else {
        felter.deadline = null;
      }
    }
    if (erTastet) {
      const v = talAf(tal);
      if (v === null) { setFejl("Skriv tallet som det er nu"); return; }
      if (v !== tastetTal) felter.current_value = v;
    }
    setFejl(null);
    setFristFejl(null);
    if (Object.keys(felter).length === 0) { onClose(); return; }
    setGemmer(true);
    await onGem(felter);
    setGemmer(false);
    onClose();
  };

  return (
    <HbDialog
      open={open}
      onClose={onClose}
      titel={REDIGER_TITEL}
      fod={
        <>
          <HbButton variant="secondary" onClick={onClose} disabled={gemmer}>Annuller</HbButton>
          <HbButton onClick={() => void gem()} disabled={gemmer} data-rediger-gem>{gemmer ? "Gemmer…" : "Gem"}</HbButton>
        </>
      }
    >
      <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); void gem(); }} data-rediger-maal={kort.id}>
        <HbField label="Målet som én sætning" htmlFor={`${idRod}-titel`} error={fejl}>
          <HbInput id={`${idRod}-titel`} value={titel} maxLength={TITEL_MAX} autoFocus onChange={(e) => setTitel(e.target.value)} />
        </HbField>
        {erTastet && (
          <HbField label={REDIGER_TALLET_NU} htmlFor={`${idRod}-tal`} help={enhed ? `I ${enhed}.` : undefined}>
            <HbInput id={`${idRod}-tal`} inputMode="decimal" value={tal} onChange={(e) => setTal(e.target.value)} />
          </HbField>
        )}
        <HbField label="Frist" htmlFor={`${idRod}-frist`} error={fristFejl} help="Ikke før et åbent skridts frist.">
          <HbInput id={`${idRod}-frist`} type="date" value={frist} min={idag} max={senest} onChange={(e) => { setFrist(e.target.value); setFristFejl(null); }} />
        </HbField>
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">Gem</button>
      </form>
    </HbDialog>
  );
};
