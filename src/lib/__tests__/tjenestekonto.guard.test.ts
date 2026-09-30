// Kildeværn: tjenestekonti (30/9-2026, src/lib/tjenestekonto.ts).
//
// En tjenestekonto (claude@topix.dk) kan SE alt, en rådgiver ser, men optræder
// aldrig som en PERSON. Værnet finder hvert sted, der henter rådgiverne som
// liste, og kræver ét af to:
//   (a) stedet filtrerer — synligeRaadgivere( / hentSynligeRaadgiverProfiler(
//       i klienten, udenTjenestekonti( i edge-laget; eller
//   (b) stedet står på listen herunder med sin grund: rådgiverlisten bruges som
//       ROLLE (hvem er rådgiver → tæller ikke som medlem) eller som OPSLAG pr. id
//       (navnet på den, der gjorde noget), eller fan-outen er KLOKKER, som
//       tjenestekontoen skal se (mailen filtreres i klokke-mail-cron).
// Et nyt sted uden (a) eller (b) fælder dommen (prøvet med mutation nedenfor).
// En post på listen, der ikke længere henter rådgiverne, fælder også: listen
// må ikke rådne.
//
// DOMME:
//   1. Klienten: hvert sted, der henter rådgivere/medlemsnetværket
//      (get_all_advisor_profiles, get_member_directory, get_community_medlemmer,
//      user_roles advisor/admin som liste, useRaadgivere), filtrerer eller står på
//      KLIENT_UNDTAGET.
//   2. Edge: hver rådgiver-fan-out (user_roles select user_id … advisor/admin)
//      filtrerer eller står på EDGE_UNDTAGET.
//   3. De kendte person-steder filtrerer faktisk (ingen af dem må glide over på
//      undtagelseslisten).
//   4. useAuth slår inaktivitets-logud til gennem inaktivitetsLogudAktiv — ikke
//      !!user alene.
//   5. Migrationen: kun admin skriver (policy med has_role admin), ingen ændring af
//      eksisterende funktioner, og første linje er IKKE KØRT-linjen.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROD = process.cwd();

function filer(dir: string, endelser: string[]): string[] {
  const ud: string[] = [];
  const gaa = (rel: string) => {
    for (const navn of readdirSync(resolve(ROD, rel)).sort()) {
      const sti = join(rel, navn);
      if (statSync(resolve(ROD, sti)).isDirectory()) {
        if (navn === "__tests__" || navn === "node_modules") continue;
        gaa(sti);
      } else if (endelser.some((e) => navn.endsWith(e)) && !/\.test\.tsx?$/.test(navn)) {
        ud.push(sti);
      }
    }
  };
  gaa(dir);
  return ud;
}

const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");

