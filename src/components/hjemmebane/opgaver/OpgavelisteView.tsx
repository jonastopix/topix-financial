import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { kraevRaekker } from "@/lib/kraevRaekker";
import { cn } from "@/lib/utils";
import { afgoerOpgave, delListe, fristTekst, type RaadgiverOpgave } from "@/lib/raadgiverOpgaver";
import {
  RAADGIVER_OPGAVER_KEY, hentRaadgiverOpgaver, invaliderOpgaver, opretOpgave, retOpgave, saetGjort, sletOpgave,
} from "@/hooks/raadgiverOpgaver";
import { HbButton } from "../HbButton";
import { HbCard } from "../HbCard";
import { HbSection } from "../HbSection";
import { HbTag } from "../HbTag";
import { HbInput, HbSelect } from "../admin/HbField";

/**
 * /opgaver — rådgivernes fælles to-do-liste (Jonas 8/9, analyse-todo-
 * listen.md): «et sted at få skrevet ned hvad vi snakker om i chatten».
 * En liste VED SIDEN AF forsiden: forsiden regner, listen husker. Intet
 * lander her automatisk; rådgiveren skriver selv.
 *
 * EGEN SIDE, ikke forsiden (besluttet 8/9): forsiden er dommen — det data
 * siger lige nu, uden knapper man kan skrive i (forsiden-design §10: en
 * forside der aldrig kan være tom, bliver aldrig troet). En liste man
 * skriver i, redigerer og krydser af, ville gøre den til noget andet. Til
 * gengæld står der én linje under stregen på forsiden («N punkter på
 * jeres liste · M forfaldne») med link hertil, så listen SES hver morgen
 * uden at fylde. Menupunktet «Opgaver» i rådgiverblokken er den anden vej.
 *
 * ÉN liste med ejerskab pr. punkt, ikke to: alle ser alt; «Mine» er et
 * filter, ikke en anden liste. Ejeren kan skiftes i rækken («giv den til
 * Morten»). Dommen (rækkefølge, forfalden, gammel) er lib/raadgiverOpgaver;
 * skrivevejen hooks/raadgiverOpgaver — ingen optimistisk patch.
 *
 * KIRKEGÅRDEN: intet åbent skjules. Forfaldne står øverst i rust; udaterede
 * ældre end 30 dage siger selv hvor længe de har ligget. Gjorte forlader
 * fladen efter 30 dage (rækken bliver). Rust er husets «kræver dig»;
 * handlinger er evergreen.
 */

type Raadgiver = { user_id: string; full_name: string };
type Virksomhed = { id: string; name: string };

const idag = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function hentOpslag(): Promise<{ raadgivere: Raadgiver[]; virksomheder: Virksomhed[] }> {
  const [raadgiverRes, virksomhedRes] = await Promise.all([
    supabase.rpc("get_all_advisor_profiles"),
    // Alle virksomheder, også de faldne: et punkt kan handle om Rallysupport.
    supabase.from("companies").select("id, name, is_legat").order("name").limit(500),
  ]);
  const raadgivere = ((raadgiverRes.data ?? []) as Raadgiver[]).filter((r) => r.user_id).sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "", "da"));
  const virksomheder = (kraevRaekker(virksomhedRes, "companies") as { id: string; name: string | null; is_legat: boolean | null }[])
    .filter((c) => !c.is_legat && c.name)
    .map((c) => ({ id: c.id, name: c.name as string }));
  return { raadgivere, virksomheder };
}

const fornavn = (navn: string | undefined): string => (navn ?? "").split(" ")[0] || "?";

