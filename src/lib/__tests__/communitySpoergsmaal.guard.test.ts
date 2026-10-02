import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (2/10-2026): rådgivernes «Spørgsmål» øverst i Community, filtret
// «Ubesvarede» og «Hvem kan hjælpe med …» (Jonas 2/10 kl. 07:26: ingen ugentlig
// pligt; rådgiveren markerer et opslag, det lægger sig øverst; medlemmernes
// opslag må ikke drukne). Syv domme over kildetekst; «VÆRNET VIRKER» kører dem
// på kopier med fejlen indsat.
//
//   1. MIGRATIONEN (20261002243000): første linje «IKKE KØRT. KRÆVER JONAS'
//      GRØNNE LYS …»; kolonnen; det delvist unikke indeks (højst ét); den
//      EGNE trigger (has_role advisor, RAISE) — protect_community_traad_
//      immutable_fields røres ikke; triggeren dømmer en direkte PATCH med
//      RPC'ens regler (rådets fund 2/10: rådgivere har UPDATE på alle tråde):
//      ved SÆT kræves forfatteren rådgiver, status 'aktiv' og ingen
//      tjenestekonto, og skjul/slet RYDDER markeringen; RPC'en
//      marker_community_spoergsmaal med rådgiver-gaten FØRST (før nogen
//      UPDATE), tjenestekonti afvist, advisory-låsen før første UPDATE, kun
//      aktiv, kun en rådgivers opslag, rydning FØR sæt; DROP før CREATE for
//      begge læse-RPC'er og REVOKE/GRANT efter hver; get_community_svar urørt.
//   2. LÆSE-RPC'ERNE er 20261002242000 (gæstens læse-dom: porten
//      kan_laese_community) ORD FOR ORD, når linjerne med
//      «-- SPOERGSMAAL» fjernes og whitespace foldes (CREATE OR REPLACE ↔
//      CREATE) — merget med prod er en kopi, ikke en omskrivning. Gæstens
//      migration står på en anden gren (feat/trigger-og-gaest) og KØRES i
//      prod FØR denne; indtil den er merget, er kilden en ordret kopi af dens
//      to læse-RPC'er i src/lib/__fixtures__ (FIXTURE). Findes filen i
//      repoet, sammenlignes med den, og fixturen skal være identisk med den
//      blok for blok — så kan fixturen aldrig glide fra kilden i stilhed. ÉN
//      erklæret undtagelse: feed-kroppens to kommentarlinjer «Nøjagtig den
//      kanoniske sortering …» er ikke længere sande og er erstattet af
//      markørlinjer (ERSTATTEDE_KOMMENTARLINJER — kun disse, kun i feedet).
//   3. FLADEN dømmer gennem lib/hjemmebane/communitySpoergsmaal (delFeed,
//      filtrerStroem, erUbesvaret, taelUbesvarede) — ingen egen filtrering
//      på antal_svar eller spoergsmaal_markeret_at; strømmen tegner `viste`,
//      ikke `traade`; kortet får `delt.spoergsmaal` og `delt.foldet`.
//   4. KUN RÅDGIVERE, der ikke ser som medlem, ser markér-feltet og «Fjern»
//      (kanMarkere = isAdvisor && !viewingAsMember; trådsiden giver
//      visMarkerKnap samme erRaadgiver), og markeringen
//      sættes EFTER opretTraad i try/catch med MARKERING_FEJL_TITEL — aldrig
//      en kastet fejl (opslaget ER delt).
//   5. TJENESTEKONTI: rådgiver-mængden og hjælperkortene læses af
//      useNetvaerketsRaekker (hooks/netvaerketsRaekker → listMemberDirectory,
//      filtreret i memberProfile.ts) under nøglen "member-directory" — ingen
//      rå RPC i fladen, og ingen import af memberProfile i CommunityView
//      (praesentationPladsholder.guard dom 3).
//   6. ORDENE bor i de to lib-filer: «Spørgsmål fra rådgiverne», «Hvem kan
//      hjælpe med …», «Skriv én linje», «Markér som Spørgsmål» står ikke
//      hårdkodet i komponenterne.
//   7. INTET ANDET FASTGØRES: ingen skrivning til fastgjort i klienten eller
//      migrationen; trådsiden dømmer knappen gennem visMarkerKnap, og
//      hooks står før den første betingede return.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const MIGRATION = "supabase/migrations/20261002243000_community_spoergsmaal.sql";
// Kilden til læse-RPC'ernes kroppe: gæstens migration (porten kan_laese_community).
// Den er ikke merget, når denne gren bygges, og CI's checkout har ikke dens
// gren — derfor en ordret kopi (FIXTURE) frem for `git show`, der ville fejle
// i CI eller måle en anden tilstand end den, der køres i prod. Når filen
// findes, er den kilden, og fixturen skal være lig med den (dom 2).
const FORRIGE = "supabase/migrations/20261002242000_community_gaest_laeser.sql";
const FIXTURE = "src/lib/__fixtures__/community_gaest_laeser_20261002242000_laese_rpc.sql";
const LAESE_RPCER = ["public.get_community_feed(", "public.get_community_traad("] as const;
const VIEW = "src/components/hjemmebane/community/CommunityView.tsx";
const TRAAD = "src/components/hjemmebane/community/CommunityTraadView.tsx";
const KORT = "src/components/hjemmebane/community/SpoergsmaalKort.tsx";
const HJAELPERE = "src/components/hjemmebane/community/HvemKanHjaelpe.tsx";
const LIB = "src/lib/hjemmebane/communitySpoergsmaal.ts";
const LIB_HJ = "src/lib/hjemmebane/communityHjaelpere.ts";
const API = "src/lib/hjemmebane/communityApi.ts";
const HOOK = "src/hooks/netvaerketsRaekker.ts";

