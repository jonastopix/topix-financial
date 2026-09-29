import React, { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { cn } from "@/lib/utils";
import { MAKS_SEKUNDER } from "@/lib/chatVideo";
import { doemFilLaengde, erTomFil, formatVarighed, TOM_TEKST, vaelgOptageformat } from "@/lib/chatVideoFlade";

/**
 * Optag eller vælg en video til chatten (29/9-2026) — KUN rådgiverens pane
 * åbner den (CompanyChatPane via ChatRichInputs videoKnap).
 *
 * INGEN AUTOMATISK START (Jonas 29/9: «Den starter automatisk når man klikker
 * på kameraet. Jeg vil gerne man lige selv skal trykke optag eller vælg fil.»):
 * kameraknappen åbner dialogen i starttilstanden «vaelg» — to knapper, «Optag
 * video» og «Vælg fil», og «Annullér». Intet live-billede, og getUserMedia kaldes
 * KUN fra «Optag»-handlingen (startOptagelse), aldrig fra en effekt på `open`
 * — så browseren først spørger om kamera og mikrofon, når man har valgt det.
 * Derefter getUserMedia → MediaRecorder, direkte i browseren, ingen tredjepart.
 * Formatet vælges af vaelgOptageformat (MP4 før WebM — begrundelsen står i
 * chatVideoFlade.ts). Tælleren stopper optagelsen af sig selv ved MAKS_SEKUNDER.
 *
 * «Vælg fil» (accept video/*) er den anden vej — fra telefonens rulle. Længden
 * tjekkes på loadedmetadata; over MAKS_SEKUNDER, eller en længde ingen kan
 * aflæse, afvises med en linje.
 *
 * Afvist kamera/mikrofon er en TILSTAND, ikke en fejl: en rolig linje, og
 * «Vælg fil» virker stadig.
 *
 * Komponenten sender intet selv — «Send» giver filen og varigheden til
 * kalderen, som uploader (chatVideoUpload) og indsætter beskeden.
 */

/** vaelg = starttilstanden: intet kamera endnu, kun «Optag video» og «Vælg fil». */
type Fase = "vaelg" | "starter" | "optager" | "forhaandsvis" | "afvist";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (video: { fil: Blob; varighed: number }) => void;
}