const RPC_LISTE = /\brpc\b[^;\n]{0,40}["'](get_all_advisor_profiles|get_member_directory|get_community_medlemmer)["']/;
const ROLLE_LISTE = /from\(["']user_roles["']\)\s*\.select\(["']user_id[^"']*["']\)[\s\S]{0,60}?\.in\(["']role["'],\s*\[["']advisor["'],\s*["']admin["']\]\)/;
const BRUGER_HOOK = /\buseRaadgivere\(/;
const KLIENT_FILTER = /\b(synligeRaadgivere|hentSynligeRaadgiverProfiler)\(/;
const EDGE_FILTER = /\budenTjenestekonti\(/;

/** Klientens steder, der BEVIDST ikke filtrerer — med grunden. */
const KLIENT_UNDTAGET: Readonly<Record<string, string>> = {
  "src/hooks/svartid.ts": "ROLLE: svartidsurets rådgivermængde afgør, om en besked er et rådgiversvar; uden kontoen ville dens beskeder tælle som medlemmets",
  "src/hooks/ubesvaredeOpslag.ts": "ROLLE: et opslag fra en rådgiver er ikke et ubesvaret medlemsopslag",
  "src/hooks/onlineMedlemmer.ts": "ROLLE: rådgivere vises ikke i «Online nu»; uden kontoen i mængden ville den kunne stå som medlem",
  "src/components/hjemmebane/admin/views/ProgressView.tsx": "ROLLE: rådgivernes egne lektionsrækker må ikke tælle i «Kunne du bruge den?» — heller ikke tjenestekontoens",
  "src/hooks/useRaadgivere.ts": "OPSLAG pr. id (værter, forsiden) — delt cache med BoardroomView; vælgeren filtrerer i EventEditor",
  "src/components/hjemmebane/boardroom/BoardroomView.tsx": "OPSLAG pr. id: ansigtet på den rådgiver, der skrev pushet/skridtet — en tjenestekonto skriver intet",
  "src/components/hjemmebane/events/EventDetailView.tsx": "OPSLAG pr. id: eventets værter — værtsvælgeren (EventEditor) tilbyder aldrig en tjenestekonto",
  "src/components/hjemmebane/ansoegninger/AnsoegningView.tsx": "OPSLAG pr. id: navnet på den rådgiver, der tog beslutningen i sporet",
  "src/hooks/useVirksomhed.ts": "OPSLAG pr. id: «Tildelt» — tildelings-vælgeren (CompanyChatPane) tilbyder aldrig en tjenestekonto",
};

/** Edge-steder, der BEVIDST ikke filtrerer — med grunden. */
const EDGE_UNDTAGET: Readonly<Record<string, string>> = {
  "supabase/functions/_shared/raadgiverBesked.ts": "KLOKKER (advisor_notifications): kontoen skal se alt; mailen filtreres i klokke-mail-cron",
  "supabase/functions/send-slack-chat-notification/index.ts": "KLOKKER (notifications): send-notification-email mailer ikke rådgivere",
  "supabase/functions/send-slack-report-notification/index.ts": "KLOKKER (notifications): send-notification-email mailer ikke rådgivere",
  "supabase/functions/send-slack-handout-notification/index.ts": "KLOKKER (notifications): send-notification-email mailer ikke rådgivere",
  "supabase/functions/detect-financial-alerts/index.ts": "KLOKKER (alarmer i rådgiverens dashboard): kontoen skal se alt",
  "supabase/functions/certifikat-klokke/index.ts": "ROLLE: rådgivere udelukkes fra medlemmernes certifikat-klokke",
  "supabase/functions/manage-advisor/index.ts": "ROLLE: privilegerede konti udelukkes fra bulk-fjernelse af medlemmer",
  "supabase/functions/send-notification-email/index.ts": "ROLLE: rådgivere undtages fra medlemsmails",
};

/** Steder, der viser rådgivere (eller netværket) som personer — skal filtrere. */
const PERSON_STEDER = [
  "src/components/MemberChatPane.tsx", // «Dine rådgivere: Jonas, Morten»
  "src/components/CompanyChatPane.tsx", // tildelings-vælgeren
  "src/components/AdvisorDashboard.tsx", // tildelings-vælgeren i køen (AdvisorQueueRow)
  "src/components/hjemmebane/opgaver/OpgavelisteView.tsx", // «Mig/Jonas/Morten»
  "src/components/hjemmebane/admin/views/PushView.tsx", // pushets afsender
  "src/components/hjemmebane/admin/editors/EventEditor.tsx", // værtsvælgeren
  "src/lib/hjemmebane/memberProfile.ts", // Netværket /medlemmer, «Dine rådgivere»
  "src/lib/hjemmebane/communityApi.ts", // @-nævnelser
];
const EDGE_PERSON_STEDER = [
  "supabase/functions/klokke-mail-cron/index.ts", // klokke-mails til rådgivere
  "supabase/functions/run-company-agent/index.ts", // agentens besked «som rådgiver»
  "supabase/functions/send-welcome-message/index.ts", // velkomstens afsender
];

function klientDom(kilder: Readonly<Record<string, string>>, undtaget: Readonly<Record<string, string>> = KLIENT_UNDTAGET): string[] {
  const fejl: string[] = [];
  for (const [sti, kilde] of Object.entries(kilder)) {
    const henter = RPC_LISTE.test(kilde) || ROLLE_LISTE.test(kilde) || BRUGER_HOOK.test(kilde);
    if (!henter) {
      if (sti in undtaget) fejl.push(`${sti}: står på undtagelseslisten, men henter ikke rådgiverne`);
      continue;
    }
    if (KLIENT_FILTER.test(kilde)) continue;
    if (!(sti in undtaget)) fejl.push(`${sti}: henter rådgiverne uden synligeRaadgivere/hentSynligeRaadgiverProfiler og står ikke på KLIENT_UNDTAGET`);
  }
  return fejl;
}

function edgeDom(kilder: Readonly<Record<string, string>>, undtaget: Readonly<Record<string, string>> = EDGE_UNDTAGET): string[] {
  const fejl: string[] = [];
  for (const [sti, kilde] of Object.entries(kilder)) {
    if (!ROLLE_LISTE.test(kilde)) {
      if (sti in undtaget) fejl.push(`${sti}: står på undtagelseslisten, men har ingen rådgiver-fan-out`);
      continue;
    }
    if (EDGE_FILTER.test(kilde)) continue;
    if (!(sti in undtaget)) fejl.push(`${sti}: rådgiver-fan-out uden udenTjenestekonti og står ikke på EDGE_UNDTAGET`);
  }
  return fejl;
}

const klientKilder = Object.fromEntries(
  filer("src", [".ts", ".tsx"]).filter((f) => !f.endsWith("integrations/supabase/types.ts")).map((f) => [f, laes(f)]),
);
const edgeKilder = Object.fromEntries(filer("supabase/functions", [".ts"]).map((f) => [f, laes(f)]));

describe("tjenestekonto.guard — ingen tjenestekonto som person", () => {
  it("1. klienten: hvert sted, der henter rådgiverne, filtrerer eller har en grund", () => {
    expect(klientDom(klientKilder)).toEqual([]);
  });

  it("1. mutation: et nyt sted uden filter fælder dommen", () => {
    const ny = { ...klientKilder, "src/components/NyRaadgiverliste.tsx": 'const { data } = await supabase.rpc("get_all_advisor_profiles");' };
    expect(klientDom(ny)).toEqual([expect.stringContaining("NyRaadgiverliste.tsx")]);
    const netvaerk = { ...klientKilder, "src/lib/nytNetvaerk.ts": 'await (supabase.rpc as any)("get_community_medlemmer");' };
    expect(klientDom(netvaerk)).toEqual([expect.stringContaining("nytNetvaerk.ts")]);
    const roller = { ...klientKilder, "src/lib/nyVaelger.ts": 'supabase.from("user_roles").select("user_id, role").in("role", ["advisor", "admin"]);' };
    expect(klientDom(roller)).toEqual([expect.stringContaining("nyVaelger.ts")]);
    const hook = { ...klientKilder, "src/components/NyVaelger.tsx": "const q = useRaadgivere();" };
    expect(klientDom(hook)).toEqual([expect.stringContaining("NyVaelger.tsx")]);
  });

  it("1. mutation: filtret fjernet fra et person-sted fælder dommen", () => {
    const sti = "src/components/hjemmebane/opgaver/OpgavelisteView.tsx";
    const uden = { ...klientKilder, [sti]: klientKilder[sti].replace("hentSynligeRaadgiverProfiler()", 'supabase.rpc("get_all_advisor_profiles")').replace(/import \{ hentSynligeRaadgiverProfiler \}[^\n]*\n/, "") };
    expect(klientDom(uden)).toEqual([expect.stringContaining(sti)]);
  });

  it("1. mutation: en rådden undtagelse fælder dommen", () => {
    expect(klientDom(klientKilder, { ...KLIENT_UNDTAGET, "src/lib/tjenestekonto.ts": "henter intet" })).toEqual([expect.stringContaining("src/lib/tjenestekonto.ts")]);
  });

  it("2. edge: hver rådgiver-fan-out filtrerer eller har en grund", () => {
    expect(edgeDom(edgeKilder)).toEqual([]);
  });

  it("2. mutation: en ny fan-out uden filter fælder dommen", () => {
    const ny = { ...edgeKilder, "supabase/functions/ny-raadgivermail/index.ts": 'await admin.from("user_roles").select("user_id").in("role", ["advisor", "admin"]);' };
    expect(edgeDom(ny)).toEqual([expect.stringContaining("ny-raadgivermail")]);
  });

  it("3. person-stederne filtrerer faktisk (klient og edge)", () => {
    for (const sti of PERSON_STEDER) {
      expect(klientKilder[sti], sti).toBeDefined();
      expect(KLIENT_FILTER.test(klientKilder[sti]), sti).toBe(true);
      expect(sti in KLIENT_UNDTAGET, sti).toBe(false);
    }
    for (const sti of EDGE_PERSON_STEDER) {
      expect(edgeKilder[sti], sti).toBeDefined();
      expect(EDGE_FILTER.test(edgeKilder[sti]), sti).toBe(true);
      expect(edgeKilder[sti]).toContain('from "../_shared/tjenestekonti.ts"');
      expect(sti in EDGE_UNDTAGET, sti).toBe(false);
    }
  });

  it("4. useAuth: inaktivitets-logud går gennem inaktivitetsLogudAktiv", () => {
    const auth = klientKilder["src/hooks/useAuth.tsx"];
    expect(auth).toContain("useInactivityLogout(logudAktiv, sessionTimeoutMinutes)");
    expect(auth).toContain("inaktivitetsLogudAktiv(!!user, tjenestekontoQuery.status, tjenestekontoQuery.data)");
    expect(auth).not.toContain("useInactivityLogout(!!user");
  });

  it("5. migrationen: kun tilføjende, kun admin skriver, IKKE KØRT-linjen først", () => {
    const sql = laes("supabase/migrations/20260930140000_tjenestekonti.sql");
    expect(sql.split("\n")[0]).toBe("-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).");
    const kode = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
    expect(kode).toMatch(/CREATE POLICY "Admin skriver tjenestekonti"[\s\S]*FOR ALL[\s\S]*USING \(public\.has_role\(auth\.uid\(\), 'admin'::app_role\)\)[\s\S]*WITH CHECK \(public\.has_role\(auth\.uid\(\), 'admin'::app_role\)\)/);
    expect(kode).toMatch(/CREATE POLICY "Indloggede ser tjenestekonti"[\s\S]*FOR SELECT[\s\S]*TO authenticated/);
    expect(kode).not.toMatch(/CREATE (OR REPLACE )?FUNCTION|DROP |ALTER FUNCTION|ALTER TABLE public\.(profiles|user_roles)/i);
    // Trin 2 (claude@topix.dk) står kun som kommentar — den køres separat, efter kontoen findes.
    expect(kode).not.toMatch(/INSERT INTO/i);
    expect(sql).toContain("ON CONFLICT (user_id) DO NOTHING");
  });
});