export const OpgavelisteView = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [visning, setVisning] = useState<"alle" | "mine">("alle");
  const [visGjorte, setVisGjorte] = useState(false);
  // Nyt punkt
  const [tekst, setTekst] = useState("");
  const [frist, setFrist] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [ejerId, setEjerId] = useState("");
  // Rettelse i rækken
  const [retterId, setRetterId] = useState<string | null>(null);
  const [retTekst, setRetTekst] = useState("");
  const [retFrist, setRetFrist] = useState("");
  const [retCompanyId, setRetCompanyId] = useState("");
  const [sletId, setSletId] = useState<string | null>(null);

  const opgaverQuery = useQuery({
    queryKey: [...RAADGIVER_OPGAVER_KEY],
    queryFn: hentRaadgiverOpgaver,
    enabled: !!user,
    staleTime: 60_000,
  });
  const opslagQuery = useQuery({
    queryKey: ["raadgiver-opgaver-opslag"],
    queryFn: hentOpslag,
    enabled: !!user,
    staleTime: 10 * 60_000,
  });

  // Skriv, så hent igen — dommen afgør hvad der står.
  const skriv = useMutation({
    mutationFn: async (handling: () => Promise<void>) => {
      await handling();
      await invaliderOpgaver(queryClient);
    },
    onError: (e: Error) => toast.error("Kunne ikke gemme", { description: e.message }),
  });

  const nu = useMemo(() => new Date(), [opgaverQuery.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const liste = useMemo(() => delListe(opgaverQuery.data ?? [], nu), [opgaverQuery.data, nu]);
  const raadgivere = opslagQuery.data?.raadgivere ?? [];
  const virksomheder = opslagQuery.data?.virksomheder ?? [];
  const navnAf = (id: string) => fornavn(raadgivere.find((r) => r.user_id === id)?.full_name);
  const virksomhedAf = (id: string | null) => (id ? virksomheder.find((v) => v.id === id) ?? null : null);
  const filtrer = (o: RaadgiverOpgave) => visning === "alle" || o.ejer_id === user?.id;
  const aabne = liste.aabne.filter(filtrer);
  const gjorte = liste.gjorte.filter(filtrer);

  const opret = () => {
    if (!user) return;
    skriv.mutate(async () => {
      await opretOpgave({ tekst, ejerId: ejerId || user.id, oprettetAf: user.id, companyId: companyId || null, frist: frist || null });
      setTekst("");
      setFrist("");
      setCompanyId("");
      toast.success("Skrevet ned");
    });
  };
  const startRet = (o: RaadgiverOpgave) => {
    setRetterId(o.id);
    setRetTekst(o.tekst);
    setRetFrist(o.frist ?? "");
    setRetCompanyId(o.company_id ?? "");
  };
  const gemRet = (o: RaadgiverOpgave) => {
    skriv.mutate(async () => {
      await retOpgave(o.id, { tekst: retTekst, frist: retFrist || null, company_id: retCompanyId || null });
      setRetterId(null);
    });
  };

  if (opgaverQuery.isError) {
    return <p className="text-sm text-hb-rust">Listen kunne ikke hentes. Prøv igen.</p>;
  }

  const Raekke = ({ o }: { o: RaadgiverOpgave }) => {
    const dom = afgoerOpgave(o, nu);
    const forfalden = dom.tilstand === "forfalden";
    const gjort = dom.tilstand === "gjort";
    const v = virksomhedAf(o.company_id);
    const retter = retterId === o.id;
    return (
      <li className="flex items-start gap-3.5 py-3">
        <button
          type="button"
          onClick={() => skriv.mutate(() => saetGjort(o.id, !gjort))}
          disabled={skriv.isPending}
          title={gjort ? "Marker som ikke gjort" : "Marker som gjort"}
          aria-label={gjort ? "Marker som ikke gjort" : "Marker som gjort"}
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
            gjort ? "border-hb-evergreen bg-hb-evergreen" : forfalden ? "border-hb-rust" : "border-hb-line hover:border-hb-evergreen",
          )}
        >
          {gjort && <Check className="h-3 w-3 text-white" />}
        </button>
        <div className="min-w-0 flex-1">
          {retter ? (
            <div className="space-y-2">
              <HbInput value={retTekst} onChange={(e) => setRetTekst(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === "Enter") gemRet(o); if (e.key === "Escape") setRetterId(null); }} />
              <div className="flex flex-wrap items-center gap-2">
                <HbInput type="date" value={retFrist} onChange={(e) => setRetFrist(e.target.value)} className="w-auto" />
                <HbSelect value={retCompanyId} onChange={(e) => setRetCompanyId(e.target.value)} className="w-auto">
                  <option value="">Ingen virksomhed</option>
                  {virksomheder.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </HbSelect>
                <HbButton variant="secondary" className="h-9 px-4 text-xs" onClick={() => gemRet(o)} disabled={skriv.isPending}>Gem</HbButton>
                <button type="button" onClick={() => setRetterId(null)} className="text-xs text-hb-ink-soft underline-offset-4 hover:underline">Fortryd</button>
              </div>
            </div>
          ) : (
            <>
              <button type="button" onClick={() => !gjort && startRet(o)} className={cn("block w-full text-left text-[15px] leading-snug", gjort ? "text-hb-ink-soft line-through" : "text-hb-ink")} title={gjort ? undefined : "Ret"}>
                {o.tekst}
              </button>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-hb-ink-soft">
                {!gjort && <span className={cn(forfalden && "font-medium text-hb-rust")}>{fristTekst(dom)}</span>}
                {gjort && o.gjort_at && <span>Gjort {new Date(o.gjort_at).toLocaleDateString("da-DK", { day: "numeric", month: "short" })}</span>}
                {v && (
                  <>
                    <span>·</span>
                    <Link to={`/virksomhed/${v.id}`} className="text-hb-evergreen underline-offset-4 hover:underline">{v.name}</Link>
                  </>
                )}
                {o.oprettet_af !== o.ejer_id && <span>· skrevet af {navnAf(o.oprettet_af)}</span>}
              </p>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Ejeren — skiftes her: «giv den til Morten». */}
          <HbSelect
            value={o.ejer_id}
            onChange={(e) => skriv.mutate(() => retOpgave(o.id, { ejer_id: e.target.value }))}
            disabled={skriv.isPending || gjort}
            aria-label="Hvem har punktet"
            className="h-8 w-auto px-2 py-0 text-xs"
          >
            {raadgivere.map((r) => <option key={r.user_id} value={r.user_id}>{fornavn(r.full_name)}</option>)}
            {!raadgivere.some((r) => r.user_id === o.ejer_id) && <option value={o.ejer_id}>?</option>}
          </HbSelect>
          {sletId === o.id ? (
            <button type="button" onClick={() => skriv.mutate(async () => { await sletOpgave(o.id); setSletId(null); })} className="text-xs font-medium text-hb-rust underline-offset-4 hover:underline">
              Slet, helt sikkert
            </button>
          ) : (
            <button type="button" onClick={() => setSletId(o.id)} title="Slet" aria-label="Slet" className="rounded-full p-1.5 text-hb-ink-soft transition-colors hover:bg-hb-sage/50 hover:text-hb-rust">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div>
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Jeres liste</p>
          <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">Opgaver</h1>
          <p className="mt-3 text-sm text-hb-ink-soft">Det I aftaler i chatten, skrevet ned. Fristen sorterer; forfaldne står øverst.</p>
        </div>
        <div className="flex items-center gap-2">
          {(["alle", "mine"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVisning(v)}
              className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors", visning === v ? "bg-hb-evergreen text-white" : "bg-hb-sage/60 text-hb-ink hover:bg-hb-sage")}
            >
              {v === "alle" ? "Alle" : "Mine"}
            </button>
          ))}
        </div>
      </section>

      {/* ── Nyt punkt ── */}
      <HbSection eyebrow="Skriv ned" hairline className="mt-10">
        <HbCard className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <HbInput
              value={tekst}
              onChange={(e) => setTekst(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && tekst.trim()) opret(); }}
              placeholder="F.eks. Følg op på strategien med BR Roset"
              className="flex-1"
            />
            <HbInput type="date" value={frist} min={idag()} onChange={(e) => setFrist(e.target.value)} aria-label="Frist" className="w-auto" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <HbSelect value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label="Virksomhed" className="w-auto">
              <option value="">Ingen virksomhed</option>
              {virksomheder.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </HbSelect>
            <HbSelect value={ejerId || user?.id || ""} onChange={(e) => setEjerId(e.target.value)} aria-label="Til hvem" className="w-auto">
              {raadgivere.map((r) => <option key={r.user_id} value={r.user_id}>{r.user_id === user?.id ? "Mig" : fornavn(r.full_name)}</option>)}
            </HbSelect>
            <HbButton onClick={opret} disabled={!tekst.trim() || skriv.isPending} className="h-10 px-5">Skriv ned</HbButton>
          </div>
        </HbCard>
      </HbSection>

      {/* ── Åbne ── */}
      <HbSection eyebrow={`Åbne · ${aabne.length}${liste.forfaldne > 0 && visning === "alle" ? ` · ${liste.forfaldne} ${liste.forfaldne === 1 ? "forfalden" : "forfaldne"}` : ""}`} hairline className="mt-12">
        <HbCard className="px-5 py-2">
          {opgaverQuery.isLoading ? (
            <div aria-hidden className="py-3"><div className="h-4 w-1/3 animate-pulse rounded bg-hb-line/60" /></div>
          ) : aabne.length > 0 ? (
            <ul className="divide-y divide-hb-line">{aabne.map((o) => <Raekke key={o.id} o={o} />)}</ul>
          ) : (
            <p className="py-3 text-sm text-hb-ink-soft">{visning === "mine" ? "Intet på din del af listen." : "Listen er tom. Det er et gyldigt svar."}</p>
          )}
        </HbCard>
      </HbSection>

      {/* ── Gjorte: de seneste 30 dage, foldet sammen ── */}
      {(gjorte.length > 0 || liste.gjorteSkjult > 0) && (
        <section className="mt-8 max-w-3xl text-sm text-hb-ink-soft">
          <button type="button" onClick={() => setVisGjorte((v) => !v)} className="text-hb-evergreen underline-offset-4 hover:underline">
            {visGjorte ? "Skjul gjorte" : `Gjort · ${gjorte.length}`}
          </button>
          {liste.gjorteSkjult > 0 && <span> · {liste.gjorteSkjult} ældre end 30 dage vises ikke</span>}
          {visGjorte && gjorte.length > 0 && (
            <HbCard className="mt-3 px-5 py-2">
              <ul className="divide-y divide-hb-line">{gjorte.map((o) => <Raekke key={o.id} o={o} />)}</ul>
            </HbCard>
          )}
          {visGjorte && gjorte.length > 0 && <HbTag className="mt-3 px-2 py-0.5 text-[11px]">Rækkerne bliver i tabellen — det er en log</HbTag>}
        </section>
      )}
    </div>
  );
};