const MARKOER = "-- SPOERGSMAAL";

// ── dom 1 ───────────────────────────────────────────────────────────────────
export function migrationenHolder(m: string): boolean {
  const linjer = m.split("\n");
  // Før kørslen: «IKKE KØRT. KRÆVER JONAS' GRØNNE LYS …». Efter (2/10-2026): «KØRT i prod <dato> … Jonas' grønne lys».
  if (
    !linjer[0].startsWith("-- IKKE KØRT. KRÆVER JONAS' GRØNNE LYS (SECURITY DEFINER-RPC). DEPLOY: ") &&
    !/^-- KØRT i prod \d{1,2}\/\d{1,2}-\d{4} .*Jonas' grønne lys/.test(linjer[0])
  ) return false;
  if (!m.includes("ADD COLUMN IF NOT EXISTS spoergsmaal_markeret_at timestamptz")) return false;
  if (!/CREATE UNIQUE INDEX IF NOT EXISTS community_traade_et_spoergsmaal_uidx\s+ON public\.community_traade \(\(true\)\)\s+WHERE spoergsmaal_markeret_at IS NOT NULL;/.test(m)) return false;
  // Egen trigger, ikke den beskyttede.
  if (/CREATE OR REPLACE FUNCTION public\.protect_/.test(m)) return false;
  const trig = blok(m, "CREATE OR REPLACE FUNCTION public.community_traade_spoergsmaal_vaern()");
  if (!trig.includes("NOT public.has_role(auth.uid(), 'advisor')") || !trig.includes("RAISE EXCEPTION")) return false;
  // Direkte PATCH dømmes som RPC'en: ved SÆT forfatter-rådgiver, aktiv, ingen tjenestekonto.
  const saetGren = trig.indexOf("IF NEW.spoergsmaal_markeret_at IS NOT NULL THEN\n    -- RPC'ens tre regler");
  if (saetGren === -1) return false;
  const saetKrop = trig.slice(saetGren);
  if (!saetKrop.includes("IF EXISTS (SELECT 1 FROM public.tjenestekonti tk WHERE tk.user_id = auth.uid()) THEN")) return false;
  if (!saetKrop.includes("IF NOT public.has_role(NEW.forfatter_id, 'advisor') THEN")) return false;
  if (!saetKrop.includes("IF NEW.status <> 'aktiv' THEN")) return false;
  // Skjul/slet rydder — øverst, før dybde- og rolle-tjekket.
  const ryddes = trig.indexOf("IF TG_OP = 'UPDATE' AND NEW.status <> 'aktiv' AND NEW.spoergsmaal_markeret_at IS NOT NULL THEN\n    NEW.spoergsmaal_markeret_at := NULL;");
  const dybde = trig.indexOf("IF pg_trigger_depth() > 1 THEN");
  if (ryddes === -1 || dybde === -1 || ryddes > dybde) return false;
  if (!/CREATE TRIGGER community_traade_spoergsmaal_vaern\s+BEFORE INSERT OR UPDATE ON public\.community_traade/.test(m)) return false;
  // RPC'en: gaten før første UPDATE, aktiv, rådgiverens opslag, ryd før sæt.
  const rpc = blok(m, "CREATE OR REPLACE FUNCTION public.marker_community_spoergsmaal(");
  if (!rpc.includes("SECURITY DEFINER")) return false;
  const gate = rpc.indexOf("IF NOT public.has_role(auth.uid(), 'advisor') THEN");
  const foersteUpdate = rpc.indexOf("UPDATE public.community_traade");
  if (gate === -1 || foersteUpdate === -1 || gate > foersteUpdate) return false;
  const tjeneste = rpc.indexOf("IF EXISTS (SELECT 1 FROM public.tjenestekonti tk WHERE tk.user_id = auth.uid()) THEN");
  const laas = rpc.indexOf("PERFORM pg_advisory_xact_lock(hashtext('community_spoergsmaal'));");
  if (tjeneste === -1 || laas === -1 || !(gate < laas && laas < foersteUpdate)) return false;
  if (!rpc.includes("IF _status <> 'aktiv' THEN")) return false;
  if (!rpc.includes("IF NOT public.has_role(_forfatter_id, 'advisor') THEN")) return false;
  const ryd = rpc.indexOf("SET spoergsmaal_markeret_at = NULL\n    WHERE spoergsmaal_markeret_at IS NOT NULL\n      AND id <> p_traad_id;");
  const saet = rpc.indexOf("SET spoergsmaal_markeret_at = now()");
  if (ryd === -1 || saet === -1 || ryd > saet) return false;
  if (!m.includes("GRANT EXECUTE ON FUNCTION public.marker_community_spoergsmaal(uuid, boolean) TO authenticated;")) return false;
  // DROP før CREATE + grants efter hver læse-RPC; svar-RPC'en urørt.
  for (const [sig, navn] of [
    ["public.get_community_feed(int, int)", "public.get_community_feed("],
    ["public.get_community_traad(uuid)", "public.get_community_traad("],
  ] as const) {
    const drop = m.indexOf(`DROP FUNCTION ${sig};`);
    const create = m.indexOf(`CREATE FUNCTION ${navn}`);
    const grant = m.indexOf(`GRANT EXECUTE ON FUNCTION ${sig} TO authenticated;`);
    const revokeAnon = m.indexOf(`REVOKE ALL ON FUNCTION ${sig} FROM anon;`);
    if (drop === -1 || create === -1 || grant === -1 || revokeAnon === -1) return false;
    if (!(drop < create && create < revokeAnon && revokeAnon < grant)) return false;
  }
  if (m.includes("FUNCTION public.get_community_svar")) return false;
  return true;
}