export default function ChatVideoOptager({ open, onOpenChange, onSend }: Props) {
  const [fase, setFase] = useState<Fase>("vaelg");
  const [sekunder, setSekunder] = useState(0);
  const [linje, setLinje] = useState<string | null>(null);
  const [forhaandsvisning, setForhaandsvisning] = useState<{ url: string; fil: Blob; varighed: number } | null>(null);

  const liveRef = useRef<HTMLVideoElement>(null);
  const filInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startMsRef = useRef(0);
  const forhaandsUrlRef = useRef<string | null>(null);

  const stopStream = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec && rec.state !== "inactive") {
      rec.ondataavailable = null;
      rec.onstop = null;
      try { rec.stop(); } catch { /* allerede stoppet */ }
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (liveRef.current) liveRef.current.srcObject = null;
  }, []);

  const rydForhaandsvisning = useCallback(() => {
    if (forhaandsUrlRef.current) URL.revokeObjectURL(forhaandsUrlRef.current);
    forhaandsUrlRef.current = null;
    setForhaandsvisning(null);
  }, []);

  const visForhaandsvisning = useCallback((fil: Blob, varighed: number) => {
    rydForhaandsvisning();
    const url = URL.createObjectURL(fil);
    forhaandsUrlRef.current = url;
    setForhaandsvisning({ url, fil, varighed });
    setFase("forhaandsvis");
  }, [rydForhaandsvisning]);

  const stopOptagelse = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const startOptagelse = useCallback(async () => {
    stopStream();
    rydForhaandsvisning();
    setLinje(null);
    setSekunder(0);
    setFase("starter");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setFase("afvist");
      setLinje("Optagelse virker ikke i denne browser. Du kan vælge en videofil i stedet.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });
    } catch {
      setFase("afvist");
      setLinje("Kameraet eller mikrofonen er ikke givet fri. Du kan vælge en videofil i stedet.");
      return;
    }
    streamRef.current = stream;
    if (liveRef.current) liveRef.current.srcObject = stream;

    const format = vaelgOptageformat((t) => MediaRecorder.isTypeSupported(t));
    let rec: MediaRecorder;
    try {
      rec = format ? new MediaRecorder(stream, { mimeType: format }) : new MediaRecorder(stream);
    } catch {
      stopStream();
      setFase("afvist");
      setLinje("Optagelse virker ikke i denne browser. Du kan vælge en videofil i stedet.");
      return;
    }
    const stykker: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) stykker.push(e.data); };
    rec.onstop = () => {
      const varighed = Math.min((Date.now() - startMsRef.current) / 1000, MAKS_SEKUNDER);
      const type = rec.mimeType || format || "video/mp4";
      stopStream();
      visForhaandsvisning(new Blob(stykker, { type }), varighed);
    };
    recorderRef.current = rec;
    startMsRef.current = Date.now();
    rec.start(1000);
    setFase("optager");
    tickRef.current = setInterval(() => {
      const s = Math.floor((Date.now() - startMsRef.current) / 1000);
      setSekunder(Math.min(s, MAKS_SEKUNDER));
      // Loftet: optagelsen stopper af sig selv ved MAKS_SEKUNDER.
      if (s >= MAKS_SEKUNDER) stopOptagelse();
    }, 250);
  }, [stopStream, rydForhaandsvisning, visForhaandsvisning, stopOptagelse]);

  const vaelgFil = useCallback((fil: File | undefined) => {
    if (!fil) return;
    stopStream();
    setLinje(null);
    // INGEN TOM VIDEO (29/9): en tom fil afvises FØR længden læses.
    if (erTomFil(fil)) {
      setFase((f) => (f === "forhaandsvis" || f === "vaelg" ? f : "afvist"));
      setLinje(TOM_TEKST.fil);
      return;
    }
    const url = URL.createObjectURL(fil);
    const v = document.createElement("video");
    v.preload = "metadata";
    const afslut = (dom: ReturnType<typeof doemFilLaengde>, varighed: number) => {
      URL.revokeObjectURL(url);
      v.removeAttribute("src");
      if (dom === "ok") {
        visForhaandsvisning(fil, varighed);
        return;
      }
      setFase((f) => (f === "forhaandsvis" || f === "vaelg" ? f : "afvist"));
      setLinje(
        dom === "for_lang"
          ? `Videoen er længere end ${formatVarighed(MAKS_SEKUNDER)} minutter. Vælg en kortere.`
          : "Videoens længde kunne ikke aflæses. Prøv en anden fil.",
      );
    };
    v.onloadedmetadata = () => afslut(doemFilLaengde(v.duration), v.duration);
    v.onerror = () => afslut("ukendt", Number.NaN);
    v.src = url;
  }, [stopStream, visForhaandsvisning]);

  // Åbnes dialogen, står den i «vaelg» — kameraet startes IKKE her (Jonas 29/9),
  // kun af «Optag video». Lukkes den, ryddes alt.
  useEffect(() => {
    stopStream();
    rydForhaandsvisning();
    setLinje(null);
    setSekunder(0);
    setFase("vaelg");
  }, [open, stopStream, rydForhaandsvisning]);

  // Dialogen er en portal og kan mounte EFTER getUserMedia svarer — kobl
  // strømmen på live-billedet, hver gang fasen skifter.
  useEffect(() => {
    if (liveRef.current && streamRef.current && liveRef.current.srcObject !== streamRef.current) {
      liveRef.current.srcObject = streamRef.current;
    }
  }, [fase]);

  useEffect(() => () => {
    stopStream();
    if (forhaandsUrlRef.current) URL.revokeObjectURL(forhaandsUrlRef.current);
  }, [stopStream]);

  const send = () => {
    if (!forhaandsvisning) return;
    // INGEN TOM VIDEO (29/9): en optagelse på 0 bytes sendes aldrig — en rolig
    // linje, og «Optag igen» står allerede der (fasen er forhaandsvis).
    if (erTomFil(forhaandsvisning.fil)) {
      setLinje(TOM_TEKST.optagelse);
      return;
    }
    onSend({ fil: forhaandsvisning.fil, varighed: forhaandsvisning.varighed });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="theme-hjemmebane border-hb-line bg-hb-surface sm:max-w-lg max-sm:h-[100dvh] max-sm:max-w-full max-sm:rounded-none">
        <DialogHeader>
          <DialogTitle className="text-hb-ink">Videosvar</DialogTitle>
          <DialogDescription className="text-hb-ink-soft">
            Højst {formatVarighed(MAKS_SEKUNDER)} minutter. Optag med kameraet, eller vælg en video fra telefonen.
          </DialogDescription>
        </DialogHeader>

        {fase === "vaelg" ? (
          <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-hb border border-hb-line bg-hb-sage/20 p-6">
            <HbButton type="button" onClick={() => void startOptagelse()}>
              Optag video
            </HbButton>
            <HbButton type="button" variant="secondary" onClick={() => filInputRef.current?.click()}>
              Vælg fil
            </HbButton>
          </div>
        ) : (
        <div className="relative overflow-hidden rounded-hb border border-hb-line bg-black aspect-video">
          {fase === "forhaandsvis" && forhaandsvisning ? (
            <video
              key={forhaandsvisning.url}
              src={forhaandsvisning.url}
              controls
              playsInline
              className="h-full w-full object-contain"
            />
          ) : (
            <video ref={liveRef} autoPlay muted playsInline className={cn("h-full w-full object-cover", fase !== "optager" && "opacity-40")} />
          )}
          {fase === "optager" && (
            <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden />
              {formatVarighed(sekunder)} / {formatVarighed(MAKS_SEKUNDER)}
            </div>
          )}
          {fase === "starter" && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Starter kameraet …</div>
          )}
        </div>
        )}

        {linje && <p className="text-sm text-hb-ink-soft">{linje}</p>}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <HbButton type="button" variant="link" className="mr-auto" onClick={() => onOpenChange(false)}>
            Annullér
          </HbButton>
          {fase !== "vaelg" && (
            <HbButton type="button" variant="secondary" onClick={() => filInputRef.current?.click()}>
              Vælg fil
            </HbButton>
          )}
          {fase === "optager" && (
            <HbButton type="button" onClick={stopOptagelse}>
              Stop
            </HbButton>
          )}
          {(fase === "forhaandsvis" || fase === "afvist") && (
            <HbButton type="button" variant="secondary" onClick={() => void startOptagelse()}>
              Optag igen
            </HbButton>
          )}
          {fase === "forhaandsvis" && (
            <HbButton type="button" onClick={send}>
              Send
            </HbButton>
          )}
        </div>

        <input
          ref={filInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            vaelgFil(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