/** Fra starten af `start` til og med den første «$$;» derefter. */
function blok(kilde: string, start: string): string {
  const i = kilde.indexOf(start);
  if (i === -1) return "";
  const slut = kilde.indexOf("$$;", i);
  return slut === -1 ? "" : kilde.slice(i, slut + 3);
}

// ── dom 2 ───────────────────────────────────────────────────────────────────
const fold = (s: string) => s.replace(/\s+/g, " ").trim();

/** Kroppen uden markørlinjerne, CREATE OR REPLACE → CREATE, whitespace foldet. */
export function normaliseretKrop(kilde: string, navn: string): string {
  const b = kilde.includes(`CREATE FUNCTION ${navn}`)
    ? blok(kilde, `CREATE FUNCTION ${navn}`)
    : blok(kilde, `CREATE OR REPLACE FUNCTION ${navn}`);
  const linjer = b.split("\n").filter((l) => !l.includes(MARKOER));
  return fold(linjer.join("\n").replace("CREATE OR REPLACE FUNCTION", "CREATE FUNCTION"));
}

/** De to kommentarlinjer i 20261002242000's feed-krop (ordret fra 20260812180000), der ikke længere er
    sande (spørgsmålet ligger før den kanoniske sortering) — erstattet af
    markørlinjer i den nye krop. Kun disse, kun i feedet, hver præcis én gang. */
export const ERSTATTEDE_KOMMENTARLINJER = [
  "-- Nøjagtig den kanoniske sortering fra idx_community_traade_feed",
  "-- (20260811150000): fastgjorte øverst, derefter seneste aktivitet.",
] as const;

export function laeseRpcErKopi(ny: string, forrige: string, navn: string): boolean {
  const a = normaliseretKrop(ny, navn);
  let b = normaliseretKrop(forrige, navn);
  if (navn.startsWith("public.get_community_feed")) {
    for (const linje of ERSTATTEDE_KOMMENTARLINJER) {
      if (b.split(linje).length !== 2) return false;
      b = fold(b.replace(linje, ""));
    }
  }
  return a !== "" && a === b;
}

/** De nye linjer er præcis de to kolonner, de to udtryk og sorteringsnøglen. */
export function markoerLinjerneHolder(ny: string, navn: string): boolean {
  const start = ny.indexOf(`CREATE FUNCTION ${navn}`);
  const b = blok(ny, `CREATE FUNCTION ${navn}`);
  if (start === -1 || b === "") return false;
  const nye = b.split("\n").filter((l) => l.includes(MARKOER)).map((l) => fold(l.split(MARKOER)[0]));
  const forventet = [
    ", spoergsmaal_markeret_at timestamptz",
    ", jeg_har_svaret boolean",
    ", t.spoergsmaal_markeret_at",
    ", EXISTS (SELECT 1 FROM public.community_svar s",
    "WHERE s.traad_id = t.id AND s.forfatter_id = auth.uid() AND s.status = 'aktiv')",
    ", (SELECT count(DISTINCT s.forfatter_id) FROM public.community_svar s",
    "WHERE s.traad_id = t.id AND s.status = 'aktiv' AND s.forfatter_id <> t.forfatter_id)",
  ];
  // Kolonnen står i RETURNS TABLE efter jeg_har_svaret.
  forventet.splice(2, 0, ", antal_svarere bigint");
  if (navn.startsWith("public.get_community_feed")) {
    forventet.push(
      "-- Rådgivernes AKTIVE Spørgsmål øverst (et skjult markeret ligger ikke",
      "-- øverst); derefter den kanoniske sortering fra idx_community_traade_feed",
      "-- (20260811150000): fastgjorte øverst, derefter seneste aktivitet.",
      "(t.spoergsmaal_markeret_at IS NOT NULL AND t.status = 'aktiv') DESC,",
    );
  }
  return JSON.stringify(nye) === JSON.stringify(forventet);
}

// ── dom 3 ───────────────────────────────────────────────────────────────────
export function fladenDoemmerGennemDommen(view: string): boolean {
  const k = udenKommentarer(view);
  return (
    /import \{[^}]*\bdelFeed\b[^}]*\} from "@\/lib\/hjemmebane\/communitySpoergsmaal"/s.test(view) &&
    /import \{[^}]*\bfiltrerStroem\b[^}]*\} from "@\/lib\/hjemmebane\/communitySpoergsmaal"/s.test(view) &&
    k.includes("const delt = delFeed(traade, user?.id);") &&
    k.includes("const antalUbesvarede = taelUbesvarede(delt.stroem, raadgiverIds);") &&
    k.includes("const viste = filtrerStroem(delt.stroem, filter, raadgiverIds);") &&
    k.includes("{viste.map((traad) => (") &&
    !k.includes("{traade.map(") &&
    !/\.filter\(\([a-z]+\) => [a-z]+\.antal_svar/.test(k) &&
    !/spoergsmaal_markeret_at\s*(===|!==|==|!=)/.test(k) &&
    k.includes("traad={delt.spoergsmaal}") &&
    k.includes("foldet={delt.foldet}") &&
    k.includes("ubesvaret={erUbesvaret(traad, raadgiverIds)}")
  );
}

// ── dom 4 ───────────────────────────────────────────────────────────────────
export function kunRaadgivereMarkerer(view: string): boolean {
  const k = udenKommentarer(view);
  const opret = k.slice(k.indexOf("const opretMutation = useMutation({"), k.indexOf("const traade = feedQuery.data"));
  const kald = opret.indexOf("await markerSpoergsmaal(nytId, true);");
  const efterOpret = opret.indexOf("const nytId = await opretTraad({");
  return (
    k.includes("const { viewingAsMember } = useViewMode();") &&
    k.includes("const kanMarkere = isAdvisor && !viewingAsMember;") &&
    k.includes("{kanMarkere && (\n              <label") &&
    k.includes("data-marker-spoergsmaal") &&
    k.includes("somSpoergsmaal: kanMarkere && markerSomSpoergsmaal,") &&
    k.includes("onFjern={kanMarkere ? () => markerMutation.mutate({ traadId: delt.spoergsmaal!.id, markeret: false }) : undefined}") &&
    kald !== -1 &&
    efterOpret !== -1 &&
    efterOpret < kald &&
    /if \(args\.somSpoergsmaal === true\) \{\s*try \{\s*await markerSpoergsmaal\(nytId, true\);\s*\} catch \(fejl\) \{\s*toast\.error\(MARKERING_FEJL_TITEL/.test(opret)
  );
}

// ── dom 5 ───────────────────────────────────────────────────────────────────
export function tjenestekontiFiltreret(view: string, hjaelpere: string, hook: string): boolean {
  const k = udenKommentarer(view);
  const h = udenKommentarer(hook);
  return (
    k.includes('import { useNetvaerketsRaekker } from "@/hooks/netvaerketsRaekker";') &&
    k.includes("const directoryQuery = useNetvaerketsRaekker();") &&
    !k.includes('from "@/lib/hjemmebane/memberProfile"') &&
    h.includes('import { listMemberDirectory } from "@/lib/hjemmebane/memberProfile";') &&
    h.includes('export const NETVAERK_KEY = ["member-directory"] as const;') &&
    h.includes("queryFn: listMemberDirectory,") &&
    !/\brpc\b/.test(h) &&
    k.includes("const raadgiverIds = raadgiverIdsAf(directoryQuery.data);") &&
    k.includes("<HvemKanHjaelpe profiler={directoryQuery.data}") &&
    !/\brpc\b/.test(k) &&
    !/\brpc\b/.test(udenKommentarer(hjaelpere)) &&
    !/supabase/.test(udenKommentarer(hjaelpere))
  );
}

// ── dom 6 ───────────────────────────────────────────────────────────────────
const ORD = ["Spørgsmål fra rådgiverne", "Hvem kan hjælpe med …", "Skriv én linje", "Markér som Spørgsmål", "Fjern Spørgsmål-markeringen"];
export function ordeneBorILib(filer: Record<string, string>, lib: string, libHj: string): boolean {
  const samlet = lib + libHj;
  if (!ORD.every((o) => samlet.includes(o))) return false;
  for (const [sti, kilde] of Object.entries(filer)) {
    if (sti === LIB || sti === LIB_HJ) continue;
    if (!sti.endsWith(".tsx") && !sti.endsWith(".ts")) continue;
    const k = udenKommentarer(kilde);
    if (ORD.some((o) => k.includes(o))) return false;
  }
  return true;
}

// ── dom 7 ───────────────────────────────────────────────────────────────────
export function intetAndetFastgoeres(api: string, migration: string, view: string, traad: string): boolean {
  const a = udenKommentarer(api);
  const t = udenKommentarer(traad);
  const hooksSlut = t.indexOf("if (traadQuery.isLoading) {");
  const markerHook = t.indexOf("const markerMutation = useMutation({");
  return (
    !/p_fastgjort|fastgjort: (true|false)|fastgoer/.test(a) &&
    !/SET fastgjort|fastgjort = /.test(migration) &&
    !/fastgjort\s*[:=]/.test(udenKommentarer(view)) &&
    t.includes("const { viewingAsMember } = useViewMode();") &&
    t.includes("const visMarker = visMarkerKnap({ erRaadgiver: isAdvisor && !viewingAsMember, erForfatter: erTraadForfatter, erMarkeret, status: traad.status });") &&
    t.includes("{visMarker && (") &&
    markerHook !== -1 &&
    hooksSlut !== -1 &&
    markerHook < hooksSlut
  );
}

/** Mod-prøvens ombytning — kaster, hvis teksten ikke findes, så en prøve aldrig går grønt på en no-op. */
function ombyt(kilde: string, fra: string, til: string): string {
  if (!kilde.includes(fra)) throw new Error(`Mod-prøven fandt ikke teksten: ${fra.slice(0, 80)}`);
  return kilde.replace(fra, til);
}

function alleKilder(mappe: string): Record<string, string> {
  const ud: Record<string, string> = {};
  for (const navn of readdirSync(resolve(ROD, mappe))) {
    if (navn.endsWith(".ts") || navn.endsWith(".tsx")) ud[`${mappe}/${navn}`] = laes(`${mappe}/${navn}`);
  }
  return ud;
}

describe("communitySpoergsmaal.guard — rådgivernes «Spørgsmål», «Ubesvarede» og «Hvem kan hjælpe» (2/10-2026)", () => {
  const migration = laes(MIGRATION);
  const fixture = laes(FIXTURE);
  const kildenFindes = existsSync(resolve(ROD, FORRIGE));
  const forrige = kildenFindes ? laes(FORRIGE) : fixture;
  const view = laes(VIEW);
  const traad = laes(TRAAD);
  const lib = laes(LIB);
  const libHj = laes(LIB_HJ);
  const api = laes(API);
  const komponenter = { ...alleKilder("src/components/hjemmebane/community"), [VIEW]: view, [TRAAD]: traad, [KORT]: laes(KORT), [HJAELPERE]: laes(HJAELPERE) };

  it("1. migrationen: første linje, kolonne, højst ét (indeks), egen trigger, RPC med gaten først, DROP/GRANT, svar-RPC urørt", () => {
    expect(migrationenHolder(migration)).toBe(true);
  });

  it("2a. fixturen er gæstens migration blok for blok, når den findes i repoet", () => {
    for (const navn of LAESE_RPCER) {
      const b = blok(fixture, `CREATE OR REPLACE FUNCTION ${navn}`);
      expect(b).not.toBe("");
      // Porten er gæstens læse-dom — en fixture fra før gæsten fældes.
      expect(b).toContain("IF NOT (public.kan_laese_community(auth.uid())");
      expect(b).not.toContain("har_aktivt_medlemskab");
      if (kildenFindes) expect(b).toBe(blok(forrige, `CREATE OR REPLACE FUNCTION ${navn}`));
    }
  });

  it("2. læse-RPC'erne er 20261002242000 ord for ord uden markørlinjerne — og markørlinjerne er præcis de nye", () => {
    expect(laeseRpcErKopi(migration, forrige, "public.get_community_feed(")).toBe(true);
    expect(laeseRpcErKopi(migration, forrige, "public.get_community_traad(")).toBe(true);
    expect(markoerLinjerneHolder(migration, "public.get_community_feed(")).toBe(true);
    expect(markoerLinjerneHolder(migration, "public.get_community_traad(")).toBe(true);
  });

  it("3. fladen dømmer gennem communitySpoergsmaal.ts — strømmen er `viste`, kortet får dommens spørgsmål", () => {
    expect(fladenDoemmerGennemDommen(view)).toBe(true);
  });

  it("4. kun rådgivere markerer, og markeringen sættes EFTER opslaget i try/catch", () => {
    expect(kunRaadgivereMarkerer(view)).toBe(true);
  });

  it("5. rådgiver-mængden og hjælperne læses af listMemberDirectory (tjenestekonti filtreret) — ingen rå RPC", () => {
    expect(tjenestekontiFiltreret(view, laes(HJAELPERE), laes(HOOK))).toBe(true);
  });

  it("6. ordene bor i lib-filerne, ikke i komponenterne", () => {
    expect(ordeneBorILib(komponenter, lib, libHj)).toBe(true);
  });

  it("7. intet andet fastgøres; trådsiden dømmer gennem visMarkerKnap, hooks før første return", () => {
    expect(intetAndetFastgoeres(api, migration, view, traad)).toBe(true);
  });

  describe("VÆRNET VIRKER", () => {
    it("1. en migration uden rådgiver-gaten, eller med gaten efter UPDATE, fældes", () => {
      expect(migrationenHolder(ombyt(migration, "IF NOT public.has_role(auth.uid(), 'advisor') THEN\n    RAISE EXCEPTION 'Kun rådgivere kan markere et opslag som Spørgsmål';\n  END IF;\n  -- En tjenestekonto", "  -- En tjenestekonto"))).toBe(false);
      expect(migrationenHolder(migration.replace(/^[^\n]*/, "-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik)."))).toBe(false);
      expect(migrationenHolder(ombyt(migration, "WHERE spoergsmaal_markeret_at IS NOT NULL;", "WHERE false;"))).toBe(false);
      expect(migrationenHolder(migration + "\nCREATE OR REPLACE FUNCTION public.protect_community_traad_immutable_fields() RETURNS trigger AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql;")).toBe(false);
    });
    it("1b. en trigger, der lader en direkte PATCH markere et medlems opslag, et skjult opslag eller som tjenestekonto, fældes — og skjul skal rydde", () => {
      const trigStart = migration.indexOf("CREATE OR REPLACE FUNCTION public.community_traade_spoergsmaal_vaern()");
      const trig = migration.slice(trigStart, migration.indexOf("$$;", trigStart));
      const iTrig = (a: string, b: string) => migration.slice(0, trigStart) + ombyt(trig, a, b) + migration.slice(trigStart + trig.length);
      expect(migrationenHolder(iTrig("IF NOT public.has_role(NEW.forfatter_id, 'advisor') THEN", "IF false THEN"))).toBe(false);
      expect(migrationenHolder(iTrig("IF NEW.status <> 'aktiv' THEN", "IF false THEN"))).toBe(false);
      expect(migrationenHolder(iTrig("IF EXISTS (SELECT 1 FROM public.tjenestekonti tk WHERE tk.user_id = auth.uid()) THEN", "IF false THEN"))).toBe(false);
      expect(migrationenHolder(iTrig("    NEW.spoergsmaal_markeret_at := NULL;\n", ""))).toBe(false);
    });
    it("1c. en RPC uden tjenestekonto-afvisning eller uden advisory-låsen (eller med låsen efter UPDATE) fældes", () => {
      const rpcStart = migration.indexOf("CREATE OR REPLACE FUNCTION public.marker_community_spoergsmaal(");
      const rpc = migration.slice(rpcStart, migration.indexOf("$$;", rpcStart));
      const iRpc = (a: string, b: string) => migration.slice(0, rpcStart) + ombyt(rpc, a, b) + migration.slice(rpcStart + rpc.length);
      expect(migrationenHolder(iRpc("IF EXISTS (SELECT 1 FROM public.tjenestekonti tk WHERE tk.user_id = auth.uid()) THEN", "IF false THEN"))).toBe(false);
      expect(migrationenHolder(iRpc("  PERFORM pg_advisory_xact_lock(hashtext('community_spoergsmaal'));\n", ""))).toBe(false);
      const flyttet = ombyt(ombyt(rpc, "  PERFORM pg_advisory_xact_lock(hashtext('community_spoergsmaal'));\n", ""), "  ELSE\n", "    PERFORM pg_advisory_xact_lock(hashtext('community_spoergsmaal'));\n  ELSE\n");
      expect(migrationenHolder(migration.slice(0, rpcStart) + flyttet + migration.slice(rpcStart + rpc.length))).toBe(false);
    });
    it("2. en omskrevet læse-RPC fældes — også en ændret kommentarlinje uden markør og en sortering, der lader et skjult spørgsmål stå øverst", () => {
      // Den gamle port (har_aktivt_medlemskab, 20260812180000) tager gæstens læseadgang — fældes.
      expect(laeseRpcErKopi(ombyt(migration, "  IF NOT (public.kan_laese_community(auth.uid())", "  IF NOT (public.har_aktivt_medlemskab(auth.uid())"), forrige, "public.get_community_feed(")).toBe(false);
      expect(laeseRpcErKopi(migration.replace(/\n  IF NOT \(public\.kan_laese_community\(auth\.uid\(\)\)/g, "\n  IF NOT (public.har_aktivt_medlemskab(auth.uid())"), forrige, "public.get_community_traad(")).toBe(false);
      expect(laeseRpcErKopi(ombyt(migration, "    t.fastgjort DESC, COALESCE(t.sidste_svar_at, t.created_at) DESC\n  LIMIT", "    t.fastgjort ASC, COALESCE(t.sidste_svar_at, t.created_at) DESC\n  LIMIT"), forrige, "public.get_community_feed(")).toBe(false);
      expect(markoerLinjerneHolder(ombyt(migration, ", antal_svarere bigint -- SPOERGSMAAL\n)\nLANGUAGE plpgsql\nSTABLE SECURITY DEFINER\nSET search_path TO 'public'\nAS $$\nBEGIN\n  -- SECURITY", ", antal_svarere bigint, en_ekstra text -- SPOERGSMAAL\n)\nLANGUAGE plpgsql\nSTABLE SECURITY DEFINER\nSET search_path TO 'public'\nAS $$\nBEGIN\n  -- SECURITY"), "public.get_community_feed(")).toBe(false);
      expect(markoerLinjerneHolder(ombyt(migration, "(t.spoergsmaal_markeret_at IS NOT NULL AND t.status = 'aktiv') DESC, -- SPOERGSMAAL", "(t.spoergsmaal_markeret_at IS NOT NULL) DESC, -- SPOERGSMAAL"), "public.get_community_feed(")).toBe(false);
      // «N har svaret» = forskellige personer: count(*) i stedet for DISTINCT fældes.
      expect(markoerLinjerneHolder(ombyt(migration, "count(DISTINCT s.forfatter_id)", "count(*)"), "public.get_community_feed(")).toBe(false);
      // En kommentarlinje fra kilden, der fjernes UDEN at være på listen, fældes.
      expect(laeseRpcErKopi(ombyt(migration, "  -- Rådgivere ser aktiv OG skjult; medlemmer kun aktiv. 'slettet' vises\n", ""), forrige, "public.get_community_feed(")).toBe(false);
      // Listen kan ikke udvides i stilhed: en erstattet linje, der ikke står i kilden, fældes.
      expect(laeseRpcErKopi(migration, ombyt(forrige, "  -- Nøjagtig den kanoniske sortering fra idx_community_traade_feed\n", ""), "public.get_community_feed(")).toBe(false);
    });
    it("3. en flade med egen filtrering fældes", () => {
      expect(fladenDoemmerGennemDommen(view.replace("const viste = filtrerStroem(delt.stroem, filter, raadgiverIds);", "const viste = delt.stroem.filter((t) => t.antal_svar === 0);"))).toBe(false);
      expect(fladenDoemmerGennemDommen(view.replace("{viste.map((traad) => (", "{traade.map((traad) => ("))).toBe(false);
    });
    it("4. et markér-felt for alle, eller en markering der kaster, fældes", () => {
      expect(kunRaadgivereMarkerer(ombyt(view, "somSpoergsmaal: kanMarkere && markerSomSpoergsmaal,", "somSpoergsmaal: markerSomSpoergsmaal,"))).toBe(false);
      // «Se som medlem» skal skjule knapperne: isAdvisor alene fældes — i feedet og på trådsiden.
      expect(kunRaadgivereMarkerer(ombyt(view, "const kanMarkere = isAdvisor && !viewingAsMember;", "const kanMarkere = isAdvisor;"))).toBe(false);
      expect(kunRaadgivereMarkerer(ombyt(view, "{kanMarkere && (\n              <label", "{isAdvisor && (\n              <label"))).toBe(false);
      expect(intetAndetFastgoeres(api, migration, view, ombyt(traad, "erRaadgiver: isAdvisor && !viewingAsMember,", "erRaadgiver: isAdvisor,"))).toBe(false);
      expect(kunRaadgivereMarkerer(view.replace("try {\n          await markerSpoergsmaal(nytId, true);\n        } catch (fejl) {\n          toast.error(MARKERING_FEJL_TITEL, { description: fejl instanceof Error ? fejl.message : String(fejl) });\n        }", "await markerSpoergsmaal(nytId, true);"))).toBe(false);
    });
    it("5. en rå RPC i fladen fældes", () => {
      expect(tjenestekontiFiltreret(view, laes(HJAELPERE), laes(HOOK).replace("queryFn: listMemberDirectory,", 'queryFn: () => (supabase.rpc as any)("get_member_directory"),'))).toBe(false);
      expect(tjenestekontiFiltreret(view.replace("const directoryQuery = useNetvaerketsRaekker();", 'const directoryQuery = useQuery({ queryKey: ["member-directory"], queryFn: listMemberDirectory });'), laes(HJAELPERE), laes(HOOK))).toBe(false);
    });
    it("6. et hårdkodet ord i en komponent fældes", () => {
      expect(ordeneBorILib({ ...komponenter, [KORT]: komponenter[KORT] + '\nconst x = "Spørgsmål fra rådgiverne";' }, lib, libHj)).toBe(false);
    });
    it("7. en skrivning til fastgjort, eller en hook efter første return, fældes", () => {
      expect(intetAndetFastgoeres(api + '\nexport async function fastgoer(id: string) { await (supabase.rpc as any)("x", { p_fastgjort: true }); }', migration, view, traad)).toBe(false);
      expect(intetAndetFastgoeres(api, migration + "\nUPDATE public.community_traade SET fastgjort = true;", view, traad)).toBe(false);
      const flyttet = traad.replace("const markerMutation = useMutation({", "const markerMutationX = 1;").replace("if (traadQuery.isLoading) {", "if (traadQuery.isLoading) {\n  const markerMutation = useMutation({");
      expect(intetAndetFastgoeres(api, migration, view, flyttet)).toBe(false);
    });
  });
});
